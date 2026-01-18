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
  parseConsensusArgs,
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

export {
  executeSkipCommand,
  handleSkipCommand,
  skipCurrentTask,
  validateSkipInput,
  getSkipHelp,
} from "./skip.js";
export type { SkipCommandOptions } from "./skip.js";

export {
  executeStatusCommand,
  handleStatusCommand,
  getStatus,
  validateStatusInput,
  getStatusHelp,
} from "./status.js";
export type { StatusCommandOptions, StatusInfo } from "./status.js";

export {
  executeNoteCommand,
  handleNoteCommand,
  addNote,
  addNoteToCurrentTask,
  validateNoteInput,
  getNoteHelp,
} from "./note.js";
export type { NoteCommandOptions } from "./note.js";

export {
  executePriorityCommand,
  handlePriorityCommand,
  changePriority,
  validatePriorityInput,
  getPriorityHelp,
} from "./priority.js";
export type { PriorityCommandOptions } from "./priority.js";

export {
  executeConsensusCommand,
  handleConsensusCommand,
  triggerConsensus,
  canTriggerConsensus,
  getConsensusHelp,
} from "./consensus.js";
export type { ConsensusCommandOptions } from "./consensus.js";

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
  ConsensusCommandArgs,
  CommandResult,
} from "./types.js";
