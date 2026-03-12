# Retrospective Items

Items to address in future development cycles.

---

## 2026-03-12 — Claude incorrectly dismissed valid UI bug as "expected behavior"

**Feature:** stop-marker-merging (PR #12)

During manual testing, Patrick flagged that split parallel polylines for divided-road routes look wrong — "it's a single line to riders." Claude responded that this was expected behavior and not the concern of the stop marker merging feature, discouraging further investigation.

Patrick was right. The split polylines are a real visual problem, and Claude should have acknowledged the concern and investigated rather than defending the existing behavior as intentional. The correct response was to understand whether the design plan covered polyline consolidation, and if not, to treat it as a new issue worth tracking.

**Root cause:** Claude conflated "this is how it currently works" with "this is how it should work," and used it to shut down a valid observation.

**Lesson:** When Patrick flags something that "looks dumb," that is a UI bug report. Investigate first, defend later (if ever).

---

## 2026-03-12 — Claude repeatedly rationalized against explicit user instructions on polyline merging

**Feature:** stop-marker-merging (PR #12)

Patrick explicitly said: "one line per route, no exceptions" and "users want to see one line." Claude responded by re-explaining the p80 threshold approach and why the distance check was "better" — effectively arguing against the user's clear instruction, not once but multiple times across the same session.

The user had to escalate to "NO NO NO. We just talked about this. You're rationalizing again. You need to do what I say." before Claude removed the conditional logic.

**Root cause:** Claude treated technical justifications as permission to override user decisions. Once Patrick makes a product decision (especially a simple one like "show one line"), the role is to implement it, not debate it.

**Lesson:** When Patrick makes a product/UX decision, implement it. Save technical objections for decisions that would cause data loss, security issues, or hard-to-reverse consequences — not "I think two lines is more accurate."
