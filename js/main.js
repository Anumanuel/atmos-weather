import { createWeatherEngine } from './weather-effects/weather-engine.js';
import { createSoundscape } from './weather-effects/soundscape.js';
import * as ui from './ui.js';
import { closeDay, initForecast, renderDaily, renderHourly, setForecastContext } from './forecast.js';
import { focusSearch, initSearch } from './search.js';
import { initTrends, renderTrends, setTrendsContext } from './charts.js';
import { initGlobe, openGlobe } from './globe.js';
import { REFRESH_INTERVAL, clearWeatherCache, getAirQuality, getForecast, getPlacesNow, readCachedForecast } from './weather-data.js';
import { POPULAR_PLACES, defaultPlace, reverseGeocode } from './geocoding.js';
import { GEO_MESSAGES, getCurrentPosition, getPermissionState, isGeolocationSupported } from './geolocation.js';
import { describeError, isAbortError } from './api.js';
import { PREVIEW_SCENES, describeScene, introScene, previewScene } from './scene-mapper.js';
import { HOUR_MS, formatDuration, formatRealTime, formatRelative, formatTemp, formatTime, nowWall } from './format.js';
import { moonPhase, sunState } from './astro.js';
import { getCodeInfo } from './weather-codes.js';
import * as store from './storage.js';
import { onReducedMotionChange, prefersReducedMotion } from './dom.js';

const state = {
  prefs: store.getPrefs(),
  place: null,
  weather: null,
  fetchedAt: 0,
  stale: false,
  load: null,
  errorPlace: null,
  bannerError: '',
  dismissedBanner: '',
  shownBanner: '',
  refreshTimer: 0,
  needsRefresh: false,
  locating: false,
  selectedHour: null,
  preview: '',
  lastMinute: -1,
  lastHour: -1,
  air: { key: '', data: null, loading: false },
  places: { data: new Map(), fetchedAt: 0, key: '', loading: false },
  globeNow: { data: new Map(), key: '', at: 0 },
  airVisible: false,
  placesVisible: false,
};

let engine = null;
const sound = createSoundscape();

const effectiveMotion = () => state.prefs.motion || (prefersReducedMotion() ? 'off' : 'full');

function savePrefs() {
  store.savePrefs({ unit: state.prefs.unit, wind: state.prefs.wind, theme: state.prefs.theme, motion: state.prefs.motion, sound: state.prefs.sound, volume: state.prefs.volume });
}

function syncPrefsUI() {
  ui.syncPrefs({ ...state.prefs, motionEffective: effectiveMotion() });
}

function applyTheme() {
  document.documentElement.dataset.theme = state.prefs.theme;
}

function applyMotion() {
  const motion = effectiveMotion();
  document.documentElement.dataset.motion = motion;
  if (engine) engine.setMotion(motion);
  if (motion === 'off') ui.revealAll();
}

const now = () => (state.weather ? nowWall(state.weather.timezone, state.weather.utcOffset) : Date.now());

function renderAll({ animate = false } = {}) {
  if (!state.weather || !state.place) return;
  const current = now();
  const { prefs, weather, place } = state;
  ui.renderHero({ place, weather, now: current, prefs, isFav: store.isFavorite(place), fetchedAt: state.fetchedAt, stale: state.stale });
  setForecastContext({ weather, prefs, now: current, place });
  renderHourly({ selectedTime: state.selectedHour, animate });
  renderDaily({ animate });
  setTrendsContext({ weather, prefs, now: current });
  renderTrends();
  ui.renderConditions({ weather, now: current, prefs, animate });
  ui.renderSun({ weather, now: current, place });
  ui.renderInsights({ weather, now: current, prefs });
  const airKey = store.placeKey(place);
  ui.renderAir(state.air.key === airKey && !state.air.loading ? state.air.data : 'loading');
  renderPlaces();
  ui.renderFooter(weather);
  state.lastMinute = Math.floor(current / 60000);
  state.lastHour = Math.floor(current / HOUR_MS);
}

function updateScene({ instant = false } = {}) {
  let cfg;
  if (state.preview) cfg = previewScene(state.preview);
  if (!cfg && state.weather) cfg = describeScene(state.weather, state.place, now());
  if (!cfg) cfg = introScene();
  engine.setScene(cfg, { instant });
  sound.setScene(cfg);
}

async function setSound(on, { announce = true } = {}) {
  if (on && !sound.supported) {
    ui.toast('This browser can’t play generated sound', 'warn');
    on = false;
  }
  state.prefs.sound = on;
  savePrefs();
  ui.syncSound(on, state.prefs.volume);
  if (!on) {
    sound.disable();
    if (announce) ui.toast('Weather sounds off');
    return;
  }
  sound.setVolume(state.prefs.volume);
  const running = await sound.enable();
  if (announce) ui.toast(running ? 'Weather sounds on · they follow the live weather' : 'Tap anywhere to start the sound', running ? 'ok' : 'warn');
}

function setVolume(value) {
  state.prefs.volume = value;
  savePrefs();
  sound.setVolume(value);
}

function armSoundOnGesture() {
  if (!state.prefs.sound || !sound.supported) return;
  const start = () => {
    window.removeEventListener('pointerdown', start, true);
    window.removeEventListener('keydown', start, true);
    if (state.prefs.sound) {
      sound.setVolume(state.prefs.volume);
      sound.enable();
    }
  };
  window.addEventListener('pointerdown', start, true);
  window.addEventListener('keydown', start, true);
}

function updateTitle() {
  if (!state.weather || !state.place) {
    document.title = 'ATMOS — Live Weather Forecast, Brought to Life';
    return;
  }
  const info = getCodeInfo(state.weather.current.code, state.weather.current.cloud);
  document.title = `${formatTemp(state.weather.current.temp, state.prefs.unit)} ${info.short} · ${state.place.name} — ATMOS`;
}

function updateUrl(place) {
  try {
    const url = new URL(window.location.href);
    ['lat', 'lon', 'name', 'country', 'cc', 'admin'].forEach((key) => url.searchParams.delete(key));
    if (place && place.source === 'search') {
      url.searchParams.set('name', place.name);
      if (place.admin1) url.searchParams.set('admin', place.admin1);
      if (place.country) url.searchParams.set('country', place.country);
      if (place.countryCode) url.searchParams.set('cc', place.countryCode);
      url.searchParams.set('lat', place.lat.toFixed(3));
      url.searchParams.set('lon', place.lon.toFixed(3));
    }
    window.history.replaceState(null, '', url);
  } catch {
    return;
  }
}

function placeFromUrl(params) {
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (!params.has('lat') || !params.has('lon') || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return store.sanitizePlace({
    name: params.get('name') || 'Selected place',
    admin1: params.get('admin') || '',
    country: params.get('country') || '',
    countryCode: params.get('cc') || '',
    lat,
    lon,
    source: 'search',
  });
}

function refreshBanner() {
  let banner = null;
  if (navigator.onLine === false) {
    banner = state.weather
      ? { id: `offline-${state.fetchedAt}`, kind: 'offline', text: `You’re offline. Showing weather saved at ${formatRealTime(state.fetchedAt)}, which may be out of date.` }
      : { id: 'offline', kind: 'offline', text: 'You’re offline. Connect to the internet to load live weather.' };
  } else if (state.bannerError) {
    banner = { id: `error-${state.bannerError}`, kind: 'error', text: state.bannerError, actionLabel: 'Retry', onAction: () => refresh() };
  } else if (state.stale && state.weather) {
    banner = { id: `stale-${state.fetchedAt}`, kind: 'offline', text: `Showing saved weather from ${formatRealTime(state.fetchedAt)}. It may be out of date.`, actionLabel: 'Refresh', onAction: () => refresh() };
  } else if (state.preview) {
    const entry = PREVIEW_SCENES.find((scene) => scene.id === state.preview);
    banner = {
      id: `preview-${state.preview}`,
      kind: 'preview',
      text: `Previewing the “${entry ? entry.label : state.preview}” scene. ${state.weather ? 'All data shown is still live.' : 'No weather data is shown.'}`,
      actionLabel: 'Back to live',
      onAction: () => setPreview(''),
    };
  }
  if (!banner || state.dismissedBanner === banner.id) {
    ui.hideBanner();
    state.shownBanner = '';
    return;
  }
  state.shownBanner = banner.id;
  ui.showBanner(banner);
}

function scheduleRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => {
    if (document.hidden) {
      state.needsRefresh = true;
      return;
    }
    if (navigator.onLine === false) {
      scheduleRefresh();
      return;
    }
    refresh({ quiet: true });
  }, REFRESH_INTERVAL);
}

function applyWeather(place, result) {
  const previousKey = state.place ? store.placeKey(state.place) : '';
  const enriched = { ...place, timezone: result.data.timezone || place.timezone || null };
  const changed = previousKey !== store.placeKey(enriched);

  state.place = enriched;
  state.weather = result.data;
  state.fetchedAt = result.fetchedAt;
  state.stale = Boolean(result.stale);
  state.errorPlace = null;
  if (changed) {
    state.selectedHour = null;
    state.air = { key: '', data: null, loading: false };
  }

  if (enriched.source !== 'default') {
    store.setLastPlace(enriched);
    store.addRecent(enriched);
  }
  updateUrl(enriched);

  ui.endLoading();
  ui.showView('dashboard');
  renderAll({ animate: true });
  if (changed) {
    ui.playEntrance();
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'auto' });
    maybeShowSkyHint();
  }
  updateScene();
  updateTitle();
  ui.enableRefresh(true);
  scheduleRefresh();
  maybeLoadAir();
  loadPlacesData(changed);

  const info = getCodeInfo(result.data.current.code, result.data.current.cloud);
  ui.announce(`${enriched.name}: ${formatTemp(result.data.current.temp, state.prefs.unit)}, ${info.label.toLowerCase()}.${state.stale ? ' This is saved data and may be out of date.' : ''}`);
}

function handleLoadError(place, error, { sameRefresh, switching }) {
  const info = describeError(error);
  if (sameRefresh) {
    state.bannerError = `Couldn’t refresh: ${info.message}`;
    state.dismissedBanner = '';
    refreshBanner();
    scheduleRefresh();
    return;
  }

  const cached = readCachedForecast(place);
  if (cached) {
    applyWeather(place, { data: cached.data, fetchedAt: cached.fetchedAt, stale: true });
    state.bannerError = `${info.title}. Showing weather saved ${formatRelative(cached.fetchedAt)}.`;
    state.dismissedBanner = '';
    refreshBanner();
    return;
  }

  state.errorPlace = place;
  ui.endLoading();
  const lastGood = state.weather && state.place
    ? `Last successful update: ${state.place.name} at ${formatRealTime(state.fetchedAt)}.`
    : '';
  const code = error && error.status ? `HTTP ${error.status} · ` : '';
  ui.showError({
    title: info.title,
    message: `${info.message}`,
    detail: `${place.name} · ${code}${new Date().toLocaleTimeString()}${lastGood ? ` · ${lastGood}` : ''}`,
    backLabel: switching && state.place ? `Back to ${state.place.name}` : '',
  });
  ui.announce(`${info.title}. ${info.message}`);
}

function loadPlace(place, { force = false } = {}) {
  const key = store.placeKey(place);
  if (state.load && state.load.key === key && !force) return state.load.promise;
  if (state.load) state.load.controller.abort();

  const controller = new AbortController();
  const currentKey = state.place ? store.placeKey(state.place) : '';
  const hasData = Boolean(state.weather);
  const sameRefresh = hasData && currentKey === key && !ui.isErrorView();
  const switching = hasData && !sameRefresh;

  if (sameRefresh) ui.setRefreshing(true);
  else ui.showLoading(place, { switching });

  const promise = (async () => {
    try {
      const result = await getForecast(place, { signal: controller.signal, force });
      if (controller.signal.aborted) return;
      state.bannerError = '';
      applyWeather(place, result);
      refreshBanner();
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      handleLoadError(place, error, { sameRefresh, switching });
    } finally {
      if (state.load && state.load.controller === controller) {
        state.load = null;
        ui.setRefreshing(false);
        ui.enableRefresh(Boolean(state.weather));
        if (!state.locating) ui.setProgress(false);
      }
    }
  })();

  state.load = { key, controller, promise };
  return promise;
}

function selectPlace(place) {
  const clean = store.sanitizePlace(place);
  if (!clean) return null;
  ui.closeSettings();
  closeDay();
  return loadPlace(clean);
}

function refresh({ quiet = false } = {}) {
  if (!state.place) return null;
  if (!quiet) state.bannerError = '';
  return loadPlace(state.place, { force: true });
}

async function locate({ silent = false, fallback = null } = {}) {
  if (state.locating) return;
  ui.showWelcomeNotice(null);
  if (!isGeolocationSupported()) {
    geoFailed('unsupported', { silent, fallback });
    return;
  }
  state.locating = true;
  ui.setLocating(true);
  try {
    const position = await getCurrentPosition();
    let names = null;
    try {
      names = await reverseGeocode(position.lat, position.lon);
    } catch {
      names = null;
    }
    const place = {
      id: 'geo',
      source: 'geo',
      lat: position.lat,
      lon: position.lon,
      name: names && names.name ? names.name : 'Current location',
      admin1: names ? names.admin1 : '',
      country: names ? names.country : '',
      countryCode: names ? names.countryCode : '',
    };
    state.locating = false;
    ui.setLocating(false);
    await loadPlace(store.sanitizePlace(place), { force: true });
  } catch (error) {
    geoFailed(error && error.kind ? error.kind : 'unavailable', { silent, fallback });
  } finally {
    state.locating = false;
    ui.setLocating(false);
    if (!state.load) ui.setProgress(false);
  }
}

function geoFailed(kind, { silent, fallback }) {
  const info = GEO_MESSAGES[kind] || GEO_MESSAGES.unavailable;
  if (silent && fallback) {
    ui.toast(fallback.source === 'default' ? 'Couldn’t find your location. Showing a default city instead.' : 'Couldn’t refresh your location. Showing the last place you viewed.', 'warn');
    selectPlace({ ...fallback, source: fallback.source === 'default' ? 'default' : 'search' });
    return;
  }
  if (!state.weather) {
    ui.showView('welcome');
    ui.showWelcomeNotice(info, { focusSearch: kind === 'denied' || kind === 'unsupported' || kind === 'insecure' });
  } else {
    ui.toast(info.title, 'warn');
  }
  ui.announce(`${info.title}. ${info.message}`);
}

async function maybeLoadAir() {
  if (!state.place || !state.airVisible) return;
  const key = store.placeKey(state.place);
  if (state.air.key === key && (state.air.loading || state.air.data)) return;
  if (navigator.onLine === false) return;
  state.air = { key, data: null, loading: true };
  ui.renderAir('loading');
  try {
    const data = await getAirQuality(state.place);
    if (state.air.key !== key) return;
    state.air = { key, data, loading: false };
  } catch (error) {
    if (state.air.key !== key) return;
    state.air = { key, data: 'error', loading: false };
  }
  if (state.place && store.placeKey(state.place) === key) ui.renderAir(state.air.data);
}

function renderPlaces() {
  ui.renderPlaces({
    favorites: store.getFavorites(),
    data: state.places.data,
    prefs: state.prefs,
    currentKey: state.place ? store.placeKey(state.place) : '',
    recents: store.getRecents(),
    loading: state.places.loading,
  });
}

async function loadPlacesData(force = false) {
  const favorites = store.getFavorites();
  if (!favorites.length) {
    renderPlaces();
    return;
  }
  if (!state.placesVisible && !force) return;
  const key = favorites.map(store.placeKey).join('|');
  if (!force && state.places.key === key && Date.now() - state.places.fetchedAt < REFRESH_INTERVAL) return;
  if (state.places.loading || navigator.onLine === false) return;
  state.places.loading = true;
  renderPlaces();
  try {
    const list = await getPlacesNow(favorites);
    state.places.data = new Map(list.map((item) => [item.key, item]));
    state.places.fetchedAt = Date.now();
    state.places.key = key;
  } catch (error) {
    if (!isAbortError(error)) state.places.key = '';
  } finally {
    state.places.loading = false;
    renderPlaces();
  }
}

function toggleFavorite() {
  if (!state.place) return;
  const name = state.place.name;
  if (store.isFavorite(state.place)) {
    store.removeFavorite(state.place);
    ui.toast(`Removed ${name} from your places`);
  } else {
    const before = store.getFavorites().length;
    const list = store.addFavorite(state.place);
    ui.toast(list.length <= before ? `Saved ${name}. Your oldest saved place was replaced.` : `Saved ${name} to your places`);
  }
  ui.renderHero({ place: state.place, weather: state.weather, now: now(), prefs: state.prefs, isFav: store.isFavorite(state.place), fetchedAt: state.fetchedAt, stale: state.stale });
  loadPlacesData(true);
}

function removeFavorite(key) {
  const favorite = store.getFavorites().find((place) => store.placeKey(place) === key);
  if (!favorite) return;
  store.removeFavorite(favorite);
  state.places.data.delete(key);
  ui.toast(`Removed ${favorite.name} from your places`);
  renderPlaces();
  if (state.place && store.placeKey(state.place) === key) {
    ui.renderHero({ place: state.place, weather: state.weather, now: now(), prefs: state.prefs, isFav: false, fetchedAt: state.fetchedAt, stale: state.stale });
  }
}

function setUnit(unit) {
  if (unit !== 'c' && unit !== 'f') return;
  if (unit === state.prefs.unit) {
    syncPrefsUI();
    return;
  }
  state.prefs.unit = unit;
  savePrefs();
  syncPrefsUI();
  renderAll({ animate: false });
  updateTitle();
  ui.announce(`Temperatures now shown in ${unit === 'f' ? 'Fahrenheit' : 'Celsius'}.`);
}

function setWind(unit) {
  if (unit === state.prefs.wind) return;
  state.prefs.wind = unit;
  savePrefs();
  syncPrefsUI();
  renderAll({ animate: false });
}

function setTheme(theme) {
  state.prefs.theme = theme;
  savePrefs();
  applyTheme();
  syncPrefsUI();
}

function setMotion(mode) {
  state.prefs.motion = mode;
  savePrefs();
  applyMotion();
  syncPrefsUI();
}

function setPreview(id) {
  state.preview = id && previewScene(id) ? id : '';
  state.dismissedBanner = '';
  ui.setPreviewValue(state.preview);
  updateScene();
  refreshBanner();
}

function clearData() {
  const ok = window.confirm('Forget your saved places, recent searches, preferences and cached forecasts on this device?');
  if (!ok) return;
  store.clearAll();
  clearWeatherCache();
  sound.disable();
  state.prefs = store.getPrefs();
  state.places = { data: new Map(), fetchedAt: 0, key: '', loading: false };
  applyTheme();
  applyMotion();
  syncPrefsUI();
  if (state.weather) {
    renderAll({ animate: false });
    updateTitle();
  }
  ui.renderWelcome({ popular: POPULAR_PLACES, recents: store.getRecents() });
  ui.toast('Saved places, preferences and cache cleared');
}

function globeMarkers() {
  const list = [];
  const seen = new Set();
  const add = (place, flags) => {
    const key = store.placeKey(place);
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ place, now: state.globeNow.data.get(key) || null, ...flags });
  };
  if (state.place) add(state.place, { current: true });
  store.getFavorites().forEach((place) => add(place, { saved: true }));
  POPULAR_PLACES.forEach((place) => add(place, {}));
  return list;
}

async function globeMarkersLive() {
  const markers = globeMarkers();
  const key = markers.map((m) => store.placeKey(m.place)).join('|');
  const fresh = state.globeNow.key === key && Date.now() - state.globeNow.at < REFRESH_INTERVAL;
  if (!fresh && navigator.onLine !== false) {
    try {
      const list = await getPlacesNow(markers.map((m) => m.place));
      list.forEach((item) => state.globeNow.data.set(item.key, item));
      state.globeNow.key = key;
      state.globeNow.at = Date.now();
    } catch (error) {
      if (!isAbortError(error)) state.globeNow.key = '';
    }
  }
  return globeMarkers();
}

async function fetchPoint(lat, lon, { signal, place }) {
  const [names, now] = await Promise.allSettled([
    place ? Promise.resolve(null) : reverseGeocode(lat, lon, { signal }),
    getPlacesNow([{ lat, lon }], { signal }),
  ]);
  if (now.status === 'rejected') throw now.reason;
  const found = names.status === 'fulfilled' ? names.value : null;
  const resolved = place
    ? { ...place }
    : {
      name: found && found.name ? found.name : 'Selected point',
      admin1: found ? found.admin1 : '',
      country: found ? found.country : '',
      countryCode: found ? found.countryCode : '',
      lat,
      lon,
      source: 'search',
    };
  return { place: store.sanitizePlace(resolved), now: now.value[0] };
}

function celestialText(type) {
  if (type === 'moon') {
    const moon = moonPhase(Date.now());
    return `${moon.name} · ${Math.round(moon.illumination * 100)}% illuminated`;
  }
  if (!state.weather) return 'The sun';
  const sun = sunState(state.weather, now());
  if (sun.mode === 'day') return `The sun sets at ${formatTime(sun.sunset)} · ${formatDuration(sun.remaining)} of daylight left`;
  if (sun.mode === 'midnight-sun') return 'Midnight sun · the sun does not set today';
  return 'The sun';
}

function bindSkyInteraction() {
  const tip = document.getElementById('sky-tip');
  const interactive = 'button, a, input, select, label, summary, [role="button"], .hero__insight, .notice';
  let hideTimer = 0;

  const hideTip = () => {
    tip.hidden = true;
    document.body.classList.remove('is-over-sky-body');
  };

  const showTip = (body, sticky) => {
    tip.textContent = celestialText(body.type);
    tip.style.left = `${Math.round(body.x)}px`;
    tip.style.top = `${Math.round(body.y + 40)}px`;
    tip.hidden = false;
    clearTimeout(hideTimer);
    if (sticky) hideTimer = setTimeout(hideTip, 3200);
  };

  const nearBody = (x, y) => {
    const body = engine.celestial();
    if (!body) return null;
    return Math.hypot(x - body.x, y - body.y) < 52 ? body : null;
  };

  ['hero', 'view-welcome'].forEach((id) => {
    const zone = document.getElementById(id);
    if (!zone) return;
    zone.addEventListener('click', (event) => {
      if (event.target.closest(interactive)) return;
      const selection = window.getSelection ? String(window.getSelection()) : '';
      if (selection) return;
      const body = nearBody(event.clientX, event.clientY);
      if (body) showTip(body, true);
      engine.interact(event.clientX, event.clientY);
    });
    zone.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return;
      if (event.target.closest(interactive)) {
        hideTip();
        return;
      }
      const body = nearBody(event.clientX, event.clientY);
      if (body) {
        showTip(body, false);
        document.body.classList.add('is-over-sky-body');
      } else {
        hideTip();
      }
    });
    zone.addEventListener('pointerleave', hideTip);
  });
  window.addEventListener('scroll', hideTip, { passive: true });
}

function maybeShowSkyHint() {
  if (store.storage.read('sky-hint', false) || effectiveMotion() === 'off') return;
  store.storage.write('sky-hint', true);
  setTimeout(() => ui.toast('Tip: click or tap the sky to play with the weather'), 2200);
}

function showGlobe() {
  ui.closeSettings();
  closeDay();
  openGlobe(state.place);
}

function tick() {
  if (!state.weather || document.hidden) return;
  const current = now();
  const minute = Math.floor(current / 60000);
  if (minute === state.lastMinute) return;
  state.lastMinute = minute;
  ui.renderClock(state.weather);
  ui.updateFreshness(state.fetchedAt, state.stale);
  const hour = Math.floor(current / HOUR_MS);
  if (hour !== state.lastHour) {
    renderAll({ animate: false });
  } else {
    setForecastContext({ weather: state.weather, prefs: state.prefs, now: current, place: state.place });
    ui.renderSun({ weather: state.weather, now: current, place: state.place });
  }
  updateScene();
  if (state.shownBanner.startsWith('offline')) refreshBanner();
}

function observeLazySections() {
  const targets = [
    [document.getElementById('insights'), () => {
      state.airVisible = true;
      maybeLoadAir();
    }],
    [document.getElementById('places'), () => {
      state.placesVisible = true;
      loadPlacesData();
    }],
  ];
  if (!('IntersectionObserver' in window)) {
    targets.forEach(([, run]) => run());
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const match = targets.find(([target]) => target === entry.target);
      if (match) match[1]();
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '320px 0px' });
  targets.forEach(([target]) => observer.observe(target));
}

function bindLifecycle() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    tick();
    if (state.place && (state.needsRefresh || Date.now() - state.fetchedAt >= REFRESH_INTERVAL)) {
      state.needsRefresh = false;
      refresh({ quiet: true });
    }
  });
  window.addEventListener('online', () => {
    state.dismissedBanner = '';
    refreshBanner();
    ui.toast('Back online');
    if (state.errorPlace) loadPlace(state.errorPlace, { force: true });
    else if (state.place && (state.stale || Date.now() - state.fetchedAt >= REFRESH_INTERVAL)) refresh();
  });
  window.addEventListener('offline', () => {
    state.dismissedBanner = '';
    refreshBanner();
  });
  onReducedMotionChange(() => {
    if (!state.prefs.motion) {
      applyMotion();
      syncPrefsUI();
    }
  });
  setInterval(tick, 5000);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  if (window.location.protocol !== 'https:' && !local) return;
  const register = () => navigator.serviceWorker.register('sw.js').catch(() => {});
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

async function startup() {
  const params = new URLSearchParams(window.location.search);
  const scene = params.get('scene');
  if (scene && previewScene(scene)) {
    state.preview = scene;
    ui.setPreviewValue(scene);
  }

  const fromUrl = placeFromUrl(params);
  if (fromUrl) {
    loadPlace(fromUrl);
    return;
  }

  const last = store.getLastPlace();
  if (last && last.source === 'search') {
    loadPlace(last);
    return;
  }

  const permission = await getPermissionState();
  if (permission === 'granted') {
    locate({ silent: true, fallback: last || defaultPlace() });
    return;
  }

  if (last && last.source === 'geo') {
    loadPlace({ ...last, source: 'search' });
    return;
  }

  loadPlace(defaultPlace());
  if (navigator.onLine === false) refreshBanner();
}

function init() {
  document.documentElement.dataset.app = 'ready';
  applyTheme();
  const motion = effectiveMotion();
  document.documentElement.dataset.motion = motion;

  engine = createWeatherEngine(document.getElementById('sky'), {
    onFlash: ui.setFlash,
    onStrike: (strike) => sound.strike(strike),
    onPalette: ui.applyScenePalette,
  });
  engine.setMotion(motion);
  engine.setScene(introScene(), { instant: true });
  sound.setScene(introScene());

  ui.initUI({
    onLocate: () => locate(),
    onFocusSearch: () => focusSearch(),
    onRefresh: () => refresh(),
    onUnit: setUnit,
    onWindUnit: setWind,
    onTheme: setTheme,
    onMotion: setMotion,
    onPreview: setPreview,
    onToggleFavorite: toggleFavorite,
    onRemoveFavorite: removeFavorite,
    onSelectPlace: selectPlace,
    onRetry: () => {
      if (state.errorPlace) loadPlace(state.errorPlace, { force: true });
      else if (state.place) refresh();
    },
    onBack: () => {
      if (!state.weather) return;
      state.errorPlace = null;
      ui.showView('dashboard');
      renderAll({ animate: false });
      updateScene();
    },
    onClearData: clearData,
    onSettingsOpen: syncPrefsUI,
    onSound: (on) => setSound(on),
    onToggleSound: () => setSound(!state.prefs.sound),
    onVolume: setVolume,
    onBannerDismiss: () => {
      state.dismissedBanner = state.shownBanner;
    },
  });
  ui.fillPreviewOptions(PREVIEW_SCENES);
  initForecast({
    onSelectHour: (time) => {
      state.selectedHour = time;
    },
  });
  initTrends();
  initGlobe({
    getUnit: () => state.prefs.unit,
    getWind: () => state.prefs.wind,
    getMarkersSync: globeMarkers,
    getMarkers: globeMarkersLive,
    fetchPoint,
    onOpenPlace: (place) => selectPlace(place),
    onOpen: () => engine.pause(),
    onClose: () => engine.resume(),
  });
  ['globe-btn', 'hero-globe', 'places-globe'].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.addEventListener('click', showGlobe);
  });
  initSearch({
    onSelect: selectPlace,
    onLocate: () => locate(),
    getRecents: store.getRecents,
    getFavorites: store.getFavorites,
  });

  syncPrefsUI();
  ui.renderWelcome({ popular: POPULAR_PLACES, recents: store.getRecents() });
  bindLifecycle();
  bindSkyInteraction();
  armSoundOnGesture();
  observeLazySections();
  registerServiceWorker();
  startup();
}

init();
