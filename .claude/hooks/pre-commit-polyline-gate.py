#!/usr/bin/env python3
"""
Claude Code pre-commit hook: blocks commits touching polyline/map code
unless .playwright-ui-verified has been written recently.
"""
import subprocess
import sys
import os
import time
from pathlib import Path

GUARDED_FILES = {
    'src/map.js',
    'src/polyline-merge.js',
    'src/polyline.js',
    'src/vehicle-math.js',
    'data/mbta-static.json',
    'scripts/fetch-mbta-data.mjs',
}

MAX_SENTINEL_AGE_SECONDS = 30 * 60  # 30 minutes

def get_staged_files():
    try:
        result = subprocess.run(
            ['git', 'diff', '--cached', '--name-only'],
            capture_output=True, text=True, check=True
        )
        return set(result.stdout.strip().splitlines())
    except subprocess.CalledProcessError:
        return set()

def find_project_root():
    cwd = Path.cwd()
    for parent in [cwd] + list(cwd.parents):
        if (parent / '.git').exists():
            return parent
    return cwd

def check_sentinel(project_root):
    sentinel_path = project_root / '.playwright-ui-verified'
    if not sentinel_path.exists():
        return False, (
            ".playwright-ui-verified does not exist.\n"
            "Run visual regression tests before committing polyline/map changes:\n"
            "  node tests/visual-regression.js\n"
            "If this is a first-time baseline capture:\n"
            "  node tests/visual-regression.js --update-baselines"
        )
    mtime = sentinel_path.stat().st_mtime
    age_seconds = time.time() - mtime
    if age_seconds > MAX_SENTINEL_AGE_SECONDS:
        age_minutes = int(age_seconds / 60)
        return False, (
            f".playwright-ui-verified is {age_minutes} minutes old (limit: {MAX_SENTINEL_AGE_SECONDS // 60} minutes).\n"
            "Re-run visual regression tests to confirm the current code state:\n"
            "  node tests/visual-regression.js"
        )
    return True, f".playwright-ui-verified is recent ({int(age_seconds)}s old)."

def main():
    project_root = find_project_root()
    staged = get_staged_files()
    triggered_by = staged & GUARDED_FILES
    if not triggered_by:
        sys.exit(0)

    print(f"[polyline-gate] Guarded files staged: {', '.join(sorted(triggered_by))}")
    ok, message = check_sentinel(project_root)
    if ok:
        print(f"[polyline-gate] PASS — {message}")
        sys.exit(0)
    else:
        print("[polyline-gate] BLOCKED — Visual verification required.", file=sys.stderr)
        print("", file=sys.stderr)
        print(message, file=sys.stderr)
        print("", file=sys.stderr)
        print("Guarded files in this commit:", file=sys.stderr)
        for f in sorted(triggered_by):
            print(f"  - {f}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
