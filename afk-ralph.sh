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
#   ./afk-ralph.sh <iterations>                # Run with specified iterations
#   ./afk-ralph.sh <iterations> --prd <file>   # Run specific PRD
#   ./afk-ralph.sh <iterations> --pair-vibe    # Run with Pair Vibe Mode
#
# Pair Vibe Mode (concurrent review with two models):
#   --pair-vibe           Enable Pair Vibe Mode with defaults
#   --no-pair-vibe        Disable Pair Vibe Mode (single model)
#   --executor <provider> Set executor (anthropic or openai)
#   --reviewer <provider> Set reviewer (anthropic or openai)
#
# Pair Vibe Mode Defaults for AFK:
#   - Executor: Claude (more capable for complex implementation)
#   - Reviewer: OpenAI (faster for search synthesis)
#
# For backward compatibility, this also supports the legacy prd.json in root

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_TASKS_DIR=".agents/tasks"
DEFAULT_ITERATIONS=10

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_color() {
  local color=$1
  shift
  echo -e "${color}$*${NC}"
}

# Check for iterations argument
iterations="${1:-$DEFAULT_ITERATIONS}"
shift 2>/dev/null || true

# Pair Vibe Mode configuration
PAIR_VIBE_MODE=""
PAIR_VIBE_EXECUTOR=""
PAIR_VIBE_REVIEWER=""

# Remaining args to pass through
PASSTHROUGH_ARGS=()

# Parse arguments for Pair Vibe Mode
while [[ $# -gt 0 ]]; do
  case $1 in
    --pair-vibe)
      PAIR_VIBE_MODE="enabled"
      shift
      ;;
    --no-pair-vibe)
      PAIR_VIBE_MODE="disabled"
      shift
      ;;
    --executor)
      case $2 in
        anthropic|claude)
          PAIR_VIBE_EXECUTOR="anthropic"
          ;;
        openai|gpt)
          PAIR_VIBE_EXECUTOR="openai"
          ;;
        *)
          print_color "$RED" "Invalid executor: $2 (use 'anthropic' or 'openai')"
          exit 1
          ;;
      esac
      shift 2
      ;;
    --reviewer)
      case $2 in
        anthropic|claude)
          PAIR_VIBE_REVIEWER="anthropic"
          ;;
        openai|gpt)
          PAIR_VIBE_REVIEWER="openai"
          ;;
        *)
          print_color "$RED" "Invalid reviewer: $2 (use 'anthropic' or 'openai')"
          exit 1
          ;;
      esac
      shift 2
      ;;
    *)
      PASSTHROUGH_ARGS+=("$1")
      shift
      ;;
  esac
done

# Detect if Pair Vibe Mode is available (both API keys present)
can_enable_pair_vibe() {
  [ -n "$OPENAI_API_KEY" ] && [ -n "$ANTHROPIC_API_KEY" ]
}

# Apply Pair Vibe Mode defaults for AFK mode
apply_pair_vibe_defaults() {
  # AFK defaults: Claude as Executor (more capable), OpenAI as Reviewer (faster)
  if [ -z "$PAIR_VIBE_EXECUTOR" ]; then
    PAIR_VIBE_EXECUTOR="anthropic"
  fi
  if [ -z "$PAIR_VIBE_REVIEWER" ]; then
    # Set reviewer to opposite of executor
    if [ "$PAIR_VIBE_EXECUTOR" = "anthropic" ]; then
      PAIR_VIBE_REVIEWER="openai"
    else
      PAIR_VIBE_REVIEWER="anthropic"
    fi
  fi

  # Validate executor and reviewer are different
  if [ "$PAIR_VIBE_EXECUTOR" = "$PAIR_VIBE_REVIEWER" ]; then
    print_color "$RED" "Error: Executor and Reviewer must be different providers"
    exit 1
  fi
}

# Build Pair Vibe Mode flags for ralph.sh
build_pair_vibe_flags() {
  local flags=()

  if [ "$PAIR_VIBE_MODE" = "enabled" ]; then
    flags+=("--pair-vibe")
    flags+=("--executor" "$PAIR_VIBE_EXECUTOR")
    flags+=("--reviewer" "$PAIR_VIBE_REVIEWER")
  elif [ "$PAIR_VIBE_MODE" = "disabled" ]; then
    flags+=("--no-pair-vibe")
  fi

  echo "${flags[@]}"
}

# Check if new ralph.sh exists and use it
if [ -f "$SCRIPT_DIR/ralph.sh" ]; then
  # Handle Pair Vibe Mode configuration
  if [ "$PAIR_VIBE_MODE" = "enabled" ]; then
    if ! can_enable_pair_vibe; then
      print_color "$RED" "Error: Pair Vibe Mode requires both ANTHROPIC_API_KEY and OPENAI_API_KEY"
      exit 1
    fi
    apply_pair_vibe_defaults

    print_color "$BLUE" "AFK Ralph with Pair Vibe Mode"
    print_color "$GREEN" "  Executor: $PAIR_VIBE_EXECUTOR (implements tasks)"
    print_color "$GREEN" "  Reviewer: $PAIR_VIBE_REVIEWER (validates ahead)"
    echo ""
  fi

  # Build and execute ralph.sh command
  pair_vibe_flags=$(build_pair_vibe_flags)
  exec "$SCRIPT_DIR/ralph.sh" afk "$iterations" $pair_vibe_flags "${PASSTHROUGH_ARGS[@]}"
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
  3. Update the PRD with what was done (set passes: true). \
  4. Append your progress to progress.txt. \
  5. Commit your changes. \
  ONLY WORK ON A SINGLE TASK. \
  If the PRD is complete, output $COMPLETION_PROMISE.")

  echo "$result"

  # Check for completion
  if [[ "$result" == *"$COMPLETION_PROMISE"* ]]; then
    echo ""
    echo "PRD COMPLETE after $i iterations!"
    exit 0
  fi
done

echo ""
echo "Max iterations ($iterations) reached without completion"
