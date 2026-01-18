/**
 * /consensus Command Handler
 *
 * Manually triggers consensus mode for the current step when in Pair Vibe Mode.
 * Per impl-012: New slash command to manually trigger consensus mode.
 *
 * /consensus <reason> - Pauses execution and enters consensus mode
 *
 * This is useful when the user notices an issue before the Reviewer does
 * and wants to force a discussion between models.
 */

import type { CommandResult } from "./types.js";
import { parseCommand, validateCommand, parseConsensusArgs } from "./parser.js";
import { store } from "../state/store.js";

/**
 * Options for executing the consensus command
 */
export interface ConsensusCommandOptions {
  /** Raw input string (e.g., "/consensus <reason>") */
  input?: string;
  /** Reason for triggering consensus */
  reason?: string;
  /** Whether to show status in logs (default: true) */
  showInLogs?: boolean;
}

/**
 * Execute the /consensus command
 *
 * Triggers manual consensus mode for the current step.
 * Only works when Pair Vibe Mode is active.
 *
 * @param options Command options
 * @returns Command result with success status and message
 */
export async function executeConsensusCommand(
  options: ConsensusCommandOptions = {}
): Promise<CommandResult> {
  const showInLogs = options.showInLogs !== false;
  let reason = options.reason;

  // If input provided, parse and validate it
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

    // Ensure it's actually a consensus command
    if (parsed.name !== "consensus") {
      const errorMsg = `Expected /consensus command, got /${parsed.name}`;
      if (showInLogs) {
        store.addLog(errorMsg, "error", "system");
      }
      return {
        success: false,
        message: errorMsg,
        error: "WRONG_COMMAND",
      };
    }

    // Parse arguments
    const args = parseConsensusArgs(parsed);
    if (!args) {
      const errorMsg = "Missing reason for consensus trigger. Usage: /consensus <reason>";
      if (showInLogs) {
        store.addLog(errorMsg, "error", "system");
      }
      return {
        success: false,
        message: errorMsg,
        error: "MISSING_ARGS",
      };
    }

    reason = args.reason;
  }

  // Check if reason is provided
  if (!reason || reason.trim().length === 0) {
    const errorMsg = "Missing reason for consensus trigger. Usage: /consensus <reason>";
    if (showInLogs) {
      store.addLog(errorMsg, "error", "system");
    }
    return {
      success: false,
      message: errorMsg,
      error: "MISSING_ARGS",
    };
  }

  // Check if Pair Vibe Mode is active
  if (!store.isPairVibeActive()) {
    const errorMsg = "Pair Vibe Mode is not active. /consensus only works in Pair Vibe Mode.";
    if (showInLogs) {
      store.addLog(errorMsg, "error", "system");
    }
    return {
      success: false,
      message: errorMsg,
      error: "NOT_PAIR_VIBE_MODE",
    };
  }

  // Get the PairVibeEngine
  const engine = store.getPairVibeEngine();
  if (!engine) {
    const errorMsg = "PairVibeEngine not available. Engine may not be running.";
    if (showInLogs) {
      store.addLog(errorMsg, "error", "system");
    }
    return {
      success: false,
      message: errorMsg,
      error: "ENGINE_NOT_AVAILABLE",
    };
  }

  // Check if engine is running
  if (!engine.isRunning()) {
    const errorMsg = "PairVibeEngine is not running. Cannot trigger consensus.";
    if (showInLogs) {
      store.addLog(errorMsg, "error", "system");
    }
    return {
      success: false,
      message: errorMsg,
      error: "ENGINE_NOT_RUNNING",
    };
  }

  // Check if already in consensus mode
  const status = store.pairVibeStatus();
  if (status?.phase === "consensus") {
    const message = "Already in consensus mode";
    if (showInLogs) {
      store.addLog(message, "warn", "system");
    }
    return {
      success: true,
      message,
      data: { alreadyInConsensus: true },
    };
  }

  try {
    // Trigger consensus on the engine
    await engine.triggerConsensus(reason);

    const message = `Consensus triggered: ${reason}`;
    if (showInLogs) {
      store.addLog(message, "info", "consensus");
    }

    return {
      success: true,
      message,
      data: { reason },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (showInLogs) {
      store.addLog(`Failed to trigger consensus: ${errorMessage}`, "error", "system");
    }
    return {
      success: false,
      message: `Failed to trigger consensus: ${errorMessage}`,
      error: "TRIGGER_FAILED",
    };
  }
}

/**
 * Handle /consensus command from raw input string
 *
 * Convenience function for direct command handling.
 *
 * @param input Raw command input (e.g., "/consensus I have concerns")
 * @returns Command result
 */
export async function handleConsensusCommand(input: string): Promise<CommandResult> {
  return executeConsensusCommand({ input });
}

/**
 * Trigger consensus programmatically
 *
 * Direct API for triggering consensus without command parsing.
 *
 * @param reason Reason for triggering consensus
 * @param showInLogs Whether to show status in logs
 * @returns Command result
 */
export async function triggerConsensus(
  reason: string,
  showInLogs = true
): Promise<CommandResult> {
  return executeConsensusCommand({ reason, showInLogs });
}

/**
 * Check if consensus can be triggered
 *
 * @returns Whether consensus can be triggered
 */
export function canTriggerConsensus(): boolean {
  // Must be in Pair Vibe Mode
  if (!store.isPairVibeActive()) {
    return false;
  }

  // Engine must be available and running
  const engine = store.getPairVibeEngine();
  if (!engine || !engine.isRunning()) {
    return false;
  }

  // Must not already be in consensus mode
  const status = store.pairVibeStatus();
  if (status?.phase === "consensus") {
    return false;
  }

  return true;
}

/**
 * Get help text for the /consensus command
 */
export function getConsensusHelp(): string {
  return `
/consensus <reason>

Manually trigger consensus mode for the current step.
Only available when Pair Vibe Mode is active.

Usage:
  /consensus <reason for concern>

Arguments:
  reason - Description of why you want to trigger consensus

Notes:
  - Pauses execution and enters consensus mode
  - Both Executor and Reviewer will discuss the current step
  - Useful when you notice an issue before the Reviewer does
  - The reason will be added to the step's findings

Examples:
  /consensus I have concerns about this approach
  /consensus Need to discuss security implications
  /consensus This approach might not scale well
`.trim();
}
