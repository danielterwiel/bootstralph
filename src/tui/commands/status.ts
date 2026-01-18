/**
 * /status Command Handler
 *
 * Displays formatted PRD progress and current task details.
 * This is a read-only command that does not modify the PRD.
 *
 * Usage: /status [task-id] [-v|--verbose]
 *
 * The handler:
 * 1. Retrieves progress from the PRD manager
 * 2. Shows total, completed, pending, and current task details
 * 3. Optionally shows detailed info for a specific task
 * 4. Logs the status to the TUI log pane
 */

import type { CommandResult, StatusCommandArgs } from "./types.js";
import { parseStatusArgs, parseCommand, validateCommand } from "./parser.js";
import { PrdManager, getDefaultPrdManager } from "../../ralph/prd-manager.js";
import type { ImplementationTask } from "../../ralph/prd-manager.js";
import type { UserStory } from "../../ralph/prd-schema.js";
import { store } from "../state/store.js";

/**
 * Options for executing the status command
 */
export interface StatusCommandOptions {
  /** Raw input string (e.g., "/status" or "/status impl-043") */
  input?: string;
  /** Pre-parsed arguments (if already parsed) */
  args?: StatusCommandArgs;
  /** Custom PRD manager (defaults to singleton) */
  prdManager?: PrdManager;
  /** Whether to show status in logs (default: true) */
  showInLogs?: boolean;
}

/**
 * Status information returned by the command
 */
export interface StatusInfo {
  /** PRD name */
  prdName: string;
  /** PRD status */
  prdStatus: string;
  /** Total number of tasks */
  total: number;
  /** Completed tasks count */
  completed: number;
  /** Pending tasks count */
  pending: number;
  /** In-progress tasks count */
  inProgress: number;
  /** Completion percentage */
  percentage: number;
  /** Current task details (if any) */
  currentTask?: {
    id: string;
    title: string;
    status: string;
    elapsedTime?: string;
  };
  /** Specific task details (if requested) */
  taskDetails?: {
    id: string;
    title: string;
    status: string;
    phase?: number;
    priority?: number;
    notes?: string;
    files?: string[];
    description?: string;
    startedAt?: string;
    completedAt?: string;
  };
  /** Review tasks summary (if verbose) */
  reviewSummary?: {
    total: number;
    completed: number;
    pending: number;
  };
}

/**
 * Format elapsed time as human-readable string
 */
function formatElapsedTime(startDate: Date | string): string {
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const now = new Date();
  const elapsedMs = now.getTime() - start.getTime();

  const seconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format status info as a display string
 */
function formatStatusDisplay(info: StatusInfo, verbose: boolean): string {
  const lines: string[] = [];

  // Header
  lines.push("═══════════════════════════════════════");
  lines.push(`  PRD: ${info.prdName}`);
  lines.push(`  Status: ${info.prdStatus.toUpperCase()}`);
  lines.push("═══════════════════════════════════════");

  // Progress summary
  lines.push("");
  lines.push("Progress:");
  const progressBar = buildProgressBar(info.percentage, 30);
  lines.push(`  ${progressBar} ${info.percentage}%`);
  lines.push(`  Completed: ${info.completed}/${info.total}`);
  lines.push(`  Pending: ${info.pending}`);
  if (info.inProgress > 0) {
    lines.push(`  In Progress: ${info.inProgress}`);
  }

  // Current task
  if (info.currentTask) {
    lines.push("");
    lines.push("Current Task:");
    lines.push(`  ID: ${info.currentTask.id}`);
    lines.push(`  Title: ${info.currentTask.title}`);
    lines.push(`  Status: ${info.currentTask.status}`);
    if (info.currentTask.elapsedTime) {
      lines.push(`  Elapsed: ${info.currentTask.elapsedTime}`);
    }
  }

  // Specific task details (if requested)
  if (info.taskDetails) {
    lines.push("");
    lines.push(`Task Details: ${info.taskDetails.id}`);
    lines.push(`  Title: ${info.taskDetails.title}`);
    lines.push(`  Status: ${info.taskDetails.status}`);
    if (info.taskDetails.phase !== undefined) {
      lines.push(`  Phase: ${info.taskDetails.phase}`);
    }
    if (info.taskDetails.priority !== undefined) {
      lines.push(`  Priority: ${info.taskDetails.priority}`);
    }
    if (info.taskDetails.description) {
      lines.push(`  Description: ${info.taskDetails.description}`);
    }
    if (info.taskDetails.files && info.taskDetails.files.length > 0) {
      lines.push(`  Files: ${info.taskDetails.files.join(", ")}`);
    }
    if (info.taskDetails.startedAt) {
      lines.push(`  Started: ${info.taskDetails.startedAt}`);
    }
    if (info.taskDetails.completedAt) {
      lines.push(`  Completed: ${info.taskDetails.completedAt}`);
    }
    if (info.taskDetails.notes) {
      lines.push(`  Notes:`);
      const noteLines = info.taskDetails.notes.split("\n");
      for (const noteLine of noteLines) {
        lines.push(`    ${noteLine}`);
      }
    }
  }

  // Review summary (verbose mode)
  if (verbose && info.reviewSummary) {
    lines.push("");
    lines.push("Review Tasks:");
    lines.push(`  Total: ${info.reviewSummary.total}`);
    lines.push(`  Completed: ${info.reviewSummary.completed}`);
    lines.push(`  Pending: ${info.reviewSummary.pending}`);
  }

  lines.push("");
  lines.push("───────────────────────────────────────");

  return lines.join("\n");
}

/**
 * Build a text-based progress bar
 */
function buildProgressBar(percentage: number, width: number): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Get task title (handles both ImplementationTask and UserStory)
 */
function getTaskTitle(task: ImplementationTask | UserStory): string {
  if ("task" in task) {
    return task.task;
  }
  return task.title;
}

/**
 * Get task status (handles both ImplementationTask and UserStory)
 */
function getTaskStatus(task: ImplementationTask | UserStory): string {
  if ("status" in task) {
    return task.status;
  }
  return task.passes ? "completed" : "pending";
}

/**
 * Execute the /status command
 *
 * Displays PRD progress and optionally specific task details.
 *
 * @param options Command options
 * @returns Command result with status info
 */
export async function executeStatusCommand(
  options: StatusCommandOptions = {}
): Promise<CommandResult> {
  const showInLogs = options.showInLogs !== false;

  // Parse arguments if input provided
  let statusArgs: StatusCommandArgs = options.args ?? {};

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

    // Ensure it's actually a status command
    if (parsed.name !== "status") {
      const errorMsg = `Expected /status command, got /${parsed.name}`;
      if (showInLogs) {
        store.addLog(errorMsg, "error", "system");
      }
      return {
        success: false,
        message: errorMsg,
        error: "WRONG_COMMAND",
      };
    }

    statusArgs = parseStatusArgs(parsed);
  }

  // Get PRD manager
  const manager = options.prdManager ?? getDefaultPrdManager();

  // Check if PRD is loaded
  const prd = manager.getPrd();
  if (!prd) {
    const errorMsg = "No PRD loaded. Use 'ralph' command to load a PRD.";
    if (showInLogs) {
      store.addLog(errorMsg, "warn", "system");
    }
    return {
      success: false,
      message: errorMsg,
      error: "NO_PRD_LOADED",
    };
  }

  // Get progress info
  const progress = manager.getProgress();
  const allTasks = manager.getAllTasks();
  const inProgressCount = allTasks.filter(
    (t) => "status" in t && t.status === "in_progress"
  ).length;

  // Build status info
  const statusInfo: StatusInfo = {
    prdName: prd.name,
    prdStatus: prd.status ?? "unknown",
    total: progress.total,
    completed: progress.completed,
    pending: progress.remaining,
    inProgress: inProgressCount,
    percentage: progress.percentage,
  };

  // Get current task from store
  const currentTask = store.currentTask();
  if (currentTask) {
    statusInfo.currentTask = {
      id: currentTask.id,
      title: currentTask.title,
      status: "in_progress",
      elapsedTime: formatElapsedTime(currentTask.startedAt),
    };
  }

  // Get specific task details if requested
  if (statusArgs.taskId) {
    const task = manager.getTask(statusArgs.taskId);
    if (task) {
      const details: StatusInfo["taskDetails"] = {
        id: task.id,
        title: getTaskTitle(task),
        status: getTaskStatus(task),
      };

      // Add implementation task specific fields
      if ("phase" in task) {
        const implTask = task as ImplementationTask;
        details.phase = implTask.phase;
        if (implTask.files) {
          details.files = implTask.files;
        }
        if (implTask.description) {
          details.description = implTask.description;
        }
        if (implTask.startedAt) {
          details.startedAt = implTask.startedAt;
        }
        if (implTask.completedAt) {
          details.completedAt = implTask.completedAt;
        }
      }

      // Add user story specific fields
      if ("priority" in task) {
        const story = task as UserStory;
        details.priority = story.priority;
        if (story.startedAt) {
          details.startedAt = story.startedAt;
        }
        if (story.completedAt) {
          details.completedAt = story.completedAt;
        }
      }

      // Add notes if present
      if (task.notes) {
        details.notes = task.notes;
      }

      statusInfo.taskDetails = details;
    } else {
      if (showInLogs) {
        store.addLog(`Task not found: ${statusArgs.taskId}`, "warn", "system");
      }
    }
  }

  // Get review summary if verbose
  if (statusArgs.verbose) {
    const reviewTasks = manager.getReviewTasks();
    const pendingReviews = manager.getPendingReviewTasks();
    statusInfo.reviewSummary = {
      total: reviewTasks.length,
      completed: reviewTasks.length - pendingReviews.length,
      pending: pendingReviews.length,
    };
  }

  // Format and display status
  const displayStr = formatStatusDisplay(statusInfo, statusArgs.verbose ?? false);

  if (showInLogs) {
    // Log each line separately for better readability
    const lines = displayStr.split("\n");
    for (const line of lines) {
      store.addLog(line, "info", "status");
    }
  }

  return {
    success: true,
    message: `PRD: ${statusInfo.prdName} - ${statusInfo.completed}/${statusInfo.total} (${statusInfo.percentage}%)`,
    data: statusInfo,
  };
}

/**
 * Handle /status command from raw input string
 *
 * Convenience function for direct command handling.
 *
 * @param input Raw command input (e.g., "/status" or "/status impl-043")
 * @returns Command result
 */
export async function handleStatusCommand(input: string): Promise<CommandResult> {
  return executeStatusCommand({ input });
}

/**
 * Get PRD status programmatically
 *
 * Direct API for getting status without command parsing.
 *
 * @param options Additional options
 * @returns Status info or null if no PRD loaded
 */
export async function getStatus(options: {
  taskId?: string;
  verbose?: boolean;
  prdManager?: PrdManager;
  showInLogs?: boolean;
} = {}): Promise<StatusInfo | null> {
  const args: StatusCommandArgs = {};
  if (options.taskId !== undefined) {
    args.taskId = options.taskId;
  }
  if (options.verbose !== undefined) {
    args.verbose = options.verbose;
  }

  // Build options conditionally to satisfy exactOptionalPropertyTypes
  const execOptions: StatusCommandOptions = {
    args,
    showInLogs: options.showInLogs ?? false,
  };
  if (options.prdManager !== undefined) {
    execOptions.prdManager = options.prdManager;
  }

  const result = await executeStatusCommand(execOptions);

  if (result.success && result.data) {
    return result.data as StatusInfo;
  }
  return null;
}

/**
 * Validate status command input without executing
 *
 * Useful for UI validation before submission.
 *
 * @param input Raw command input
 * @returns Validation result with parsed args if valid
 */
export function validateStatusInput(input: string): {
  valid: boolean;
  args?: StatusCommandArgs;
  error?: string;
} {
  const parsed = parseCommand(input);

  if (!parsed.isCommand || parsed.name !== "status") {
    return {
      valid: false,
      error: "Not a /status command",
    };
  }

  const validationError = validateCommand(parsed);
  if (validationError) {
    return {
      valid: false,
      error: validationError.message ?? "Unknown validation error",
    };
  }

  const args = parseStatusArgs(parsed);

  return {
    valid: true,
    args,
  };
}

/**
 * Get help text for the /status command
 */
export function getStatusHelp(): string {
  return `
/status [task-id] [-v|--verbose]

Display PRD progress and current task details.

Arguments:
  task-id   Optional task ID to show detailed info for
  -v        Show verbose status including review tasks summary
  --verbose Same as -v

Examples:
  /status
  /status impl-043
  /status -v
  /status impl-043 --verbose

Output includes:
  - PRD name and overall status
  - Progress bar with percentage
  - Completed, pending, and in-progress task counts
  - Current task details (if any)
  - Specific task details (if task ID provided)
  - Review task summary (if verbose mode)

Notes:
  - This is a read-only command that does not modify the PRD
  - Task ID can be any valid ID (impl-XXX, US-XXX, review-XXX)
  - Verbose mode adds review task statistics
`.trim();
}
