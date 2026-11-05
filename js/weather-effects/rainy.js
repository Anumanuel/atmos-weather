import { TAU, areaFactor, clamp, createCanvas, lerp, rand, rgba } from './utils.js';

const RAIN_LAYERS = [
  { z: 45, share: 0.42, len: [8, 14], speed: [520, 640], width: 1, alpha: 0.5 },
  { z: 65, share: 0.33, len: [14, 22], speed: [780, 920], width: 1.25, alpha: 0.72 },
  { z: 75, share: 0.25, len: [24, 38], speed: [1080, 1320], width: 1.6, alpha: 0.9, near: true },
];

export function createRain(cfg, env, { intensity = 0.6, drizzle = false, splashes = true } = {}) {
  const palette = env.target;
  const color = palette.rain;
  const glow = cfg.isDay ? 1 : 1.12;
  const base = drizzle ? 440 : 640;
  const total = Math.round(clamp(base * (0.2 + intensity * 0.95) * areaFactor(env) * env.motion.density * env.quality, 50, 1500));
  const slantFactor = drizzle ? 0.24 : 0.4;
  const slantFor = (wind) => clamp((wind || 0) * slantFactor, -0.7, 0.7);
  let slant = slantFor(cfg.windX);
  const lenScale = drizzle ? 0.45 : 1;
  const speedScale = (drizzle ? 0.55 : 1) * (0.9 + intensity * 0.2);
  const widthScale = drizzle ? 0.8 : 1;
  const strength = clamp(palette.rainAlpha * 1.4 * glow * (drizzle ? 0.85 : 1) * (0.75 + intensity * 0.35), 0, 1);
  const splashPool = [];
  const maxSplashes = Math.round(140 * env.motion.density);

  const groundFor = (layer, x, e) => {
    if (!layer.near) return e.h + 40;
    const ridge = e.ridgeY(2, x);
    return ridge + rand(4, Math.max(8, e.h - ridge));
  };

  const makeDrop = (layer, e, anywhere) => {
    const pad = Math.abs(slant) * e.h;
    const x = rand(-pad, e.w + pad);
    const len = rand(layer.len[0], layer.len[1]) * lenScale;
    return {
      x,
      y: anywhere ? rand(-40, e.h) : rand(-e.h * 0.3, -len),
      len,
      v: rand(layer.speed[0], layer.speed[1]) * speedScale,
      end: groundFor(layer, x + slant * e.h * 0.5, e),
    };
  };

  const layers = RAIN_LAYERS.map((spec) => ({
    spec,
    drops: Array.from({ length: Math.round(total * spec.share) }, () => makeDrop(spec, env, true)),
  }));

  const ripples = [];
  const spawnSplash = (x, y) => {
    const n = Math.random() < 0.5 ? 2 : 3;
    for (let i = 0; i < n && splashPool.length < maxSplashes; i += 1) {
      splashPool.push({ x, y, vx: rand(-70, 70), vy: rand(-150, -60), t: 0, life: rand(0.22, 0.4) });
    }
  };

  const drawables = layers.map(({ spec, drops }) => ({
    z: spec.z,
    resize(e, prevW, prevH) {
      if (!prevW || !prevH) return;
      drops.forEach((d) => {
        d.x *= e.w / prevW;
        d.y *= e.h / prevH;
        d.end = groundFor(spec, d.x, e);
      });
    },
    interact(x, y) {
      if (!spec.near) return;
      ripples.push({ x, y, t: 0 });
      for (let i = 0; i < 18 && splashPool.length < maxSplashes + 40; i += 1) {
        const angle = rand(Math.PI * 1.05, Math.PI * 1.95);
        const speed = rand(80, 220);
        splashPool.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, t: 0, life: rand(0.35, 0.6) });
      }
    },
    update(dt, e) {
      slant = slantFor(e.windNow ?? cfg.windX);
      const cur = e.cursor;
      const canopy = cur.active && !drizzle;
      for (let i = 0; i < drops.length; i += 1) {
        const d = drops[i];
        const prevY = d.y;
        d.y += d.v * dt;
        d.x += d.v * slant * dt;
        if (canopy && prevY < cur.y - 8 && d.y >= cur.y - 8) {
          const dx = d.x - cur.x;
          if (Math.abs(dx) < 54) {
            const lift = Math.sqrt(Math.max(0, 54 * 54 - dx * dx)) * 0.35;
            if (spec.near || Math.random() < 0.4) spawnSplash(d.x, cur.y - 8 - lift);
            Object.assign(d, makeDrop(spec, e, false));
            continue;
          }
        }
        if (d.y > d.end) {
          if (spec.near && splashes && Math.random() < 0.55) spawnSplash(d.x, d.end);
          Object.assign(d, makeDrop(spec, e, false));
        }
      }
      if (spec.near) {
        for (let i = ripples.length - 1; i >= 0; i -= 1) {
          ripples[i].t += dt;
          if (ripples[i].t > 0.9) ripples.splice(i, 1);
        }
        for (let i = splashPool.length - 1; i >= 0; i -= 1) {
          const s = splashPool[i];
          s.t += dt;
          s.vy += 900 * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          if (s.t > s.life) {
            splashPool[i] = splashPool[splashPool.length - 1];
            splashPool.pop();
          }
        }
      }
    },
    draw(ctx, e, alpha) {
      const a = spec.alpha * strength * alpha;
      if (a < 0.01) return;
      ctx.strokeStyle = rgba(color, a);
      ctx.lineWidth = spec.width * widthScale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < drops.length; i += 1) {
        const d = drops[i];
        if (d.y < -d.len) continue;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - slant * d.len, d.y - d.len);
      }
      ctx.stroke();

      if (spec.near && ripples.length) {
        ripples.forEach((r) => {
          const k = r.t / 0.9;
          ctx.strokeStyle = rgba(color, (1 - k) * 0.7 * alpha);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.ellipse(r.x, r.y, 8 + k * 60, (8 + k * 60) * 0.32, 0, 0, TAU);
          ctx.stroke();
        });
      }

      if (spec.near && splashPool.length) {
        ctx.fillStyle = rgba(color, a * 0.9);
        for (let i = 0; i < splashPool.length; i += 1) {
          const s = splashPool[i];
          const fade = 1 - s.t / s.life;
          const size = 1.2 + fade * 0.8;
          ctx.globalAlpha = fade;
          ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size);
        }
        ctx.globalAlpha = 1;
      }
    },
  }));

  return drawables;
}

export function createHail(cfg, env, { intensity = 0.8 } = {}) {
  const count = Math.round(clamp(70 * intensity * areaFactor(env) * env.motion.density * env.quality, 10, 180));
  const make = (e, anywhere) => {
    const x = rand(0, e.w);
    const ridge = e.ridgeY(2, x);
    return {
      x,
      y: anywhere ? rand(-40, e.h * 0.9) : rand(-e.h * 0.3, -10),
      r: rand(1.2, 2.5),
      vx: (cfg.windX || 0) * 160,
      vy: rand(720, 960),
      end: ridge + rand(4, Math.max(8, e.h - ridge)),
      bounced: false,
      t: 0,
    };
  };
  const stones = Array.from({ length: count }, () => make(env, true));

  return [{
    z: 76,
    update(dt, e) {
      stones.forEach((s) => {
        if (s.bounced) {
          s.t += dt;
          s.vy += 1600 * dt;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (!s.bounced && s.y > s.end) {
          s.bounced = true;
          s.y = s.end;
          s.vy = -s.vy * rand(0.18, 0.32);
          s.vx = rand(-50, 50);
        } else if (s.bounced && (s.t > 0.5 || s.y > s.end + 20)) {
          Object.assign(s, make(e, false));
        }
      });
    },
    draw(ctx, e, alpha) {
      ctx.fillStyle = `rgba(240,246,255,${(0.85 * alpha).toFixed(3)})`;
      ctx.beginPath();
      stones.forEach((s) => {
        ctx.moveTo(s.x + s.r, s.y);
        ctx.arc(s.x, s.y, s.r, 0, TAU);
      });
      ctx.fill();
    },
  }];
}

function makeDropSprite() {
  const size = 64;
  const canvas = createCanvas(size, size);
  const g = canvas.getContext('2d');
  const c = size / 2;
  const body = g.createRadialGradient(c, c - 2, 2, c, c, c - 2);
  body.addColorStop(0, 'rgba(255,255,255,0.06)');
  body.addColorStop(0.7, 'rgba(255,255,255,0.1)');
  body.addColorStop(0.9, 'rgba(10,16,26,0.22)');
  body.addColorStop(1, 'rgba(10,16,26,0)');
  g.fillStyle = body;
  g.beginPath();
  g.arc(c, c, c - 2, 0, TAU);
  g.fill();
  const shine = g.createRadialGradient(c - 8, c - 10, 0, c - 8, c - 10, 9);
  shine.addColorStop(0, 'rgba(255,255,255,0.75)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = shine;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(c, c, c - 9, Math.PI * 0.2, Math.PI * 0.8);
  g.stroke();
  return canvas;
}

export function createGlassDrops(cfg, env, { intensity = 0.6 } = {}) {
  const sprite = makeDropSprite();
  const count = Math.round(clamp(lerp(16, 52, intensity) * areaFactor(env) * env.motion.density, 8, 80));
  const trails = [];
  const make = (e, fresh) => {
    const big = Math.random() < 0.3;
    return {
      x: rand(0, e.w),
      y: rand(0, e.h),
      r: big ? rand(3.6, 6.2) : rand(1.4, 3.4),
      v: 0,
      sliding: false,
      a: fresh ? 0 : 1,
      lastTrail: 0,
    };
  };
  const drops = Array.from({ length: count }, () => make(env, false));

  return [{
    z: 110,
    interact(x, y) {
      drops.push({ x, y, r: rand(4.5, 6.5), v: 0, sliding: false, a: 1, lastTrail: 0 });
      if (drops.length > count + 12) drops.shift();
    },
    update(dt, e) {
      drops.forEach((d, i) => {
        if (d.a < 1) d.a = Math.min(1, d.a + dt * 0.7);
        if (!d.sliding && d.r > 3.5 && Math.random() < 0.05 * dt * 4) d.sliding = true;
        if (d.sliding) {
          d.v = Math.min(d.v + 70 * dt, 150);
          d.y += d.v * dt;
          d.x += Math.sin(d.y * 0.045) * 0.25;
          d.lastTrail += d.v * dt;
          if (d.lastTrail > 5 && trails.length < 360) {
            d.lastTrail = 0;
            trails.push({ x: d.x, y: d.y - d.r * 0.8, r: d.r * 0.32, life: 1 });
          }
          if (d.y - d.r > e.h) drops[i] = make(e, true);
        }
      });
      for (let i = trails.length - 1; i >= 0; i -= 1) {
        trails[i].life -= dt * 0.4;
        if (trails[i].life <= 0) {
          trails[i] = trails[trails.length - 1];
          trails.pop();
        }
      }
    },
    draw(ctx, e, alpha) {
      if (trails.length) {
        ctx.fillStyle = 'rgba(220,232,245,0.5)';
        trails.forEach((t) => {
          ctx.globalAlpha = alpha * t.life * 0.35;
          ctx.fillRect(t.x - t.r, t.y - t.r, t.r * 2, t.r * 2.4);
        });
      }
      drops.forEach((d) => {
        const a = alpha * d.a;
        if (a < 0.02) return;
        ctx.globalAlpha = a * 0.9;
        const s = d.r * 2.2;
        ctx.drawImage(sprite, d.x - s / 2, d.y - s / 2, s, s * (d.sliding ? 1.15 : 1));
      });
      ctx.globalAlpha = 1;
    },
  }];
}
