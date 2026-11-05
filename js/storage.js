const PREFIX = 'atmos:';
const MAX_FAVORITES = 8;
const MAX_RECENTS = 6;

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    return;
  }
}

export const storage = { read, write, remove };

const validNumber = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function sanitizePlace(place) {
  if (!place || typeof place !== 'object') return null;
  if (!validNumber(place.lat, -90, 90) || !validNumber(place.lon, -180, 180)) return null;
  const text = (value, max = 120) => (typeof value === 'string' ? value.slice(0, max) : '');
  return {
    id: text(place.id, 60) || placeKey(place),
    name: text(place.name) || 'Unnamed place',
    admin1: text(place.admin1),
    country: text(place.country),
    countryCode: text(place.countryCode, 3).toUpperCase(),
    lat: place.lat,
    lon: place.lon,
    timezone: text(place.timezone, 64) || null,
    source: place.source === 'geo' || place.source === 'default' ? place.source : 'search',
  };
}

export function placeKey(place) {
  return `${Number(place.lat).toFixed(2)},${Number(place.lon).toFixed(2)}`;
}

function readPlaces(key) {
  const list = read(key, []);
  if (!Array.isArray(list)) return [];
  return list.map(sanitizePlace).filter(Boolean);
}

export const DEFAULT_PREFS = {
  unit: 'c',
  wind: 'kmh',
  theme: 'auto',
  motion: null,
};

export function getPrefs() {
  const stored = read('prefs', {});
  const prefs = { ...DEFAULT_PREFS };
  if (stored && typeof stored === 'object') {
    if (stored.unit === 'c' || stored.unit === 'f') prefs.unit = stored.unit;
    if (['kmh', 'mph', 'ms'].includes(stored.wind)) prefs.wind = stored.wind;
    if (['auto', 'dark', 'light'].includes(stored.theme)) prefs.theme = stored.theme;
    if (['off', 'calm', 'full'].includes(stored.motion)) prefs.motion = stored.motion;
  }
  return prefs;
}

export function savePrefs(prefs) {
  write('prefs', prefs);
}

export function getFavorites() {
  return readPlaces('favorites');
}

export function isFavorite(place) {
  const key = placeKey(place);
  return getFavorites().some((fav) => placeKey(fav) === key);
}

export function addFavorite(place) {
  const clean = sanitizePlace(place);
  if (!clean) return getFavorites();
  const key = placeKey(clean);
  const list = getFavorites().filter((fav) => placeKey(fav) !== key);
  list.push(clean);
  const trimmed = list.slice(-MAX_FAVORITES);
  write('favorites', trimmed);
  return trimmed;
}

export function removeFavorite(place) {
  const key = placeKey(place);
  const list = getFavorites().filter((fav) => placeKey(fav) !== key);
  write('favorites', list);
  return list;
}

export function getRecents() {
  return readPlaces('recents');
}

export function addRecent(place) {
  const clean = sanitizePlace(place);
  if (!clean) return getRecents();
  const key = placeKey(clean);
  const list = [clean, ...getRecents().filter((item) => placeKey(item) !== key)].slice(0, MAX_RECENTS);
  write('recents', list);
  return list;
}

export function getLastPlace() {
  return sanitizePlace(read('last', null));
}

export function setLastPlace(place) {
  const clean = sanitizePlace(place);
  if (clean) write('last', clean);
}

export function clearAll() {
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    return;
  }
}
