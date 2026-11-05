import { createLandscape } from './landscape.js';
import { buildSceneLayers, hasScene, registerScene } from './scenes.js';
import { copyPalette, easePalette, getPalette } from './sky.js';
import { rgba, smooth } from './utils.js';

const MOTION = {
  full: { density: 1, speed: 1, flashes: 1, parallax: true },
  calm: { density: 0.55, speed: 0.6, flashes: 0.35, parallax: false },
  off: { density: 0.75, speed: 0, flashes: 0, parallax: false },
};

const QUALITY = [0.5, 0.75, 1];
const FADE_SECONDS = 1.4;
const PIXEL_BUDGET = 4.2e6;

export function createWeatherEngine(canvas, { onFlash, onPalette, onStrike } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const landscape = createLandscape();
  const env = {
    ctx,
    w: 0,
    h: 0,
    dpr: 1,
    time: 0,
    quality: 1,
    mobile: false,
    motion: MOTION.full,
    palette: null,
    target: null,
    paletteVersion: 0,
    pointer: { x: 0, y: 0 },
    cursor: { x: -9999, y: -9999, active: false, t: 0 },
    shared: {},
    wind: 0,
    windNow: 0,
    gust: 0,
    flash: 0,
    cfg: null,
    ridgeY: landscape.ridgeY,
    clipRidge: null,
    onStrike: onStrike || null,
  };
  env.clipRidge = (context, index) => landscape.clip(context, index, env);

  let motionMode = 'full';
  let qualityLevel = 2;
  let scene = null;
  const fading = [];
  let drawList = [];
  let listDirty = false;
  let raf = 0;
  let running = false;
  let last = 0;
  let destroyed = false;
  let frameAvg = 16;
  let slowFrames = 0;
  let paletteSettled = true;
  let skyGradient = null;
  let skyVersion = -1;
  let lastFlash = 0;
  let resizeQueued = false;
  let paused = false;
  const pointerTarget = { x: 0, y: 0 };
  const finePointer = window.matchMedia ? window.matchMedia('(pointer: fine)') : null;

  function measure() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || window.innerWidth));
    const h = Math.max(1, Math.round(rect.height || window.innerHeight));
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (qualityLevel === 0) dpr = Math.min(dpr, 1);
    else if (qualityLevel === 1) dpr = Math.min(dpr, 1.5);
    if (w * h * dpr * dpr > PIXEL_BUDGET) dpr = Math.sqrt(PIXEL_BUDGET / (w * h));
    return { w, h, dpr: Math.max(0.75, dpr) };
  }

  function eachLayer(fn) {
    if (scene) scene.layers.forEach(fn);
    fading.forEach((s) => s.layers.forEach(fn));
  }

  function resize(force = false) {
    const { w, h, dpr } = measure();
    if (!force && w === env.w && h === env.h && Math.abs(dpr - env.dpr) < 0.01) return;
    const prevW = env.w;
    const prevH = env.h;
    env.w = w;
    env.h = h;
    env.dpr = dpr;
    env.mobile = w < 720;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    landscape.resize(env);
    env.paletteVersion += 1;
    eachLayer((layer) => layer.resize && layer.resize(env, prevW, prevH));
    if (!running) renderStill();
  }

  function rebuildDrawList() {
    const items = landscape.layers.map((layer) => ({ layer, owner: null }));
    fading.forEach((s) => s.layers.forEach((layer) => items.push({ layer, owner: s })));
    if (scene) scene.layers.forEach((layer) => items.push({ layer, owner: scene }));
    items.sort((a, b) => a.layer.z - b.layer.z);
    drawList = items;
    listDirty = false;
  }

  function destroyScene(target) {
    target.layers.forEach((layer) => layer.destroy && layer.destroy());
    target.layers = [];
  }

  function step(dt, realDt) {
    env.time += dt;
    const parallax = env.motion.parallax && finePointer && finePointer.matches;
    env.cursor.active = Boolean(parallax) && performance.now() - env.cursor.t < 2500;
    env.pointer.x = smooth(env.pointer.x, parallax ? pointerTarget.x : 0, 2.4, realDt);
    env.pointer.y = smooth(env.pointer.y, parallax ? pointerTarget.y : 0, 2.4, realDt);

    if (!paletteSettled && realDt > 0) {
      const delta = easePalette(env.palette, env.target, 1 - Math.exp(-realDt * 1.8));
      env.paletteVersion += 1;
      if (delta < 0.6) {
        copyPalette(env.target, env.palette);
        paletteSettled = true;
      }
    }

    if (scene && scene.alpha < 1) scene.alpha = Math.min(1, scene.alpha + realDt / FADE_SECONDS);
    for (let i = fading.length - 1; i >= 0; i -= 1) {
      fading[i].alpha -= realDt / FADE_SECONDS;
      if (fading[i].alpha <= 0) {
        destroyScene(fading[i]);
        fading.splice(i, 1);
        listDirty = true;
      }
    }
    if (listDirty) rebuildDrawList();

    env.shared.lastOcclusion = env.shared.occlusion || 0;
    env.shared.occlusion = 0;
    env.flash = 0;
    env.gust = 0;
    env.windNow = env.wind;
    env.shared.cloudShadows = [];
    for (let i = 0; i < drawList.length; i += 1) {
      const { layer } = drawList[i];
      if (layer.update) layer.update(dt, env);
    }
  }

  function drawSky() {
    const p = env.palette;
    if (!skyGradient || skyVersion !== env.paletteVersion) {
      const g = ctx.createLinearGradient(0, 0, 0, env.h);
      g.addColorStop(0, rgba(p.top));
      g.addColorStop(0.42, rgba(p.mid));
      g.addColorStop(0.7, rgba(p.bottom));
      g.addColorStop(0.86, rgba(p.horizon));
      g.addColorStop(1, rgba(p.horizon));
      skyGradient = g;
      skyVersion = env.paletteVersion;
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, env.w, env.h);
  }

  function render() {
    if (!env.palette) return;
    drawSky();
    for (let i = 0; i < drawList.length; i += 1) {
      const { layer, owner } = drawList[i];
      const alpha = owner ? owner.alpha : 1;
      if (alpha <= 0.001) continue;
      layer.draw(ctx, env, alpha);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    const flash = Math.round(env.flash * 40) / 40;
    if (flash !== lastFlash) {
      lastFlash = flash;
      if (onFlash) onFlash(flash);
    }
  }

  function renderStill() {
    if (!env.palette || !env.w || destroyed) return;
    if (!paletteSettled) {
      copyPalette(env.target, env.palette);
      paletteSettled = true;
      env.paletteVersion += 1;
    }
    if (scene) scene.alpha = 1;
    if (fading.length) {
      fading.forEach(destroyScene);
      fading.length = 0;
    }
    rebuildDrawList();
    step(0, 0);
    step(0, 0);
    render();
  }

  function adapt(dt) {
    if (dt <= 0 || dt >= 0.1) return;
    frameAvg = frameAvg * 0.94 + dt * 1000 * 0.06;
    if (frameAvg > 28 && qualityLevel > 0) {
      slowFrames += 1;
      if (slowFrames > 150) {
        qualityLevel -= 1;
        slowFrames = 0;
        frameAvg = 16;
        env.quality = QUALITY[qualityLevel];
        resize(true);
        if (env.cfg) setScene(env.cfg, { instant: true });
      }
    } else {
      slowFrames = Math.max(0, slowFrames - 2);
    }
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const realDt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    adapt(realDt);
    try {
      step(realDt * env.motion.speed, realDt);
      render();
    } catch (error) {
      stop();
      console.error('ATMOS weather engine stopped:', error);
    }
  }

  function start() {
    if (running || destroyed || paused || motionMode === 'off' || document.hidden || !scene) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function layerKey(cfg) {
    return [
      cfg.kind,
      cfg.isDay ? 'd' : 'n',
      cfg.precipType || '-',
      Math.round((cfg.precip || 0) * 5),
      Math.round((cfg.cloudCover || 0) * 5),
      cfg.lightning > 0 ? 1 : 0,
      Math.round((cfg.fog || 0) * 4),
      cfg.freezing ? 1 : 0,
      Math.round((cfg.windX || 0) * 3),
      Math.round((cfg.golden || 0) * 2),
      motionMode,
      qualityLevel,
      env.mobile ? 'm' : 'w',
    ].join('|');
  }

  function setScene(cfg, { instant = false } = {}) {
    if (destroyed || !cfg) return;
    env.shared.sun = null;
    if (!env.w) resize(true);
    env.cfg = cfg;
    env.wind = cfg.windX || 0;
    const target = getPalette(cfg);
    const immediate = instant || !env.palette || motionMode === 'off' || document.hidden;
    if (!env.palette) env.palette = copyPalette(target);
    env.target = target;
    if (immediate) {
      copyPalette(target, env.palette);
      paletteSettled = true;
    } else {
      paletteSettled = false;
    }
    env.paletteVersion += 1;
    if (onPalette) onPalette(target, cfg);
    canvas.classList.toggle('is-hazy', (cfg.fog || 0) > 0.45);

    const key = layerKey(cfg);
    if (scene && scene.key === key) {
      scene.layers.forEach((layer) => layer.configure && layer.configure(cfg));
      if (!running) renderStill();
      return;
    }

    const next = { key, cfg, layers: buildSceneLayers(cfg, env), alpha: immediate || !scene ? 1 : 0 };
    if (scene) {
      if (next.alpha >= 1) destroyScene(scene);
      else fading.push(scene);
    }
    if (immediate) {
      fading.forEach(destroyScene);
      fading.length = 0;
    }
    while (fading.length > 1) destroyScene(fading.shift());
    scene = next;
    rebuildDrawList();
    if (!running) renderStill();
    start();
  }

  function setMotion(mode) {
    if (!MOTION[mode] || mode === motionMode) return;
    motionMode = mode;
    env.motion = MOTION[mode];
    if (mode === 'off') {
      stop();
      env.pointer.x = 0;
      env.pointer.y = 0;
    }
    if (env.cfg) setScene(env.cfg, { instant: true });
    if (mode === 'off') renderStill();
    else start();
  }

  function onVisibility() {
    if (document.hidden) stop();
    else if (motionMode === 'off') renderStill();
    else start();
  }

  function onResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      resize();
    });
  }

  function onPointer(event) {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    pointerTarget.x = (event.clientX / window.innerWidth - 0.5) * 2;
    pointerTarget.y = (event.clientY / window.innerHeight - 0.5) * 2;
    env.cursor.x = event.clientX;
    env.cursor.y = event.clientY;
    env.cursor.t = performance.now();
  }

  function onPointerOut(event) {
    if (!event.relatedTarget) env.cursor.t = 0;
  }

  function interact(x, y) {
    if (destroyed || !scene || motionMode === 'off') return;
    scene.layers.forEach((layer) => layer.interact && layer.interact(x, y, env));
    if (!running) start();
  }

  function celestial() {
    const body = env.shared.sun;
    if (!body || !scene || body.vis < 0.15) return null;
    return { x: body.x - env.pointer.x * 6, y: body.y - env.pointer.y * 4, type: body.type || 'sun' };
  }

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerout', onPointerOut, { passive: true });
  resize(true);

  return {
    setScene,
    setMotion,
    interact,
    celestial,
    pause() {
      paused = true;
      stop();
    },
    resume() {
      paused = false;
      if (motionMode === 'off') renderStill();
      else start();
    },
    resize: () => resize(true),
    start,
    stop,
    registerScene,
    hasScene,
    get motion() {
      return motionMode;
    },
    get running() {
      return running;
    },
    destroy() {
      destroyed = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerout', onPointerOut);
      if (scene) destroyScene(scene);
      fading.forEach(destroyScene);
      fading.length = 0;
      scene = null;
      drawList = [];
    },
  };
}
