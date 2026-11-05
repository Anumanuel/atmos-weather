import { buildUrl, fetchJson } from './api.js';
import { isNum } from './format.js';
import { placeKey } from './storage.js';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const cache = new Map();
const MAX_CACHE = 60;

const language = (() => {
  const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en';
  return lang.split('-')[0].toLowerCase() || 'en';
})();

function normalizePlace(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lat = isNum(raw.latitude) ? raw.latitude : null;
  const lon = isNum(raw.longitude) ? raw.longitude : null;
  if (lat === null || lon === null || typeof raw.name !== 'string' || !raw.name) return null;
  const place = {
    name: raw.name,
    admin1: typeof raw.admin1 === 'string' ? raw.admin1 : '',
    admin2: typeof raw.admin2 === 'string' ? raw.admin2 : '',
    country: typeof raw.country === 'string' ? raw.country : '',
    countryCode: typeof raw.country_code === 'string' ? raw.country_code.toUpperCase() : '',
    lat,
    lon,
    timezone: typeof raw.timezone === 'string' ? raw.timezone : null,
    population: isNum(raw.population) ? raw.population : 0,
    source: 'search',
  };
  place.id = raw.id ? String(raw.id) : placeKey(place);
  return place;
}

function remember(key, value) {
  cache.set(key, value);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
}

export async function searchPlaces(query, { signal, count = 8 } = {}) {
  const name = query.trim().replace(/\s+/g, ' ');
  if (name.length < 2) return [];
  const key = `${language}|${count}|${name.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);
  const url = buildUrl(GEOCODING_URL, { name, count, language, format: 'json' });
  const data = await fetchJson(url, { signal, timeout: 9000 });
  const results = Array.isArray(data.results) ? data.results.map(normalizePlace).filter(Boolean) : [];
  const unique = [];
  const seen = new Set();
  results.forEach((place) => {
    const id = `${place.name}|${place.admin1}|${place.countryCode}|${placeKey(place)}`;
    if (seen.has(id)) return;
    seen.add(id);
    unique.push(place);
  });
  remember(key, unique);
  return unique;
}

function levenshtein(a, b) {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 0;
  const row = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (s[i - 1] === t[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[t.length];
}

function matchesHint(place, hint) {
  const needle = hint.toLowerCase();
  return [place.country, place.countryCode, place.admin1, place.admin2]
    .filter(Boolean)
    .some((value) => value.toLowerCase().startsWith(needle) || value.toLowerCase() === needle);
}

export async function findPlaces(query, { signal } = {}) {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  const head = parts[0] || trimmed;
  const hint = parts.slice(1).join(' ');

  let results = await searchPlaces(trimmed, { signal });
  if (!results.length && hint) {
    const broad = await searchPlaces(head, { signal, count: 20 });
    results = broad.filter((place) => matchesHint(place, hint)).slice(0, 8);
    if (!results.length && broad.length) return { results: [], suggestions: broad.slice(0, 4) };
  }
  if (results.length) return { results, suggestions: [] };

  const word = head.split(' ')[0];
  for (const length of [5, 4, 3]) {
    if (word.length <= length) continue;
    const alternatives = await searchPlaces(word.slice(0, length), { signal, count: 12 });
    if (alternatives.length) {
      const ranked = alternatives
        .map((place) => ({ place, score: levenshtein(head, place.name) }))
        .sort((a, b) => a.score - b.score || b.place.population - a.place.population)
        .slice(0, 4)
        .map((item) => item.place);
      return { results: [], suggestions: ranked };
    }
  }
  return { results: [], suggestions: [] };
}

export async function reverseGeocode(lat, lon, { signal } = {}) {
  const url = buildUrl(REVERSE_URL, { latitude: lat.toFixed(4), longitude: lon.toFixed(4), localityLanguage: language });
  const data = await fetchJson(url, { signal, timeout: 6000 });
  const name = [data.city, data.locality, data.principalSubdivision, data.countryName]
    .find((value) => typeof value === 'string' && value.trim());
  if (!name) return null;
  return {
    name: name.trim(),
    admin1: typeof data.principalSubdivision === 'string' && data.principalSubdivision !== name ? data.principalSubdivision : '',
    country: typeof data.countryName === 'string' ? data.countryName : '',
    countryCode: typeof data.countryCode === 'string' ? data.countryCode.toUpperCase() : '',
  };
}

const TIMEZONE_CITIES = {
  'Asia/Kolkata': ['New Delhi', 'Delhi', 'India', 'IN', 28.63576, 77.22445, 330],
  'Asia/Calcutta': ['New Delhi', 'Delhi', 'India', 'IN', 28.63576, 77.22445, 330],
  'Asia/Colombo': ['Colombo', 'Western', 'Sri Lanka', 'LK', 6.93194, 79.84778, 330],
  'Asia/Kathmandu': ['Kathmandu', 'Bagmati', 'Nepal', 'NP', 27.70169, 85.3206, 345],
  'Asia/Dhaka': ['Dhaka', 'Dhaka', 'Bangladesh', 'BD', 23.7104, 90.40744, 360],
  'Asia/Karachi': ['Karachi', 'Sindh', 'Pakistan', 'PK', 24.8608, 67.0104, 300],
  'Asia/Dubai': ['Dubai', 'Dubai', 'United Arab Emirates', 'AE', 25.07725, 55.30927, 240],
  'Asia/Riyadh': ['Riyadh', 'Riyadh Region', 'Saudi Arabia', 'SA', 24.68773, 46.72185, 180],
  'Asia/Singapore': ['Singapore', '', 'Singapore', 'SG', 1.28967, 103.85007, 480],
  'Asia/Kuala_Lumpur': ['Kuala Lumpur', 'Kuala Lumpur', 'Malaysia', 'MY', 3.1412, 101.68653, 480],
  'Asia/Bangkok': ['Bangkok', 'Bangkok', 'Thailand', 'TH', 13.75398, 100.50144, 420],
  'Asia/Jakarta': ['Jakarta', 'Jakarta', 'Indonesia', 'ID', -6.21462, 106.84513, 420],
  'Asia/Manila': ['Manila', 'Metro Manila', 'Philippines', 'PH', 14.6042, 120.9822, 480],
  'Asia/Hong_Kong': ['Hong Kong', '', 'Hong Kong', 'HK', 22.27832, 114.17469, 480],
  'Asia/Shanghai': ['Shanghai', 'Shanghai', 'China', 'CN', 31.22222, 121.45806, 480],
  'Asia/Seoul': ['Seoul', 'Seoul', 'South Korea', 'KR', 37.566, 126.9784, 540],
  'Asia/Tokyo': ['Tokyo', 'Tokyo', 'Japan', 'JP', 35.6895, 139.69171, 540],
  'Australia/Sydney': ['Sydney', 'New South Wales', 'Australia', 'AU', -33.86785, 151.20732, 600],
  'Australia/Melbourne': ['Melbourne', 'Victoria', 'Australia', 'AU', -37.814, 144.96332, 600],
  'Australia/Perth': ['Perth', 'Western Australia', 'Australia', 'AU', -31.95224, 115.8614, 480],
  'Pacific/Auckland': ['Auckland', 'Auckland', 'New Zealand', 'NZ', -36.84853, 174.76349, 720],
  'Europe/London': ['London', 'England', 'United Kingdom', 'GB', 51.50853, -0.12574, 0],
  'Europe/Dublin': ['Dublin', 'Leinster', 'Ireland', 'IE', 53.33306, -6.24889, 0],
  'Europe/Lisbon': ['Lisbon', 'Lisbon', 'Portugal', 'PT', 38.71667, -9.13333, 0],
  'Europe/Paris': ['Paris', 'Île-de-France', 'France', 'FR', 48.85341, 2.3488, 60],
  'Europe/Berlin': ['Berlin', 'Berlin', 'Germany', 'DE', 52.52437, 13.41053, 60],
  'Europe/Madrid': ['Madrid', 'Madrid', 'Spain', 'ES', 40.4165, -3.70256, 60],
  'Europe/Rome': ['Rome', 'Lazio', 'Italy', 'IT', 41.89193, 12.51133, 60],
  'Europe/Amsterdam': ['Amsterdam', 'North Holland', 'Netherlands', 'NL', 52.37403, 4.88969, 60],
  'Europe/Stockholm': ['Stockholm', 'Stockholm', 'Sweden', 'SE', 59.32938, 18.06871, 60],
  'Europe/Warsaw': ['Warsaw', 'Masovia', 'Poland', 'PL', 52.22977, 21.01178, 60],
  'Europe/Athens': ['Athens', 'Attica', 'Greece', 'GR', 37.98376, 23.72784, 120],
  'Europe/Istanbul': ['Istanbul', 'Istanbul', 'Türkiye', 'TR', 41.01384, 28.94966, 180],
  'Europe/Moscow': ['Moscow', 'Moscow', 'Russia', 'RU', 55.75222, 37.61556, 180],
  'Africa/Cairo': ['Cairo', 'Cairo', 'Egypt', 'EG', 30.06263, 31.24967, 120],
  'Africa/Lagos': ['Lagos', 'Lagos', 'Nigeria', 'NG', 6.45407, 3.39467, 60],
  'Africa/Nairobi': ['Nairobi', 'Nairobi', 'Kenya', 'KE', -1.28333, 36.81667, 180],
  'Africa/Johannesburg': ['Johannesburg', 'Gauteng', 'South Africa', 'ZA', -26.20227, 28.04363, 120],
  'America/New_York': ['New York', 'New York', 'United States', 'US', 40.71427, -74.00597, -300],
  'America/Toronto': ['Toronto', 'Ontario', 'Canada', 'CA', 43.70011, -79.4163, -300],
  'America/Chicago': ['Chicago', 'Illinois', 'United States', 'US', 41.85003, -87.65005, -360],
  'America/Mexico_City': ['Mexico City', 'Mexico City', 'Mexico', 'MX', 19.42847, -99.12766, -360],
  'America/Denver': ['Denver', 'Colorado', 'United States', 'US', 39.73915, -104.9847, -420],
  'America/Los_Angeles': ['Los Angeles', 'California', 'United States', 'US', 34.05223, -118.24368, -480],
  'America/Vancouver': ['Vancouver', 'British Columbia', 'Canada', 'CA', 49.24966, -123.11934, -480],
  'America/Sao_Paulo': ['São Paulo', 'São Paulo', 'Brazil', 'BR', -23.5475, -46.63611, -180],
  'America/Argentina/Buenos_Aires': ['Buenos Aires', 'Buenos Aires', 'Argentina', 'AR', -34.61315, -58.37723, -180],
  'America/Bogota': ['Bogotá', 'Bogota D.C.', 'Colombia', 'CO', 4.60971, -74.08175, -300],
  'America/Lima': ['Lima', 'Lima', 'Peru', 'PE', -12.04318, -77.02824, -300],
};

export function defaultPlace() {
  let zone = '';
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    zone = '';
  }
  let entry = TIMEZONE_CITIES[zone];
  if (!entry) {
    const offset = -new Date().getTimezoneOffset();
    entry = Object.values(TIMEZONE_CITIES).reduce((best, item) => (Math.abs(item[6] - offset) < Math.abs(best[6] - offset) ? item : best), TIMEZONE_CITIES['Europe/London']);
  }
  const [name, admin1, country, countryCode, lat, lon] = entry;
  const place = { name, admin1, country, countryCode, lat, lon, timezone: null, source: 'default' };
  place.id = placeKey(place);
  return place;
}

export const POPULAR_PLACES = [
  { name: 'London', admin1: 'England', country: 'United Kingdom', countryCode: 'GB', lat: 51.50853, lon: -0.12574, timezone: 'Europe/London' },
  { name: 'Tokyo', admin1: 'Tokyo', country: 'Japan', countryCode: 'JP', lat: 35.6895, lon: 139.69171, timezone: 'Asia/Tokyo' },
  { name: 'New York', admin1: 'New York', country: 'United States', countryCode: 'US', lat: 40.71427, lon: -74.00597, timezone: 'America/New_York' },
  { name: 'Mumbai', admin1: 'Maharashtra', country: 'India', countryCode: 'IN', lat: 19.07283, lon: 72.88261, timezone: 'Asia/Kolkata' },
  { name: 'Bengaluru', admin1: 'Karnataka', country: 'India', countryCode: 'IN', lat: 12.97194, lon: 77.59369, timezone: 'Asia/Kolkata' },
  { name: 'Dubai', admin1: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE', lat: 25.07725, lon: 55.30927, timezone: 'Asia/Dubai' },
  { name: 'Paris', admin1: 'Île-de-France', country: 'France', countryCode: 'FR', lat: 48.85341, lon: 2.3488, timezone: 'Europe/Paris' },
  { name: 'Sydney', admin1: 'New South Wales', country: 'Australia', countryCode: 'AU', lat: -33.86785, lon: 151.20732, timezone: 'Australia/Sydney' },
].map((place) => ({ ...place, id: placeKey(place), source: 'search' }));
