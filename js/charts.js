import { $, escapeHTML, icon } from './dom.js';
import { DAY_MS, formatHour, formatPrecip, formatWeekday, isNum, toUnitTemp, windUnitLabel, windValue } from './format.js';
import { currentHourIndex, uvCategory } from './insights.js';
import { getCodeInfo } from './weather-codes.js';
import { smoothPath, tempColor } from './forecast.js';
import { storage } from './storage.js';

const RANGES = { 24: 24, 48: 48, 168: 168 };
const ctx = { weather: null, prefs: null, now: 0 };
const el = {};
const saved = storage.read('trends', {});
const state = {
  metric: saved && typeof saved.metric === 'string' ? saved.metric : 'temp',
  range: saved && RANGES[saved.range] ? String(saved.range) : '48',
  width: 0,
};
let series = null;

const minus = (n) => (n < 0 ? `−${Math.abs(n)}` : String(n));
const distance = (meters, prefs) => (isNum(meters) ? (prefs.wind === 'mph' ? meters / 1609.344 : meters / 1000) : null);
const distanceUnit = (prefs) => (prefs.wind === 'mph' ? 'mi' : 'km');

const METRICS = [
  {
    id: 'temp', label: 'Temperature', icon: 'i-thermo', type: 'line', color: 'var(--c-temp)', gradient: true,
    value: (h, p) => toUnitTemp(h.temp, p.unit),
    format: (v) => `${minus(Math.round(v))}°`,
    tick: (v) => `${minus(Math.round(v))}°`,
    second: { label: 'Feels like', value: (h, p) => toUnitTemp(h.feels, p.unit), format: (v) => `${minus(Math.round(v))}°` },
  },
  {
    id: 'humidity', label: 'Humidity', icon: 'i-drop', type: 'area', color: 'var(--c-humidity)', domain: [0, 100],
    value: (h) => h.humidity, format: (v) => `${Math.round(v)}%`, tick: (v) => `${Math.round(v)}%`,
  },
  {
    id: 'precip', label: 'Precipitation', icon: 'i-umbrella', type: 'bars', color: 'var(--c-precip)', domain: [0, 100],
    value: (h) => h.pop, format: (v) => `${Math.round(v)}% chance`, tick: (v) => `${Math.round(v)}%`,
    second: { label: 'Amount', value: (h) => h.precip, format: (v) => formatPrecip(v), axis: 'right', tick: (v) => `${v < 1 ? v.toFixed(1) : Math.round(v)}` },
  },
  {
    id: 'wind', label: 'Wind', icon: 'i-wind', type: 'area', color: 'var(--c-wind)', floor: 0,
    value: (h, p) => windValue(h.wind, p.wind), format: (v, p) => `${Math.round(v)} ${windUnitLabel(p.wind)}`, tick: (v) => String(Math.round(v)),
    second: { label: 'Gusts', value: (h, p) => windValue(h.gusts, p.wind), format: (v, p) => `${Math.round(v)} ${windUnitLabel(p.wind)}` },
  },
  {
    id: 'uv', label: 'UV index', icon: 'i-sun', type: 'bars', color: 'var(--c-uv)', floor: 0, minSpan: 8,
    value: (h) => h.uv, format: (v) => `${v.toFixed(1)} · ${uvCategory(v).label}`, tick: (v) => String(Math.round(v)),
    barColor: (v) => uvCategory(v).color,
  },
  {
    id: 'pressure', label: 'Pressure', icon: 'i-gauge', type: 'line', color: 'var(--c-pressure)', minSpan: 8,
    value: (h) => h.pressure, format: (v) => `${Math.round(v)} hPa`, tick: (v) => String(Math.round(v)),
  },
  {
    id: 'cloud', label: 'Cloud cover', icon: 'i-cloud', type: 'area', color: 'var(--c-cloud)', domain: [0, 100],
    value: (h) => h.cloud, format: (v) => `${Math.round(v)}%`, tick: (v) => `${Math.round(v)}%`,
  },
  {
    id: 'visibility', label: 'Visibility', icon: 'i-eye', type: 'line', color: 'var(--c-visibility)', floor: 0, minSpan: 5,
    value: (h, p) => distance(h.visibility, p), format: (v, p) => `${v < 10 ? v.toFixed(1) : Math.round(v)} ${distanceUnit(p)}`, tick: (v) => String(Math.round(v)),
  },
];

const metricById = (id) => METRICS.find((m) => m.id === id) || METRICS[0];

export function initTrends() {
  Object.assign(el, {
    tabs: $('#trends-tabs'),
    chart: $('#trends-chart'),
    stats: $('#trends-stats'),
    summary: $('#trends-summary'),
    panel: $('#trends-panel'),
  });
  if (!METRICS.some((m) => m.id === state.metric)) state.metric = 'temp';

  el.tabs.innerHTML = METRICS.map((m) => `<button class="trends__tab" type="button" role="tab" id="trend-tab-${m.id}" data-metric="${m.id}" aria-controls="trends-panel" aria-selected="${m.id === state.metric}" tabindex="${m.id === state.metric ? 0 : -1}">${icon(m.icon)}<span>${m.label}</span></button>`).join('');
  el.panel.setAttribute('aria-labelledby', `trend-tab-${state.metric}`);

  el.tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-metric]');
    if (tab) selectMetric(tab.dataset.metric, false);
  });
  el.tabs.addEventListener('keydown', (event) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = METRICS.findIndex((m) => m.id === state.metric);
    let next = index;
    if (event.key === 'ArrowLeft') next = (index - 1 + METRICS.length) % METRICS.length;
    if (event.key === 'ArrowRight') next = (index + 1) % METRICS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = METRICS.length - 1;
    selectMetric(METRICS[next].id, true);
  });

  document.querySelectorAll('input[name="trend-range"]').forEach((input) => {
    input.checked = input.value === state.range;
    input.addEventListener('change', () => {
      state.range = input.value;
      persist();
      renderTrends();
    });
  });

  if ('ResizeObserver' in window) {
    let frame = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = Math.round(el.chart.clientWidth);
        if (ctx.weather && Math.abs(width - state.width) > 4) renderTrends();
      });
    }).observe(el.chart);
  }
}

function persist() {
  storage.write('trends', { metric: state.metric, range: state.range });
}

function selectMetric(id, focus) {
  state.metric = id;
  persist();
  el.tabs.querySelectorAll('[role="tab"]').forEach((tab) => {
    const active = tab.dataset.metric === id;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
    if (active) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  el.panel.setAttribute('aria-labelledby', `trend-tab-${id}`);
  renderTrends();
}

export function setTrendsContext(next) {
  Object.assign(ctx, next);
}

function niceStep(span) {
  const raw = span / 4;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = raw / power;
  const nice = unit < 1.5 ? 1 : unit < 3 ? 2 : unit < 7 ? 5 : 10;
  return nice * power;
}

function describeTime(time, now) {
  const today = Math.floor(now / DAY_MS);
  const day = Math.floor(time / DAY_MS);
  const label = day === today ? 'Today' : day === today + 1 ? 'Tomorrow' : formatWeekday(time, 'short');
  return `${label} ${formatHour(time)}`;
}

export function renderTrends() {
  const { weather, prefs, now } = ctx;
  if (!weather || !el.chart) return;
  const metric = metricById(state.metric);
  const start = Math.max(0, currentHourIndex(weather.hourly, now));
  const hours = weather.hourly.slice(start, start + RANGES[state.range]);
  const values = hours.map((h) => metric.value(h, prefs));
  const valid = values.filter(isNum);
  state.width = Math.round(el.chart.clientWidth) || 800;

  if (hours.length < 2 || !valid.length) {
    series = null;
    el.chart.innerHTML = `<p class="trends__empty">${escapeHTML(metric.label)} data isn’t available for this period.</p>`;
    el.stats.innerHTML = '';
    el.summary.textContent = '';
    return;
  }

  const second = metric.second ? hours.map((h) => metric.second.value(h, prefs)) : null;
  const rightAxis = Boolean(metric.second && metric.second.axis === 'right');

  let lo;
  let hi;
  if (metric.domain) {
    [lo, hi] = metric.domain;
  } else {
    const pool = valid.concat(second && !rightAxis ? second.filter(isNum) : []);
    lo = Math.min(...pool);
    hi = Math.max(...pool);
    const pad = Math.max((hi - lo) * 0.12, 0.5);
    lo -= pad;
    hi += pad;
    if (metric.floor !== undefined) lo = Math.max(metric.floor, lo);
    if (metric.minSpan && hi - lo < metric.minSpan) {
      const mid = (hi + lo) / 2;
      lo = metric.floor !== undefined ? Math.max(metric.floor, mid - metric.minSpan / 2) : mid - metric.minSpan / 2;
      hi = lo + metric.minSpan;
    }
  }
  const step = niceStep(hi - lo);
  if (!metric.domain) {
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    if (metric.floor !== undefined) lo = Math.max(metric.floor, lo);
  }

  let rightHi = 1;
  if (rightAxis) {
    const max = Math.max(0, ...second.filter(isNum));
    rightHi = Math.max(1, Math.ceil(max * 1.25));
  }

  const W = state.width;
  const H = W < 560 ? 230 : 280;
  const pad = { l: 44, r: rightAxis ? 40 : 14, t: 30, b: 34 };
  const n = hours.length;
  const x = (i) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const yRight = (v) => pad.t + (1 - v / rightHi) * (H - pad.t - pad.b);
  const baseY = H - pad.b;

  let grid = '';
  for (let v = lo; v <= hi + step * 0.01; v += step) {
    const gy = y(v);
    grid += `<line class="chart-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}"/>`;
    grid += `<text class="chart-label" x="${pad.l - 8}" y="${(gy + 3.5).toFixed(1)}" text-anchor="end">${escapeHTML(metric.tick(v))}</text>`;
  }
  if (rightAxis) {
    [0, rightHi / 2, rightHi].forEach((v) => {
      grid += `<text class="chart-label" x="${W - pad.r + 8}" y="${(yRight(v) + 3.5).toFixed(1)}">${escapeHTML(metric.second.tick(v))}</text>`;
    });
    grid += `<text class="chart-label" x="${W - pad.r + 8}" y="${pad.t - 14}">mm</text>`;
  }

  let days = '';
  const labelEvery = state.range === '24' ? 3 : 6;
  hours.forEach((h, i) => {
    const hour = new Date(h.time).getUTCHours();
    if (hour === 0 && i > 0) {
      days += `<line class="chart-day" x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${pad.t - 18}" y2="${baseY}"/>`;
      days += `<text class="chart-daylabel" x="${(x(i) + 6).toFixed(1)}" y="${pad.t - 10}">${escapeHTML(formatWeekday(h.time, 'short'))}</text>`;
    }
    if (state.range === '168') {
      if (hour === 12) days += `<text class="chart-label" x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle">${escapeHTML(formatWeekday(h.time, 'short'))}</text>`;
    } else if (hour % labelEvery === 0) {
      days += `<text class="chart-label" x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle">${escapeHTML(formatHour(h.time))}</text>`;
    }
  });

  const points = values.map((v, i) => (isNum(v) ? [x(i), y(v)] : null));
  const segments = [];
  let run = [];
  points.forEach((p) => {
    if (p) run.push(p);
    else if (run.length) {
      segments.push(run);
      run = [];
    }
  });
  if (run.length) segments.push(run);

  const id = `tr-${metric.id}`;
  let defs = `<linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${metric.color};stop-opacity:.42"/><stop offset="1" style="stop-color:${metric.color};stop-opacity:0"/></linearGradient>`;
  let stroke = `style="stroke:${metric.color}"`;
  if (metric.gradient) {
    const stops = hours.map((h, i) => (isNum(h.temp) && i % Math.max(1, Math.round(n / 40)) === 0 ? `<stop offset="${(((x(i) - pad.l) / (W - pad.l - pad.r)) * 100).toFixed(1)}%" stop-color="${tempColor(h.temp)}"/>` : '')).join('');
    defs += `<linearGradient id="${id}-stroke" gradientUnits="userSpaceOnUse" x1="${pad.l}" x2="${W - pad.r}" y1="0" y2="0">${stops}</linearGradient>`;
    stroke = `stroke="url(#${id}-stroke)"`;
  }

  let body = '';
  if (metric.type === 'bars') {
    const barW = Math.max(1.4, ((W - pad.l - pad.r) / n) * 0.66);
    body += values.map((v, i) => {
      if (!isNum(v) || v <= 0) return '';
      const top = y(Math.min(hi, v));
      const fill = metric.barColor ? metric.barColor(v) : metric.color;
      return `<rect class="chart-bar" x="${(x(i) - barW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0.8, baseY - top).toFixed(1)}" rx="${Math.min(2, barW / 2).toFixed(1)}" style="fill:${fill}"/>`;
    }).join('');
  } else {
    segments.forEach((seg) => {
      const path = smoothPath(seg);
      if (metric.type === 'area') body += `<path d="${path}L${seg[seg.length - 1][0].toFixed(1)} ${baseY}L${seg[0][0].toFixed(1)} ${baseY}Z" fill="url(#${id}-fill)"/>`;
      body += `<path class="chart-line" d="${path}" ${stroke}/>`;
    });
  }

  if (second) {
    const pts = second.map((v, i) => (isNum(v) ? [x(i), rightAxis ? yRight(v) : y(v)] : null)).filter(Boolean);
    if (pts.length > 1) body += `<path class="chart-line chart-line--second" d="${smoothPath(pts)}"/>`;
  }

  let maxI = -1;
  let minI = -1;
  values.forEach((v, i) => {
    if (!isNum(v)) return;
    if (maxI < 0 || v > values[maxI]) maxI = i;
    if (minI < 0 || v < values[minI]) minI = i;
  });
  const marker = (i, above) => {
    if (i < 0) return '';
    const mx = x(i);
    const my = y(values[i]);
    const tx = Math.min(W - pad.r - 20, Math.max(pad.l + 20, mx));
    return `<circle class="chart-peak" cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="3.5"/><text class="chart-value" x="${tx.toFixed(1)}" y="${(above ? my - 9 : my + 17).toFixed(1)}" text-anchor="middle">${escapeHTML(metric.format(values[i], prefs).split(' ·')[0])}</text>`;
  };
  const extremes = metric.type === 'bars' ? marker(maxI, true) : `${marker(maxI, true)}${minI !== maxI ? marker(minI, false) : ''}`;

  const legendHtml = second
    ? `<div class="trends__legend"><span><i style="background:${metric.gradient ? 'linear-gradient(90deg,#7fd6e6,#ffd27a,#ff9f6b)' : metric.color}"></i>${escapeHTML(metric.label)}</span><span><i class="is-dashed"></i>${escapeHTML(metric.second.label)}${rightAxis ? ' (mm, right axis)' : ''}</span></div>`
    : '';

  el.chart.innerHTML = `<svg class="trends__svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" tabindex="0" aria-label="${escapeHTML(`${metric.label} for the next ${state.range === '168' ? '7 days' : `${state.range} hours`}. Use the left and right arrow keys to read each hour.`)}">
    <defs>${defs}</defs>
    ${grid}${days}
    <line class="chart-now" x1="${pad.l}" x2="${pad.l}" y1="${pad.t - 18}" y2="${baseY}"/>
    <text class="chart-daylabel chart-daylabel--now" x="${pad.l + 6}" y="${pad.t - 10}">Now</text>
    ${body}${extremes}
    <g class="chart-cursor" visibility="hidden"><line y1="${pad.t - 6}" y2="${baseY}"/><circle r="4.5"/><rect height="44" rx="9" width="160"/><text class="cursor-a"></text><text class="cursor-b"></text></g>
    <rect class="chart-hit" x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="${H}" fill="transparent"/>
  </svg>${legendHtml}`;

  series = { hours, values, second, metric, x, y, yRight, rightAxis, W, H, pad };
  bindCursor();
  renderStats(metric, hours, values, second);
}

function bindCursor() {
  const svg = el.chart.querySelector('svg');
  if (!svg || !series) return;
  const cursor = svg.querySelector('.chart-cursor');
  const hit = svg.querySelector('.chart-hit');
  let current = -1;

  const show = (index) => {
    const { hours, values, second, metric, x, y, W, pad } = series;
    const i = Math.min(hours.length - 1, Math.max(0, index));
    current = i;
    const h = hours[i];
    const cx = x(i);
    const v = values[i];
    const cy = isNum(v) ? y(Math.min(series.metric.domain ? series.metric.domain[1] : v, v)) : pad.t;
    cursor.setAttribute('visibility', 'visible');
    const line = cursor.querySelector('line');
    line.setAttribute('x1', cx);
    line.setAttribute('x2', cx);
    const dot = cursor.querySelector('circle');
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', cy);
    dot.setAttribute('visibility', isNum(v) ? 'visible' : 'hidden');
    const boxX = Math.min(W - 164, Math.max(2, cx - 80));
    const rect = cursor.querySelector('rect');
    rect.setAttribute('x', boxX);
    rect.setAttribute('y', 2);
    const a = cursor.querySelector('.cursor-a');
    const b = cursor.querySelector('.cursor-b');
    a.setAttribute('x', boxX + 10);
    a.setAttribute('y', 19);
    b.setAttribute('x', boxX + 10);
    b.setAttribute('y', 36);
    const main = isNum(v) ? metric.format(v, ctx.prefs) : 'No data';
    const extra = second && isNum(second[i]) ? ` · ${metric.second.label} ${metric.second.format(second[i], ctx.prefs)}` : '';
    a.textContent = describeTime(h.time, ctx.now);
    b.textContent = metric.id === 'temp' ? `${main} · ${getCodeInfo(h.code, h.cloud).short}` : `${main}${extra}`;
    svg.setAttribute('aria-valuetext', `${a.textContent}: ${b.textContent}`);
  };

  const indexFrom = (event) => {
    const box = svg.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * series.W;
    return Math.round(((px - series.pad.l) / (series.W - series.pad.l - series.pad.r)) * (series.hours.length - 1));
  };

  hit.addEventListener('pointermove', (event) => show(indexFrom(event)));
  hit.addEventListener('pointerdown', (event) => show(indexFrom(event)));
  svg.addEventListener('pointerleave', () => {
    if (document.activeElement !== svg) cursor.setAttribute('visibility', 'hidden');
  });
  svg.addEventListener('blur', () => cursor.setAttribute('visibility', 'hidden'));
  svg.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
    event.preventDefault();
    const last = series.hours.length - 1;
    let i = current < 0 ? 0 : current;
    if (event.key === 'ArrowLeft') i -= 1;
    if (event.key === 'ArrowRight') i += 1;
    if (event.key === 'PageUp') i -= 6;
    if (event.key === 'PageDown') i += 6;
    if (event.key === 'Home') i = 0;
    if (event.key === 'End') i = last;
    show(i);
    const live = document.getElementById('sr-live');
    if (live) live.textContent = svg.getAttribute('aria-valuetext');
  });
}

function renderStats(metric, hours, values, second) {
  const { prefs, now } = ctx;
  const items = [];
  const valid = values.map((v, i) => ({ v, i })).filter((d) => isNum(d.v));
  const max = valid.reduce((a, b) => (b.v > a.v ? b : a));
  const min = valid.reduce((a, b) => (b.v < a.v ? b : a));
  const avg = valid.reduce((sum, d) => sum + d.v, 0) / valid.length;
  const when = (d) => describeTime(hours[d.i].time, now);
  const fmt = (v) => metric.format(v, prefs).split(' ·')[0];
  let summary = '';

  if (metric.id === 'precip') {
    const total = (second || []).filter(isNum).reduce((s, v) => s + v, 0);
    const wet = values.filter((v) => isNum(v) && v >= 50).length;
    items.push(['Peak chance', `${Math.round(max.v)}%`, when(max)]);
    items.push(['Expected total', formatPrecip(total), 'Sum of hourly amounts']);
    items.push(['Likely wet hours', String(wet), 'Chance of 50% or more']);
    const first = values.findIndex((v) => isNum(v) && v >= 50);
    summary = first === -1
      ? `No hour in this period has a 50% or higher chance of precipitation. The highest chance is ${Math.round(max.v)}% (${when(max)}).`
      : `Precipitation becomes likely ${first === 0 ? 'right now' : `from ${describeTime(hours[first].time, now)}`}, with about ${formatPrecip(total)} expected over this period.`;
  } else if (metric.id === 'uv') {
    const strong = values.filter((v) => isNum(v) && v >= 3).length;
    items.push(['Peak UV', `${max.v.toFixed(1)}`, `${uvCategory(max.v).label} · ${when(max)}`]);
    items.push(['Hours at UV 3+', String(strong), 'Sun protection advised']);
    items.push(['Average (daylight)', (() => {
      const day = values.filter((v) => isNum(v) && v > 0);
      return day.length ? (day.reduce((s, v) => s + v, 0) / day.length).toFixed(1) : '0';
    })(), 'Hours with any UV']);
    summary = `UV peaks at ${max.v.toFixed(1)} (${uvCategory(max.v).label.toLowerCase()}) ${when(max).toLowerCase().startsWith('today') ? 'today' : `on ${when(max)}`}. ${strong ? `${strong} hours reach 3 or more.` : 'It stays low throughout.'}`;
  } else {
    items.push(['Low', fmt(min.v), when(min)]);
    items.push(['Average', fmt(avg), `${hours.length}-hour mean`]);
    items.push(['High', fmt(max.v), when(max)]);
    const firstV = valid[0].v;
    const lastV = valid[valid.length - 1].v;
    const delta = lastV - firstV;
    const amount = fmt(Math.abs(delta));
    const negligible = parseFloat(amount.replace(/[^\d.]/g, '')) === 0 || Math.abs(delta) < (max.v - min.v) * 0.12;
    const trend = negligible
      ? 'ends close to where it starts'
      : `${delta > 0 ? 'rises' : 'falls'} by ${amount} overall`;
    summary = `${metric.label} ranges from ${fmt(min.v)} (${when(min)}) to ${fmt(max.v)} (${when(max)}) and ${trend}.`;
  }

  el.stats.innerHTML = items.map(([label, value, sub]) => `<div class="trends__stat"><span class="label">${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong><small>${escapeHTML(sub)}</small></div>`).join('');
  el.summary.innerHTML = `<span class="src src--calc">Calculated</span> ${escapeHTML(summary)}`;
}

