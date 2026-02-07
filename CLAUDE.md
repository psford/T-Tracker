# T-Tracker -- MBTA Real-Time Transit Tracker

Last verified: 2026-02-07

## Tech Stack
- Language: JavaScript (ES6 modules, no build tools)
- Map: Leaflet 1.9.4 (CDN with SRI hash)
- Tiles: CartoDB Dark Matter (dark theme basemap)
- Data: MBTA V3 API via Server-Sent Events (SSE)
- Tests: Node.js assert module (`node --experimental-vm-modules`)

## Commands
- `python -m http.server 8000` from project root, then open `http://localhost:8000`
- `node tests/vehicles.test.js` -- run unit tests (math functions)
- ES6 modules require HTTP server; `file://` protocol will not work

## Project Structure
- `index.html` -- Entry point, wires modules together, loads Leaflet CDN
- `styles.css` -- Dark theme, responsive layout, vehicle marker styles
- `config.js` -- All configuration (API key, map center, animation timing, route defaults)
- `config.example.js` -- Template for config.js (committed; config.js is gitignored)
- `src/` -- Application modules (see `src/CLAUDE.md` for contracts)
- `assets/icons/` -- SVG vehicle icons (white arrow, CSS-colorized)
- `tests/` -- Unit tests for pure math functions
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
- Route highlighting defaults configurable without code changes
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
