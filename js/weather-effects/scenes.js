import { createSun, createMotes } from './sunny.js';
import { createMilkyWay, createMoon, createNightGlow, createShootingStars, createStars } from './night.js';
import { createClouds } from './cloudy.js';
import { createGlassDrops, createHail, createRain } from './rainy.js';
import { createFrost, createSnow } from './snowy.js';
import { createLightning } from './stormy.js';
import { createFog, createHaze } from './foggy.js';
import { createWind } from './wind.js';
import { createAircraft, createBirds, createCloudShadows, createFireflies } from './life.js';
import { clamp } from './utils.js';

const recipes = new Map();

export function registerScene(kind, recipe) {
  recipes.set(kind, recipe);
}

export function hasScene(kind) {
  return recipes.has(kind);
}

function life(cfg, env) {
  return [...createBirds(cfg, env), ...createFireflies(cfg, env), ...createAircraft(cfg, env), ...createCloudShadows(cfg, env)];
}

const coverFor = (cfg, min, max) => clamp(cfg.cloudCover ?? (min + max) / 2, min, max);

function sky(cfg, env, { veiled = false, stars = 1 } = {}) {
  if (cfg.isDay) return createSun(cfg, env, { veiled });
  return [...createStars(cfg, env, { density: stars }), ...createMoon(cfg, env, { veiled })];
}

function visibilityHaze(cfg, env) {
  if (cfg.fog > 0.05) return createFog(cfg, env, { density: cfg.fog, layers: cfg.fog > 0.35 ? 4 : 2 });
  return [];
}

registerScene('intro', (cfg, env) => [
  ...createWind(cfg, env),
  ...life(cfg, env),
  ...createStars(cfg, env, { density: 1.1 }),
  ...createShootingStars(cfg, env, { rate: 1.4 }),
  ...createNightGlow(cfg, env),
  ...createClouds(cfg, env, { cover: 0.22, style: 'wisp' }),
  ...createMotes(cfg, env, { amount: 0.5 }),
]);

registerScene('clear', (cfg, env) => [
  ...createWind(cfg, env),
  ...life(cfg, env),
  ...sky(cfg, env),
  ...(cfg.isDay
    ? createMotes(cfg, env, { amount: 1 })
    : [...createMilkyWay(cfg, env), ...createShootingStars(cfg, env, { rate: 1 }), ...createNightGlow(cfg, env)]),
  ...createClouds(cfg, env, { cover: coverFor(cfg, 0.04, 0.2), style: 'wisp' }),
  ...visibilityHaze(cfg, env),
]);

registerScene('mostly-clear', (cfg, env) => [
  ...createWind(cfg, env),
  ...life(cfg, env),
  ...sky(cfg, env),
  ...(cfg.isDay ? createMotes(cfg, env, { amount: 0.7 }) : createShootingStars(cfg, env, { rate: 0.6 })),
  ...createClouds(cfg, env, { cover: coverFor(cfg, 0.14, 0.4) }),
  ...visibilityHaze(cfg, env),
]);

registerScene('partly-cloudy', (cfg, env) => [
  ...createWind(cfg, env),
  ...life(cfg, env),
  ...sky(cfg, env, { stars: 0.8 }),
  ...(cfg.isDay ? createMotes(cfg, env, { amount: 0.4 }) : []),
  ...createClouds(cfg, env, { cover: coverFor(cfg, 0.32, 0.72) }),
  ...visibilityHaze(cfg, env),
]);

registerScene('overcast', (cfg, env) => [
  ...createWind(cfg, env),
  ...life(cfg, env),
  ...sky(cfg, env, { veiled: true, stars: 0.3 }),
  ...createClouds(cfg, env, { cover: coverFor(cfg, 0.85, 1), deck: true }),
  ...createHaze(cfg, env, { amount: 0.18 }),
  ...visibilityHaze(cfg, env),
]);

registerScene('fog', (cfg, env) => [
  ...createWind(cfg, env),
  ...life(cfg, env),
  ...sky(cfg, env, { veiled: true, stars: 0.2 }),
  ...createClouds(cfg, env, { cover: coverFor(cfg, 0.3, 0.7), faint: true }),
  ...createFog(cfg, env, { density: Math.max(0.6, cfg.fog) }),
  ...(cfg.freezing ? createFrost(cfg, env, { amount: 0.5 }) : []),
]);

registerScene('drizzle', (cfg, env) => [
  ...createWind(cfg, env),
  ...life(cfg, env),
  ...createClouds(cfg, env, { cover: coverFor(cfg, 0.8, 1), deck: true }),
  ...createRain(cfg, env, { intensity: cfg.precip, drizzle: true, splashes: false }),
  ...createHaze(cfg, env, { amount: 0.22 }),
  ...(cfg.freezing ? createFrost(cfg, env, { amount: 0.55 }) : []),
  ...visibilityHaze(cfg, env),
]);

registerScene('rain', (cfg, env) => [
  ...createWind(cfg, env),
  ...life(cfg, env),
  ...createClouds(cfg, env, { cover: coverFor(cfg, 0.85, 1), deck: true, style: cfg.precip > 0.8 ? 'storm' : 'cumulus' }),
  ...createRain(cfg, env, { intensity: cfg.precip }),
  ...createHaze(cfg, env, { amount: 0.12 + cfg.precip * 0.12 }),
  ...(cfg.precip >= 0.45 && env.motion.speed > 0 ? createGlassDrops(cfg, env, { intensity: cfg.precip }) : []),
  ...(cfg.freezing ? createFrost(cfg, env, { amount: 0.7 }) : []),
  ...visibilityHaze(cfg, env),
]);

registerScene('snow', (cfg, env) => [
  ...createWind(cfg, env),
  ...life(cfg, env),
  ...(cfg.isDay ? [] : createStars(cfg, env, { density: 0.2 })),
  ...createClouds(cfg, env, { cover: coverFor(cfg, 0.7, 1), deck: cfg.precip > 0.5 }),
  ...createSnow(cfg, env, { intensity: cfg.precip, grains: cfg.precipType === 'grains' }),
  ...createHaze(cfg, env, { amount: 0.16 + cfg.precip * 0.1 }),
  ...createFrost(cfg, env, { amount: 0.35 + cfg.precip * 0.3 }),
  ...visibilityHaze(cfg, env),
]);

registerScene('storm', (cfg, env) => [
  ...createWind(cfg, env),
  ...life(cfg, env),
  ...createClouds(cfg, env, { cover: 1, deck: true, style: 'storm' }),
  ...createLightning(cfg, env, { frequency: cfg.lightning || 0.75 }),
  ...createRain(cfg, env, { intensity: Math.max(0.75, cfg.precip) }),
  ...(cfg.precipType === 'hail' ? createHail(cfg, env, { intensity: cfg.precip }) : []),
  ...createHaze(cfg, env, { amount: 0.14 }),
  ...(env.motion.speed > 0 ? createGlassDrops(cfg, env, { intensity: 0.85 }) : []),
]);

export function buildSceneLayers(cfg, env) {
  const recipe = recipes.get(cfg.kind) || recipes.get('partly-cloudy');
  return recipe(cfg, env).filter(Boolean);
}
