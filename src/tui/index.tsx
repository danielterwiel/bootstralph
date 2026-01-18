/** @jsxImportSource @opentui/solid */
/**
 * TUI Entry Point
 *
 * Main entry point for the Ralph TUI. Provides functions to start and stop
 * the terminal user interface, as well as exports for all TUI components.
 *
 * Usage:
 * ```typescript
 * import { startTui, stopTui } from "./tui/index.js";
 *
 * // Start the TUI with command handler
 * const cleanup = await startTui({
 *   onCommand: (cmd) => console.log("Command:", cmd),
 *   title: "My Ralph Loop",
 * });
 *
 * // Later, stop the TUI
 * cleanup();
 * ```
 */

import { render } from "@opentui/solid";
import { App, MinimalApp } from "./App.js";
import type { AppProps } from "./App.js";
import { store } from "./state/store.js";
import type { Prd } from "../ralph/prd-schema.js";

// Re-export components for external use
export { App, MinimalApp, FullApp } from "./App.js";
export type { AppProps } from "./App.js";

// Re-export store and types
export { store } from "./state/store.js";
export type { LogEntry, Progress, CurrentTask, InputHistoryEntry } from "./state/store.js";

// Re-export individual components
export { LogPane, LogPaneWithControls } from "./components/LogPane.js";
export type { LogPaneProps } from "./components/LogPane.js";

export { StatusBar, CompactStatusBar, StatusBarWithPrd } from "./components/StatusBar.js";
export type { StatusBarProps } from "./components/StatusBar.js";

export { InputBar, InputBarWithSuggestions, CompactInputBar } from "./components/InputBar.js";
export type { InputBarProps } from "./components/InputBar.js";

/**
 * Options for starting the TUI
 */
export interface TuiOptions extends AppProps {
  /** PRD to load on start */
  prd?: Prd | undefined;
  /** PRD filename */
  prdFile?: string | undefined;
  /** Maximum iterations for the Ralph loop */
  maxIterations?: number | undefined;
  /** Enable debug logging */
  debug?: boolean | undefined;
}

/**
 * Result from starting the TUI
 */
export interface TuiInstance {
  /** Stop and cleanup the TUI */
  stop: () => void;
  /** Reference to the store for external control */
  store: typeof store;
  /** Promise that resolves when the TUI exits */
  exitPromise: Promise<void>;
}

/** Track whether TUI is running */
let isRunning = false;

/** Promise resolver for controlled exit */
let exitResolver: (() => void) | null = null;

/**
 * Start the Ralph TUI
 *
 * Renders the TUI application and returns a control interface.
 * The TUI will run until stop() is called or the process exits.
 *
 * @param options - TUI configuration options
 * @returns TUI instance with stop function and store reference
 *
 * @example
 * ```typescript
 * const tui = startTui({
 *   onCommand: handleCommand,
 *   title: "Ralph Loop",
 *   prd: loadedPrd,
 *   prdFile: "prd.json",
 * });
 *
 * // Stop when done
 * tui.stop();
 *
 * // Or wait for TUI to exit
 * await tui.exitPromise;
 * ```
 */
export function startTui(options: TuiOptions = {}): TuiInstance {
  // Stop any existing TUI
  if (isRunning) {
    stopTui();
  }

  // Reset store state
  store.reset();
  isRunning = true;

  // Set max iterations if provided
  if (options.maxIterations !== undefined) {
    store.setMaxIterations(options.maxIterations);
  }

  // Load PRD if provided
  if (options.prd && options.prdFile) {
    store.loadPrd(options.prd, options.prdFile);
  }

  // Enable debug logging if requested
  if (options.debug) {
    store.addLog("Debug mode enabled", "debug", "system");
  }

  // Create exit promise for controlled shutdown
  const exitPromise = new Promise<void>((resolve) => {
    exitResolver = resolve;
  });

  // Build props conditionally to satisfy exactOptionalPropertyTypes
  const appProps: AppProps = {};
  if (options.onCommand !== undefined) {
    appProps.onCommand = options.onCommand;
  }
  if (options.showPrdInfo !== undefined) {
    appProps.showPrdInfo = options.showPrdInfo;
  }
  if (options.showLogControls !== undefined) {
    appProps.showLogControls = options.showLogControls;
  }
  if (options.showSuggestions !== undefined) {
    appProps.showSuggestions = options.showSuggestions;
  }
  if (options.title !== undefined) {
    appProps.title = options.title;
  }

  // Create the app element
  const appElement = () => <App {...appProps} />;

  // Render the app (fire and forget - OpenTUI manages the lifecycle)
  render(appElement).catch((err) => {
    store.addLog(`Render error: ${err}`, "error", "system");
  });

  return {
    stop: () => stopTui(),
    store,
    exitPromise,
  };
}

/**
 * Start a minimal TUI (no PRD info, no suggestions)
 *
 * @param onCommand - Command handler callback
 * @returns TUI instance
 */
export function startMinimalTui(
  onCommand?: (command: string) => void
): TuiInstance {
  // Stop any existing TUI
  if (isRunning) {
    stopTui();
  }

  // Reset store state
  store.reset();
  isRunning = true;

  // Create exit promise
  const exitPromise = new Promise<void>((resolve) => {
    exitResolver = resolve;
  });

  // Build props conditionally
  const appProps: Pick<AppProps, "onCommand"> = {};
  if (onCommand !== undefined) {
    appProps.onCommand = onCommand;
  }

  // Create the minimal app element
  const appElement = () => <MinimalApp {...appProps} />;

  // Render the app
  render(appElement).catch((err) => {
    store.addLog(`Render error: ${err}`, "error", "system");
  });

  return {
    stop: () => stopTui(),
    store,
    exitPromise,
  };
}

/**
 * Stop the TUI and cleanup resources
 */
export function stopTui(): void {
  if (isRunning) {
    store.stop();
    isRunning = false;

    // Resolve the exit promise
    if (exitResolver) {
      exitResolver();
      exitResolver = null;
    }
  }
}

/**
 * Check if the TUI is currently running
 */
export function isTuiRunning(): boolean {
  return isRunning && store.isRunning();
}

// ============================================================================
// Convenience functions for controlling the TUI from outside
// ============================================================================

/**
 * Add a log message to the TUI
 */
export function tuiLog(
  message: string,
  level: "info" | "warn" | "error" | "success" | "debug" | "stdout" | "stderr" = "info",
  source?: string
): void {
  store.addLog(message, level, source);
}

/**
 * Update the current task in the TUI
 */
export function tuiStartTask(id: string, title: string, description?: string): void {
  store.startTask(id, title, description);
}

/**
 * Mark the current task as complete
 */
export function tuiCompleteTask(): void {
  store.completeTask();
}

/**
 * Skip the current task
 */
export function tuiSkipTask(reason?: string): void {
  store.skipTask(reason);
}

/**
 * Pause the Ralph loop
 */
export function tuiPause(): void {
  store.pause();
}

/**
 * Resume the Ralph loop
 */
export function tuiResume(): void {
  store.resume();
}

/**
 * Load a PRD into the TUI
 */
export function tuiLoadPrd(prd: Prd, filename: string): void {
  store.loadPrd(prd, filename);
}

/**
 * Update the PRD in the TUI (after external changes)
 */
export function tuiUpdatePrd(prd: Prd): void {
  store.updatePrd(prd);
}

/**
 * Increment the iteration counter
 */
export function tuiIncrementIteration(): void {
  store.incrementIteration();
}

/**
 * Clear all logs in the TUI
 */
export function tuiClearLogs(): void {
  store.clearLogs();
}
