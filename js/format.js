const formatters = new Map();
const HOUR_MS = 3600000;
const DAY_MS = 86400000;
const DASH = '—';

export { HOUR_MS, DAY_MS, DASH };

export const isNum = (value) => typeof value === 'number' && Number.isFinite(value);

function formatter(key, options, locale) {
  let instance = formatters.get(key);
  if (!instance) {
    instance = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, instance);
  }
  return instance;
}

export function parseWall(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h = '0', mi = '0'] = match;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi);
}

export function nowWall(timeZone, offsetSeconds) {
  if (timeZone) {
    try {
      const parts = formatter(`wall|${timeZone}`, {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }, 'en-US').formatToParts(new Date());
      const p = {};
      for (const part of parts) p[part.type] = part.value;
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    } catch {
      formatters.delete(`wall|${timeZone}`);
    }
  }
  return Date.now() + (isNum(offsetSeconds) ? offsetSeconds * 1000 : 0);
}

export function startOfDay(wall) {
  return Math.floor(wall / DAY_MS) * DAY_MS;
}

const uses12h = (() => {
  try {
    const cycle = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return cycle === 'h12' || cycle === 'h11';
  } catch {
    return false;
  }
})();

export function formatTime(wall) {
  if (!isNum(wall)) return DASH;
  return formatter('time', { timeZone: 'UTC', hour: uses12h ? 'numeric' : '2-digit', minute: '2-digit' }).format(new Date(wall));
}

export function formatHour(wall) {
  if (!isNum(wall)) return DASH;
  if (uses12h) return formatter('hour12', { timeZone: 'UTC', hour: 'numeric' }).format(new Date(wall));
  return formatter('hour24', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }).format(new Date(wall));
}

export function formatWeekday(wall, style = 'long') {
  if (!isNum(wall)) return DASH;
  return formatter(`wd|${style}`, { timeZone: 'UTC', weekday: style }).format(new Date(wall));
}

export function formatDate(wall, style = 'short') {
  if (!isNum(wall)) return DASH;
  const options = style === 'long'
    ? { timeZone: 'UTC', day: 'numeric', month: 'long' }
    : { timeZone: 'UTC', day: 'numeric', month: 'short' };
  return formatter(`date|${style}`, options).format(new Date(wall));
}

export function formatClock(wall) {
  if (!isNum(wall)) return DASH;
  const date = formatter('clock-date', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(wall));
  return `${date} · ${formatTime(wall)}`;
}

export function formatRealTime(epoch) {
  if (!isNum(epoch)) return DASH;
  return formatter('real-time', { hour: uses12h ? 'numeric' : '2-digit', minute: '2-digit' }).format(new Date(epoch));
}

export function formatRelative(epoch, now = Date.now()) {
  if (!isNum(epoch)) return DASH;
  const seconds = Math.round((epoch - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  let rtf;
  try {
    rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' });
  } catch {
    return `${Math.round(abs / 60)} min ago`;
  }
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}

export function formatDuration(ms, { short = false } = {}) {
  if (!isNum(ms) || ms < 0) return DASH;
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (short) return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function toUnitTemp(celsius, unit) {
  if (!isNum(celsius)) return null;
  return unit === 'f' ? celsius * 9 / 5 + 32 : celsius;
}

export function formatTemp(celsius, unit, { degree = true } = {}) {
  const value = toUnitTemp(celsius, unit);
  if (value === null) return DASH;
  const rounded = Math.round(value);
  const text = rounded < 0 ? `−${Math.abs(rounded)}` : String(rounded === 0 ? 0 : rounded);
  return degree ? `${text}°` : text;
}

export function formatTempDelta(deltaC, unit) {
  if (!isNum(deltaC)) return DASH;
  const value = unit === 'f' ? deltaC * 9 / 5 : deltaC;
  return `${Math.round(Math.abs(value))}°`;
}

export const WIND_UNITS = {
  kmh: { label: 'km/h', factor: 1 },
  mph: { label: 'mph', factor: 0.621371 },
  ms: { label: 'm/s', factor: 1 / 3.6 },
};

export function windValue(kmh, unit) {
  if (!isNum(kmh)) return null;
  const spec = WIND_UNITS[unit] || WIND_UNITS.kmh;
  const value = kmh * spec.factor;
  return unit === 'ms' ? Math.round(value * 10) / 10 : Math.round(value);
}

export function formatWind(kmh, unit, { withUnit = true } = {}) {
  const value = windValue(kmh, unit);
  if (value === null) return DASH;
  const label = (WIND_UNITS[unit] || WIND_UNITS.kmh).label;
  return withUnit ? `${value} ${label}` : String(value);
}

export function windUnitLabel(unit) {
  return (WIND_UNITS[unit] || WIND_UNITS.kmh).label;
}

export function formatDistance(meters, windUnit) {
  if (!isNum(meters)) return { value: DASH, unit: '' };
  if (windUnit === 'mph') {
    const miles = meters / 1609.344;
    return { value: miles >= 10 ? String(Math.round(miles)) : miles.toFixed(1), unit: 'mi' };
  }
  const km = meters / 1000;
  if (km < 1) return { value: String(Math.round(meters / 10) * 10), unit: 'm' };
  return { value: km >= 10 ? String(Math.round(km)) : km.toFixed(1), unit: 'km' };
}

export function formatPrecip(mm) {
  if (!isNum(mm)) return DASH;
  if (mm === 0) return '0 mm';
  if (mm < 0.1) return '<0.1 mm';
  return `${mm < 10 ? mm.toFixed(1) : Math.round(mm)} mm`;
}

export function formatPercent(value) {
  return isNum(value) ? `${Math.round(value)}%` : DASH;
}

const COMPASS_SHORT = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const COMPASS_LONG = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east', 'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'];
const COMPASS_ADJ = ['northerly', 'northerly', 'north-easterly', 'easterly', 'easterly', 'easterly', 'south-easterly', 'southerly', 'southerly', 'southerly', 'south-westerly', 'westerly', 'westerly', 'westerly', 'north-westerly', 'northerly'];

function compassIndex(degrees) {
  return Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16;
}

export function compass(degrees, style = 'short') {
  if (!isNum(degrees)) return DASH;
  const index = compassIndex(degrees);
  if (style === 'long') return COMPASS_LONG[index];
  if (style === 'adj') return COMPASS_ADJ[index];
  return COMPASS_SHORT[index];
}

export function formatCoords(lat, lon) {
  if (!isNum(lat) || !isNum(lon)) return '';
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

export function formatUtcOffset(seconds) {
  if (!isNum(seconds)) return '';
  const sign = seconds < 0 ? '−' : '+';
  const abs = Math.abs(seconds);
  const h = Math.floor(abs / 3600);
  const m = Math.round((abs % 3600) / 60);
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}
