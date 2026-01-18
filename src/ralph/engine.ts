/**
 * Ralph Engine - Core Loop Implementation
 *
 * This module implements the Ralph loop in TypeScript, porting the bash logic from ralph.sh.
 * The engine orchestrates:
 * - Loading and managing PRD files
 * - Running Claude iterations with real-time output streaming
 * - Detecting completion (via completion promise or all tasks done)
 * - Respecting pause/resume controls
 * - Updating progress and emitting events for TUI integration
 *
 * The engine is designed to work with both the TUI and headless modes.
 */

import { EventEmitter } from "node:events";
import { writeFile, readFile, access, mkdir } from "node:fs/promises";
import { dirname, basename } from "node:path";
import { store } from "../tui/state/store.js";
import {
  PrdManager,
  type ImplementationTask,
} from "./prd-manager.js";
import {
  ClaudeRunner,
  runClaudeTracked,
  killActiveRunner,
  hasActiveRunner,
  detectExecutionMode,
  type ClaudeRunnerOptions,
  type ClaudeProvider,
  type PermissionMode,
} from "./claude-runner.js";
import { DEFAULT_COMPLETION_PROMISE, type UserStory } from "./prd-schema.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for the Ralph engine
 */
export interface RalphEngineOptions {
  /** Path to the PRD file to execute */
  prdFile: string;
  /** Path to the progress log file (default: .agents/tasks/progress.txt) */
  progressFile?: string;
  /** Maximum number of iterations (default: 10) */
  maxIterations?: number;
  /** AI provider to use */
  provider?: ClaudeProvider;
  /** Model to use (provider-specific) */
  model?: string;
  /** Whether to use Docker sandbox (default: true) */
  useDocker?: boolean;
  /** Permission mode for Claude Code */
  permissionMode?: PermissionMode;
  /** Completion promise string to detect */
  completionPromise?: string;
  /** Timeout per iteration in milliseconds (default: no timeout) */
  iterationTimeout?: number;
  /** Whether to log to TUI store (default: true) */
  logToStore?: boolean;
  /** Callback when an iteration completes */
  onIterationComplete?: (result: IterationResult) => void;
  /** Callback when a task starts */
  onTaskStart?: (task: ImplementationTask | UserStory) => void;
  /** Callback when a task completes */
  onTaskComplete?: (task: ImplementationTask | UserStory) => void;
  /** Callback when PRD is complete */
  onPrdComplete?: () => void;
  /** Callback when engine stops (for any reason) */
  onStop?: (reason: StopReason) => void;
  /** Whether to run in verbose mode */
  verbose?: boolean;
}

/**
 * Result of a single Ralph iteration
 */
export interface IterationResult {
  /** Iteration number (1-based) */
  iteration: number;
  /** Whether the iteration succeeded */
  success: boolean;
  /** Whether completion was detected */
  completionDetected: boolean;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
  /** Task worked on during this iteration */
  taskId?: string;
  /** Progress after this iteration */
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
}

/**
 * Overall result of running the Ralph engine
 */
export interface RalphEngineResult {
  /** Whether the PRD was completed */
  prdComplete: boolean;
  /** Number of iterations executed */
  iterationsRun: number;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Stop reason */
  stopReason: StopReason;
  /** Results of each iteration */
  iterations: IterationResult[];
  /** Any error that caused early termination */
  error?: string;
}

/**
 * Reason the engine stopped
 */
export type StopReason =
  | "prd_complete"
  | "max_iterations"
  | "user_abort"
  | "error"
  | "paused"
  | "no_tasks";

/**
 * Engine state
 */
export type EngineState =
  | "idle"
  | "running"
  | "paused"
  | "stopped"
  | "completing";

/**
 * Events emitted by the Ralph engine
 */
export interface RalphEngineEvents {
  /** Emitted when the engine starts */
  start: () => void;
  /** Emitted before each iteration */
  iterationStart: (iteration: number) => void;
  /** Emitted after each iteration */
  iterationComplete: (result: IterationResult) => void;
  /** Emitted when a task starts */
  taskStart: (task: ImplementationTask | UserStory) => void;
  /** Emitted when a task completes */
  taskComplete: (task: ImplementationTask | UserStory) => void;
  /** Emitted when the PRD is complete */
  prdComplete: () => void;
  /** Emitted when the engine pauses */
  pause: () => void;
  /** Emitted when the engine resumes */
  resume: () => void;
  /** Emitted when the engine stops */
  stop: (reason: StopReason, result: RalphEngineResult) => void;
  /** Emitted on errors */
  error: (error: Error) => void;
  /** Emitted when progress updates */
  progress: (progress: { completed: number; total: number; percentage: number }) => void;
}

// ============================================================================
// Ralph Engine Class
// ============================================================================

/**
 * The Ralph Engine orchestrates the automated development loop
 */
export class RalphEngine extends EventEmitter {
  // Configuration
  private readonly prdFile: string;
  private readonly progressFile: string;
  private readonly maxIterations: number;
  private readonly provider: ClaudeProvider;
  private readonly model: string;
  private readonly useDocker: boolean;
  private readonly permissionMode: PermissionMode;
  private readonly completionPromise: string;
  private readonly iterationTimeout: number;
  private readonly logToStore: boolean;
  private readonly verbose: boolean;

  // Callbacks
  private readonly onIterationComplete: ((result: IterationResult) => void) | undefined;
  private readonly onTaskStart: ((task: ImplementationTask | UserStory) => void) | undefined;
  private readonly onTaskComplete: ((task: ImplementationTask | UserStory) => void) | undefined;
  private readonly onPrdComplete: (() => void) | undefined;
  private readonly onStop: ((reason: StopReason) => void) | undefined;

  // State
  private state: EngineState = "idle";
  private prdManager: PrdManager | null = null;
  private currentIteration = 0;
  private iterations: IterationResult[] = [];
  private startTime = 0;
  private abortRequested = false;
  private currentRunner: ClaudeRunner | null = null;

  constructor(options: RalphEngineOptions) {
    super();

    // Validate required options
    if (!options.prdFile) {
      throw new Error("prdFile is required");
    }

    // Store configuration
    this.prdFile = options.prdFile;
    this.progressFile = options.progressFile ?? ".agents/tasks/progress.txt";
    this.maxIterations = options.maxIterations ?? 10;
    this.provider = options.provider ?? "anthropic";
    this.model = options.model ?? "";
    this.useDocker = options.useDocker ?? true;
    this.permissionMode = options.permissionMode ?? "acceptEdits";
    this.completionPromise = options.completionPromise ?? DEFAULT_COMPLETION_PROMISE;
    this.iterationTimeout = options.iterationTimeout ?? 0;
    this.logToStore = options.logToStore ?? true;
    this.verbose = options.verbose ?? false;

    // Store callbacks
    this.onIterationComplete = options.onIterationComplete;
    this.onTaskStart = options.onTaskStart;
    this.onTaskComplete = options.onTaskComplete;
    this.onPrdComplete = options.onPrdComplete;
    this.onStop = options.onStop;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get the current engine state
   */
  getState(): EngineState {
    return this.state;
  }

  /**
   * Check if the engine is running
   */
  isRunning(): boolean {
    return this.state === "running";
  }

  /**
   * Check if the engine is paused
   */
  isPaused(): boolean {
    return this.state === "paused";
  }

  /**
   * Get the current iteration number
   */
  getCurrentIteration(): number {
    return this.currentIteration;
  }

  /**
   * Get the PRD manager instance
   */
  getPrdManager(): PrdManager | null {
    return this.prdManager;
  }

  /**
   * Start the Ralph engine loop
   */
  async run(): Promise<RalphEngineResult> {
    if (this.state !== "idle") {
      throw new Error(`Cannot start engine in state: ${this.state}`);
    }

    this.state = "running";
    this.startTime = Date.now();
    this.currentIteration = 0;
    this.iterations = [];
    this.abortRequested = false;

    this.log("Starting Ralph engine", "info");
    this.emit("start");

    try {
      // Load the PRD
      await this.loadPrd();

      // Initialize progress file
      await this.initProgressFile();

      // Check if already complete
      if (this.prdManager?.isComplete()) {
        this.log("PRD is already complete", "success");
        return this.createResult("prd_complete");
      }

      // Update TUI store
      if (this.logToStore) {
        store.setMaxIterations(this.maxIterations);
        store.resetIteration();
      }

      // Run the main loop
      const result = await this.runLoop();
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Engine error: ${errorMessage}`, "error");
      this.emit("error", error instanceof Error ? error : new Error(errorMessage));
      return this.createResult("error", errorMessage);
    } finally {
      this.state = "stopped";
    }
  }

  /**
   * Pause the engine (will pause after current iteration)
   */
  pause(): void {
    if (this.state === "running") {
      this.state = "paused";
      this.log("Engine paused (will pause after current iteration)", "warn");
      this.emit("pause");

      if (this.logToStore) {
        store.pause();
      }
    }
  }

  /**
   * Resume the engine from paused state
   */
  async resume(): Promise<void> {
    if (this.state === "paused") {
      this.state = "running";
      this.log("Engine resumed", "info");
      this.emit("resume");

      if (this.logToStore) {
        store.resume();
      }
    }
  }

  /**
   * Abort the engine (stops as soon as possible)
   */
  abort(): void {
    this.abortRequested = true;
    this.log("Abort requested", "warn");

    // Kill any running Claude process
    if (hasActiveRunner()) {
      killActiveRunner();
    }

    if (this.currentRunner?.isRunning()) {
      this.currentRunner.kill();
    }
  }

  /**
   * Stop the engine gracefully
   */
  stop(): void {
    this.state = "stopped";
    this.log("Engine stopped", "info");
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Load the PRD file
   */
  private async loadPrd(): Promise<void> {
    // Create a new PrdManager with update callback
    this.prdManager = new PrdManager({
      onUpdate: () => {
        this.updateProgress();
      },
    });

    await this.prdManager.load(this.prdFile);

    const prd = this.prdManager.getPrd();
    if (!prd) {
      throw new Error(`Failed to load PRD from ${this.prdFile}`);
    }

    this.log(`Loaded PRD: ${prd.name}`, "info");

    // Update TUI store
    if (this.logToStore) {
      const filename = basename(this.prdFile);
      // Convert ExtendedPrd to Prd-compatible format for store
      const storePrd = {
        ...prd,
        userStories: prd.userStories ?? this.convertTasksToStories(prd.implementation_tasks ?? []),
      };
      store.loadPrd(storePrd, filename);
    }

    this.updateProgress();
  }

  /**
   * Convert implementation_tasks to userStories format for store compatibility
   */
  private convertTasksToStories(tasks: ImplementationTask[]): UserStory[] {
    return tasks.map((task, index) => {
      const story: UserStory = {
        id: task.id,
        title: task.task,
        description: task.description ?? task.task,
        acceptanceCriteria: task.files?.map((f) => `Update ${f}`) ?? [],
        priority: task.phase * 100 + index,
        passes: task.status === "completed",
      };

      // Add optional properties only if they have values
      if (task.notes !== undefined) {
        story.notes = task.notes;
      }
      if (task.startedAt !== undefined) {
        story.startedAt = task.startedAt;
      }
      if (task.completedAt !== undefined) {
        story.completedAt = task.completedAt;
      }

      return story;
    });
  }

  /**
   * Initialize the progress file
   */
  private async initProgressFile(): Promise<void> {
    const dir = dirname(this.progressFile);
    await mkdir(dir, { recursive: true });

    // Check if file exists
    let exists = false;
    try {
      await access(this.progressFile);
      exists = true;
    } catch {
      exists = false;
    }

    if (!exists) {
      const prd = this.prdManager?.getPrd();
      const header = `# Progress Log for ${prd?.name ?? "Ralph"}
# Started: ${new Date().toISOString()}

`;
      await writeFile(this.progressFile, header);
      this.log("Created progress file", "info");
    }
  }

  /**
   * Append to the progress file
   */
  private async appendProgress(message: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const entry = `## ${timestamp}\n${message}\n\n`;
      const content = await readFile(this.progressFile, "utf-8");
      await writeFile(this.progressFile, content + entry);
    } catch (error) {
      this.log(`Failed to append to progress file: ${error}`, "warn");
    }
  }

  /**
   * Update progress tracking
   */
  private updateProgress(): void {
    if (!this.prdManager) return;

    const progress = this.prdManager.getProgress();

    if (this.logToStore) {
      store.setProgress({
        ...store.progress(),
        completed: progress.completed,
        total: progress.total,
      });
    }

    this.emit("progress", progress);
  }

  /**
   * Run the main iteration loop
   */
  private async runLoop(): Promise<RalphEngineResult> {
    while (this.currentIteration < this.maxIterations) {
      // Check for abort
      if (this.abortRequested) {
        this.log("Aborted by user", "warn");
        await this.appendProgress("Aborted by user");
        return this.createResult("user_abort");
      }

      // Check for pause - wait until resumed
      if (this.state === "paused") {
        this.log("Paused - waiting for resume", "info");
        await this.waitForResume();

        // Re-check abort after resume
        if (this.abortRequested) {
          return this.createResult("user_abort");
        }
      }

      // Check if PRD is complete
      if (this.prdManager?.isComplete()) {
        this.log("PRD is complete!", "success");
        await this.appendProgress(`PRD COMPLETED after ${this.currentIteration} iterations`);
        this.emit("prdComplete");
        this.onPrdComplete?.();
        return this.createResult("prd_complete");
      }

      // Get next task
      const nextTask = this.prdManager?.getNextTask();
      if (!nextTask) {
        this.log("No more tasks to process", "info");
        return this.createResult("no_tasks");
      }

      // Run iteration
      this.currentIteration++;
      if (this.logToStore) {
        store.incrementIteration();
      }

      this.log(`=== Iteration ${this.currentIteration}/${this.maxIterations} ===`, "info");
      this.emit("iterationStart", this.currentIteration);

      // Start task
      this.log(`Starting task: ${nextTask.id}`, "info");
      this.emit("taskStart", nextTask);
      this.onTaskStart?.(nextTask);

      if (this.logToStore) {
        const title = "task" in nextTask ? nextTask.task : nextTask.title;
        store.startTask(nextTask.id, title);
      }

      // Run the iteration
      const result = await this.runIteration(nextTask);
      this.iterations.push(result);

      // Update TUI store
      if (this.logToStore) {
        store.setProgress({
          ...store.progress(),
          completed: result.progress.completed,
          total: result.progress.total,
        });
      }

      // Emit events and callbacks
      this.emit("iterationComplete", result);
      this.onIterationComplete?.(result);

      // Check for completion
      if (result.completionDetected) {
        this.log("Completion promise detected!", "success");
        await this.appendProgress(`PRD COMPLETED after ${this.currentIteration} iterations`);
        this.emit("prdComplete");
        this.onPrdComplete?.();
        return this.createResult("prd_complete");
      }

      // Log progress
      const progress = this.prdManager?.getProgress();
      if (progress) {
        this.log(`Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)`, "info");
      }
    }

    // Max iterations reached
    this.log(`Max iterations (${this.maxIterations}) reached`, "warn");
    await this.appendProgress(`Max iterations reached (${this.maxIterations})`);
    return this.createResult("max_iterations");
  }

  /**
   * Run a single Ralph iteration
   */
  private async runIteration(task: ImplementationTask | UserStory): Promise<IterationResult> {
    const iterationStart = Date.now();
    const taskId = task.id;

    // Build the prompt (matches ralph.sh format)
    const prompt = `@${this.prdFile} @${this.progressFile} \\
  1. Find the highest-priority task and implement it. \\
  2. Run your tests and type checks. \\
  3. Update the PRD with what was done (set passes: true). \\
  4. Append your progress to ${this.progressFile}. \\
  5. Commit your changes. \\
  ONLY WORK ON A SINGLE TASK. \\
  If the PRD is complete, output ${this.completionPromise}.`;

    if (this.verbose) {
      this.log(`Prompt: ${prompt}`, "debug");
      this.log(`Provider: ${this.provider}`, "debug");
    }

    // Build runner options
    const runnerOptions: ClaudeRunnerOptions = {
      prompt,
      useDocker: this.useDocker,
      permissionMode: this.permissionMode,
      provider: this.provider,
      completionPromise: this.completionPromise,
      logToStore: this.logToStore,
    };

    if (this.model) {
      runnerOptions.model = this.model;
    }

    if (this.iterationTimeout > 0) {
      runnerOptions.timeout = this.iterationTimeout;
    }

    try {
      // Run Claude using tracked runner
      const claudeResult = await runClaudeTracked(runnerOptions);

      // Get updated progress
      const progress = this.prdManager?.getProgress() ?? { completed: 0, total: 0, percentage: 0 };

      const result: IterationResult = {
        iteration: this.currentIteration,
        success: claudeResult.success,
        completionDetected: claudeResult.completionDetected,
        durationMs: Date.now() - iterationStart,
        taskId,
        progress,
      };

      if (!claudeResult.success && claudeResult.error) {
        result.error = claudeResult.error;
      }

      // Reload PRD to get updated state
      if (this.prdManager) {
        await this.prdManager.load(this.prdFile);
        this.updateProgress();

        // Check if task was completed
        const updatedTask = this.prdManager.getTask(taskId);
        if (updatedTask) {
          const isCompleted = "status" in updatedTask
            ? updatedTask.status === "completed"
            : updatedTask.passes === true;

          if (isCompleted) {
            this.log(`Task ${taskId} completed`, "success");
            this.emit("taskComplete", updatedTask);
            this.onTaskComplete?.(updatedTask);

            if (this.logToStore) {
              store.completeTask();
            }
          }
        }
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Iteration error: ${errorMessage}`, "error");

      const progress = this.prdManager?.getProgress() ?? { completed: 0, total: 0, percentage: 0 };

      return {
        iteration: this.currentIteration,
        success: false,
        completionDetected: false,
        durationMs: Date.now() - iterationStart,
        error: errorMessage,
        taskId,
        progress,
      };
    }
  }

  /**
   * Wait for the engine to be resumed
   */
  private async waitForResume(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.state !== "paused" || this.abortRequested) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Create the final result object
   */
  private createResult(stopReason: StopReason, error?: string): RalphEngineResult {
    const result: RalphEngineResult = {
      prdComplete: stopReason === "prd_complete",
      iterationsRun: this.currentIteration,
      totalDurationMs: Date.now() - this.startTime,
      stopReason,
      iterations: this.iterations,
    };

    if (error) {
      result.error = error;
    }

    // Emit stop event
    this.emit("stop", stopReason, result);
    this.onStop?.(stopReason);

    return result;
  }

  /**
   * Log a message
   */
  private log(message: string, level: "info" | "warn" | "error" | "success" | "debug"): void {
    if (this.logToStore) {
      store.addLog(message, level, "engine");
    }

    if (this.verbose || level === "error") {
      const prefix = {
        info: "ℹ️",
        warn: "⚠️",
        error: "❌",
        success: "✅",
        debug: "🐛",
      }[level];
      console.log(`${prefix} [Ralph] ${message}`);
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Run the Ralph engine with the given options
 */
export async function runRalphEngine(options: RalphEngineOptions): Promise<RalphEngineResult> {
  const engine = new RalphEngine(options);
  return engine.run();
}

/**
 * Run a single Ralph iteration (without full engine)
 */
export async function runSingleIteration(options: {
  prdFile: string;
  progressFile?: string;
  provider?: ClaudeProvider;
  model?: string;
  useDocker?: boolean;
  verbose?: boolean;
}): Promise<IterationResult> {
  // Build engine options conditionally to satisfy exactOptionalPropertyTypes
  const engineOptions: RalphEngineOptions = {
    prdFile: options.prdFile,
    maxIterations: 1,
  };

  if (options.progressFile !== undefined) {
    engineOptions.progressFile = options.progressFile;
  }
  if (options.provider !== undefined) {
    engineOptions.provider = options.provider;
  }
  if (options.model !== undefined) {
    engineOptions.model = options.model;
  }
  if (options.useDocker !== undefined) {
    engineOptions.useDocker = options.useDocker;
  }
  if (options.verbose !== undefined) {
    engineOptions.verbose = options.verbose;
  }

  const engine = new RalphEngine(engineOptions);

  const result = await engine.run();
  return result.iterations[0] ?? {
    iteration: 1,
    success: false,
    completionDetected: false,
    durationMs: 0,
    error: "No iteration run",
    progress: { completed: 0, total: 0, percentage: 0 },
  };
}

/**
 * Check if Ralph can run (Docker/Claude available)
 */
export async function canRunRalph(): Promise<{
  canRun: boolean;
  mode: "docker-sandbox" | "docker-compose" | "native" | "none";
  reason: string;
}> {
  const detection = await detectExecutionMode();
  return {
    canRun: detection.mode !== "none",
    mode: detection.mode,
    reason: detection.reason,
  };
}

// ============================================================================
// Singleton Engine for TUI Integration
// ============================================================================

let activeEngine: RalphEngine | null = null;

/**
 * Get the active engine instance
 */
export function getActiveEngine(): RalphEngine | null {
  return activeEngine;
}

/**
 * Start the Ralph engine and track as active
 */
export async function startRalphEngine(options: RalphEngineOptions): Promise<RalphEngineResult> {
  // Stop any existing engine
  if (activeEngine?.isRunning()) {
    activeEngine.abort();
  }

  activeEngine = new RalphEngine(options);

  try {
    return await activeEngine.run();
  } finally {
    activeEngine = null;
  }
}

/**
 * Pause the active engine
 */
export function pauseRalphEngine(): boolean {
  if (activeEngine?.isRunning()) {
    activeEngine.pause();
    return true;
  }
  return false;
}

/**
 * Resume the active engine
 */
export async function resumeRalphEngine(): Promise<boolean> {
  if (activeEngine?.isPaused()) {
    await activeEngine.resume();
    return true;
  }
  return false;
}

/**
 * Abort the active engine
 */
export function abortRalphEngine(): boolean {
  if (activeEngine) {
    activeEngine.abort();
    return true;
  }
  return false;
}

/**
 * Check if there's an active engine
 */
export function hasActiveEngine(): boolean {
  return activeEngine !== null;
}

/**
 * Check if the active engine is running
 */
export function isEngineRunning(): boolean {
  return activeEngine?.isRunning() ?? false;
}

/**
 * Check if the active engine is paused
 */
export function isEnginePaused(): boolean {
  return activeEngine?.isPaused() ?? false;
}
