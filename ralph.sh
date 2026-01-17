#!/bin/bash
#
# ralph.sh - Orchestrator for Ralph Loop execution
#
# This script checks for incomplete PRDs in .agents/tasks/ and either:
# - Runs the selected PRD through the Ralph loop (afk mode)
# - Runs a single interactive iteration
# - Lists available PRDs
#
# Usage:
#   ./ralph.sh                    # Interactive selection of PRD
#   ./ralph.sh afk [iterations]   # AFK mode with specified iterations
#   ./ralph.sh list               # List all PRDs and their status
#   ./ralph.sh --prd <file>       # Use specific PRD file
#
# Environment variables:
#   RALPH_MAX_ITERATIONS - Default max iterations (default: 10)
#   RALPH_VERBOSE        - Enable verbose output (default: false)

set -e

# Configuration
AGENTS_TASKS_DIR=".agents/tasks"
DEFAULT_ITERATIONS="${RALPH_MAX_ITERATIONS:-10}"
VERBOSE="${RALPH_VERBOSE:-false}"
COMPLETION_PROMISE="<promise>COMPLETE</promise>"

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

# Ensure tasks directory exists
ensure_tasks_dir() {
  if [ ! -d "$AGENTS_TASKS_DIR" ]; then
    mkdir -p "$AGENTS_TASKS_DIR"
    print_color "$YELLOW" "Created $AGENTS_TASKS_DIR directory"
  fi
}

# List all PRD files
list_prds() {
  ensure_tasks_dir
  find "$AGENTS_TASKS_DIR" -name "prd-*.json" -type f 2>/dev/null | sort
}

# Check if PRD is complete (all tasks completed)
is_prd_complete() {
  local prd_file=$1
  # Use jq if available, fallback to grep
  if command -v jq &> /dev/null; then
    # Support both old format (userStories with passes) and new format (implementation_tasks with status)
    local incomplete=$(jq '
      if .userStories then
        [.userStories[] | select(.passes == false)] | length
      elif .implementation_tasks then
        [.implementation_tasks[] | select(.status | . == "completed" | not)] | length
      else
        0
      end
    ' "$prd_file")
    [ "$incomplete" = "0" ]
  else
    # Fallback: check if any incomplete status exists
    ! grep -q '"status":\s*"pending"\|"status":\s*"in_progress"\|"passes":\s*false' "$prd_file"
  fi
}

# Get PRD name
get_prd_name() {
  local prd_file=$1
  if command -v jq &> /dev/null; then
    jq -r '.name' "$prd_file"
  else
    grep -o '"name":\s*"[^"]*"' "$prd_file" | head -1 | cut -d'"' -f4
  fi
}

# Get PRD progress
get_prd_progress() {
  local prd_file=$1
  if command -v jq &> /dev/null; then
    # Support both old format (userStories with passes) and new format (implementation_tasks with status)
    local total=$(jq '
      if .userStories then
        .userStories | length
      elif .implementation_tasks then
        .implementation_tasks | length
      else
        0
      end
    ' "$prd_file")
    local complete=$(jq '
      if .userStories then
        [.userStories[] | select(.passes == true)] | length
      elif .implementation_tasks then
        [.implementation_tasks[] | select(.status == "completed")] | length
      else
        0
      end
    ' "$prd_file")
    echo "$complete/$total"
  else
    echo "?/?"
  fi
}

# List PRDs with status
list_prd_status() {
  ensure_tasks_dir
  local prds=$(list_prds)

  if [ -z "$prds" ]; then
    print_color "$YELLOW" "No PRD files found in $AGENTS_TASKS_DIR"
    echo "Create one with: bootstralph prd \"your feature description\""
    exit 0
  fi

  echo ""
  print_color "$BLUE" "Available PRDs:"
  echo ""

  local index=1
  while IFS= read -r prd_file; do
    local name=$(get_prd_name "$prd_file")
    local progress=$(get_prd_progress "$prd_file")

    if is_prd_complete "$prd_file"; then
      print_color "$GREEN" "  [$index] ✓ $name ($progress) - COMPLETE"
    else
      print_color "$YELLOW" "  [$index] ○ $name ($progress)"
    fi
    echo "      File: $prd_file"
    index=$((index + 1))
  done <<< "$prds"
  echo ""
}

# Get incomplete PRDs
get_incomplete_prds() {
  local prds=$(list_prds)
  local incomplete=""

  while IFS= read -r prd_file; do
    if [ -n "$prd_file" ] && ! is_prd_complete "$prd_file"; then
      if [ -n "$incomplete" ]; then
        incomplete="$incomplete"$'\n'"$prd_file"
      else
        incomplete="$prd_file"
      fi
    fi
  done <<< "$prds"

  echo "$incomplete"
}

# Select PRD interactively
select_prd() {
  local incomplete=$(get_incomplete_prds)

  if [ -z "$incomplete" ]; then
    print_color "$YELLOW" "No incomplete PRDs found in $AGENTS_TASKS_DIR"
    echo "Create one with: bootstralph prd \"your feature description\""
    exit 0
  fi

  local count=$(echo "$incomplete" | wc -l | tr -d ' ')

  if [ "$count" = "1" ]; then
    echo "$incomplete"
    return
  fi

  # Multiple PRDs - let user choose
  echo ""
  print_color "$BLUE" "Multiple incomplete PRDs found:"
  echo ""

  local index=1
  declare -a prd_array
  while IFS= read -r prd_file; do
    local name=$(get_prd_name "$prd_file")
    local progress=$(get_prd_progress "$prd_file")
    prd_array[$index]="$prd_file"
    echo "  [$index] $name ($progress)"
    index=$((index + 1))
  done <<< "$incomplete"

  echo ""
  read -p "Select PRD [1-$((index-1))]: " selection

  if [[ ! "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -ge "$index" ]; then
    print_color "$RED" "Invalid selection"
    exit 1
  fi

  echo "${prd_array[$selection]}"
}

# Run a single Ralph iteration
run_iteration() {
  local prd_file=$1
  local iteration=$2

  local prompt="@$prd_file @$AGENTS_TASKS_DIR/progress.txt \\
  1. Find the highest-priority task and implement it. \\
  2. Run your tests and type checks. \\
  3. Update the PRD with what was done (set passes: true). \\
  4. Append your progress to $AGENTS_TASKS_DIR/progress.txt. \\
  5. Commit your changes. \\
  ONLY WORK ON A SINGLE TASK. \\
  If the PRD is complete, output $COMPLETION_PROMISE."

  if [ "$VERBOSE" = "true" ]; then
    echo "Prompt: $prompt"
  fi

  docker sandbox run claude --permission-mode acceptEdits -p "$prompt"
}

# Run AFK mode
run_afk_mode() {
  local prd_file=$1
  local max_iterations=$2

  local name=$(get_prd_name "$prd_file")

  print_color "$BLUE" "Starting AFK Ralph Loop"
  echo "  PRD: $name"
  echo "  File: $prd_file"
  echo "  Max iterations: $max_iterations"
  echo ""
  print_color "$YELLOW" "Press Ctrl+C to stop"
  echo ""

  # Initialize progress file if it doesn't exist
  local progress_file="$AGENTS_TASKS_DIR/progress.txt"
  if [ ! -f "$progress_file" ]; then
    echo "# Progress Log for $name" > "$progress_file"
    echo "# Started: $(date -Iseconds)" >> "$progress_file"
    echo "" >> "$progress_file"
  fi

  for ((i=1; i<=max_iterations; i++)); do
    echo ""
    print_color "$BLUE" "=== Iteration $i/$max_iterations ==="
    echo ""

    local result=$(run_iteration "$prd_file" "$i")

    echo "$result"

    if [[ "$result" == *"$COMPLETION_PROMISE"* ]]; then
      echo ""
      print_color "$GREEN" "PRD COMPLETE after $i iterations!"
      echo "## $(date -Iseconds)" >> "$progress_file"
      echo "PRD COMPLETED after $i iterations" >> "$progress_file"
      exit 0
    fi

    # Show progress
    local progress=$(get_prd_progress "$prd_file")
    print_color "$YELLOW" "Progress: $progress"
  done

  echo ""
  print_color "$YELLOW" "Max iterations ($max_iterations) reached without completion"
  echo "## $(date -Iseconds)" >> "$progress_file"
  echo "Max iterations reached ($max_iterations)" >> "$progress_file"
}

# Run interactive mode (single iteration)
run_interactive() {
  local prd_file=$1

  local name=$(get_prd_name "$prd_file")
  local progress=$(get_prd_progress "$prd_file")

  print_color "$BLUE" "Ralph Interactive Mode"
  echo "  PRD: $name"
  echo "  Progress: $progress"
  echo ""

  read -p "Run iteration? [Y/n]: " confirm
  if [[ "$confirm" =~ ^[Nn] ]]; then
    echo "Cancelled"
    exit 0
  fi

  run_iteration "$prd_file" 1

  # Show updated progress
  progress=$(get_prd_progress "$prd_file")
  print_color "$YELLOW" "Updated progress: $progress"
}

# Main
main() {
  ensure_tasks_dir

  local mode="interactive"
  local iterations="$DEFAULT_ITERATIONS"
  local prd_file=""

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      afk)
        mode="afk"
        if [[ $2 =~ ^[0-9]+$ ]]; then
          iterations=$2
          shift
        fi
        shift
        ;;
      list)
        list_prd_status
        exit 0
        ;;
      --prd|-p)
        prd_file=$2
        shift 2
        ;;
      --verbose|-v)
        VERBOSE="true"
        shift
        ;;
      --help|-h)
        echo "Usage: $0 [command] [options]"
        echo ""
        echo "Commands:"
        echo "  (default)     Interactive PRD selection and single iteration"
        echo "  afk [n]       AFK mode with n iterations (default: $DEFAULT_ITERATIONS)"
        echo "  list          List all PRDs and their status"
        echo ""
        echo "Options:"
        echo "  --prd, -p     Specify PRD file to use"
        echo "  --verbose, -v Enable verbose output"
        echo "  --help, -h    Show this help"
        exit 0
        ;;
      *)
        # Check if it's a PRD file
        if [[ "$1" == *.json ]] || [[ "$1" == prd-* ]]; then
          prd_file="$1"
        fi
        shift
        ;;
    esac
  done

  # Select or verify PRD
  if [ -z "$prd_file" ]; then
    prd_file=$(select_prd)
  fi

  # Normalize path
  if [[ "$prd_file" != */* ]]; then
    prd_file="$AGENTS_TASKS_DIR/$prd_file"
  fi

  if [ ! -f "$prd_file" ]; then
    print_color "$RED" "PRD file not found: $prd_file"
    exit 1
  fi

  # Check if already complete
  if is_prd_complete "$prd_file"; then
    local name=$(get_prd_name "$prd_file")
    print_color "$GREEN" "PRD '$name' is already complete!"
    exit 0
  fi

  # Run appropriate mode
  case $mode in
    afk)
      run_afk_mode "$prd_file" "$iterations"
      ;;
    interactive)
      run_interactive "$prd_file"
      ;;
  esac
}

main "$@"
