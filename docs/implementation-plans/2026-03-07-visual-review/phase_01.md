# Visual Review Implementation Plan — Phase 1: Hook + Skill Skeleton

**Goal:** Create a Claude Code plugin skill that automatically evaluates UI quality when CSS/HTML files are edited, using Playwright screenshots and Claude vision.

**Architecture:** PostToolUse hook detects CSS/HTML edits → injects reminder → Claude invokes visual-review skill → skill manages mock pages, captures screenshots, runs programmatic checks, evaluates with AI vision, iterates on failures.

**Tech Stack:** Python (hooks, Playwright), Markdown (skill docs), HTML (mock templates), Claude Code plugin system

**Scope:** 4 phases from original design (phases 1-4)

**Codebase verified:** 2026-03-07

---

## File Locations

**Plugin root:** `C:/Users/patri/.claude/plugins/patricks-workflow`

All plugin files (hooks, skills) are created in this directory. It is NOT a git repository — no git commit steps for plugin files.

**Project root (worktree):** `C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review`

Project-specific files (.visual-review/) go here and ARE git-tracked.

---

## Acceptance Criteria Coverage

This phase implements:

### visual-review.AC1 — Hook Detection
- **visual-review.AC1.1 Success:** PostToolUse hook fires when `*.css` or `*.html` files are edited via the Edit or Write tools
- **visual-review.AC1.2 Success:** Hook injects `additionalContext` reminding Claude to invoke the visual-review skill
- **visual-review.AC1.3 Success:** Hook does NOT fire for non-UI files (`.js`, `.md`, `.json` except config)
- **visual-review.AC1.4 Success:** Hook is lightweight (<1s) — it only injects a reminder, no heavy work

**Verifies:** None (infrastructure phase — verified operationally)

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->
### Task 1: Create hooks directory and hooks.json

**Files:**
- Create: `C:/Users/patri/.claude/plugins/patricks-workflow/hooks/hooks.json`

**Implementation:**

Create the `hooks/` directory in the plugin root and add `hooks.json`. This file registers the PostToolUse hook that fires after Edit and Write tool completions.

**Hook discovery verified:** The `psford-hook-security-guards` plugin at `C:/Users/patri/.claude/plugins/psford-hook-security-guards/hooks/hooks.json` uses this exact same structure and is actively loaded by Claude Code in the current session. Claude Code discovers hooks via `hooks/hooks.json` at the plugin root by convention.

The matcher regex `^(Edit|Write)$` ensures the hook fires only for these two tools. The hook script itself checks the file extension to determine if additionalContext should be injected.

```json
{
    "description": "Visual review trigger: detects CSS/HTML edits and reminds Claude to invoke visual-review skill",
    "hooks": {
        "PostToolUse": [
            {
                "matcher": "^(Edit|Write)$",
                "hooks": [
                    {
                        "type": "command",
                        "command": "python \"${CLAUDE_PLUGIN_ROOT}/hooks/visual_review_trigger.py\"",
                        "timeout": 5
                    }
                ]
            }
        ]
    }
}
```

**Verification:**

Run: `cat "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/hooks.json" | python -m json.tool`
Expected: Valid JSON output with PostToolUse hook definition

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Create visual_review_trigger.py hook script

**Files:**
- Create: `C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py`

**Implementation:**

This PostToolUse hook reads tool input from stdin, checks if the edited file is a CSS or HTML file, and returns `additionalContext` if so. It follows the exact pattern from existing hooks in `psford-hook-security-guards/hooks/post_push_pr_check.py`:

- Reads JSON from `sys.stdin` via `json.load()`
- Accesses `hook_input.get("tool_input", {}).get("file_path", "")`
- Returns `hookSpecificOutput` with `additionalContext` for CSS/HTML files
- Returns empty dict `{}` for non-matching files (no context injected)
- Wraps everything in try-except to never crash Claude Code
- Returns exit code 0 always (PostToolUse cannot block)

```python
#!/usr/bin/env python3
"""
PostToolUse hook: detect CSS/HTML edits and remind Claude to invoke visual-review skill.

Fires after Edit or Write tool completes. Checks if the edited file is a
CSS or HTML file. If so, injects additionalContext reminding Claude to
invoke the visual-review skill before presenting changes to the user.

Does NOT fire for .js, .md, .json, or other non-UI files.
Runs in <100ms — no heavy work, just string matching.
"""

import json
import sys


def main():
    try:
        hook_input = json.load(sys.stdin)
    except Exception:
        # Can't parse input — return empty (no context injected)
        print(json.dumps({}))
        return 0

    tool_input = hook_input.get("tool_input", {})
    file_path = tool_input.get("file_path", "")

    # Case-insensitive check for CSS or HTML file extensions
    if file_path.lower().endswith((".css", ".html")):
        output = {
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": (
                    "UI file edited. Invoke the visual-review skill "
                    "before presenting changes to the user."
                )
            }
        }
        print(json.dumps(output))
    else:
        # Non-UI file — no action needed
        print(json.dumps({}))

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # Never crash Claude Code — return empty on any error
        try:
            print(json.dumps({}))
        except Exception:
            pass
        sys.exit(0)
```

**Verification:**

Test with CSS file (should return additionalContext):
```bash
echo '{"tool_input":{"file_path":"styles.css"}}' | python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"
```
Expected: JSON containing `"additionalContext"` with visual-review reminder

Test with HTML file (should return additionalContext):
```bash
echo '{"tool_input":{"file_path":"index.html"}}' | python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"
```
Expected: JSON containing `"additionalContext"` with visual-review reminder

Test with JS file (should return empty):
```bash
echo '{"tool_input":{"file_path":"src/api.js"}}' | python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"
```
Expected: `{}`

Test with MD file (should return empty):
```bash
echo '{"tool_input":{"file_path":"README.md"}}' | python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"
```
Expected: `{}`

Test with empty/malformed input (should not crash):
```bash
echo '{}' | python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"
```
Expected: `{}`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-5) -->

<!-- START_TASK_3 -->
### Task 3: Create visual-review SKILL.md (skeleton)

**Files:**
- Create: `C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/SKILL.md`

**Implementation:**

This is the core skill document that Claude reads when the visual-review skill is invoked. Phase 1 creates the skeleton covering: config reading, mock page management, and the overall workflow structure. Screenshot capture, programmatic checks, and AI vision evaluation sections are added in Phases 2-4 via Edit operations.

The skill must follow the exact format of the existing retrospective skill at `C:/Users/patri/.claude/plugins/patricks-workflow/skills/retrospective/SKILL.md` — YAML frontmatter with `name`, `description`, `user-invocable` fields.

```markdown
---
name: visual-review
description: Automatically evaluate UI quality when CSS/HTML files are edited. Triggered by PostToolUse hook on CSS/HTML edits. Uses Playwright screenshots, programmatic checks, and Claude vision evaluation.
user-invocable: true
---

# Visual Review

## Overview

Catch UI issues (overflow, empty space, contrast violations, theme inconsistencies) before CSS changes reach the user. Uses Playwright screenshots + programmatic checks + Claude vision evaluation. Goal: get the UI 75-85% right automatically so the human only handles final polish.

## When This Skill Activates

This skill is triggered automatically when the PostToolUse hook detects a CSS or HTML file edit. You will see an `additionalContext` message saying:

> "UI file edited. Invoke the visual-review skill before presenting changes to the user."

When you see this message, follow the workflow below.

## Workflow

### Step 1: Read Project Config

Check if `.visual-review/config.json` exists in the project root.

**If it exists**, read it and extract:
- `theme.background` — page background color (default: `#1a1a2e`)
- `theme.text` — text color (default: `#e0e0e0`)
- `theme.accent` — accent color (default: `#4a9eff`)
- `viewports.mobile` — mobile viewport (default: `{"width": 390, "height": 844}`)
- `viewports.desktop` — desktop viewport (default: `{"width": 1400, "height": 900}`)
- `stylesheet` — path to main CSS file (default: auto-detect first `*.css` in root)
- `overrideSelectors` — CSS selectors for elements to force `position: static` (default: `[".control-panel", ".drawer"]`)
- `contrastMinRatio` — minimum contrast ratio for WCAG AA (default: `4.5`)

**If it does not exist**, use the defaults listed above. Do not create the config file — it is optional.

### Step 2: Find or Create Mock Page

Check `.visual-review/mocks/` for an existing mock page matching the edited component.

**Finding the right mock:**
- If the edited file is the main stylesheet (e.g., `styles.css`), look for any mock that tests the affected component
- If the edited file is an HTML file, check if a mock already exists for that specific page/component
- Mock files are named descriptively: `panel-layout.html`, `stop-popup.html`, `notification-drawer.html`

**If a mock exists**, use it. Read it to verify it still loads the correct stylesheet.

**If no mock exists**, create one using the mock template at:
`${SKILL_DIR}/mock-template.html`

When creating a mock:
1. Copy the template
2. Replace the stylesheet path with the project's actual stylesheet
3. Fill in component-specific HTML for each test case section:
   - Normal content (typical usage)
   - Long text / overflow-prone content (stress test)
   - Empty / minimal state (edge case)
4. Add `position: static !important` overrides for any fixed/absolute-positioned elements
5. Save to `.visual-review/mocks/<component-name>.html`

### Step 3: Capture Screenshots

*This step requires the capture script. If the script is not found, report "Visual review capture script not available — skipping screenshot capture" and continue to Step 6.*

Run the capture script to screenshot the mock page at configured viewports.

### Step 4: Run Programmatic Checks

*This step is part of the capture script. If the script is not found, skip.*

The capture script runs JavaScript checks inside the page:
- Overflow detection: finds elements where `scrollWidth > clientWidth` or `scrollHeight > clientHeight`
- Contrast validation: checks text elements against their backgrounds for WCAG AA compliance

### Step 5: AI Vision Evaluation

*This step requires screenshots from Step 3. If no screenshots available, skip.*

Read each screenshot using the Read tool. Apply the evaluation rubric from:
`${SKILL_DIR}/rubric.md`

Evaluate each screenshot against the rubric checklist. Output a structured report.

### Step 6: Report Results

Output a structured report:

**If all checks pass (or checks were skipped):**
```
## Visual Review: PASS
- Mock page: [path]
- Screenshots: [captured/skipped]
- Programmatic checks: [passed/skipped]
- Vision evaluation: [passed/skipped]
```

**If any checks fail:**
```
## Visual Review: FAIL
- Issue 1: [description]
- Issue 2: [description]

Attempting fix (iteration 1 of 3)...
```

### Step 7: Iteration Loop (on failure)

If the visual review fails:
1. Edit the CSS to fix the identified issues
2. Re-run Steps 3-5 (re-screenshot, re-check, re-evaluate)
3. Maximum 3 iterations before escalating to the user

If still failing after 3 iterations:
```
## Visual Review: NEEDS HUMAN REVIEW
I've attempted 3 fixes but these issues persist:
- [remaining issues]
Please review the screenshots and provide guidance.
```

## Failure Handling

| Scenario | Action |
|----------|--------|
| Playwright not installed | Report "Playwright not available, skipping visual review" and continue |
| HTTP server can't start (port in use) | Try ports 8080, 8081, 8082. Report if all blocked. |
| No mock page and component structure is ambiguous | Ask user which component to mock |
| Config has invalid values | Use defaults, warn about invalid config |
| Capture script not found | Report and continue without screenshots |
```

**Verification:**

Run: `cat "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/SKILL.md" | head -5`
Expected: YAML frontmatter starting with `---` and `name: visual-review`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Create rubric.md evaluation checklist

**Files:**
- Create: `C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/rubric.md`

**Implementation:**

This structured checklist is used by Claude's vision to evaluate screenshot quality. Each rubric item has a severity level and clear description of what to look for.

```markdown
# Visual Review Evaluation Rubric

Apply this checklist to each screenshot. For each item, mark PASS or FAIL with a brief explanation when flagged.

## Checklist

### 1. Overflow (Severity: High)
**What to look for:** Content extending beyond container bounds, horizontal scrollbar visible, text or elements cut off at container edges.
- PASS: All content fits within its containers
- FAIL: [Describe which elements overflow and direction]

### 2. Empty Space (Severity: Medium)
**What to look for:** Large gaps with no content, wasted whitespace disproportionate to content, elements clustered in one area leaving other areas barren.
- PASS: Whitespace is proportional and intentional
- FAIL: [Describe where excessive empty space appears]

### 3. Contrast (Severity: High)
**What to look for:** Text hard to read against background, especially on dark themes. Light gray text on slightly lighter gray background. Important UI elements blending into background.
- PASS: All text is clearly readable
- FAIL: [Describe which text/elements have poor contrast]

### 4. Theme Consistency (Severity: Medium)
**What to look for:** Elements that clash with the surrounding theme. Bright white elements on a dark UI. Default browser-styled elements (unstyled buttons, default blue links). Colors that don't match the project's palette.
- PASS: All elements visually consistent with theme
- FAIL: [Describe which elements clash]

### 5. Alignment (Severity: Medium)
**What to look for:** Elements misaligned with siblings, uneven spacing between repeated elements, text not aligned with adjacent text, inconsistent padding/margins.
- PASS: Elements properly aligned with consistent spacing
- FAIL: [Describe misalignment]

### 6. Responsive Layout (Severity: High)
**What to look for:** Mobile layout broken, elements overlapping, unreachable content, touch targets too small (< 44x44px), content wider than viewport.
- PASS: Layout adapts properly to viewport
- FAIL: [Describe responsive issues]

### 7. Truncation (Severity: Medium)
**What to look for:** Important text cut off without ellipsis or scroll indicator, labels truncated so meaning is lost, tooltips or popups partially hidden.
- PASS: No unintended truncation, or truncation has proper indicators
- FAIL: [Describe what is truncated]

## Other Observations

Note any visual issues not covered by the checklist above:
- [Free-form observations]

## Overall Assessment

**Result:** PASS / FAIL
**Confidence:** High / Medium / Low
**Summary:** [One sentence explaining the overall visual quality]
```

**Verification:**

Run: `cat "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/rubric.md" | head -3`
Expected: `# Visual Review Evaluation Rubric`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->
### Task 5: Create mock-template.html

**Files:**
- Create: `C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/mock-template.html`

**Implementation:**

This HTML template is the skeleton Claude uses when creating mock pages for visual testing. Claude fills in component-specific content for each test case section. The template loads the project's real stylesheet and applies position overrides for fixed/absolute elements.

Placeholder values (wrapped in `{curly braces}`) are replaced by Claude when creating a mock:
- `{stylesheet}` — relative path to the project's CSS file (e.g., `../../styles.css`)
- `{theme_background}` — theme background color from config or default
- `{theme_text}` — theme text color from config or default
- `{override_selectors}` — CSS selectors for position override (from config or defaults)

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Visual Review Mock — {component_name}</title>
    <link rel="stylesheet" href="{stylesheet}">
    <style>
        /* Override fixed/absolute positioning for testing.
           These elements are tested in-flow, not pinned to viewport. */
        {override_selectors} {
            position: static !important;
        }

        body {
            background: {theme_background};
            color: {theme_text};
            padding: 20px;
            margin: 0;
        }

        /* Visual separator between test cases */
        .test-case {
            border: 1px dashed rgba(255, 255, 255, 0.2);
            padding: 16px;
            margin-bottom: 24px;
            border-radius: 4px;
        }
        .test-case h3 {
            margin-top: 0;
            opacity: 0.6;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
    </style>
</head>
<body>
    <div class="test-case">
        <h3>Test Case 1: Normal Content</h3>
        <!-- Fill in: typical component usage with realistic data -->
    </div>

    <div class="test-case">
        <h3>Test Case 2: Long Text / Overflow-Prone</h3>
        <!-- Fill in: stress test with very long text, many items, edge-case data -->
    </div>

    <div class="test-case">
        <h3>Test Case 3: Empty / Minimal State</h3>
        <!-- Fill in: component with no data, single item, or minimal content -->
    </div>

    <div class="test-case">
        <h3>Test Case 4: Mixed Content</h3>
        <!-- Fill in: combination of different content types the component handles -->
    </div>
</body>
</html>
```

**Verification:**

Run: `cat "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/mock-template.html" | head -5`
Expected: `<!DOCTYPE html>` followed by `<html lang="en">`

<!-- END_TASK_5 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_TASK_6 -->
### Task 6: Verify hook fires on CSS/HTML edit

**Verification Steps:**

This is an operational verification. After creating all files in Tasks 1-5:

1. Verify all files exist:
```bash
ls -la "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/"
ls -la "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/"
```
Expected: `hooks.json`, `visual_review_trigger.py` in hooks/; `SKILL.md`, `rubric.md`, `mock-template.html` in skills/visual-review/

2. Test the hook script directly with all extension types:
```bash
echo '{"tool_input":{"file_path":"styles.css"}}' | python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"
echo '{"tool_input":{"file_path":"index.html"}}' | python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"
echo '{"tool_input":{"file_path":"src/api.js"}}' | python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"
echo '{"tool_input":{"file_path":"README.md"}}' | python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"
echo '{"tool_input":{"file_path":"config.json"}}' | python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"
echo '{}' | python "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/visual_review_trigger.py"
```
Expected:
- `styles.css` → JSON with `additionalContext`
- `index.html` → JSON with `additionalContext`
- `src/api.js` → `{}`
- `README.md` → `{}`
- `config.json` → `{}`
- `{}` (empty) → `{}`

3. Validate hooks.json is well-formed:
```bash
python -m json.tool "C:/Users/patri/.claude/plugins/patricks-workflow/hooks/hooks.json"
```
Expected: Pretty-printed valid JSON

<!-- END_TASK_6 -->
