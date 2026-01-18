/**
 * /note Command Handler
 *
 * Adds a note to the current task's notes field (or a specified task).
 * Usage: /note <content>
 *        /note <task-id> <content>
 *
 * The handler:
 * 1. Parses the note content (and optional task ID) from arguments
 * 2. Uses current task if no task ID specified
 * 3. Appends note with timestamp to the task's notes field
 * 4. Saves the PRD via PrdManager
 * 5. Displays confirmation
 */

import type { CommandResult, NoteCommandArgs } from "./types.js";
import { parseNoteArgs, parseCommand, validateCommand } from "./parser.js";
import { PrdManager, getDefaultPrdManager } from "../../ralph/prd-manager.js";
import { store } from "../state/store.js";

/**
 * Options for executing the note command
 */
export interface NoteCommandOptions {
  /** Raw input string (e.g., "/note This is a note") */
  input?: string;
  /** Pre-parsed arguments (if already parsed) */
  args?: NoteCommandArgs;
  /** Custom PRD manager (defaults to singleton) */
  prdManager?: PrdManager;
  /** Whether to append to existing notes (default: true) */
  append?: boolean;
}

/**
 * Execute the /note command
 *
 * Adds a note to a task in the current PRD.
 *
 * @param options Command options
 * @returns Command result with success status and message
 */
export async function executeNoteCommand(
  options: NoteCommandOptions
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
  let noteArgs: NoteCommandArgs | null = options.args ?? null;

  if (!noteArgs && options.input) {
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

    noteArgs = parseNoteArgs(parsed);
  }

  // Validate we have content
  if (!noteArgs || !noteArgs.content || noteArgs.content.trim() === "") {
    const errorMsg = "Note content is required. Usage: /note <content>";
    store.addLog(errorMsg, "error", "system");
    return {
      success: false,
      message: errorMsg,
      error: "MISSING_CONTENT",
    };
  }

  const content = noteArgs.content.trim();

  // Determine which task to add note to
  let taskId: string;

  if (noteArgs.taskId) {
    // Use specified task ID
    taskId = noteArgs.taskId;
  } else {
    // Use current task from store
    const currentTask = store.currentTask();
    if (!currentTask) {
      const errorMsg = "No current task. Specify a task ID: /note <task-id> <content>";
      store.addLog(errorMsg, "error", "system");
      return {
        success: false,
        message: errorMsg,
        error: "NO_CURRENT_TASK",
      };
    }
    taskId = currentTask.id;
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

  // Add the note via PRD manager
  const result = manager.updateNote({
    taskId,
    note: content,
    append: options.append !== false, // Default to true
  });

  if (result.success) {
    // Log success
    store.addLog(
      `✓ Added note to ${taskId}: ${content.length > 50 ? content.slice(0, 50) + "..." : content}`,
      "success",
      "system"
    );

    return {
      success: true,
      message: result.message,
      data: {
        taskId,
        content,
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
 * Handle /note command from raw input string
 *
 * Convenience function for direct command handling.
 *
 * @param input Raw command input (e.g., "/note This is context")
 * @returns Command result
 */
export async function handleNoteCommand(input: string): Promise<CommandResult> {
  return executeNoteCommand({ input });
}

/**
 * Add a note to a task with explicit parameters
 *
 * Convenience function for programmatic note addition.
 *
 * @param content Note content
 * @param options Additional options
 * @returns Command result
 */
export async function addNote(
  content: string,
  options: {
    taskId?: string;
    append?: boolean;
    prdManager?: PrdManager;
  } = {}
): Promise<CommandResult> {
  const args: NoteCommandArgs = { content };
  if (options.taskId !== undefined) {
    args.taskId = options.taskId;
  }

  // Build options conditionally to satisfy exactOptionalPropertyTypes
  const execOptions: NoteCommandOptions = { args };
  if (options.append !== undefined) {
    execOptions.append = options.append;
  }
  if (options.prdManager !== undefined) {
    execOptions.prdManager = options.prdManager;
  }

  return executeNoteCommand(execOptions);
}

/**
 * Add a note to the current task
 *
 * Convenience function for adding notes while Claude works.
 *
 * @param content Note content
 * @param append Whether to append (default: true)
 * @returns Command result
 */
export async function addNoteToCurrentTask(
  content: string,
  append: boolean = true
): Promise<CommandResult> {
  return executeNoteCommand({
    args: { content },
    append,
  });
}

/**
 * Validate note command input without executing
 *
 * Useful for UI validation before submission.
 *
 * @param input Raw command input
 * @returns Validation result with parsed args if valid
 */
export function validateNoteInput(input: string): {
  valid: boolean;
  args?: NoteCommandArgs;
  error?: string;
} {
  const parsed = parseCommand(input);

  if (!parsed.isCommand || parsed.name !== "note") {
    return {
      valid: false,
      error: "Not a /note command",
    };
  }

  const validationError = validateCommand(parsed);
  if (validationError) {
    return {
      valid: false,
      error: validationError.message ?? "Unknown validation error",
    };
  }

  const args = parseNoteArgs(parsed);
  if (!args || !args.content || args.content.trim() === "") {
    return {
      valid: false,
      error: "Note content is required",
    };
  }

  return {
    valid: true,
    args,
  };
}

/**
 * Get help text for the /note command
 */
export function getNoteHelp(): string {
  return `
/note <content>
/note <task-id> <content>

Add a note to a task in the current PRD.

Arguments:
  content   The note content (required)
  task-id   Optional task ID (defaults to current task)

Examples:
  /note User requested this feature
  /note Consider edge case for empty input
  /note impl-045 Blocked by API rate limits
  /note "Multiple words in quotes work too"

Notes:
  - Notes are appended with a timestamp automatically
  - Format: [YYYY-MM-DD HH:MM:SS] <note content>
  - If no task ID is specified, the note is added to the current task
  - Useful for adding context while Claude works
`.trim();
}
