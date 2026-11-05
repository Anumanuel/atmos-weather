import { TAU, clamp, createCanvas, darken, lerp, mixRgb, rand, randInt, rgba } from './utils.js';

const SPRITE_SCALE = 0.5;

const supportsFilter = (() => {
  try {
    const probe = document.createElement('canvas').getContext('2d');
    return typeof probe.filter === 'string';
  } catch {
    return false;
  }
})();

function puff(g, x, y, r, rgb, alpha) {
  const grad = g.createRadialGradient(x, y - r * 0.15, 0, x, y, r);
  grad.addColorStop(0, rgba(rgb, alpha));
  grad.addColorStop(0.45, rgba(rgb, alpha * 0.72));
  grad.addColorStop(0.78, rgba(rgb, alpha * 0.22));
  grad.addColorStop(1, rgba(rgb, 0));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

function makeCloud({ width, height, light, shade, rim, rimAlpha, puffs, density }) {
  const canvas = createCanvas(width * SPRITE_SCALE, height * SPRITE_SCALE);
  const body = createCanvas(width * SPRITE_SCALE, height * SPRITE_SCALE);
  const b = body.getContext('2d');
  b.scale(SPRITE_SCALE, SPRITE_SCALE);
  const base = height * 0.72;
  const cx = width / 2;
  const usable = width * 0.4;

  for (let i = 0; i < puffs; i += 1) {
    const t = puffs === 1 ? 0 : (i / (puffs - 1)) * 2 - 1;
    const spread = clamp(t + rand(-0.1, 0.1), -1, 1);
    const edge = 1 - Math.abs(spread);
    const r = height * (0.1 + 0.2 * Math.pow(edge, 0.7)) * rand(0.85, 1.15);
    const x = cx + spread * usable;
    const y = base - r * 0.55 - edge * height * rand(0.06, 0.16);
    puff(b, x, y, r, light, density * 0.9);
  }

  const crowns = Math.round(puffs * 0.6);
  for (let i = 0; i < crowns; i += 1) {
    const spread = rand(-0.75, 0.75);
    const edge = 1 - Math.abs(spread);
    const r = height * rand(0.08, 0.16) * (0.6 + edge * 0.6);
    const x = cx + spread * usable;
    const y = base - height * (0.2 + edge * 0.3) + rand(-0.04, 0.04) * height;
    puff(b, x, y, r, light, density * 0.75);
  }

  const g = canvas.getContext('2d');
  if (supportsFilter) g.filter = `blur(${Math.max(2, Math.round(height * SPRITE_SCALE * 0.025))}px)`;
  g.drawImage(body, 0, 0);
  g.filter = 'none';
  g.scale(SPRITE_SCALE, SPRITE_SCALE);

  g.globalCompositeOperation = 'source-atop';
  const shading = g.createLinearGradient(0, height * 0.2, 0, base + height * 0.08);
  shading.addColorStop(0, rgba(shade, 0));
  shading.addColorStop(0.6, rgba(shade, 0.5));
  shading.addColorStop(1, rgba(shade, 0.92));
  g.fillStyle = shading;
  g.fillRect(0, 0, width, height);

  if (rim && rimAlpha > 0.01) {
    const rimGrad = g.createLinearGradient(0, 0, 0, height * 0.55);
    rimGrad.addColorStop(0, rgba(rim, rimAlpha));
    rimGrad.addColorStop(1, rgba(rim, 0));
    g.fillStyle = rimGrad;
    g.fillRect(0, 0, width, height);
  }

  g.globalCompositeOperation = 'destination-out';
  const bottom = g.createLinearGradient(0, base - height * 0.06, 0, height);
  bottom.addColorStop(0, 'rgba(0,0,0,0)');
  bottom.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = bottom;
  g.fillRect(0, base - height * 0.06, width, height);

  return { canvas, width, height };
}

function makeDeckTexture(light, shade) {
  const w = 512;
  const h = 210;
  const canvas = createCanvas(w, h);
  const g = canvas.getContext('2d');
  for (let i = 0; i < 90; i += 1) {
    const x = rand(0, w);
    const y = rand(h * 0.05, h * 0.85);
    const r = rand(18, 54);
    const color = mixRgb(light, shade, rand(0.2, 0.85));
    [-w, 0, w].forEach((shift) => {
      const grad = g.createRadialGradient(x + shift, y, 0, x + shift, y, r);
      grad.addColorStop(0, rgba(color, 0.5));
      grad.addColorStop(1, rgba(color, 0));
      g.fillStyle = grad;
      g.fillRect(x + shift - r, y - r, r * 2, r * 2);
    });
  }
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.7, 'rgba(0,0,0,0.8)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, w, h);
  return canvas;
}

const LAYERS = [
  { z: 20, share: 0.42, scale: [0.4, 0.65], alpha: [0.5, 0.72], speed: 5, depth: 0.3, y: [0.06, 0.4] },
  { z: 24, share: 0.34, scale: [0.65, 1], alpha: [0.74, 0.9], speed: 9, depth: 0.6, y: [0.02, 0.44] },
  { z: 28, share: 0.24, scale: [1, 1.5], alpha: [0.86, 1], speed: 15, depth: 1, y: [-0.08, 0.34] },
];

export function createClouds(cfg, env, { cover = 0.5, style = 'cumulus', deck = false, faint = false } = {}) {
  const palette = env.target;
  const storm = style === 'storm';
  const wisp = style === 'wisp';
  const golden = cfg.isDay ? cfg.golden || 0 : 0;
  const light = storm ? darken(palette.cloudLight, 0.08) : palette.cloudLight;
  const shade = mixRgb(palette.cloudShade, palette.glow, golden * 0.35);
  const rim = cfg.isDay ? (golden > 0.05 ? palette.glow : null) : palette.glow;
  const rimAlpha = cfg.isDay ? golden * 0.5 : 0.2 * (1 - clamp(cfg.cloudCover) * 0.5);

  const sprites = Array.from({ length: 6 }, () => {
    const width = rand(420, 760) * (storm ? 1.25 : 1);
    const height = width * rand(0.34, 0.48) * (wisp ? 0.5 : 1);
    return makeCloud({
      width,
      height,
      light,
      shade,
      rim,
      rimAlpha,
      puffs: wisp ? randInt(12, 16) : randInt(22, 32),
      density: wisp ? 0.5 : storm ? 0.98 : 0.92,
    });
  });

  const widthFactor = clamp(env.w / 1440, 0.55, 1.4);
  const total = Math.max(1, Math.round(lerp(1.5, 15, clamp(cover)) * widthFactor * (0.75 + 0.25 * env.quality)));
  const direction = cfg.windX < -0.05 ? -1 : 1;
  const windBoost = 1 + Math.abs(cfg.windX || 0) * 2.4;
  const mobileScale = env.mobile ? 0.68 : 1;
  const all = [];

  const layers = LAYERS.map((spec, layerIndex) => {
    const count = Math.max(layerIndex === 2 && cover < 0.2 ? 0 : 1, Math.round(total * spec.share));
    const clouds = [];
    for (let i = 0; i < count; i += 1) {
      const sprite = sprites[(i + layerIndex * 2) % sprites.length];
      const scaleBoost = deck && layerIndex === 2 ? rand(1.4, 2.1) : deck ? 1.2 : 1;
      const s = rand(spec.scale[0], spec.scale[1]) * scaleBoost * mobileScale;
      const sw = sprite.width * s;
      const sh = sprite.height * s;
      const yRange = deck ? [spec.y[0] - 0.1, spec.y[1] - 0.12] : spec.y;
      const slot = (i + rand(0.1, 0.9)) / count;
      const cloud = {
        sprite,
        sw,
        sh,
        x: lerp(-sw * 0.6, env.w - sw * 0.2, slot),
        y: env.h * rand(yRange[0], yRange[1]),
        alpha: rand(spec.alpha[0], spec.alpha[1]) * (faint ? 0.6 : 1),
        speed: spec.speed * rand(0.8, 1.25) * windBoost * direction,
        depth: spec.depth,
        kick: 0,
      };
      clouds.push(cloud);
      all.push(cloud);
    }
    return { spec, clouds };
  });

  const drawables = layers.map(({ spec, clouds }) => ({
    z: spec.z,
    resize(e, prevW, prevH) {
      if (!prevW || !prevH) return;
      clouds.forEach((c) => {
        c.x *= e.w / prevW;
        c.y *= e.h / prevH;
      });
    },
    update(dt, e) {
      let occlusion = e.shared.occlusion || 0;
      const sun = e.shared.sun;
      const gust = 1 + (e.gust || 0) * 0.7;
      const shadows = e.shared.cloudShadows;
      clouds.forEach((c) => {
        c.x += (c.speed * gust + c.kick) * dt;
        c.kick *= Math.exp(-dt * 1.4);
        if (shadows && c.depth > 0.5) shadows.push(c);
        if (c.speed > 0 && c.x > e.w + 40) c.x = -c.sw - rand(0, 160);
        else if (c.speed < 0 && c.x + c.sw < -40) c.x = e.w + rand(0, 160);
        if (sun) {
          const cx = c.x + c.sw * 0.5;
          const cy = c.y + c.sh * 0.55;
          const dx = (sun.x - cx) / (c.sw * 0.4);
          const dy = (sun.y - cy) / (c.sh * 0.32);
          const d = dx * dx + dy * dy;
          if (d < 1.4) occlusion = Math.max(occlusion, ((1.4 - d) / 1.4) * c.alpha * (0.5 + c.depth * 0.5));
        }
      });
      e.shared.occlusion = occlusion;
    },
    interact(x, y) {
      clouds.forEach((c) => {
        const cx = c.x + c.sw / 2;
        const cy = c.y + c.sh * 0.55;
        if (Math.abs(x - cx) < c.sw * 0.6 && Math.abs(y - cy) < c.sh * 0.7) c.kick += (cx >= x ? 1 : -1) * rand(90, 160);
      });
    },
    draw(ctx, e, alpha) {
      const px = -e.pointer.x * 18;
      const py = -e.pointer.y * 6;
      clouds.forEach((c) => {
        const a = alpha * c.alpha;
        if (a < 0.01) return;
        ctx.globalAlpha = a;
        ctx.drawImage(c.sprite.canvas, c.x + px * c.depth, c.y + py * c.depth, c.sw, c.sh);
      });
      ctx.globalAlpha = 1;
    },
  }));

  if (deck) {
    const strength = storm ? 0.92 : 0.78;
    const tile = makeDeckTexture(light, shade);
    let scroll = rand(0, 1024);
    const deckSpeed = (6 + Math.abs(cfg.windX || 0) * 26) * direction;
    drawables.push({
      z: 19,
      update(dt, e) {
        scroll += deckSpeed * (1 + (e.gust || 0) * 0.6) * dt;
      },
      draw(ctx, e, alpha) {
        const tw = 1024;
        const th = Math.min(e.h * 0.5, 420);
        const offset = ((scroll % tw) + tw) % tw;
        ctx.globalAlpha = alpha * (storm ? 0.5 : 0.42);
        for (let x = offset - tw; x < e.w; x += tw) ctx.drawImage(tile, x, -th * 0.12, tw, th);
        ctx.globalAlpha = 1;
      },
    });
    drawables.push({
      z: 18,
      draw(ctx, e, alpha) {
        const grad = ctx.createLinearGradient(0, 0, 0, e.h * 0.62);
        grad.addColorStop(0, rgba(palette.cloudShade, strength * alpha));
        grad.addColorStop(0.45, rgba(mixRgb(palette.cloudShade, palette.cloudLight, 0.35), strength * 0.55 * alpha));
        grad.addColorStop(1, rgba(palette.cloudLight, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, e.w, e.h * 0.62);
      },
    });
  }

  return drawables;
}
