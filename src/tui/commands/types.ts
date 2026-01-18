/**
 * TUI Command Types
 *
 * Type definitions for slash commands supported by the Ralph TUI.
 */

/**
 * Supported slash command names
 */
export type CommandName =
  | "issue"
  | "pause"
  | "resume"
  | "skip"
  | "status"
  | "note"
  | "priority"
  | "abort"
  | "help"
  | "clear"
  | "consensus";

/**
 * Command categories for grouping and styling
 */
export type CommandCategory = "control" | "prd" | "info" | "system";

/**
 * Parsed command result
 */
export interface ParsedCommand {
  /** Whether input starts with / */
  isCommand: boolean;
  /** The command name without the leading / */
  name: CommandName | string;
  /** Raw arguments after the command name */
  rawArgs: string;
  /** Parsed positional arguments */
  args: string[];
  /** Whether the command is recognized */
  isValid: boolean;
  /** Command category for styling */
  category: CommandCategory | null;
}

/**
 * Command definition with metadata
 */
export interface CommandDefinition {
  /** Command name */
  name: CommandName;
  /** Command category */
  category: CommandCategory;
  /** Short description */
  description: string;
  /** Usage syntax */
  usage: string;
  /** Whether command requires arguments */
  requiresArgs: boolean;
  /** Minimum number of arguments */
  minArgs: number;
  /** Maximum number of arguments (-1 for unlimited) */
  maxArgs: number;
  /** Examples */
  examples: string[];
}

/**
 * /issue command arguments
 */
export interface IssueCommandArgs {
  /** Issue description */
  description: string;
  /** Optional priority (defaults to max + 1) */
  priority?: number;
}

/**
 * /note command arguments
 */
export interface NoteCommandArgs {
  /** Note content to add */
  content: string;
  /** Optional task ID to add note to (defaults to current task) */
  taskId?: string;
}

/**
 * /priority command arguments
 */
export interface PriorityCommandArgs {
  /** Task ID to update */
  taskId: string;
  /** New priority value */
  priority: number;
}

/**
 * /skip command arguments
 */
export interface SkipCommandArgs {
  /** Optional reason for skipping */
  reason?: string;
}

/**
 * /abort command arguments
 */
export interface AbortCommandArgs {
  /** Optional reason for aborting */
  reason?: string;
  /** Whether to force abort without confirmation */
  force?: boolean;
}

/**
 * /status command arguments
 */
export interface StatusCommandArgs {
  /** Optional specific task ID to show status for */
  taskId?: string;
  /** Whether to show verbose status */
  verbose?: boolean;
}

/**
 * /consensus command arguments
 */
export interface ConsensusCommandArgs {
  /** Reason for triggering consensus */
  reason: string;
}

/**
 * Result of executing a command
 */
export interface CommandResult {
  /** Whether command executed successfully */
  success: boolean;
  /** Result message to display */
  message: string;
  /** Optional error details */
  error?: string;
  /** Optional data from command execution */
  data?: unknown;
}

/**
 * Parse error information
 */
export interface ParseError {
  /** Error type */
  type: "unknown_command" | "missing_args" | "invalid_args" | "too_many_args";
  /** Error message */
  message: string;
  /** Command that caused error (if known) */
  command?: string;
  /** Expected usage */
  usage?: string;
}
