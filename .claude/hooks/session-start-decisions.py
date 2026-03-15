#!/usr/bin/env python3
"""
SessionStart hook: remind Claude to read docs/decisions.md before proposing solutions.
"""
import json
import sys

output = {
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": (
            "<EXTREMELY_IMPORTANT>"
            "MANDATORY SESSION START ACTION: Before proposing any technical solution, "
            "architectural change, or implementation approach in this session, you MUST "
            "read docs/decisions.md. This file records rejected approaches that must "
            "never be re-proposed, and in-force decisions that must be respected. "
            "Failure to read it before proposing solutions is a process violation. "
            "Read it now if you have not already."
            "</EXTREMELY_IMPORTANT>"
        )
    }
}
print(json.dumps(output))
sys.exit(0)
