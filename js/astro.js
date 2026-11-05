import { DAY_MS, isNum, startOfDay } from './format.js';

const SYNODIC_MONTH = 29.530588853;
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

const PHASES = [
  [0.0339, 'New moon'],
  [0.216, 'Waxing crescent'],
  [0.284, 'First quarter'],
  [0.466, 'Waxing gibbous'],
  [0.534, 'Full moon'],
  [0.716, 'Waning gibbous'],
  [0.784, 'Last quarter'],
  [0.966, 'Waning crescent'],
  [1.01, 'New moon'],
];

export function moonPhase(epoch = Date.now()) {
  const days = (epoch - REFERENCE_NEW_MOON) / DAY_MS;
  const phase = (((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH) / SYNODIC_MONTH;
  const illumination = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
  const name = PHASES.find(([limit]) => phase < limit)[1];
  const daysToFull = ((0.5 - phase + 1) % 1) * SYNODIC_MONTH;
  return { phase, illumination, name, daysToFull };
}

export function subsolarPoint(epoch = Date.now()) {
  const date = new Date(epoch);
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (epoch - start) / DAY_MS;
  const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
  const b = (2 * Math.PI * (day - 81)) / 364;
  const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lon = -15 * (hours - 12 + equationOfTime / 60);
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { lat: declination, lon };
}

export function dayIndexFor(daily, nowWall) {
  if (!Array.isArray(daily) || !daily.length) return -1;
  const today = startOfDay(nowWall);
  const index = daily.findIndex((day) => day.date === today);
  if (index !== -1) return index;
  if (today < daily[0].date) return 0;
  return -1;
}

const FULL_DAY_SECONDS = 86340;

export function sunState(weather, nowWall) {
  const daily = weather && Array.isArray(weather.daily) ? weather.daily : [];
  const index = dayIndexFor(daily, nowWall);
  const today = index >= 0 ? daily[index] : null;
  if (!today) return { mode: 'unknown' };

  const { sunrise, sunset, daylight } = today;
  if (isNum(daylight) && daylight <= 0) return { mode: 'polar-night', today, index };
  if (isNum(daylight) && daylight >= FULL_DAY_SECONDS) return { mode: 'midnight-sun', today, index };
  if (!isNum(sunrise) || !isNum(sunset) || sunset <= sunrise) return { mode: 'unknown', today, index };

  const span = sunset - sunrise;
  const next = daily[index + 1];
  const prev = daily[index - 1];
  const nextSunrise = next && isNum(next.sunrise) ? next.sunrise : sunrise + DAY_MS;
  const prevSunset = prev && isNum(prev.sunset) ? prev.sunset : sunset - DAY_MS;

  if (nowWall < sunrise) {
    const nightSpan = sunrise - prevSunset;
    return {
      mode: 'before-sunrise',
      today,
      index,
      sunrise,
      sunset,
      span,
      untilSunrise: sunrise - nowWall,
      nightProgress: clamp01((nowWall - prevSunset) / nightSpan),
      fromEvent: Math.min(nowWall - prevSunset, sunrise - nowWall),
    };
  }

  if (nowWall > sunset) {
    const nightSpan = nextSunrise - sunset;
    return {
      mode: 'after-sunset',
      today,
      index,
      sunrise,
      sunset,
      span,
      nextSunrise,
      untilSunrise: nextSunrise - nowWall,
      nightProgress: clamp01((nowWall - sunset) / nightSpan),
      fromEvent: Math.min(nowWall - sunset, nextSunrise - nowWall),
    };
  }

  return {
    mode: 'day',
    today,
    index,
    sunrise,
    sunset,
    span,
    progress: clamp01((nowWall - sunrise) / span),
    remaining: sunset - nowWall,
    fromEvent: Math.min(nowWall - sunrise, sunset - nowWall),
  };
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
