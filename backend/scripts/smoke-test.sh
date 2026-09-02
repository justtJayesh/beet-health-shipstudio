#!/usr/bin/env bash
# Standalone curl smoke test against a running `npm start` backend.
# Exercises log -> edit -> delete end to end without any voice/LLM layer,
# per Next Steps #1's "test this layer standalone" requirement.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local condition="$2"
  if [ "$condition" = "true" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "== resolve a known food =="
RESOLVE_OUT=$(curl -sf "$BASE_URL/api/foods/resolve?q=roti")
echo "$RESOLVE_OUT"
check "outcome is match" "$([ "$(echo "$RESOLVE_OUT" | grep -c '"outcome":"match"')" = "1" ] && echo true || echo false)"

echo "== resolve a food outside the closed set =="
NOMATCH_OUT=$(curl -sf "$BASE_URL/api/foods/resolve?q=pizza")
echo "$NOMATCH_OUT"
check "outcome is no_match" "$([ "$(echo "$NOMATCH_OUT" | grep -c '"outcome":"no_match"')" = "1" ] && echo true || echo false)"

echo "== log a meal =="
LOG_OUT=$(curl -sf -X POST "$BASE_URL/api/meals" \
  -H "Content-Type: application/json" \
  -d '{"food":"roti","quantity":2,"unit":"piece","mealType":"breakfast"}')
echo "$LOG_OUT"
MEAL_ID=$(echo "$LOG_OUT" | sed -n 's/.*"_id":"\([a-f0-9]*\)".*/\1/p')
check "got a meal id back" "$([ -n "$MEAL_ID" ] && echo true || echo false)"

echo "== edit the meal's quantity =="
EDIT_OUT=$(curl -sf -X PATCH "$BASE_URL/api/meals/$MEAL_ID" \
  -H "Content-Type: application/json" \
  -d '{"quantity":3}')
echo "$EDIT_OUT"
check "quantity updated to 3" "$([ "$(echo "$EDIT_OUT" | grep -c '"quantity":3')" = "1" ] && echo true || echo false)"

echo "== list meals =="
LIST_OUT=$(curl -sf "$BASE_URL/api/meals")
check "listed meal includes our id" "$([ "$(echo "$LIST_OUT" | grep -c "$MEAL_ID")" -ge "1" ] && echo true || echo false)"

echo "== delete the meal =="
curl -sf -X DELETE "$BASE_URL/api/meals/$MEAL_ID" > /dev/null
LIST_AFTER=$(curl -sf "$BASE_URL/api/meals")
check "meal no longer listed after delete" "$([ "$(echo "$LIST_AFTER" | grep -c "$MEAL_ID")" = "0" ] && echo true || echo false)"

echo ""
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
