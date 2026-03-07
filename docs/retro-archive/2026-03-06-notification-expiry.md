# Retrospective Items

Items to address in future development cycles.

---

## 2026-03-06 — Notification Expiry Feature

### Worktree config.js has dummy API key

**What happened:** The worktree at `.worktrees/notification-expiry/` had a `config.js` with `key: 'test-api-key'` instead of a real MBTA API key. When serving the app from the worktree on localhost:8000, the SSE connection failed with "Rate limited — retrying..." because the MBTA API rejected the dummy key. Patrick had to wait while we diagnosed and copied the real config over.

**Impact:** Blocked manual testing of the feature. The "Reconnecting" and "Rate limited" status indicators were misleading — it wasn't a rate limit, it was an auth failure.

**Root cause:** `config.js` is gitignored (correctly — it contains a real API key). When a worktree is created, it gets a fresh working tree but shares `.gitignore`. The worktree either had no `config.js` (and one was created from the template with a placeholder) or an old test copy was present.

**Action item:** Worktree setup should copy `config.js` from the main repo into the worktree automatically. Either:
1. Add a post-worktree-create hook that copies `config.js` if it exists in the main repo
2. Update the `using-git-worktrees` skill to include a step: "Copy gitignored config files (config.js, .env) from main repo to worktree"
3. Add to CLAUDE.md worktree checklist: "After creating worktree, copy config.js from main repo"

**Priority:** High — dummy API keys in a test environment silently break data fetching, making the app appear to work but with no live data.

### Red Line trains not snapping to polyline track

**What happened:** During human testing of notification expiry, observed a Red Line train near South Station rendering off the polyline — floating in the Leather District area instead of snapping to the track.

**Impact:** Visual only — vehicle position appears incorrect on the map.

**Root cause:** TBD — likely the MBTA API reports a GPS coordinate that doesn't closely match any segment of the decoded polyline, so the nearest-point-on-segment snap fails or snaps to a distant segment.

**Action item:** Investigate polyline snapping logic in `vehicle-math.js` for Red Line near South Station. May need to check if the Red Line polyline data is complete through that area (branching near JFK/UMass could cause gaps).

**Priority:** Medium — cosmetic issue, does not affect functionality.

### Alerted stop markers need stronger visual prominence

**What happened:** During human testing, Patrick noted that alerted stops (radius 6→8, opacity 0.6→1.0) aren't visually distinct enough, especially when zoomed out.

**Impact:** Users may not easily spot which stops have active alerts on the map.

**Desired behavior:** Alerted stops should be unmistakable — consider CSS pulse animation, larger size increase, glow effect, or ring outline. Should be visible even at low zoom levels.

**Current implementation:** `highlightConfiguredStop()` in `stop-markers.js` sets radius 8, fillOpacity 1.0, weight 2. Only a ~33% size increase.

**Action item:** Design and implement a more prominent visual treatment for alerted stops. Consider pulse keyframe animation on the Leaflet circle marker (via CSS class on the marker's SVG/canvas element) or a secondary overlay marker.

**Priority:** Medium — UX improvement, does not affect functionality.

### Blind CSS iteration without visual verification (what went wrong)

**What happened:** During human testing, Patrick reported panel layout spacing issues (overflow, wasted space, button widths). Multiple CSS changes were made without visual verification — each change was pushed to the user for manual screenshot feedback. Six rounds of guessing before Patrick said "stop guessing at fixes without testing them."

**Impact:** Wasted Patrick's time testing incremental CSS changes. Each round required Patrick to reload, reproduce the state, screenshot, and describe what was still wrong. Slow iteration loop.

**Root cause:** No visual test infrastructure existed. CSS changes were made by reasoning about flex layout mentally instead of rendering and inspecting. The SSE-dependent app made Playwright setup harder (networkidle timeout), which discouraged automated visual testing.

**Priority:** High — process improvement that directly affects user experience during development.

### Playwright mock page for CSS iteration (what went well)

**What happened:** After Patrick flagged the blind CSS guessing, we built a standalone HTML mock page (`test-panel-layout.html`) that loads the real `styles.css` but renders hardcoded panel content without needing the full app running. A Playwright script (`test-panel-layout.py`) screenshots the mock page headlessly. This let us iterate on CSS changes with visual verification in seconds instead of asking Patrick to reload, reproduce state, and screenshot.

**Impact:** The panel layout went from "worst of all worlds" to "so much cleaner" in 2-3 verified iterations. Patrick didn't have to test any intermediate states — only the final result.

**Why it worked:**
1. **Decoupled CSS from app state** — the mock page doesn't need SSE connections, API keys, or localStorage seeding. It's just HTML + the real stylesheet.
2. **Multiple test cases in one page** — long stop names, short stop names, morph input active, chip picker open. Edge cases are visible simultaneously.
3. **Sub-second feedback loop** — change CSS → `python test-panel-layout.py` → view screenshot. No manual reproduction steps.
4. **Caught the real root cause** — screenshots revealed that `padding-right: 55px` on `.notification-pair` (reserving space for the Delete button) was constraining the chip picker width. This wasn't obvious from reading CSS alone.

**Pattern to replicate:** For any CSS/layout work:
1. Create `test-<component>.html` — loads real `styles.css`, hardcodes representative content covering edge cases
2. Create `test-<component>.py` — Playwright script that screenshots the mock page
3. Iterate: edit CSS → screenshot → verify → repeat
4. Only show the user the final verified result
5. For SSE-dependent apps, use `wait_until="domcontentloaded"` (not `networkidle`)

**Action item:** Consider creating a reusable UI testing skill that codifies this pattern. Could be invoked automatically whenever CSS changes are part of an implementation plan. Key elements:
- Standalone mock page generation from component HTML structure
- Playwright screenshot comparison (before/after)
- Edge case coverage checklist (long text, empty state, overflow, mobile widths)
- Integration with the existing code review loop

**Priority:** High — this pattern should become standard practice, not a one-off discovery.

### Retrospective agents flooded user with approval prompts (what went wrong)

**What happened:** During the post-deployment retrospective, two research agents (`artifact-analyzer` and `mitigation-researcher`) were dispatched in parallel. Each ran ~50 tool calls (grep, glob, read, git log, web search). Every single call required Patrick's manual approval in the VS Code extension UI, producing a wall of "Allow?" prompts that he had to click through.

**Impact:** Patrick was forced to approve ~100 tool calls in a row. Described as "THIS SUCKS ASS" — justified frustration. The retro skill that's supposed to improve process instead created the worst UX of the entire session.

**Root cause:** The Claude Code VS Code extension's permission model requires approval for each tool call from subagents. The retrospective skill dispatches read-heavy research agents without warning the user or configuring permissions to auto-approve read-only operations. Running agents in foreground compounds the problem since every call blocks on approval.

**Action item:** Two mitigations:
1. Configure `.claude/settings.local.json` to auto-approve read-only tools (Glob, Grep, Read, Bash with git log/status/diff) so research agents don't spam the approval queue
2. The retrospective skill should run research agents in background (`run_in_background: true`) so the user isn't blocked

**Priority:** Critical — this directly undermines trust in the tooling.

### Retro skill dismissed existing retro work as "no log maintained" (what went wrong)

**What happened:** At the start of the retrospective, Claude said "No retrospective log was maintained during development (that's itself a retro item — we should have been logging as we went)." This was wrong — `docs/retro-items.md` had been actively populated during this very session with 5 detailed items covering worktree config, Red Line snapping, stop marker prominence, blind CSS iteration, and the Playwright mock page pattern.

**Impact:** Dismissed real work that was done. Patronizing to tell the user they should have been logging retro items when they were, in fact, logged at the user's request.

**Root cause:** The retrospective skill template looks for `.claude/retrospective-log.md` (a specific file path). When that file didn't exist, Claude concluded no retro logging happened — without checking whether the project has its own retro file in a different location. The project uses `docs/retro-items.md`.

**Action item:**
1. Add to CLAUDE.md and memory: "Retrospective items are logged in `docs/retro-items.md`, not `.claude/retrospective-log.md`"
2. The retro skill should search for existing retro files before claiming none exist (check `docs/retro*`, `RETRO*`, `.claude/retro*`)

**Priority:** High — making false claims about what the user did/didn't do erodes trust.
