# MBTA Real-Time Transit Tracker Implementation Plan

**Goal:** Build a browser-based real-time MBTA transit visualizer using Leaflet and SSE streaming

**Architecture:** Pure ES6 modules (no build tools), Leaflet via CDN for map rendering, MBTA V3 API via SSE for live vehicle data, dark-themed CartoDB basemap

**Tech Stack:** Leaflet 1.9.4, ES6 modules, MBTA V3 API (SSE), CartoDB Dark Matter tiles

**Scope:** 8 phases from original design (phases 1-8)

**Codebase verified:** 2026-02-07

---

## Acceptance Criteria Coverage

This phase implements and tests:

### mbta-tracker.AC1: Display transit map with Leaflet
- **mbta-tracker.AC1.1 Success:** Map loads with CartoDB Dark Matter tiles centered on Boston (42.3601, -71.0589)
- **mbta-tracker.AC1.2 Success:** User can pan and zoom the map using mouse/touch controls
- **mbta-tracker.AC1.3 Success:** Map displays entire MBTA system area at default zoom level 12

### mbta-tracker.AC1: Display transit map with Leaflet (continued)
- **mbta-tracker.AC1.4 Success:** Map tiles load correctly on desktop and mobile browsers
- **mbta-tracker.AC1.5 Failure:** Map displays error message if tile service unavailable

### mbta-tracker.AC6: Runs locally without server
- **mbta-tracker.AC6.1 Success:** Opening index.html in browser loads and runs application
- **mbta-tracker.AC6.2 Success:** No build step required for Phase 1 (pure ES6 modules)
- **mbta-tracker.AC6.4 Success:** All assets load from CDN or local files (no server needed)
- **mbta-tracker.AC6.5 Edge:** ES6 modules require a local HTTP server (e.g., `python -m http.server 8000`) — `file://` protocol blocks module imports due to CORS. No build step needed, but a server is required.

---

<!-- START_TASK_1 -->
### Task 1: Create config.js and config.example.js

**Files:**
- Create: `config.example.js` — template with placeholder API key (committed to git)
- Create: `config.js` — actual config with real API key (gitignored)
- Modify: `.gitignore` — add `config.js` to prevent committing API key

**Step 1: Add config.js to .gitignore**

Append `config.js` to the existing `.gitignore` file so the real API key is never committed.

**Step 2: Create config.example.js (committed template)**

```javascript
// config.example.js — Configuration template
// Copy to config.js and replace YOUR_API_KEY_HERE with your MBTA API key
// Get a free key at https://api-v3.mbta.com
export const config = {
    api: {
        key: 'YOUR_API_KEY_HERE',
        baseUrl: 'https://api-v3.mbta.com',
    },
    // ... remaining structure identical to config.js below
};
```

`config.example.js` must contain the complete structure shown in the `config.js` block below, with only the API key value replaced by the placeholder `'YOUR_API_KEY_HERE'`.

**Step 3: Create config.js (gitignored, with real key from .env)**

Copy the real API key from `.env` file (`MBTA_API_KEY` value).

```javascript
// config.js — Application configuration (gitignored — do not commit)
// API key from .env — free, 1000 req/min
export const config = {
    api: {
        key: 'YOUR_API_KEY_HERE', // Replace with MBTA_API_KEY value from .env
        baseUrl: 'https://api-v3.mbta.com',
    },
    map: {
        center: [42.3601, -71.0589], // Boston
        zoom: 12,
        minZoom: 10,
        maxZoom: 18,
    },
    tiles: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
    },
    routes: {
        defaultHighlighted: ['Green-E'],
    },
    animation: {
        interpolationDuration: 800,
        fadeInDuration: 200,
        fadeOutDuration: 200,
        snapThreshold: 100, // meters — snap instead of animate above this
    },
};
```

The `config.js` content is identical to `config.example.js` except the API key value uses the real key from `.env`.

**Step 4: Commit**

```bash
git add config.example.js .gitignore
git commit -m "chore: add application configuration template"
```

Note: `config.js` is gitignored and not committed. Only `config.example.js` is tracked.

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Create src/map.js

**Files:**
- Create: `src/` directory
- Create: `src/map.js`

**Step 1: Create the src directory and map module**

```javascript
// src/map.js — Leaflet map initialization and layer management
import { config } from '../config.js';

let map = null;

export function initMap(containerId) {
    map = L.map(containerId, {
        center: config.map.center,
        zoom: config.map.zoom,
        minZoom: config.map.minZoom,
        maxZoom: config.map.maxZoom,
        zoomControl: true,
    });

    const tileLayer = L.tileLayer(config.tiles.url, {
        attribution: config.tiles.attribution,
        subdomains: config.tiles.subdomains,
        maxZoom: config.tiles.maxZoom,
    }).addTo(map);

    // AC1.5: Show error message if tiles fail to load
    tileLayer.on('tileerror', () => {
        const existing = document.getElementById('tile-error');
        if (!existing) {
            const msg = document.createElement('div');
            msg.id = 'tile-error';
            msg.className = 'tile-error';
            msg.textContent = 'Map tiles unavailable — check your connection';
            document.body.appendChild(msg);
        }
    });

    return map;
}

export function getMap() {
    return map;
}
```

**Step 2: Commit**

```bash
git add src/map.js
git commit -m "feat: add map initialization module"
```

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Create styles.css

**Files:**
- Create: `styles.css`

**Step 1: Create the dark theme stylesheet**

```css
/* styles.css — Dark theme base styles */

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

html, body {
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: #1a1a2e;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #e0e0e0;
}

#map {
    width: 100%;
    height: 100%;
}

/* Dark theme overrides for Leaflet controls */
.leaflet-control-zoom a {
    background-color: #16213e !important;
    color: #e0e0e0 !important;
    border-color: #0f3460 !important;
}

.leaflet-control-zoom a:hover {
    background-color: #0f3460 !important;
}

.leaflet-control-attribution {
    background-color: rgba(22, 33, 62, 0.8) !important;
    color: #8888aa !important;
}

.leaflet-control-attribution a {
    color: #5588cc !important;
}

/* Tile error message (AC1.5) */
.tile-error {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1000;
    background: rgba(22, 33, 62, 0.95);
    border: 1px solid #ff4444;
    border-radius: 8px;
    padding: 16px 24px;
    color: #ff6666;
    font-size: 14px;
}
```

**Step 2: Commit**

```bash
git add styles.css
git commit -m "feat: add dark theme base styles"
```

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Create index.html (entry point)

**Files:**
- Create: `index.html`

**Step 1: Create the HTML entry point**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>T-Tracker — MBTA Real-Time Transit</title>

    <!-- Leaflet CSS -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossorigin="" />

    <!-- App CSS -->
    <link rel="stylesheet" href="styles.css" />
</head>
<body>
    <div id="map"></div>

    <!-- Leaflet JS (global L) -->
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
        crossorigin=""></script>

    <!-- App entry point (ES6 module) -->
    <script type="module">
        import { initMap } from './src/map.js';
        initMap('map');
    </script>
</body>
</html>
```

**Step 2: Verify operationally**

Start a local server (ES6 modules require HTTP, not `file://`):
```bash
python -m http.server 8000
```
Open `http://localhost:8000` in a browser. Verify:
1. CartoDB Dark Matter map renders centered on Boston (42.3601, -71.0589)
2. Default zoom level is 12 (shows entire MBTA service area)
3. Zoom in/out buttons work and are dark-themed
4. Pan by click-dragging works
5. Attribution text visible in bottom-right corner
6. No console errors

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add index.html entry point with Leaflet map"
```

<!-- END_TASK_4 -->

---

**Verifies:** None (infrastructure phase — verified operationally by opening in browser)

**Phase done when:** Running `python -m http.server 8000` and opening `http://localhost:8000` displays a CartoDB Dark Matter map centered on Boston at zoom 12, with working zoom/pan controls and dark-themed UI controls. If tiles fail to load, an error message appears. No console errors.
