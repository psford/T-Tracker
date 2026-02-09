# T-Tracker -- MBTA Real-Time Transit Tracker

Last verified: 2026-02-08

## Data Flow Architecture

```
MBTA API (SSE) → api.js (parse + validate) → vehicles.js (interpolate + animate)
                                                      ↓
                                                 vehicle-math.js (pure math)
                                                      ↓
                                              map.js (render + visibility)
                                                ↑               ↑
                                          ui.js (configure)  vehicle-icons.js (icon data)
```

All data flows through dedicated modules with clear responsibilities:
- `api.js`: JSON:API parsing, null validation, event emission
- `vehicles.js`: State management, animation loop, viewport culling
- `vehicle-math.js`: Pure math (lerp, easing, distance, angle interpolation, color manipulation, bearing transform)
- `vehicle-icons.js`: Pure data module with SVG silhouettes for each MBTA vehicle type
- `polyline.js`: Pure function for Google polyline decoding
- `map.js`: Leaflet rendering, marker management, route visibility filtering
- `ui.js`: Route selection UI, localStorage persistence, grouping/sorting

## Tech Stack
- Language: JavaScript (ES6 modules, no build tools)
- Map: Leaflet 1.9.4 (CDN with SRI hash)
- Tiles: CartoDB Dark Matter (dark theme basemap)
- Data: MBTA V3 API via Server-Sent Events (SSE)
- Tests: Node.js assert module (`node --experimental-vm-modules`)

## Commands
- `python -m http.server 8000` from project root, then open `http://localhost:8000`
- `node tests/vehicles.test.js` -- run vehicle/math unit tests
- `node tests/vehicle-icons.test.js` -- run vehicle icon tests
- ES6 modules require HTTP server; `file://` protocol will not work

## Project Structure
- `index.html` -- Entry point, wires modules together, loads Leaflet CDN
- `styles.css` -- Dark theme, responsive layout, vehicle marker styles
- `config.js` -- All configuration (API key, map center, animation timing, route defaults)
- `config.example.js` -- Template for config.js (committed; config.js is gitignored)
- `src/` -- Application modules (see `src/CLAUDE.md` for contracts)
- `tests/` -- Unit tests for pure functions and data modules
- `docs/` -- Design plans and implementation phase docs

## Conventions
- Pure ES6 modules with `import`/`export` (no build step, no npm)
- Functional module exports (no classes)
- Event-driven communication between modules (CustomEvent on EventTarget)
- camelCase for JS, kebab-case for CSS classes (BEM-lite: `block--modifier`)
- All API data flattened from JSON:API format at the api.js boundary

## Configuration
- `config.js` holds API key, map settings, animation timing, route defaults
- Gitignored (contains API key); copy `config.example.js` to create
- Default visibility derived from service type (Subway on, Bus/CR off on first visit)
- `routes.defaultVisible` in config is vestigial; ui.js derives defaults from metadata
- Animation thresholds (snap >100m, interpolation 800ms, fade 200ms)

## Boundaries
- Safe to edit: `src/`, `styles.css`, `index.html`, `config.example.js`
- Never commit: `config.js` (contains MBTA API key), `.env`
- CDN dependency: Leaflet loaded via `<script>` tag with SRI hash, not bundled

## API Rate Limits
- MBTA allows 1000 req/min with API key
- SSE connection counts as 1 request (persistent)
- Startup fetches (routes, stops) are ~10 requests total
- Exponential backoff on reconnect: 1s, 2s, 4s... max 30s
- Rapid-close detection triggers aggressive backoff (likely rate limited)
