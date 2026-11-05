import { TAU, areaFactor, clamp, createCanvas, rand, rgba, smooth, softDot } from './utils.js';
import { skyArcPosition } from './sunny.js';

export function createStars(cfg, env, { density = 1 } = {}) {
  const count = Math.round(clamp(240 * areaFactor(env) * density, 50, 460));
  const bright = softDot(24, [235, 240, 255], { core: 0.15 });
  let stars = [];

  const seed = (e) => {
    stars = Array.from({ length: count }, () => {
      const big = Math.random() < 0.06;
      return {
        x: Math.random() * e.w,
        y: Math.pow(Math.random(), 1.25) * e.h * 0.78,
        s: big ? rand(1.4, 2.2) : rand(0.5, 1.25),
        a: big ? rand(0.75, 1) : rand(0.35, 0.85),
        f: rand(0.6, 2.4),
        ph: rand(0, TAU),
        big,
      };
    });
  };
  seed(env);

  return [{
    z: 5,
    resize(e) {
      seed(e);
    },
    draw(ctx, e, alpha) {
      const level = e.palette.stars * alpha;
      if (level < 0.02) return;
      const still = e.motion.speed === 0;
      const cur = e.cursor;
      ctx.fillStyle = '#eef2ff';
      stars.forEach((star) => {
        const twinkle = still ? 0.85 : 0.62 + 0.38 * Math.sin(e.time * star.f + star.ph);
        let boost = 1;
        if (cur.active) {
          const d = Math.hypot(star.x - cur.x, star.y - cur.y);
          if (d < 130) boost = 1 + (1 - d / 130) * 1.8;
        }
        const a = Math.min(1, level * star.a * twinkle * boost);
        if (a < 0.02) return;
        ctx.globalAlpha = a;
        if (star.big) {
          const s = star.s * 7;
          ctx.drawImage(bright, star.x - s / 2, star.y - s / 2, s, s);
          ctx.fillRect(star.x - 0.6, star.y - 0.6, 1.2, 1.2);
        } else {
          ctx.fillRect(star.x - star.s / 2, star.y - star.s / 2, star.s, star.s);
        }
      });
      ctx.globalAlpha = 1;
    },
  }];
}

export function createMilkyWay(cfg, env) {
  let sprite = null;

  const build = (e) => {
    const scale = 0.5;
    const w = e.w * scale;
    const h = e.h * 0.8 * scale;
    sprite = createCanvas(w, h);
    const g = sprite.getContext('2d');
    g.translate(w * 0.5, h * 0.55);
    g.rotate(-0.55);
    const length = Math.hypot(w, h);
    const band = g.createLinearGradient(0, -h * 0.22, 0, h * 0.22);
    band.addColorStop(0, 'rgba(170,180,255,0)');
    band.addColorStop(0.5, 'rgba(200,190,255,0.16)');
    band.addColorStop(1, 'rgba(170,180,255,0)');
    g.fillStyle = band;
    g.fillRect(-length / 2, -h * 0.22, length, h * 0.44);
    for (let i = 0; i < 900; i += 1) {
      const x = (Math.random() - 0.5) * length;
      const spread = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      const y = spread * h * 0.16;
      g.fillStyle = `rgba(235,235,255,${(Math.random() * 0.5 * (1 - Math.abs(spread))).toFixed(3)})`;
      const s = Math.random() < 0.08 ? 1.2 : 0.6;
      g.fillRect(x, y, s, s);
    }
    for (let i = 0; i < 14; i += 1) {
      const x = (Math.random() - 0.5) * length * 0.8;
      const y = (Math.random() - 0.5) * h * 0.12;
      const r = rand(8, 26);
      const dust = g.createRadialGradient(x, y, 0, x, y, r);
      dust.addColorStop(0, 'rgba(10,12,30,0.22)');
      dust.addColorStop(1, 'rgba(10,12,30,0)');
      g.fillStyle = dust;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  };
  build(env);

  return [{
    z: 6,
    resize(e) {
      build(e);
    },
    draw(ctx, e, alpha) {
      const a = e.palette.stars * alpha * 0.7;
      if (a < 0.02 || !sprite) return;
      ctx.globalAlpha = a;
      ctx.drawImage(sprite, 0, 0, e.w, e.h * 0.8);
      ctx.globalAlpha = 1;
    },
  }];
}

function makeMoon(radius, phase, southern) {
  const pad = 2;
  const ratio = 2;
  const size = Math.ceil((radius + pad) * 2 * ratio);
  const canvas = createCanvas(size, size);
  const g = canvas.getContext('2d');
  g.scale(ratio, ratio);
  const c = radius + pad;

  const lit = g.createRadialGradient(c - radius * 0.35, c - radius * 0.35, radius * 0.1, c, c, radius);
  lit.addColorStop(0, '#fffcf2');
  lit.addColorStop(1, '#d6d0be');
  g.fillStyle = lit;
  g.beginPath();
  g.arc(c, c, radius, 0, TAU);
  g.fill();

  [[-0.32, -0.18, 0.3], [0.22, 0.12, 0.24], [-0.06, 0.38, 0.17], [0.36, -0.32, 0.12], [-0.4, 0.3, 0.1]].forEach(([dx, dy, r]) => {
    g.fillStyle = 'rgba(118,112,98,0.16)';
    g.beginPath();
    g.arc(c + dx * radius, c + dy * radius, r * radius, 0, TAU);
    g.fill();
  });

  const waning = phase > 0.5;
  const local = waning ? 1 - phase : phase;
  g.save();
  g.translate(c, c);
  if (waning !== southern) g.scale(-1, 1);
  const rx = radius * Math.abs(Math.cos(TAU * local));
  g.beginPath();
  g.arc(0, 0, radius + 0.4, Math.PI / 2, Math.PI * 1.5, false);
  g.ellipse(0, 0, rx, radius + 0.4, 0, Math.PI * 1.5, Math.PI / 2, local >= 0.25);
  g.closePath();
  g.fillStyle = 'rgba(16,22,40,0.9)';
  g.fill();
  g.restore();
  return { canvas, size: size / ratio };
}

export function createMoon(cfg, env, { veiled = false } = {}) {
  const palette = env.target;
  const phase = cfg.moon ? cfg.moon.phase : 0.5;
  const illumination = cfg.moon ? cfg.moon.illumination : 1;
  const radius = env.mobile ? 17 : 23;
  const moon = makeMoon(radius, phase, Boolean(cfg.southern));
  const glow = softDot(128, palette.glow, { core: 0.08 });
  let config = cfg;
  const start = skyArcPosition(cfg.nightProgress, env);
  const state = { x: start.x, y: start.y, vis: veiled ? 0.25 : 1, type: 'moon' };

  return [{
    z: 11,
    configure(next) {
      config = next;
    },
    resize(e) {
      const p = skyArcPosition(config.nightProgress, e);
      state.x = p.x;
      state.y = p.y;
    },
    update(dt, e) {
      const target = skyArcPosition(config.nightProgress, e);
      state.x = smooth(state.x, target.x, 0.8, dt);
      state.y = smooth(state.y, target.y, 0.8, dt);
      const occlusion = clamp(e.shared.lastOcclusion || 0);
      const visible = (veiled ? 0.25 : 1) * (1 - occlusion * 0.7);
      state.vis = dt > 0 ? smooth(state.vis, visible, 2.2, dt) : visible;
      e.shared.sun = state;
    },
    draw(ctx, e, alpha) {
      const a = alpha * state.vis;
      if (a < 0.01) return;
      const px = state.x - e.pointer.x * 6;
      const py = state.y - e.pointer.y * 4;
      const halo = radius * (7 + illumination * 5);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * (0.12 + illumination * 0.28);
      ctx.drawImage(glow, px - halo, py - halo, halo * 2, halo * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a * (veiled ? 0.55 : 1);
      ctx.drawImage(moon.canvas, px - moon.size / 2, py - moon.size / 2, moon.size, moon.size);
      ctx.globalAlpha = 1;
    },
  }];
}

export function createShootingStars(cfg, env, { rate = 1 } = {}) {
  let timer = rand(3, 8);
  const streaks = [];

  const launch = (x, y, e) => {
    const dir = x < e.w / 2 ? 1 : -1;
    const angle = rand(0.3, 0.6);
    streaks.push({ x, y, vx: Math.cos(angle) * 900 * dir, vy: Math.sin(angle) * 900, life: 0, max: rand(0.55, 0.9) });
  };

  return [{
    z: 7,
    interact(x, y, e) {
      if (e.palette.stars < 0.25) return;
      launch(x, y, e);
      if (Math.random() < 0.5) launch(x + rand(-60, 60), y + rand(-30, 30), e);
    },
    update(dt, e) {
      if (dt <= 0 || e.palette.stars < 0.4) return;
      timer -= dt;
      if (timer <= 0) {
        timer = rand(7, 18) / rate;
        const dir = Math.random() < 0.5 ? -1 : 1;
        const angle = rand(0.3, 0.6);
        streaks.push({
          x: rand(e.w * 0.15, e.w * 0.85),
          y: rand(e.h * 0.05, e.h * 0.35),
          vx: Math.cos(angle) * 900 * dir,
          vy: Math.sin(angle) * 900,
          life: 0,
          max: rand(0.55, 0.9),
        });
      }
      for (let i = streaks.length - 1; i >= 0; i -= 1) {
        const s = streaks[i];
        s.life += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.life > s.max) streaks.splice(i, 1);
      }
    },
    draw(ctx, e, alpha) {
      streaks.forEach((s) => {
        const t = s.life / s.max;
        const fade = Math.sin(t * Math.PI) * alpha * e.palette.stars;
        if (fade < 0.02) return;
        const tail = 0.14;
        const tx = s.x - s.vx * tail;
        const ty = s.y - s.vy * tail;
        const grad = ctx.createLinearGradient(s.x, s.y, tx, ty);
        grad.addColorStop(0, `rgba(255,255,255,${fade.toFixed(3)})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      });
    },
  }];
}

export function createNightGlow(cfg, env) {
  const palette = env.target;
  return [{
    z: 12,
    draw(ctx, e, alpha) {
      const a = alpha * 0.35;
      const grad = ctx.createLinearGradient(0, e.h * 0.45, 0, e.h * 0.8);
      grad.addColorStop(0, rgba(palette.horizon, 0));
      grad.addColorStop(1, rgba(palette.horizon, a));
      ctx.fillStyle = grad;
      ctx.fillRect(0, e.h * 0.45, e.w, e.h * 0.35);
    },
  }];
}
