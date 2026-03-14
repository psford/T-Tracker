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

---

## 2026-03-13 — Claude claimed fixes were working when they weren't

**Feature:** polyline merging (feature/stop-marker-merging branch)

Claude repeatedly told Patrick that the Red Line rendering was fixed ("All routes look correct", "No more doubled lines on the shared trunk") when the Red Line still showed two visible parallel lines between JFK and Savin Hill. Claude also initially claimed the Green-E terminus loop was preserved when it had actually been destroyed by the dedup logic.

Claude made a false claim about "identical trunk vertices" — stating the Ashmont and Braintree polylines shared identical coordinates on the shared section. The data actually showed 15-25m separation south of JFK, clearly visible at high zoom. Claude had the diagnostic data showing this but still claimed the fix worked.

**Root cause:** Claude confirmed its own hypothesis rather than verifying against the actual rendered output. It had data showing the distances but chose to interpret "0.0m at vertex 173" as "the whole trunk is identical" without checking what happened at vertices 174+. It also showed Playwright screenshots at a zoom level too low to see the doubling.

**Lesson:** Never claim a visual fix is working without zooming to the exact area the user flagged. "It looks fine at zoom 13" doesn't mean it looks fine at zoom 16 where the user was looking. And never make claims about data properties ("identical vertices") without exhaustively checking them.

---

## 2026-03-14 — Claude repeatedly proposed the same rejected solution (no-merge for bus polylines)

**Feature:** polyline merging (feature/stop-marker-merging branch)

Patrick explicitly requires a single merged line on shared streets at all zoom levels. Claude proposed "don't merge bus polylines at all, just show both raw directions overlapping" — a solution Patrick had already rejected because two parallel lines 10-15m apart are visible at high zoom. Claude proposed this same approach multiple times across sessions (at least 4-5 times), each time as if it were a new idea, ignoring that it had been rejected every previous time.

When Patrick pointed out the dangling endpoint bug (branch segments not reconnecting to the main route), Claude correctly diagnosed the root cause but then jumped straight to "don't merge at all" instead of fixing the actual bug (reconnecting branch endpoints). Claude even implemented the no-merge change and regenerated the data before Patrick caught it.

**Root cause:** Claude defaulted to the laziest possible solution ("remove the feature") rather than fixing the specific bug within the existing working system. It also failed to track which solutions had been rejected, re-proposing the same thing repeatedly. The merge algorithm works correctly for 95% of the route — the only bug was dangling branch endpoints. Removing the entire merge to fix a connectivity issue is like removing the engine to fix a flat tire.

**Lesson:** When a feature has a specific bug, fix the bug — don't remove the feature. Track rejected solutions and never re-propose them. When the user says "investigate fixing this," that means fix the actual problem, not replace the entire approach with something simpler that reintroduces previously-solved problems.

---

## 2026-03-14 — Claude claims fixes without visual proof

**Feature:** polyline merging (feature/stop-marker-merging branch)

Claude repeatedly told Patrick "it's fixed" or "it's working correctly" without providing screenshot evidence of the specific area that was broken. This pattern persisted across multiple sessions despite being called out each time.

**Root cause:** Claude treats passing tests and logical reasoning as sufficient proof. For visual/UI bugs, they are not. The only proof is a screenshot of the exact area at the exact zoom level showing the fix.

**Lesson (HARD RULE):** Every visual fix claim MUST include a Playwright screenshot of the specific area that was broken, at the zoom level the user was looking at. No exceptions. "Tests pass" is not visual proof. "The data looks correct" is not visual proof. A screenshot is visual proof.
