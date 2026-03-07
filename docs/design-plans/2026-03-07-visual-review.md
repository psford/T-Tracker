# Visual Review Skill Design

## Summary

A Claude Code plugin skill that catches UI issues (overflow, empty space, contrast violations, theme inconsistencies) before CSS changes reach the user. Uses Playwright screenshots + programmatic checks + Claude vision evaluation. Triggered by a PostToolUse hook on CSS/HTML edits. Goal: get the UI 75-85% right automatically so the human only handles final polish. Lives in the `patricks-workflow` plugin, works across projects via a `.visual-review/config.json` file.

## Definition of Done

A Claude Code plugin skill in `patricks-workflow` that automatically evaluates UI quality when CSS/HTML files are edited. Triggered by a PostToolUse hook, it generates standalone mock HTML pages loading the real stylesheet, screenshots them with Playwright at mobile (390x844) and desktop (1400x900) viewports, runs programmatic checks (overflow detection, contrast validation), and feeds screenshots to Claude's vision for aesthetic evaluation (empty space, jarring elements, theme consistency). It outputs structured pass/fail feedback before CSS changes are presented to the user. A project-specific config file customizes theme colors, viewports, and component selectors so the skill works across projects.

## Acceptance Criteria

### visual-review.AC1 — Hook Detection
- `visual-review.AC1.1`: PostToolUse hook fires when `*.css` or `*.html` files are edited via the Edit or Write tools
- `visual-review.AC1.2`: Hook injects `additionalContext` reminding Claude to invoke the visual-review skill
- `visual-review.AC1.3`: Hook does NOT fire for non-UI files (`.js`, `.md`, `.json` except config)
- `visual-review.AC1.4`: Hook is lightweight (<1s) — it only injects a reminder, no heavy work

### visual-review.AC2 — Mock Page Management
- `visual-review.AC2.1`: Skill checks for existing mock pages in `.visual-review/mocks/` before creating new ones
- `visual-review.AC2.2`: If no mock exists for the edited component, skill guides Claude to create one using the mock template
- `visual-review.AC2.3`: Mock pages load the project's real stylesheet (from `config.json` → `stylesheet` field)
- `visual-review.AC2.4`: Mock pages include edge cases: long text, short text, empty state, overflow-prone content
- `visual-review.AC2.5`: Mock pages use `position: static !important` override for fixed/absolute-positioned panels

### visual-review.AC3 — Screenshot Capture
- `visual-review.AC3.1`: Playwright captures screenshots at mobile (390x844) and desktop (1400x900) viewports
- `visual-review.AC3.2`: Screenshots saved to a temp directory (not committed to repo)
- `visual-review.AC3.3`: Uses `wait_until="domcontentloaded"` (not `networkidle`) to avoid SSE/fetch timeouts
- `visual-review.AC3.4`: Screenshots are full-page (captures overflow if present)

### visual-review.AC4 — Programmatic Checks
- `visual-review.AC4.1`: Overflow detection via injected JS (`scrollWidth > clientWidth` or `scrollHeight > clientHeight` on all elements)
- `visual-review.AC4.2`: Reports which specific elements overflow and by how many pixels
- `visual-review.AC4.3`: Color contrast check for text elements against their backgrounds (WCAG AA minimum 4.5:1 for normal text)
- `visual-review.AC4.4`: Programmatic results returned as structured data (element selector, issue type, measurement)

### visual-review.AC5 — AI Vision Evaluation
- `visual-review.AC5.1`: Claude reads each screenshot via the Read tool
- `visual-review.AC5.2`: Evaluation uses a structured rubric: overflow (y/n), empty space (y/n), contrast issues (y/n), theme consistency (y/n), alignment (y/n)
- `visual-review.AC5.3`: Each rubric item includes a brief explanation when flagged
- `visual-review.AC5.4`: Free-form "other observations" field for novel issues
- `visual-review.AC5.5`: Overall pass/fail determination with confidence level

### visual-review.AC6 — Project Configuration
- `visual-review.AC6.1`: Config lives at `.visual-review/config.json` in the project root
- `visual-review.AC6.2`: Config specifies: theme colors (background, text, accent), viewports, stylesheet path, server command
- `visual-review.AC6.3`: Skill works without config (sensible defaults: dark theme assumed, standard viewports)
- `visual-review.AC6.4`: Config is optional — skill degrades gracefully without it

### visual-review.AC7 — Iteration Loop
- `visual-review.AC7.1`: On fail, Claude edits CSS → re-screenshots → re-evaluates without user involvement
- `visual-review.AC7.2`: On pass, Claude proceeds to show the user the final result
- `visual-review.AC7.3`: Maximum 3 iterations before escalating to user ("I've tried 3 times, here's what I see")

### Failure Cases
- `visual-review.FC1`: Playwright not installed → skill reports "Playwright not available, skipping visual review" and continues (does not block)
- `visual-review.FC2`: HTTP server can't start (port in use) → try alternate port, report if still blocked
- `visual-review.FC3`: No mock page exists and component structure is ambiguous → ask user which component to mock
- `visual-review.FC4`: Config.json has invalid values → use defaults, warn about invalid config

## Architecture

### Component Overview

```
patricks-workflow/
├── hooks/
│   ├── hooks.json                    # Updated: add PostToolUse matcher
│   └── visual_review_trigger.py      # Hook: detect CSS/HTML edits → inject reminder
└── skills/
    └── visual-review/
        ├── SKILL.md                  # Skill definition (Claude reads this)
        ├── rubric.md                 # Structured evaluation rubric
        └── mock-template.html        # Template for generating mock pages
```

Per-project (created by user or Claude on first use):
```
.visual-review/
├── config.json                       # Project-specific settings
└── mocks/
    ├── panel-layout.html             # Pre-built mock for notification panel
    └── stop-popup.html               # Pre-built mock for stop popups
```

### Data Flow

```
Edit styles.css (or *.html)
    ↓
PostToolUse hook fires (visual_review_trigger.py)
    ↓
additionalContext: "CSS/HTML edited — invoke visual-review skill before presenting changes"
    ↓
Claude reads SKILL.md, follows the workflow:
    ↓
1. Check .visual-review/mocks/ for existing mock
   ├── Found → reuse it
   └── Not found → create from mock-template.html + edge cases
    ↓
2. Start HTTP server (python -m http.server <port>)
    ↓
3. Playwright screenshots at mobile + desktop viewports
    ↓
4. Programmatic checks (JS injected via Playwright):
   ├── Overflow detection (scrollWidth/Height vs clientWidth/Height)
   └── Contrast validation (computed styles → ratio calculation)
    ↓
5. Claude vision reads screenshots + rubric.md:
   ├── Structured checklist (overflow, space, contrast, theme, alignment)
   └── Free-form observations
    ↓
6. Output structured report:
   ├── PASS → proceed, show user final result
   └── FAIL → iterate (edit CSS → re-screenshot → re-evaluate, max 3x)
       └── Still failing → show user what's wrong, ask for guidance
```

### Hook Design

**File:** `visual_review_trigger.py`

The hook is a PostToolUse handler on Edit and Write tools. It checks if the edited file matches `*.css` or `*.html` patterns. If so, it returns `additionalContext` reminding Claude to invoke the skill.

```python
# Pseudo-logic
if tool_name in ("Edit", "Write"):
    file_path = tool_input.get("file_path", "")
    if file_path.endswith((".css", ".html")):
        return additionalContext: "UI file edited. Invoke visual-review skill."
```

The hook does NOT:
- Run Playwright (too slow for a hook)
- Block the edit (permission decision: "allow")
- Fire on `.js`, `.md`, or other non-UI files

### Skill Workflow (SKILL.md)

The skill document instructs Claude to:

1. **Check for config** — Read `.visual-review/config.json` if it exists
2. **Find or create mock** — Look in `.visual-review/mocks/` for a mock matching the component. If none exists, create one using the template + project stylesheet + edge case content
3. **Serve and screenshot** — Start HTTP server, capture Playwright screenshots at configured viewports
4. **Run programmatic checks** — Inject overflow + contrast detection JS
5. **AI vision evaluation** — Read screenshots, apply rubric, output structured report
6. **Iterate or proceed** — Fix issues and re-evaluate (max 3x), or pass through

### Mock Page Template

The template provides the skeleton. Claude fills in component-specific content:

```html
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="../{stylesheet}">
    <style>
        /* Override fixed/absolute positioning for testing */
        .control-panel, .drawer, [style*="position: fixed"] {
            position: static !important;
        }
        body {
            background: {theme.background};
            color: {theme.text};
            padding: 20px;
        }
    </style>
</head>
<body>
    <h3>Test Case 1: Normal content</h3>
    <!-- Claude fills in component HTML -->

    <h3>Test Case 2: Long text / overflow-prone</h3>
    <!-- Claude fills in edge case HTML -->

    <h3>Test Case 3: Empty / minimal state</h3>
    <!-- Claude fills in empty state HTML -->
</body>
</html>
```

### Evaluation Rubric

Structured checklist that Claude applies to each screenshot:

| Check | What to look for | Severity |
|-------|-----------------|----------|
| **Overflow** | Content extending beyond container bounds, horizontal scrollbar | High |
| **Empty space** | Large gaps with no content, wasted whitespace disproportionate to content | Medium |
| **Contrast** | Text hard to read against background, especially on dark themes | High |
| **Theme consistency** | Elements that clash with the surrounding theme (bright white on dark UI) | Medium |
| **Alignment** | Elements misaligned with siblings, uneven spacing | Medium |
| **Responsive** | Mobile layout broken, elements overlapping or unreachable | High |
| **Truncation** | Important text cut off without ellipsis or scroll | Medium |

Plus free-form: "Any other visual issues?"

### Project Config Schema

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
  "serverCommand": "python -m http.server",
  "overrideSelectors": [".control-panel", ".drawer"],
  "contrastMinRatio": 4.5
}
```

All fields optional. Defaults:
- Theme: dark (#1a1a2e background assumed)
- Viewports: mobile 390x844, desktop 1400x900
- Stylesheet: auto-detected (first `*.css` in root, or `styles.css`)
- Server: `python -m http.server`
- Contrast: WCAG AA (4.5:1)

## Existing Patterns Followed

- **Mock page pattern** from notification-expiry retro: standalone HTML + real stylesheet + hardcoded edge cases
- **Playwright `domcontentloaded`** wait strategy (avoids SSE timeout)
- **`position: static !important`** override for testing fixed panels
- **Hook → reminder → skill** pattern (same as commit-gate hook: lightweight trigger, skill has the logic)
- **Structured rubric** similar to code-reviewer's issue categories (Critical/Important/Minor)
- **Max iteration limit** (3x) matching the code review "three-strike rule"

## Implementation Phases

### Phase 1: Hook + Skill Skeleton
- Create `visual_review_trigger.py` PostToolUse hook
- Create `SKILL.md` with the full workflow
- Create `rubric.md` evaluation checklist
- Create `mock-template.html` skeleton
- Update `patricks-workflow` plugin.json if needed
- Test: edit a CSS file → verify hook fires and Claude sees the reminder

### Phase 2: Screenshot Pipeline
- Implement Playwright screenshot capture in the skill workflow (Python script or inline Bash)
- HTTP server management (start, capture, stop)
- Viewport configuration from `.visual-review/config.json`
- Test: create a mock page for T-Tracker's notification panel → screenshot at both viewports

### Phase 3: Programmatic Checks
- Overflow detection JS (injected via Playwright `page.evaluate()`)
- Color contrast calculation (computed styles → WCAG ratio)
- Structured output format for programmatic results
- Test: create a mock with intentional overflow → verify detection

### Phase 4: AI Vision Evaluation + Integration
- Claude reads screenshots using Read tool
- Applies rubric from `rubric.md`
- Structured pass/fail output
- Iteration loop (fail → fix → re-evaluate, max 3x)
- Test: create a mock with contrast issues → verify AI catches them
- Create T-Tracker `.visual-review/config.json` as first real project config

## Additional Considerations

### Dependencies
- **Playwright** — must be installed (`pip install playwright && playwright install chromium`). Skill degrades gracefully if missing.
- **Python** — used for HTTP server and Playwright scripts. Already available on Patrick's system.
- No npm, no Node.js dependencies beyond what's already present.

### Performance
- Full pipeline (serve → screenshot → evaluate) takes ~5-10 seconds per viewport
- Hook itself is <1s (just injects a string)
- 3 iteration loops = ~30-60 seconds worst case before escalating to user

### Limitations (Expected)
- AI vision is non-deterministic — same screenshot may get different evaluations
- Programmatic contrast check requires computed styles (won't catch background images)
- Mock pages are approximations of the real app — complex state interactions won't be caught
- **This is a 75-85% tool.** The user handles the final polish.

### Future Enhancements (Out of Scope)
- Visual regression (before/after pixel diff using BackstopJS or VRT)
- Animation verification (keyframe testing)
- Accessibility beyond contrast (axe-core full suite)
- CI/CD integration
- Framework-specific component extraction (React, Vue)

## Glossary

| Term | Definition |
|------|-----------|
| **Mock page** | Standalone HTML file that loads the real stylesheet with hardcoded component content for visual testing |
| **PostToolUse hook** | Claude Code hook that fires after a tool completes, can inject context or modify permissions |
| **Visual rubric** | Structured checklist used by Claude's vision to evaluate screenshot quality |
| **Programmatic check** | Deterministic JS-based validation (overflow, contrast) injected via Playwright |
| **Config** | `.visual-review/config.json` — per-project settings for theme, viewports, stylesheet |
| **Iteration loop** | Edit CSS → re-screenshot → re-evaluate cycle, max 3 before escalating to user |
