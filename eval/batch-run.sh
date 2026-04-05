#!/usr/bin/env bash
#
# Batch eval runner — run a scenario N times and collect stats.
#
# Usage:
#   ./eval/batch-run.sh skill-activation 5
#   ./eval/batch-run.sh skill-activation-control 5 --judge
#   ./eval/batch-run.sh skill-quality 5 --judge
#

set -euo pipefail

SCENARIO="${1:?Usage: batch-run.sh <scenario> <n> [extra-flags]}"
N="${2:?Usage: batch-run.sh <scenario> <n> [extra-flags]}"
shift 2
EXTRA_FLAGS=("$@")

RESULTS_DIR="eval-results/${SCENARIO}"
mkdir -p "$RESULTS_DIR"

PASS=0
FAIL=0
TOTAL_COST=0
TOTAL_DURATION=0

echo "═══════════════════════════════════════════════════════════"
echo "  Batch run: ${SCENARIO} × ${N}"
echo "═══════════════════════════════════════════════════════════"

for i in $(seq 1 "$N"); do
  echo ""
  echo "── Run $i/$N ──────────────────────────────────────────────"

  # Clean stale projects
  rm -rf eval-projects/"${SCENARIO}"-*

  OUTPUT=$(npm run eval -- --scenario="$SCENARIO" --json "${EXTRA_FLAGS[@]}" 2>&1) || true

  # Extract result from JSON
  PASSED=$(echo "$OUTPUT" | grep -o '"passed"' | head -1 || echo "")

  if echo "$OUTPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
r = data['results'][0]
print(f\"pass={'true' if r['passed'] else 'false'}\")
print(f\"cost={r['costUsd']:.4f}\")
print(f\"duration={r['durationMs']}\")
print(f\"turns={r['turns']}\")
for a in r.get('assertions', []):
    mark = '✓' if a['passed'] else '✗'
    print(f'  {mark} {a[\"name\"]}')
" > /tmp/batch-result.txt 2>/dev/null; then
    source /tmp/batch-result.txt 2>/dev/null || true
    cat /tmp/batch-result.txt

    if [[ "${pass:-false}" == "true" ]]; then
      ((PASS++)) || true
    else
      ((FAIL++)) || true
    fi

    TOTAL_COST=$(python3 -c "print(${TOTAL_COST} + ${cost:-0})")
    TOTAL_DURATION=$(python3 -c "print(${TOTAL_DURATION} + ${duration:-0})")
  else
    echo "  ✗ Failed to parse output"
    ((FAIL++)) || true
    echo "$OUTPUT" > "${RESULTS_DIR}/run-${i}-error.txt"
  fi

  # Save raw output
  echo "$OUTPUT" > "${RESULTS_DIR}/run-${i}.json"
done

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Summary: ${SCENARIO} × ${N}"
echo "═══════════════════════════════════════════════════════════"
echo "  Pass rate: ${PASS}/${N} ($(python3 -c "print(f'{${PASS}/${N}*100:.0f}%')"))"
echo "  Total cost: \$${TOTAL_COST}"
echo "  Avg duration: $(python3 -c "print(f'{${TOTAL_DURATION}/${N}/1000:.0f}s')")"
echo "  Results: ${RESULTS_DIR}/"
echo "═══════════════════════════════════════════════════════════"
