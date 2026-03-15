# Design Plan: [Feature Name]

**Date:** YYYY-MM-DD
**Branch:** feature/[name]
**Status:** Draft | In Progress | Complete

## Problem Statement

[1-3 sentences describing what is wrong or missing.]

## Proposed Solution

[1-3 sentences describing the approach.]

## Route Type Impact Analysis

**This section is mandatory for any change touching:**
- `src/map.js` (polyline rendering, hydrateRoutes, loadRoutes)
- `src/stop-markers.js` (stop rendering, direction classification)
- `scripts/fetch-mbta-data.mjs` (prebake pipeline)
- `src/polyline-merge.js` or `src/polyline.js`

**If your change does not touch any of those files, write "Not applicable" and skip the table.**

Reference: `src/CLAUDE.md` — Route Type Behavior Matrix for current behavior.

| Route Type | Current Behavior | Proposed Change | Reason for Difference |
|---|---|---|---|
| **Type 0 — Light Rail** (Green Line branches) | [current] | [proposed] | [why different, or "same"] |
| **Type 1 — Heavy Rail** (Red, Orange, Blue) | [current] | [proposed] | [why different, or "same"] |
| **Type 2 — Commuter Rail** | [current] | [proposed] | [why different, or "same"] |
| **Type 3 — Bus** | [current] | [proposed] | [why different, or "same"] |
| **Type 4 — Ferry** | [current] | [proposed] | [why different, or "same"] |

### isRailType() boundary

Does your change add, remove, or modify any logic that branches on `isRailType()` (i.e., `type === 0 || type === 1`)?

- [ ] No — the existing rail/non-rail branches are unchanged
- [ ] Yes — describe the change:

### One-Way Street / Terminus Divergence Check

For any change to polyline merging or dedup:

- [ ] This change does not modify merging or dedup logic
- [ ] This change modifies merging/dedup: verified that bus one-way street divergences are preserved as separate segments

### Direction Classification Check

- [ ] This change does not modify stop direction classification
- [ ] This change modifies direction classification: verified classification is only applied to types 0 and 1

## Acceptance Criteria

1. [AC1] ...
2. [AC2] ...

## Testing

- [ ] `node tests/route-type-polyline.test.js` passes
- [ ] `node tests/polyline-merge.test.js` passes
- [ ] `node tests/stop-markers.test.js` passes
- [ ] `node tests/visual-regression.js` passes
- [ ] Visual check: Bus 39 terminus divergence visible at zoom 17
- [ ] Visual check: Red Line renders single trunk + branches, no doubled tracks
