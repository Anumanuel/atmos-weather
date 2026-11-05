import { TAU, areaFactor, clamp, createCanvas, mixRgb, rand, rgba, softDot } from './utils.js';

const SNOW_LAYERS = [
  { z: 45, share: 0.45, size: [0.8, 1.6], speed: [20, 34], sway: [6, 14], alpha: 0.55, depth: 0.3 },
  { z: 65, share: 0.35, size: [1.5, 2.6], speed: [34, 56], sway: [10, 22], alpha: 0.8, depth: 0.6 },
  { z: 75, share: 0.2, size: [2.6, 4.6], speed: [54, 90], sway: [16, 32], alpha: 0.94, depth: 1, crystals: true },
];

function makeCrystal(size, rgb) {
  const canvas = createCanvas(size, size);
  const g = canvas.getContext('2d');
  const c = size / 2;
  const arm = size * 0.42;
  g.translate(c, c);
  g.strokeStyle = rgba(rgb, 0.95);
  g.lineWidth = size * 0.035;
  g.lineCap = 'round';
  g.shadowColor = rgba(rgb, 0.8);
  g.shadowBlur = size * 0.06;
  for (let i = 0; i < 6; i += 1) {
    g.save();
    g.rotate((i / 6) * TAU);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -arm);
    [0.45, 0.7].forEach((k) => {
      const b = arm * (1 - k) * 0.55;
      g.moveTo(0, -arm * k);
      g.lineTo(-b, -arm * k - b);
      g.moveTo(0, -arm * k);
      g.lineTo(b, -arm * k - b);
    });
    g.stroke();
    g.restore();
  }
  return canvas;
}

export function createSnow(cfg, env, { intensity = 0.6, grains = false } = {}) {
  const palette = env.target;
  const color = cfg.isDay ? [255, 255, 255] : mixRgb(palette.snowcap, [255, 255, 255], 0.45);
  const dot = softDot(32, color, { core: 0.45 });
  const crystal = makeCrystal(56, color);
  const base = grains ? 380 : 260;
  const total = Math.round(clamp(base * (0.25 + intensity) * areaFactor(env) * env.motion.density * env.quality, 40, 900));
  const speedBoost = (1 + intensity * 0.4) * (grains ? 2.6 : 1);
  const sizeScale = grains ? 0.55 : 1;
  const swayScale = grains ? 0.3 : 1;

  const make = (spec, e, anywhere) => ({
    x: rand(-20, e.w + 20),
    y: anywhere ? rand(-20, e.h) : rand(-60, -6),
    r: rand(spec.size[0], spec.size[1]) * sizeScale,
    v: rand(spec.speed[0], spec.speed[1]) * speedBoost,
    sway: rand(spec.sway[0], spec.sway[1]) * swayScale,
    f: rand(0.4, 1.3),
    ph: rand(0, TAU),
    a: rand(0.6, 1),
    rot: rand(0, TAU),
    vr: rand(-0.8, 0.8),
    ix: 0,
    iy: 0,
    crystal: Boolean(spec.crystals && !grains && Math.random() < 0.16),
  });

  const layers = SNOW_LAYERS.map((spec) => ({
    spec,
    flakes: Array.from({ length: Math.round(total * spec.share) }, () => make(spec, env, true)),
  }));

  return layers.map(({ spec, flakes }) => ({
    z: spec.z,
    interact(x, y) {
      flakes.forEach((f) => {
        const dx = f.x - x;
        const dy = f.y - y;
        const d = Math.hypot(dx, dy);
        if (d < 240 && d > 1) {
          const k = (1 - d / 240) * 420 * (0.5 + spec.depth * 0.5);
          f.ix += (dx / d) * k;
          f.iy += (dy / d) * k * 0.7;
          f.vr += rand(-3, 3);
        }
      });
    },
    resize(e, prevW, prevH) {
      if (!prevW || !prevH) return;
      flakes.forEach((f) => {
        f.x *= e.w / prevW;
        f.y *= e.h / prevH;
      });
    },
    update(dt, e) {
      const t = e.time;
      const push = (e.windNow ?? cfg.windX ?? 0) * 55;
      const cur = e.cursor;
      const damp = Math.exp(-dt * 1.8);
      for (let i = 0; i < flakes.length; i += 1) {
        const f = flakes[i];
        if (cur.active) {
          const dx = f.x - cur.x;
          const dy = f.y - cur.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 12100 && d2 > 1) {
            const d = Math.sqrt(d2);
            const force = (1 - d / 110) * 220 * spec.depth;
            f.ix += (dx / d) * force * dt;
            f.iy += (dy / d) * force * dt * 0.6;
          }
        }
        f.x += f.ix * dt;
        f.y += f.iy * dt;
        f.ix *= damp;
        f.iy *= damp;
        f.y += f.v * dt;
        f.x += (push * spec.depth + Math.sin(t * f.f + f.ph) * f.sway) * dt;
        f.rot += f.vr * dt;
        if (f.y > e.h + 12) Object.assign(f, make(spec, e, false));
        if (f.x < -30) f.x = e.w + 20;
        else if (f.x > e.w + 30) f.x = -20;
      }
    },
    draw(ctx, e, alpha) {
      const base = spec.alpha * alpha;
      if (base < 0.01) return;
      for (let i = 0; i < flakes.length; i += 1) {
        const f = flakes[i];
        ctx.globalAlpha = base * f.a;
        if (f.crystal) {
          const s = f.r * 4.2;
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.rotate(f.rot);
          ctx.drawImage(crystal, -s / 2, -s / 2, s, s);
          ctx.restore();
        } else {
          const s = f.r * 2.6;
          ctx.drawImage(dot, f.x - s / 2, f.y - s / 2, s, s);
        }
      }
      ctx.globalAlpha = 1;
    },
  }));
}

export function createFrost(cfg, env, { amount = 0.6 } = {}) {
  const palette = env.target;
  let gradient = null;
  let key = '';
  return [{
    z: 105,
    draw(ctx, e, alpha) {
      const nextKey = `${e.w}x${e.h}`;
      if (!gradient || key !== nextKey) {
        key = nextKey;
        const r = Math.hypot(e.w, e.h) / 2;
        gradient = ctx.createRadialGradient(e.w / 2, e.h / 2, r * 0.55, e.w / 2, e.h / 2, r);
        gradient.addColorStop(0, rgba(palette.snowcap, 0));
        gradient.addColorStop(1, rgba(palette.snowcap, 0.32 * amount));
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, e.w, e.h);
      ctx.globalAlpha = 1;
    },
  }];
}
