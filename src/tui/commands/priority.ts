/**
 * /priority Command Handler
 *
 * Changes a task's priority (for userStories) or phase (for implementation_tasks).
 * Usage: /priority <task-id> <number>
 *
 * Lower numbers = higher priority. This affects the order in which tasks are
 * selected by getNextTask().
 *
 * The handler:
 * 1. Parses the task ID and priority number from arguments
 * 2. Validates the task exists in the PRD
 * 3. Updates the priority/phase via PrdManager
 * 4. Logs the change
 */

import type { CommandResult, PriorityCommandArgs } from "./types.js";
import { parsePriorityArgs, parseCommand, validateCommand } from "./parser.js";
import { PrdManager, getDefaultPrdManager } from "../../ralph/prd-manager.js";
import { store } from "../state/store.js";

/**
 * Options for executing the priority command
 */
export interface PriorityCommandOptions {
  /** Raw input string (e.g., "/priority impl-044 1") */
  input?: string;
  /** Pre-parsed arguments (if already parsed) */
  args?: PriorityCommandArgs;
  /** Custom PRD manager (defaults to singleton) */
  prdManager?: PrdManager;
}

/**
 * Execute the /priority command
 *
 * Changes a task's priority (or phase for implementation_tasks).
 * Lower numbers = higher priority.
 *
 * @param options Command options
 * @returns Command result with success status and message
 */
export async function executePriorityCommand(
  options: PriorityCommandOptions
): Promise<CommandResult> {
  // Get PRD manager
  const manager = options.prdManager ?? getDefaultPrdManager();

  // Check if PRD is loaded
  const prd = manager.getPrd();
  if (!prd) {
    const errorMsg = "No PRD loaded. Use /status to check or load a PRD first.";
    store.addLog(errorMsg, "error", "system");
    return {
      success: false,
      message: errorMsg,
      error: "NO_PRD_LOADED",
    };
  }

  // Parse arguments if not provided
  let priorityArgs: PriorityCommandArgs | null = options.args ?? null;

  if (!priorityArgs && options.input) {
    const parsed = parseCommand(options.input);
    const validationError = validateCommand(parsed);

    if (validationError) {
      store.addLog(`Error: ${validationError.message}`, "error", "system");
      return {
        success: false,
        message: validationError.message,
        error: validationError.type,
      };
    }

    priorityArgs = parsePriorityArgs(parsed);
  }

  // Validate we have required arguments
  if (!priorityArgs || !priorityArgs.taskId || priorityArgs.priority === undefined) {
    const errorMsg = "Invalid arguments. Usage: /priority <task-id> <number>";
    store.addLog(errorMsg, "error", "system");
    return {
      success: false,
      message: errorMsg,
      error: "INVALID_ARGS",
    };
  }

  const { taskId, priority } = priorityArgs;

  // Validate priority is a valid number
  if (isNaN(priority) || !Number.isInteger(priority)) {
    const errorMsg = `Invalid priority: ${priority}. Must be an integer.`;
    store.addLog(errorMsg, "error", "system");
    return {
      success: false,
      message: errorMsg,
      error: "INVALID_PRIORITY",
    };
  }

  // Verify task exists
  const task = manager.getTask(taskId);
  if (!task) {
    const errorMsg = `Task not found: ${taskId}`;
    store.addLog(errorMsg, "error", "system");
    return {
      success: false,
      message: errorMsg,
      error: "TASK_NOT_FOUND",
    };
  }

  // Get the old priority/phase for the log message
  let oldPriority: number | undefined;
  let priorityLabel = "priority";

  if ("phase" in task) {
    oldPriority = task.phase;
    priorityLabel = "phase";
  } else if ("priority" in task) {
    oldPriority = task.priority;
  }

  // Update the priority via PRD manager
  const result = manager.updatePriority({
    taskId,
    priority,
  });

  if (result.success) {
    // Log success with old and new values
    const changeMsg = oldPriority !== undefined
      ? `${oldPriority} → ${priority}`
      : `${priority}`;

    store.addLog(
      `✓ Updated ${taskId} ${priorityLabel}: ${changeMsg}`,
      "success",
      "system"
    );

    // Update store progress in case the order changed
    const progress = manager.getProgress();
    store.setProgress((prev) => ({
      ...prev,
      completed: progress.completed,
      total: progress.total,
    }));

    return {
      success: true,
      message: result.message,
      data: {
        taskId,
        oldPriority,
        newPriority: priority,
        priorityType: priorityLabel,
      },
    };
  } else {
    store.addLog(`Error: ${result.message}`, "error", "system");
    const errorResult: CommandResult = {
      success: false,
      message: result.message,
    };
    if (result.error !== undefined) {
      errorResult.error = result.error;
    }
    return errorResult;
  }
}

/**
 * Handle /priority command from raw input string
 *
 * Convenience function for direct command handling.
 *
 * @param input Raw command input (e.g., "/priority impl-044 1")
 * @returns Command result
 */
export async function handlePriorityCommand(input: string): Promise<CommandResult> {
  return executePriorityCommand({ input });
}

/**
 * Change task priority with explicit parameters
 *
 * Convenience function for programmatic priority changes.
 *
 * @param taskId Task ID to update
 * @param priority New priority value (lower = higher priority)
 * @param options Additional options
 * @returns Command result
 */
export async function changePriority(
  taskId: string,
  priority: number,
  options: {
    prdManager?: PrdManager;
  } = {}
): Promise<CommandResult> {
  const execOptions: PriorityCommandOptions = {
    args: { taskId, priority },
  };
  if (options.prdManager !== undefined) {
    execOptions.prdManager = options.prdManager;
  }

  return executePriorityCommand(execOptions);
}

/**
 * Validate priority command input without executing
 *
 * Useful for UI validation before submission.
 *
 * @param input Raw command input
 * @returns Validation result with parsed args if valid
 */
export function validatePriorityInput(input: string): {
  valid: boolean;
  args?: PriorityCommandArgs;
  error?: string;
} {
  const parsed = parseCommand(input);

  if (!parsed.isCommand || parsed.name !== "priority") {
    return {
      valid: false,
      error: "Not a /priority command",
    };
  }

  const validationError = validateCommand(parsed);
  if (validationError) {
    return {
      valid: false,
      error: validationError.message ?? "Unknown validation error",
    };
  }

  const args = parsePriorityArgs(parsed);
  if (!args) {
    return {
      valid: false,
      error: "Invalid arguments. Usage: /priority <task-id> <number>",
    };
  }

  // Validate priority is a valid integer
  if (isNaN(args.priority) || !Number.isInteger(args.priority)) {
    return {
      valid: false,
      error: "Priority must be an integer",
    };
  }

  return {
    valid: true,
    args,
  };
}

/**
 * Get help text for the /priority command
 */
export function getPriorityHelp(): string {
  return `
/priority <task-id> <number>

Change a task's priority (or phase for implementation tasks).

Arguments:
  task-id   The ID of the task to update (required)
  number    The new priority value (required, integer)

Priority Behavior:
  - Lower numbers = higher priority (processed first)
  - For implementation_tasks: updates the 'phase' field
  - For userStories: updates the 'priority' field
  - Changes affect which task is selected next by the Ralph loop

Examples:
  /priority impl-044 1      Move task to phase 1 (highest priority)
  /priority US-001 5        Set user story priority to 5
  /priority impl-050 2      Move impl-050 to phase 2

Notes:
  - The task must exist in the current PRD
  - Changes are saved immediately
  - Use /status to see current task priorities
`.trim();
}
