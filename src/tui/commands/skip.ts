/**
 * /skip Command Handler
 *
 * Skips the current task and moves to the next one.
 * Useful when Claude is stuck on a task or the task needs to be deferred.
 *
 * Usage: /skip [reason]
 *
 * The handler:
 * 1. Marks the current task as completed with note "Skipped by user"
 * 2. Updates the PRD via PrdManager
 * 3. Updates the TUI store to move to the next task
 * 4. Logs the skip action with optional reason
 */

import type { CommandResult, SkipCommandArgs } from "./types.js";
import { parseSkipArgs, parseCommand, validateCommand } from "./parser.js";
import { PrdManager, getDefaultPrdManager } from "../../ralph/prd-manager.js";
import { store } from "../state/store.js";

/**
 * Options for executing the skip command
 */
export interface SkipCommandOptions {
  /** Raw input string (e.g., "/skip" or "/skip Claude is stuck") */
  input?: string;
  /** Pre-parsed arguments (if already parsed) */
  args?: SkipCommandArgs;
  /** Custom PRD manager (defaults to singleton) */
  prdManager?: PrdManager;
  /** Whether to show status in logs (default: true) */
  showInLogs?: boolean;
}

/**
 * Execute the /skip command
 *
 * Skips the current task, marking it as completed with a skip note.
 * Moves to the next task in the queue.
 *
 * @param options Command options
 * @returns Command result with success status and message
 */
export async function executeSkipCommand(
  options: SkipCommandOptions = {}
): Promise<CommandResult> {
  const showInLogs = options.showInLogs !== false;

  // Parse arguments if input provided
  let skipArgs: SkipCommandArgs = options.args ?? {};

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

    // Ensure it's actually a skip command
    if (parsed.name !== "skip") {
      const errorMsg = `Expected /skip command, got /${parsed.name}`;
      if (showInLogs) {
        store.addLog(errorMsg, "error", "system");
      }
      return {
        success: false,
        message: errorMsg,
        error: "WRONG_COMMAND",
      };
    }

    skipArgs = parseSkipArgs(parsed);
  }

  // Get current task from store
  const currentTask = store.currentTask();

  if (!currentTask) {
    const message = "No current task to skip";
    if (showInLogs) {
      store.addLog(message, "warn", "system");
    }
    return {
      success: false,
      message,
      error: "NO_CURRENT_TASK",
    };
  }

  // Get PRD manager
  const manager = options.prdManager ?? getDefaultPrdManager();

  // Check if PRD is loaded
  const prd = manager.getPrd();
  if (!prd) {
    const errorMsg = "No PRD loaded. Cannot skip task without PRD context.";
    if (showInLogs) {
      store.addLog(errorMsg, "error", "system");
    }
    return {
      success: false,
      message: errorMsg,
      error: "NO_PRD_LOADED",
    };
  }

  // Mark task as skipped in PRD
  const result = manager.markSkipped(currentTask.id, skipArgs.reason);

  if (!result.success) {
    if (showInLogs) {
      store.addLog(`Error: ${result.message}`, "error", "system");
    }
    const errorResult: CommandResult = {
      success: false,
      message: result.message,
    };
    if (result.error !== undefined) {
      errorResult.error = result.error;
    }
    return errorResult;
  }

  // Update store: skip current task and update progress
  store.skipTask(skipArgs.reason);

  // Update progress in store
  const progress = manager.getProgress();
  store.setProgress((prev) => ({
    ...prev,
    total: progress.total,
    completed: progress.completed,
  }));

  // Build success message
  const message = skipArgs.reason
    ? `Skipped task ${currentTask.id}: ${skipArgs.reason}`
    : `Skipped task ${currentTask.id}`;

  if (showInLogs) {
    store.addLog(`✓ ${message}`, "success", "system");
  }

  return {
    success: true,
    message,
    data: {
      taskId: currentTask.id,
      taskTitle: currentTask.title,
      ...(skipArgs.reason !== undefined && { reason: skipArgs.reason }),
    },
  };
}

/**
 * Handle /skip command from raw input string
 *
 * Convenience function for direct command handling.
 *
 * @param input Raw command input (e.g., "/skip" or "/skip Claude is stuck")
 * @returns Command result
 */
export async function handleSkipCommand(input: string): Promise<CommandResult> {
  return executeSkipCommand({ input });
}

/**
 * Skip the current task programmatically
 *
 * Direct API for skipping without command parsing.
 *
 * @param reason Optional reason for skipping
 * @param options Additional options
 * @returns Command result
 */
export async function skipCurrentTask(
  reason?: string,
  options: {
    prdManager?: PrdManager;
    showInLogs?: boolean;
  } = {}
): Promise<CommandResult> {
  const args: SkipCommandArgs = {};
  if (reason !== undefined) {
    args.reason = reason;
  }
  return executeSkipCommand({
    args,
    ...options,
  });
}

/**
 * Validate skip command input without executing
 *
 * Useful for UI validation before submission.
 *
 * @param input Raw command input
 * @returns Validation result with parsed args if valid
 */
export function validateSkipInput(input: string): {
  valid: boolean;
  args?: SkipCommandArgs;
  error?: string;
} {
  const parsed = parseCommand(input);

  if (!parsed.isCommand || parsed.name !== "skip") {
    return {
      valid: false,
      error: "Not a /skip command",
    };
  }

  const validationError = validateCommand(parsed);
  if (validationError) {
    return {
      valid: false,
      error: validationError.message ?? "Unknown validation error",
    };
  }

  const args = parseSkipArgs(parsed);

  return {
    valid: true,
    args,
  };
}

/**
 * Get help text for the /skip command
 */
export function getSkipHelp(): string {
  return `
/skip [reason]

Skip the current task and move to the next one.

Arguments:
  reason  Optional reason for skipping (can be multiple words)

Examples:
  /skip
  /skip Claude is stuck on this task
  /skip Needs more research before implementation
  /skip "Deferred to next sprint"

Notes:
  - The task is marked as completed with a "Skipped by user" note
  - The skip reason is appended to the task notes with a timestamp
  - Useful when Claude is stuck or the task needs to be deferred
  - Progress counter is updated to reflect the skip
  - The next pending task will be picked up automatically
`.trim();
}
