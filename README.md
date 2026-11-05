# ATMOS — Weather in Motion

ATMOS is a real-time weather forecast website where the whole page becomes the weather. Live data from Open-Meteo drives an animated sky behind the dashboard: rain falls when it is raining at the selected place, snow drifts in the real wind, lightning flickers during thunderstorms, fog rolls between the hills, and at night the moon appears in its actual phase among the stars.

**Live site:** https://anumanuel.github.io/atmos-weather/

Built with **HTML5, CSS3 and vanilla JavaScript (ES modules)**. No frameworks, no build step and no API keys.

---

## Features

### Live, location-based weather
- **Opens straight into a forecast.** On first visit ATMOS shows a default city chosen from your device's time zone, clearly labelled as a default, with a one-tap **Use my location** button. Return visits reopen the last place you viewed.
- **Browser geolocation** with separate, honest messages for permission denied, position unavailable, timeout, unsupported browser and insecure (non-HTTPS) pages.
- **City search** with suggestions, keyboard navigation (↑ ↓ Enter Esc, `/` to focus), debounced and cancellable requests, a loading indicator, "Did you mean…?" suggestions for misspellings (for example `Londn`), and support for `City, Country`.
- **Saved places and recent searches** stored in `localStorage`.
- **Shareable URLs.** Searched places are written to the address bar (`?name=Tokyo&lat=…&lon=…`). Your own GPS coordinates are never put in the URL.

### Interactive 3D globe
- A dotted Earth rendered on Canvas 2D from bundled Natural Earth land data.
- A **real day/night terminator** calculated from the sun's current position.
- Drag to spin (with inertia), scroll or pinch to zoom, and use the arrow and +/− keys.
- **Click anywhere** and the camera flies there (Google Earth style), drops a pin, finds the place name and shows its current weather. **Open full forecast** loads the whole dashboard for that point. Oceans work too.
- Markers show live temperatures for your current place, saved places and major cities.

### The animated sky
Every scene is built from the actual WMO weather code, `is_day`, cloud cover, precipitation amount, visibility, wind speed, wind gusts, local sunrise and sunset, temperature and the moon phase.

| Condition | What you see |
| --- | --- |
| Clear day | Sun placed on its real arc between sunrise and sunset, rotating light rays, lens glints, floating light motes, birds, aircraft contrails |
| Golden hour | Warm sky tint and under-lit clouds when within an hour of sunrise or sunset |
| Clear night | Twinkling stars, Milky Way band, shooting stars, the moon drawn in its real phase and hemisphere orientation; brighter moonlight thins the stars. Fireflies appear on warm, calm nights. Aircraft lights blink overhead |
| Partly cloudy / overcast | Soft volumetric cloud layers at three depths, a drifting overcast deck, cloud shadows sweeping over the hills, the sun dimming as clouds pass in front of it |
| Fog | Layered fog banks drifting between the ridges, softened focus, heavier haze when visibility is low |
| Drizzle / rain | Three depth layers of rain whose density follows the measured precipitation, splashes on the foreground hill, window droplets that slide down the glass |
| Thunderstorm | Dark storm deck, heavy rain, occasional branching lightning with cloud glow and gentle screen illumination; hail bounces when the code reports hail |
| Snow | Soft flakes and rotating crystals at three depths, wind drift, snow caps on the mountains and trees, frosty vignette |
| Freezing rain / rime fog | Icy palette and frost on the edges of the screen |
| Wind | Grass and trees bend and flutter with the real wind speed, air-current streaks appear when it is breezy, leaves tumble above about 25 km/h, and gust surges follow the API's gust values |

**Interactions:** click or tap the sky to play with the weather. You might launch a shooting star, call down lightning, splash the rain, burst the snow, scatter the birds, flare the sun or make fireflies glow together. The cursor acts as an umbrella in the rain, parts falling snow and makes nearby stars glint. Hover over the sun or moon to see live sunset time or moon phase details.

### Dashboard
- **Hero:** city, local time in the location's own time zone, oversized temperature, condition, feels-like, high/low, a calculated "next change" insight and the observation timestamp.
- **Next 24 hours:** a scrollable strip with a colour-coded temperature curve, precipitation bars, sunrise and sunset markers, and an hour inspector.
- **Trends & graphs:** interactive charts for temperature (with feels-like), humidity, precipitation (chance and amount), wind (with gusts), UV, pressure, cloud cover and visibility over **24 h, 48 h or 7 days**, with a hover or keyboard cursor, day separators, low/average/high stats and a calculated summary.
- **7-day forecast:** temperature range bars on a shared weekly scale. Each day opens a detail dialog with an hourly chart, statistics and an hour-by-hour table.
- **Sun & sky:** an animated SVG sun path from the real sunrise and sunset, daylight left, solar noon, tomorrow's daylight change and the moon phase. Polar night and midnight sun are handled.
- **Right now, in detail:** wind compass, humidity and dew point, UV scale, pressure gauge with a 3-hour trend, visibility, cloud cover and precipitation.
- **Insights:** air quality (US AQI and pollutants), a daily summary, a precipitation outlook and a sun-protection window.
- **Your places:** arched "window" cards showing each saved city's current sky.

### Settings
- °C / °F
- Wind and distance units: km/h, mph or m/s
- Theme: Sky (tinted by the weather), Dark or Light
- Weather animation: Full, Calm or Still. `prefers-reduced-motion` is respected automatically.
- **Preview an atmosphere:** a gallery of every scene for demonstration. A banner always states that a preview is active and that the data shown remains live.
- Forget saved data

---

## Honest data

- Every value shown comes from an API response. Nothing is invented. Missing values display as "—" and never crash the page.
- Calculated insights (summaries, trends, comfort, moon phase, the sun-protection window) are labelled **Calculated**. Raw API data is labelled **Open-Meteo**.
- Open-Meteo does not provide official weather warnings, so ATMOS does not show any and says so.
- When offline or when a refresh fails, ATMOS shows previously saved data, clearly marked as saved, with its timestamp.

## APIs and attribution

| Service | Used for | Key |
| --- | --- | --- |
| [Open-Meteo Forecast](https://open-meteo.com/en/docs) | Current, hourly and 7-day weather | None |
| [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | City search | None |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) | AQI and pollutants (CAMS) | None |
| [BigDataCloud reverse geocoding (client)](https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api) | Place name for GPS and globe clicks | None |
| [Natural Earth](https://www.naturalearthdata.com/) via world-atlas | Land mask for the globe (bundled, public domain) | — |

Weather data by Open-Meteo, licensed CC BY 4.0. The attribution is visible in the hero and the footer.

---

## Project structure

```text
├── index.html                 Semantic markup, SEO and Open Graph metadata, inline SVG icon sprite
├── manifest.webmanifest       Installable web app manifest
├── sw.js                      Service worker: app shell offline, network-first
├── css/
│   ├── themes.css             Design tokens, Sky/Dark/Light themes, animated scene colours
│   ├── style.css              Layout and components
│   ├── animations.css         Keyframes, reveal transitions, reduced-motion rules
│   └── responsive.css         Breakpoints from 320px to 1920px+
├── js/
│   ├── main.js                App controller: state, loading, refresh, offline, startup
│   ├── api.js                 fetch wrapper: timeouts, AbortController, HTTP/JSON/API errors
│   ├── weather-data.js        Forecast, air quality and multi-city requests, normalisation, caching
│   ├── geocoding.js           Search, "did you mean", reverse geocoding, default city
│   ├── geolocation.js         Browser geolocation with permission handling
│   ├── weather-codes.js       WMO code → label, icon and scene parameters
│   ├── scene-mapper.js        Weather data → animation scene description, preview scenes
│   ├── astro.js               Moon phase, sun state, subsolar point
│   ├── insights.js            Calculated insights and summaries
│   ├── format.js              Units, local-time formatting, compass
│   ├── storage.js             Safe localStorage helpers, favourites, recents, preferences
│   ├── ui.js                  Hero, conditions, sun cycle, insights, places, banners, toasts
│   ├── forecast.js            Hourly strip, 7-day list, day detail dialog
│   ├── charts.js              Trends & graphs
│   ├── globe.js               Interactive globe
│   ├── search.js              Accessible search combobox
│   ├── dom.js                 DOM helpers
│   ├── boot-check.js          Friendly message when opened from file://
│   └── weather-effects/
│       ├── weather-engine.js  Canvas loop, layers, crossfades, quality scaling, visibility pause
│       ├── scenes.js          Scene recipes (registerScene makes adding a condition easy)
│       ├── sky.js             Sky palettes for every condition × day/golden/twilight/night
│       ├── landscape.js       Layered mountain ridges, valley mist, snow caps
│       ├── sunny.js           Sun, rays, light motes
│       ├── night.js           Stars, Milky Way, moon phases, shooting stars
│       ├── cloudy.js          Cloud sprites, parallax layers, overcast deck
│       ├── rainy.js           Rain, splashes, hail, window droplets
│       ├── snowy.js           Snow, crystals, frost
│       ├── stormy.js          Lightning
│       ├── foggy.js           Fog banks and haze
│       ├── wind.js            Gusts, grass, trees, air streaks, leaves
│       └── life.js            Birds, fireflies, aircraft, cloud shadows
└── assets/
    ├── data/land-mask.json    Compact land bitmask for the globe (19 KB)
    ├── icons/                 SVG favicon and PNG app icons
    └── images/og-image.jpg    Social preview image
```

### Adding a new weather scene
1. Create a layer factory in `js/weather-effects/` that returns objects shaped like `{ z, update(dt, env), draw(ctx, env, alpha), interact?(x, y, env) }`.
2. Register a recipe in `scenes.js`: `registerScene('sandstorm', (cfg, env) => [...])`.
3. Map the condition to that scene in `weather-codes.js` / `scene-mapper.js`, and add a palette in `sky.js`.

---

## Run locally

ES modules do not load from `file://`, so serve the folder over HTTP. Any static server works:

```bash
npx serve .
# or
python -m http.server 8080
# or the VS Code "Live Server" extension
```

Then open the printed address (for example `http://localhost:3000`). Geolocation and the service worker work on `localhost` and on HTTPS only.

## Deploy

The site is fully static, so the folder can be deployed as is.

**Netlify:** drag the project folder onto <https://app.netlify.com/drop>, or run `npx netlify deploy --dir . --prod`. No build command, publish directory `.`.

**Vercel:** `npx vercel --prod` from the project folder, choosing the "Other" framework preset with no build command and output directory `.`.

**GitHub Pages:** push the folder to a repository, then go to *Settings → Pages → Deploy from a branch*, choose `main` and `/ (root)`. All paths are relative, so project sites (`username.github.io/repo/`) work.

If you deploy to a different address, update `og:url`, `og:image`, `twitter:image` and the canonical link in `index.html` to the new absolute URL.

---

## Performance and accessibility

- A single canvas with `requestAnimationFrame`, a device-pixel-ratio cap, a pixel budget, pre-rendered sprites and automatic quality reduction on slow devices. Animation stops when the tab is hidden or the globe is open.
- The forecast refreshes every 10 minutes, skips refreshing while the page is hidden, catches up when you return, and refreshes when you come back online. Requests are cancelled when superseded and deduplicated.
- Air quality and saved-place data load lazily when their sections approach the viewport.
- `prefers-reduced-motion` switches to a still frame, and the animation setting can be changed at any time.
- Keyboard access throughout: skip link, visible focus rings, an ARIA combobox for search, an accessible tablist for graphs, arrow-key chart reading, a keyboard-controllable globe, and a native `<dialog>` for day details. Live regions announce updates.
- Tested in Chrome at 320, 360, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 px widths, with no horizontal page overflow.

## Browser support

Current versions of Chrome, Edge, Firefox and Safari, on desktop and mobile.
