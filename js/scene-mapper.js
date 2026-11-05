import { getCodeInfo } from './weather-codes.js';
import { moonPhase, sunState } from './astro.js';
import { isNum } from './format.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function describeScene(weather, place, nowWall) {
  const c = weather.current;
  const info = getCodeInfo(c.code, c.cloud);
  const sun = sunState(weather, nowWall);
  const isDay = c.isDay ?? (sun.mode === 'day' || sun.mode === 'midnight-sun');
  const cloudCover = isNum(c.cloud) ? clamp(c.cloud / 100) : info.defaultCloud;

  let golden = 0;
  let twilight = 0;
  let sunProgress = 0.5;
  let nightProgress = 0.5;
  const minutesFromEvent = isNum(sun.fromEvent) ? sun.fromEvent / 60000 : Infinity;

  if (sun.mode === 'day') {
    sunProgress = sun.progress;
    golden = clamp(1 - (minutesFromEvent - 10) / 60);
  } else if (sun.mode === 'before-sunrise' || sun.mode === 'after-sunset') {
    nightProgress = sun.nightProgress;
    twilight = clamp(1 - minutesFromEvent / 50);
  } else if (sun.mode === 'midnight-sun') {
    golden = 0.45;
  }

  if (isDay && (sun.mode === 'before-sunrise' || sun.mode === 'after-sunset')) {
    sunProgress = sun.mode === 'before-sunrise' ? 0.02 : 0.98;
    golden = 0.9;
  }
  if (!isDay && sun.mode === 'day') {
    nightProgress = sun.progress < 0.5 ? 0.97 : 0.03;
    twilight = 0.8;
  }

  let precip = info.intensity;
  if (precip > 0 && isNum(c.precip)) {
    const perHour = c.precip * (3600 / (c.interval || 900));
    const measured = clamp(Math.log1p(perHour) / Math.log1p(12));
    precip = clamp(Math.max(precip * 0.85, precip * 0.6 + measured * 0.4));
  }

  let windX = 0.12;
  if (isNum(c.windSpeed)) {
    const eastWest = isNum(c.windDir) ? -Math.sin((c.windDir * Math.PI) / 180) : 1;
    const sign = Math.abs(eastWest) < 0.2 ? 1 : Math.sign(eastWest);
    windX = sign * clamp(c.windSpeed / 40, 0.04, 1.6);
  }

  let fog = info.fog;
  if (info.group !== 'fog' && isNum(c.visibility)) {
    if (c.visibility < 1000) fog = Math.max(fog, 0.45);
    else if (c.visibility < 4000) fog = Math.max(fog, 0.22);
  }

  return {
    kind: info.group,
    code: info.code,
    label: info.label,
    isDay,
    golden: isDay ? golden : 0,
    twilight: isDay ? 0 : twilight,
    sunProgress,
    nightProgress,
    cloudCover,
    precip,
    precipType: info.precip,
    freezing: info.freezing,
    lightning: info.lightning,
    fog,
    windX,
    windSpeed: isNum(c.windSpeed) ? c.windSpeed : 0,
    gusts: isNum(c.gusts) ? c.gusts : isNum(c.windSpeed) ? c.windSpeed : 0,
    temp: isNum(c.temp) ? c.temp : null,
    moon: moonPhase(Date.now()),
    southern: place && isNum(place.lat) ? place.lat < 0 : false,
  };
}

const BASE = {
  golden: 0,
  twilight: 0,
  sunProgress: 0.42,
  nightProgress: 0.38,
  cloudCover: 0.5,
  precip: 0,
  precipType: null,
  freezing: false,
  lightning: 0,
  fog: 0,
  windX: 0.3,
  windSpeed: 12,
  gusts: 18,
  temp: 16,
  southern: false,
};

export const PREVIEW_SCENES = [
  { id: 'clear-day', label: 'Clear sky · day', cfg: { kind: 'clear', isDay: true, cloudCover: 0.06 } },
  { id: 'clear-sunset', label: 'Clear sky · golden hour', cfg: { kind: 'clear', isDay: true, cloudCover: 0.14, sunProgress: 0.95, golden: 0.95 } },
  { id: 'clear-night', label: 'Clear sky · night', cfg: { kind: 'clear', isDay: false, cloudCover: 0, temp: 9 } },
  { id: 'warm-night', label: 'Warm night · fireflies', cfg: { kind: 'mostly-clear', isDay: false, cloudCover: 0.2, temp: 22, windX: 0.1, windSpeed: 4 } },
  { id: 'partly-day', label: 'Partly cloudy · day', cfg: { kind: 'partly-cloudy', isDay: true, cloudCover: 0.5 } },
  { id: 'partly-night', label: 'Partly cloudy · night', cfg: { kind: 'partly-cloudy', isDay: false, cloudCover: 0.5 } },
  { id: 'windy', label: 'Strong wind · day', cfg: { kind: 'partly-cloudy', isDay: true, cloudCover: 0.45, windX: 1.4, windSpeed: 56, gusts: 85 } },
  { id: 'calm', label: 'Calm air · day', cfg: { kind: 'mostly-clear', isDay: true, cloudCover: 0.22, windX: 0.05, windSpeed: 2, gusts: 4 } },
  { id: 'overcast', label: 'Overcast · day', cfg: { kind: 'overcast', isDay: true, cloudCover: 1 } },
  { id: 'overcast-night', label: 'Overcast · night', cfg: { kind: 'overcast', isDay: false, cloudCover: 1 } },
  { id: 'fog', label: 'Fog · day', cfg: { kind: 'fog', isDay: true, cloudCover: 0.6, fog: 0.9, windX: 0.1 } },
  { id: 'fog-night', label: 'Fog · night', cfg: { kind: 'fog', isDay: false, cloudCover: 0.6, fog: 0.9, windX: 0.1 } },
  { id: 'drizzle', label: 'Drizzle', cfg: { kind: 'drizzle', isDay: true, cloudCover: 0.95, precip: 0.4, precipType: 'rain' } },
  { id: 'rain', label: 'Rain · day', cfg: { kind: 'rain', isDay: true, cloudCover: 1, precip: 0.6, precipType: 'rain', windX: 0.35 } },
  { id: 'rain-night', label: 'Heavy rain · night', cfg: { kind: 'rain', isDay: false, cloudCover: 1, precip: 0.92, precipType: 'rain', windX: -0.4 } },
  { id: 'freezing', label: 'Freezing rain', cfg: { kind: 'rain', isDay: true, cloudCover: 1, precip: 0.5, precipType: 'rain', freezing: true } },
  { id: 'storm', label: 'Thunderstorm · day', cfg: { kind: 'storm', isDay: true, cloudCover: 1, precip: 0.9, precipType: 'rain', lightning: 0.95, windX: 0.55 } },
  { id: 'storm-night', label: 'Thunderstorm · night', cfg: { kind: 'storm', isDay: false, cloudCover: 1, precip: 0.95, precipType: 'rain', lightning: 1, windX: 0.5 } },
  { id: 'hail', label: 'Thunderstorm with hail', cfg: { kind: 'storm', isDay: true, cloudCover: 1, precip: 1, precipType: 'hail', lightning: 1, windX: 0.4 } },
  { id: 'snow', label: 'Snow · day', cfg: { kind: 'snow', isDay: true, cloudCover: 0.95, precip: 0.6, precipType: 'snow', windX: 0.3 } },
  { id: 'snow-night', label: 'Heavy snow · night', cfg: { kind: 'snow', isDay: false, cloudCover: 1, precip: 0.95, precipType: 'snow', windX: -0.3 } },
];

export function previewScene(id) {
  const entry = PREVIEW_SCENES.find((scene) => scene.id === id);
  if (!entry) return null;
  return { ...BASE, ...entry.cfg, label: entry.label, moon: moonPhase(Date.now()), preview: true };
}

export function introScene() {
  return { ...BASE, kind: 'intro', isDay: false, cloudCover: 0.2, windX: 0.2, moon: moonPhase(Date.now()) };
}

export function paletteSwatch(code, isDay, cloud) {
  const info = getCodeInfo(code, cloud);
  const day = isDay !== false;
  const table = {
    clear: day ? ['#1667c9', '#3f93e3', '#93caf2'] : ['#030817', '#0a1631', '#1a2c52'],
    'mostly-clear': day ? ['#1e6cc6', '#4a98e0', '#9acbee'] : ['#040a1a', '#0d1934', '#1d2e50'],
    'partly-cloudy': day ? ['#2672c4', '#559bdc', '#a4c9e8'] : ['#050b1b', '#0f1b35', '#212f4e'],
    overcast: day ? ['#5c6a79', '#7c8997', '#a7b1bb'] : ['#06080d', '#0f131b', '#1a202a'],
    fog: day ? ['#8a939a', '#a5acb1', '#c1c6c9'] : ['#0d1114', '#191e23', '#272f36'],
    drizzle: day ? ['#4a5664', '#66727f', '#8b96a1'] : ['#04070c', '#0c131d', '#172231'],
    rain: day ? ['#3a4655', '#515f6e', '#74818e'] : ['#02050a', '#09101a', '#13202f'],
    snow: day ? ['#6b7e95', '#8ea1b5', '#bac8d6'] : ['#07101e', '#122238', '#243957'],
    storm: day ? ['#191d29', '#292e3f', '#424859'] : ['#010205', '#06080f', '#0f131e'],
  };
  const [top, mid, bottom] = table[info.group] || table['partly-cloudy'];
  const glow = info.group === 'clear' || info.group === 'mostly-clear' || info.group === 'partly-cloudy'
    ? (day ? 'rgba(255,214,140,0.9)' : 'rgba(225,232,255,0.85)')
    : 'rgba(255,255,255,0)';
  return { top, mid, bottom, glow };
}
