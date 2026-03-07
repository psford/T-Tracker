# Visual Review Implementation Plan — Phase 2: Screenshot Pipeline

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

### visual-review.AC3 — Screenshot Capture
- **visual-review.AC3.1 Success:** Playwright captures screenshots at mobile (390x844) and desktop (1400x900) viewports
- **visual-review.AC3.2 Success:** Screenshots saved to a temp directory (not committed to repo)
- **visual-review.AC3.3 Success:** Uses `wait_until="domcontentloaded"` (not `networkidle`) to avoid SSE/fetch timeouts
- **visual-review.AC3.4 Success:** Screenshots are full-page (captures overflow if present)

### visual-review.AC2 — Mock Page Management (partial)
- **visual-review.AC2.1 Success:** Skill checks for existing mock pages in `.visual-review/mocks/` before creating new ones
- **visual-review.AC2.3 Success:** Mock pages load the project's real stylesheet (from `config.json` → `stylesheet` field)

### visual-review.FC1 — Playwright Not Installed
- **visual-review.FC1 Failure:** Playwright not installed → skill reports "Playwright not available, skipping visual review" and continues (does not block)

### visual-review.FC2 — HTTP Server Port Conflict
- **visual-review.FC2 Failure:** HTTP server can't start (port in use) → try alternate port, report if still blocked

**Verifies:** None (infrastructure phase — verified operationally)

---

<!-- START_TASK_1 -->
### Task 1: Create the screenshot capture script

**Files:**
- Create: `C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/capture.py`

**Implementation:**

This Python script is invoked by Claude (via the SKILL.md workflow) to capture screenshots of mock HTML pages at configured viewports. It starts a local HTTP server, navigates Playwright to the mock page, takes full-page screenshots, and saves them to a temp directory.

The script accepts command-line arguments:
- `--mock-path`: Absolute path to the mock HTML file
- `--project-root`: Absolute path to the project root (for HTTP server)
- `--output-dir`: Directory to save screenshots (default: system temp)
- `--viewports`: JSON string of viewport configs (default: mobile + desktop)
- `--port`: HTTP server port (default: 8087, tries 8088, 8089 on conflict)
- `--min-contrast`: Minimum WCAG contrast ratio (default: 4.5, used in Phase 3)

```python
#!/usr/bin/env python3
"""
Visual review screenshot capture script.

Starts a local HTTP server, captures Playwright screenshots of mock HTML pages
at configured viewports, and outputs results as JSON.

Usage:
    python capture.py --mock-path /path/to/mock.html --project-root /path/to/project

Requirements:
    pip install playwright
    playwright install chromium
"""

import argparse
import functools
import json
import os
import socket
import sys
import tempfile
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path


def is_port_available(port):
    """Check if a TCP port is available."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def find_available_port(start_port=8087, max_attempts=3):
    """Find an available port starting from start_port."""
    for offset in range(max_attempts):
        port = start_port + offset
        if is_port_available(port):
            return port
    return None


class QuietHandler(SimpleHTTPRequestHandler):
    """HTTP handler that suppresses request logging."""

    def log_message(self, format, *args):
        pass  # Silence request logs


def start_server(directory, port):
    """Start HTTP server in a background thread. Returns (server, thread)."""
    # Use directory= parameter instead of os.chdir() to avoid global side effects
    handler = functools.partial(QuietHandler, directory=directory)
    server = HTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


def check_playwright_available():
    """Check if Playwright Python is installed and chromium is available."""
    try:
        from playwright.sync_api import sync_playwright
        return True
    except ImportError:
        return False


def capture_screenshots(url, viewports, output_dir):
    """Capture screenshots at each viewport size. Returns list of result dicts."""
    from playwright.sync_api import sync_playwright

    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for name, viewport in viewports.items():
            context = browser.new_context(
                viewport={"width": viewport["width"], "height": viewport["height"]}
            )
            page = context.new_page()

            # Use domcontentloaded to avoid SSE/fetch timeout issues
            page.goto(url, wait_until="domcontentloaded")

            # Brief wait for CSS rendering to settle
            page.wait_for_timeout(500)

            # Full-page screenshot captures overflow
            filename = f"visual-review-{name}.png"
            filepath = os.path.join(output_dir, filename)
            page.screenshot(path=filepath, full_page=True)

            results.append({
                "viewport": name,
                "width": viewport["width"],
                "height": viewport["height"],
                "screenshot": filepath,
            })

            context.close()

        browser.close()

    return results


def main():
    parser = argparse.ArgumentParser(description="Visual review screenshot capture")
    parser.add_argument("--mock-path", required=True, help="Path to mock HTML file")
    parser.add_argument("--project-root", required=True, help="Project root directory")
    parser.add_argument("--output-dir", default=None, help="Screenshot output directory")
    parser.add_argument(
        "--viewports",
        default=None,
        help='JSON viewports config, e.g. \'{"mobile":{"width":390,"height":844}}\''
    )
    parser.add_argument("--port", type=int, default=8087, help="HTTP server port")
    parser.add_argument(
        "--min-contrast", type=float, default=4.5,
        help="Minimum WCAG contrast ratio (default: 4.5 for AA)"
    )

    args = parser.parse_args()

    # Validate mock file exists
    mock_path = Path(args.mock_path).resolve()
    if not mock_path.exists():
        print(json.dumps({
            "success": False,
            "error": f"Mock file not found: {mock_path}"
        }))
        return 1

    # Validate project root exists
    project_root = Path(args.project_root).resolve()
    if not project_root.is_dir():
        print(json.dumps({
            "success": False,
            "error": f"Project root not found: {project_root}"
        }))
        return 1

    # Check Playwright availability
    if not check_playwright_available():
        print(json.dumps({
            "success": False,
            "error": "Playwright not available. Install with: pip install playwright && playwright install chromium",
            "graceful_skip": True
        }))
        return 0  # Exit 0 — graceful degradation, not an error

    # Set up output directory
    if args.output_dir:
        output_dir = Path(args.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
    else:
        output_dir = Path(tempfile.mkdtemp(prefix="visual-review-"))

    # Parse viewports
    if args.viewports:
        viewports = json.loads(args.viewports)
    else:
        viewports = {
            "mobile": {"width": 390, "height": 844},
            "desktop": {"width": 1400, "height": 900},
        }

    # Find available port
    port = find_available_port(args.port)
    if port is None:
        print(json.dumps({
            "success": False,
            "error": f"No available port found (tried {args.port}-{args.port + 2})"
        }))
        return 1

    # Start HTTP server from project root
    server = None
    try:
        server, _ = start_server(str(project_root), port)

        # Calculate URL path from project root to mock file
        mock_relative = mock_path.relative_to(project_root)
        url = f"http://127.0.0.1:{port}/{mock_relative.as_posix()}"

        # Capture screenshots
        results = capture_screenshots(url, viewports, str(output_dir))

        print(json.dumps({
            "success": True,
            "port": port,
            "url": url,
            "output_dir": str(output_dir),
            "screenshots": results,
        }))
        return 0

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        return 1

    finally:
        if server:
            server.shutdown()


if __name__ == "__main__":
    sys.exit(main())
```

**Key design decisions:**
- Uses Python's built-in `http.server` (no external dependency beyond Playwright)
- Background thread for HTTP server (daemon=True, auto-cleanup)
- `wait_until="domcontentloaded"` avoids SSE timeouts (per project convention)
- `page.wait_for_timeout(500)` gives CSS time to render after DOM load
- `full_page=True` captures overflow beyond viewport
- Graceful degradation: returns `graceful_skip: true` when Playwright missing (exit 0, not error)
- Port conflict handling: tries 3 consecutive ports
- JSON output for structured communication with Claude

**Verification:**

First, verify Playwright is installed:
```bash
python -c "from playwright.sync_api import sync_playwright; print('Playwright available')"
```
Expected: "Playwright available"

If not installed:
```bash
pip install playwright && playwright install chromium
```

Test with a simple HTML file (all commands run in Git Bash where `/tmp/` maps to a Windows temp directory):
```bash
TMPDIR=$(python -c "import tempfile; print(tempfile.mkdtemp(prefix='vr-test-'))")
echo '<html><body><h1>Test</h1></body></html>' > "$TMPDIR/test-mock.html"
python "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/capture.py" --mock-path "$TMPDIR/test-mock.html" --project-root "$TMPDIR"
```
Expected: JSON output with `"success": true` and two screenshot paths (mobile + desktop)

Verify screenshots were created:
```bash
ls "$TMPDIR"/visual-review-* 2>/dev/null || echo "Screenshots in output_dir from JSON output"
```
Expected: `visual-review-mobile.png` and `visual-review-desktop.png` in the output directory from JSON

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Create T-Tracker mock page for notification panel

**Files:**
- Create: `C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.visual-review/mocks/notification-panel.html`

**Implementation:**

Create the `.visual-review/` directory structure and the first real mock page. This mock tests the notification panel component from T-Tracker's `styles.css`, including various states (active notifications, empty state, long text).

The mock loads T-Tracker's actual `styles.css` and includes hardcoded HTML that exercises the notification panel's CSS classes. The relative path from `.visual-review/mocks/` to the project root's `styles.css` is `../../styles.css`.

Before creating, read `styles.css` to identify the current notification panel CSS classes. The mock must use the exact CSS classes from the stylesheet.

Read `C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/styles.css` and identify all notification-related CSS classes (`.notification-*`, `.control-panel*`, etc.).

Then create the mock using those exact classes, with:
- Test Case 1: Normal notification panel with 2-3 active notifications
- Test Case 2: Long notification text that might overflow
- Test Case 3: Empty state (no notifications)
- Test Case 4: Panel with many notifications (scrolling test)

The position override forces `.control-panel` and `.notification-panel` to `position: static` so they render in-flow for screenshot testing.

**Verification:**

```bash
ls "C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.visual-review/mocks/"
```
Expected: `notification-panel.html` exists

Test that the mock renders correctly:
```bash
python "C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/capture.py" \
  --mock-path "C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.visual-review/mocks/notification-panel.html" \
  --project-root "C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review"
```
Expected: JSON with `"success": true` and two screenshot paths

Read the screenshots with the Read tool to visually verify the notification panel renders correctly.

**Suggested commit message (pending Patrick's approval):** `feat: add notification panel visual review mock`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Add .visual-review/screenshots/ to .gitignore

**Files:**
- Modify: `C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.gitignore`

**Implementation:**

The `.visual-review/config.json` and `.visual-review/mocks/` should be committed (they're project configuration). But screenshot output files should NOT be committed — they're generated artifacts.

Add this to `.gitignore` before the first mock page commit to prevent accidentally staging screenshots generated during testing:

```
# Visual review screenshots (generated, not committed)
.visual-review/screenshots/
```

Before editing, read the current `.gitignore` to find the right insertion point.

**Verification:**

```bash
grep "visual-review" "C:/Users/patri/Documents/claudeProjects/T-Tracker/.worktrees/visual-review/.gitignore"
```
Expected: Line containing `.visual-review/screenshots/`

**Suggested commit message (pending Patrick's approval):** `chore: ignore visual-review screenshots in gitignore`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Update SKILL.md with screenshot workflow details

**Files:**
- Modify: `C:/Users/patri/.claude/plugins/patricks-workflow/skills/visual-review/SKILL.md`

**Implementation:**

Update Step 3 (Capture Screenshots) in the SKILL.md to include the complete workflow for running the capture script. Replace the placeholder text with detailed instructions.

The updated Step 3 should instruct Claude to:
1. Check if capture.py exists at `${SKILL_DIR}/capture.py`
2. If not found, report "Visual review capture script not available" and skip
3. Determine the project root (use `git rev-parse --show-toplevel`)
4. Run the capture script with the mock path, project root, and viewport config
5. Parse the JSON output
6. If `graceful_skip: true`, report Playwright not available and continue
7. If `success: true`, note the screenshot paths for Step 5 (vision evaluation)
8. If `success: false`, report the error

Include the exact command template:
```bash
python "${SKILL_DIR}/capture.py" \
  --mock-path "<mock_file_path>" \
  --project-root "<project_root>" \
  --output-dir "<temp_dir>"
```

Where `${SKILL_DIR}` resolves to the directory containing the SKILL.md file.

**Verification:**

Read the updated SKILL.md and verify Step 3 contains the complete screenshot workflow instructions.

<!-- END_TASK_4 -->
