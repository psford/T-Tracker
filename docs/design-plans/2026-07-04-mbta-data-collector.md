# Design Plan: MBTA Data Collector & Historical Logging

**Date:** 2026-07-04
**Branch:** feature/mbta-data-collector
**Status:** Draft

## Problem Statement

T-Tracker only observes vehicle positions while a browser tab is open, so no history survives a session. We can't compute observed segment travel times (needed for honest "minutes away" estimates in the pinned-stop chip), and years of Green Line spacing/dispatching questions remain unanswerable because the data was never captured.

## Proposed Solution

A small always-on collector subscribes to the MBTA V3 SSE `/vehicles` stream server-side, writes raw position events to Azure Blob Storage (JSONL, gzipped), derives transit events (segment traversals, dwells, holds, headways) in real time, and batch-inserts them into a new `ttracker` schema in the existing stock analyzer Azure SQL database. Heavy analysis runs in DuckDB directly over the blob archive. A periodic rollup publishes per-segment median travel times as a static JSON that the web app fetches — the client never touches SQL.

## Route Type Impact Analysis

Not applicable — this feature adds a new server-side collector and does not touch `src/map.js`, `src/stop-markers.js`, `scripts/fetch-mbta-data.mjs`, `src/polyline-merge.js`, or `src/polyline.js`.

### isRailType() boundary

- [x] No — the existing rail/non-rail branches are unchanged

### One-Way Street / Terminus Divergence Check

- [x] This change does not modify merging or dedup logic

### Direction Classification Check

- [x] This change does not modify stop direction classification

## Constraints & Verified Facts (2026-07-04)

- **Zero new Azure spend.** Everything rides on resources already billed:
  - Compute: continuous WebJob on the shared P0v3 plan `asp-stockanalyzer` (rg-stockanalyzer-prod), which already hosts `app-roadtripmap-prod`.
  - Blob: existing Road Trip storage account, new containers.
  - SQL: `sql-stockanalyzer-er34ug` / `stockanalyzer-db`, **Standard S0 (10 DTU), 250 GB max** — verified via `az sql db list` on 2026-07-04. New schema `ttracker`, no new database (Azure SQL bills per database).
- Secrets (MBTA API key, SQL connection string) live in App Service settings / Key Vault. Nothing ships to the browser.
- 10 DTU is shared with stock analyzer workloads: collector must batch inserts (flush ≤ every 5 min) and never write row-at-a-time.

## Architecture

```
MBTA V3 SSE /vehicles ──► Collector (WebJob, Node)
                            │
              ┌─────────────┼──────────────────┐
              ▼             ▼                  ▼
        Blob: raw      ttracker schema    Blob: rollup
        JSONL.gz       (Azure SQL,        segment-medians.json
        per route/hour  batched inserts)  (public, app fetches)
              │
              ▼
        DuckDB (local/notebook analysis)
```

### Collector

- Node.js (reuses SSE handling patterns from `src/api.js`; runs headless — no Leaflet/DOM deps).
- Deployed as a **continuous WebJob** beside `app-roadtripmap-prod` (Always On already enabled on the plan). Deployment decoupled from Road Trip app releases (separate WebJob artifact; document restart behavior).
- Subscribes to **all Green Line branches (B/C/D/E) from day one** — spacing on the E is a trunk phenomenon created at Park St / Government Center by B/C/D interleaving. Route list is config, so Red/Orange/Blue can be added later at ~2× volume.
- Buffers events in memory; flushes raw JSONL to blob every 60 s, derived events to SQL every 5 min.
- On SSE disconnect: reconnect with backoff (mirror `src/api.js` behavior) and write a `gap` marker event so analysis can exclude unobserved windows instead of misreading them as long headways.

### Raw log (blob)

- Container `mbta-raw`, path `{route}/{yyyy-MM-dd}/{HH}.jsonl.gz`.
- One JSON object per SSE event: `{ts, event, vehicleId, tripId, routeId, directionId, lat, lon, bearing, currentStatus, stopId, speed}` — as received, no interpretation.
- Volume: Green Line ≈ low hundreds of thousands of events/day ≈ single-digit MB/day gzipped.
- Lifecycle rule: move blobs to Cool tier after 60 days. Never delete (this is the ground truth).

### Predictions log (blob) — capture-only

Predictions cannot be fetched retroactively; if not captured live, prediction-vs-actual analysis is impossible forever. The collector therefore also polls `GET /predictions?filter[route]=<configured routes>` every 60 s and archives the raw response:

- Container `mbta-predictions-raw`, path `{route}/{yyyy-MM-dd}/{HH}.jsonl.gz`, one prediction object per line, stamped with collector receive-time.
- **Capture-only:** no derivation, no SQL tables, no app usage. Analysis (join predicted vs actual arrival by `trip_id` + `stop_id` in DuckDB) is a future project enabled by this archive.
- Controlled by an app-setting flag (`ENABLE_PREDICTIONS_LOG`), **on by default** — toggling requires a portal settings change, not a release.
- Volume ≈ 2× the vehicle log; still single-digit MB/day gzipped. Same lifecycle rule (Cool after 60 days, never delete).

### Derived events (ttracker schema, Azure SQL)

Event detection runs in the collector (same state machine the future pinned-stop chip uses client-side — write once, run both places):

- **segment_traversal** — vehicle departed stop A, arrived stop B: `(route_id, direction_id, trip_id, vehicle_id, from_stop, to_stop, depart_utc, arrive_utc, seconds)`
- **dwell** — time stopped at a stop: `(route_id, stop_id, trip_id, vehicle_id, arrive_utc, depart_utc, seconds)`
- **hold** — no meaningful position change for ≥ 90 s while in service, outside normal dwell: `(route_id, stop_id_nearest, trip_id, vehicle_id, start_utc, end_utc, seconds)`
- **headway** — per stop+direction, seconds since previous train's arrival: `(route_id, stop_id, direction_id, arrive_utc, seconds_since_prev, prev_trip_id, trip_id)`
- **gap** — collector outage/SSE disconnect window: `(start_utc, end_utc, reason)`

T-SQL sketch (final DDL in implementation plan):

```sql
CREATE SCHEMA ttracker;

CREATE TABLE ttracker.segment_traversal (
    id            bigint IDENTITY PRIMARY KEY,
    route_id      varchar(32)  NOT NULL,
    direction_id  tinyint      NOT NULL,
    trip_id       varchar(64)  NOT NULL,
    vehicle_id    varchar(32)  NOT NULL,
    from_stop     varchar(32)  NOT NULL,
    to_stop       varchar(32)  NOT NULL,
    depart_utc    datetime2(0) NOT NULL,
    arrive_utc    datetime2(0) NOT NULL,
    seconds       int          NOT NULL,
    INDEX ix_seg_route_time (route_id, direction_id, arrive_utc),
    INDEX ix_seg_pair (from_stop, to_stop, arrive_utc)
);
-- dwell / hold / headway / gap tables follow the same shape
```

Growth: low thousands of rows/day across all tables ≈ 100–200 MB/year with indexes — negligible against 250 GB.

### Rollup JSON (app-facing)

- Every 30 min the collector writes `segment-medians.json` to a public blob container: rolling 21-day median + p20/p80 seconds per `(from_stop, to_stop, direction)`, bucketed AM-rush / midday / PM-rush / evening / weekend.
- The web app fetches it at load to convert "3 stops away" into "~6 min if it keeps moving"; falls back to bundled defaults if unreachable. **The predictions API is not used for this** — observed travel times only.

### Analysis (DuckDB)

- DuckDB reads the gzipped JSONL straight from blob (`azure` extension or a local `azcopy sync` mirror) plus optional exports of the SQL tables.
- First notebooks: headway distribution at Prudential outbound by hour; hold frequency/duration at Park St; trunk interleaving vs E-branch headway variance; bunching detection via `LAG(...) OVER (PARTITION BY stop_id, direction_id ORDER BY arrive_utc)`.

## Acceptance Criteria

1. [AC1] Collector runs as a continuous WebJob on `asp-stockanalyzer` and survives App Service restarts; SSE reconnects with backoff and records `gap` events.
2. [AC2] Raw JSONL blobs appear per route/hour with correct schema; a 24 h run produces no unexplained gaps beyond recorded `gap` windows.
3. [AC3] `ttracker` schema exists in `stockanalyzer-db` with the five tables; inserts are batched (≤ 1 flush / 5 min) and a 24 h run shows no measurable DTU impact on stock analyzer workloads.
4. [AC4] Derived events validated against reality: for one evening commute, segment traversals and headways at Prudential match manual observation of the live map.
5. [AC5] `segment-medians.json` published every 30 min and fetchable anonymously; the web app loads it (or falls back) with no console errors.
6. [AC6] A DuckDB session over ≥ 7 days of raw blobs reproduces the headway distribution computed from the SQL `headway` table (cross-validation of the derivation logic).
7. [AC7] Predictions log: raw prediction blobs appear per route/hour while `ENABLE_PREDICTIONS_LOG` is on; flipping the app setting off stops capture without a deploy.
8. [AC8] No secrets in the T-Tracker repo or client bundle; MBTA key and SQL connection string only in App Service settings / Key Vault.
9. [AC9] Zero new Azure resources billed per-unit (verified via cost analysis after 1 week: storage-account and SQL line items only grow within noise).

## Phases

1. **Collector + raw blob log.** SSE → JSONL.gz, plus the predictions poller (capture-only, flag-controlled, on by default). No SQL, no derivation. Start accumulating ground truth — and prediction claims — immediately.
2. **Event derivation + ttracker schema.** State machine for traversal/dwell/hold/headway; batched SQL writes; gap handling; AC4 validation.
3. **Rollup JSON + app integration.** Medians publisher; app fetch with fallback. (The pinned-stop chip UI itself is a separate front-end design plan.)
4. **DuckDB analysis kit.** Blob access recipe, starter queries/notebook for spacing & dispatch questions; AC6 cross-validation.

## Testing

- [ ] Unit: event state machine (traversal/dwell/hold/headway/gap) against recorded SSE fixtures, including reconnect and out-of-order events
- [ ] Unit: JSONL writer partitioning and gzip integrity
- [ ] Integration: 24 h soak on dev slot / locally against live SSE before WebJob deploy
- [ ] AC4 manual validation session (one evening commute, E branch)
- [ ] Existing T-Tracker suite untouched and passing (`node tests/*.test.js`) — no app code changes until Phase 3

## Open Questions / Risks

- **WebJob co-tenancy:** collector shares the P0v3 plan with Road Trip prod. Memory footprint should be trivial (< 100 MB), but confirm plan headroom and set the WebJob to not scale with slot swaps.
- **Trip/vehicle identity quirks:** Green Line two-car consists and trip-id churn at termini may need dedupe rules; expect iteration in Phase 2 (AC4 exists for exactly this).
- **Stop-adjacency source:** derivation needs an ordered stop list per route+direction — reuse the prebaked `data/mbta-static.json` bundle rather than re-fetching.
- **Clock discipline:** use collector receive-time consistently; MBTA `updated_at` recorded but not trusted for ordering.
