#!/usr/bin/env bash
# TT-3.3. tests/notifications.test.js must pass on a Node with no global
# `navigator`. Node has one only from v21, and this machine's default is v20.
# There the suite failed ("remainingCount should decrement to 2", 3 !== 2):
# src/notifications.js reads navigator inside the vehicles:update listener,
# the read throws, and EventTarget swallows the error before the countdown
# decrements. Deleting the global before the suite runs gives every Node the
# v20 runtime, so this case is red on v20 and v22 alike until the suite brings
# its own stand-in.
#
# Same ad hoc style as claude-env's helpers/tests/*.sh: a plain script with its
# own pass/fail counters, no shared runner. Run directly:
#   bash tests/test_notifications_runtime.sh
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
pass=0
fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
no() { echo "  ✗ $1"; echo "$2" | sed 's/^/     /'; fail=$((fail+1)); }

NO_NAVIGATOR='data:text/javascript,delete globalThis.navigator'

# Control first: the runtime these cases build really has no navigator, so the
# case below cannot pass on a Node 21+ global.
nav="$(node --import "$NO_NAVIGATOR" -e 'console.log(typeof navigator)' 2>&1)"
if [ "$nav" = "undefined" ]; then
  ok "the case's runtime has no navigator global"
else
  no "the case's runtime has no navigator global" "typeof navigator printed: $nav"
fi

out="$(node --import "$NO_NAVIGATOR" tests/notifications.test.js 2>&1)"
code=$?
if [ "$code" -eq 0 ] && grep -q "All tests passed" <<<"$out"; then
  ok "the notifications suite passes on a runtime with no navigator global"
else
  no "the notifications suite passes on a runtime with no navigator global" \
     "exit $code; last lines: $(tail -4 <<<"$out")"
fi

echo ""
if [ "$fail" -eq 0 ]; then echo "ALL $pass NOTIFICATIONS-RUNTIME TESTS PASSED"; exit 0
else echo "$fail of $((pass+fail)) NOTIFICATIONS-RUNTIME TESTS FAILED"; exit 1
fi
