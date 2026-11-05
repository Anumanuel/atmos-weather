import { clamp, hexToRgb, lerp, mixRgb } from './utils.js';

const COLOR_KEYS = ['top', 'mid', 'bottom', 'horizon', 'ridge1', 'ridge2', 'ridge3', 'cloudLight', 'cloudShade', 'accent', 'deep', 'rain', 'fog', 'glow', 'snowcap'];
const NUMBER_KEYS = ['stars', 'snow', 'rainAlpha', 'haze'];

function palette(spec) {
  const out = {};
  COLOR_KEYS.forEach((key) => {
    out[key] = hexToRgb(spec[key] || spec.mid);
  });
  NUMBER_KEYS.forEach((key) => {
    out[key] = spec[key] ?? 0;
  });
  return out;
}

const BASE = {
  clear: {
    day: palette({ top: '#1667c9', mid: '#3f93e3', bottom: '#93caf2', horizon: '#e4f1f8', ridge1: '#6a98c2', ridge2: '#3d6c97', ridge3: '#1d3b5a', cloudLight: '#ffffff', cloudShade: '#c6d8ea', accent: '#ffd27a', deep: '#0d2a4a', rain: '#cfe0f0', fog: '#e6eef5', glow: '#fff1c9', snowcap: '#ffffff', stars: 0, rainAlpha: 0.45, haze: 0.05 }),
    night: palette({ top: '#030817', mid: '#0a1631', bottom: '#1a2c52', horizon: '#2b416e', ridge1: '#1a2747', ridge2: '#101a33', ridge3: '#070c1b', cloudLight: '#4c5d82', cloudShade: '#1b2440', accent: '#b9cdfa', deep: '#050a19', rain: '#a9c1e0', fog: '#3a4a6a', glow: '#dfe7ff', snowcap: '#b8c8e8', stars: 1, rainAlpha: 0.55, haze: 0.04 }),
  },
  partly: {
    day: palette({ top: '#2672c4', mid: '#559bdc', bottom: '#a4c9e8', horizon: '#dde9f1', ridge1: '#7299bd', ridge2: '#476e93', ridge3: '#233f5c', cloudLight: '#ffffff', cloudShade: '#b6c7d9', accent: '#ffd88d', deep: '#12304f', rain: '#cfe0f0', fog: '#e2ebf2', glow: '#fff1cf', snowcap: '#ffffff', stars: 0, rainAlpha: 0.45, haze: 0.06 }),
    night: palette({ top: '#050b1b', mid: '#0f1b35', bottom: '#212f4e', horizon: '#2e3f62', ridge1: '#1d2946', ridge2: '#131c33', ridge3: '#080d1a', cloudLight: '#56658a', cloudShade: '#1d2642', accent: '#bccdf5', deep: '#070c1a', rain: '#a9c1e0', fog: '#3c4a66', glow: '#dfe7ff', snowcap: '#b8c8e8', stars: 0.75, rainAlpha: 0.55, haze: 0.05 }),
  },
  overcast: {
    day: palette({ top: '#5c6a79', mid: '#7c8997', bottom: '#a7b1bb', horizon: '#c2c9cf', ridge1: '#7b8794', ridge2: '#56626e', ridge3: '#323c47', cloudLight: '#dde2e7', cloudShade: '#858f9c', accent: '#e9eef3', deep: '#222b35', rain: '#d4dce4', fog: '#d6dce1', glow: '#f1f3f5', snowcap: '#f4f6f8', stars: 0, rainAlpha: 0.45, haze: 0.12 }),
    night: palette({ top: '#06080d', mid: '#0f131b', bottom: '#1a202a', horizon: '#262d38', ridge1: '#1b222c', ridge2: '#12171f', ridge3: '#0a0d12', cloudLight: '#3b4352', cloudShade: '#161b24', accent: '#c6cfdd', deep: '#090c12', rain: '#a3b2c4', fog: '#2f3742', glow: '#cfd6e2', snowcap: '#9aa6b8', stars: 0.08, rainAlpha: 0.55, haze: 0.1 }),
  },
  fog: {
    day: palette({ top: '#8a939a', mid: '#a5acb1', bottom: '#c1c6c9', horizon: '#d5d8da', ridge1: '#adb4b8', ridge2: '#8e979d', ridge3: '#6c767d', cloudLight: '#e7eaec', cloudShade: '#aeb5ba', accent: '#f1ede4', deep: '#363e44', rain: '#e0e5e8', fog: '#dfe3e5', glow: '#f6f2e8', snowcap: '#f5f7f8', stars: 0, rainAlpha: 0.4, haze: 0.3 }),
    night: palette({ top: '#0d1114', mid: '#191e23', bottom: '#272f36', horizon: '#333c44', ridge1: '#2f373e', ridge2: '#232a30', ridge3: '#161b20', cloudLight: '#3e474f', cloudShade: '#1d2328', accent: '#cdd5dc', deep: '#0c1013', rain: '#9aa6b0', fog: '#4b555e', glow: '#d0d7de', snowcap: '#8e99a3', stars: 0.05, rainAlpha: 0.5, haze: 0.28 }),
  },
  rain: {
    day: palette({ top: '#3a4655', mid: '#515f6e', bottom: '#74818e', horizon: '#8d98a2', ridge1: '#65717d', ridge2: '#45505b', ridge3: '#252d36', cloudLight: '#a7b0b9', cloudShade: '#4b5561', accent: '#d8e2ec', deep: '#19212a', rain: '#c9d6e3', fog: '#a8b3bd', glow: '#e3e9ef', snowcap: '#e9eef3', stars: 0, rainAlpha: 0.5, haze: 0.12 }),
    night: palette({ top: '#02050a', mid: '#09101a', bottom: '#13202f', horizon: '#1c2a3c', ridge1: '#142030', ridge2: '#0d1723', ridge3: '#050a11', cloudLight: '#2e3a4b', cloudShade: '#0f1621', accent: '#a9c3e6', deep: '#04080e', rain: '#a6c0dc', fog: '#2a3747', glow: '#c6d6ea', snowcap: '#90a2b8', stars: 0, rainAlpha: 0.7, haze: 0.1 }),
  },
  storm: {
    day: palette({ top: '#191d29', mid: '#292e3f', bottom: '#424859', horizon: '#585d6d', ridge1: '#393f4f', ridge2: '#252a37', ridge3: '#11141c', cloudLight: '#5c6375', cloudShade: '#1c202b', accent: '#c9bbff', deep: '#101219', rain: '#b9c6d8', fog: '#4a5061', glow: '#d9d3ff', snowcap: '#c6ccd8', stars: 0, rainAlpha: 0.6, haze: 0.1 }),
    night: palette({ top: '#010205', mid: '#06080f', bottom: '#0f131e', horizon: '#161b29', ridge1: '#0e121c', ridge2: '#090c14', ridge3: '#030509', cloudLight: '#252b39', cloudShade: '#090c13', accent: '#b3a6ff', deep: '#020306', rain: '#9fb4d4', fog: '#1e2433', glow: '#c9c0ff', snowcap: '#7f8aa0', stars: 0, rainAlpha: 0.75, haze: 0.08 }),
  },
  snow: {
    day: palette({ top: '#6b7e95', mid: '#8ea1b5', bottom: '#bac8d6', horizon: '#d4dde6', ridge1: '#a5b4c4', ridge2: '#7d8ea1', ridge3: '#546578', cloudLight: '#dce4ed', cloudShade: '#8b99ad', accent: '#eef4fb', deep: '#243145', rain: '#e8eff7', fog: '#d9e2eb', glow: '#f6f9fc', snowcap: '#f4f8fc', stars: 0, snow: 0.85, rainAlpha: 0.45, haze: 0.14 }),
    night: palette({ top: '#07101e', mid: '#122238', bottom: '#243957', horizon: '#2f486c', ridge1: '#21334e', ridge2: '#16253a', ridge3: '#0b1525', cloudLight: '#3b4c65', cloudShade: '#142039', accent: '#c3d6f5', deep: '#070f1c', rain: '#c8d8ee', fog: '#33455f', glow: '#dbe6f7', snowcap: '#a7bddc', stars: 0.05, snow: 0.75, rainAlpha: 0.55, haze: 0.1 }),
  },
};

const GOLDEN = palette({ top: '#243569', mid: '#8a5a8b', bottom: '#f09a6a', horizon: '#ffd49c', ridge1: '#8a5e7e', ridge2: '#523d63', ridge3: '#241e3a', cloudLight: '#ffd6b6', cloudShade: '#9b6e8f', accent: '#ffb469', deep: '#22193a', rain: '#f0d4c4', fog: '#e8c0b0', glow: '#ffd59a', snowcap: '#ffe1cf', stars: 0, rainAlpha: 0.5, haze: 0.06 });
const TWILIGHT = palette({ top: '#0c1537', mid: '#2b2959', bottom: '#77486d', horizon: '#d6826a', ridge1: '#2c2546', ridge2: '#1b1832', ridge3: '#0c0b1a', cloudLight: '#8a6f92', cloudShade: '#2a2343', accent: '#ffb88a', deep: '#0d0d22', rain: '#c9b8cc', fog: '#5a4a68', glow: '#ffc39b', snowcap: '#d8c4d4', stars: 0.55, rainAlpha: 0.55, haze: 0.05 });
const INTRO = palette({ top: '#070d26', mid: '#1d2453', bottom: '#5d4775', horizon: '#df9277', ridge1: '#3a3260', ridge2: '#241f44', ridge3: '#0f0d22', cloudLight: '#b48fa8', cloudShade: '#3b2f55', accent: '#ffbf8f', deep: '#0d0c22', rain: '#c9c3d8', fog: '#6e5a7d', glow: '#ffd1a8', snowcap: '#e7d6e6', stars: 0.85, rainAlpha: 0.5, haze: 0.04 });
const MOONLIT = palette({ top: '#16244a', mid: '#2a3c68', bottom: '#41598a', horizon: '#5a72a0', ridge1: '#2b3b62', ridge2: '#1d2a4a', ridge3: '#0e1630', cloudLight: '#7d8db0', cloudShade: '#2b3858', accent: '#d4e0ff', deep: '#0b1328', rain: '#b9cbe6', fog: '#4f5f82', glow: '#e6ecff', snowcap: '#c9d6f0', stars: 0.7, rainAlpha: 0.6, haze: 0.05 });
const ICE = palette({ top: '#5a7896', mid: '#86a6c2', bottom: '#c3d9ea', horizon: '#e2eef7', ridge1: '#9db6cc', ridge2: '#7792ab', ridge3: '#4e6680', cloudLight: '#e6f0f8', cloudShade: '#8aa2ba', accent: '#e8f4ff', deep: '#22344a', rain: '#e2f0ff', fog: '#dbe8f3', glow: '#f2f8ff', snowcap: '#ffffff', stars: 0, rainAlpha: 0.5, haze: 0.12 });

const FAMILY = {
  clear: 'clear',
  'mostly-clear': 'clear',
  'partly-cloudy': 'partly',
  overcast: 'overcast',
  fog: 'fog',
  drizzle: 'rain',
  rain: 'rain',
  snow: 'snow',
  storm: 'storm',
};

const WARMTH = { clear: 1, partly: 0.85, overcast: 0.38, fog: 0.32, rain: 0.26, storm: 0.16, snow: 0.3 };

export function mixPalette(a, b, t) {
  const out = {};
  COLOR_KEYS.forEach((key) => {
    out[key] = mixRgb(a[key], b[key], t);
  });
  NUMBER_KEYS.forEach((key) => {
    out[key] = lerp(a[key], b[key], t);
  });
  return out;
}

export function copyPalette(source, target = {}) {
  COLOR_KEYS.forEach((key) => {
    target[key] = target[key] || [0, 0, 0];
    target[key][0] = source[key][0];
    target[key][1] = source[key][1];
    target[key][2] = source[key][2];
  });
  NUMBER_KEYS.forEach((key) => {
    target[key] = source[key];
  });
  return target;
}

export function easePalette(current, target, t) {
  let delta = 0;
  COLOR_KEYS.forEach((key) => {
    const c = current[key];
    const g = target[key];
    for (let i = 0; i < 3; i += 1) {
      const step = (g[i] - c[i]) * t;
      c[i] += step;
      delta = Math.max(delta, Math.abs(g[i] - c[i]));
    }
  });
  NUMBER_KEYS.forEach((key) => {
    current[key] += (target[key] - current[key]) * t;
    delta = Math.max(delta, Math.abs(target[key] - current[key]) * 255);
  });
  return delta;
}

export function getPalette(cfg) {
  if (cfg.kind === 'intro') return mixPalette(INTRO, INTRO, 0);
  const family = FAMILY[cfg.kind] || 'partly';
  const time = cfg.isDay ? 'day' : 'night';
  let p = BASE[family][time];

  if (cfg.kind === 'mostly-clear') p = mixPalette(p, BASE.partly[time], 0.4);
  if (cfg.kind === 'partly-cloudy' && cfg.cloudCover > 0.6) p = mixPalette(p, BASE.overcast[time], clamp((cfg.cloudCover - 0.6) * 1.2));
  if (cfg.kind === 'drizzle') p = mixPalette(p, BASE.overcast[time], 0.45);
  if (family === 'rain' && cfg.precip > 0.75) p = mixPalette(p, BASE.storm[time], clamp((cfg.precip - 0.75) * 2.4) * 0.6);
  if (cfg.kind !== 'fog' && cfg.fog > 0.1) p = mixPalette(p, BASE.fog[time], cfg.fog * 0.45);

  const warmth = WARMTH[family] ?? 0.4;
  if (cfg.isDay && cfg.golden > 0) p = mixPalette(p, GOLDEN, cfg.golden * warmth * 0.85);
  if (!cfg.isDay && cfg.twilight > 0) p = mixPalette(p, TWILIGHT, cfg.twilight * (0.35 + warmth * 0.45));
  if (cfg.freezing && cfg.isDay) p = mixPalette(p, ICE, 0.22);
  if (cfg.freezing && !cfg.isDay) p = mixPalette(p, mixPalette(ICE, BASE.snow.night, 0.85), 0.25);

  if (!cfg.isDay && cfg.moon && cfg.kind !== 'intro') {
    const moonlight = cfg.moon.illumination * (1 - Math.min(1, cfg.cloudCover || 0) * 0.7);
    p = mixPalette(p, MOONLIT, moonlight * 0.16);
  }
  const out = mixPalette(p, p, 0);
  if (!cfg.isDay && cfg.moon) out.stars *= 1 - cfg.moon.illumination * 0.32;
  if (family !== 'snow') out.snow = cfg.freezing ? 0.3 : 0;
  else out.snow = clamp(0.55 + cfg.precip * 0.45);
  if (cfg.cloudCover > 0) out.stars *= clamp(1 - cfg.cloudCover * 0.92, 0, 1);
  return out;
}
