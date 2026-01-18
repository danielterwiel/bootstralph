/**
 * /reviewer Command Handler
 *
 * Controls the Reviewer in Pair Vibe Mode.
 * Per impl-013: Commands to control Reviewer when it's slow or stuck.
 *
 * Subcommands:
 * - /reviewer status  - Show Reviewer progress
 * - /reviewer pause   - Pause look-ahead review
 * - /reviewer resume  - Resume look-ahead review
 * - /reviewer skip <step-id> - Skip reviewing a specific step
 */

import type { CommandResult } from "./types.js";
import { parseCommand, validateCommand } from "./parser.js";
import { store } from "../state/store.js";
import type { ReviewerRunner, ReviewerState } from "../../ralph/reviewer-runner.js";

/**
 * Subcommands for /reviewer
 */
export type ReviewerSubcommand = "status" | "pause" | "resume" | "skip";

/**
 * Options for executing the reviewer command
 */
export interface ReviewerCommandOptions {
  /** Raw input string (e.g., "/reviewer status") */
  input?: string;
  /** Subcommand to execute */
  subcommand?: ReviewerSubcommand;
  /** Step ID for skip subcommand */
  stepId?: string;
  /** Whether to show status in logs (default: true) */
  showInLogs?: boolean;
}

/**
 * Parsed /reviewer command arguments
 */
export interface ReviewerCommandArgs {
  /** The subcommand */
  subcommand: ReviewerSubcommand;
  /** Optional step ID (for skip) */
  stepId?: string;
}

/**
 * Reviewer status information
 */
export interface ReviewerStatusInfo {
  /** Current state of the reviewer */
  state: ReviewerState;
  /** Current step being reviewed */
  currentStep: string | null;
  /** Number of steps reviewed */
  reviewedCount: number;
  /** List of reviewed step IDs */
  reviewedSteps: string[];
}

/**
 * Valid subcommands
 */
const VALID_SUBCOMMANDS: ReviewerSubcommand[] = ["status", "pause", "resume", "skip"];

/**
 * Check if string is a valid subcommand
 */
function isValidSubcommand(value: string): value is ReviewerSubcommand {
  return VALID_SUBCOMMANDS.includes(value as ReviewerSubcommand);
}

/**
 * Parse /reviewer command arguments
 */
export function parseReviewerArgs(args: string[]): ReviewerCommandArgs | null {
  if (args.length === 0) {
    return null;
  }

  const subcommand = args[0]?.toLowerCase();
  if (!subcommand || !isValidSubcommand(subcommand)) {
    return null;
  }

  const result: ReviewerCommandArgs = { subcommand };

  // Skip requires a step ID
  if (subcommand === "skip") {
    const stepId = args[1];
    if (!stepId) {
      return null; // Missing step ID
    }
    result.stepId = stepId;
  }

  return result;
}

/**
 * Get ReviewerRunner from PairVibeEngine
 */
function getReviewerRunner(): ReviewerRunner | null {
  const engine = store.getPairVibeEngine();
  if (!engine) {
    return null;
  }
  return engine.getReviewerRunner();
}

/**
 * Execute /reviewer status subcommand
 */
function executeStatus(showInLogs: boolean): CommandResult {
  const reviewer = getReviewerRunner();
  if (!reviewer) {
    const errorMsg = "Reviewer not available. Engine may not be running.";
    if (showInLogs) {
      store.addLog(errorMsg, "error", "system");
    }
    return {
      success: false,
      message: errorMsg,
      error: "REVIEWER_NOT_AVAILABLE",
    };
  }

  const state = reviewer.getState();
  const currentStep = reviewer.getCurrentStep();
  const reviewedSteps = reviewer.getReviewedSteps();
  const reviewedCount = reviewer.getReviewedCount();

  const statusInfo: ReviewerStatusInfo = {
    state,
    currentStep,
    reviewedCount,
    reviewedSteps: Array.from(reviewedSteps),
  };

  // Format status message
  const stateDisplay = formatState(state);
  let message = `Reviewer ${stateDisplay}`;

  if (currentStep) {
    message += ` | Current: ${currentStep}`;
  }

  message += ` | Reviewed: ${reviewedCount} step${reviewedCount !== 1 ? "s" : ""}`;

  if (showInLogs) {
    store.addLog(message, "info", "reviewer");

    // Show detailed reviewed steps if any
    if (reviewedSteps.size > 0 && reviewedSteps.size <= 10) {
      store.addLog(`  Steps: ${Array.from(reviewedSteps).join(", ")}`, "info", "reviewer");
    } else if (reviewedSteps.size > 10) {
      const first5 = Array.from(reviewedSteps).slice(0, 5);
      store.addLog(
        `  Steps: ${first5.join(", ")} ... and ${reviewedSteps.size - 5} more`,
        "info",
        "reviewer"
      );
    }
  }

  return {
    success: true,
    message,
    data: statusInfo,
  };
}

/**
 * Format reviewer state for display
 */
function formatState(state: ReviewerState): string {
  switch (state) {
    case "idle":
      return "[IDLE]";
    case "running":
      return "[RUNNING]";
    case "paused":
      return "[PAUSED]";
    case "waiting_for_consensus":
      return "[WAITING FOR CONSENSUS]";
    case "stopped":
      return "[STOPPED]";
    case "error":
      return "[ERROR]";
    default: {
      // Exhaustive check - this should never be reached
      const exhaustiveCheck: never = state;
      return `[${String(exhaustiveCheck).toUpperCase()}]`;
    }
  }
}

/**
 * Execute /reviewer pause subcommand
 */
function executePause(showInLogs: boolean): CommandResult {
  const reviewer = getReviewerRunner();
  if (!reviewer) {
    const errorMsg = "Reviewer not available. Engine may not be running.";
    if (showInLogs) {
      store.addLog(errorMsg, "error", "system");
    }
    return {
      success: false,
      message: errorMsg,
      error: "REVIEWER_NOT_AVAILABLE",
    };
  }

  const state = reviewer.getState();
  if (state === "paused") {
    const message = "Reviewer is already paused";
    if (showInLogs) {
      store.addLog(message, "warn", "system");
    }
    return {
      success: true,
      message,
      data: { alreadyPaused: true },
    };
  }

  if (state !== "running") {
    const message = `Cannot pause Reviewer in state: ${state}`;
    if (showInLogs) {
      store.addLog(message, "warn", "system");
    }
    return {
      success: false,
      message,
      error: "INVALID_STATE",
    };
  }

  reviewer.pause("User requested pause via /reviewer pause");

  const message = "Reviewer paused";
  if (showInLogs) {
    store.addLog(message, "info", "reviewer");
  }

  return {
    success: true,
    message,
    data: { previousState: state },
  };
}

/**
 * Execute /reviewer resume subcommand
 */
function executeResume(showInLogs: boolean): CommandResult {
  const reviewer = getReviewerRunner();
  if (!reviewer) {
    const errorMsg = "Reviewer not available. Engine may not be running.";
    if (showInLogs) {
      store.addLog(errorMsg, "error", "system");
    }
    return {
      success: false,
      message: errorMsg,
      error: "REVIEWER_NOT_AVAILABLE",
    };
  }

  const state = reviewer.getState();
  if (state === "running") {
    const message = "Reviewer is already running";
    if (showInLogs) {
      store.addLog(message, "warn", "system");
    }
    return {
      success: true,
      message,
      data: { alreadyRunning: true },
    };
  }

  if (state !== "paused") {
    const message = `Cannot resume Reviewer in state: ${state}`;
    if (showInLogs) {
      store.addLog(message, "warn", "system");
    }
    return {
      success: false,
      message,
      error: "INVALID_STATE",
    };
  }

  reviewer.resume();

  const message = "Reviewer resumed";
  if (showInLogs) {
    store.addLog(message, "info", "reviewer");
  }

  return {
    success: true,
    message,
    data: { previousState: state },
  };
}

/**
 * Execute /reviewer skip <step-id> subcommand
 */
function executeSkip(stepId: string, showInLogs: boolean): CommandResult {
  const reviewer = getReviewerRunner();
  if (!reviewer) {
    const errorMsg = "Reviewer not available. Engine may not be running.";
    if (showInLogs) {
      store.addLog(errorMsg, "error", "system");
    }
    return {
      success: false,
      message: errorMsg,
      error: "REVIEWER_NOT_AVAILABLE",
    };
  }

  // Check if step is already reviewed
  if (reviewer.isStepReviewed(stepId)) {
    const message = `Step ${stepId} has already been reviewed`;
    if (showInLogs) {
      store.addLog(message, "warn", "system");
    }
    return {
      success: true,
      message,
      data: { alreadyReviewed: true, stepId },
    };
  }

  // Skip the step
  reviewer.skipStep(stepId);

  const message = `Skipped reviewing step ${stepId}`;
  if (showInLogs) {
    store.addLog(message, "info", "reviewer");
  }

  return {
    success: true,
    message,
    data: { stepId },
  };
}

/**
 * Execute the /reviewer command
 *
 * Controls the Reviewer in Pair Vibe Mode.
 *
 * @param options Command options
 * @returns Command result with success status and message
 */
export async function executeReviewerCommand(
  options: ReviewerCommandOptions = {}
): Promise<CommandResult> {
  const showInLogs = options.showInLogs !== false;
  let subcommand = options.subcommand;
  let stepId = options.stepId;

  // If input provided, parse and validate it
  if (options.input) {
    const parsed = parseCommand(options.input);
    const validationError = validateCommand(parsed);

    if (validationError) {
      if (showInLogs) {
        store.addLog(`Error: ${validationError.message}`, "error", "system");
      }
      return {
        success: false,
        message: validationError.message,
        error: validationError.type,
      };
    }

    // Ensure it's actually a reviewer command
    if (parsed.name !== "reviewer") {
      const errorMsg = `Expected /reviewer command, got /${parsed.name}`;
      if (showInLogs) {
        store.addLog(errorMsg, "error", "system");
      }
      return {
        success: false,
        message: errorMsg,
        error: "WRONG_COMMAND",
      };
    }

    // Parse arguments
    const args = parseReviewerArgs(parsed.args);
    if (!args) {
      const errorMsg =
        "Invalid /reviewer command. Usage: /reviewer <status|pause|resume|skip <step-id>>";
      if (showInLogs) {
        store.addLog(errorMsg, "error", "system");
      }
      return {
        success: false,
        message: errorMsg,
        error: "INVALID_ARGS",
      };
    }

    subcommand = args.subcommand;
    stepId = args.stepId;
  }

  // Check if subcommand is provided
  if (!subcommand) {
    const errorMsg =
      "Missing subcommand. Usage: /reviewer <status|pause|resume|skip <step-id>>";
    if (showInLogs) {
      store.addLog(errorMsg, "error", "system");
    }
    return {
      success: false,
      message: errorMsg,
      error: "MISSING_SUBCOMMAND",
    };
  }

  // Check if Pair Vibe Mode is active
  if (!store.isPairVibeActive()) {
    const errorMsg =
      "Pair Vibe Mode is not active. /reviewer only works in Pair Vibe Mode.";
    if (showInLogs) {
      store.addLog(errorMsg, "error", "system");
    }
    return {
      success: false,
      message: errorMsg,
      error: "NOT_PAIR_VIBE_MODE",
    };
  }

  // Execute the appropriate subcommand
  switch (subcommand) {
    case "status":
      return executeStatus(showInLogs);

    case "pause":
      return executePause(showInLogs);

    case "resume":
      return executeResume(showInLogs);

    case "skip":
      if (!stepId) {
        const errorMsg = "Missing step ID. Usage: /reviewer skip <step-id>";
        if (showInLogs) {
          store.addLog(errorMsg, "error", "system");
        }
        return {
          success: false,
          message: errorMsg,
          error: "MISSING_STEP_ID",
        };
      }
      return executeSkip(stepId, showInLogs);

    default: {
      const errorMsg = `Unknown subcommand: ${subcommand}`;
      if (showInLogs) {
        store.addLog(errorMsg, "error", "system");
      }
      return {
        success: false,
        message: errorMsg,
        error: "UNKNOWN_SUBCOMMAND",
      };
    }
  }
}

/**
 * Handle /reviewer command from raw input string
 *
 * Convenience function for direct command handling.
 *
 * @param input Raw command input (e.g., "/reviewer status")
 * @returns Command result
 */
export async function handleReviewerCommand(input: string): Promise<CommandResult> {
  return executeReviewerCommand({ input });
}

/**
 * Check if reviewer commands are available
 *
 * @returns Whether reviewer commands can be executed
 */
export function canUseReviewerCommands(): boolean {
  // Must be in Pair Vibe Mode
  if (!store.isPairVibeActive()) {
    return false;
  }

  // Engine must be available
  const engine = store.getPairVibeEngine();
  if (!engine) {
    return false;
  }

  return true;
}

/**
 * Get reviewer status directly (without logs)
 *
 * @returns Reviewer status info or null if not available
 */
export function getReviewerStatus(): ReviewerStatusInfo | null {
  const reviewer = getReviewerRunner();
  if (!reviewer) {
    return null;
  }

  return {
    state: reviewer.getState(),
    currentStep: reviewer.getCurrentStep(),
    reviewedCount: reviewer.getReviewedCount(),
    reviewedSteps: Array.from(reviewer.getReviewedSteps()),
  };
}

/**
 * Get help text for the /reviewer command
 */
export function getReviewerHelp(): string {
  return `
/reviewer <subcommand> [args]

Control the Reviewer in Pair Vibe Mode.
Only available when Pair Vibe Mode is active.

Subcommands:
  status              Show Reviewer progress and state
  pause               Pause look-ahead review
  resume              Resume look-ahead review
  skip <step-id>      Skip reviewing a specific step

Notes:
  - Useful when Reviewer is slow or stuck
  - Pausing stops the Reviewer from reviewing ahead
  - Skipping marks a step as reviewed without actually reviewing it
  - Status shows current state, step being reviewed, and count of reviewed steps

Examples:
  /reviewer status
  /reviewer pause
  /reviewer resume
  /reviewer skip impl-015
`.trim();
}
