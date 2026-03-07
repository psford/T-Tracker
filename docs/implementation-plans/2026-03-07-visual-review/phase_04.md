# Visual Review Implementation Plan — Phase 4: AI Vision Evaluation + Integration

**Goal:** Create a Claude Code plugin skill that automatically evaluates UI quality when CSS/HTML files are edited, using Playwright screenshots and Claude vision.

**Architecture:** PostToolUse hook detects CSS/HTML edits → injects reminder → Claude invokes visual-review skill → skill manages mock pages, captures screenshots, runs programmatic checks, evaluates with AI vision, iterates on failures.

**Tech Stack:** Python (hooks, Playwright), Markdown (skill docs), HTML (mock templates), Claude Code plugin system

**Scope:** 4 phases from original design (phases 1-4)

**Codebase verified:** 2026-03-07

---

## File Locations

**Plugin root:** `C:/Users/patri/.claude/plugins/patricks-workflow`

**Project root (worktree):** `C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review`

---

## Acceptance Criteria Coverage

This phase implements:

### visual-review.AC5 — AI Vision Evaluation
- **visual-review.AC5.1 Success:** Claude reads each screenshot via the Read tool
- **visual-review.AC5.2 Success:** Evaluation uses a structured rubric: overflow (y/n), empty space (y/n), contrast issues (y/n), theme consistency (y/n), alignment (y/n)
- **visual-review.AC5.3 Success:** Each rubric item includes a brief explanation when flagged
- **visual-review.AC5.4 Success:** Free-form "other observations" field for novel issues
- **visual-review.AC5.5 Success:** Overall pass/fail determination with confidence level

### visual-review.AC6 — Project Configuration
- **visual-review.AC6.1 Success:** Config lives at `.visual-review/config.json` in the project root
- **visual-review.AC6.2 Success:** Config specifies: theme colors (background, text, accent), viewports, stylesheet path, server command
- **visual-review.AC6.3 Success:** Skill works without config (sensible defaults: dark theme assumed, standard viewports)
- **visual-review.AC6.4 Success:** Config is optional — skill degrades gracefully without it

### visual-review.AC7 — Iteration Loop
- **visual-review.AC7.1 Success:** On fail, Claude edits CSS → re-screenshots → re-evaluates without user involvement
- **visual-review.AC7.2 Success:** On pass, Claude proceeds to show the user the final result
- **visual-review.AC7.3 Success:** Maximum 3 iterations before escalating to user ("I've tried 3 times, here's what I see")

### visual-review.AC2 — Mock Page Management (remaining)
- **visual-review.AC2.2 Success:** If no mock exists for the edited component, skill guides Claude to create one using the mock template
- **visual-review.AC2.4 Success:** Mock pages include edge cases: long text, short text, empty state, overflow-prone content
- **visual-review.AC2.5 Success:** Mock pages use `position: static !important` override for fixed/absolute-positioned panels

### Failure Cases
- **visual-review.FC3 Failure:** No mock page exists and component structure is ambiguous → ask user which component to mock
- **visual-review.FC4 Failure:** Config.json has invalid values → use defaults, warn about invalid config

**Verifies:** None (infrastructure phase — verified via end-to-end operational test)

---

<!-- START_TASK_1 -->
### Task 1: Finalize SKILL.md with vision evaluation and iteration loop

**Files:**
- Modify: `C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/SKILL.md`

**Implementation:**

Update Step 5 (AI Vision Evaluation) and Step 7 (Iteration Loop) with complete instructions. This is the final update to SKILL.md that makes it a fully functional skill.

**Step 5 update — AI Vision Evaluation:**

Replace the placeholder Step 5 with detailed instructions for Claude to:

1. Read each screenshot file using the Read tool (Claude Code's Read tool handles PNG images natively)
2. For each screenshot, read `${SKILL_DIR}/rubric.md` as a reference
3. Apply the rubric checklist systematically:
   - **Overflow** (High): Does any content extend beyond its container? Cross-reference with programmatic overflow results from Step 4.
   - **Empty space** (Medium): Are there large gaps or wasted whitespace?
   - **Contrast** (High): Is any text hard to read? Cross-reference with programmatic contrast results.
   - **Theme consistency** (Medium): Do any elements clash with the surrounding theme? Look for bright white on dark UI, unstyled defaults.
   - **Alignment** (Medium): Are elements misaligned with siblings? Uneven spacing?
   - **Responsive** (High): Does the layout adapt properly between mobile and desktop screenshots?
   - **Truncation** (Medium): Is important text cut off?
4. Note any other visual issues not covered by the checklist
5. Determine overall pass/fail with confidence level (High/Medium/Low)

**Step 7 update — Iteration Loop:**

Replace the placeholder Step 7 with:

1. If visual review result is FAIL:
   - Identify the specific CSS changes needed to fix each issue
   - Edit the CSS file directly (using the Edit tool)
   - Re-run Steps 3-5 (re-capture screenshots, re-run checks, re-evaluate)
   - Track iteration count (max 3)
2. If still failing after 3 iterations:
   - Output the "NEEDS HUMAN REVIEW" report with remaining issues
   - Include screenshot paths so the user can review them
   - Do NOT attempt further fixes
3. If visual review result is PASS:
   - Output the PASS report
   - Continue with the original task (presenting changes to the user)

Include this iteration tracking template for Claude to follow:
```
Iteration [N] of 3:
- Fixed: [list of issues fixed]
- Remaining: [list of issues still present]
- Action: [Re-running visual review / Escalating to user]
```

**Verification:**

Read the completed SKILL.md and verify:
- Step 5 contains detailed vision evaluation instructions referencing rubric.md
- Step 7 contains iteration loop with max 3 attempts
- All steps are complete (no placeholder text remaining)

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Create T-Tracker .visual-review/config.json

**Files:**
- Create: `C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.visual-review/config.json`

**Implementation:**

Create the project-specific config for T-Tracker. This config captures T-Tracker's dark theme colors, viewport sizes, and the path to its stylesheet.

The colors come from T-Tracker's `styles.css` — the CSS variables and hardcoded values used in the dark theme. The override selectors target T-Tracker's fixed-position UI elements.

```json
{
    "theme": {
        "background": "#1a1a2e",
        "text": "#e0e0e0",
        "accent": "#4a9eff",
        "danger": "#ff6b6b"
    },
    "viewports": {
        "mobile": { "width": 390, "height": 844 },
        "desktop": { "width": 1400, "height": 900 }
    },
    "stylesheet": "styles.css",
    "overrideSelectors": [".control-panel", ".drawer", ".notification-drawer"],
    "contrastMinRatio": 4.5
}
```

Before creating, verify the theme colors match the current `styles.css`:
- Read `styles.css` and search for background color definitions
- Confirm `.control-panel`, `.drawer`, `.notification-drawer` are valid CSS selectors

**Verification:**

```bash
python -m json.tool "C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.visual-review/config.json"
```
Expected: Pretty-printed valid JSON with theme, viewports, stylesheet, overrideSelectors, and contrastMinRatio fields.

**Suggested commit message (pending Patrick's approval):** `feat: add visual-review project config for T-Tracker`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: End-to-end verification

**Verification Steps:**

This is the full end-to-end operational test of the visual-review skill. Run through the complete workflow manually:

1. **Verify all plugin files exist:**
```bash
ls "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/hooks.json"
ls "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"
ls "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/SKILL.md"
ls "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/rubric.md"
ls "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/mock-template.html"
ls "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/capture.py"
```
Expected: All 6 files exist

2. **Verify project files exist:**
```bash
ls "C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.visual-review/config.json"
ls "C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.visual-review/mocks/notification-panel.html"
```
Expected: Both files exist

3. **Test hook script with CSS input:**
```bash
echo '{"tool_input":{"file_path":"styles.css"}}' | python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"
```
Expected: JSON with `additionalContext` reminder

4. **Test capture script with T-Tracker mock:**
```bash
python "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/capture.py" \
  --mock-path "C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.visual-review/mocks/notification-panel.html" \
  --project-root "C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review"
```
Expected: JSON with `"success": true`, screenshot paths, overflow_issues array, contrast_issues array

5. **Visually verify screenshots:**
Use the Read tool to open each screenshot PNG and confirm:
- Mobile screenshot shows notification panel at 390px width
- Desktop screenshot shows notification panel at 1400px width
- Content is visible and rendered with T-Tracker's dark theme

6. **Read the SKILL.md and verify completeness:**
All 7 steps should have full instructions (no placeholder text).

<!-- END_TASK_3 -->
