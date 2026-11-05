const WMO = {
  0: { label: 'Clear sky', short: 'Clear', group: 'clear' },
  1: { label: 'Mainly clear', short: 'Mainly clear', group: 'mostly-clear' },
  2: { label: 'Partly cloudy', short: 'Partly cloudy', group: 'partly-cloudy' },
  3: { label: 'Overcast', short: 'Overcast', group: 'overcast' },
  45: { label: 'Fog', short: 'Fog', group: 'fog', fog: 0.8 },
  48: { label: 'Depositing rime fog', short: 'Rime fog', group: 'fog', fog: 0.95, freezing: true },
  51: { label: 'Light drizzle', short: 'Drizzle', group: 'drizzle', precip: 'rain', intensity: 0.25 },
  53: { label: 'Moderate drizzle', short: 'Drizzle', group: 'drizzle', precip: 'rain', intensity: 0.45 },
  55: { label: 'Dense drizzle', short: 'Heavy drizzle', group: 'drizzle', precip: 'rain', intensity: 0.65 },
  56: { label: 'Light freezing drizzle', short: 'Freezing drizzle', group: 'drizzle', precip: 'rain', intensity: 0.3, freezing: true },
  57: { label: 'Dense freezing drizzle', short: 'Freezing drizzle', group: 'drizzle', precip: 'rain', intensity: 0.6, freezing: true },
  61: { label: 'Slight rain', short: 'Light rain', group: 'rain', precip: 'rain', intensity: 0.35 },
  63: { label: 'Moderate rain', short: 'Rain', group: 'rain', precip: 'rain', intensity: 0.6 },
  65: { label: 'Heavy rain', short: 'Heavy rain', group: 'rain', precip: 'rain', intensity: 0.9 },
  66: { label: 'Light freezing rain', short: 'Freezing rain', group: 'rain', precip: 'rain', intensity: 0.4, freezing: true },
  67: { label: 'Heavy freezing rain', short: 'Freezing rain', group: 'rain', precip: 'rain', intensity: 0.8, freezing: true },
  71: { label: 'Slight snowfall', short: 'Light snow', group: 'snow', precip: 'snow', intensity: 0.3 },
  73: { label: 'Moderate snowfall', short: 'Snow', group: 'snow', precip: 'snow', intensity: 0.6 },
  75: { label: 'Heavy snowfall', short: 'Heavy snow', group: 'snow', precip: 'snow', intensity: 0.95 },
  77: { label: 'Snow grains', short: 'Snow grains', group: 'snow', precip: 'grains', intensity: 0.45 },
  80: { label: 'Slight rain showers', short: 'Showers', group: 'rain', precip: 'rain', intensity: 0.4, showers: true },
  81: { label: 'Moderate rain showers', short: 'Showers', group: 'rain', precip: 'rain', intensity: 0.65, showers: true },
  82: { label: 'Violent rain showers', short: 'Heavy showers', group: 'rain', precip: 'rain', intensity: 1, showers: true },
  85: { label: 'Slight snow showers', short: 'Snow showers', group: 'snow', precip: 'snow', intensity: 0.45, showers: true },
  86: { label: 'Heavy snow showers', short: 'Snow showers', group: 'snow', precip: 'snow', intensity: 0.9, showers: true },
  95: { label: 'Thunderstorm', short: 'Thunderstorm', group: 'storm', precip: 'rain', intensity: 0.8, lightning: 0.75 },
  96: { label: 'Thunderstorm with slight hail', short: 'Storm & hail', group: 'storm', precip: 'hail', intensity: 0.85, lightning: 0.85 },
  99: { label: 'Thunderstorm with heavy hail', short: 'Storm & hail', group: 'storm', precip: 'hail', intensity: 1, lightning: 1 },
};

const DEFAULT_CLOUD = {
  clear: 0.05,
  'mostly-clear': 0.25,
  'partly-cloudy': 0.5,
  overcast: 0.95,
  fog: 0.6,
  drizzle: 0.9,
  rain: 0.95,
  snow: 0.9,
  storm: 1,
};

function inferFromCloud(cloud) {
  if (typeof cloud !== 'number' || !Number.isFinite(cloud)) return 2;
  if (cloud < 15) return 0;
  if (cloud < 40) return 1;
  if (cloud < 80) return 2;
  return 3;
}

export function getCodeInfo(code, cloudCover) {
  const known = typeof code === 'number' && WMO[code];
  const resolvedCode = known ? code : inferFromCloud(cloudCover);
  const info = WMO[resolvedCode];
  return {
    code: resolvedCode,
    known: Boolean(known),
    label: known ? info.label : 'Conditions unavailable',
    short: known ? info.short : 'Unknown',
    group: info.group,
    precip: info.precip || null,
    intensity: info.intensity || 0,
    freezing: Boolean(info.freezing),
    showers: Boolean(info.showers),
    lightning: info.lightning || 0,
    fog: info.fog || 0,
    defaultCloud: DEFAULT_CLOUD[info.group] ?? 0.5,
  };
}

export function iconFor(code, isDay = true, cloudCover) {
  const info = getCodeInfo(code, cloudCover);
  switch (info.group) {
    case 'clear':
      return isDay ? 'wi-clear-day' : 'wi-clear-night';
    case 'mostly-clear':
    case 'partly-cloudy':
      return isDay ? 'wi-partly-day' : 'wi-partly-night';
    case 'overcast':
      return 'wi-cloudy';
    case 'fog':
      return 'wi-fog';
    case 'drizzle':
      return info.freezing ? 'wi-freezing' : 'wi-drizzle';
    case 'rain':
      if (info.freezing) return 'wi-freezing';
      return info.intensity >= 0.85 ? 'wi-heavy-rain' : 'wi-rain';
    case 'snow':
      return 'wi-snow';
    case 'storm':
      return info.precip === 'hail' ? 'wi-hail' : 'wi-storm';
    default:
      return 'wi-cloudy';
  }
}

export function isWet(code) {
  const info = getCodeInfo(code);
  return Boolean(info.precip);
}

export const WMO_CODES = Object.freeze(Object.keys(WMO).map(Number));
