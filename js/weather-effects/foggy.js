import { TAU, clamp, createCanvas, rand, rgba } from './utils.js';

const SCALE = 0.4;

function makeBand(width, height, rgb, puffs) {
  const canvas = createCanvas(width * SCALE, height * SCALE);
  const g = canvas.getContext('2d');
  g.scale(SCALE, SCALE);
  for (let i = 0; i < puffs; i += 1) {
    const x = rand(0.05, 0.95) * width;
    const y = height / 2 + rand(-0.16, 0.16) * height;
    const rx = rand(0.12, 0.3) * width;
    const ry = rand(0.25, 0.45) * height;
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    grad.addColorStop(0, rgba(rgb, 0.18));
    grad.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, rx, 0, TAU);
    g.fill();
    g.restore();
  }
  g.globalCompositeOperation = 'destination-in';
  const edges = g.createLinearGradient(0, 0, width, 0);
  edges.addColorStop(0, 'rgba(0,0,0,0)');
  edges.addColorStop(0.2, 'rgba(0,0,0,1)');
  edges.addColorStop(0.8, 'rgba(0,0,0,1)');
  edges.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = edges;
  g.fillRect(0, 0, width, height);
  return canvas;
}

const FOG_LAYERS = [
  { z: 40, y: 0.66, count: 3, alpha: 0.7, speed: 6, height: [0.16, 0.24] },
  { z: 60, y: 0.77, count: 3, alpha: 0.8, speed: 10, height: [0.16, 0.26] },
  { z: 80, y: 0.88, count: 3, alpha: 0.9, speed: 16, height: [0.18, 0.28] },
  { z: 96, y: 0.42, count: 2, alpha: 0.45, speed: 4, height: [0.22, 0.32] },
];

export function createFog(cfg, env, { density = 0.8, layers: layerCount = 4 } = {}) {
  const palette = env.target;
  const color = palette.fog;
  const d = clamp(density);
  const bandSprites = Array.from({ length: 3 }, () => makeBand(1600, 300, color, 36));
  const direction = (cfg.windX || 0) < -0.05 ? -1 : 1;
  const wind = 1 + Math.abs(cfg.windX || 0) * 1.5;
  const qualityCount = env.quality < 0.8 ? 0.67 : 1;

  const drawables = FOG_LAYERS.slice(0, layerCount).map((spec, index) => {
    const n = Math.max(1, Math.round(spec.count * qualityCount));
    const bands = Array.from({ length: n }, (_, i) => {
      const w = env.w * rand(1.2, 1.8);
      return {
        sprite: bandSprites[(i + index) % bandSprites.length],
        w,
        hf: rand(spec.height[0], spec.height[1]),
        x: -w * 0.2 + (i / n) * (env.w + w * 0.4) - w * 0.4,
        yf: spec.y + rand(-0.03, 0.03),
        speed: spec.speed * rand(0.7, 1.3) * wind * direction,
        ph: rand(0, TAU),
      };
    });
    return {
      z: spec.z,
      resize(e, prevW) {
        if (!prevW) return;
        bands.forEach((b) => {
          b.x *= e.w / prevW;
          b.w *= e.w / prevW;
        });
      },
      update(dt, e) {
        bands.forEach((b) => {
          b.x += b.speed * dt;
          if (b.speed > 0 && b.x > e.w) b.x = -b.w;
          else if (b.speed < 0 && b.x + b.w < 0) b.x = e.w;
        });
      },
      draw(ctx, e, alpha) {
        const a = spec.alpha * d * alpha;
        if (a < 0.01) return;
        bands.forEach((b) => {
          const h = e.h * b.hf;
          const y = e.h * b.yf - h / 2 + Math.sin(e.time * 0.08 + b.ph) * 8;
          ctx.globalAlpha = a;
          ctx.drawImage(b.sprite, b.x, y, b.w, h);
        });
        ctx.globalAlpha = 1;
      },
    };
  });

  drawables.push({
    z: 97,
    draw(ctx, e, alpha) {
      const grad = ctx.createLinearGradient(0, 0, 0, e.h);
      grad.addColorStop(0, rgba(color, 0.1 * d * alpha));
      grad.addColorStop(0.55, rgba(color, 0.26 * d * alpha));
      grad.addColorStop(1, rgba(color, 0.5 * d * alpha));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, e.w, e.h);
    },
  });

  return drawables;
}

export function createHaze(cfg, env, { amount = 0.2 } = {}) {
  const palette = env.target;
  return [{
    z: 96,
    draw(ctx, e, alpha) {
      const grad = ctx.createLinearGradient(0, e.h * 0.3, 0, e.h);
      grad.addColorStop(0, rgba(palette.fog, 0));
      grad.addColorStop(1, rgba(palette.fog, amount * alpha));
      ctx.fillStyle = grad;
      ctx.fillRect(0, e.h * 0.3, e.w, e.h * 0.7);
    },
  }];
}
