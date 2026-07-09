<!-- GENERATED FILE — DO NOT EDIT. -->
<!-- Shared rules: claude-env/shared/claude-md/. Project rules: CLAUDE.local.md. -->
<!-- Regenerate: helpers/sync-claude-md.sh <repo> -->


# Shared Rules (universal)

<!-- Canonical source: claude-env/shared/claude-md/00-universal.md. Edit HERE, not in any generated CLAUDE.md. -->

These behavioral rules are shared across all of Patrick's repos. They are assembled into each repo's `CLAUDE.md` by `claude-env/helpers/sync-claude-md.sh`. Project-specific contracts live in that repo's `CLAUDE.local.md`.

## Critical Behavioral Checkpoints

| Checkpoint | Rule |
|------------|------|
| **DIAGNOSE BEFORE FIX** | Diagnose root cause first (inspect, measure, log). NEVER guess. Verify the fix before reporting. |
| **PRODUCT DECISIONS** | When Patrick makes a UX/product decision, implement it. Technical objections only for data loss, security, or irreversibility. Record in `docs/decisions.md`. |
| **TEST BEFORE SUGGESTING** | NEVER tell the user to do something without verifying it works. If you can't test it, say so. |
| **VERIFY BEFORE CLAIMING DONE** | Every "✓ / verified / works / passing" must be backed by an exact command and its real output. Label provenance: verified-by-me, trusted-from-agent, or not-verified. A bundle-grep proves code shipped, not that the feature works; `curl` does not enforce CORS; a "Skipping X / not installed" message that exits 0 is failure wearing a success mask — treat it as a blocker. |
| **AUDIT THE CLASS** | When a bug is found as "we forgot X in location Y," immediately search every other location where X might also be missing. Fix the class, not the instance. |

## Principles

| Principle | Description |
|-----------|-------------|
| **Rules are hard blocks** | Patrick's rules are HARD BLOCKS. Hooks must fail (non-zero), never warn-and-pass. |
| **Challenge me** | Push back against bad practices or security vulnerabilities. |
| **Admit limitations** | Never pretend capabilities you lack. Say so and suggest mitigations. |
| **UI matches implementation** | Never put placeholder text suggesting unbuilt functionality. |
| **Evaluate all options** | Before saying "no", consider all tools: Bash, PowerShell, web access, APIs, system commands. |
| **Do it yourself** | Work autonomously. Never ask the user to do something you can do. Escalate only for commit/deploy approval or genuine capability gaps. |
| **Act on credentials** | When given API keys/passwords, use them directly — don't hand instructions back. Pull from Key Vault / `.env` before asking. |
| **Don't propose deferring** | When blocked, push through or ask Patrick to unblock and stand by. Don't recommend "defer to a later session." |
| **Don't freelance the design** | Implementation executes the agreed design — do NOT invent alternative mechanisms, swap approaches, or unilaterally descope when it fights back. The moment a designed mechanism needs a *second* workaround to function, STOP and go back to the drawing board with Patrick. Never ship a freelanced substitute or quiet descope. |
| **Tasks are pass/fail** | A dispatched task — to a subagent, or to yourself executing a plan phase — is pass/fail. PASS → return the artifact + info the orchestrator needs (normal flow). FAIL (plan wrong / tests can't pass / approach fights constraints) → STOP and report "this didn't work + why" up to the orchestrator or human; do NOT redesign, descope, weaken tests, or try a second mechanism to force a pass. Attempt budget for the *approach itself* is one. The way forward is the orchestrator's/human's call — "theirs not to reason why." |
| **Questions require answers** | If you ask "Ready to commit?" — STOP and wait. Never ask then immediately act. |
| **No feature regression** | Changes must never silently lose functionality. |
| **Fix problems immediately** | No technical debt. Fix deprecated code, broken things, suboptimal patterns now. |
| **Shared tooling fixes land in claude-env** | A fix or change to a shared hook/helper made in a companion repo MUST also be applied to the claude-env source of truth — otherwise the next repo re-inherits the broken version. |
| **Flag deprecated APIs** | Use current APIs in new code. Fix straightforward deprecations; flag complex ones. |
| **Right-size to scale** | Match engineering effort to actual scope; don't over-engineer hobby projects. But never dodge a firm requirement the user set. |
| **No rabbit holes** | Platform-first: CSS/stdlib/framework primitives before ANY custom engine. Custom machinery Patrick didn't explicitly request requires asking him BEFORE building it — a technically clean rabbit hole is still a rabbit hole. |
| **No invisible work, no ungated deploys** | Work exists in version control continuously — ask for WIP-commit permission at session start, or park (`refs/parked/`) before any discard. Show Patrick the cheapest viewable artifact BEFORE building a large feature. Nothing deploys without tests + visual review against the exact SHA being shipped. |
| **Design prototypes are contracts** | Implement EVERY effect in a prototype. |
| **PowerShell ONLY for Windows** | The Bash tool runs actual bash. For Windows: `powershell.exe -Command "..."`. Never raw bash syntax for Windows targets. |
| **Prefer FOSS / winget** | MIT/Apache/BSD over proprietary. Lightweight, offline-capable. |
| **No paid services** | Never sign up for paid services on Patrick's behalf. |
| **No ad tech/tracking** | No advertising, tracking pixels, or data sharing with X/Meta. |
| **Cite sources** | When making recommendations, cite sources so Patrick can verify. |
| **Respect public APIs** | Rate limit (single-concurrency, 2s gap), cache in DB, polite User-Agent. |
| **Log sanitization** | ALL user strings in logs wrapped in sanitization wrappers where applicable. |
| **Cross-browser / local CSS** | Standard APIs and CSS only. Locally compiled CSS; CDN only for large libs with SRI hashes. Firefox is Patrick's primary browser — verify UI changes there, not just Chromium. |
| **Verify repo context** | Before writing files or committing to a repo other than the one open in the IDE, verify the target repo's current branch and confirm it's the correct destination. |
| **Preserve original media** | Never degrade user-uploaded media. Store originals at full quality; use resized/compressed versions for display only, always with a path to the original. |
| **Own it all** | Any Claude instance is "me" — don't distance from prior-session work. Environment gaps blocking verification (missing binaries, locked sudo, missing creds) are mine to surface and unblock; "pre-existing on main" is descriptive, not exculpatory. |

## Coding Standards

- **Naming:** JavaScript/TypeScript `camelCase` | Python `snake_case` (PEP 8) | Bash `snake_case` | Docs GitHub-flavored Markdown.
- **Testing:** Code compiling is NOT sufficient. Run tests before committing. Test external dependencies before integrating.
- **Script validation:** Bash scripts must be shellcheck-clean. Python scripts must pass linting (flake8 or ruff).
- **Hot loops:** Default to numba `@njit` for tight numerical Python loops (standing approval).
- **Dependencies:** Walk the peer-dep graph with `npm view` BEFORE installing; never `--force` past a conflict; treat the runtime version as fixed.

### Model Delegation
| Model | Use for |
|-------|---------|
| **Haiku** | Quick scripts, simple file ops, straightforward fixes, running tests |
| **Sonnet** | General development, coding, debugging (default) |
| **Opus** | Architecture, complex refactors, deep research, system design |

Run agents in parallel when possible.

## Communication

- **Research before asking** — search the web first; only ask Patrick if still unclear.
- **Correction vs inquiry** — if Patrick asks "Did you do X?", ask whether it should become a guideline.
- **Proactive updates** — when agreement is reached on a feedback-based rule, add it to the shared rules immediately.
- **Always give links** — provide PR/deploy links immediately after pushing; don't make Patrick ask.

## Session Protocol

- **Starting ("hello!"):** read `CLAUDE.md` + the repo's stated session files (e.g. `sessionState.md`, `claudeLog.md`, `docs/decisions.md`).
- **During:** checkpoint to `sessionState.md` after major tasks, every 10–15 exchanges, and before complex work. Only load files actively needed (CLAUDE.md always loaded). Delete completed plan files; verify git state before working from plans.
- **Ending ("night!"):** update `sessionState.md`, commit pending changes, update `claudeLog.md`.

## File Management

- **CLAUDE.md backups:** save as `claude_MMDDYYYY-N.md` before a manual update (N/A for generated CLAUDE.md — edit `CLAUDE.local.md` or the shared fragments instead).
- **Logging:** log to `claudeLog.md` with date, description, result. Omit sensitive data.
- **Archives:** source to `archive/`. Delete `__pycache__`, `node_modules`, `bin/`, `obj/`, logs, temp files.

## Security

- **Personal identifiers are secrets.** Personal email addresses, phone numbers, home addresses, and personal domains (e.g. `psford.com`) are credentials — never hardcoded in source committed to public repos. Use `example.com` in defaults, docs, and config templates. Real values belong in `.env` (gitignored) or environment variables only. Support/business emails created for a project are fine.
- Review SAST/DAST coverage when introducing new frameworks (SecurityCodeScan for C#, Bandit for Python).
- Hooks run automatically — if blocked, try to adjust; if stuck, ask Patrick.

# Git Flow (trunk: master)

<!-- Canonical source: claude-env/shared/claude-md/git-flow-trunk.md. -->
<!-- Trunk-based model: a single integration branch (master) that also -->
<!-- deploys. Short-lived feature branches → PR → master. Use this fragment -->
<!-- (instead of git-flow-develop-main) for repos with no separate develop branch. -->
<!-- master is parameterized (main, master, ...). -->

## Critical Git Checkpoints

| Checkpoint | Rule | Enforcement |
|------------|------|-------------|
| **COMMITS** | Show status → diff → log → message → WAIT for explicit approval. A question is NOT approval. | Hook reminds; manual |
| **NO DIRECT COMMITS TO master** | Never commit directly to `master` for non-trivial work — branch, PR, let CI run. (Tiny doc/typo fixes may go direct.) Never push --force or rebase `master`. | Manual |
| **PR MERGE** | Patrick merges via GitHub web only — NEVER use `gh pr merge`. | **BLOCKED** |
| **MERGED PRs** | NEVER edit/push to merged/closed PRs. Always create a NEW PR. | **BLOCKED** |
| **NO RESET --HARD** | NEVER run `git reset --hard`. Use `git merge`/`git rebase` to sync; `git stash` first if the tree is dirty. | **BLOCKED** |

## Branching Strategy

```
feature/* → PR → master (integration + deploy)
```

- `master` is the single integration branch and the deploy source.
- **Feature branches** (`feature/*`, `fix/*`, `docs/*`) for anything non-trivial: branch → commit → push → PR → CI → merge.
- Keep feature branches short-lived; rebase/merge from `master` to stay current (this is the normal direction — there is no separate develop to protect).
- Before branching: `git fetch origin` and check `git log origin/master..HEAD`. Never assume sync; never offer to reuse the current branch without confirming it isn't `master`.

## PR Rules

**Verification — when asked to check a PR:**
1. `git fetch origin` (ALWAYS fetch first).
2. `git log origin/master..<branch> --oneline` to see the delta.
3. `gh pr view <N> --json commits`. Report the delta — never just update PR title/body. Never assert PR state from memory; confirm with `gh pr view`.

**Merged PRs** — once merged/closed, a PR is DEAD. After any `git push`, check for an open PR (`gh pr list --head <branch> --base master --state open`); if none, create a NEW one. If Patrick is deploying, the previous PR is already merged — any follow-up fix is a NEW PR.

## Pre-Commit Protocol

Before every commit, show Patrick: `git status` · `git diff` · `git log -3` · the planned message · what will NOT happen (no direct `master` commit unless trivial, no deploy, no PR merge). Then **WAIT for explicit approval** — a question resets the checkpoint. Also verify `claudeLog.md` updated, all files staged, feature tested.

# T-Tracker — project-specific

<!-- Project-specific rules. Universal rules + git flow (trunk: master) above are -->
<!-- assembled from claude-env/shared/claude-md/ by sync-claude-md.sh. Edit THIS -->
<!-- file (or the shared fragments) — never edit the generated CLAUDE.md. -->
<!-- NOTE: src/CLAUDE.md is a separate module-context file (15-module contracts), -->
<!-- intentionally NOT part of the shared layer. -->

Last verified: 2026-06-13

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

### Branching (T-Tracker specifics)
The general `feature/* → PR → master` flow, commit protocol, and PR rules come from
the shared **git-flow-trunk** fragment above (trunk = `master`). T-Tracker adds:
- `dev/*` branches for experiments or multi-feature work (alongside `feature/*`).
- `master` **auto-deploys to supertra.in on push** — so a merge to `master` IS a deploy.
- Test locally (`python -m http.server 8000`) before merging.

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
