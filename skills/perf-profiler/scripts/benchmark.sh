#!/usr/bin/env bash
# Run and compare benchmarks
set -euo pipefail

COMMAND="" RUNS=5 LABEL="" COMPARE_A="" COMPARE_B="" RESULTS_DIR="/tmp/bench-results"

mkdir -p "$RESULTS_DIR"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --command) COMMAND="$2"; shift 2;;
    --runs) RUNS="$2"; shift 2;;
    --label) LABEL="$2"; shift 2;;
    --compare) COMPARE_A="$2"; COMPARE_B="${3:-}"; shift 3 2>/dev/null || shift $#;;
    *) echo "Unknown: $1"; exit 1;;
  esac
done

if [[ -n "$COMPARE_A" && -n "$COMPARE_B" ]]; then
  # Compare mode
  FILE_A="$RESULTS_DIR/${COMPARE_A}.csv"
  FILE_B="$RESULTS_DIR/${COMPARE_B}.csv"
  [[ ! -f "$FILE_A" ]] && { echo "No results for: $COMPARE_A"; exit 1; }
  [[ ! -f "$FILE_B" ]] && { echo "No results for: $COMPARE_B"; exit 1; }

  echo "## Benchmark Comparison: ${COMPARE_A} vs ${COMPARE_B}"
  echo ""

  calc_stats() {
    local file="$1"
    awk -F',' '
    NR>1 {sum+=$1; sumsq+=$1*$1; n++; if(!min||$1<min)min=$1; if($1>max)max=$1}
    END {
      avg=sum/n; variance=(sumsq/n)-(avg*avg); stddev=sqrt(variance)
      printf "%.4f %.4f %.4f %.4f %d\n", avg, min, max, stddev, n
    }' "$file"
  }

  stats_a=$(calc_stats "$FILE_A")
  stats_b=$(calc_stats "$FILE_B")

  avg_a=$(echo "$stats_a" | awk '{print $1}')
  avg_b=$(echo "$stats_b" | awk '{print $1}')

  echo "| Metric | ${COMPARE_A} | ${COMPARE_B} |"
  echo "|--------|$(printf '%*s' ${#COMPARE_A} '' | tr ' ' '-')--|$(printf '%*s' ${#COMPARE_B} '' | tr ' ' '-')--|"
  echo "| Avg (s) | $(echo "$stats_a" | awk '{printf "%.4f", $1}') | $(echo "$stats_b" | awk '{printf "%.4f", $1}') |"
  echo "| Min (s) | $(echo "$stats_a" | awk '{printf "%.4f", $2}') | $(echo "$stats_b" | awk '{printf "%.4f", $2}') |"
  echo "| Max (s) | $(echo "$stats_a" | awk '{printf "%.4f", $3}') | $(echo "$stats_b" | awk '{printf "%.4f", $3}') |"
  echo "| StdDev | $(echo "$stats_a" | awk '{printf "%.4f", $4}') | $(echo "$stats_b" | awk '{printf "%.4f", $4}') |"
  echo "| Runs | $(echo "$stats_a" | awk '{print $5}') | $(echo "$stats_b" | awk '{print $5}') |"
  echo ""

  speedup=$(echo "$avg_a $avg_b" | awk '{if($2>0) printf "%.1f", (($1-$2)/$1)*100; else print "N/A"}')
  echo "**Change:** ${speedup}% $(echo "$avg_a $avg_b" | awk '{if($2<$1) print "faster ✅"; else if($2>$1) print "slower ❌"; else print "same"}')"
  exit 0
fi

[[ -z "$COMMAND" ]] && { echo "Usage: $0 --command <cmd> --runs <n> --label <name>"; echo "       $0 --compare <label-a> <label-b>"; exit 1; }
[[ -z "$LABEL" ]] && { echo "--label required"; exit 1; }

OUTFILE="$RESULTS_DIR/${LABEL}.csv"
echo "time_seconds" > "$OUTFILE"

echo "## Benchmark: ${LABEL}"
echo "**Command:** \`${COMMAND}\`"
echo "**Runs:** ${RUNS}"
echo ""

times=()
for i in $(seq 1 "$RUNS"); do
  start=$(date +%s%N)
  eval "$COMMAND" > /dev/null 2>&1 || true
  end=$(date +%s%N)
  elapsed=$(echo "scale=6; ($end - $start) / 1000000000" | bc)
  times+=("$elapsed")
  echo "$elapsed" >> "$OUTFILE"
  printf "  Run %d: %ss\n" "$i" "$elapsed"
done

avg=$(printf '%s\n' "${times[@]}" | awk '{sum+=$1} END {printf "%.4f", sum/NR}')
echo ""
echo "**Average:** ${avg}s"
echo "**Results saved to:** ${OUTFILE}"
