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
#   ./ralph.sh --provider openai  # Force OpenAI provider
#
# Environment variables:
#   ANTHROPIC_API_KEY    - Anthropic API key (for Claude models)
#   OPENAI_API_KEY       - OpenAI API key (for GPT models)
#   RALPH_MAX_ITERATIONS - Default max iterations (default: 10)
#   RALPH_VERBOSE        - Enable verbose output (default: false)
#
# Provider selection:
#   - If only ANTHROPIC_API_KEY is set, uses Claude (Anthropic)
#   - If only OPENAI_API_KEY is set, uses GPT-4o (OpenAI)
#   - If both are set, prompts user to choose

set -e

# Configuration
AGENTS_TASKS_DIR=".agents/tasks"
DEFAULT_ITERATIONS="${RALPH_MAX_ITERATIONS:-10}"
VERBOSE="${RALPH_VERBOSE:-false}"
COMPLETION_PROMISE="<promise>COMPLETE</promise>"
SELECTED_PROVIDER=""
FORCE_PROVIDER=""

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

# Detect available API keys and select provider
detect_and_select_provider() {
  # If provider was forced via --provider flag, use it
  if [ -n "$FORCE_PROVIDER" ]; then
    SELECTED_PROVIDER="$FORCE_PROVIDER"
    case $FORCE_PROVIDER in
      anthropic)
        print_color "$GREEN" "Using ANTHROPIC_API_KEY (forced)"
        ;;
      openai)
        print_color "$GREEN" "Using OPENAI_API_KEY (forced)"
        ;;
    esac
    return
  fi

  local has_openai=false
  local has_anthropic=false

  if [ -n "$OPENAI_API_KEY" ]; then
    has_openai=true
  fi

  if [ -n "$ANTHROPIC_API_KEY" ]; then
    has_anthropic=true
  fi

  # Neither key set
  if [ "$has_openai" = false ] && [ "$has_anthropic" = false ]; then
    print_color "$RED" "Error: No API key found in environment"
    echo "Set one of: ANTHROPIC_API_KEY or OPENAI_API_KEY"
    exit 1
  fi

  # Only Anthropic key set
  if [ "$has_anthropic" = true ] && [ "$has_openai" = false ]; then
    SELECTED_PROVIDER="anthropic"
    print_color "$GREEN" "Using ANTHROPIC_API_KEY"
    return
  fi

  # Only OpenAI key set
  if [ "$has_openai" = true ] && [ "$has_anthropic" = false ]; then
    SELECTED_PROVIDER="openai"
    print_color "$GREEN" "Using OPENAI_API_KEY"
    return
  fi

  # Both keys set - prompt user to choose
  echo ""
  print_color "$BLUE" "Multiple API keys detected. Select provider:"
  echo ""
  echo "  [1] Anthropic (ANTHROPIC_API_KEY)"
  echo "  [2] OpenAI (OPENAI_API_KEY)"
  echo ""
  read -p "Select provider [1-2]: " provider_choice

  case $provider_choice in
    1)
      SELECTED_PROVIDER="anthropic"
      print_color "$GREEN" "Using ANTHROPIC_API_KEY"
      ;;
    2)
      SELECTED_PROVIDER="openai"
      print_color "$GREEN" "Using OPENAI_API_KEY"
      ;;
    *)
      print_color "$RED" "Invalid selection. Defaulting to Anthropic."
      SELECTED_PROVIDER="anthropic"
      print_color "$GREEN" "Using ANTHROPIC_API_KEY"
      ;;
  esac
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

# Select PRD interactively using OpenTUI
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

  # Multiple PRDs - use TypeScript TUI selector
  local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local selector_script="$script_dir/src/scripts/select-prd.ts"

  # Check if the script exists and bun is available
  if [ -f "$selector_script" ] && command -v bun &> /dev/null; then
    # Use a temp file to capture the result so the TUI has TTY access
    local temp_file=$(mktemp)
    trap "rm -f '$temp_file'" EXIT

    # Run the TypeScript selector with TTY access, output goes to temp file
    bun run "$selector_script" > "$temp_file"
    local exit_code=$?

    local selected=$(cat "$temp_file")
    rm -f "$temp_file"

    if [ $exit_code -ne 0 ] || [ -z "$selected" ]; then
      print_color "$RED" "Selection cancelled" >&2
      exit 1
    fi

    echo "$AGENTS_TASKS_DIR/$selected"
  else
    # Fallback to basic bash selection if TypeScript selector not available
    # Note: All messages go to stderr so stdout only has the selected PRD path
    echo "" >&2
    print_color "$BLUE" "Multiple incomplete PRDs found:" >&2
    echo "" >&2

    local index=1
    declare -a prd_array
    while IFS= read -r prd_file; do
      local name=$(get_prd_name "$prd_file")
      local progress=$(get_prd_progress "$prd_file")
      prd_array[$index]="$prd_file"
      echo "  [$index] $name ($progress)" >&2
      index=$((index + 1))
    done <<< "$incomplete"

    echo "" >&2
    # Read from /dev/tty if available (for when stdout is captured), otherwise use stdin
    echo -n "Select PRD [1-$((index-1))]: " >&2
    { read selection </dev/tty; } 2>/dev/null || read selection

    if [[ ! "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -ge "$index" ]; then
      print_color "$RED" "Invalid selection" >&2
      exit 1
    fi

    echo "${prd_array[$selection]}"
  fi
}

# Get the model flag based on selected provider
get_model_flag() {
  case $SELECTED_PROVIDER in
    openai)
      # Use OpenAI's latest GPT model
      echo "--model gpt-4o"
      ;;
    anthropic)
      # Default Claude model (no flag needed, or specify explicitly)
      echo ""
      ;;
    *)
      echo ""
      ;;
  esac
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
    echo "Provider: $SELECTED_PROVIDER"
  fi

  local model_flag=$(get_model_flag)
  docker sandbox run claude --permission-mode acceptEdits $model_flag -p "$prompt"
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
      --provider)
        case $2 in
          anthropic|openai)
            FORCE_PROVIDER=$2
            ;;
          *)
            print_color "$RED" "Invalid provider: $2 (use 'anthropic' or 'openai')"
            exit 1
            ;;
        esac
        shift 2
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
        echo "  --prd, -p       Specify PRD file to use"
        echo "  --provider      Force provider (anthropic or openai)"
        echo "  --verbose, -v   Enable verbose output"
        echo "  --help, -h      Show this help"
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

  # Detect and select AI provider
  detect_and_select_provider

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
