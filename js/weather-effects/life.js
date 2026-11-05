import { TAU, areaFactor, clamp, createCanvas, darken, rand, randInt, rgba, softDot } from './utils.js';

const FAIR = ['clear', 'mostly-clear', 'partly-cloudy'];

export function createBirds(cfg, env) {
  if (!cfg.isDay || cfg.precip > 0 || (cfg.windSpeed || 0) > 45 || !FAIR.concat('overcast').includes(cfg.kind)) return [];
  const palette = env.target;
  const color = darken(palette.ridge3, 0.35);
  let flock = null;
  let timer = rand(1.5, 6);

  const spawn = (e) => {
    const dir = (cfg.windX || 0) < -0.05 ? -1 : Math.random() < 0.8 ? 1 : -1;
    const count = randInt(4, 9);
    const y = e.h * rand(0.16, 0.4);
    const speed = rand(55, 85) * (1 + Math.abs(cfg.windX || 0) * 0.35);
    flock = {
      dir,
      speed,
      birds: Array.from({ length: count }, (_, i) => ({
        x: (dir > 0 ? -50 : e.w + 50) - dir * (i * 18 + rand(0, 10)),
        y: y + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * rand(7, 12),
        s: rand(4.5, 7.5),
        f: rand(7, 10),
        ph: rand(0, TAU),
        vy: 0,
        boost: 1,
      })),
    };
  };

  return [{
    z: 29,
    update(dt, e) {
      if (dt <= 0) return;
      if (!flock) {
        timer -= dt;
        if (timer <= 0) spawn(e);
        return;
      }
      let visible = false;
      flock.birds.forEach((b) => {
        b.boost = Math.max(1, b.boost - dt * 0.4);
        b.x += flock.dir * flock.speed * b.boost * dt;
        b.y += (Math.sin(e.time * 1.4 + b.ph) * 6 + b.vy) * dt;
        b.vy *= Math.exp(-dt * 1.5);
        if (b.x > -80 && b.x < e.w + 80) visible = true;
      });
      if (!visible) {
        flock = null;
        timer = rand(10, 24);
      }
    },
    interact(x, y) {
      if (!flock) return;
      const near = flock.birds.some((b) => Math.hypot(b.x - x, b.y - y) < 140);
      if (!near) return;
      flock.birds.forEach((b) => {
        b.boost = rand(2.2, 3.2);
        b.vy = (b.y < y ? -1 : 1) * rand(60, 140);
        b.f *= 1.4;
      });
    },
    draw(ctx, e, alpha) {
      if (!flock) return;
      ctx.strokeStyle = rgba(color, 0.78 * alpha);
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      flock.birds.forEach((b) => {
        const flap = Math.sin(e.time * b.f + b.ph);
        const tip = b.s * 0.55 * flap;
        ctx.moveTo(b.x - b.s, b.y - tip);
        ctx.quadraticCurveTo(b.x - b.s * 0.45, b.y - b.s * 0.35 - tip * 0.4, b.x, b.y);
        ctx.quadraticCurveTo(b.x + b.s * 0.45, b.y - b.s * 0.35 - tip * 0.4, b.x + b.s, b.y - tip);
      });
      ctx.stroke();
    },
  }];
}

export function createFireflies(cfg, env) {
  const warm = typeof cfg.temp === 'number' && cfg.temp >= 14;
  if (cfg.isDay || !warm || cfg.precip > 0 || (cfg.windSpeed || 0) > 22 || !FAIR.includes(cfg.kind)) return [];
  const glow = softDot(32, [214, 255, 140], { core: 0.18 });
  const count = Math.round(clamp(28 * areaFactor(env) * env.motion.density, 8, 48));
  let flies = [];

  const place = (e) => {
    const x = rand(0, e.w);
    const ground = e.ridgeY(2, x);
    return {
      x,
      y: rand(ground - 70, Math.min(e.h - 8, ground + (e.h - ground) * 0.9)),
      ph: rand(0, TAU),
      period: rand(2.4, 5.2),
      offset: rand(0, 5),
      vx: rand(-12, 12),
      vy: rand(-6, 6),
      size: rand(16, 26),
    };
  };
  const seed = (e) => {
    flies = Array.from({ length: count }, () => place(e));
  };
  seed(env);
  let syncUntil = 0;

  return [{
    z: 74,
    resize(e) {
      seed(e);
    },
    update(dt, e) {
      const cur = e.cursor;
      flies.forEach((f) => {
        f.ph += dt * 0.8;
        f.x += (f.vx + Math.sin(f.ph * 1.3) * 10) * dt;
        f.y += (f.vy + Math.cos(f.ph) * 6) * dt;
        if (cur.active) {
          const dx = cur.x - f.x;
          const dy = cur.y - f.y;
          const d = Math.hypot(dx, dy);
          if (d < 220 && d > 12) {
            f.x += (dx / d) * 28 * dt;
            f.y += (dy / d) * 28 * dt;
          }
        }
        if (f.x < -20 || f.x > e.w + 20 || f.y > e.h + 10 || f.y < e.h * 0.45) Object.assign(f, place(e));
      });
    },
    interact(x, y, e) {
      syncUntil = e.time + 1.4;
    },
    draw(ctx, e, alpha) {
      ctx.globalCompositeOperation = 'lighter';
      const synced = e.time < syncUntil;
      flies.forEach((f) => {
        const phase = synced ? (syncUntil - e.time) / 1.4 : ((e.time + f.offset) % f.period) / f.period;
        const pulse = synced ? Math.sin(phase * Math.PI) : phase < 0.38 ? Math.sin((phase / 0.38) * Math.PI) : 0;
        const a = alpha * (0.28 + pulse * 0.72);
        if (a < 0.03) return;
        ctx.globalAlpha = a;
        const s = f.size * (0.55 + pulse * 0.7);
        ctx.drawImage(glow, f.x - s / 2, f.y - s / 2, s, s);
        if (pulse > 0.3) {
          ctx.globalAlpha = a * 0.5;
          ctx.drawImage(glow, f.x - s, f.y - s, s * 2, s * 2);
        }
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },
  }];
}

export function createAircraft(cfg, env) {
  if (cfg.kind === 'storm' || cfg.kind === 'fog' || cfg.kind === 'intro') return [];
  const contrails = cfg.isDay && (cfg.cloudCover || 0) < 0.55 && cfg.precip === 0;
  let plane = null;
  let timer = rand(4, 16);

  const spawn = (e) => {
    const dir = Math.random() < 0.5 ? -1 : 1;
    plane = {
      x: dir > 0 ? -30 : e.w + 30,
      y: e.h * rand(0.07, 0.26),
      vx: dir * rand(34, 56),
      vy: rand(-3, 3),
      trail: [],
      sample: 0,
      t: 0,
    };
  };

  return [{
    z: 15,
    update(dt, e) {
      if (dt <= 0) return;
      if (!plane) {
        timer -= dt;
        if (timer <= 0) spawn(e);
        return;
      }
      plane.t += dt;
      plane.x += plane.vx * dt;
      plane.y += plane.vy * dt;
      if (contrails) {
        plane.sample += dt;
        if (plane.sample > 0.25) {
          plane.sample = 0;
          plane.trail.push({ x: plane.x, y: plane.y, age: 0 });
          if (plane.trail.length > 160) plane.trail.shift();
        }
        plane.trail.forEach((p) => {
          p.age += dt;
        });
      }
      if (plane.x < -80 || plane.x > e.w + 80) {
        plane = null;
        timer = rand(24, 60);
      }
    },
    draw(ctx, e, alpha) {
      if (!plane) return;
      if (contrails && plane.trail.length > 1) {
        ctx.lineCap = 'round';
        for (let i = 1; i < plane.trail.length; i += 1) {
          const p = plane.trail[i];
          const q = plane.trail[i - 1];
          const life = clamp(1 - p.age / 40);
          if (life <= 0) continue;
          ctx.strokeStyle = `rgba(255,255,255,${(0.32 * life * alpha).toFixed(3)})`;
          ctx.lineWidth = 1.2 + (1 - life) * 5;
          ctx.beginPath();
          ctx.moveTo(q.x, q.y + 1);
          ctx.lineTo(p.x, p.y + 1);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(240,245,255,${(0.9 * alpha).toFixed(3)})`;
        ctx.fillRect(plane.x - 2, plane.y - 0.8, 4, 1.6);
        return;
      }
      if (cfg.isDay) return;
      const blink = (plane.t % 1.2) < 0.12;
      const strobe = (plane.t % 1.6) < 0.06 || ((plane.t % 1.6) > 0.18 && (plane.t % 1.6) < 0.24);
      ctx.fillStyle = `rgba(255,255,255,${(0.45 * alpha).toFixed(3)})`;
      ctx.fillRect(plane.x - 1, plane.y - 1, 2, 2);
      if (blink) {
        ctx.fillStyle = `rgba(255,80,80,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(plane.x - Math.sign(plane.vx) * 5, plane.y, 1.8, 0, TAU);
        ctx.fill();
      }
      if (strobe) {
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(plane.x + Math.sign(plane.vx) * 4, plane.y - 1, 2.2, 0, TAU);
        ctx.fill();
      }
    },
  }];
}

function makeShadow() {
  const canvas = createCanvas(256, 96);
  const g = canvas.getContext('2d');
  g.translate(128, 48);
  g.scale(1, 0.375);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(0,0,0,0.9)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, 128, 0, TAU);
  g.fill();
  return canvas;
}

export function createCloudShadows(cfg, env) {
  if (!cfg.isDay || !FAIR.includes(cfg.kind)) return [];
  const sprite = makeShadow();
  const lean = ((cfg.sunProgress ?? 0.5) - 0.5) * -0.6;
  return [{
    z: 71,
    draw(ctx, e, alpha) {
      const list = e.shared.cloudShadows;
      if (!list || !list.length || !e.clipRidge) return;
      ctx.save();
      e.clipRidge(ctx, 1);
      list.forEach((c) => {
        const w = c.sw * 1.1;
        const h = e.h * (0.1 + c.depth * 0.08);
        const x = c.x + c.sw * (0.5 + lean) - w / 2;
        const y = e.h * (0.86 + c.depth * 0.04) - h / 2;
        ctx.globalAlpha = alpha * c.alpha * 0.26;
        ctx.drawImage(sprite, x, y, w, h);
      });
      ctx.restore();
      ctx.globalAlpha = 1;
    },
  }];
}
