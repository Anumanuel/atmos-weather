import { $, escapeHTML, icon, motionAllowed } from './dom.js';
import {
  DASH, DAY_MS, HOUR_MS, compass, formatDate, formatDistance, formatDuration, formatHour, formatPercent, formatPrecip,
  formatTemp, formatTime, formatWeekday, formatWind, isNum, startOfDay,
} from './format.js';
import { getCodeInfo, iconFor } from './weather-codes.js';
import { dayIndexFor } from './astro.js';
import { currentHourIndex, daySummary, hoursForDay, uvCategory } from './insights.js';

const ctx = { weather: null, prefs: null, now: 0, place: null };
const el = {};
let handlers = {};
let hourItems = [];
let selectedTime = null;
let dayIndex = 0;
let firstDay = 0;
let chartHours = [];
let chartCursor = -1;
const narrowQuery = window.matchMedia('(max-width: 760px)');

const TEMP_STOPS = [
  [-20, [111, 140, 255]], [-5, [127, 180, 255]], [5, [127, 214, 230]], [13, [155, 227, 176]],
  [20, [255, 224, 138]], [27, [255, 176, 103]], [33, [255, 122, 89]], [40, [255, 77, 109]],
];

export function tempColor(celsius) {
  if (!isNum(celsius)) return 'rgb(200,210,220)';
  if (celsius <= TEMP_STOPS[0][0]) return `rgb(${TEMP_STOPS[0][1].join(',')})`;
  for (let i = 1; i < TEMP_STOPS.length; i += 1) {
    const [t1, c1] = TEMP_STOPS[i];
    const [t0, c0] = TEMP_STOPS[i - 1];
    if (celsius <= t1) {
      const k = (celsius - t0) / (t1 - t0);
      return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(',')})`;
    }
  }
  return `rgb(${TEMP_STOPS[TEMP_STOPS.length - 1][1].join(',')})`;
}

function dayLabel(time, now) {
  const diff = Math.round((startOfDay(time) - startOfDay(now)) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return formatWeekday(time, 'long');
}

export function smoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0][0]} ${points[0][1]}`;
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export function initForecast(callbacks) {
  handlers = callbacks;
  Object.assign(el, {
    scroller: $('#hourly-scroller'),
    track: $('#hourly-track'),
    prev: $('#hourly-prev'),
    next: $('#hourly-next'),
    detail: $('#hour-detail'),
    meta: $('#hourly-meta'),
    week: $('#week-list'),
    dialog: $('#day-dialog'),
    dialogBody: $('#day-dialog-body'),
    dayPrev: $('#day-prev'),
    dayNext: $('#day-next'),
    dayClose: $('#day-close'),
  });

  el.track.addEventListener('click', (event) => {
    const button = event.target.closest('.hour[data-time]');
    if (!button) return;
    selectHour(Number(button.dataset.time));
  });

  el.track.addEventListener('keydown', (event) => {
    const button = event.target.closest('.hour[data-time]');
    if (!button || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return;
    const buttons = Array.from(el.track.querySelectorAll('.hour[data-time]'));
    const index = buttons.indexOf(button);
    const next = buttons[index + (event.key === 'ArrowRight' ? 1 : -1)];
    if (next) {
      event.preventDefault();
      next.focus();
      selectHour(Number(next.dataset.time));
    }
  });

  const step = () => (el.track.querySelector('.hour-item')?.offsetWidth || 76) * 4;
  el.prev.addEventListener('click', () => el.scroller.scrollBy({ left: -step(), behavior: motionAllowed() ? 'smooth' : 'auto' }));
  el.next.addEventListener('click', () => el.scroller.scrollBy({ left: step(), behavior: motionAllowed() ? 'smooth' : 'auto' }));

  let ticking = false;
  el.scroller.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      updateScrollState();
    });
  }, { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(updateScrollState), { passive: true });

  const onBreakpoint = () => {
    if (ctx.weather) renderHourly({ selectedTime, animate: false });
  };
  if (narrowQuery.addEventListener) narrowQuery.addEventListener('change', onBreakpoint);
  else if (narrowQuery.addListener) narrowQuery.addListener(onBreakpoint);

  el.week.addEventListener('click', (event) => {
    const button = event.target.closest('.day[data-index]');
    if (button) openDay(Number(button.dataset.index));
  });

  el.dayPrev.addEventListener('click', () => moveDay(-1));
  el.dayNext.addEventListener('click', () => moveDay(1));
  el.dayClose.addEventListener('click', closeDay);
  el.dialog.addEventListener('click', (event) => {
    if (event.target === el.dialog) closeDay();
  });
  el.dialog.addEventListener('close', () => document.documentElement.classList.remove('has-dialog'));
  el.dialog.addEventListener('keydown', (event) => {
    if (event.target.closest('.dd__chart svg')) return;
    if (event.key === 'ArrowRight' && event.altKey) moveDay(1);
    if (event.key === 'ArrowLeft' && event.altKey) moveDay(-1);
  });
}

export function setForecastContext(next) {
  Object.assign(ctx, next);
}

function updateScrollState() {
  const { scrollLeft, scrollWidth, clientWidth } = el.scroller;
  const canLeft = scrollLeft > 4;
  const canRight = scrollLeft + clientWidth < scrollWidth - 4;
  el.scroller.classList.toggle('can-left', canLeft);
  el.scroller.classList.toggle('can-right', canRight);
  el.prev.disabled = !canLeft;
  el.next.disabled = !canRight;
}

function buildHourItems(weather, now) {
  const start = currentHourIndex(weather.hourly, now);
  if (start < 0) return [];
  const hours = weather.hourly.slice(start, start + 25);
  const items = [];
  const events = [];
  weather.daily.forEach((day) => {
    if (!isNum(day.daylight) || day.daylight <= 0 || day.daylight >= 86340) return;
    if (isNum(day.sunrise)) events.push({ type: 'sunrise', time: day.sunrise });
    if (isNum(day.sunset)) events.push({ type: 'sunset', time: day.sunset });
  });
  hours.forEach((hour, i) => {
    items.push({ type: 'hour', hour, time: hour.time, temp: hour.temp, isNow: i === 0 });
    const next = hours[i + 1];
    if (!next) return;
    events
      .filter((event) => event.time > hour.time && event.time < next.time && event.time > now)
      .forEach((event) => {
        const k = (event.time - hour.time) / (next.time - hour.time);
        const temp = isNum(hour.temp) && isNum(next.temp) ? hour.temp + (next.temp - hour.temp) * k : hour.temp;
        items.push({ type: event.type, time: event.time, temp });
      });
  });
  return items;
}

export function renderHourly({ selectedTime: requested = null, animate = false } = {}) {
  const { weather, now, prefs } = ctx;
  if (!weather) return;
  hourItems = buildHourItems(weather, now);
  if (!hourItems.length) {
    el.track.innerHTML = '<p class="search__status">Hourly forecast unavailable.</p>';
    el.detail.innerHTML = '';
    el.meta.textContent = '';
    return;
  }
  const hourEntries = hourItems.filter((item) => item.type === 'hour');
  const validRequested = requested !== null && hourEntries.some((item) => item.time === requested);
  selectedTime = validRequested ? requested : hourEntries[0].time;

  const temps = hourItems.map((item) => item.temp).filter(isNum);
  let lo = Math.min(...temps);
  let hi = Math.max(...temps);
  if (hi - lo < 4) {
    const mid = (hi + lo) / 2;
    lo = mid - 2;
    hi = mid + 2;
  }

  const plotH = 90;
  const padTop = 34;
  const padBottom = 10;
  const yFor = (t) => (isNum(t) ? padTop + (1 - (t - lo) / (hi - lo)) * (plotH - padTop - padBottom) : plotH / 2);

  const html = hourItems.map((item, i) => {
    const y = yFor(item.temp).toFixed(1);
    if (item.type !== 'hour') {
      const label = item.type === 'sunrise' ? 'Sunrise' : 'Sunset';
      return `<li class="hour-item hour-item--sun" style="--i:${i};--y:${y}px">
        <div class="hour" role="presentation">
          <span class="hour__time">${formatTime(item.time)}</span>
          ${icon(item.type === 'sunrise' ? 'i-sunrise' : 'i-sunset', 'wi hour__icon')}
          <span class="hour__plot"><span class="hour__event">${label}</span></span>
          <span class="hour__pop"></span>
        </div>
      </li>`;
    }
    const h = item.hour;
    const info = getCodeInfo(h.code, h.cloud);
    const pop = isNum(h.pop) ? Math.round(h.pop) : null;
    const timeLabel = item.isNow ? 'Now' : formatHour(h.time);
    const aria = `${item.isNow ? 'Now' : `${dayLabel(h.time, now)} ${formatHour(h.time)}`}: ${info.label}, ${formatTemp(h.temp, prefs.unit)}${pop !== null ? `, ${pop}% chance of precipitation` : ''}`;
    return `<li class="hour-item" style="--i:${i};--y:${y}px">
      <button class="hour${item.isNow ? ' is-now' : ''}" type="button" data-time="${h.time}" aria-pressed="${h.time === selectedTime}" aria-label="${escapeHTML(aria)}">
        <span class="hour__time">${timeLabel}</span>
        <svg class="wi hour__icon" aria-hidden="true"><use href="#${iconFor(h.code, h.isDay !== false, h.cloud)}"></use></svg>
        <span class="hour__plot"><span class="hour__temp">${formatTemp(h.temp, prefs.unit)}</span></span>
        <span class="hour__pop${!pop ? ' is-zero' : ''}" style="--pop:${pop !== null ? pop / 100 : 0}"><span class="hour__pop-bar"></span>${pop !== null ? `${pop}%` : DASH}</span>
      </button>
    </li>`;
  }).join('');

  el.track.innerHTML = `<svg class="hourly__curve" aria-hidden="true"></svg><ol class="hourly__list">${html}</ol>`;
  el.track.classList.toggle('is-static', !animate);

  const firstItem = el.track.querySelector('.hour-item');
  const w = firstItem ? firstItem.getBoundingClientRect().width : 76;
  const width = w * hourItems.length;
  const points = hourItems.map((item, i) => [i * w + w / 2, yFor(item.temp)]);
  const path = smoothPath(points);
  const stops = hourItems
    .map((item, i) => (isNum(item.temp) ? `<stop offset="${((points[i][0] / width) * 100).toFixed(2)}%" stop-color="${tempColor(item.temp)}"/>` : ''))
    .join('');
  const dots = hourItems
    .map((item, i) => (item.type === 'hour' && isNum(item.temp)
      ? `<circle class="curve-dot${item.isNow ? ' is-now' : ''}" cx="${points[i][0].toFixed(1)}" cy="${points[i][1].toFixed(1)}" r="${item.isNow ? 4.2 : 3}"/>`
      : ''))
    .join('');
  const svg = el.track.querySelector('.hourly__curve');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(plotH));
  svg.setAttribute('viewBox', `0 0 ${width} ${plotH}`);
  svg.innerHTML = `<defs>
      <linearGradient id="hourly-stroke" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${width}" y2="0">${stops}</linearGradient>
      <linearGradient id="hourly-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>
    <path class="curve-area" d="${path}L${points[points.length - 1][0].toFixed(1)} ${plotH}L${points[0][0].toFixed(1)} ${plotH}Z" fill="url(#hourly-fill)"/>
    <path class="curve-line" d="${path}" stroke="url(#hourly-stroke)"/>
    ${dots}`;
  const line = svg.querySelector('.curve-line');
  if (line && line.getTotalLength) {
    try {
      svg.style.setProperty('--len', String(Math.ceil(line.getTotalLength())));
    } catch {
      svg.style.setProperty('--len', String(width * 2));
    }
  }
  el.track.style.setProperty('--plot-h', `${plotH}px`);

  const wet = hourEntries.find((item) => isNum(item.hour.pop) && item.hour.pop >= 50);
  el.meta.innerHTML = wet
    ? `${icon('i-umbrella')}<span>${wet.isNow ? 'Precipitation likely now' : `Precipitation likely from ${formatHour(wet.time)}`}</span>`
    : `<span>Low precipitation chance through ${formatHour(hourEntries[hourEntries.length - 1].time)}</span>`;

  renderHourDetail(false);
  requestAnimationFrame(updateScrollState);
}

function selectHour(time) {
  if (time === selectedTime) return;
  selectedTime = time;
  el.track.querySelectorAll('.hour[data-time]').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.time) === time));
  });
  renderHourDetail(true);
  if (handlers.onSelectHour) handlers.onSelectHour(time);
}

function renderHourDetail() {
  const { prefs, now } = ctx;
  const item = hourItems.find((entry) => entry.type === 'hour' && entry.time === selectedTime);
  if (!item) {
    el.detail.innerHTML = '';
    return;
  }
  const h = item.hour;
  const info = getCodeInfo(h.code, h.cloud);
  const vis = formatDistance(h.visibility, prefs.wind);
  const cell = (label, value) => `<div class="hour-detail__cell"><span class="label">${label}</span><strong>${value}</strong></div>`;
  const title = item.isNow ? `Now · ${formatHour(h.time)}` : `${dayLabel(h.time, now)} · ${formatHour(h.time)}`;
  el.detail.innerHTML = `<div class="hour-detail__card">
    <div class="hour-detail__head">
      <svg class="wi" aria-hidden="true"><use href="#${iconFor(h.code, h.isDay !== false, h.cloud)}"></use></svg>
      <div><p class="hour-detail__title">${escapeHTML(title)}</p><p class="hour-detail__sub">${escapeHTML(info.label)} · ${formatTemp(h.temp, prefs.unit)}</p></div>
    </div>
    ${cell('Feels like', formatTemp(h.feels, prefs.unit))}
    ${cell('Humidity', formatPercent(h.humidity))}
    ${cell('Wind', `${formatWind(h.wind, prefs.wind)}${isNum(h.windDir) ? ` ${compass(h.windDir)}` : ''}`)}
    ${cell('Rain chance', formatPercent(h.pop))}
    ${cell('Precipitation', formatPrecip(h.precip))}
    ${cell('Cloud cover', formatPercent(h.cloud))}
    ${cell('Visibility', vis.value === DASH ? DASH : `${vis.value} ${vis.unit}`)}
  </div>`;
}

export function renderDaily({ animate = false } = {}) {
  const { weather, now, prefs } = ctx;
  if (!weather) return;
  firstDay = Math.max(0, dayIndexFor(weather.daily, now));
  const days = weather.daily.slice(firstDay, firstDay + 7);
  if (!days.length) {
    el.week.innerHTML = '<li class="search__status">Daily forecast unavailable.</li>';
    return;
  }
  const mins = days.map((d) => d.min).filter(isNum);
  const maxs = days.map((d) => d.max).filter(isNum);
  const lo = mins.length ? Math.min(...mins) : 0;
  const hi = maxs.length ? Math.max(...maxs) : 1;
  const span = Math.max(1, hi - lo);
  const pct = (t) => `${(((t - lo) / span) * 100).toFixed(1)}%`;

  el.week.classList.toggle('is-static', !animate);
  el.week.innerHTML = days.map((day, i) => {
    const info = getCodeInfo(day.code);
    const name = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : formatWeekday(day.date, 'long');
    const pop = isNum(day.popMax) ? Math.round(day.popMax) : null;
    const hasRange = isNum(day.min) && isNum(day.max);
    const current = i === 0 && hasRange && isNum(weather.current.temp)
      ? `<span class="day__now" style="--now:${pct(Math.min(day.max, Math.max(day.min, weather.current.temp)))}"></span>` : '';
    const aria = `${name}, ${formatDate(day.date, 'long')}: ${info.label}. High ${formatTemp(day.max, prefs.unit)}, low ${formatTemp(day.min, prefs.unit)}${pop !== null ? `, ${pop}% chance of precipitation` : ''}. Open details.`;
    return `<li style="--i:${i}">
      <button class="day" type="button" data-index="${firstDay + i}" aria-label="${escapeHTML(aria)}" aria-haspopup="dialog">
        <span class="day__when"><span class="day__name">${escapeHTML(i < 2 ? name : formatWeekday(day.date, 'short'))}</span><span class="day__date">${formatDate(day.date)}</span></span>
        <svg class="wi day__icon" aria-hidden="true"><use href="#${iconFor(day.code, true)}"></use></svg>
        <span class="day__cond">${escapeHTML(info.short)}</span>
        <span class="day__pop${pop === null || pop < 20 ? ' is-low' : ''}">${icon('i-drop')}${pop !== null ? `${pop}%` : DASH}</span>
        <span class="day__lo">${formatTemp(day.min, prefs.unit)}</span>
        <span class="day__range" aria-hidden="true">${hasRange ? `<span class="day__bar" style="--from:${pct(day.min)};--to:${pct(day.max)};--c1:${tempColor(day.min)};--c2:${tempColor(day.max)}"></span>` : ''}${current}</span>
        <span class="day__hi">${formatTemp(day.max, prefs.unit)}</span>
      </button>
    </li>`;
  }).join('');

  if (el.dialog.open) renderDay();
}

export function openDay(index) {
  if (!ctx.weather) return;
  dayIndex = index;
  renderDay();
  if (!el.dialog.open) {
    if (typeof el.dialog.showModal === 'function') el.dialog.showModal();
    else el.dialog.setAttribute('open', '');
    document.documentElement.classList.add('has-dialog');
  }
}

export function closeDay() {
  if (!el.dialog || !el.dialog.open) return;
  if (typeof el.dialog.close === 'function') el.dialog.close();
  else el.dialog.removeAttribute('open');
  document.documentElement.classList.remove('has-dialog');
}

function moveDay(delta) {
  const last = Math.min(ctx.weather.daily.length - 1, firstDay + 6);
  const next = Math.min(last, Math.max(firstDay, dayIndex + delta));
  if (next === dayIndex) return;
  dayIndex = next;
  renderDay();
}

function renderDay() {
  const { weather, prefs, now } = ctx;
  const day = weather.daily[dayIndex];
  if (!day) return;
  const info = getCodeInfo(day.code);
  const last = Math.min(weather.daily.length - 1, firstDay + 6);
  el.dayPrev.disabled = dayIndex <= firstDay;
  el.dayNext.disabled = dayIndex >= last;
  const name = dayLabel(day.date, now);
  const summary = daySummary(weather, dayIndex, prefs);
  chartHours = hoursForDay(weather.hourly, day.date);
  const polar = isNum(day.daylight) && (day.daylight <= 0 || day.daylight >= 86340);
  const stat = (label, value, sub = '') => `<div class="dd__stat"><span class="label">${label}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;

  const rows = chartHours.map((h) => `<tr><td>${formatHour(h.time)}</td><td>${escapeHTML(getCodeInfo(h.code, h.cloud).short)}</td><td>${formatTemp(h.temp, prefs.unit)}</td><td>${formatPercent(h.pop)}</td><td>${formatPrecip(h.precip)}</td><td>${formatWind(h.wind, prefs.wind)}</td><td>${formatPercent(h.humidity)}</td></tr>`).join('');

  el.dialogBody.innerHTML = `
    <header class="dd__head">
      <p class="label">${escapeHTML(name)}${ctx.place ? ` · ${escapeHTML(ctx.place.name)}` : ''}</p>
      <h2 class="dd__title" id="day-dialog-title">${formatWeekday(day.date, 'long')}, ${formatDate(day.date, 'long')}</h2>
      <p class="dd__cond"><svg class="wi" aria-hidden="true"><use href="#${iconFor(day.code, true)}"></use></svg>${escapeHTML(info.label)}</p>
    </header>
    ${summary ? `<p class="dd__summary"><span class="src src--calc">Calculated</span>${escapeHTML(summary)}</p>` : ''}
    <div class="dd__chart">${chartHours.length ? chartSvg(chartHours, prefs) : '<p class="dd__summary">Hourly data isn’t available for this day.</p>'}</div>
    ${chartHours.length ? '<div class="dd__legend"><span><i></i>Temperature</span><span><i class="is-bar"></i>Chance of precipitation</span><span>Use ← → on the chart to inspect each hour</span></div>' : ''}
    <div class="dd__stats">
      ${stat('High', formatTemp(day.max, prefs.unit))}
      ${stat('Low', formatTemp(day.min, prefs.unit))}
      ${stat('Precipitation', formatPercent(day.popMax), isNum(day.precipSum) ? `${formatPrecip(day.precipSum)} total` : '')}
      ${stat('Max wind', formatWind(day.windMax, prefs.wind), isNum(day.windDir) ? `from ${compass(day.windDir)}` : '')}
      ${stat('UV max', isNum(day.uvMax) ? String(Math.round(day.uvMax)) : DASH, isNum(day.uvMax) ? uvCategory(day.uvMax).label : '')}
      ${stat('Sunrise', polar ? DASH : formatTime(day.sunrise))}
      ${stat('Sunset', polar ? DASH : formatTime(day.sunset))}
      ${stat('Daylight', isNum(day.daylight) ? formatDuration(day.daylight * 1000, { short: true }) : DASH)}
    </div>
    ${chartHours.length ? `<details class="dd__table"><summary>Hour-by-hour table</summary><div class="dd__table-wrap"><table>
      <thead><tr><th scope="col">Time</th><th scope="col">Sky</th><th scope="col">Temp</th><th scope="col">Chance</th><th scope="col">Amount</th><th scope="col">Wind</th><th scope="col">Humidity</th></tr></thead>
      <tbody>${rows}</tbody></table></div></details>` : ''}`;

  const svg = el.dialogBody.querySelector('.dd__chart svg');
  if (svg) bindChart(svg);
}

const CHART = { w: 640, h: 232, left: 34, right: 618, top: 26, bottom: 128, barTop: 150, barBottom: 196 };

function chartGeometry(hours) {
  const temps = hours.map((h) => h.temp).filter(isNum);
  let lo = Math.min(...temps);
  let hi = Math.max(...temps);
  if (!temps.length) {
    lo = 0;
    hi = 1;
  }
  if (hi - lo < 4) {
    const mid = (hi + lo) / 2;
    lo = mid - 2;
    hi = mid + 2;
  }
  const n = Math.max(1, hours.length - 1);
  const x = (i) => CHART.left + ((CHART.right - CHART.left) * i) / n;
  const y = (t) => CHART.bottom - ((t - lo) / (hi - lo)) * (CHART.bottom - CHART.top);
  return { lo, hi, x, y };
}

function chartSvg(hours, prefs) {
  const { lo, hi, x, y } = chartGeometry(hours);
  const points = hours.map((h, i) => [x(i), isNum(h.temp) ? y(h.temp) : y((lo + hi) / 2)]);
  const line = smoothPath(points);
  const stops = hours.map((h, i) => `<stop offset="${(((x(i) - CHART.left) / (CHART.right - CHART.left)) * 100).toFixed(1)}%" stop-color="${tempColor(h.temp)}"/>`).join('');
  const barW = Math.max(4, ((CHART.right - CHART.left) / hours.length) * 0.56);
  const bars = hours.map((h, i) => {
    const pop = isNum(h.pop) ? h.pop : 0;
    const height = ((CHART.barBottom - CHART.barTop) * pop) / 100;
    return `<rect class="chart-bar" x="${(x(i) - barW / 2).toFixed(1)}" y="${(CHART.barBottom - height).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0.5, height).toFixed(1)}" rx="2"/>`;
  }).join('');
  const labels = hours.map((h, i) => (i % 3 === 0 ? `<text class="chart-label" x="${x(i).toFixed(1)}" y="218" text-anchor="middle">${formatHour(h.time)}</text>` : '')).join('');
  const maxIndex = hours.reduce((best, h, i) => (isNum(h.temp) && (best < 0 || h.temp > hours[best].temp) ? i : best), -1);
  const minIndex = hours.reduce((best, h, i) => (isNum(h.temp) && (best < 0 || h.temp < hours[best].temp) ? i : best), -1);
  const extreme = (i, above) => (i < 0 ? '' : `<text class="chart-value" x="${points[i][0].toFixed(1)}" y="${(points[i][1] + (above ? -10 : 18)).toFixed(1)}" text-anchor="middle">${formatTemp(hours[i].temp, prefs.unit)}</text>`);
  const summary = `Temperature from ${formatTemp(hours[minIndex]?.temp, prefs.unit)} to ${formatTemp(hours[maxIndex]?.temp, prefs.unit)}.`;

  return `<svg viewBox="0 0 ${CHART.w} ${CHART.h}" role="img" tabindex="0" aria-label="Hourly temperature and precipitation chart. ${escapeHTML(summary)} Use the left and right arrow keys to read each hour.">
    <defs>
      <linearGradient id="dd-stroke" gradientUnits="userSpaceOnUse" x1="${CHART.left}" x2="${CHART.right}" y1="0" y2="0">${stops}</linearGradient>
      <linearGradient id="dd-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>
    <line class="chart-grid" x1="${CHART.left}" x2="${CHART.right}" y1="${CHART.bottom}" y2="${CHART.bottom}"/>
    <line class="chart-grid" x1="${CHART.left}" x2="${CHART.right}" y1="${CHART.barBottom}" y2="${CHART.barBottom}"/>
    <text class="chart-label" x="0" y="${CHART.barTop + 8}">100%</text>
    <text class="chart-label" x="0" y="${CHART.barBottom}">0%</text>
    <path class="chart-area" d="${line}L${CHART.right} ${CHART.bottom}L${CHART.left} ${CHART.bottom}Z" fill="url(#dd-fill)"/>
    <path class="chart-line" d="${line}" stroke="url(#dd-stroke)"/>
    ${bars}
    ${labels}
    ${extreme(maxIndex, true)}
    ${minIndex !== maxIndex ? extreme(minIndex, false) : ''}
    <g class="chart-cursor" visibility="hidden">
      <line y1="${CHART.top - 10}" y2="${CHART.barBottom}"/>
      <circle r="4.5"/>
      <rect height="40" rx="8" width="128"/>
      <text class="cursor-a"></text>
      <text class="cursor-b" style="font-weight:500"></text>
    </g>
    <rect class="chart-hit" x="${CHART.left - 12}" y="0" width="${CHART.right - CHART.left + 24}" height="${CHART.h}" fill="transparent"/>
  </svg>`;
}

function bindChart(svg) {
  const { x, y, lo, hi } = chartGeometry(chartHours);
  const cursor = svg.querySelector('.chart-cursor');
  const hit = svg.querySelector('.chart-hit');
  chartCursor = -1;

  const show = (index) => {
    const h = chartHours[index];
    if (!h) return;
    chartCursor = index;
    const cx = x(index);
    const cy = isNum(h.temp) ? y(h.temp) : y((lo + hi) / 2);
    cursor.setAttribute('visibility', 'visible');
    const line = cursor.querySelector('line');
    line.setAttribute('x1', cx);
    line.setAttribute('x2', cx);
    const dot = cursor.querySelector('circle');
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', cy);
    const boxX = Math.min(CHART.w - 132, Math.max(2, cx - 64));
    const rect = cursor.querySelector('rect');
    rect.setAttribute('x', boxX);
    rect.setAttribute('y', 0);
    const a = cursor.querySelector('.cursor-a');
    const b = cursor.querySelector('.cursor-b');
    a.setAttribute('x', boxX + 10);
    a.setAttribute('y', 16);
    b.setAttribute('x', boxX + 10);
    b.setAttribute('y', 32);
    a.textContent = `${formatHour(h.time)} · ${formatTemp(h.temp, ctx.prefs.unit)}`;
    b.textContent = `${isNum(h.pop) ? `${Math.round(h.pop)}% chance` : 'No data'} · ${getCodeInfo(h.code, h.cloud).short}`;
    svg.setAttribute('aria-valuetext', `${formatHour(h.time)}: ${formatTemp(h.temp, ctx.prefs.unit)}, ${getCodeInfo(h.code, h.cloud).label}, ${isNum(h.pop) ? `${Math.round(h.pop)}% chance of precipitation` : 'precipitation chance unavailable'}`);
  };

  const fromEvent = (event) => {
    const box = svg.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * CHART.w;
    const n = Math.max(1, chartHours.length - 1);
    return Math.round(((px - CHART.left) / (CHART.right - CHART.left)) * n);
  };

  hit.addEventListener('pointermove', (event) => show(Math.min(chartHours.length - 1, Math.max(0, fromEvent(event)))));
  hit.addEventListener('pointerdown', (event) => show(Math.min(chartHours.length - 1, Math.max(0, fromEvent(event)))));
  svg.addEventListener('pointerleave', () => {
    if (document.activeElement !== svg) cursor.setAttribute('visibility', 'hidden');
  });
  svg.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let index = chartCursor < 0 ? currentChartStart() : chartCursor;
    if (event.key === 'ArrowLeft') index -= 1;
    if (event.key === 'ArrowRight') index += 1;
    if (event.key === 'Home') index = 0;
    if (event.key === 'End') index = chartHours.length - 1;
    show(Math.min(chartHours.length - 1, Math.max(0, index)));
    const live = document.getElementById('sr-live');
    if (live) live.textContent = svg.getAttribute('aria-valuetext');
  });
  svg.addEventListener('blur', () => cursor.setAttribute('visibility', 'hidden'));
}

function currentChartStart() {
  const index = chartHours.findIndex((h) => h.time <= ctx.now && ctx.now < h.time + HOUR_MS);
  return index >= 0 ? index : 0;
}
