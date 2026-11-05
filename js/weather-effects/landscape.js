import { TAU, clamp, darken, mixRgb, rgba, seeded } from './utils.js';

const RIDGES = [
  { z: 30, base: 0.73, amp: 0.105, seed: 7, octaves: [[1.15, 1], [2.7, 0.5], [5.6, 0.2], [12.4, 0.07]], ridged: true, depth: 0.22, key: 'ridge1', snow: 1, mist: 1 },
  { z: 50, base: 0.81, amp: 0.062, seed: 19, octaves: [[1.7, 1], [3.9, 0.38], [8.6, 0.12]], ridged: false, depth: 0.5, key: 'ridge2', snow: 0.75, mist: 0.75 },
  { z: 70, base: 0.895, amp: 0.036, seed: 41, octaves: [[1.25, 1], [3.1, 0.42], [7.4, 0.1]], ridged: false, depth: 1, key: 'ridge3', snow: 0.55, mist: 0 },
];

const STEP = 6;
const PAD = 32;

export function createLandscape() {
  const ridges = RIDGES.map((spec) => {
    const random = seeded(spec.seed);
    return {
      spec,
      phases: spec.octaves.map(() => random() * TAU),
      ys: new Float32Array(0),
      fill: null,
      line: null,
      minY: 0,
      gradient: null,
      mist: null,
      version: -1,
    };
  });
  let width = 0;
  let height = 0;

  function build(env) {
    width = env.w;
    height = env.h;
    const scale = Math.max(width, 900);
    const count = Math.ceil((width + PAD * 2) / STEP) + 2;
    ridges.forEach((ridge) => {
      const { spec, phases } = ridge;
      const ys = new Float32Array(count);
      let minY = height;
      const fill = new Path2D();
      const line = new Path2D();
      const total = spec.octaves.reduce((sum, [, weight]) => sum + weight, 0);
      for (let i = 0; i < count; i += 1) {
        const x = -PAD + i * STEP;
        const u = x / scale;
        let sum = 0;
        spec.octaves.forEach(([freq, weight], k) => {
          const wave = spec.ridged
            ? Math.pow(1 - Math.abs(Math.sin(u * freq * Math.PI + phases[k])), 1.6)
            : Math.sin(u * freq * TAU + phases[k]) * 0.5 + 0.5;
          sum += wave * weight;
        });
        const y = height * spec.base - height * spec.amp * (sum / total);
        ys[i] = y;
        if (y < minY) minY = y;
        if (i === 0) {
          fill.moveTo(x, y);
          line.moveTo(x, y);
        } else {
          fill.lineTo(x, y);
          line.lineTo(x, y);
        }
      }
      fill.lineTo(width + PAD, height + 4);
      fill.lineTo(-PAD, height + 4);
      fill.closePath();
      Object.assign(ridge, { ys, fill, line, minY, version: -1 });
    });
  }

  function ridgeY(index, x) {
    const ridge = ridges[clamp(index, 0, ridges.length - 1)];
    if (!ridge.ys.length) return height;
    const f = (x + PAD) / STEP;
    const i = clamp(Math.floor(f), 0, ridge.ys.length - 2);
    const t = clamp(f - i, 0, 1);
    return ridge.ys[i] + (ridge.ys[i + 1] - ridge.ys[i]) * t;
  }

  function paint(ridge, env) {
    if (ridge.version === env.paletteVersion && ridge.gradient) return;
    const p = env.palette;
    const ctx = env.ctx;
    const color = p[ridge.spec.key];
    const top = mixRgb(color, p.horizon, 0.16 * (1 - ridge.spec.depth) + 0.04);
    const gradient = ctx.createLinearGradient(0, ridge.minY, 0, height);
    gradient.addColorStop(0, rgba(top, 1));
    gradient.addColorStop(1, rgba(darken(color, 0.25 + ridge.spec.depth * 0.15), 1));
    ridge.gradient = gradient;
    if (ridge.spec.mist > 0) {
      const base = height * ridge.spec.base;
      const mist = ctx.createLinearGradient(0, base - height * ridge.spec.amp * 0.6, 0, base + height * 0.06);
      const strength = clamp(p.haze * 1.6 + 0.08) * ridge.spec.mist;
      mist.addColorStop(0, rgba(p.horizon, 0));
      mist.addColorStop(0.7, rgba(p.horizon, strength * 0.7));
      mist.addColorStop(1, rgba(p.horizon, strength));
      ridge.mist = mist;
    } else {
      ridge.mist = null;
    }
    ridge.version = env.paletteVersion;
  }

  const layers = ridges.map((ridge) => ({
    z: ridge.spec.z,
    draw(ctx, env) {
      if (!ridge.fill) return;
      paint(ridge, env);
      const p = env.palette;
      const offset = -env.pointer.x * ridge.spec.depth * 14;
      ctx.save();
      ctx.translate(offset, 0);
      ctx.fillStyle = ridge.gradient;
      ctx.fill(ridge.fill);

      if (p.snow > 0.02) {
        ctx.save();
        ctx.clip(ridge.fill);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = rgba(p.snowcap, p.snow * 0.85 * ridge.spec.snow);
        ctx.lineWidth = 8 + ridge.spec.depth * 8;
        ctx.stroke(ridge.line);
        ctx.strokeStyle = rgba(p.snowcap, p.snow * 0.28 * ridge.spec.snow);
        ctx.lineWidth = 28 + ridge.spec.depth * 18;
        ctx.stroke(ridge.line);
        ctx.restore();
      }

      ctx.strokeStyle = rgba(mixRgb(p.horizon, p.glow, 0.5), 0.14 * (1 - ridge.spec.depth * 0.6));
      ctx.lineWidth = 1.2;
      ctx.stroke(ridge.line);

      if (ridge.mist) {
        ctx.fillStyle = ridge.mist;
        ctx.fillRect(-PAD, height * (ridge.spec.base - ridge.spec.amp * 0.6), width + PAD * 2, height * (ridge.spec.amp * 0.6 + 0.06));
      }
      ctx.restore();
    },
  }));

  function clip(ctx, index, env) {
    const ridge = ridges[Math.min(ridges.length - 1, Math.max(0, index))];
    if (!ridge.fill) return;
    ctx.translate(-env.pointer.x * ridge.spec.depth * 14, 0);
    ctx.clip(ridge.fill);
  }

  return {
    layers,
    ridgeY,
    clip,
    resize: build,
  };
}
