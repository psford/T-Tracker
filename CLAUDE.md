# T-Tracker -- MBTA Real-Time Transit Tracker

Last verified: 2026-02-14

## Data Flow Architecture

```
MBTA API (SSE) → api.js (parse + validate) → vehicles.js (interpolate + animate)
                      |                                ↓
                      |                           vehicle-math.js (pure math)
                      |                                ↓
                      |                        map.js (render + visibility)
                      |                          ↑               ↑
                      |                    ui.js (configure)  vehicle-icons.js (icon data)
                      |                                      stop-markers.js (render stops)
                      |                                      stop-popup.js (format)
                      |
                      +→ notifications.js (monitor vehicles → fire alerts)
                               ↓
                         notification-ui.js (status indicator + config panel)
```

All data flows through dedicated modules with clear responsibilities:
- `api.js`: JSON:API parsing, null validation, event emission
- `vehicles.js`: State management, animation loop, viewport culling
- `vehicle-math.js`: Pure math (lerp, easing, distance, angle interpolation, color manipulation, bearing transform)
- `vehicle-icons.js`: Pure data module with SVG silhouettes for each MBTA vehicle type
- `polyline.js`: Pure function for Google polyline decoding
- `map.js`: Leaflet rendering, marker management, route visibility filtering, stop data
- `ui.js`: Route selection UI, localStorage persistence, grouping/sorting
- `stop-markers.js`: Stop marker rendering on map, notification pair config workflow
- `stop-popup.js`: Stop popup HTML formatting with notification config states
- `notifications.js`: Notification engine, pair management, localStorage persistence, direction detection
- `notification-ui.js`: Notification status indicator, config panel, permission management UI

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
- `node tests/stop-markers.test.js` -- run stop marker unit tests
- `node tests/stop-popup.test.js` -- run stop popup formatting tests
- `node tests/notifications.test.js` -- run notification engine tests
- `node tests/notification-ui.test.js` -- run notification UI tests
- ES6 modules require HTTP server; `file://` protocol will not work

## Project Structure
- `index.html` -- Entry point, wires modules together, loads Leaflet CDN, notification DOM elements
- `styles.css` -- Dark theme, responsive layout, vehicle marker styles, stop/notification styles
- `config.js` -- All configuration (API key, map center, animation timing, route defaults)
- `config.example.js` -- Template for config.js (committed; config.js is gitignored)
- `src/` -- 13 application modules (see `src/CLAUDE.md` for contracts)
- `tests/` -- 10 unit test files for pure functions and data modules
- `docs/` -- Design plans and implementation phase docs

## Conventions
- Pure ES6 modules with `import`/`export` (no build step, no npm)
- Functional module exports (no classes)
- Event-driven communication between modules (CustomEvent on EventTarget)
- camelCase for JS, kebab-case for CSS classes (BEM-lite: `block--modifier`)
- All API data flattened from JSON:API format at the api.js boundary

## Development Workflow (SDLC)
**NEVER create throwaway prototype files** (e.g., `index-new.html`, `test-feature.html`)
**ALWAYS work on production files in feature branches**

### Branching Strategy
- `master` - production branch (auto-deploys to supertra.in)
- `feature/*` - new features (e.g., `feature/map-notifications`)
- `dev/*` - experiments or multi-feature work
- Commit to feature branch, test locally, then merge to master

### Adding New Features
1. **Create feature branch**: `git checkout -b feature/descriptive-name`
2. **Modify production files**: Edit `index.html`, `src/*.js`, etc. directly
3. **Test locally**: Run `python -m http.server 8000`
4. **Commit incrementally**: Save work as you go
5. **Merge when complete**: Merge to master, triggers auto-deploy

### What NOT to Do
- ❌ Don't create `index-v2.html`, `map-enhanced.html`, or similar duplicates
- ❌ Don't build features in separate throwaway files
- ❌ Don't prototype outside the production file structure
- ✅ DO work on actual production files in branches
- ✅ DO commit frequently to save progress
- ✅ DO use feature branches to isolate work

**Rationale**: Throwaway files create technical debt, confusion, and merge conflicts. Feature branches provide isolation without duplication.

## Configuration
- `config.js` holds API key, map settings, animation timing, route defaults
- Gitignored (contains API key); copy `config.example.js` to create
- Default visibility derived from service type (Subway on, Bus/CR/Ferry off on first visit)
- `routes.defaultVisible` in config is vestigial; ui.js derives defaults from metadata
- Animation thresholds (snap >100m, interpolation 800ms, fade 200ms)

## Boundaries
- Safe to edit: `src/`, `styles.css`, `index.html`, `config.example.js`
- Never commit: `config.js` (contains MBTA API key), `.env`
- CDN dependency: Leaflet loaded via `<script>` tag with SRI hash, not bundled

## Deployment (Cloudflare Pages)
- **URL**: `https://supertra.in`
- **Build command**: `node build.js`
- **Output directory**: `dist`
- **Environment variable**: `MBTA_API_KEY` (set in Cloudflare dashboard, encrypted)
- **Trigger**: Auto-deploy on push to `master`
- **Build script**: `build.js` copies static files to `dist/`, generates `config.js` from `config.example.js` with API key injected
- **Local dev unchanged**: Copy `config.example.js` to `config.js`, run `python -m http.server 8000`

## API Rate Limits
- MBTA allows 1000 req/min with API key
- SSE connection counts as 1 request (persistent)
- Startup fetches: routes list + stops list (~2 requests), then per-route stop mapping (~180 requests, throttled to 3 concurrent via buildRouteStopsMapping)
- Exponential backoff on reconnect: 1s, 2s, 4s... max 30s
- Rapid-close detection triggers aggressive backoff (likely rate limited)
