import { $, $$, escapeHTML, icon, motionAllowed, tween } from './dom.js';
import {
  DASH, compass, formatClock, formatCoords, formatDistance, formatDuration, formatPercent, formatPrecip, formatRelative,
  formatTemp, formatTime, formatUtcOffset, formatWind, isNum, nowWall, toUnitTemp, windUnitLabel, windValue,
} from './format.js';
import { getCodeInfo, iconFor } from './weather-codes.js';
import { dayIndexFor, moonPhase, sunState } from './astro.js';
import {
  aqiCategory, beaufort, cloudLabel, comfort, currentHourIndex, describeNow, heroInsight, pressureLabel, pressureTrend,
  rainOutlook, todaySummary, uvCategory, uvWindow, visibilityLabel,
} from './insights.js';
import { paletteSwatch } from './scene-mapper.js';
import { placeKey } from './storage.js';

const el = {};
let handlers = {};
let heroTempValue = null;
let heroTempCancel = () => {};
let sunAnimation = 0;
let bannerAction = null;
let lastSunKey = '';
const openTiles = new Set();

export function initUI(callbacks) {
  handlers = callbacks;
  Object.assign(el, {
    root: document.documentElement,
    body: document.body,
    topbar: $('#topbar'),
    progress: $('#progress'),
    views: { welcome: $('#view-welcome'), error: $('#view-error'), dashboard: $('#view-dashboard') },
    welcomeLocate: $('#welcome-locate'),
    welcomeSearch: $('#welcome-search'),
    welcomeNotice: $('#welcome-notice'),
    welcomeQuick: $('#welcome-quick'),
    welcomeSaved: $('#welcome-saved'),
    welcomeSavedList: $('#welcome-saved-list'),
    errorTitle: $('#error-title'),
    errorMessage: $('#error-message'),
    errorDetail: $('#error-detail'),
    errorRetry: $('#error-retry'),
    errorSearch: $('#error-search'),
    errorBack: $('#error-back'),
    dashboard: $('#view-dashboard'),
    heroSource: $('#hero-source'),
    heroCity: $('#hero-city'),
    heroFav: $('#hero-fav'),
    heroRegion: $('#hero-region'),
    heroClock: $('#hero-clock'),
    heroTz: $('#hero-tz'),
    heroTemp: $('#hero-temp'),
    heroUnit: $('#hero-unit'),
    heroIcon: $('#hero-icon'),
    heroCondition: $('#hero-condition'),
    heroDesc: $('#hero-desc'),
    heroFeels: $('#hero-feels'),
    heroHigh: $('#hero-high'),
    heroLow: $('#hero-low'),
    heroInsight: $('#hero-insight'),
    heroObserved: $('#hero-observed'),
    heroUpdated: $('#hero-updated'),
    heroDot: $('#hero-dot'),
    heroRefresh: $('#hero-refresh'),
    refreshBtn: $('#refresh-btn'),
    locateBtn: $('#locate-btn'),
    sunSvg: $('#sun-svg'),
    sunRise: $('#sun-rise'),
    sunSet: $('#sun-set'),
    sunDaylight: $('#sun-daylight'),
    sunStatus: $('#sun-status'),
    sunMeta: $('#sun-meta'),
    moonInfo: $('#moon-info'),
    conditionsGrid: $('#conditions-grid'),
    conditionsMeta: $('#conditions-meta'),
    insightsList: $('#insights-list'),
    aqi: $('#aqi-card'),
    placesBody: $('#places-body'),
    placesMeta: $('#places-meta'),
    footerMeta: $('#footer-meta'),
    banner: $('#banner'),
    bannerText: $('#banner-text'),
    bannerAction: $('#banner-action'),
    bannerClose: $('#banner-close'),
    toasts: $('#toasts'),
    live: $('#sr-live'),
    settingsBtn: $('#settings-btn'),
    settingsPanel: $('#settings-panel'),
    themeColor: document.querySelector('meta[name="theme-color"]'),
  });

  el.welcomeLocate.addEventListener('click', () => handlers.onLocate());
  el.welcomeSearch.addEventListener('click', () => handlers.onFocusSearch());
  el.locateBtn.addEventListener('click', () => handlers.onLocate());
  el.refreshBtn.addEventListener('click', () => handlers.onRefresh());
  el.heroRefresh.addEventListener('click', () => handlers.onRefresh());
  el.heroUnit.addEventListener('click', () => handlers.onUnit(el.heroUnit.dataset.next || 'f'));
  el.heroFav.addEventListener('click', () => handlers.onToggleFavorite());
  el.heroSource.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="locate"]')) handlers.onLocate();
  });
  el.errorRetry.addEventListener('click', () => handlers.onRetry());
  el.errorSearch.addEventListener('click', () => handlers.onFocusSearch());
  el.errorBack.addEventListener('click', () => handlers.onBack());
  el.bannerClose.addEventListener('click', () => {
    hideBanner();
    if (handlers.onBannerDismiss) handlers.onBannerDismiss();
  });
  el.bannerAction.addEventListener('click', () => {
    if (bannerAction) bannerAction();
  });

  el.welcomeQuick.addEventListener('click', onChipClick);
  el.welcomeSavedList.addEventListener('click', onChipClick);
  el.placesBody.addEventListener('click', onPlacesClick);

  el.conditionsGrid.addEventListener('click', (event) => {
    const button = event.target.closest('.tile__info');
    if (!button) return;
    const id = button.dataset.tile;
    const more = document.getElementById(`tile-more-${id}`);
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    if (more) more.hidden = !open;
    if (open) openTiles.add(id);
    else openTiles.delete(id);
  });

  initSettings();
  initTopbar();
  initReveal();
}

function onChipClick(event) {
  const chip = event.target.closest('[data-place]');
  if (!chip) return;
  try {
    handlers.onSelectPlace(JSON.parse(chip.dataset.place));
  } catch {
    return;
  }
}

function onPlacesClick(event) {
  const remove = event.target.closest('[data-remove]');
  if (remove) {
    handlers.onRemoveFavorite(remove.dataset.remove);
    return;
  }
  const chip = event.target.closest('[data-place]');
  if (!chip) return;
  try {
    handlers.onSelectPlace(JSON.parse(chip.dataset.place));
  } catch {
    return;
  }
}

function initSettings() {
  const close = (returnFocus = true) => {
    if (el.settingsPanel.hidden) return;
    el.settingsPanel.hidden = true;
    el.settingsBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) el.settingsBtn.focus();
  };
  el.settingsBtn.addEventListener('click', () => {
    const open = el.settingsPanel.hidden;
    if (!open) {
      close(false);
      return;
    }
    if (handlers.onSettingsOpen) handlers.onSettingsOpen();
    el.settingsPanel.hidden = false;
    el.settingsBtn.setAttribute('aria-expanded', 'true');
    const checked = el.settingsPanel.querySelector('input:checked');
    if (checked) checked.focus({ preventScroll: true });
  });
  el.settingsPanel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (el.settingsPanel.hidden) return;
    if (el.settingsPanel.contains(event.target) || el.settingsBtn.contains(event.target)) return;
    close(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !el.settingsPanel.hidden) close();
  });
  el.settingsPanel.addEventListener('change', (event) => {
    const input = event.target;
    if (input.name === 'unit') handlers.onUnit(input.value);
    if (input.name === 'wind') handlers.onWindUnit(input.value);
    if (input.name === 'theme') handlers.onTheme(input.value);
    if (input.name === 'motion') handlers.onMotion(input.value);
    if (input.id === 'scene-preview') handlers.onPreview(input.value);
  });
  $('#clear-data').addEventListener('click', () => {
    close(false);
    handlers.onClearData();
  });
  $$('input[name="unit-h"]').forEach((input) => input.addEventListener('change', () => handlers.onUnit(input.value)));
}

export function closeSettings() {
  el.settingsPanel.hidden = true;
  el.settingsBtn.setAttribute('aria-expanded', 'false');
}

function initTopbar() {
  let ticking = false;
  const update = () => {
    ticking = false;
    el.topbar.classList.toggle('is-solid', window.scrollY > 24);
  };
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
}

let revealObserver = null;

function initReveal() {
  const items = $$('.reveal');
  if (!('IntersectionObserver' in window) || !motionAllowed()) {
    items.forEach((item) => item.classList.add('is-in'));
    return;
  }
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      revealObserver.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  items.forEach((item) => revealObserver.observe(item));
}

export function revealAll() {
  $$('.reveal').forEach((item) => item.classList.add('is-in'));
}

export function syncPrefs(prefs) {
  $$(`input[name="unit"][value="${prefs.unit}"], input[name="unit-h"][value="${prefs.unit}"], input[name="wind"][value="${prefs.wind}"], input[name="theme"][value="${prefs.theme}"]`)
    .forEach((input) => {
      input.checked = true;
    });
  const motion = $(`input[name="motion"][value="${prefs.motionEffective}"]`);
  if (motion) motion.checked = true;
  el.heroUnit.textContent = prefs.unit === 'f' ? '°F' : '°C';
  el.heroUnit.dataset.next = prefs.unit === 'f' ? 'c' : 'f';
  el.heroUnit.setAttribute('aria-label', prefs.unit === 'f' ? 'Switch to Celsius' : 'Switch to Fahrenheit');
}

export function fillPreviewOptions(scenes) {
  const select = $('#scene-preview');
  scenes.forEach((scene) => {
    const option = document.createElement('option');
    option.value = scene.id;
    option.textContent = scene.label;
    select.append(option);
  });
}

export function setPreviewValue(value) {
  $('#scene-preview').value = value || '';
}

export function showView(name) {
  Object.entries(el.views).forEach(([key, view]) => {
    view.hidden = key !== name;
  });
  el.body.classList.toggle('view-welcome-active', name === 'welcome');
  el.body.classList.toggle('view-error-active', name === 'error');
  el.body.classList.toggle('view-dashboard-active', name === 'dashboard');
}

export function isErrorView() {
  return !el.views.error.hidden;
}

export function applyScenePalette(palette) {
  const hex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
  const { style } = document.documentElement;
  style.setProperty('--scene-deep', hex(palette.deep));
  style.setProperty('--scene-mid', hex(palette.mid));
  style.setProperty('--scene-accent', hex(palette.accent));
  style.setProperty('--scene-top', hex(palette.top));
  const lum = (rgb) => (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  const brightness = (lum(palette.mid) + lum(palette.bottom)) / 2;
  style.setProperty('--hero-scrim', (0.22 + Math.max(0, brightness - 0.25) * 0.75).toFixed(3));
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', hex(palette.top));
}

let flashFrame = 0;
let pendingFlash = 0;

export function setFlash(level) {
  pendingFlash = level;
  if (flashFrame) return;
  flashFrame = requestAnimationFrame(() => {
    flashFrame = 0;
    document.documentElement.style.setProperty('--flash', pendingFlash.toFixed(3));
  });
}

export function setProgress(active) {
  el.progress.classList.toggle('is-active', active);
}

export function setRefreshing(active) {
  [el.refreshBtn, el.heroRefresh].forEach((button) => {
    button.classList.toggle('is-busy', active);
    button.disabled = active;
  });
  setProgress(active);
}

export function enableRefresh(enabled) {
  el.refreshBtn.disabled = !enabled;
}

export function setLocating(active) {
  el.locateBtn.classList.toggle('is-busy', active);
  el.locateBtn.disabled = active;
  el.welcomeLocate.classList.toggle('is-busy', active);
  el.welcomeLocate.disabled = active;
  const label = el.welcomeLocate.querySelector('span');
  if (label) label.textContent = active ? 'Finding your location…' : 'Use my current location';
  if (active) setProgress(true);
}

const chip = (place, iconId = 'i-pin') => `<li><button class="chip" type="button" data-place="${escapeHTML(JSON.stringify(place))}">${icon(iconId)}<span>${escapeHTML(place.name)}</span></button></li>`;

export function renderWelcome({ popular, recents }) {
  el.welcomeQuick.innerHTML = popular.map((place) => chip(place)).join('');
  el.welcomeSaved.hidden = !recents.length;
  el.welcomeSavedList.innerHTML = recents.map((place) => chip(place, place.source === 'geo' ? 'i-geo' : 'i-clock')).join('');
}

export function showWelcomeNotice(info, { focusSearch = false } = {}) {
  if (!info) {
    el.welcomeNotice.hidden = true;
    el.welcomeNotice.innerHTML = '';
    return;
  }
  el.welcomeNotice.innerHTML = `${icon('i-alert')}<div><strong>${escapeHTML(info.title)}</strong><p>${escapeHTML(info.message)}</p></div>`;
  el.welcomeNotice.hidden = false;
  if (focusSearch && handlers.onFocusSearch) handlers.onFocusSearch();
}

export function showError({ title, message, detail = '', backLabel = '' }) {
  el.errorTitle.textContent = title;
  el.errorMessage.textContent = message;
  el.errorDetail.textContent = detail;
  el.errorBack.hidden = !backLabel;
  el.errorBack.textContent = backLabel;
  showView('error');
}

const LOADER = '<span class="loader" role="status"><svg viewBox="0 0 56 32" aria-hidden="true"><path d="M2 10c6-5 12-5 18 0s12 5 18 0 12-5 16-2"/><path d="M2 17c6-5 12-5 18 0s12 5 18 0 12-5 16-2"/><path d="M2 24c6-5 12-5 18 0s12 5 18 0 12-5 16-2"/></svg><span></span></span>';

export function showLoading(place, { switching }) {
  if (switching) {
    el.dashboard.classList.add('is-switching');
    setProgress(true);
    return;
  }
  el.dashboard.classList.remove('is-switching');
  showView('dashboard');
  el.heroCity.textContent = place.name;
  el.heroRegion.textContent = [place.admin1 && place.admin1 !== place.name ? place.admin1 : '', place.country].filter(Boolean).join(', ') || formatCoords(place.lat, place.lon);
  el.heroSource.innerHTML = sourceHtml(place);
  el.heroClock.textContent = '';
  el.heroTz.textContent = '';
  el.heroTemp.innerHTML = '<span class="sk sk--temp"></span>';
  heroTempValue = null;
  el.heroCondition.textContent = 'Reading the sky…';
  el.heroDesc.innerHTML = LOADER;
  el.heroDesc.querySelector('.loader > span').textContent = `Fetching live conditions for ${place.name}`;
  ['heroFeels', 'heroHigh', 'heroLow'].forEach((key) => {
    el[key].textContent = DASH;
  });
  el.heroInsight.hidden = true;
  el.heroObserved.textContent = 'Connecting to Open-Meteo';
  el.heroUpdated.textContent = '';
  el.heroFav.hidden = true;
  setProgress(true);

  $('#hourly-track').innerHTML = Array.from({ length: 10 }, () => '<div class="sk-hour"><span class="sk sk--line" style="width:34px"></span><span class="sk" style="width:30px;height:30px;border-radius:50%"></span><span class="sk sk--line" style="width:30px;margin-top:22px"></span><span class="sk sk--line" style="width:36px;height:6px;margin-top:24px"></span></div>').join('');
  $('#hour-detail').innerHTML = '';
  $('#week-list').innerHTML = Array.from({ length: 7 }, () => '<li style="padding:14px 10px"><span class="sk sk--line"></span></li>').join('');
  el.conditionsGrid.innerHTML = Array.from({ length: 8 }, (_, i) => `<div class="sk-tile${i === 0 ? ' tile--wide' : ''}"><span class="sk sk--line" style="width:40%"></span><span class="sk sk--title"></span><span class="sk sk--line" style="width:70%"></span></div>`).join('');
  el.insightsList.innerHTML = '';
  el.aqi.innerHTML = '<span class="sk sk--title" style="grid-column:1/-1"></span>';
  el.sunSvg.innerHTML = '';
  el.sunStatus.textContent = '';
  el.moonInfo.innerHTML = '';
}

export function endLoading() {
  el.dashboard.classList.remove('is-switching');
  setProgress(false);
  el.heroFav.hidden = false;
}

export function playEntrance() {
  if (!motionAllowed()) return;
  el.dashboard.classList.remove('is-entering');
  void el.dashboard.offsetWidth;
  el.dashboard.classList.add('is-entering');
  setTimeout(() => el.dashboard.classList.remove('is-entering'), 1400);
}

const minus = (n) => (n < 0 ? `−${Math.abs(n)}` : String(n));

function sourceHtml(place) {
  if (place.source === 'geo') return `${icon('i-geo')}<span>Your current location</span>`;
  if (place.source === 'default') {
    return `${icon('i-pin')}<span>Default city for your time zone</span><button class="source-btn" type="button" data-action="locate">${icon('i-locate')}<span>Use my location</span></button>`;
  }
  return `${icon('i-pin')}<span>${escapeHTML(formatCoords(place.lat, place.lon))}</span>`;
}

function regionText(place) {
  return [place.admin1 && place.admin1 !== place.name ? place.admin1 : '', place.country].filter(Boolean).join(', ') || formatCoords(place.lat, place.lon);
}

export function renderHero({ place, weather, now, prefs, isFav, fetchedAt, stale }) {
  const c = weather.current;
  const info = getCodeInfo(c.code, c.cloud);
  el.heroCity.textContent = place.name;
  el.heroRegion.textContent = regionText(place);
  el.heroSource.innerHTML = sourceHtml(place);
  renderClock(weather);

  const target = toUnitTemp(c.temp, prefs.unit);
  heroTempCancel();
  if (target === null) {
    el.heroTemp.textContent = DASH;
    heroTempValue = null;
  } else {
    const from = heroTempValue === null ? target : heroTempValue;
    heroTempCancel = tween(from, target, 700, (value) => {
      el.heroTemp.textContent = minus(Math.round(value));
    });
    heroTempValue = target;
  }

  el.heroIcon.setAttribute('href', `#${iconFor(c.code, c.isDay !== false, c.cloud)}`);
  el.heroCondition.textContent = info.label;
  el.heroDesc.textContent = describeNow(weather, prefs);

  const todayIndex = dayIndexFor(weather.daily, now);
  const today = todayIndex >= 0 ? weather.daily[todayIndex] : null;
  el.heroFeels.textContent = formatTemp(c.feels, prefs.unit);
  el.heroHigh.textContent = today ? formatTemp(today.max, prefs.unit) : DASH;
  el.heroLow.textContent = today ? formatTemp(today.min, prefs.unit) : DASH;

  const insight = heroInsight(weather, now, prefs);
  el.heroInsight.hidden = !insight;
  if (insight) {
    el.heroInsight.innerHTML = `${icon('i-sparkle')}<span>${escapeHTML(insight)} <span class="visually-hidden">(calculated from the hourly forecast)</span></span>`;
    el.heroInsight.title = 'Calculated by ATMOS from the Open-Meteo hourly forecast';
  }

  el.heroFav.setAttribute('aria-pressed', String(isFav));
  el.heroFav.setAttribute('aria-label', isFav ? `Remove ${place.name} from your places` : `Save ${place.name} to your places`);
  el.heroFav.title = isFav ? 'Saved to your places' : 'Save to your places';

  el.heroObserved.textContent = isNum(c.time) ? `Observed ${formatTime(c.time)} local time` : 'Observation time unavailable';
  updateFreshness(fetchedAt, stale);
}

export function renderClock(weather) {
  const now = nowWall(weather.timezone, weather.utcOffset);
  el.heroClock.textContent = formatClock(now);
  const zone = weather.timezone ? weather.timezone.replace(/_/g, ' ') : '';
  el.heroTz.textContent = [zone, formatUtcOffset(weather.utcOffset)].filter(Boolean).join(' · ');
}

export function updateFreshness(fetchedAt, stale) {
  el.heroUpdated.textContent = `${stale ? 'Saved' : 'Updated'} ${formatRelative(fetchedAt)}`;
  el.heroUpdated.title = `Fetched at ${new Date(fetchedAt).toLocaleString()}`;
  el.heroDot.classList.toggle('is-stale', Boolean(stale));
}

const compassTicks = (() => {
  let ticks = '';
  for (let i = 0; i < 32; i += 1) {
    const angle = (i / 32) * Math.PI * 2;
    const major = i % 8 === 0;
    const r1 = major ? 50 : 53;
    const x1 = 66 + Math.sin(angle) * r1;
    const y1 = 66 - Math.cos(angle) * r1;
    const x2 = 66 + Math.sin(angle) * 57;
    const y2 = 66 - Math.cos(angle) * 57;
    ticks += `<line class="compass-tick" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="${major ? 1.6 : 1}"/>`;
  }
  return ticks;
})();

function compassSvg(dir, speed, unit) {
  const rotation = isNum(dir) ? (dir + 180) % 360 : 0;
  const label = isNum(speed) ? windValue(speed, unit) : DASH;
  return `<svg class="compass" viewBox="0 0 132 132" aria-hidden="true">
    <circle class="compass-ring" cx="66" cy="66" r="57"/>
    ${compassTicks}
    <text x="66" y="21">N</text><text x="111" y="66">E</text><text x="66" y="111">S</text><text x="21" y="66">W</text>
    ${isNum(dir) ? `<g class="compass-arrow" style="--rot:${rotation}deg"><path d="M66 6 73.5 24 66 20 58.5 24Z"/><path d="M64.6 20h2.8v14h-2.8z"/><path d="M64.6 98h2.8v12h-2.8z"/><circle cx="66" cy="112" r="4.5"/></g>` : ''}
    <text class="compass-speed" x="66" y="62">${escapeHTML(String(label))}</text>
    <text class="compass-unit" x="66" y="78">${escapeHTML(windUnitLabel(unit))}</text>
  </svg>`;
}

function ringSvg(percent) {
  const r = 34;
  const len = 2 * Math.PI * r;
  const off = len * (1 - Math.min(1, Math.max(0, (percent || 0) / 100)));
  return `<svg class="ring" viewBox="0 0 84 84" aria-hidden="true"><circle class="ring-bg" cx="42" cy="42" r="${r}"/><circle class="ring-fg" cx="42" cy="42" r="${r}" stroke-dasharray="${len.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" style="--len:${len.toFixed(2)}"/></svg>`;
}

function gaugeSvg(hpa) {
  const min = 960;
  const max = 1050;
  const t = isNum(hpa) ? Math.min(1, Math.max(0, (hpa - min) / (max - min))) : 0;
  const len = Math.PI * 46;
  const off = len * (1 - t);
  const angle = Math.PI * (1 - t);
  const nx = 56 + Math.cos(angle) * 46;
  const ny = 56 - Math.sin(angle) * 46;
  return `<svg class="gauge" viewBox="0 0 112 66" aria-hidden="true">
    <path class="gauge-bg" d="M10 56a46 46 0 0 1 92 0"/>
    <path class="gauge-fg" d="M10 56a46 46 0 0 1 92 0" stroke-dasharray="${len.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" style="--len:${len.toFixed(2)}"/>
    ${isNum(hpa) ? `<circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="5" fill="var(--ink)"/>` : ''}
    <text x="4" y="66">${min}</text><text x="88" y="66">${max}</text>
  </svg>`;
}

function tile({ id, iconId, title, wide = false, body, note, more }) {
  const open = openTiles.has(id);
  return `<article class="tile${wide ? ' tile--wide' : ''}" aria-labelledby="tile-title-${id}">
    <header class="tile__head">${icon(iconId)}<h3 class="tile__title" id="tile-title-${id}">${title}</h3>
      <button class="tile__info" type="button" data-tile="${id}" aria-expanded="${open}" aria-controls="tile-more-${id}" aria-label="About ${title.toLowerCase()}">${icon('i-info')}</button>
    </header>
    <div class="tile__body">${body}</div>
    <p class="tile__note">${note}</p>
    <p class="tile__more" id="tile-more-${id}"${open ? '' : ' hidden'}>${more}</p>
  </article>`;
}

export function renderConditions({ weather, now, prefs, animate }) {
  const c = weather.current;
  const todayIndex = dayIndexFor(weather.daily, now);
  const today = todayIndex >= 0 ? weather.daily[todayIndex] : null;
  const hourIndex = currentHourIndex(weather.hourly, now);
  const thisHour = hourIndex >= 0 ? weather.hourly[hourIndex] : null;
  const windLabel = windUnitLabel(prefs.wind);

  const uvNow = isNum(c.uv) ? c.uv : c.isDay === false ? 0 : null;
  const uvCat = uvCategory(uvNow);
  const vis = formatDistance(c.visibility, prefs.wind);
  const visPct = isNum(c.visibility) ? Math.min(100, (c.visibility / 30000) * 100) : 0;
  const trend = pressureTrend(weather, now);
  const trendWord = trend ? { rising: 'Rising', falling: 'Falling', steady: 'Steady' }[trend.trend] : '';

  const precipParts = [];
  if (today && isNum(today.precipSum)) precipParts.push(`${formatPrecip(today.precipSum)} expected today`);
  if (thisHour && isNum(thisHour.pop)) precipParts.push(`${Math.round(thisHour.pop)}% chance this hour`);
  const breakdown = [['Rain', c.rain], ['Showers', c.showers], ['Snow', c.snowfall]]
    .filter(([, v]) => isNum(v) && v > 0)
    .map(([k, v]) => `${k} ${k === 'Snow' ? `${v.toFixed(1)} cm` : formatPrecip(v)}`);

  const tiles = [
    tile({
      id: 'wind',
      iconId: 'i-wind',
      title: 'Wind',
      wide: true,
      body: `${compassSvg(c.windDir, c.windSpeed, prefs.wind)}
        <div class="wind-stats">
          <div><span class="label">Speed</span><strong>${formatWind(c.windSpeed, prefs.wind)}</strong></div>
          <div><span class="label">Gusts</span><strong>${formatWind(c.gusts, prefs.wind)}</strong></div>
          <div><span class="label">From</span><strong>${isNum(c.windDir) ? `${compass(c.windDir)} · ${Math.round(c.windDir)}°` : DASH}</strong></div>
        </div>`,
      note: isNum(c.windSpeed) ? `${beaufort(c.windSpeed)}${isNum(today?.windMax) ? ` · up to ${formatWind(today.windMax, prefs.wind)} today` : ''}` : 'Wind data unavailable',
      more: 'Wind speed is measured 10 m above the ground. Direction is where the wind blows from, and the arrow points where it’s heading. Gusts are brief peaks above the average speed.',
    }),
    tile({
      id: 'humidity',
      iconId: 'i-drop',
      title: 'Humidity',
      body: `<p class="tile__value">${isNum(c.humidity) ? Math.round(c.humidity) : DASH}<small>%</small></p><div class="vbar tile__viz" aria-hidden="true"><span style="--v:${isNum(c.humidity) ? c.humidity : 0}%"></span></div>`,
      note: isNum(c.dewPoint) ? `Dew point ${formatTemp(c.dewPoint, prefs.unit)} · ${comfort(c.dewPoint)}` : 'Dew point unavailable',
      more: 'Relative humidity is how saturated the air is compared with its maximum at this temperature. The dew point is a better guide to how muggy it feels: above 16° most people notice it.',
    }),
    tile({
      id: 'uv',
      iconId: 'i-sun',
      title: 'UV index',
      body: `<p class="tile__value">${isNum(uvNow) ? Math.round(uvNow) : DASH}</p><div class="tile__viz" style="flex:1;min-width:80px"><p class="tile__desc" style="color:${uvCat.color}">${uvCat.label}</p><div class="meter meter--scale" style="margin-top:10px" aria-hidden="true"><span class="meter__mark" style="--v:${Math.min(100, ((uvNow || 0) / 11) * 100)}%"></span></div></div>`,
      note: today && isNum(today.uvMax) ? `Peak today ${Math.round(today.uvMax)} · ${uvCategory(today.uvMax).label}${c.isDay === false ? ' · Sun is down' : ''}` : 'Daily peak unavailable',
      more: 'The UV index measures the strength of the sun’s ultraviolet radiation. At 3 or above, wear sunscreen and sunglasses; at 8 or above, avoid the midday sun.',
    }),
    tile({
      id: 'pressure',
      iconId: 'i-gauge',
      title: 'Pressure',
      body: `<p class="tile__value">${isNum(c.pressure) ? Math.round(c.pressure) : DASH}<small>hPa</small></p>${gaugeSvg(c.pressure).replace('class="gauge"', 'class="gauge tile__viz"')}`,
      note: `${pressureLabel(c.pressure) || 'Unavailable'}${trendWord ? ` · ${trendWord} <span class="src src--calc" title="Calculated from the hourly forecast">Calc</span>` : ''}`,
      more: `Mean sea-level pressure. ${trend ? trend.text : ''} Average pressure is about 1013 hPa.`,
    }),
    tile({
      id: 'visibility',
      iconId: 'i-eye',
      title: 'Visibility',
      body: `<p class="tile__value">${vis.value}<small>${vis.unit}</small></p><div class="meter tile__viz" style="flex:1;min-width:60px" aria-hidden="true"><span class="meter__fill" style="--v:${visPct.toFixed(0)}%;--meter-color:var(--ink-2)"></span></div>`,
      note: visibilityLabel(c.visibility) || 'Unavailable',
      more: 'How far away objects can be clearly seen. Fog, mist, heavy rain, snow and haze all reduce visibility. Below 1 km is considered fog.',
    }),
    tile({
      id: 'cloud',
      iconId: 'i-cloud',
      title: 'Cloud cover',
      body: `<p class="tile__value">${isNum(c.cloud) ? Math.round(c.cloud) : DASH}<small>%</small></p>${ringSvg(c.cloud).replace('class="ring"', 'class="ring tile__viz"')}`,
      note: cloudLabel(c.cloud) || 'Unavailable',
      more: 'The share of the sky covered by cloud at all heights. ATMOS uses this value to decide how many clouds drift across the scene behind the dashboard.',
    }),
    tile({
      id: 'precip',
      iconId: 'i-umbrella',
      title: 'Precipitation',
      body: `<p class="tile__value">${isNum(c.precip) ? (c.precip < 10 ? c.precip.toFixed(1) : Math.round(c.precip)) : DASH}<small>mm</small></p>`,
      note: `${breakdown.length ? `${breakdown.join(' · ')}<br>` : ''}${precipParts.join(' · ') || 'Forecast totals unavailable'}`,
      more: `Precipitation measured over the last ${Math.round((c.interval || 900) / 60)} minutes, including rain, showers and melted snow. The chance of precipitation is the probability of at least 0.1 mm in an hour.`,
    }),
  ];

  el.conditionsGrid.classList.toggle('is-static', !animate);
  el.conditionsGrid.innerHTML = tiles.join('');
  el.conditionsMeta.innerHTML = `<span class="src src--api">Open-Meteo</span> ${escapeHTML(windLabel === 'km/h' ? 'Metric' : 'Imperial')} units`;
}

function sunPoint(p) {
  return [24 + 292 * p, 140 - 112 * Math.sin(Math.PI * p)];
}

function nightPoint(q) {
  return [316 - 292 * q, 140 + 26 * Math.sin(Math.PI * q)];
}

function arcPath(from, to, pointFn, steps = 48) {
  let d = '';
  for (let i = 0; i <= steps; i += 1) {
    const [x, y] = pointFn(from + ((to - from) * i) / steps);
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

export function renderSun({ weather, now, place }) {
  const sun = sunState(weather, now);
  const index = sun.index ?? dayIndexFor(weather.daily, now);
  const today = index >= 0 ? weather.daily[index] : null;
  const tomorrow = index >= 0 ? weather.daily[index + 1] : null;

  el.sunRise.textContent = today && sun.mode !== 'polar-night' && sun.mode !== 'midnight-sun' ? formatTime(today.sunrise) : DASH;
  el.sunSet.textContent = today && sun.mode !== 'polar-night' && sun.mode !== 'midnight-sun' ? formatTime(today.sunset) : DASH;
  el.sunDaylight.textContent = today && isNum(today.daylight) ? formatDuration(today.daylight * 1000, { short: true }) : DASH;

  if (today && tomorrow && isNum(today.daylight) && isNum(tomorrow.daylight)) {
    const diff = Math.round(tomorrow.daylight - today.daylight);
    const abs = Math.abs(diff);
    const text = abs < 1 ? 'Same daylight tomorrow' : `Tomorrow ${abs >= 60 ? `${Math.floor(abs / 60)} min ${abs % 60} s` : `${abs} s`} ${diff > 0 ? 'longer' : 'shorter'}`;
    el.sunMeta.textContent = text;
  } else {
    el.sunMeta.textContent = '';
  }

  let progress = null;
  let night = null;
  let status = '';
  if (sun.mode === 'day') {
    progress = sun.progress;
    const noon = sun.sunrise + sun.span / 2;
    status = `<strong>${formatDuration(sun.remaining)}</strong> of daylight left · solar noon ${formatTime(noon)}`;
  } else if (sun.mode === 'before-sunrise') {
    night = sun.nightProgress;
    status = `Sunrise in <strong>${formatDuration(sun.untilSunrise)}</strong>`;
  } else if (sun.mode === 'after-sunset') {
    night = sun.nightProgress;
    status = `The sun set <strong>${formatDuration(now - sun.sunset)}</strong> ago · rises again at ${formatTime(sun.nextSunrise)}`;
  } else if (sun.mode === 'polar-night') {
    night = 0.5;
    status = '<strong>Polar night</strong>: the sun stays below the horizon all day.';
  } else if (sun.mode === 'midnight-sun') {
    progress = 0.5;
    status = '<strong>Midnight sun</strong>: the sun doesn’t set today.';
  } else {
    status = 'Sunrise and sunset times are unavailable for this location.';
  }
  el.sunStatus.innerHTML = status;

  const noonLabel = sun.mode === 'day' || sun.mode === 'before-sunrise' || sun.mode === 'after-sunset'
    ? `<text class="sun-hour" x="170" y="20" text-anchor="middle">${formatTime(sun.sunrise + sun.span / 2)}</text>` : '';

  el.sunSvg.innerHTML = `
    <defs>
      <linearGradient id="sun-grad" x1="0" x2="1"><stop offset="0" stop-color="#ff9f6b"/><stop offset=".5" stop-color="#ffe29a"/><stop offset="1" stop-color="#ff9f6b"/></linearGradient>
      <linearGradient id="sun-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a" stop-opacity=".32"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></linearGradient>
      <radialGradient id="sun-halo"><stop offset="0" stop-color="#ffe29a" stop-opacity=".7"/><stop offset="1" stop-color="#ffe29a" stop-opacity="0"/></radialGradient>
      <radialGradient id="moon-halo"><stop offset="0" stop-color="#dfe7ff" stop-opacity=".55"/><stop offset="1" stop-color="#dfe7ff" stop-opacity="0"/></radialGradient>
    </defs>
    ${noonLabel}
    <path class="sun-track" d="${arcPath(0, 1, sunPoint)}"/>
    <path class="sun-night" d="${arcPath(0, 1, nightPoint)}"/>
    <path class="sun-area" id="sun-area-path" d=""/>
    <path class="sun-path" id="sun-progress-path" d=""/>
    <line class="sun-horizon" x1="6" y1="140" x2="334" y2="140"/>
    <circle cx="24" cy="140" r="3" fill="var(--ink-3)"/><circle cx="316" cy="140" r="3" fill="var(--ink-3)"/>
    <g id="sun-marker"></g>`;

  const marker = el.sunSvg.querySelector('#sun-marker');
  const areaPath = el.sunSvg.querySelector('#sun-area-path');
  const progressPath = el.sunSvg.querySelector('#sun-progress-path');

  const drawAt = (t) => {
    if (progress !== null) {
      const p = progress * t;
      const [x, y] = sunPoint(p);
      progressPath.setAttribute('d', p > 0.001 ? arcPath(0, p, sunPoint, 40) : '');
      areaPath.setAttribute('d', p > 0.001 ? `${arcPath(0, p, sunPoint, 40)}L${x.toFixed(1)} 140L24 140Z` : '');
      marker.innerHTML = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="18" fill="url(#sun-halo)"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#ffd27a" stroke="#fff" stroke-width="2"/>`;
    } else if (night !== null) {
      progressPath.setAttribute('d', arcPath(0, 1, sunPoint, 40));
      progressPath.setAttribute('opacity', '0.35');
      const [x, y] = nightPoint(night * t);
      marker.innerHTML = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="url(#moon-halo)"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" fill="#dfe7ff" stroke="var(--scene-deep)" stroke-width="2"/>`;
    } else {
      marker.innerHTML = '';
    }
  };

  cancelAnimationFrame(sunAnimation);
  const key = `${placeKey(place)}|${today ? today.date : ''}`;
  if (key !== lastSunKey && motionAllowed()) {
    lastSunKey = key;
    const start = performance.now();
    const step = (time) => {
      const t = Math.min(1, (time - start) / 1400);
      drawAt(1 - Math.pow(1 - t, 3));
      if (t < 1) sunAnimation = requestAnimationFrame(step);
    };
    drawAt(0);
    sunAnimation = requestAnimationFrame(step);
  } else {
    lastSunKey = key;
    drawAt(1);
  }

  renderMoon(Boolean(place && place.lat < 0));
}

function moonSvg(phase, southern) {
  const waning = phase > 0.5;
  const local = waning ? 1 - phase : phase;
  const rx = 20 * Math.abs(Math.cos(2 * Math.PI * local));
  const flip = waning !== southern;
  const dark = `M21 1A20 20 0 0 0 21 41A${rx.toFixed(2)} 20 0 0 ${local < 0.25 ? 0 : 1} 21 1Z`;
  return `<svg class="moon__disc" viewBox="0 0 42 42" aria-hidden="true">
    <circle cx="21" cy="21" r="20" fill="#f1ecdc"/>
    <circle cx="14" cy="16" r="5" fill="#d9d2bd"/><circle cx="25" cy="25" r="4" fill="#d9d2bd"/><circle cx="18" cy="29" r="2.6" fill="#d9d2bd"/>
    <path d="${dark}" fill="#141a2c" fill-opacity=".9"${flip ? ' transform="matrix(-1 0 0 1 42 0)"' : ''}/>
    <circle cx="21" cy="21" r="20" fill="none" stroke="var(--line-strong)"/>
  </svg>`;
}

function renderMoon(southern) {
  const moon = moonPhase(Date.now());
  const days = Math.round(moon.daysToFull);
  const next = moon.name === 'Full moon' ? 'Full tonight' : days <= 1 ? 'Full moon tomorrow' : `Full moon in ${days} days`;
  el.moonInfo.innerHTML = `${moonSvg(moon.phase, southern)}
    <div class="moon__text"><strong>${moon.name} · ${Math.round(moon.illumination * 100)}% lit</strong><span>${next} <span class="src src--calc">Calculated</span></span></div>`;
}

export function renderInsights({ weather, now, prefs }) {
  const items = [];
  const summary = todaySummary(weather, now, prefs);
  if (summary) items.push({ iconId: 'i-sparkle', title: 'Today at a glance', text: summary });
  const outlook = rainOutlook(weather, now);
  if (outlook) items.push({ iconId: 'i-umbrella', title: 'Precipitation outlook', text: outlook.text });
  const uv = uvWindow(weather, now);
  if (uv) items.push({ iconId: 'i-sun', title: 'Sun protection', text: uv.text });
  el.insightsList.innerHTML = items.map((item) => `<li class="insight">
      <span class="insight__icon">${icon(item.iconId)}</span>
      <div><p class="insight__title">${escapeHTML(item.title)} <span class="src src--calc">Calculated</span></p><p class="insight__text">${escapeHTML(item.text)}</p></div>
    </li>`).join('');
}

export function renderAir(state) {
  if (state === 'loading') {
    el.aqi.innerHTML = '<span class="sk" style="width:84px;height:76px;border-radius:18px;grid-row:span 2"></span><span class="sk sk--line" style="width:50%"></span><span class="sk sk--line" style="width:80%"></span>';
    return;
  }
  if (!state || state === 'error' || !isNum(state.usAqi)) {
    el.aqi.innerHTML = `<p class="aqi__empty">${icon('i-leaf')} Air quality data isn’t available for this location right now.</p>`;
    return;
  }
  const cat = aqiCategory(state.usAqi);
  const pollutant = (label, value) => `<div><small>${label}</small><strong>${isNum(value) ? Math.round(value) : DASH}</strong><small>μg/m³</small></div>`;
  el.aqi.style.setProperty('--aqi-color', cat.color);
  el.aqi.innerHTML = `
    <div class="aqi__value"><span class="aqi__num">${Math.round(state.usAqi)}</span><span class="aqi__scale">US AQI</span></div>
    <p class="aqi__cat"><i aria-hidden="true"></i>${escapeHTML(cat.label)} <span class="src src--api">Open-Meteo · CAMS</span></p>
    <p class="aqi__advice">${escapeHTML(cat.advice)}${isNum(state.euAqi) ? ` European AQI: ${Math.round(state.euAqi)}.` : ''}</p>
    <div class="aqi__pollutants">${pollutant('PM2.5', state.pm25)}${pollutant('PM10', state.pm10)}${pollutant('Ozone', state.ozone)}${pollutant('NO₂', state.no2)}</div>`;
}

const RIDGE = '<svg class="window__ridge" viewBox="0 0 100 46" preserveAspectRatio="none" aria-hidden="true"><path d="M0 24 12 14l11 7 13-13 13 10 11-6 14 11 26-12v35H0Z" fill="rgba(0,0,0,.24)"/><path d="M0 34q25-12 50-4t50-2v18H0Z" fill="rgba(0,0,0,.38)"/></svg>';

export function renderPlaces({ favorites, data, prefs, currentKey, recents, loading }) {
  const extras = recents.filter((place) => !favorites.some((fav) => placeKey(fav) === placeKey(place)) && placeKey(place) !== currentKey).slice(0, 5);
  const recentHtml = extras.length
    ? `<div class="places__recent"><p class="label">Recently viewed</p><ul class="chips">${extras.map((place) => chip(place, 'i-clock')).join('')}</ul></div>`
    : '';

  if (!favorites.length) {
    el.placesMeta.textContent = '';
    el.placesBody.innerHTML = `<div class="places__empty"><p>Tap ${icon('i-star')} next to a city’s name to save it. Your saved places appear here as windows into their current skies.</p></div>${recentHtml}`;
    return;
  }

  const cards = favorites.map((place) => {
    const key = placeKey(place);
    const now = data.get(key);
    const swatch = paletteSwatch(now ? now.code : 2, now ? now.isDay : true, now ? now.cloud : null);
    const info = now ? getCodeInfo(now.code, now.cloud) : null;
    const local = now && (now.timezone || isNum(now.utcOffset)) ? formatTime(nowWall(now.timezone, now.utcOffset)) : '';
    const iconId = now ? iconFor(now.code, now.isDay !== false, now.cloud) : 'wi-partly-day';
    const label = now
      ? `${place.name}: ${formatTemp(now.temp, prefs.unit)}, ${info.label}${local ? `, local time ${local}` : ''}. Open forecast.`
      : `${place.name}. Open forecast.`;
    return `<li><article class="window${key === currentKey ? ' is-current' : ''}" style="--w-top:${swatch.top};--w-mid:${swatch.mid};--w-bottom:${swatch.bottom}">
      <span class="window__glow" style="background:radial-gradient(circle, ${swatch.glow}, transparent 70%)"></span>
      ${RIDGE}
      <svg class="wi window__icon" aria-hidden="true"><use href="#${iconId}"></use></svg>
      <button class="window__open" type="button" data-place="${escapeHTML(JSON.stringify(place))}" aria-label="${escapeHTML(label)}"></button>
      <p class="window__temp">${now ? formatTemp(now.temp, prefs.unit) : loading ? '<span class="sk" style="width:56px;height:34px;display:inline-block"></span>' : DASH}</p>
      <p class="window__name">${escapeHTML(place.name)}</p>
      <p class="window__meta">${now ? `${escapeHTML(info.short)}${local ? ` · ${local}` : ''}` : escapeHTML(place.country || '')}</p>
      <button class="window__remove" type="button" data-remove="${escapeHTML(key)}" aria-label="Remove ${escapeHTML(place.name)} from your places">${icon('i-close')}</button>
    </article></li>`;
  }).join('');

  el.placesMeta.innerHTML = data.size ? `<span class="src src--api">Live</span> ${favorites.length} saved` : `${favorites.length} saved`;
  el.placesBody.innerHTML = `<ul class="places__list">${cards}</ul>${recentHtml}`;
}

export function renderFooter(weather) {
  const zone = weather && weather.timezone ? weather.timezone.replace(/_/g, ' ') : '';
  el.footerMeta.textContent = zone
    ? `All times are shown in the selected location’s local time (${zone}, ${formatUtcOffset(weather.utcOffset)}).`
    : 'All times are shown in the selected location’s local time.';
}

export function showBanner({ kind = 'info', text, actionLabel = '', onAction = null }) {
  el.banner.className = `banner banner--${kind}`;
  const iconId = kind === 'offline' ? 'i-offline' : kind === 'error' ? 'i-alert' : kind === 'preview' ? 'i-sparkle' : 'i-info';
  el.banner.querySelector('.banner__icon use').setAttribute('href', `#${iconId}`);
  el.bannerText.textContent = text;
  el.bannerAction.hidden = !actionLabel;
  el.bannerAction.textContent = actionLabel;
  bannerAction = onAction;
  el.banner.hidden = false;
}

export function hideBanner() {
  el.banner.hidden = true;
  bannerAction = null;
}

export function bannerKind() {
  if (el.banner.hidden) return null;
  const match = /banner--(\w+)/.exec(el.banner.className);
  return match ? match[1] : null;
}

export function toast(text, kind = 'ok') {
  const item = document.createElement('div');
  item.className = `toast toast--${kind}`;
  item.innerHTML = `${icon(kind === 'error' ? 'i-alert' : kind === 'warn' ? 'i-info' : 'i-sparkle')}<span>${escapeHTML(text)}</span>`;
  el.toasts.append(item);
  while (el.toasts.children.length > 3) el.toasts.firstElementChild.remove();
  setTimeout(() => {
    item.classList.add('is-leaving');
    setTimeout(() => item.remove(), 320);
  }, 3800);
}

export function announce(text) {
  el.live.textContent = '';
  setTimeout(() => {
    el.live.textContent = text;
  }, 60);
}

export function percent(value) {
  return formatPercent(value);
}
