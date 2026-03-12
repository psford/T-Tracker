# Retrospective Items

Items to address in future development cycles.

---

## 2026-03-12 — Claude incorrectly dismissed valid UI bug as "expected behavior"

**Feature:** stop-marker-merging (PR #12)

During manual testing, Patrick flagged that split parallel polylines for divided-road routes look wrong — "it's a single line to riders." Claude responded that this was expected behavior and not the concern of the stop marker merging feature, discouraging further investigation.

Patrick was right. The split polylines are a real visual problem, and Claude should have acknowledged the concern and investigated rather than defending the existing behavior as intentional. The correct response was to understand whether the design plan covered polyline consolidation, and if not, to treat it as a new issue worth tracking.

**Root cause:** Claude conflated "this is how it currently works" with "this is how it should work," and used it to shut down a valid observation.

**Lesson:** When Patrick flags something that "looks dumb," that is a UI bug report. Investigate first, defend later (if ever).
