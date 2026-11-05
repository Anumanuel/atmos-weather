import { ApiError, buildUrl, fetchJson } from './api.js';
import { isNum, parseWall } from './format.js';
import { storage, placeKey } from './storage.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

export const REFRESH_INTERVAL = 10 * 60 * 1000;
const AIR_MAX_AGE = 30 * 60 * 1000;
const MAX_STORED_FORECASTS = 6;

const CURRENT_VARS = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'precipitation', 'rain', 'showers',
  'snowfall', 'weather_code', 'cloud_cover', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
  'visibility', 'uv_index', 'dew_point_2m',
];

const HOURLY_VARS = [
  'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'precipitation_probability', 'precipitation',
  'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'cloud_cover', 'visibility', 'is_day', 'uv_index', 'pressure_msl',
];

const DAILY_VARS = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset', 'uv_index_max',
  'precipitation_probability_max', 'wind_speed_10m_max', 'wind_direction_10m_dominant', 'precipitation_sum', 'daylight_duration',
];

const memory = new Map();
const airMemory = new Map();

const num = (value) => (isNum(value) ? value : null);
const at = (series, index) => (Array.isArray(series) ? num(series[index]) : null);
const flag = (value) => (value === 1 ? true : value === 0 ? false : null);

export function normalizeForecast(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError('The forecast response had an unexpected shape.', { kind: 'parse' });
  }

  const c = raw.current && typeof raw.current === 'object' ? raw.current : {};
  const current = {
    time: parseWall(c.time),
    interval: num(c.interval) ?? 900,
    temp: num(c.temperature_2m),
    feels: num(c.apparent_temperature),
    humidity: num(c.relative_humidity_2m),
    dewPoint: num(c.dew_point_2m),
    isDay: flag(c.is_day),
    precip: num(c.precipitation),
    rain: num(c.rain),
    showers: num(c.showers),
    snowfall: num(c.snowfall),
    code: num(c.weather_code),
    cloud: num(c.cloud_cover),
    pressure: num(c.pressure_msl),
    windSpeed: num(c.wind_speed_10m),
    windDir: num(c.wind_direction_10m),
    gusts: num(c.wind_gusts_10m),
    visibility: num(c.visibility),
    uv: num(c.uv_index),
  };

  const h = raw.hourly && typeof raw.hourly === 'object' ? raw.hourly : {};
  const hourTimes = Array.isArray(h.time) ? h.time : [];
  const hourly = hourTimes
    .map((time, i) => ({
      time: parseWall(time),
      temp: at(h.temperature_2m, i),
      feels: at(h.apparent_temperature, i),
      humidity: at(h.relative_humidity_2m, i),
      pop: at(h.precipitation_probability, i),
      precip: at(h.precipitation, i),
      code: at(h.weather_code, i),
      wind: at(h.wind_speed_10m, i),
      windDir: at(h.wind_direction_10m, i),
      gusts: at(h.wind_gusts_10m, i),
      cloud: at(h.cloud_cover, i),
      visibility: at(h.visibility, i),
      isDay: flag(Array.isArray(h.is_day) ? h.is_day[i] : null),
      uv: at(h.uv_index, i),
      pressure: at(h.pressure_msl, i),
    }))
    .filter((hour) => hour.time !== null);

  const d = raw.daily && typeof raw.daily === 'object' ? raw.daily : {};
  const dayTimes = Array.isArray(d.time) ? d.time : [];
  const daily = dayTimes
    .map((time, i) => ({
      date: parseWall(time),
      code: at(d.weather_code, i),
      max: at(d.temperature_2m_max, i),
      min: at(d.temperature_2m_min, i),
      sunrise: parseWall(Array.isArray(d.sunrise) ? d.sunrise[i] : null),
      sunset: parseWall(Array.isArray(d.sunset) ? d.sunset[i] : null),
      uvMax: at(d.uv_index_max, i),
      popMax: at(d.precipitation_probability_max, i),
      windMax: at(d.wind_speed_10m_max, i),
      windDir: at(d.wind_direction_10m_dominant, i),
      precipSum: at(d.precipitation_sum, i),
      daylight: at(d.daylight_duration, i),
    }))
    .filter((day) => day.date !== null);

  if (current.time === null && !hourly.length && !daily.length) {
    throw new ApiError('The forecast did not include any usable data.', { kind: 'parse' });
  }

  if (current.time === null && hourly.length) {
    const first = hourly[0];
    Object.assign(current, {
      time: first.time,
      temp: current.temp ?? first.temp,
      humidity: current.humidity ?? first.humidity,
      code: current.code ?? first.code,
      cloud: current.cloud ?? first.cloud,
      isDay: current.isDay ?? first.isDay,
    });
  }

  return {
    timezone: typeof raw.timezone === 'string' ? raw.timezone : null,
    tzAbbr: typeof raw.timezone_abbreviation === 'string' ? raw.timezone_abbreviation : '',
    utcOffset: num(raw.utc_offset_seconds) ?? 0,
    elevation: num(raw.elevation),
    lat: num(raw.latitude),
    lon: num(raw.longitude),
    current,
    hourly,
    daily,
  };
}

function storedKey(key) {
  return `wx:${key}`;
}

function persist(key, entry) {
  storage.write(storedKey(key), entry);
  const index = storage.read('wx-index', []);
  const list = [key, ...(Array.isArray(index) ? index.filter((item) => item !== key) : [])];
  list.slice(MAX_STORED_FORECASTS).forEach((old) => storage.remove(storedKey(old)));
  storage.write('wx-index', list.slice(0, MAX_STORED_FORECASTS));
}

export function readCachedForecast(place) {
  const key = placeKey(place);
  if (memory.has(key)) return memory.get(key);
  const entry = storage.read(storedKey(key), null);
  if (!entry || typeof entry !== 'object' || !isNum(entry.fetchedAt) || !entry.data || typeof entry.data !== 'object') return null;
  if (!entry.data.current || !Array.isArray(entry.data.hourly) || !Array.isArray(entry.data.daily)) return null;
  memory.set(key, entry);
  return entry;
}

export async function getForecast(place, { signal, force = false, maxAge = REFRESH_INTERVAL } = {}) {
  const key = placeKey(place);
  const cached = readCachedForecast(place);

  if (!force && cached && Date.now() - cached.fetchedAt < maxAge) {
    return { data: cached.data, fetchedAt: cached.fetchedAt, origin: 'cache', stale: false };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (cached) return { data: cached.data, fetchedAt: cached.fetchedAt, origin: 'offline', stale: true };
    throw new ApiError('You are offline and there is no saved forecast for this place yet.', { kind: 'network' });
  }

  const url = buildUrl(FORECAST_URL, {
    latitude: place.lat.toFixed(4),
    longitude: place.lon.toFixed(4),
    current: CURRENT_VARS,
    hourly: HOURLY_VARS,
    daily: DAILY_VARS,
    forecast_days: 7,
    timezone: 'auto',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
  });

  const raw = await fetchJson(url, { signal, timeout: 14000 });
  const data = normalizeForecast(raw);
  const entry = { data, fetchedAt: Date.now() };
  memory.set(key, entry);
  persist(key, entry);
  return { data, fetchedAt: entry.fetchedAt, origin: 'network', stale: false };
}

export async function getAirQuality(place, { signal } = {}) {
  const key = placeKey(place);
  const cached = airMemory.get(key);
  if (cached && Date.now() - cached.fetchedAt < AIR_MAX_AGE) return cached.data;
  const url = buildUrl(AIR_URL, {
    latitude: place.lat.toFixed(4),
    longitude: place.lon.toFixed(4),
    current: ['us_aqi', 'european_aqi', 'pm2_5', 'pm10', 'ozone', 'nitrogen_dioxide'],
    timezone: 'auto',
  });
  const raw = await fetchJson(url, { signal, timeout: 10000 });
  const c = raw && raw.current && typeof raw.current === 'object' ? raw.current : {};
  const data = {
    time: parseWall(c.time),
    usAqi: num(c.us_aqi),
    euAqi: num(c.european_aqi),
    pm25: num(c.pm2_5),
    pm10: num(c.pm10),
    ozone: num(c.ozone),
    no2: num(c.nitrogen_dioxide),
  };
  airMemory.set(key, { data, fetchedAt: Date.now() });
  return data;
}

export async function getPlacesNow(places, { signal } = {}) {
  if (!places.length) return [];
  const url = buildUrl(FORECAST_URL, {
    latitude: places.map((place) => place.lat.toFixed(4)),
    longitude: places.map((place) => place.lon.toFixed(4)),
    current: ['temperature_2m', 'weather_code', 'is_day', 'cloud_cover', 'wind_speed_10m'],
    timezone: 'auto',
  });
  const raw = await fetchJson(url, { signal, timeout: 12000 });
  const list = Array.isArray(raw) ? raw : [raw];
  return places.map((place, i) => {
    const item = list[i] && typeof list[i] === 'object' ? list[i] : {};
    const c = item.current && typeof item.current === 'object' ? item.current : {};
    return {
      key: placeKey(place),
      temp: num(c.temperature_2m),
      code: num(c.weather_code),
      isDay: flag(c.is_day),
      cloud: num(c.cloud_cover),
      wind: num(c.wind_speed_10m),
      timezone: typeof item.timezone === 'string' ? item.timezone : null,
      utcOffset: num(item.utc_offset_seconds),
    };
  });
}

export function clearWeatherCache() {
  memory.clear();
  airMemory.clear();
}
