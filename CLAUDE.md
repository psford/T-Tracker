# T-Tracker -- MBTA Real-Time Transit Tracker

Last verified: 2026-03-13
Last context update: 2026-03-13

## Data Flow Architecture

```
Static Data Pipeline:
  MBTA API (HTTP) → scripts/fetch-mbta-data.mjs → data/mbta-static.json
                                                        ↓
  data/mbta-static.json → static-data.js (localStorage cache) → (hydrate on startup)
                                                                        ↓
Live Data Pipeline:
  MBTA API (SSE) → api.js (parse + validate) → vehicles.js (interpolate + animate)
                      |                                ↓
                      |                           vehicle-math.js (pure math)
                      |                                ↓
                      |                              map.js (render + visibility)
                      |                               ↑               ↑
                      |                      ui.js (configure)  vehicle-icons.js (icon data)
                      |                           ↓                 ↑
                      |                   route-sorter.js     stop-markers.js (render stops)
                      |                    (group/sort)        polyline-merge.js (merge decision)
                      |                                        stop-popup.js (format)
                      |                                        vehicle-popup.js (format)
                      |
                      +→ notifications.js (monitor vehicles → fire alerts → countdown expiry)
                               ↓
                         notification-ui.js (status indicator + config panel)
```

All data flows through dedicated modules with clear responsibilities:
- `api.js`: JSON:API parsing, null validation, event emission
- `vehicles.js`: State management, animation loop, viewport culling
- `vehicle-math.js`: Pure math (lerp, easing, distance, angle interpolation, color manipulation, bearing transform)
- `vehicle-icons.js`: Pure data module with SVG silhouettes for each MBTA vehicle type
- `vehicle-popup.js`: Pure formatting for vehicle popup content (HTML escaping, status strings)
- `polyline.js`: Pure function for Google polyline decoding
- `polyline-merge.js`: Pure function for deciding whether two polylines should be merged (arc-length sampling, nearest-vertex distance)
- `map.js`: Leaflet rendering, marker management, route visibility filtering, stop data fetching
- `route-sorter.js`: Pure function for grouping and sorting route metadata by type and name
- `static-data.js`: Static data loader with localStorage caching and background staleness check
- `ui.js`: Route selection UI, localStorage persistence, grouping/sorting orchestration
- `stop-markers.js`: Stop marker rendering on map, parent station merging (200m proximity), notification pair config workflow
- `stop-popup.js`: Stop popup HTML formatting with notification config states
- `notifications.js`: Notification engine, pair management, localStorage persistence, direction detection, SW showNotification with fallback, testable pathway selection
- `notification-ui.js`: Notification status indicator, config panel, permission management UI, platform-specific messaging (iOS/Android/desktop)

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
- `node tests/polyline-merge.test.js` -- run polyline merge unit tests
- `node tests/stop-markers.test.js` -- run stop marker unit tests
- `node tests/stop-popup.test.js` -- run stop popup formatting tests
- `node tests/notifications.test.js` -- run notification engine tests
- `node tests/notification-ui.test.js` -- run notification UI tests
- `node tests/map-hydrate.test.js` -- run map hydration unit tests
- `node tests/sw.test.js` -- run service worker fetch handler tests
- `node tests/fetch-mbta-data.test.js` -- run MBTA data pipeline tests (AC1.1, AC1.2, AC1.4, AC1.5, AC1.6, AC1.7)
- `node tests/fire-notification.test.js` -- run notification pathway selection tests
- `node tests/sse-notification-integration.test.js` -- run SSE→notification integration tests
- `node tests/vehicles-state.test.js` -- run vehicle state management tests
- `node tests/static-data.test.js` -- run static data loader unit tests
- `MBTA_API_KEY=<key> node scripts/fetch-mbta-data.mjs` -- regenerate data/mbta-static.json from MBTA API
- ES6 modules require HTTP server; `file://` protocol will not work

## Project Structure
- `index.html` -- Entry point, wires modules together, loads Leaflet CDN, notification DOM elements, SW registration
- `styles.css` -- Dark theme, responsive layout, vehicle marker styles, stop/notification styles
- `config.js` -- All configuration (API key, map center, animation timing, route defaults)
- `config.example.js` -- Template for config.js (committed; config.js is gitignored)
- `manifest.json` -- PWA manifest (app name, icons, theme color, display: standalone)
- `sw.js` -- Minimal service worker (no caching, notification click handler)
- `icons/` -- PWA icons (192x192, 512x512, 180x180 apple-touch-icon)
- `scripts/` -- Build/maintenance scripts
  - `fetch-mbta-data.mjs` -- Node.js ESM script to prebake MBTA static data (routes, stops, shapes) into `data/mbta-static.json`
- `data/` -- Pre-baked static data files
  - `mbta-static.json` -- Pre-fetched MBTA routes, stops, and route-stop mappings (regenerated nightly by GitHub Actions)
- `src/` -- 15 application modules (see `src/CLAUDE.md` for contracts)
- `tests/` -- 17 test files (unit tests, integration tests, pathway tests)
- `docs/` -- Design plans and implementation phase docs
- `.github/workflows/refresh-mbta-data.yml` -- Nightly GitHub Actions workflow to refresh `data/mbta-static.json` from MBTA API
- `.visual-review/` -- Visual review tooling (config, mock pages, screenshots)
  - `config.json` -- Theme colors, viewports, stylesheet path, contrast settings
  - `mocks/` -- Standalone HTML mock pages for CSS visual testing
  - `screenshots/` -- Generated screenshots (gitignored)

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

### Visual Review (CSS Testing)
- The `visual-review` Claude Code skill captures screenshots of mock pages for CSS review
- Mock pages live in `.visual-review/mocks/` and load production `styles.css` with `position: static !important` overrides
- `.visual-review/config.json` defines project theme, viewports (mobile 390x844, desktop 1400x900), and contrast requirements
- Screenshots are generated into `.visual-review/screenshots/` (gitignored)
- Mock pages are NOT throwaway prototypes -- they are committed test fixtures for ongoing visual regression

## Worktrees
- After creating a worktree, **copy `config.js`** from main repo root into the worktree (it's gitignored, so worktrees get a placeholder with a dummy API key)
- Dummy API keys cause silent SSE failures ("Rate limited — retrying...") that look like rate limits but are actually auth failures

## Retrospective
- Retro items are logged in `docs/retro-items.md` (not `.claude/retrospective-log.md`)

## Decisions
- Architectural and product decisions are recorded in `docs/decisions.md`
- Read this file at session start before proposing solutions related to polylines, merging, or rendering
- REJECTED entries must never be re-proposed — check before suggesting alternatives
- When Patrick makes a UX/product decision, implement it; technical objections only for data loss, security, or irreversibility

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
- **Build script**: `build.js` copies static files to `dist/`, validates and copies `data/mbta-static.json`, generates `config.js` from `config.example.js` with API key injected
- **Static data refresh**: GitHub Actions runs nightly at 03:00 UTC to regenerate `data/mbta-static.json` and auto-commit if changed (requires `MBTA_API_KEY` repository secret)
- **Local dev unchanged**: Copy `config.example.js` to `config.js`, run `python -m http.server 8000`

## API Rate Limits
- MBTA allows 1000 req/min with API key
- SSE connection counts as 1 request (persistent)
- Startup fetches: 0 MBTA API calls for static data (routes, stops, route-stops loaded from data/mbta-static.json via static-data.js with localStorage cache). One lightweight staleness check (/routes?fields[route]=id) fires in background. Fallback path (if static data unavailable): routes list + stops list (~2 requests), then route-stop mapping on-demand via fetchRouteStops.
- Exponential backoff on reconnect: 1s, 2s, 4s... max 30s
- Rapid-close detection triggers aggressive backoff (likely rate limited)
