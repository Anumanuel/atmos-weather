import { clamp, rand, rgba, softDot } from './utils.js';

function displace(points, depth, spread) {
  let current = points;
  let amount = spread;
  for (let level = 0; level < depth; level += 1) {
    const next = [current[0]];
    for (let i = 1; i < current.length; i += 1) {
      const [ax, ay] = current[i - 1];
      const [bx, by] = current[i];
      next.push([(ax + bx) / 2 + (Math.random() - 0.5) * amount, (ay + by) / 2 + (Math.random() - 0.5) * amount * 0.3]);
      next.push(current[i]);
    }
    current = next;
    amount *= 0.55;
  }
  return current;
}

function makeBolt(e, targetX = null) {
  const x0 = targetX === null ? rand(e.w * 0.12, e.w * 0.88) : targetX + rand(-60, 60);
  const y0 = rand(e.h * 0.1, e.h * 0.24);
  const x1 = targetX === null ? x0 + rand(-0.18, 0.18) * e.w : targetX;
  const y1 = e.ridgeY(rand() < 0.5 ? 0 : 1, x1) + 4;
  const trunk = displace([[x0, y0], [x1, y1]], 6, Math.hypot(x1 - x0, y1 - y0) * 0.22);
  const branches = [];
  const count = Math.floor(rand(1, 4));
  for (let i = 0; i < count; i += 1) {
    const start = trunk[Math.floor(rand(0.15, 0.65) * trunk.length)];
    const dir = Math.random() < 0.5 ? -1 : 1;
    const end = [start[0] + dir * rand(50, 150), start[1] + rand(60, 170)];
    branches.push(displace([start, end], 4, 40));
  }
  return { trunk, branches, origin: [x0, y0] };
}

function strokePath(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
}

export function createLightning(cfg, env, { frequency = 0.75 } = {}) {
  const palette = env.target;
  const glow = softDot(256, palette.glow, { core: 0.1 });
  const flashColor = [222, 228, 255];
  const state = { timer: rand(1.5, 4), age: 99, bolt: null, sheet: false, pulses: [] };

  const intensityAt = (age) => state.pulses.reduce((sum, [start, power]) => (age >= start ? sum + power * Math.exp(-(age - start) * 11) : sum), 0);

  const strike = (e, targetX = null) => {
    state.age = 0;
    state.sheet = targetX === null && Math.random() < 0.38;
    state.bolt = state.sheet ? null : makeBolt(e, targetX);
    state.pulses = state.sheet ? [[0, 0.55]] : [[0, 1], [rand(0.12, 0.2), rand(0.4, 0.65)]];
    state.origin = state.bolt ? state.bolt.origin : [rand(e.w * 0.1, e.w * 0.9), rand(e.h * 0.08, e.h * 0.25)];
    if (e.onStrike) {
      const close = !state.sheet && (targetX !== null || Math.random() < 0.45);
      e.onStrike({ close, power: state.sheet ? rand(0.4, 0.6) : rand(0.75, 1) });
    }
  };

  return [
    {
      z: 27,
      interact(x, y, e) {
        if (e.motion.flashes <= 0 || state.age < 1.6) return;
        strike(e, x);
        state.timer = Math.max(state.timer, rand(3, 6));
      },
      update(dt, e) {
        if (e.motion.flashes <= 0) {
          e.flash = 0;
          return;
        }
        if (dt > 0) {
          state.timer -= dt;
          state.age += dt;
          if (state.timer <= 0) {
            strike(e);
            state.timer = rand(4.5, 12) / clamp(frequency, 0.3, 1.2);
          }
        }
        const level = state.age < 1.2 ? intensityAt(state.age) : 0;
        e.flash = clamp(level) * e.motion.flashes;
      },
      draw(ctx, e, alpha) {
        const level = e.flash * alpha;
        if (level < 0.02) return;
        ctx.globalCompositeOperation = 'lighter';
        const [ox, oy] = state.origin;
        const r = Math.min(e.w, e.h) * 0.6;
        ctx.globalAlpha = clamp(level * 0.8);
        ctx.drawImage(glow, ox - r, oy - r * 0.7, r * 2, r * 1.4);
        if (state.bolt && state.age < 0.45) {
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.strokeStyle = rgba(palette.glow, 0.35 * level);
          ctx.lineWidth = 7;
          strokePath(ctx, state.bolt.trunk);
          ctx.strokeStyle = `rgba(255,255,255,${clamp(level).toFixed(3)})`;
          ctx.lineWidth = 2;
          strokePath(ctx, state.bolt.trunk);
          ctx.lineWidth = 1;
          state.bolt.branches.forEach((branch) => strokePath(ctx, branch));
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      },
    },
    {
      z: 100,
      draw(ctx, e, alpha) {
        const level = e.flash * alpha;
        if (level < 0.02) return;
        ctx.fillStyle = rgba(flashColor, level * 0.24);
        ctx.fillRect(0, 0, e.w, e.h);
      },
    },
  ];
}
