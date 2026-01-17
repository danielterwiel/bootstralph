/**
 * TUI State Store with SolidJS Signals
 *
 * Reactive state management for the Ralph TUI using SolidJS signals.
 * This store manages all TUI state including logs, task progress,
 * pause state, input history, and the current PRD.
 */

import { createSignal, createMemo, batch } from "solid-js";
import type { Prd, UserStory } from "../../ralph/prd-schema.js";

/**
 * Log entry in the TUI log pane
 */
export interface LogEntry {
  /** Unique ID for the log entry */
  id: string;
  /** Timestamp when the log was created */
  timestamp: Date;
  /** Log level for styling */
  level: "info" | "warn" | "error" | "success" | "debug" | "stdout" | "stderr";
  /** Log message content (may include ANSI codes) */
  message: string;
  /** Optional source identifier (e.g., "claude", "system", "user") */
  source?: string;
}

/**
 * Progress tracking for the current PRD
 */
export interface Progress {
  /** Number of completed tasks */
  completed: number;
  /** Total number of tasks */
  total: number;
  /** Current iteration number in the Ralph loop */
  iteration: number;
  /** Maximum iterations allowed */
  maxIterations: number;
}

/**
 * Current task being worked on
 */
export interface CurrentTask {
  /** Task ID (e.g., "impl-038") */
  id: string;
  /** Task title */
  title: string;
  /** Task description */
  description?: string;
  /** When the task started */
  startedAt: Date;
}

/**
 * Input history entry for command history navigation
 */
export interface InputHistoryEntry {
  /** The input command */
  command: string;
  /** When the command was entered */
  timestamp: Date;
}

/** Maximum number of logs to keep in memory to avoid CPU issues */
const MAX_LOGS = 500;

/** Maximum input history entries */
const MAX_INPUT_HISTORY = 100;

/** Generate unique ID for log entries */
let logIdCounter = 0;
function generateLogId(): string {
  return `log-${Date.now()}-${++logIdCounter}`;
}

// ============================================================================
// Signals
// ============================================================================

/** Logs displayed in the log pane */
const [logs, setLogs] = createSignal<LogEntry[]>([]);

/** Current task being worked on */
const [currentTask, setCurrentTask] = createSignal<CurrentTask | null>(null);

/** Whether the Ralph loop is paused */
const [isPaused, setIsPaused] = createSignal(false);

/** Progress tracking */
const [progress, setProgress] = createSignal<Progress>({
  completed: 0,
  total: 0,
  iteration: 0,
  maxIterations: 10,
});

/** Input history for command recall */
const [inputHistory, setInputHistory] = createSignal<InputHistoryEntry[]>([]);

/** Current PRD being worked on */
const [currentPrd, setCurrentPrd] = createSignal<Prd | null>(null);

/** Current PRD filename */
const [currentPrdFile, setCurrentPrdFile] = createSignal<string | null>(null);

/** Whether auto-scroll is enabled for the log pane */
const [autoScroll, setAutoScroll] = createSignal(true);

/** Whether the TUI is running (for cleanup) */
const [isRunning, setIsRunning] = createSignal(false);

// ============================================================================
// Derived State (Memos)
// ============================================================================

/** Progress percentage (0-100) */
const progressPercentage = createMemo(() => {
  const p = progress();
  return p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
});

/** Whether there are pending tasks */
const hasPendingTasks = createMemo(() => {
  const p = progress();
  return p.completed < p.total;
});

/** Status text for the status bar */
const statusText = createMemo(() => {
  if (isPaused()) return "PAUSED";
  if (!isRunning()) return "STOPPED";
  return "RUNNING";
});

/** Get the next task from the current PRD */
const nextTask = createMemo((): UserStory | null => {
  const prd = currentPrd();
  if (!prd) return null;

  const incomplete = prd.userStories
    .filter((story) => !story.passes)
    .filter((story) => {
      if (!story.dependsOn || story.dependsOn.length === 0) return true;
      return story.dependsOn.every((depId) => {
        const dep = prd.userStories.find((s) => s.id === depId);
        return dep?.passes === true;
      });
    })
    .sort((a, b) => a.priority - b.priority);

  return incomplete[0] ?? null;
});

// ============================================================================
// Actions
// ============================================================================

/**
 * Add a log entry to the log pane
 */
function addLog(
  message: string,
  level: LogEntry["level"] = "info",
  source?: string
): void {
  const entry: LogEntry = {
    id: generateLogId(),
    timestamp: new Date(),
    level,
    message,
    ...(source !== undefined && { source }),
  };

  setLogs((prev) => {
    const newLogs = [...prev, entry];
    // Limit logs to prevent memory issues
    if (newLogs.length > MAX_LOGS) {
      return newLogs.slice(newLogs.length - MAX_LOGS);
    }
    return newLogs;
  });
}

/**
 * Add multiple log entries at once (for streaming output)
 */
function addLogs(entries: Array<{ message: string; level?: LogEntry["level"]; source?: string }>): void {
  const newEntries: LogEntry[] = entries.map((e) => ({
    id: generateLogId(),
    timestamp: new Date(),
    level: e.level ?? "info",
    message: e.message,
    ...(e.source !== undefined && { source: e.source }),
  }));

  setLogs((prev) => {
    const combined = [...prev, ...newEntries];
    if (combined.length > MAX_LOGS) {
      return combined.slice(combined.length - MAX_LOGS);
    }
    return combined;
  });
}

/**
 * Clear all logs
 */
function clearLogs(): void {
  setLogs([]);
}

/**
 * Set the current task being worked on
 */
function startTask(id: string, title: string, description?: string): void {
  const task: CurrentTask = {
    id,
    title,
    startedAt: new Date(),
    ...(description !== undefined && { description }),
  };
  setCurrentTask(task);
  addLog(`Started task: ${id} - ${title}`, "info", "system");
}

/**
 * Complete the current task
 */
function completeTask(): void {
  const task = currentTask();
  if (task) {
    addLog(`Completed task: ${task.id}`, "success", "system");
    setCurrentTask(null);
    setProgress((prev) => ({
      ...prev,
      completed: prev.completed + 1,
    }));
  }
}

/**
 * Skip the current task
 */
function skipTask(reason?: string): void {
  const task = currentTask();
  if (task) {
    addLog(
      `Skipped task: ${task.id}${reason ? ` (${reason})` : ""}`,
      "warn",
      "system"
    );
    setCurrentTask(null);
  }
}

/**
 * Pause the Ralph loop
 */
function pause(): void {
  if (!isPaused()) {
    setIsPaused(true);
    addLog("Ralph loop paused", "warn", "system");
  }
}

/**
 * Resume the Ralph loop
 */
function resume(): void {
  if (isPaused()) {
    setIsPaused(false);
    addLog("Ralph loop resumed", "info", "system");
  }
}

/**
 * Toggle pause state
 */
function togglePause(): void {
  if (isPaused()) {
    resume();
  } else {
    pause();
  }
}

/**
 * Update progress from PRD
 */
function updateProgressFromPrd(prd: Prd): void {
  const total = prd.userStories.length;
  const completed = prd.userStories.filter((s) => s.passes).length;

  setProgress((prev) => ({
    ...prev,
    completed,
    total,
  }));
}

/**
 * Increment iteration counter
 */
function incrementIteration(): void {
  setProgress((prev) => ({
    ...prev,
    iteration: prev.iteration + 1,
  }));
}

/**
 * Set max iterations
 */
function setMaxIterations(max: number): void {
  setProgress((prev) => ({
    ...prev,
    maxIterations: max,
  }));
}

/**
 * Reset iteration counter
 */
function resetIteration(): void {
  setProgress((prev) => ({
    ...prev,
    iteration: 0,
  }));
}

/**
 * Add a command to input history
 */
function addToHistory(command: string): void {
  if (!command.trim()) return;

  setInputHistory((prev) => {
    // Don't add duplicate of last command
    if (prev.length > 0 && prev[prev.length - 1]?.command === command) {
      return prev;
    }

    const entry: InputHistoryEntry = {
      command,
      timestamp: new Date(),
    };

    const newHistory = [...prev, entry];
    if (newHistory.length > MAX_INPUT_HISTORY) {
      return newHistory.slice(newHistory.length - MAX_INPUT_HISTORY);
    }
    return newHistory;
  });
}

/**
 * Get command from history by index (0 = most recent)
 */
function getHistoryCommand(index: number): string | null {
  const history = inputHistory();
  const actualIndex = history.length - 1 - index;
  if (actualIndex < 0 || actualIndex >= history.length) {
    return null;
  }
  return history[actualIndex]?.command ?? null;
}

/**
 * Load a PRD into the store
 */
function loadPrd(prd: Prd, filename: string): void {
  batch(() => {
    setCurrentPrd(prd);
    setCurrentPrdFile(filename);
    updateProgressFromPrd(prd);
    addLog(`Loaded PRD: ${prd.name}`, "info", "system");
  });
}

/**
 * Update the current PRD (after file changes)
 */
function updatePrd(prd: Prd): void {
  batch(() => {
    setCurrentPrd(prd);
    updateProgressFromPrd(prd);
  });
}

/**
 * Unload the current PRD
 */
function unloadPrd(): void {
  batch(() => {
    setCurrentPrd(null);
    setCurrentPrdFile(null);
    setCurrentTask(null);
    setProgress({
      completed: 0,
      total: 0,
      iteration: 0,
      maxIterations: 10,
    });
  });
}

/**
 * Start the TUI
 */
function start(): void {
  setIsRunning(true);
  addLog("TUI started", "info", "system");
}

/**
 * Stop the TUI
 */
function stop(): void {
  setIsRunning(false);
  addLog("TUI stopped", "info", "system");
}

/**
 * Reset all state
 */
function reset(): void {
  batch(() => {
    setLogs([]);
    setCurrentTask(null);
    setIsPaused(false);
    setProgress({
      completed: 0,
      total: 0,
      iteration: 0,
      maxIterations: 10,
    });
    setInputHistory([]);
    setCurrentPrd(null);
    setCurrentPrdFile(null);
    setAutoScroll(true);
    setIsRunning(false);
  });
}

// ============================================================================
// Store Export
// ============================================================================

/**
 * The TUI store containing all state and actions
 */
export const store = {
  // State (signals)
  logs,
  currentTask,
  isPaused,
  progress,
  inputHistory,
  currentPrd,
  currentPrdFile,
  autoScroll,
  isRunning,

  // Derived state (memos)
  progressPercentage,
  hasPendingTasks,
  statusText,
  nextTask,

  // Actions
  addLog,
  addLogs,
  clearLogs,
  startTask,
  completeTask,
  skipTask,
  pause,
  resume,
  togglePause,
  updateProgressFromPrd,
  incrementIteration,
  setMaxIterations,
  resetIteration,
  addToHistory,
  getHistoryCommand,
  loadPrd,
  updatePrd,
  unloadPrd,
  start,
  stop,
  reset,

  // Direct setters for advanced use
  setAutoScroll,
  setIsPaused,
  setCurrentTask,
  setProgress,
} as const;

// Re-export types
export type { Prd, UserStory };
