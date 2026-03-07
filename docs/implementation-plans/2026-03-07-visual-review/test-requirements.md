# Visual Review — Test Requirements

This document maps each acceptance criterion and failure case from the visual-review design plan to its verification method. Because the visual-review plugin consists of Python scripts, markdown skill files, and HTML templates (not a traditional application with a test framework), verification is operational: run commands, inspect output, confirm behavior.

---

## Automated Verification

These criteria can be verified by running a command and checking the output for a deterministic pass/fail result.

| AC | Description | Test Command | Expected Output |
|---|---|---|---|
| AC1.1 | PostToolUse hook fires for `*.css` edits | `echo '{"tool_input":{"file_path":"styles.css"}}' \| python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"` | JSON containing `"additionalContext"` with visual-review reminder |
| AC1.1 | PostToolUse hook fires for `*.html` edits | `echo '{"tool_input":{"file_path":"index.html"}}' \| python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"` | JSON containing `"additionalContext"` with visual-review reminder |
| AC1.2 | Hook injects `additionalContext` reminder | Same commands as AC1.1 above | Output JSON has `hookSpecificOutput.additionalContext` field containing the string "visual-review" |
| AC1.3 | Hook does NOT fire for `.js` files | `echo '{"tool_input":{"file_path":"src/api.js"}}' \| python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"` | `{}` (empty JSON object) |
| AC1.3 | Hook does NOT fire for `.md` files | `echo '{"tool_input":{"file_path":"README.md"}}' \| python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"` | `{}` |
| AC1.3 | Hook does NOT fire for `.json` files | `echo '{"tool_input":{"file_path":"config.json"}}' \| python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"` | `{}` |
| AC1.4 | Hook is lightweight (<1s) | `time (echo '{"tool_input":{"file_path":"styles.css"}}' \| python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py")` | Real time < 1 second |
| AC1.4 | Hook does not crash on malformed input | `echo '{}' \| python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"` | `{}` (no error, exit code 0) |
| AC1.4 | Hook does not crash on empty input | `echo '' \| python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"` | `{}` (no error, exit code 0) |
| AC2.3 | Mock pages load the project's real stylesheet | `grep 'href=.*styles.css' "C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.visual-review/mocks/notification-panel.html"` | Line containing `href="../../styles.css"` (or similar relative path to real stylesheet) |
| AC2.5 | Mock pages use `position: static !important` override | `grep 'position: static' "C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.visual-review/mocks/notification-panel.html"` | Line containing `position: static !important` |
| AC3.1 | Playwright captures at mobile (390x844) and desktop (1400x900) | `python "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/capture.py" --mock-path "<mock_path>" --project-root "<project_root>"` | JSON output with `screenshots` array containing entries for `"mobile"` (390x844) and `"desktop"` (1400x900) |
| AC3.2 | Screenshots saved to temp directory | Same capture command as AC3.1 | `output_dir` in JSON output points to a temp directory (not inside the project repo) |
| AC3.3 | Uses `domcontentloaded` wait strategy | `grep 'domcontentloaded' "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/capture.py"` | Line containing `wait_until="domcontentloaded"` |
| AC3.4 | Screenshots are full-page | `grep 'full_page' "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/capture.py"` | Line containing `full_page=True` |
| AC4.1 | Overflow detection via injected JS | Create an HTML file with a 500px-wide div inside a 200px container, run capture.py against it | JSON output `overflow_issues` array contains at least one entry with `direction: "horizontal"` |
| AC4.2 | Reports specific elements and pixel amounts | Same overflow test as AC4.1 | Each overflow entry contains `selector`, `direction`, and `amount_px` fields |
| AC4.3 | Contrast check for WCAG AA (4.5:1) | Create an HTML file with dark gray text (`#333`) on dark background (`#1a1a2e`), run capture.py | JSON output `contrast_issues` array contains an entry with `ratio` below 4.5 |
| AC4.4 | Programmatic results as structured data | Same tests as AC4.1 and AC4.3 | Each issue has `selector` (string), issue type implied by array name, and numeric measurement (`amount_px` or `ratio`) |
| AC6.1 | Config lives at `.visual-review/config.json` | `python -m json.tool "C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.visual-review/config.json"` | Valid JSON output (exit code 0) |
| AC6.2 | Config specifies theme, viewports, stylesheet, server command | `python -c "import json; c=json.load(open('.visual-review/config.json')); assert 'theme' in c; assert 'viewports' in c; assert 'stylesheet' in c; print('OK')"` (run from project root) | `OK` |
| AC6.3 | Skill works without config (defaults) | Run capture.py with `--viewports` omitted and no config file present | JSON output with `success: true`, using default viewports (mobile 390x844, desktop 1400x900) |
| FC1 | Playwright not installed -- graceful skip | `python -c "import sys; sys.modules['playwright']=None" && python capture.py --mock-path /tmp/test.html --project-root /tmp` (or test on a system without Playwright) | JSON with `graceful_skip: true`, exit code 0 (not an error) |
| FC2 | Port conflict -- tries alternate ports | Occupy port 8087 with `python -m http.server 8087 &`, then run capture.py with `--port 8087` | JSON with `success: true` and `port: 8088` (or 8089), showing fallback worked |
| FC4 | Invalid config values -- uses defaults | Create a config.json with `"contrastMinRatio": "not-a-number"`, run capture.py with `--min-contrast` omitting invalid value | Script uses default 4.5 ratio; does not crash |

### Automated Overflow Test Script

To verify AC4.1 and AC4.2 deterministically, create and run this test:

```bash
TMPDIR=$(python -c "import tempfile; print(tempfile.mkdtemp(prefix='vr-overflow-'))")
cat > "$TMPDIR/overflow-test.html" << 'HTMLEOF'
<!DOCTYPE html>
<html><head><style>
.container { width: 200px; height: 100px; border: 1px solid red; overflow: hidden; }
.content { width: 500px; height: 300px; background: blue; }
</style></head>
<body><div class="container"><div class="content">Overflow content</div></div></body>
</html>
HTMLEOF

python "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/capture.py" \
  --mock-path "$TMPDIR/overflow-test.html" \
  --project-root "$TMPDIR"
```

Expected: JSON with `overflow_issues` containing at least one entry.

### Automated Contrast Test Script

To verify AC4.3 deterministically:

```bash
TMPDIR=$(python -c "import tempfile; print(tempfile.mkdtemp(prefix='vr-contrast-'))")
cat > "$TMPDIR/contrast-test.html" << 'HTMLEOF'
<!DOCTYPE html>
<html><head><style>
body { background: #1a1a2e; }
.good-contrast { color: #ffffff; }
.bad-contrast { color: #333333; }
</style></head>
<body>
<p class="good-contrast">White on dark - should pass</p>
<p class="bad-contrast">Dark gray on dark - should fail</p>
</body>
</html>
HTMLEOF

python "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/capture.py" \
  --mock-path "$TMPDIR/contrast-test.html" \
  --project-root "$TMPDIR"
```

Expected: JSON with `contrast_issues` containing `.bad-contrast` element (ratio well below 4.5). The `.good-contrast` element should NOT appear.

---

## Human Verification

These criteria require human judgment, visual inspection, or observation of Claude's runtime behavior during a live session.

| AC | Description | Verification Approach | What to Look For |
|---|---|---|---|
| AC2.1 | Skill checks for existing mocks before creating new ones | In a live Claude Code session, edit a CSS file when a mock already exists in `.visual-review/mocks/`. Observe Claude's behavior. | Claude should say it found an existing mock and reuse it, NOT create a duplicate. Check that no new mock file appears in `.visual-review/mocks/`. |
| AC2.2 | Skill guides Claude to create a mock if none exists | In a live session, edit a CSS file for a component that has no mock page. Observe Claude's behavior. | Claude should reference `mock-template.html`, create a new mock in `.visual-review/mocks/` with component-specific content, and include edge case test cases. |
| AC2.4 | Mock pages include edge cases (long text, short text, empty state, overflow-prone) | Read the notification-panel mock HTML file and inspect the test case sections. | Mock should contain at least 3 distinct test cases: normal content, long/overflow-prone text, and empty/minimal state. Each section should have realistic hardcoded content. |
| AC5.1 | Claude reads each screenshot via the Read tool | In a live session, trigger the visual-review skill and watch the tool calls. | Claude should invoke the Read tool on each screenshot PNG file path returned by capture.py. |
| AC5.2 | Evaluation uses structured rubric (overflow, empty space, contrast, theme, alignment) | In a live session, observe Claude's evaluation output after reading screenshots. | Claude's report should address each rubric category explicitly: overflow, empty space, contrast, theme consistency, alignment, responsive layout, and truncation. |
| AC5.3 | Each rubric item includes a brief explanation when flagged | In a live session, trigger visual review on a mock with intentional issues. | When an issue is flagged as FAIL, Claude should include a 1-2 sentence explanation of what it observed (not just "FAIL"). |
| AC5.4 | Free-form "other observations" field for novel issues | In a live session, observe the evaluation output. | Claude's report should include an "Other observations" section (even if empty/none). |
| AC5.5 | Overall pass/fail with confidence level | In a live session, observe the final report. | Report should end with an explicit PASS or FAIL verdict and a confidence level (High/Medium/Low). |
| AC6.4 | Config is optional -- skill degrades gracefully | In a live session, run the visual-review skill on a project that has NO `.visual-review/config.json`. | Skill should proceed using defaults (dark theme, standard viewports). No errors about missing config. |
| AC7.1 | On fail, Claude edits CSS, re-screenshots, re-evaluates without user involvement | In a live session, trigger visual review on a mock with a fixable CSS issue (e.g., obvious contrast problem). | Claude should: (1) identify the issue, (2) edit the CSS file, (3) re-run capture.py, (4) re-evaluate -- all without asking the user for input. |
| AC7.2 | On pass, Claude proceeds to show the user the final result | In a live session, trigger visual review on a clean mock (no issues). | Claude should output "Visual Review: PASS" and continue presenting the CSS changes to the user. |
| AC7.3 | Maximum 3 iterations before escalating to user | In a live session, trigger visual review on a mock with a persistent issue that Claude cannot fix (e.g., a complex layout problem). Alternatively, inspect SKILL.md for the max-iteration logic. | After 3 failed attempts, Claude should output "NEEDS HUMAN REVIEW" with remaining issues listed, and stop trying to fix automatically. |
| FC3 | No mock page and component structure is ambiguous | In a live session, edit a CSS file that affects multiple unrelated components with no existing mock. | Claude should ask the user which component to mock rather than guessing. |

### Human Verification Procedure for Iteration Loop (AC7.1-AC7.3)

This is the most complex verification. Steps:

1. Create a mock page with an intentional contrast issue (e.g., `color: #2a2a2a` on `background: #1a1a2e`)
2. In a live Claude Code session, edit the project's `styles.css` (any minor change)
3. Observe: the PostToolUse hook should fire and remind Claude to invoke visual-review
4. Watch Claude's workflow:
   - It should find/create a mock, run capture.py, detect the contrast issue
   - It should attempt to fix the CSS (e.g., lighten the text color)
   - It should re-run capture.py and re-evaluate
   - If fixed, it should report PASS
   - If still failing after 3 attempts, it should report NEEDS HUMAN REVIEW
5. Verify iteration count is tracked and capped at 3

### Human Verification Procedure for Hook Integration (AC1.1-AC1.2)

While the hook script itself is tested automatically (piping JSON through stdin), the actual Claude Code integration requires a live session:

1. Open a Claude Code session in the T-Tracker project
2. Ask Claude to make a CSS change (e.g., "change the notification panel border color")
3. After Claude uses the Edit tool on `styles.css`, watch for the `additionalContext` injection
4. Verify Claude acknowledges the reminder and invokes the visual-review skill

---

## File Existence Checks

These are prerequisite checks -- all files must exist before any verification can proceed.

| File | Check Command |
|---|---|
| Hook config | `ls "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/hooks.json"` |
| Hook script | `ls "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"` |
| Skill definition | `ls "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/SKILL.md"` |
| Evaluation rubric | `ls "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/rubric.md"` |
| Mock template | `ls "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/mock-template.html"` |
| Capture script | `ls "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/capture.py"` |
| T-Tracker config | `ls "C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.visual-review/config.json"` |
| T-Tracker mock | `ls "C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.visual-review/mocks/notification-panel.html"` |
| .gitignore entry | `grep "visual-review" "C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.gitignore"` |

---

## Summary

| Category | Count | Method |
|---|---|---|
| Automated (deterministic, scriptable) | 24 checks | Run command, compare output |
| Human (requires live session or judgment) | 14 checks | Observe Claude behavior in live session |
| File existence (prerequisites) | 9 checks | `ls` / `grep` commands |
| **Total** | **47 checks** | |

### Key Observations

1. **AC1 (Hook Detection)** is fully automatable -- the hook script is a pure stdin-to-stdout Python filter.
2. **AC2 (Mock Page Management)** is split: file content checks are automated, but the "skill guides Claude to create a mock" behavior requires a live session.
3. **AC3 (Screenshot Capture)** is fully automatable -- capture.py produces deterministic JSON output.
4. **AC4 (Programmatic Checks)** is fully automatable -- overflow and contrast detection produce structured JSON.
5. **AC5 (AI Vision Evaluation)** is entirely human-verified -- it depends on Claude reading screenshots and applying the rubric, which is non-deterministic.
6. **AC6 (Project Configuration)** is mostly automatable (file validation), with one human check for graceful degradation behavior.
7. **AC7 (Iteration Loop)** is entirely human-verified -- it depends on Claude's runtime behavior in a live session.
8. **FC1-FC4 (Failure Cases)** are mixed: FC1/FC2/FC4 can be partially automated, FC3 requires a live session.
