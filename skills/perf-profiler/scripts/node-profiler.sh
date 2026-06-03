#!/usr/bin/env bash
# Profile a Node.js script for CPU and memory
set -euo pipefail

SCRIPT="" DURATION=10 OUTPUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --script) SCRIPT="$2"; shift 2;;
    --duration) DURATION="$2"; shift 2;;
    --output) OUTPUT="$2"; shift 2;;
    *) echo "Unknown: $1"; exit 1;;
  esac
done

[[ -z "$SCRIPT" ]] && { echo "Usage: $0 --script <file.js> [--duration <seconds>] [--output <file>]"; exit 1; }
[[ ! -f "$SCRIPT" ]] && { echo "File not found: $SCRIPT"; exit 1; }

echo "## Node.js Profile: $(basename "$SCRIPT")"
echo "**Duration:** ${DURATION}s"
echo ""

# Memory before
echo "### Startup Profile"
START=$(date +%s%N)
MEM_BEFORE=$(node -e "console.log(JSON.stringify(process.memoryUsage()))" 2>/dev/null)
echo "Initial memory: $MEM_BEFORE"

# Run with --prof if available, otherwise time it
echo ""
echo "### Execution"

# Time the execution
TIMEFORMAT='%R %U %S'
timing=$( { time node "$SCRIPT" > /dev/null 2>&1; } 2>&1 ) || true
real=$(echo "$timing" | awk '{print $1}')
user=$(echo "$timing" | awk '{print $2}')
sys=$(echo "$timing" | awk '{print $3}')

echo "| Metric | Value |"
echo "|--------|-------|"
echo "| Real time | ${real}s |"
echo "| User CPU | ${user}s |"
echo "| System CPU | ${sys}s |"

# Memory profile using Node
echo ""
echo "### Memory Profile"
node -e "
const { execSync } = require('child_process');
const fs = require('fs');

// Get memory usage during execution
const before = process.memoryUsage();
try {
  require('${SCRIPT}');
} catch(e) {
  // Script may not be require-able, that's ok
}
const after = process.memoryUsage();

console.log('| Metric | Before | After | Delta |');
console.log('|--------|--------|-------|-------|');
for (const key of Object.keys(before)) {
  const b = (before[key]/1024/1024).toFixed(2);
  const a = (after[key]/1024/1024).toFixed(2);
  const d = ((after[key]-before[key])/1024/1024).toFixed(2);
  console.log('| ' + key + ' | ' + b + ' MB | ' + a + ' MB | ' + d + ' MB |');
}
" 2>/dev/null || echo "(memory profiling requires script to be require-able)"

echo ""
echo "### Recommendations"
if command -v node &>/dev/null; then
  node_ver=$(node -v)
  echo "- Node version: $node_ver"
  echo "- For detailed CPU profiling: \`node --prof ${SCRIPT}\` then \`node --prof-process isolate-*.log\`"
  echo "- For heap snapshots: \`node --inspect ${SCRIPT}\` and use Chrome DevTools"
  echo "- For flame graphs: \`node --perf-basic-prof ${SCRIPT}\` with \`perf\`"
fi
