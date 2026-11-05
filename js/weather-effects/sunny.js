import { TAU, areaFactor, clamp, createCanvas, lerp, lighten, rand, rgba, smooth, softDot } from './utils.js';

export function skyArcPosition(progress, env) {
  const p = clamp(progress ?? 0.5);
  const narrow = env.w < 720;
  const xMin = narrow ? 0.2 : 0.14;
  const xMax = narrow ? 0.84 : 0.86;
  const yTop = narrow ? 0.24 : 0.17;
  const yLow = narrow ? 0.48 : 0.55;
  const lift = Math.sin(p * Math.PI);
  return { x: env.w * lerp(xMin, xMax, p), y: env.h * lerp(yLow, yTop, lift), lift };
}

function makeGlow(rgb) {
  const size = 256;
  const canvas = createCanvas(size, size);
  const g = canvas.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, rgba(rgb, 1));
  grad.addColorStop(0.05, rgba(rgb, 0.85));
  grad.addColorStop(0.16, rgba(rgb, 0.38));
  grad.addColorStop(0.38, rgba(rgb, 0.11));
  grad.addColorStop(0.7, rgba(rgb, 0.03));
  grad.addColorStop(1, rgba(rgb, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return canvas;
}

function makeRays(rgb) {
  const size = 512;
  const canvas = createCanvas(size, size);
  const g = canvas.getContext('2d');
  const c = size / 2;
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, rgba(rgb, 0.9));
  grad.addColorStop(0.25, rgba(rgb, 0.35));
  grad.addColorStop(1, rgba(rgb, 0));
  g.fillStyle = grad;
  const count = 18;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * TAU + rand(-0.08, 0.08);
    const spread = rand(0.018, 0.06);
    const reach = c * rand(0.7, 1);
    g.beginPath();
    g.moveTo(c, c);
    g.arc(c, c, reach, angle - spread, angle + spread);
    g.closePath();
    g.fill();
  }
  return canvas;
}

export function createSun(cfg, env, { veiled = false } = {}) {
  const palette = env.target;
  const glow = makeGlow(palette.glow);
  const rays = veiled ? null : makeRays(palette.glow);
  const discColor = lighten(palette.glow, 0.45);
  let config = cfg;
  const start = skyArcPosition(cfg.sunProgress, env);
  const state = { x: start.x, y: start.y, lift: start.lift, vis: veiled ? 0.3 : 1, rot: rand(0, TAU), type: 'sun', flare: 0 };

  return [{
    z: 10,
    configure(next) {
      config = next;
    },
    resize(e) {
      const p = skyArcPosition(config.sunProgress, e);
      Object.assign(state, { x: p.x, y: p.y, lift: p.lift });
    },
    interact(x, y) {
      if (Math.hypot(x - state.x, y - state.y) < 110) state.flare = 1;
    },
    update(dt, e) {
      const target = skyArcPosition(config.sunProgress, e);
      state.x = smooth(state.x, target.x, 0.8, dt);
      state.y = smooth(state.y, target.y, 0.8, dt);
      state.lift = target.lift;
      const occlusion = clamp(e.shared.lastOcclusion || 0);
      const visible = (veiled ? 0.3 : 1) * (1 - occlusion * 0.72);
      state.vis = dt > 0 ? smooth(state.vis, visible, 2.2, dt) : visible;
      state.rot += dt * (0.02 + state.flare * 0.4);
      state.flare = Math.max(0, state.flare - dt * 0.7);
      e.shared.sun = state;
    },
    draw(ctx, e, alpha) {
      const a = alpha * state.vis;
      if (a < 0.01) return;
      const px = state.x - e.pointer.x * 6;
      const py = state.y - e.pointer.y * 4;
      const low = clamp(1 - state.lift * 1.35);
      const size = Math.min(e.w, e.h);

      ctx.globalCompositeOperation = 'lighter';
      const glowRadius = size * (0.78 + low * 0.3);
      ctx.globalAlpha = a * (0.5 + low * 0.15);
      ctx.drawImage(glow, px - glowRadius, py - glowRadius, glowRadius * 2, glowRadius * 2);
      if (state.flare > 0.01) {
        const burst = size * (0.35 + (1 - state.flare) * 0.9);
        ctx.globalAlpha = a * state.flare * 0.75;
        ctx.drawImage(glow, px - burst, py - burst, burst * 2, burst * 2);
      }

      if (rays) {
        const reach = size * 0.9;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(state.rot);
        ctx.globalAlpha = a * 0.15;
        ctx.drawImage(rays, -reach, -reach, reach * 2, reach * 2);
        ctx.rotate(-state.rot * 2.4);
        ctx.globalAlpha = a * 0.08;
        ctx.drawImage(rays, -reach * 0.68, -reach * 0.68, reach * 1.36, reach * 1.36);
        ctx.restore();
      }

      if (rays && state.vis > 0.55 && !e.mobile) {
        const cx = e.w * 0.5;
        const cy = e.h * 0.55;
        [[0.6, 26, 0.05], [0.95, 12, 0.07], [1.4, 46, 0.035]].forEach(([k, r, o]) => {
          const gx = px + (cx - px) * k;
          const gy = py + (cy - py) * k;
          ctx.globalAlpha = a * o;
          ctx.drawImage(glow, gx - r * 2, gy - r * 2, r * 4, r * 4);
        });
      }
      ctx.globalCompositeOperation = 'source-over';

      const radius = (e.mobile ? 22 : 30) * (1 + low * 0.3);
      const disc = ctx.createRadialGradient(px, py, 0, px, py, radius);
      disc.addColorStop(0, 'rgba(255,255,250,1)');
      disc.addColorStop(0.72, rgba(discColor, 1));
      disc.addColorStop(1, rgba(palette.glow, 0));
      ctx.globalAlpha = a * (veiled ? 0.6 : 1);
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    },
  }];
}

export function createMotes(cfg, env, { amount = 1 } = {}) {
  const palette = env.target;
  const sprite = softDot(32, palette.glow, { core: 0.2 });
  const count = Math.round(36 * amount * areaFactor(env) * env.motion.density);
  const spawn = (e, anywhere) => ({
    x: rand(0, e.w),
    y: anywhere ? rand(e.h * 0.05, e.h) : e.h + rand(0, 40),
    r: rand(0.7, 2.6),
    vy: -rand(4, 14),
    vx: rand(-3, 3),
    ph: rand(0, TAU),
    f: rand(0.25, 0.9),
    a: rand(0.25, 0.75),
  });
  const motes = Array.from({ length: count }, () => spawn(env, true));
  const sparks = [];
  let config = cfg;

  return [{
    z: 85,
    configure(next) {
      config = next;
    },
    resize(e, prevW, prevH) {
      if (!prevW || !prevH) return;
      motes.forEach((m) => {
        m.x *= e.w / prevW;
        m.y *= e.h / prevH;
      });
    },
    interact(x, y) {
      for (let i = 0; i < 18; i += 1) {
        const angle = rand(0, TAU);
        const speed = rand(30, 120);
        sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30, life: 0, max: rand(0.9, 1.8), r: rand(1.2, 3) });
      }
      if (sparks.length > 120) sparks.splice(0, sparks.length - 120);
    },
    update(dt, e) {
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const s = sparks[i];
        s.life += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= Math.exp(-dt * 1.6);
        s.vy = s.vy * Math.exp(-dt * 1.6) - 12 * dt;
        if (s.life > s.max) sparks.splice(i, 1);
      }
      const cur = e.cursor;
      motes.forEach((m) => {
        if (cur.active) {
          const dx = cur.x - m.x;
          const dy = cur.y - m.y;
          const d = Math.hypot(dx, dy);
          if (d < 180 && d > 8) {
            m.x += (dx / d) * 16 * dt;
            m.y += (dy / d) * 16 * dt;
          }
        }
        m.y += m.vy * dt;
        m.x += (m.vx + Math.sin(e.time * m.f + m.ph) * 6 + e.wind * 10) * dt;
        if (m.y < -20) Object.assign(m, spawn(e, false));
        if (m.x < -10) m.x = e.w + 10;
        else if (m.x > e.w + 10) m.x = -10;
      });
    },
    draw(ctx, e, alpha) {
      const warm = 0.55 + (config.golden || 0) * 0.7;
      ctx.globalCompositeOperation = 'lighter';
      motes.forEach((m) => {
        const twinkle = 0.55 + 0.45 * Math.sin(e.time * m.f * 2.2 + m.ph);
        const a = alpha * m.a * twinkle * warm * 0.7;
        if (a < 0.01) return;
        const s = m.r * 6;
        ctx.globalAlpha = a;
        ctx.drawImage(sprite, m.x - s / 2, m.y - s / 2, s, s);
      });
      sparks.forEach((spark) => {
        const fade = 1 - spark.life / spark.max;
        const s = spark.r * 7;
        ctx.globalAlpha = alpha * fade;
        ctx.drawImage(sprite, spark.x - s / 2, spark.y - s / 2, s, s);
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },
  }];
}
