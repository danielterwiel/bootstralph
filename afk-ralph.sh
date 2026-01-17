#!/bin/bash
#
# afk-ralph.sh - Run Ralph Loop in AFK (unattended) mode
#
# This is a convenience wrapper around ralph.sh for running the Ralph loop
# autonomously. It will:
# 1. Check .agents/tasks/ for incomplete PRDs
# 2. Let you select one if multiple exist
# 3. Run the loop for the specified number of iterations
#
# Usage:
#   ./afk-ralph.sh <iterations>              # Run with specified iterations
#   ./afk-ralph.sh <iterations> --prd <file> # Run specific PRD
#
# For backward compatibility, this also supports the legacy prd.json in root

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_TASKS_DIR=".agents/tasks"
DEFAULT_ITERATIONS=10

# Check for iterations argument
iterations="${1:-$DEFAULT_ITERATIONS}"
shift 2>/dev/null || true

# Check if new ralph.sh exists and use it
if [ -f "$SCRIPT_DIR/ralph.sh" ]; then
  exec "$SCRIPT_DIR/ralph.sh" afk "$iterations" "$@"
fi

# Fallback: Legacy mode using root prd.json
echo "Warning: Using legacy mode with root prd.json"
echo "Consider migrating to .agents/tasks/ directory"
echo ""

if [ ! -f "prd.json" ]; then
  echo "Error: No prd.json found in current directory"
  echo "Create a PRD with: bootstralph prd \"your feature description\""
  exit 1
fi

COMPLETION_PROMISE="<promise>COMPLETE</promise>"

for ((i=1; i<=iterations; i++)); do
  echo ""
  echo "=== Iteration $i/$iterations ==="
  echo ""

  result=$(docker sandbox run claude --permission-mode acceptEdits -p "@prd.json @progress.txt \
  1. Find the highest-priority task and implement it. \
  2. Run your tests and type checks. \
  3. Update the PRD with what was done. \
  4. Append your progress to progress.txt. \
  5. Commit your changes. \
  ONLY WORK ON A SINGLE TASK. \
  If the PRD is complete, output $COMPLETION_PROMISE.")

  echo "$result"

  if [[ "$result" == *"$COMPLETION_PROMISE"* ]]; then
    echo ""
    echo "PRD complete after $i iterations."
    exit 0
  fi
done

echo ""
echo "Max iterations ($iterations) reached without completion."
