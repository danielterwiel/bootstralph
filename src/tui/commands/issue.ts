/**
 * /issue Command Handler
 *
 * Adds a new issue/task to the PRD.
 * Usage: /issue <description>
 *
 * The handler:
 * 1. Parses the description from arguments
 * 2. Generates the next task ID (impl-XXX or US-XXX based on existing pattern)
 * 3. Creates a new task with priority = max + 1 (or phase = max phase for impl tasks)
 * 4. Adds to PRD via PrdManager
 * 5. Displays confirmation with the new task ID
 */

import type { CommandResult, IssueCommandArgs } from "./types.js";
import { parseIssueArgs, parseCommand, validateCommand } from "./parser.js";
import { PrdManager, getDefaultPrdManager } from "../../ralph/prd-manager.js";
import { store } from "../state/store.js";

/**
 * Options for executing the issue command
 */
export interface IssueCommandOptions {
  /** Raw input string (e.g., "/issue Fix login button") */
  input?: string;
  /** Pre-parsed arguments (if already parsed) */
  args?: IssueCommandArgs;
  /** Custom PRD manager (defaults to singleton) */
  prdManager?: PrdManager;
  /** Optional priority override */
  priority?: number;
  /** Optional phase override (for implementation_tasks) */
  phase?: number;
}

/**
 * Execute the /issue command
 *
 * Adds a new issue/task to the current PRD.
 *
 * @param options Command options
 * @returns Command result with success status and message
 */
export async function executeIssueCommand(
  options: IssueCommandOptions
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
  let issueArgs: IssueCommandArgs | null = options.args ?? null;

  if (!issueArgs && options.input) {
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

    issueArgs = parseIssueArgs(parsed);
  }

  // Validate we have a description
  if (!issueArgs || !issueArgs.description || issueArgs.description.trim() === "") {
    const errorMsg = "Issue description is required. Usage: /issue <description>";
    store.addLog(errorMsg, "error", "system");
    return {
      success: false,
      message: errorMsg,
      error: "MISSING_DESCRIPTION",
    };
  }

  const description = issueArgs.description.trim();

  // Add the issue via PRD manager
  const result = manager.addIssue({
    title: description,
    description: description,
    ...(options.priority !== undefined && { priority: options.priority }),
    ...(options.phase !== undefined && { phase: options.phase }),
  });

  if (result.success) {
    // Log success
    store.addLog(
      `✓ Created issue ${result.taskId}: ${description}`,
      "success",
      "system"
    );

    // Update store progress if PRD changed
    const updatedPrd = manager.getPrd();
    if (updatedPrd) {
      // Update progress in store
      const progress = manager.getProgress();
      store.setProgress((prev) => ({
        ...prev,
        total: progress.total,
        completed: progress.completed,
      }));
    }

    return {
      success: true,
      message: result.message,
      data: {
        taskId: result.taskId,
        description,
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
 * Handle /issue command from raw input string
 *
 * Convenience function for direct command handling.
 *
 * @param input Raw command input (e.g., "/issue Fix the bug")
 * @returns Command result
 */
export async function handleIssueCommand(input: string): Promise<CommandResult> {
  return executeIssueCommand({ input });
}

/**
 * Create a new issue with explicit parameters
 *
 * Convenience function for programmatic issue creation.
 *
 * @param description Issue description
 * @param options Additional options
 * @returns Command result
 */
export async function createIssue(
  description: string,
  options: {
    priority?: number;
    phase?: number;
    prdManager?: PrdManager;
  } = {}
): Promise<CommandResult> {
  return executeIssueCommand({
    args: { description },
    ...options,
  });
}

/**
 * Validate issue command input without executing
 *
 * Useful for UI validation before submission.
 *
 * @param input Raw command input
 * @returns Validation result with parsed args if valid
 */
export function validateIssueInput(input: string): {
  valid: boolean;
  args?: IssueCommandArgs;
  error?: string;
} {
  const parsed = parseCommand(input);

  if (!parsed.isCommand || parsed.name !== "issue") {
    return {
      valid: false,
      error: "Not an /issue command",
    };
  }

  const validationError = validateCommand(parsed);
  if (validationError) {
    return {
      valid: false,
      error: validationError.message ?? "Unknown validation error",
    };
  }

  const args = parseIssueArgs(parsed);
  if (!args || !args.description || args.description.trim() === "") {
    return {
      valid: false,
      error: "Issue description is required",
    };
  }

  return {
    valid: true,
    args,
  };
}

/**
 * Get help text for the /issue command
 */
export function getIssueHelp(): string {
  return `
/issue <description>

Add a new issue/task to the current PRD.

Arguments:
  description  The issue description (required)

Examples:
  /issue Fix login button alignment
  /issue Add dark mode support for settings page
  /issue "Implement user profile editing"

Notes:
  - The task ID is auto-generated based on existing task patterns
  - For implementation_tasks: uses impl-XXX pattern, assigned to max phase
  - For userStories: uses US-XXX pattern, priority = max + 1
  - The issue is immediately saved to the PRD file
`.trim();
}
