/**
 * Claude Runner with Output Streaming
 *
 * This module provides functionality to run Claude Code in Docker sandbox
 * or directly, streaming stdout/stderr to the TUI log pane in real-time.
 *
 * Supports:
 * - Docker sandbox run (recommended)
 * - Direct claude command (when running natively)
 * - Real-time output streaming with log level detection
 * - Completion promise detection
 * - Process lifecycle management
 */

import { execa, type ResultPromise, type Options as ExecaOptions } from "execa";
import { EventEmitter } from "node:events";
import { store } from "../tui/state/store.js";
import type { LogEntry } from "../tui/state/store.js";
import { DEFAULT_COMPLETION_PROMISE } from "./prd-schema.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Provider for Claude API
 */
export type ClaudeProvider = "anthropic" | "openai";

/**
 * Permission mode for Claude Code
 */
export type PermissionMode = "default" | "acceptEdits" | "full";

/**
 * Options for running Claude
 */
export interface ClaudeRunnerOptions {
  /** The prompt to send to Claude */
  prompt: string;
  /** Whether to use Docker sandbox (default: true) */
  useDocker?: boolean;
  /** Permission mode for Claude Code */
  permissionMode?: PermissionMode;
  /** AI provider to use */
  provider?: ClaudeProvider;
  /** Model to use (provider-specific) */
  model?: string;
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables to pass */
  env?: Record<string, string>;
  /** Continue previous conversation */
  continue?: boolean;
  /** Timeout in milliseconds (default: no timeout) */
  timeout?: number;
  /** Completion promise string to detect */
  completionPromise?: string;
  /** Whether to log output to TUI store (default: true) */
  logToStore?: boolean;
  /** Additional CLI arguments */
  additionalArgs?: string[];
}

/**
 * Result of a Claude run
 */
export interface ClaudeRunResult {
  /** Whether the run completed successfully */
  success: boolean;
  /** The full output from Claude */
  output: string;
  /** Whether the completion promise was detected */
  completionDetected: boolean;
  /** Exit code of the process */
  exitCode: number | null;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether the process was killed */
  killed: boolean;
  /** Signal that killed the process, if any */
  signal?: string;
}

/**
 * Events emitted by ClaudeRunner
 */
export interface ClaudeRunnerEvents {
  /** Emitted when stdout data is received */
  stdout: (data: string) => void;
  /** Emitted when stderr data is received */
  stderr: (data: string) => void;
  /** Emitted when the process starts */
  start: () => void;
  /** Emitted when the process completes */
  complete: (result: ClaudeRunResult) => void;
  /** Emitted when completion promise is detected */
  completionDetected: () => void;
  /** Emitted on any error */
  error: (error: Error) => void;
}

// ============================================================================
// ClaudeRunner Class
// ============================================================================

/**
 * Class to run Claude Code with streaming output
 */
export class ClaudeRunner extends EventEmitter {
  private process: ResultPromise | null = null;
  private outputBuffer: string[] = [];
  private completionDetected = false;
  private startTime: number = 0;
  private readonly prompt: string;
  private readonly useDocker: boolean;
  private readonly permissionMode: PermissionMode;
  private readonly provider: ClaudeProvider;
  private readonly model: string;
  private readonly cwd: string;
  private readonly continueConversation: boolean;
  private readonly timeoutMs: number;
  private readonly completionPromise: string;
  private readonly logToStore: boolean;
  private readonly env: Record<string, string> | undefined;
  private readonly additionalArgs: string[] | undefined;

  constructor(options: ClaudeRunnerOptions) {
    super();

    // Set defaults
    this.prompt = options.prompt;
    this.useDocker = options.useDocker ?? true;
    this.permissionMode = options.permissionMode ?? "acceptEdits";
    this.provider = options.provider ?? "anthropic";
    this.model = options.model ?? "";
    this.cwd = options.cwd ?? process.cwd();
    this.continueConversation = options.continue ?? false;
    this.timeoutMs = options.timeout ?? 0;
    this.completionPromise = options.completionPromise ?? DEFAULT_COMPLETION_PROMISE;
    this.logToStore = options.logToStore ?? true;
    this.env = options.env;
    this.additionalArgs = options.additionalArgs;
  }

  /**
   * Build the command arguments for running Claude
   */
  private buildArgs(): string[] {
    const args: string[] = [];

    if (this.useDocker) {
      // docker sandbox run claude [options]
      args.push("sandbox", "run", "claude");
    }

    // Permission mode
    if (this.permissionMode !== "default") {
      args.push("--permission-mode", this.permissionMode);
    }

    // Model flag (for OpenAI)
    if (this.model) {
      args.push("--model", this.model);
    } else if (this.provider === "openai") {
      args.push("--model", "gpt-4o");
    }

    // Continue flag
    if (this.continueConversation) {
      args.push("-c");
    }

    // Prompt
    args.push("-p", this.prompt);

    // Additional args
    if (this.additionalArgs) {
      args.push(...this.additionalArgs);
    }

    return args;
  }

  /**
   * Get the command to execute
   */
  private getCommand(): string {
    return this.useDocker ? "docker" : "claude";
  }

  /**
   * Determine log level from output line
   */
  private getLogLevel(line: string, isStderr: boolean): LogEntry["level"] {
    const lowerLine = line.toLowerCase();

    if (isStderr) {
      if (lowerLine.includes("error") || lowerLine.includes("failed")) {
        return "error";
      }
      if (lowerLine.includes("warn")) {
        return "warn";
      }
      return "stderr";
    }

    if (lowerLine.includes("error") || lowerLine.includes("failed")) {
      return "error";
    }
    if (lowerLine.includes("warn")) {
      return "warn";
    }
    if (lowerLine.includes("success") || lowerLine.includes("completed") || lowerLine.includes("✓")) {
      return "success";
    }
    if (lowerLine.includes("debug")) {
      return "debug";
    }

    return "stdout";
  }

  /**
   * Process a line of output
   */
  private processLine(line: string, isStderr: boolean): void {
    // Skip empty lines
    if (!line.trim()) return;

    // Add to buffer
    this.outputBuffer.push(line);

    // Check for completion promise
    if (line.includes(this.completionPromise)) {
      this.completionDetected = true;
      this.emit("completionDetected");
    }

    // Log to store if enabled
    if (this.logToStore) {
      const level = this.getLogLevel(line, isStderr);
      store.addLog(line, level, "claude");
    }

    // Emit event
    if (isStderr) {
      this.emit("stderr", line);
    } else {
      this.emit("stdout", line);
    }
  }

  /**
   * Start running Claude
   */
  async run(): Promise<ClaudeRunResult> {
    this.startTime = Date.now();
    this.outputBuffer = [];
    this.completionDetected = false;

    const command = this.getCommand();
    const args = this.buildArgs();

    if (this.logToStore) {
      const cmdDisplay = this.useDocker
        ? `docker sandbox run claude -p "..."`
        : `claude -p "..."`;
      store.addLog(`Starting: ${cmdDisplay}`, "info", "system");
    }

    this.emit("start");

    // Build execa options
    const baseOptions: ExecaOptions = {
      cwd: this.cwd,
      env: this.env ? { ...process.env, ...this.env } : process.env,
      // Don't buffer - we want streaming
      buffer: false,
      // Handle streams ourselves
      stdout: "pipe",
      stderr: "pipe",
    };

    // Add timeout if specified
    const execaOptions: ExecaOptions = this.timeoutMs > 0
      ? { ...baseOptions, timeout: this.timeoutMs }
      : baseOptions;

    try {
      this.process = execa(command, args, execaOptions);

      // Stream stdout
      if (this.process.stdout) {
        this.process.stdout.on("data", (chunk: Buffer | string) => {
          const data = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
          const lines = data.split("\n");
          for (const line of lines) {
            this.processLine(line, false);
          }
        });
      }

      // Stream stderr
      if (this.process.stderr) {
        this.process.stderr.on("data", (chunk: Buffer | string) => {
          const data = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
          const lines = data.split("\n");
          for (const line of lines) {
            this.processLine(line, true);
          }
        });
      }

      // Wait for completion
      const result = await this.process;
      const durationMs = Date.now() - this.startTime;

      // execa v9 result shape - check for properties that may exist
      const resultAny = result as {
        exitCode?: number;
        signal?: string;
        signalDescription?: string;
      };

      const wasKilled = resultAny.signal !== undefined;

      const runResult: ClaudeRunResult = {
        success: resultAny.exitCode === 0,
        output: this.outputBuffer.join("\n"),
        completionDetected: this.completionDetected,
        exitCode: resultAny.exitCode ?? null,
        durationMs,
        killed: wasKilled,
      };

      if (resultAny.signal) {
        runResult.signal = resultAny.signal;
      }

      if (this.logToStore) {
        if (this.completionDetected) {
          store.addLog("Completion promise detected!", "success", "system");
        }
        store.addLog(
          `Claude finished in ${(durationMs / 1000).toFixed(1)}s (exit: ${resultAny.exitCode})`,
          resultAny.exitCode === 0 ? "info" : "warn",
          "system"
        );
      }

      this.emit("complete", runResult);
      return runResult;
    } catch (error: unknown) {
      const durationMs = Date.now() - this.startTime;

      // Handle execa errors
      const execaError = error as {
        exitCode?: number;
        killed?: boolean;
        signal?: string;
        message?: string;
        timedOut?: boolean;
        isCanceled?: boolean;
      };

      const runResult: ClaudeRunResult = {
        success: false,
        output: this.outputBuffer.join("\n"),
        completionDetected: this.completionDetected,
        exitCode: execaError.exitCode ?? null,
        durationMs,
        killed: execaError.killed ?? false,
        error: execaError.message ?? String(error),
      };

      if (execaError.signal) {
        runResult.signal = execaError.signal;
      }

      if (this.logToStore) {
        if (execaError.timedOut) {
          store.addLog(`Claude timed out after ${(durationMs / 1000).toFixed(1)}s`, "error", "system");
        } else if (execaError.killed) {
          store.addLog(`Claude was killed (signal: ${execaError.signal ?? "unknown"})`, "warn", "system");
        } else {
          store.addLog(`Claude error: ${execaError.message ?? "Unknown error"}`, "error", "system");
        }
      }

      this.emit("error", error instanceof Error ? error : new Error(String(error)));
      this.emit("complete", runResult);
      return runResult;
    } finally {
      this.process = null;
    }
  }

  /**
   * Kill the running process
   */
  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    if (this.process) {
      this.process.kill(signal);
      if (this.logToStore) {
        store.addLog(`Claude process killed (${signal})`, "warn", "system");
      }
      return true;
    }
    return false;
  }

  /**
   * Check if the process is running
   */
  isRunning(): boolean {
    return this.process !== null;
  }

  /**
   * Get the current output buffer
   */
  getOutput(): string {
    return this.outputBuffer.join("\n");
  }

  /**
   * Check if completion was detected
   */
  isComplete(): boolean {
    return this.completionDetected;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Run Claude with the given options and return the result
 */
export async function runClaude(options: ClaudeRunnerOptions): Promise<ClaudeRunResult> {
  const runner = new ClaudeRunner(options);
  return runner.run();
}

/**
 * Run a single Ralph iteration
 */
export async function runRalphIteration(options: {
  prdFile: string;
  progressFile: string;
  iteration: number;
  provider?: ClaudeProvider;
  model?: string;
  useDocker?: boolean;
  timeout?: number;
  completionPromise?: string;
}): Promise<ClaudeRunResult> {
  const {
    prdFile,
    progressFile,
    iteration,
    provider = "anthropic",
    model,
    useDocker = true,
    timeout,
    completionPromise = DEFAULT_COMPLETION_PROMISE,
  } = options;

  const prompt = `@${prdFile} @${progressFile} \\
  1. Find the highest-priority task and implement it. \\
  2. Run your tests and type checks. \\
  3. Update the PRD with what was done (set passes: true). \\
  4. Append your progress to ${progressFile}. \\
  5. Commit your changes. \\
  ONLY WORK ON A SINGLE TASK. \\
  If the PRD is complete, output ${completionPromise}.`;

  store.addLog(`Starting iteration ${iteration}`, "info", "system");

  const runnerOptions: ClaudeRunnerOptions = {
    prompt,
    provider,
    useDocker,
    permissionMode: "acceptEdits",
    completionPromise,
  };

  if (model) {
    runnerOptions.model = model;
  }

  if (timeout !== undefined && timeout > 0) {
    runnerOptions.timeout = timeout;
  }

  return runClaude(runnerOptions);
}

/**
 * Check if Docker sandbox is available
 */
export async function isDockerSandboxAvailable(): Promise<boolean> {
  try {
    await execa("docker", ["sandbox", "--help"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Docker is running
 */
export async function isDockerRunning(): Promise<boolean> {
  try {
    await execa("docker", ["info"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if claude CLI is available (native mode)
 */
export async function isClaudeCliAvailable(): Promise<boolean> {
  try {
    await execa("which", ["claude"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the best execution mode
 */
export async function detectExecutionMode(): Promise<{
  mode: "docker-sandbox" | "docker-compose" | "native" | "none";
  reason: string;
}> {
  // Check Docker sandbox first (preferred)
  if (await isDockerSandboxAvailable()) {
    return {
      mode: "docker-sandbox",
      reason: "Docker Desktop sandbox is available (recommended)",
    };
  }

  // Check if Docker is running (for compose approach)
  if (await isDockerRunning()) {
    return {
      mode: "docker-compose",
      reason: "Docker is running, can use docker-compose approach",
    };
  }

  // Check for native Claude CLI
  if (await isClaudeCliAvailable()) {
    return {
      mode: "native",
      reason: "Claude CLI is available for native execution",
    };
  }

  return {
    mode: "none",
    reason: "No execution mode available. Install Docker Desktop or Claude CLI.",
  };
}

// ============================================================================
// Singleton Runner for TUI Integration
// ============================================================================

let activeRunner: ClaudeRunner | null = null;

/**
 * Get the active runner instance (if any)
 */
export function getActiveRunner(): ClaudeRunner | null {
  return activeRunner;
}

/**
 * Run Claude and track as the active runner
 */
export async function runClaudeTracked(options: ClaudeRunnerOptions): Promise<ClaudeRunResult> {
  // Kill any existing runner
  if (activeRunner?.isRunning()) {
    activeRunner.kill();
  }

  activeRunner = new ClaudeRunner(options);

  try {
    return await activeRunner.run();
  } finally {
    activeRunner = null;
  }
}

/**
 * Kill the active runner
 */
export function killActiveRunner(signal?: NodeJS.Signals): boolean {
  if (activeRunner) {
    return activeRunner.kill(signal);
  }
  return false;
}

/**
 * Check if there's an active runner
 */
export function hasActiveRunner(): boolean {
  return activeRunner?.isRunning() ?? false;
}
