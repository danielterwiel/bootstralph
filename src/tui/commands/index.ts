/**
 * TUI Commands Module
 *
 * Exports command parser, types, and handlers for the Ralph TUI.
 */

// Export parser functions
export {
  COMMAND_DEFINITIONS,
  VALID_COMMAND_NAMES,
  getCommandCategory,
  isValidCommand,
  getCommandDefinition,
  tokenize,
  parseCommand,
  validateCommand,
  parseAndValidate,
  parseIssueArgs,
  parseNoteArgs,
  parsePriorityArgs,
  parseSkipArgs,
  parseAbortArgs,
  parseStatusArgs,
  getCategoryColor,
  getHelpText,
  getCommandSuggestions,
  formatCommandResult,
} from "./parser.js";

// Export command handlers
export {
  executeIssueCommand,
  handleIssueCommand,
  createIssue,
  validateIssueInput,
  getIssueHelp,
} from "./issue.js";
export type { IssueCommandOptions } from "./issue.js";

export {
  executePauseCommand,
  executeResumeCommand,
  handlePauseCommand,
  handleResumeCommand,
  pauseRalph,
  resumeRalph,
  togglePause,
  isPaused,
  getPauseHelp,
  getResumeHelp,
} from "./pause.js";
export type { PauseCommandOptions } from "./pause.js";

// Export types
export type {
  CommandName,
  CommandCategory,
  CommandDefinition,
  ParsedCommand,
  ParseError,
  IssueCommandArgs,
  NoteCommandArgs,
  PriorityCommandArgs,
  SkipCommandArgs,
  AbortCommandArgs,
  StatusCommandArgs,
  CommandResult,
} from "./types.js";
