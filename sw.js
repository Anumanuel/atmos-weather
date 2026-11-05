const VERSION = 'atmos-v2';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/themes.css',
  'css/style.css',
  'css/animations.css',
  'css/responsive.css',
  'js/boot-check.js',
  'js/charts.js',
  'js/globe.js',
  'assets/data/land-mask.json',
  'js/main.js',
  'js/api.js',
  'js/astro.js',
  'js/dom.js',
  'js/forecast.js',
  'js/format.js',
  'js/geocoding.js',
  'js/geolocation.js',
  'js/insights.js',
  'js/scene-mapper.js',
  'js/search.js',
  'js/storage.js',
  'js/ui.js',
  'js/weather-codes.js',
  'js/weather-data.js',
  'js/weather-effects/weather-engine.js',
  'js/weather-effects/scenes.js',
  'js/weather-effects/sky.js',
  'js/weather-effects/landscape.js',
  'js/weather-effects/utils.js',
  'js/weather-effects/sunny.js',
  'js/weather-effects/night.js',
  'js/weather-effects/cloudy.js',
  'js/weather-effects/rainy.js',
  'js/weather-effects/snowy.js',
  'js/weather-effects/stormy.js',
  'js/weather-effects/foggy.js',
  'js/weather-effects/wind.js',
  'js/weather-effects/life.js',
  'assets/icons/favicon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
    );
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then((hit) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok || response.type === 'opaque') {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
  }
});
