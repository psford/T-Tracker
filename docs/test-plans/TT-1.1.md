# TT-1.1 — MapLibre GL + VersaTiles Shadow behind a basemap provider seam

Runner: `node --test tests/` for unit tests, `node tests/visual-regression.js` for the
Playwright pass. There is no npm and no build step; tests import `src/` modules
directly and stub the map library on `globalThis`.

The existing stub pattern is `globalThis.L = {...}` in `tests/hydrate-routes.test.js`,
`tests/map-hydrate.test.js` and `tests/stop-markers.test.js`. It becomes
`globalThis.maplibregl = {...}`. Write one shared stub factory rather than three
divergent hand-rolled objects — the current three already differ, and three stubs
drifting apart is how a passing suite stops describing the app.

## AC1 — no request reaches CARTO

Playwright, in `tests/visual-regression.js` or a sibling. Load the app against the
local server, record every request URL, assert none has host `basemaps.cartocdn.com`
and at least one has the host named in `config.basemap`.

Fails if: the config change is made but `map.js` still holds the old hardcoded URL, or
a streamdeck-style fallback path re-introduces it. Assert on the **request log**, not
on the config object — reading config back proves nothing about what the map fetched.

## AC2 — the seam actually swaps

Unit test on the style-builder function `initMap` uses. Call it twice: once with the
shipped vector descriptor, once with `{kind: 'raster', url: 'https://example.test/{z}/{x}/{y}.png', ...}`.

- Vector descriptor → the style handed to MapLibre is (or resolves to) the descriptor's
  style URL.
- Raster descriptor → the style has a `sources` entry of `type: 'raster'` whose `tiles`
  contains the template, and a matching raster layer.

Fails if: `kind` is ignored, or the raster branch does not exist. The "no edit under
`src/`" half of the criterion is checked by the test living entirely in `tests/` and
passing a descriptor in as an argument — if the raster case needs a source edit, this
test cannot be written at all.

Also assert `maxZoom` from the descriptor reaches the map, since Esri-class providers
that cap below 18 are exactly the swap case this seam is for.

## AC3 — undarkened route colours

Unit test on `hydrateRoutes`. Feed a route with `color: 'DA291C'`, read back the line
paint colour, assert `#DA291C` case-insensitively.

Fails if: `darkenHexColor(color, 0.15)` survives at map.js:363 or map.js:814 — the
darkened value is `#B92318`, so assert specifically that the result is **not** that.
A test that only asserts "a colour is set" passes with the bug present.

Cover the route-label colour path too (map.js:814), not just the polyline path. They
are separate call sites and porting one is the likely partial fix.

## AC4 — coordinate order

This is the highest-risk defect in the story: the app stores `[lat, lng]` everywhere
and MapLibre's `setLngLat` wants `[lng, lat]`.

Unit test with a stubbed marker that records what it was handed. Create a vehicle at
Boston — lat 42.3601, lng -71.0589 — and assert the marker received longitude
-71.0589 and latitude 42.3601, by name where the API allows it rather than by
position.

Fails if: the pair is passed through unflipped. Choose a fixture where the transposed
point is unambiguously wrong — Boston transposes to (-71.06, 42.36), in the South
Atlantic — so the assertion cannot pass by coincidence.

Cover both `createVehicleMarker` and `updateVehicleMarker`. They flip independently
and porting one is a real partial-fix mode. Cover stop markers in
`src/stop-markers.js:63` as well, same reasoning.

## AC5 — route visibility

Extend the existing `setVisibleRoutes` tests. Hide a route, assert its line layer is
filtered out **and** its vehicle markers are off the map; show it, assert both return.

Fails if: visibility is ported for lines but not vehicles, which is plausible given
lines become a layer filter while vehicles stay per-marker objects. Assert both halves
in the same test so a half-port cannot pass.

## AC6 — stacking order

`createPane('stopPane')` at z-index 625 disappears with Leaflet. Assert the replacement
ordering directly: read the computed or assigned z-index of a stop marker element, a
vehicle marker element, and the route line layer, and assert stop > vehicle > line.

Fails if: the pane is dropped and nothing replaces it — the default is DOM order, which
is insertion order, which depends on when routes hydrate relative to vehicles arriving.
That makes the bug intermittent in the browser and invisible to a test that does not
assert the ordering explicitly.

## AC7 — the 60fps popup guard

Today's guard is at map.js:289-294: content is rewritten only when `vehicle.updatedAt`
differs from the last write. Test with a counting stub on the popup's setContent.

- Same `updatedAt` across N sync calls → exactly one content write.
- Changed `updatedAt` → one further write.

Fails if: the guard is dropped in the port. Without the counter this regresses silently
— the app looks correct and rewrites popup DOM 60 times a second.

## AC8 — bearing transform

`bearingToTransform` is unchanged pure math; the risk is the port writing its output to
the wrong element or dropping the mirror. Assert the marker element's `transform`
string contains both the expected `rotate(Ndeg)` and the expected `scaleX(±1)` for a
bearing on each side of the mirror boundary. Include a bearing either side of the flip,
and 0/360.

## AC9 — manual, Firefox, branch preview URL

Not automatable and not to be faked with a screenshot diff: "reads as one system" and
"continuous rather than stepped" are judgements.

**Open question, flagged before implementation starts:** this criterion names a branch
preview URL on Cloudflare Pages. `docs/TECHNICAL_SPEC.md` documents `t-tracker.pages.dev`
as the production Pages URL; whether per-branch preview deployments are enabled for this
project is **not verified**. It becomes checkable at the first push of the feature
branch, when the PR either shows a Cloudflare Pages deployment or does not. If no
preview appears, raise it then rather than substituting localhost silently — a UAT that
happened somewhere other than where the criterion says is not the UAT that was agreed.

## Regression surface not covered by an AC

Run the whole existing suite, not only new tests. `tests/map-hydrate.test.js`,
`tests/hydrate-routes.test.js`, `tests/stop-markers.test.js`, `tests/stop-popup.test.js`,
`tests/vehicle-popup.test.js` and `tests/vehicles.test.js` all exercise code this story
rewrites. `tests/sw.test.js:89` asserts on the Leaflet CDN URL and will fail until
updated — that failure is expected and its fix is part of this story.

Non-obvious cases worth a test even though no AC names them:

- **Second hydrate.** `hydrateRoutes` running twice must not stack duplicate sources or
  layers. MapLibre throws on a duplicate source id, where Leaflet silently added a
  second polyline. This will surface as a crash on the static-data staleness refresh,
  which is a real code path this app runs on startup.
- **Markers before style load.** MapLibre rejects `addSource`/`addLayer` before the
  style is ready. Vehicles arrive over SSE and can land first. Assert hydration queued
  before `style.load` still ends with the layers present.
- **Empty route.** A route with no polylines must not create an empty source that later
  breaks a filter.
