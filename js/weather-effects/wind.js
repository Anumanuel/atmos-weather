import { TAU, areaFactor, clamp, createCanvas, darken, lerp, mixRgb, rand, rgba, seeded } from './utils.js';

function makeStreak() {
  const canvas = createCanvas(256, 8);
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(128, 4, 128, 1.6, 0, 0, TAU);
  g.fill();
  return canvas;
}

function windLevel(cfg) {
  const speed = cfg.windSpeed || 0;
  return {
    speed,
    strength: clamp(speed / 60),
    gustiness: clamp(((cfg.gusts || speed) - speed) / 30),
    direction: (cfg.windX || 0) < 0 ? -1 : 1,
  };
}

function createGusts(cfg, env) {
  const level = windLevel(cfg);
  const state = { timer: rand(2, 5), age: 9, power: 0 };
  return {
    z: 1,
    update(dt, e) {
      if (dt <= 0) {
        e.gust = 0;
        return;
      }
      state.timer -= dt;
      state.age += dt;
      if (state.timer <= 0 && (level.gustiness > 0.1 || level.speed > 20)) {
        state.age = 0;
        state.power = rand(0.5, 1) * Math.max(level.gustiness, level.strength * 0.6);
        state.timer = rand(3, 9) / (0.6 + level.gustiness);
      }
      const envelope = state.age < 1.2 ? Math.sin(Math.min(1, state.age / 1.2) * Math.PI) : 0;
      e.gust = state.power * envelope;
      e.windNow = e.wind * (1 + e.gust * 0.9);
    },
    draw() {},
  };
}

function createStreaks(cfg, env, { z, share, alpha, speedScale }) {
  const level = windLevel(cfg);
  if (level.speed < 12) return null;
  const sprite = makeStreak();
  const count = Math.round(clamp(lerp(4, 34, clamp((level.speed - 12) / 50)) * areaFactor(env) * env.motion.density * share, 2, 40));
  const make = (e, anywhere) => ({
    x: anywhere ? rand(-200, e.w) : level.direction > 0 ? rand(-420, -160) : e.w + rand(60, 300),
    y: rand(e.h * 0.08, e.h * 0.82),
    len: rand(90, 280) * (0.7 + level.strength * 0.8),
    v: rand(260, 520) * (0.6 + level.strength * 1.4) * speedScale,
    a: rand(0.35, 1),
    ph: rand(0, TAU),
    th: rand(0.7, 1.6),
  });
  const streaks = Array.from({ length: count }, () => make(env, true));
  const night = !cfg.isDay;

  return {
    z,
    update(dt, e) {
      const boost = 1 + (e.gust || 0) * 1.2;
      streaks.forEach((s) => {
        s.x += s.v * boost * level.direction * dt;
        s.y += Math.sin(e.time * 1.3 + s.ph) * 6 * dt;
        if ((level.direction > 0 && s.x > e.w + 40) || (level.direction < 0 && s.x + s.len < -40)) Object.assign(s, make(e, false));
      });
    },
    draw(ctx, e, a) {
      const base = alpha * a * (night ? 0.55 : 1) * (0.5 + level.strength * 0.6) * (1 + (e.gust || 0) * 0.6);
      if (base < 0.01) return;
      streaks.forEach((s) => {
        ctx.globalAlpha = clamp(base * s.a);
        ctx.drawImage(sprite, s.x, s.y, s.len, 8 * s.th * 0.5);
      });
      ctx.globalAlpha = 1;
    },
  };
}

function createVegetation(cfg, env) {
  const level = windLevel(cfg);
  const palette = env.target;
  const snowy = cfg.kind === 'snow';
  const random = seeded(97);
  let blades = [];
  let trees = [];

  const build = (e) => {
    blades = [];
    const spacing = e.mobile ? 6 : 5;
    for (let x = -10; x < e.w + 10; x += spacing) {
      const tall = random() < 0.08;
      blades.push({
        x: x + random() * spacing,
        h: (tall ? lerp(16, 28, random()) : lerp(5, 13, random())) * (snowy ? 0.55 : 1),
        ph: random() * TAU,
        f: lerp(0.8, 1.6, random()),
      });
    }
    const spots = e.mobile ? [0.78, 0.93] : [0.6, 0.7, 0.88, 0.97];
    trees = spots.map((p) => ({
      x: e.w * p + (random() - 0.5) * 30,
      h: lerp(38, 74, random()) * (e.mobile ? 0.8 : 1),
      ph: random() * TAU,
      lobes: Array.from({ length: 5 }, () => ({ dx: (random() - 0.5) * 0.9, dy: random() * 0.5, r: lerp(0.26, 0.42, random()) })),
    }));
  };
  build(env);

  const color = darken(palette.ridge3, 0.18);
  const tip = snowy ? mixRgb(palette.snowcap, palette.ridge3, 0.25) : null;

  return {
    z: 72,
    resize(e) {
      build(e);
    },
    draw(ctx, e, alpha) {
      const t = e.time;
      const wind = (e.windNow ?? e.wind ?? 0);
      const dir = wind < 0 ? -1 : 1;
      const strength = clamp(Math.abs(wind) / 1.5);
      const lean = dir * (0.08 + strength * 0.75 + (e.gust || 0) * 0.35);
      const sway = 0.12 + strength * 0.25;
      const flutter = 1.2 + strength * 4.5;
      const offset = -e.pointer.x * 14;

      ctx.save();
      ctx.translate(offset, 0);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = rgba(color, 1);
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      blades.forEach((b) => {
        const base = e.ridgeY(2, b.x) + 3;
        const bend = (lean + Math.sin(t * b.f * flutter * 0.5 + b.ph + b.x * 0.015) * sway) * b.h;
        ctx.moveTo(b.x, base);
        ctx.quadraticCurveTo(b.x + bend * 0.2, base - b.h * 0.6, b.x + bend, base - b.h + Math.abs(bend) * 0.25);
      });
      ctx.stroke();

      if (tip) {
        ctx.strokeStyle = rgba(tip, 0.6);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        blades.forEach((b) => {
          const base = e.ridgeY(2, b.x) + 3;
          ctx.moveTo(b.x - 2, base - 1);
          ctx.lineTo(b.x + 2, base - 1);
        });
        ctx.stroke();
      }

      ctx.fillStyle = rgba(color, 1);
      ctx.strokeStyle = rgba(color, 1);
      trees.forEach((tree) => {
        const base = e.ridgeY(2, tree.x) + 4;
        const angle = lean * 0.18 + Math.sin(t * flutter * 0.35 + tree.ph) * (0.015 + strength * 0.05);
        ctx.save();
        ctx.translate(tree.x, base);
        ctx.rotate(angle);
        ctx.lineWidth = Math.max(2, tree.h * 0.06);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -tree.h * 0.55);
        ctx.stroke();
        ctx.translate(0, -tree.h * 0.62);
        ctx.rotate(angle * 0.8);
        ctx.beginPath();
        tree.lobes.forEach((lobe) => {
          const r = tree.h * lobe.r;
          const x = lobe.dx * tree.h * 0.5 + lean * r * 0.3;
          const y = -lobe.dy * tree.h * 0.5;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, TAU);
        });
        ctx.fill();
        if (tip) {
          ctx.fillStyle = rgba(tip, 0.7);
          ctx.beginPath();
          tree.lobes.slice(0, 3).forEach((lobe) => {
            const r = tree.h * lobe.r * 0.7;
            const x = lobe.dx * tree.h * 0.5;
            const y = -lobe.dy * tree.h * 0.5 - r * 0.6;
            ctx.moveTo(x + r, y);
            ctx.ellipse(x, y, r, r * 0.45, 0, Math.PI, TAU);
          });
          ctx.fill();
          ctx.fillStyle = rgba(color, 1);
        }
        ctx.restore();
      });
      ctx.restore();
      ctx.globalAlpha = 1;
    },
  };
}

function createDebris(cfg, env) {
  const level = windLevel(cfg);
  if (level.speed < 24 || cfg.kind === 'snow') return null;
  const count = Math.round(clamp(lerp(6, 26, clamp((level.speed - 24) / 50)) * areaFactor(env) * env.motion.density, 3, 30));
  const tones = cfg.isDay ? [[201, 138, 75], [168, 116, 58], [125, 143, 69], [214, 170, 92]] : [[40, 44, 58], [52, 56, 70]];
  const make = (e, anywhere) => ({
    x: anywhere ? rand(0, e.w) : level.direction > 0 ? rand(-80, -10) : e.w + rand(10, 80),
    y: rand(e.h * 0.35, e.h * 0.92),
    v: rand(180, 380) * (0.6 + level.strength),
    lift: rand(-30, 20),
    rot: rand(0, TAU),
    vr: rand(-6, 6),
    s: rand(3, 6.5),
    ph: rand(0, TAU),
    c: tones[Math.floor(Math.random() * tones.length)],
  });
  const leaves = Array.from({ length: count }, () => make(env, true));

  return {
    z: 88,
    update(dt, e) {
      const boost = 1 + (e.gust || 0) * 1.4;
      leaves.forEach((leaf) => {
        leaf.x += leaf.v * boost * level.direction * dt;
        leaf.y += (leaf.lift + Math.sin(e.time * 2.4 + leaf.ph) * 40) * dt;
        leaf.rot += leaf.vr * dt;
        if (leaf.x > e.w + 100 || leaf.x < -100 || leaf.y > e.h + 20 || leaf.y < -20) Object.assign(leaf, make(e, false));
      });
    },
    draw(ctx, e, alpha) {
      leaves.forEach((leaf) => {
        ctx.save();
        ctx.translate(leaf.x, leaf.y);
        ctx.rotate(leaf.rot);
        ctx.scale(1, Math.abs(Math.sin(e.time * 3 + leaf.ph)) * 0.8 + 0.2);
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle = rgba(leaf.c, 1);
        ctx.beginPath();
        ctx.ellipse(0, 0, leaf.s, leaf.s * 0.45, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      });
      ctx.globalAlpha = 1;
    },
  };
}

export function createWind(cfg, env) {
  return [
    createGusts(cfg, env),
    createVegetation(cfg, env),
    createStreaks(cfg, env, { z: 33, share: 0.45, alpha: 0.16, speedScale: 0.7 }),
    createStreaks(cfg, env, { z: 86, share: 0.55, alpha: 0.22, speedScale: 1.1 }),
    createDebris(cfg, env),
  ].filter(Boolean);
}
