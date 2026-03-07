# Visual Review Implementation Plan — Phase 3: Programmatic Checks

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

### visual-review.AC4 — Programmatic Checks
- **visual-review.AC4.1 Success:** Overflow detection via injected JS (`scrollWidth > clientWidth` or `scrollHeight > clientHeight` on all elements)
- **visual-review.AC4.2 Success:** Reports which specific elements overflow and by how many pixels
- **visual-review.AC4.3 Success:** Color contrast check for text elements against their backgrounds (WCAG AA minimum 4.5:1 for normal text)
- **visual-review.AC4.4 Success:** Programmatic results returned as structured data (element selector, issue type, measurement)

**Verifies:** None (infrastructure phase — verified operationally with test mocks)

---

<!-- START_TASK_1 -->
### Task 1: Add overflow detection to capture.py

**Files:**
- Modify: `C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/capture.py`

**Implementation:**

Add a `run_overflow_checks(page)` function to `capture.py` that injects JavaScript to detect overflow on all elements. This runs AFTER the page has loaded and BEFORE screenshots are taken (so overflow state is captured in the screenshot).

The JavaScript iterates all elements in the DOM and checks `scrollWidth > clientWidth` and `scrollHeight > clientHeight`. For each overflowing element, it reports:
- A CSS selector to identify the element (tag name, id, class list)
- The overflow direction (horizontal, vertical, or both)
- The overflow amount in pixels (scrollWidth - clientWidth, etc.)

Add this function to capture.py:

```python
def run_overflow_checks(page):
    """Inject JS to detect elements with overflow. Returns list of overflow issues."""
    return page.evaluate("""
        () => {
            const issues = [];
            const allElements = document.querySelectorAll('*');

            for (const el of allElements) {
                const horizOverflow = el.scrollWidth - el.clientWidth;
                const vertOverflow = el.scrollHeight - el.clientHeight;

                if (horizOverflow > 1 || vertOverflow > 1) {
                    // Build a readable selector for the element
                    let selector = el.tagName.toLowerCase();
                    if (el.id) selector += '#' + el.id;
                    if (el.className && typeof el.className === 'string') {
                        selector += '.' + el.className.trim().split(/\\s+/).join('.');
                    }

                    const issue = {
                        selector: selector,
                        overflow: [],
                    };

                    if (horizOverflow > 1) {
                        issue.overflow.push({
                            direction: 'horizontal',
                            amount_px: horizOverflow,
                            scrollWidth: el.scrollWidth,
                            clientWidth: el.clientWidth,
                        });
                    }
                    if (vertOverflow > 1) {
                        issue.overflow.push({
                            direction: 'vertical',
                            amount_px: vertOverflow,
                            scrollHeight: el.scrollHeight,
                            clientHeight: el.clientHeight,
                        });
                    }

                    issues.push(issue);
                }
            }
            return issues;
        }
    """)
```

Integrate this into the `capture_screenshots` function so it runs after page load for each viewport. Add the overflow results to the per-viewport result dict under a `"overflow_issues"` key.

Update the per-viewport result dict:
```python
results.append({
    "viewport": name,
    "width": viewport["width"],
    "height": viewport["height"],
    "screenshot": filepath,
    "overflow_issues": overflow_issues,  # NEW
})
```

**Verification:**

Create a test mock with intentional overflow (all commands run in Git Bash):
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
Expected: JSON output with `"overflow_issues"` containing at least one entry for `.container` with horizontal and vertical overflow amounts.

Also test with a page that has NO overflow:
```bash
cat > "$TMPDIR/no-overflow-test.html" << 'HTMLEOF'
<!DOCTYPE html>
<html><head><style>
.container { width: 200px; padding: 10px; border: 1px solid green; }
</style></head>
<body><div class="container">Short text</div></body>
</html>
HTMLEOF

python "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/capture.py" \
  --mock-path "$TMPDIR/no-overflow-test.html" \
  --project-root "$TMPDIR"
```
Expected: JSON output with `"overflow_issues": []` (empty array)

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Add contrast validation to capture.py

**Files:**
- Modify: `C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/capture.py`

**Implementation:**

Add a `run_contrast_checks(page, min_ratio)` function that injects JavaScript to check text elements against their backgrounds for WCAG AA compliance.

The JavaScript:
1. Finds all text-containing elements (elements with `textContent` and no child elements, or elements with direct text nodes)
2. Gets computed `color` and `backgroundColor` for each
3. Walks up the DOM tree to find the first ancestor with a non-transparent background
4. Calculates the WCAG contrast ratio using the relative luminance formula
5. Flags elements below the minimum ratio

The contrast ratio formula uses relative luminance:
- `L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin`
- Where `R_lin = (R/255 <= 0.03928) ? R/255/12.92 : ((R/255 + 0.055)/1.055)^2.4`
- `ratio = (max(L1,L2) + 0.05) / (min(L1,L2) + 0.05)`
- WCAG AA requires ratio >= 4.5 for normal text

Add this function to capture.py:

```python
def run_contrast_checks(page, min_ratio=4.5):
    """Inject JS to check text contrast against backgrounds. Returns list of contrast issues."""
    return page.evaluate("""
        (minRatio) => {
            function parseRGB(color) {
                const match = color.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
                if (!match) return null;
                return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
            }

            function isTransparent(color) {
                if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return true;
                const match = color.match(/rgba\\(.*,\\s*([\\d.]+)\\)/);
                return match && parseFloat(match[1]) === 0;
            }

            function luminance(rgb) {
                const [r, g, b] = rgb.map(c => {
                    c = c / 255;
                    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
                });
                return 0.2126 * r + 0.7152 * g + 0.0722 * b;
            }

            function contrastRatio(rgb1, rgb2) {
                const l1 = luminance(rgb1);
                const l2 = luminance(rgb2);
                const lighter = Math.max(l1, l2);
                const darker = Math.min(l1, l2);
                return (lighter + 0.05) / (darker + 0.05);
            }

            function getEffectiveBg(el) {
                let current = el;
                while (current && current !== document.documentElement) {
                    const bg = window.getComputedStyle(current).backgroundColor;
                    if (!isTransparent(bg)) return parseRGB(bg);
                    current = current.parentElement;
                }
                // Default to white if no background found
                return [255, 255, 255];
            }

            const issues = [];
            // Check elements that likely contain visible text
            const textElements = document.querySelectorAll(
                'p, span, a, h1, h2, h3, h4, h5, h6, li, td, th, label, button, ' +
                'div:not(:has(*)), small, strong, em, code, pre'
            );

            for (const el of textElements) {
                const text = el.textContent.trim();
                if (!text || text.length === 0) continue;

                // Skip hidden or invisible elements
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' ||
                    style.opacity === '0' || el.offsetWidth === 0) continue;

                const fgColor = parseRGB(style.color);
                if (!fgColor) continue;

                const bgColor = getEffectiveBg(el);
                if (!bgColor) continue;

                const ratio = contrastRatio(fgColor, bgColor);

                if (ratio < minRatio) {
                    let selector = el.tagName.toLowerCase();
                    if (el.id) selector += '#' + el.id;
                    if (el.className && typeof el.className === 'string') {
                        selector += '.' + el.className.trim().split(/\\s+/).join('.');
                    }

                    issues.push({
                        selector: selector,
                        text: text.substring(0, 50),
                        foreground: `rgb(${fgColor.join(',')})`,
                        background: `rgb(${bgColor.join(',')})`,
                        ratio: Math.round(ratio * 100) / 100,
                        required: minRatio,
                    });
                }
            }
            return issues;
        }
    """, min_ratio)
```

Integrate this into `capture_screenshots` alongside the overflow checks. Add contrast results under a `"contrast_issues"` key in each viewport result.

Update the per-viewport result dict:
```python
results.append({
    "viewport": name,
    "width": viewport["width"],
    "height": viewport["height"],
    "screenshot": filepath,
    "overflow_issues": overflow_issues,
    "contrast_issues": contrast_issues,  # NEW
})
```

The `--min-contrast` argument was already added to `argparse` in Phase 2. Pass it to `run_contrast_checks`:
```python
contrast_issues = run_contrast_checks(page, min_ratio=args.min_contrast)
```

**Verification:**

Create a test mock with intentional contrast issues (all commands run in Git Bash):
```bash
TMPDIR=$(python -c "import tempfile; print(tempfile.mkdtemp(prefix='vr-contrast-'))")
cat > "$TMPDIR/contrast-test.html" << 'HTMLEOF'
<!DOCTYPE html>
<html><head><style>
body { background: #1a1a2e; }
.good-contrast { color: #ffffff; }
.bad-contrast { color: #333333; }
.borderline { color: #777777; }
</style></head>
<body>
<p class="good-contrast">White on dark - should pass</p>
<p class="bad-contrast">Dark gray on dark - should fail</p>
<p class="borderline">Mid gray on dark - may fail</p>
</body>
</html>
HTMLEOF

python "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/capture.py" \
  --mock-path "$TMPDIR/contrast-test.html" \
  --project-root "$TMPDIR"
```
Expected: JSON output with `"contrast_issues"` containing the `.bad-contrast` element (ratio well below 4.5). The `.good-contrast` element should NOT appear in issues.

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Update SKILL.md with programmatic check details

**Files:**
- Modify: `C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/SKILL.md`

**Implementation:**

Update Step 4 (Run Programmatic Checks) in the SKILL.md to describe how to interpret the structured output from capture.py's overflow and contrast checks.

The updated Step 4 should instruct Claude to:
1. Parse the `overflow_issues` array from the capture script output
2. For each overflow issue, note the element selector, direction, and pixel amount
3. Parse the `contrast_issues` array
4. For each contrast issue, note the element, colors, and ratio vs. required minimum
5. Include these results in the overall report (Step 6)
6. Flag issues by severity: overflow = High, contrast below 3:1 = High, contrast 3:1-4.5:1 = Medium

**Verification:**

Read the updated SKILL.md and verify Step 4 contains instructions for interpreting overflow and contrast check results.

<!-- END_TASK_3 -->
