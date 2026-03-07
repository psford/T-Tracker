# Human Test Plan: Visual Review Skill

## Prerequisites

- Claude Code installed with `patricks-workflow` plugin at `C:\Users\patri\.claude\plugins\patricks-workflow\`
- T-Tracker project open in worktree
- `config.js` copied into worktree root
- Playwright installed: `pip install playwright && playwright install chromium`
- Local HTTP server available: `python -m http.server 8000` from project root

## Phase 1: Hook Integration (Live Session)

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Ask Claude: "Change the notification panel border color in styles.css to #0f3460" | After Edit completes, PostToolUse hook fires and Claude receives `additionalContext` message |
| 1.2 | Watch Claude's next action after the CSS edit | Claude should begin visual-review skill workflow (read config, find mock), NOT present CSS change directly |
| 1.3 | Ask Claude: "Change the overflow handling in src/vehicles.js" | Hook should NOT fire for `.js` file. Claude should NOT invoke visual-review |

## Phase 2: Mock Page Management

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Edit `styles.css` when `.visual-review/mocks/notification-panel.html` already exists | Claude should find and reuse the existing mock. No new mock file created |
| 2.2 | Delete all files from `.visual-review/mocks/`, then ask Claude to edit notification panel styles | Claude should create a new mock using the template with component-specific content and at least 3 test cases |
| 2.3 | Open `http://localhost:8000/.visual-review/mocks/notification-panel.html` in browser | Verify: (1) loads real styles from `../../styles.css`, (2) has 4 test cases (normal, long text, empty, many), (3) uses realistic MBTA data |

## Phase 3: Screenshot Capture and Programmatic Checks

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Trigger visual-review and watch tool calls | Claude runs `capture.py` and parses JSON. Output shows `success: true` with mobile (390x844) and desktop (1400x900) screenshots |
| 3.2 | Check screenshot output directory | Screenshots in system temp dir (not inside repo). Two PNGs: `visual-review-mobile.png`, `visual-review-desktop.png` |
| 3.3 | Inspect JSON for `overflow_issues` and `contrast_issues` | Expect: `contrast_issues` showing `.notification-pair__count` at 4.48 ratio; `overflow_issues` showing body vertical overflow |

## Phase 4: AI Vision Evaluation

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Watch Claude's tool calls after capture | Claude invokes Read tool on each screenshot PNG |
| 4.2 | Read Claude's evaluation output | Report addresses all 7 rubric categories: Overflow, Empty Space, Contrast, Theme Consistency, Alignment, Responsive Layout, Truncation |
| 4.3 | Check failed rubric items | Each FAIL includes 1-2 sentence explanation |
| 4.4 | Check for "Other observations" | Report includes section, even if "None" |
| 4.5 | Check overall verdict | Explicit PASS/FAIL with confidence level (High/Medium/Low) |

## Phase 5: Iteration Loop

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Trigger visual-review on mock with borderline contrast issue (4.48:1) | Claude detects issue, attempts CSS fix, re-captures, re-evaluates |
| 5.2 | Watch iteration tracking | Claude displays "Iteration 1 of 3" with fixed/remaining lists |
| 5.3 | If fix succeeds | Output "Visual Review: PASS" and continue presenting changes |
| 5.4 | Create mock with persistent unfixable issue, trigger visual-review | After 3 attempts, Claude outputs "NEEDS HUMAN REVIEW" with remaining issues and screenshot paths |

## Phase 6: Configuration Graceful Degradation

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Rename `config.json` to `config.json.bak`, trigger visual-review | Claude proceeds with defaults (dark theme, standard viewports, 4.5 contrast). No errors |
| 6.2 | Restore config | Subsequent runs pick up config values again |

## Phase 7: Failure Cases

| Step | Action | Expected |
|------|--------|----------|
| 7.1 | (FC3) Edit a broad CSS property (e.g., body font-size) when no matching mock exists | Claude asks which component to mock rather than guessing |

## End-to-End: Full Visual Review Cycle

1. Open fresh Claude Code session in T-Tracker worktree
2. Ask: "Increase the font size of `.notification-pair__info` to 16px in styles.css"
3. Verify: hook fires → mock found → capture.py runs → screenshots captured → programmatic checks parsed → screenshots read via Read tool → rubric evaluation produced → iteration if needed → final report
4. Total cycle completes without user intervention (except final CSS change approval)

## End-to-End: New Component Mock Creation

1. Delete all files from `.visual-review/mocks/`
2. Ask: "Change the stop popup border radius to 8px in styles.css"
3. Verify: Claude checks mocks/ → finds nothing → references template → creates new mock with correct stylesheet, overrides, 3+ test cases, realistic HTML → capture and evaluation proceed

## Traceability

| Criterion | Automated | Manual Step |
|-----------|-----------|-------------|
| AC1.1-AC1.4 | Hook tests (PASS) | Phase 1 |
| AC2.1 | -- | Phase 2, 2.1 |
| AC2.2 | -- | Phase 2, 2.2 |
| AC2.3-AC2.5 | grep tests (PASS) | Phase 2, 2.3 |
| AC3.1-AC3.4 | capture.py tests (PASS) | Phase 3 |
| AC4.1-AC4.4 | Overflow/contrast tests (PASS) | Phase 3, 3.3 |
| AC5.1-AC5.5 | -- | Phase 4 |
| AC6.1-AC6.3 | JSON/default tests (PASS) | -- |
| AC6.4 | -- | Phase 6 |
| AC7.1-AC7.3 | -- | Phase 5 |
| FC1-FC2 | Code/port tests (PASS) | -- |
| FC3 | -- | Phase 7 |
| FC4 | Default arg test (PASS) | -- |
