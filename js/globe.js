import { $, escapeHTML, icon, motionAllowed } from './dom.js';
import { formatCoords, formatTemp, formatTime, formatWind, isNum, nowWall } from './format.js';
import { getCodeInfo, iconFor } from './weather-codes.js';
import { subsolarPoint } from './astro.js';
import { describeError, isAbortError } from './api.js';

const RAD = Math.PI / 180;
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 4;

const el = {};
let options = {};
let ctx = null;
let dots = null;
let loading = null;
let frame = 0;
let running = false;
let lastTime = 0;
let pickController = null;
let lastMarkers = [];

const view = {
  lon: 0,
  lat: 15,
  zoom: 1,
  w: 0,
  h: 0,
  dpr: 1,
  vLon: 0,
  vLat: 0,
  autoSpin: true,
  fly: null,
  pin: null,
  pulse: 0,
};

const pointers = new Map();
let drag = null;
let pinch = null;

export function initGlobe(callbacks) {
  options = callbacks;
  Object.assign(el, {
    dialog: $('#globe-dialog'),
    canvas: $('#globe-canvas'),
    card: $('#globe-card'),
    chips: $('#globe-chips'),
    close: $('#globe-close'),
    zoomIn: $('#globe-zoom-in'),
    zoomOut: $('#globe-zoom-out'),
    home: $('#globe-home'),
    live: $('#globe-live'),
  });
  ctx = el.canvas.getContext('2d');

  el.close.addEventListener('click', closeGlobe);
  el.dialog.addEventListener('close', stop);
  el.dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeGlobe();
  });
  el.zoomIn.addEventListener('click', () => zoomBy(1.35));
  el.zoomOut.addEventListener('click', () => zoomBy(1 / 1.35));
  el.home.addEventListener('click', () => {
    const current = lastMarkers.find((m) => m.current);
    if (current) pick(current.place.lat, current.place.lon, { place: current.place });
  });
  el.chips.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-index]');
    if (!chip) return;
    const marker = lastMarkers[Number(chip.dataset.index)];
    if (marker) pick(marker.place.lat, marker.place.lon, { place: marker.place });
  });
  el.card.addEventListener('click', (event) => {
    const open = event.target.closest('[data-open]');
    if (open && view.pin && view.pin.place) {
      const { place } = view.pin;
      closeGlobe();
      options.onOpenPlace(place);
    }
    const retry = event.target.closest('[data-retry]');
    if (retry && view.pin) pick(view.pin.lat, view.pin.lon, { fly: false });
  });

  el.canvas.addEventListener('pointerdown', onPointerDown);
  el.canvas.addEventListener('pointermove', onPointerMove);
  el.canvas.addEventListener('pointerup', onPointerUp);
  el.canvas.addEventListener('pointercancel', onPointerUp);
  el.canvas.addEventListener('wheel', onWheel, { passive: false });
  el.canvas.addEventListener('keydown', onKey);
  window.addEventListener('resize', () => {
    if (el.dialog.open) resize();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!el.dialog.open) return;
    if (document.hidden) stop();
    else start();
  });
}

async function loadDots() {
  if (dots) return dots;
  if (!loading) {
    loading = fetch('assets/data/land-mask.json')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((mask) => {
        const binary = atob(mask.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const list = [];
        for (let r = 0; r < mask.h; r += 1) {
          const lat = 90 - (r + 0.5) * (180 / mask.h);
          const step = Math.max(1, Math.round(1 / Math.max(0.12, Math.cos(lat * RAD))));
          for (let c = 0; c < mask.w; c += step) {
            const bit = r * mask.w + c;
            if (bytes[bit >> 3] & (1 << (bit & 7))) list.push(lat, -180 + (c + 0.5) * (360 / mask.w));
          }
        }
        const n = list.length / 2;
        const data = { n, cosLat: new Float32Array(n), sinLat: new Float32Array(n), cosLon: new Float32Array(n), sinLon: new Float32Array(n) };
        for (let i = 0; i < n; i += 1) {
          const lat = list[i * 2] * RAD;
          const lon = list[i * 2 + 1] * RAD;
          data.cosLat[i] = Math.cos(lat);
          data.sinLat[i] = Math.sin(lat);
          data.cosLon[i] = Math.cos(lon);
          data.sinLon[i] = Math.sin(lon);
        }
        dots = data;
        return dots;
      })
      .catch((error) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

export async function openGlobe(focus) {
  if (el.dialog.open) return;
  if (typeof el.dialog.showModal === 'function') el.dialog.showModal();
  else el.dialog.setAttribute('open', '');
  document.documentElement.classList.add('has-dialog');
  if (options.onOpen) options.onOpen();
  resize();
  if (focus && isNum(focus.lat) && isNum(focus.lon)) {
    view.lon = focus.lon;
    view.lat = Math.max(-60, Math.min(60, focus.lat));
  }
  view.zoom = 1;
  view.autoSpin = motionAllowed();
  view.fly = null;
  el.card.hidden = !view.pin;
  start();
  el.canvas.focus({ preventScroll: true });
  renderChips();
  try {
    await loadDots();
  } catch {
    el.live.textContent = 'The globe’s land map couldn’t be loaded. You can still tap the globe to pick a point.';
  }
  refreshMarkers();
}

export function closeGlobe() {
  if (!el.dialog.open) return;
  if (pickController) pickController.abort();
  if (typeof el.dialog.close === 'function') el.dialog.close();
  else el.dialog.removeAttribute('open');
  document.documentElement.classList.remove('has-dialog');
  stop();
  if (options.onClose) options.onClose();
}

async function refreshMarkers() {
  try {
    lastMarkers = await options.getMarkers();
  } catch {
    lastMarkers = options.getMarkersSync ? options.getMarkersSync() : lastMarkers;
  }
  renderChips();
}

function renderChips() {
  if (options.getMarkersSync && !lastMarkers.length) lastMarkers = options.getMarkersSync();
  el.chips.innerHTML = lastMarkers.map((marker, index) => {
    const temp = marker.now && isNum(marker.now.temp) ? ` <b>${formatTemp(marker.now.temp, options.getUnit())}</b>` : '';
    return `<li><button class="chip globe__chip${marker.current ? ' is-current' : ''}" type="button" data-index="${index}">${icon(marker.current ? 'i-geo' : marker.saved ? 'i-star' : 'i-pin')}<span>${escapeHTML(marker.place.name)}${temp}</span></button></li>`;
  }).join('');
}

function resize() {
  const rect = el.dialog.getBoundingClientRect();
  view.w = Math.max(1, Math.round(rect.width || window.innerWidth));
  view.h = Math.max(1, Math.round(rect.height || window.innerHeight));
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  el.canvas.width = Math.round(view.w * view.dpr);
  el.canvas.height = Math.round(view.h * view.dpr);
  el.canvas.style.width = `${view.w}px`;
  el.canvas.style.height = `${view.h}px`;
}

function start() {
  if (running) return;
  running = true;
  lastTime = performance.now();
  frame = requestAnimationFrame(loop);
}

function stop() {
  running = false;
  cancelAnimationFrame(frame);
}

const baseRadius = () => Math.min(view.w, view.h) * (view.w < 640 ? 0.4 : 0.36);
const center = () => [view.w / 2, view.h * (view.w < 640 ? 0.44 : 0.5)];

function project(latDeg, lonDeg) {
  const lat = latDeg * RAD;
  const dl = (lonDeg - view.lon) * RAD;
  const l0 = view.lat * RAD;
  const cosLat = Math.cos(lat);
  const z = Math.sin(l0) * Math.sin(lat) + Math.cos(l0) * cosLat * Math.cos(dl);
  const x = cosLat * Math.sin(dl);
  const y = Math.cos(l0) * Math.sin(lat) - Math.sin(l0) * cosLat * Math.cos(dl);
  const R = baseRadius() * view.zoom;
  const [cx, cy] = center();
  return { x: cx + x * R, y: cy - y * R, z };
}

function unproject(sx, sy) {
  const R = baseRadius() * view.zoom;
  const [cx, cy] = center();
  const px = (sx - cx) / R;
  const py = (cy - sy) / R;
  const rho2 = px * px + py * py;
  if (rho2 > 1) return null;
  const pz = Math.sqrt(1 - rho2);
  const l0 = view.lat * RAD;
  const lat = Math.asin(py * Math.cos(l0) + pz * Math.sin(l0)) / RAD;
  const dl = Math.atan2(px, pz * Math.cos(l0) - py * Math.sin(l0)) / RAD;
  let lon = view.lon + dl;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { lat, lon };
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function step(dt) {
  view.pulse += dt;
  if (view.fly) {
    const f = view.fly;
    f.t = Math.min(1, f.t + dt / f.duration);
    const k = ease(f.t);
    view.lon = f.lon0 + f.dLon * k;
    view.lat = f.lat0 + (f.lat1 - f.lat0) * k;
    const z = f.zoom0 + (f.zoom1 - f.zoom0) * k;
    view.zoom = z * (1 - 0.32 * Math.sin(Math.PI * f.t) * f.arc);
    if (f.t >= 1) {
      view.fly = null;
      if (view.pin) view.pin.landed = performance.now();
    }
  } else if (!drag && !pinch) {
    if (Math.abs(view.vLon) > 0.001 || Math.abs(view.vLat) > 0.001) {
      view.lon += view.vLon * dt;
      view.lat = Math.max(-85, Math.min(85, view.lat + view.vLat * dt));
      const decay = Math.exp(-dt * 2.6);
      view.vLon *= decay;
      view.vLat *= decay;
    } else if (view.autoSpin) {
      view.lon += dt * 5;
    }
  }
  view.lon = ((((view.lon + 180) % 360) + 360) % 360) - 180;
}

function loop(time) {
  if (!running) return;
  frame = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (time - lastTime) / 1000);
  lastTime = time;
  step(dt);
  draw();
}

function draw() {
  const { w, h, dpr } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const R = baseRadius() * view.zoom;
  const [cx, cy] = center();

  const halo = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.28);
  halo.addColorStop(0, 'rgba(120,180,255,0.42)');
  halo.addColorStop(0.35, 'rgba(90,150,255,0.14)');
  halo.addColorStop(1, 'rgba(60,110,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(cx - R * 1.4, cy - R * 1.4, R * 2.8, R * 2.8);

  const sun = subsolarPoint();
  const sunProj = project(sun.lat, sun.lon);
  const ocean = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  ocean.addColorStop(0, '#163a6e');
  ocean.addColorStop(0.7, '#0b1f40');
  ocean.addColorStop(1, '#06122a');
  ctx.fillStyle = ocean;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  if (sunProj.z > -0.6) {
    const light = ctx.createRadialGradient(sunProj.x, sunProj.y, 0, sunProj.x, sunProj.y, R * 1.6);
    light.addColorStop(0, `rgba(120,190,255,${(0.32 * Math.max(0, sunProj.z + 0.6)).toFixed(3)})`);
    light.addColorStop(0.55, 'rgba(70,140,230,0.08)');
    light.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = light;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  }

  drawGraticule(cx, cy, R);
  if (dots) drawDots(cx, cy, R, sun);
  const anti = project(-sun.lat, sun.lon + 180);
  if (anti.z > -0.6) {
    const shade = ctx.createRadialGradient(anti.x, anti.y, 0, anti.x, anti.y, R * 1.5);
    shade.addColorStop(0, `rgba(2,4,14,${(0.5 * Math.min(1, anti.z + 0.6)).toFixed(3)})`);
    shade.addColorStop(0.6, 'rgba(2,4,14,0.18)');
    shade.addColorStop(1, 'rgba(2,4,14,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  }
  ctx.restore();

  const rim = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R);
  rim.addColorStop(0, 'rgba(255,255,255,0)');
  rim.addColorStop(1, 'rgba(160,205,255,0.22)');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  drawMarkers();
  drawPin();
}

function drawGraticule(cx, cy, R) {
  ctx.strokeStyle = 'rgba(160,200,255,0.08)';
  ctx.lineWidth = 1;
  const line = (points) => {
    let pen = false;
    ctx.beginPath();
    points.forEach(([lat, lon]) => {
      const p = project(lat, lon);
      if (p.z > 0) {
        if (pen) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
        pen = true;
      } else {
        pen = false;
      }
    });
    ctx.stroke();
  };
  for (let lon = -180; lon < 180; lon += 30) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 4) pts.push([lat, lon]);
    line(pts);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 4) pts.push([lat, lon]);
    line(pts);
  }
}

function drawDots(cx, cy, R, sun) {
  const l0 = view.lat * RAD;
  const sinL0 = Math.sin(l0);
  const cosL0 = Math.cos(l0);
  const c0 = Math.cos(view.lon * RAD);
  const s0 = Math.sin(view.lon * RAD);
  const sLat = Math.sin(sun.lat * RAD);
  const cLat = Math.cos(sun.lat * RAD);
  const sc = Math.cos(sun.lon * RAD);
  const ss = Math.sin(sun.lon * RAD);
  const size = Math.max(1.1, Math.min(3.2, R / 210));
  const { n, cosLat, sinLat, cosLon, sinLon } = dots;

  for (let pass = 0; pass < 2; pass += 1) {
    ctx.fillStyle = pass === 0 ? '#5d7bc2' : '#cfe6ff';
    for (let i = 0; i < n; i += 1) {
      const cosDL = cosLon[i] * c0 + sinLon[i] * s0;
      const z = sinL0 * sinLat[i] + cosL0 * cosLat[i] * cosDL;
      if (z <= 0) continue;
      const lit = cosLat[i] * cLat * (cosLon[i] * sc + sinLon[i] * ss) + sinLat[i] * sLat;
      const day = lit > -0.05;
      if ((pass === 1) !== day) continue;
      const sinDL = sinLon[i] * c0 - cosLon[i] * s0;
      const x = cx + cosLat[i] * sinDL * R;
      const y = cy - (cosL0 * sinLat[i] - sinL0 * cosLat[i] * cosDL) * R;
      const soft = day ? Math.min(1, 0.45 + lit * 2.2) : 0.55;
      ctx.globalAlpha = (0.25 + z * 0.75) * soft;
      const s = size * (0.55 + z * 0.45);
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
  }
  ctx.globalAlpha = 1;
}

function drawMarkers() {
  const unit = options.getUnit();
  ctx.font = '600 12px Manrope, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const placed = [];
  const overlaps = (r) => placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
  lastMarkers.forEach((marker) => {
    const p = project(marker.place.lat, marker.place.lon);
    if (p.z < 0.08) return;
    const fade = Math.min(1, (p.z - 0.08) * 4);
    ctx.globalAlpha = fade;
    if (marker.current) {
      const pulse = (view.pulse % 2) / 2;
      ctx.strokeStyle = `rgba(127,224,167,${(0.8 * (1 - pulse)).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 + pulse * 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = marker.current ? '#7fe0a7' : marker.saved ? '#ffc95e' : '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, marker.current ? 5 : 3.6, 0, Math.PI * 2);
    ctx.fill();
    const temp = marker.now && isNum(marker.now.temp) ? formatTemp(marker.now.temp, unit) : '';
    const label = temp ? `${marker.place.name}  ${temp}` : marker.place.name;
    const width = ctx.measureText(label).width + 16;
    const spots = [[10, -14], [-10 - width, -14], [10, 14], [-10 - width, 14], [-width / 2, -30], [-width / 2, 22]];
    const inside = (r) => r.x >= 6 && r.x + r.w <= view.w - 6 && r.y >= 6 && r.y + r.h <= view.h - 6;
    const spot = spots.map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy - 11, w: width, h: 22 })).find((r) => inside(r) && !overlaps(r));
    if (!spot) return;
    placed.push(spot);
    ctx.fillStyle = 'rgba(8,12,22,0.72)';
    roundRect(spot.x, spot.y, width, 22, 11);
    ctx.fill();
    ctx.fillStyle = '#f4f7fb';
    ctx.fillText(label, spot.x + 8, spot.y + 11);
  });
  ctx.globalAlpha = 1;
}

function drawPin() {
  const pin = view.pin;
  if (!pin) return;
  const p = project(pin.lat, pin.lon);
  if (p.z < 0) return;
  let drop = 0;
  if (pin.landed) {
    const t = Math.min(1, (performance.now() - pin.landed) / 650);
    const bounce = motionAllowed() ? Math.abs(Math.sin(t * Math.PI * 2.2)) * (1 - t) : 0;
    drop = -bounce * 26;
    const ripple = ((performance.now() - pin.landed) / 1600) % 1;
    ctx.strokeStyle = `rgba(255,201,94,${(0.7 * (1 - ripple)).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 6 + ripple * 26, (6 + ripple * 26) * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    drop = -30;
  }
  const y = p.y + drop;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 2, 6, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffc95e';
  ctx.beginPath();
  ctx.moveTo(p.x, y);
  ctx.bezierCurveTo(p.x - 13, y - 14, p.x - 10, y - 30, p.x, y - 30);
  ctx.bezierCurveTo(p.x + 10, y - 30, p.x + 13, y - 14, p.x, y);
  ctx.fill();
  ctx.fillStyle = '#1b1306';
  ctx.beginPath();
  ctx.arc(p.x, y - 19, 4.2, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function flyTo(lat, lon, zoom = 2.1) {
  view.autoSpin = false;
  view.vLon = 0;
  view.vLat = 0;
  const dLon = ((((lon - view.lon) % 360) + 540) % 360) - 180;
  const targetLat = Math.max(-75, Math.min(75, lat));
  const distance = Math.hypot(dLon, targetLat - view.lat);
  if (!motionAllowed()) {
    view.lon = lon;
    view.lat = targetLat;
    view.zoom = zoom;
    if (view.pin) view.pin.landed = performance.now();
    return;
  }
  view.fly = {
    t: 0,
    duration: Math.min(2.4, 0.9 + distance / 120),
    lon0: view.lon,
    dLon,
    lat0: view.lat,
    lat1: targetLat,
    zoom0: view.zoom,
    zoom1: zoom,
    arc: Math.min(1, distance / 60),
  };
}

function zoomBy(factor) {
  view.fly = null;
  view.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.zoom * factor));
}

async function pick(lat, lon, { place = null, fly = true } = {}) {
  if (pickController) pickController.abort();
  const controller = new AbortController();
  pickController = controller;
  view.pin = { lat, lon, place, landed: 0 };
  if (fly) flyTo(lat, lon, Math.max(view.zoom, 2.1));
  else view.pin.landed = performance.now();
  renderCard({ state: 'loading', lat, lon, place });
  el.live.textContent = `Looking up the weather at ${formatCoords(lat, lon)}.`;
  try {
    const result = await options.fetchPoint(lat, lon, { signal: controller.signal, place });
    if (controller.signal.aborted) return;
    view.pin.place = result.place;
    renderCard({ state: 'ready', ...result });
    const info = getCodeInfo(result.now.code, result.now.cloud);
    el.live.textContent = `${result.place.name}: ${formatTemp(result.now.temp, options.getUnit())}, ${info.label}.`;
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) return;
    renderCard({ state: 'error', lat, lon, error });
  }
}

function renderCard(data) {
  el.card.hidden = false;
  const coords = formatCoords(data.lat ?? data.place?.lat, data.lon ?? data.place?.lon);
  if (data.state === 'loading') {
    el.card.innerHTML = `<p class="label">${escapeHTML(coords)}</p>
      <h3 class="globe__place">${escapeHTML(data.place ? data.place.name : 'Finding this place…')}</h3>
      <div class="globe__now"><span class="sk" style="width:46px;height:40px;border-radius:12px"></span><span class="sk sk--line" style="width:140px"></span></div>`;
    return;
  }
  if (data.state === 'error') {
    const info = describeError(data.error);
    el.card.innerHTML = `<p class="label">${escapeHTML(coords)}</p><h3 class="globe__place">Weather unavailable</h3><p class="globe__sub">${escapeHTML(info.message)}</p>
      <div class="globe__actions"><button class="btn btn--ghost" type="button" data-retry>${icon('i-refresh')}<span>Try again</span></button></div>`;
    return;
  }
  const { place, now } = data;
  const unit = options.getUnit();
  const info = getCodeInfo(now.code, now.cloud);
  const local = now.timezone || isNum(now.utcOffset) ? formatTime(nowWall(now.timezone, now.utcOffset)) : '';
  const region = [place.admin1 && place.admin1 !== place.name ? place.admin1 : '', place.country].filter(Boolean).join(', ');
  el.card.innerHTML = `<p class="label">${escapeHTML(formatCoords(place.lat, place.lon))}${local ? ` · ${escapeHTML(local)} local` : ''}</p>
    <h3 class="globe__place">${escapeHTML(place.name)}</h3>
    ${region ? `<p class="globe__sub">${escapeHTML(region)}</p>` : ''}
    <div class="globe__now">
      <svg class="wi globe__icon" aria-hidden="true"><use href="#${iconFor(now.code, now.isDay !== false, now.cloud)}"></use></svg>
      <span class="globe__temp">${formatTemp(now.temp, unit)}</span>
      <span class="globe__cond">${escapeHTML(info.label)}${isNum(now.wind) ? `<br>Wind ${escapeHTML(formatWind(now.wind, options.getWind()))}` : ''}</span>
    </div>
    <div class="globe__actions"><button class="btn btn--primary" type="button" data-open>${icon('i-sparkle')}<span>Open full forecast</span></button></div>`;
}

function onPointerDown(event) {
  el.canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  view.autoSpin = false;
  view.fly = null;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    drag = null;
    return;
  }
  drag = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, time: performance.now(), moved: 0 };
  view.vLon = 0;
  view.vLat = 0;
}

function onPointerMove(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    view.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinch.zoom * (distance / pinch.distance)));
    return;
  }
  if (!drag) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  const now = performance.now();
  const dt = Math.max(1, now - drag.time) / 1000;
  const R = baseRadius() * view.zoom;
  const dLon = (-dx / R) / RAD;
  const dLat = (dy / R) / RAD;
  view.lon += dLon;
  view.lat = Math.max(-85, Math.min(85, view.lat + dLat));
  view.vLon = dLon / dt;
  view.vLat = dLat / dt;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  drag.x = event.clientX;
  drag.y = event.clientY;
  drag.time = now;
}

function onPointerUp(event) {
  pointers.delete(event.pointerId);
  if (pinch) {
    if (pointers.size < 2) pinch = null;
    return;
  }
  if (!drag) return;
  const tap = drag.moved < 6;
  if (performance.now() - drag.time > 80) {
    view.vLon = 0;
    view.vLat = 0;
  }
  if (tap) {
    view.vLon = 0;
    view.vLat = 0;
    const rect = el.canvas.getBoundingClientRect();
    const point = unproject(event.clientX - rect.left, event.clientY - rect.top);
    if (point) pick(point.lat, point.lon);
  }
  drag = null;
}

function onWheel(event) {
  event.preventDefault();
  view.fly = null;
  view.autoSpin = false;
  const factor = Math.exp(-event.deltaY * 0.0015);
  view.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.zoom * factor));
}

function onKey(event) {
  const step = 8 / view.zoom;
  let handled = true;
  view.autoSpin = false;
  switch (event.key) {
    case 'ArrowLeft':
      view.lon -= step;
      break;
    case 'ArrowRight':
      view.lon += step;
      break;
    case 'ArrowUp':
      view.lat = Math.min(85, view.lat + step);
      break;
    case 'ArrowDown':
      view.lat = Math.max(-85, view.lat - step);
      break;
    case '+':
    case '=':
      zoomBy(1.25);
      break;
    case '-':
    case '_':
      zoomBy(0.8);
      break;
    case 'Enter':
    case ' ': {
      const [cx, cy] = center();
      const point = unproject(cx, cy);
      if (point) pick(point.lat, point.lon, { fly: false });
      break;
    }
    default:
      handled = false;
  }
  if (handled) {
    event.preventDefault();
    view.fly = null;
  }
}
