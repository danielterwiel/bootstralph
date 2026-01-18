/**
 * /pause and /resume Command Handlers
 *
 * Controls the Ralph loop execution state.
 *
 * /pause - Pauses the Ralph loop between iterations
 * /resume - Resumes a paused Ralph loop
 *
 * The engine checks isPaused signal between iterations and waits
 * while paused. This allows users to:
 * - Review Claude's output before proceeding
 * - Add notes or modify priorities mid-execution
 * - Take a break without losing progress
 */

import type { CommandResult } from "./types.js";
import { parseCommand, validateCommand } from "./parser.js";
import { store } from "../state/store.js";

/**
 * Options for executing pause/resume commands
 */
export interface PauseCommandOptions {
  /** Raw input string (e.g., "/pause" or "/resume") */
  input?: string;
  /** Whether to show status in logs (default: true) */
  showInLogs?: boolean;
}

/**
 * Execute the /pause command
 *
 * Pauses the Ralph loop. The engine will stop executing after
 * the current iteration completes.
 *
 * @param options Command options
 * @returns Command result with success status and message
 */
export async function executePauseCommand(
  options: PauseCommandOptions = {}
): Promise<CommandResult> {
  const showInLogs = options.showInLogs !== false;

  // If input provided, validate it
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

    // Ensure it's actually a pause command
    if (parsed.name !== "pause") {
      const errorMsg = `Expected /pause command, got /${parsed.name}`;
      if (showInLogs) {
        store.addLog(errorMsg, "error", "system");
      }
      return {
        success: false,
        message: errorMsg,
        error: "WRONG_COMMAND",
      };
    }
  }

  // Check if already paused
  if (store.isPaused()) {
    const message = "Ralph loop is already paused";
    if (showInLogs) {
      store.addLog(message, "warn", "system");
    }
    return {
      success: true,
      message,
      data: { alreadyPaused: true },
    };
  }

  // Check if TUI is running
  if (!store.isRunning()) {
    const message = "Ralph loop is not running";
    if (showInLogs) {
      store.addLog(message, "warn", "system");
    }
    return {
      success: false,
      message,
      error: "NOT_RUNNING",
    };
  }

  // Pause the loop
  store.pause();

  const message = "Ralph loop paused. Use /resume to continue.";
  return {
    success: true,
    message,
    data: { paused: true },
  };
}

/**
 * Execute the /resume command
 *
 * Resumes a paused Ralph loop. The engine will continue
 * executing from where it left off.
 *
 * @param options Command options
 * @returns Command result with success status and message
 */
export async function executeResumeCommand(
  options: PauseCommandOptions = {}
): Promise<CommandResult> {
  const showInLogs = options.showInLogs !== false;

  // If input provided, validate it
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

    // Ensure it's actually a resume command
    if (parsed.name !== "resume") {
      const errorMsg = `Expected /resume command, got /${parsed.name}`;
      if (showInLogs) {
        store.addLog(errorMsg, "error", "system");
      }
      return {
        success: false,
        message: errorMsg,
        error: "WRONG_COMMAND",
      };
    }
  }

  // Check if already running (not paused)
  if (!store.isPaused()) {
    const message = "Ralph loop is not paused";
    if (showInLogs) {
      store.addLog(message, "warn", "system");
    }
    return {
      success: true,
      message,
      data: { alreadyRunning: true },
    };
  }

  // Resume the loop
  store.resume();

  const message = "Ralph loop resumed";
  return {
    success: true,
    message,
    data: { resumed: true },
  };
}

/**
 * Handle /pause command from raw input string
 *
 * Convenience function for direct command handling.
 *
 * @param input Raw command input (e.g., "/pause")
 * @returns Command result
 */
export async function handlePauseCommand(input: string): Promise<CommandResult> {
  return executePauseCommand({ input });
}

/**
 * Handle /resume command from raw input string
 *
 * Convenience function for direct command handling.
 *
 * @param input Raw command input (e.g., "/resume")
 * @returns Command result
 */
export async function handleResumeCommand(input: string): Promise<CommandResult> {
  return executeResumeCommand({ input });
}

/**
 * Pause the Ralph loop programmatically
 *
 * Direct API for pausing without command parsing.
 *
 * @param showInLogs Whether to show status in logs
 * @returns Command result
 */
export async function pauseRalph(showInLogs = true): Promise<CommandResult> {
  return executePauseCommand({ showInLogs });
}

/**
 * Resume the Ralph loop programmatically
 *
 * Direct API for resuming without command parsing.
 *
 * @param showInLogs Whether to show status in logs
 * @returns Command result
 */
export async function resumeRalph(showInLogs = true): Promise<CommandResult> {
  return executeResumeCommand({ showInLogs });
}

/**
 * Toggle the pause state
 *
 * If paused, resume. If running, pause.
 *
 * @param showInLogs Whether to show status in logs
 * @returns Command result
 */
export async function togglePause(showInLogs = true): Promise<CommandResult> {
  if (store.isPaused()) {
    return resumeRalph(showInLogs);
  }
  return pauseRalph(showInLogs);
}

/**
 * Check if Ralph loop is currently paused
 *
 * @returns Whether the loop is paused
 */
export function isPaused(): boolean {
  return store.isPaused();
}

/**
 * Get help text for the /pause command
 */
export function getPauseHelp(): string {
  return `
/pause

Pause the Ralph loop after the current iteration completes.

Usage:
  /pause

Notes:
  - The current task will finish before pausing
  - Use /resume to continue execution
  - Useful for reviewing output or making manual changes
  - You can still use other commands while paused
`.trim();
}

/**
 * Get help text for the /resume command
 */
export function getResumeHelp(): string {
  return `
/resume

Resume a paused Ralph loop.

Usage:
  /resume

Notes:
  - Only works when the loop is paused
  - Execution continues from where it left off
  - The next pending task will be picked up automatically
`.trim();
}
