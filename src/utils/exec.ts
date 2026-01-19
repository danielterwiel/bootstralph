/**
 * Exec utilities wrapping execa for consistent shell command execution
 *
 * Provides a clean API for running shell commands with:
 * - Sensible defaults (stdout/stderr capture)
 * - Typed error handling
 * - Promise-based API
 */

import { execa, type Options, type ExecaError } from "execa";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for exec command
 */
export interface ExecOptions extends Options {
  /**
   * Current working directory for the command
   */
  cwd?: string;
  /**
   * Environment variables
   */
  env?: Record<string, string>;
  /**
   * Whether to reject on non-zero exit code (default: true)
   */
  reject?: boolean;
}

/**
 * Result of exec command execution
 */
export interface ExecResult {
  /**
   * The command that was executed
   */
  command: string;
  /**
   * Exit code (0 for success)
   */
  exitCode: number;
  /**
   * Standard output
   */
  stdout: string;
  /**
   * Standard error
   */
  stderr: string;
  /**
   * Whether the command failed (non-zero exit code)
   */
  failed: boolean;
}

/**
 * Typed exec error with command details
 */
export class ExecCommandError extends Error {
  public readonly command: string;
  public readonly exitCode: number;
  public readonly stdout: string;
  public readonly stderr: string;

  constructor(error: ExecaError) {
    const stderr = typeof error.stderr === "string" ? error.stderr : "";
    const message = `Command failed with exit code ${error.exitCode}: ${error.command}\n${stderr}`;
    super(message);
    this.name = "ExecCommandError";
    this.command = error.command;
    this.exitCode = error.exitCode ?? 1;
    this.stdout = typeof error.stdout === "string" ? error.stdout : "";
    this.stderr = stderr;
  }
}

// ============================================================================
// Exec function
// ============================================================================

/**
 * Execute a shell command with sensible defaults
 *
 * @param command - The command to execute (can include arguments)
 * @param options - Execution options
 * @returns Promise resolving to execution result
 * @throws ExecCommandError on non-zero exit code (unless reject: false)
 *
 * @example
 * ```typescript
 * // Simple command
 * const result = await exec("git status");
 * console.log(result.stdout);
 *
 * // With options
 * const result = await exec("npm install", {
 *   cwd: "/path/to/project",
 *   env: { NODE_ENV: "production" }
 * });
 *
 * // Handle errors
 * try {
 *   await exec("npm test");
 * } catch (error) {
 *   if (error instanceof ExecCommandError) {
 *     console.error(`Command failed: ${error.command}`);
 *     console.error(`Exit code: ${error.exitCode}`);
 *     console.error(`Stderr: ${error.stderr}`);
 *   }
 * }
 *
 * // Don't throw on error
 * const result = await exec("npm test", { reject: false });
 * if (result.failed) {
 *   console.log("Tests failed but didn't throw");
 * }
 * ```
 */
export async function exec(
  command: string,
  options: ExecOptions = {}
): Promise<ExecResult> {
  try {
    // Parse command and arguments
    const parts = command.split(" ");
    const cmd = parts[0];
    const args = parts.slice(1);

    if (!cmd) {
      throw new Error("Command cannot be empty");
    }

    // Execute with sensible defaults
    const result = await execa(cmd, args, {
      // Capture stdout/stderr
      stdout: "pipe",
      stderr: "pipe",
      // Reject on non-zero exit code by default
      reject: options.reject !== false,
      // Pass through user options
      ...options,
    });

    return {
      command: result.command,
      exitCode: result.exitCode ?? 0,
      stdout: typeof result.stdout === "string" ? result.stdout : "",
      stderr: typeof result.stderr === "string" ? result.stderr : "",
      failed: result.failed,
    };
  } catch (error) {
    // Throw typed error for better error handling
    if (error && typeof error === "object" && "command" in error) {
      throw new ExecCommandError(error as ExecaError);
    }
    // Re-throw unknown errors
    throw error;
  }
}

/**
 * Re-export execa for advanced use cases
 */
export { execa };
