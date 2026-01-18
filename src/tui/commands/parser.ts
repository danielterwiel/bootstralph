/**
 * Slash Command Parser
 *
 * Parses input starting with / and extracts command name and arguments.
 * Supports: /issue, /pause, /resume, /skip, /status, /note, /priority, /abort, /help, /clear, /consensus, /reviewer
 */

import type {
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
  ReviewerCommandArgs,
} from "./types.js";

/**
 * All supported command definitions
 */
export const COMMAND_DEFINITIONS: Record<CommandName, CommandDefinition> = {
  issue: {
    name: "issue",
    category: "prd",
    description: "Add a new issue/task to the PRD",
    usage: "/issue <description>",
    requiresArgs: true,
    minArgs: 1,
    maxArgs: -1,
    examples: ["/issue Fix login button alignment", "/issue Add dark mode support"],
  },
  pause: {
    name: "pause",
    category: "control",
    description: "Pause the Ralph loop",
    usage: "/pause",
    requiresArgs: false,
    minArgs: 0,
    maxArgs: 0,
    examples: ["/pause"],
  },
  resume: {
    name: "resume",
    category: "control",
    description: "Resume the Ralph loop",
    usage: "/resume",
    requiresArgs: false,
    minArgs: 0,
    maxArgs: 0,
    examples: ["/resume"],
  },
  skip: {
    name: "skip",
    category: "control",
    description: "Skip the current task",
    usage: "/skip [reason]",
    requiresArgs: false,
    minArgs: 0,
    maxArgs: -1,
    examples: ["/skip", "/skip Claude is stuck on this task"],
  },
  status: {
    name: "status",
    category: "info",
    description: "Show current PRD status and progress",
    usage: "/status [task-id]",
    requiresArgs: false,
    minArgs: 0,
    maxArgs: 1,
    examples: ["/status", "/status impl-043"],
  },
  note: {
    name: "note",
    category: "prd",
    description: "Add a note to the current task",
    usage: "/note <content>",
    requiresArgs: true,
    minArgs: 1,
    maxArgs: -1,
    examples: ["/note User requested this feature", "/note Consider edge case for empty input"],
  },
  priority: {
    name: "priority",
    category: "prd",
    description: "Change task priority",
    usage: "/priority <task-id> <number>",
    requiresArgs: true,
    minArgs: 2,
    maxArgs: 2,
    examples: ["/priority impl-044 1", "/priority US-001 5"],
  },
  abort: {
    name: "abort",
    category: "control",
    description: "Abort the Ralph loop and exit",
    usage: "/abort [reason]",
    requiresArgs: false,
    minArgs: 0,
    maxArgs: -1,
    examples: ["/abort", "/abort Need to fix critical bug first"],
  },
  help: {
    name: "help",
    category: "info",
    description: "Show available commands",
    usage: "/help [command]",
    requiresArgs: false,
    minArgs: 0,
    maxArgs: 1,
    examples: ["/help", "/help issue"],
  },
  clear: {
    name: "clear",
    category: "system",
    description: "Clear the log pane",
    usage: "/clear",
    requiresArgs: false,
    minArgs: 0,
    maxArgs: 0,
    examples: ["/clear"],
  },
  consensus: {
    name: "consensus",
    category: "control",
    description: "Manually trigger consensus mode for the current step (Pair Vibe Mode only)",
    usage: "/consensus <reason>",
    requiresArgs: true,
    minArgs: 1,
    maxArgs: -1,
    examples: [
      "/consensus I have concerns about this approach",
      "/consensus Need to discuss security implications",
    ],
  },
  reviewer: {
    name: "reviewer",
    category: "control",
    description: "Control the Reviewer (Pair Vibe Mode only)",
    usage: "/reviewer <status|pause|resume|skip <step-id>>",
    requiresArgs: true,
    minArgs: 1,
    maxArgs: 2,
    examples: [
      "/reviewer status",
      "/reviewer pause",
      "/reviewer resume",
      "/reviewer skip impl-015",
    ],
  },
};

/**
 * List of valid command names
 */
export const VALID_COMMAND_NAMES: CommandName[] = Object.keys(COMMAND_DEFINITIONS) as CommandName[];

/**
 * Get command category from name
 */
export function getCommandCategory(name: string): CommandCategory | null {
  const def = COMMAND_DEFINITIONS[name as CommandName];
  return def ? def.category : null;
}

/**
 * Check if a command name is valid
 */
export function isValidCommand(name: string): name is CommandName {
  return VALID_COMMAND_NAMES.includes(name as CommandName);
}

/**
 * Get command definition by name
 */
export function getCommandDefinition(name: string): CommandDefinition | null {
  return COMMAND_DEFINITIONS[name as CommandName] ?? null;
}

/**
 * Parse input string into tokens, respecting quoted strings
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (!inQuotes && (char === '"' || char === "'")) {
      inQuotes = true;
      quoteChar = char;
    } else if (inQuotes && char === quoteChar) {
      inQuotes = false;
      quoteChar = "";
    } else if (!inQuotes && char === " ") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  // Add last token if any
  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Parse a slash command from input string
 */
export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();

  // Not a command if doesn't start with /
  if (!trimmed.startsWith("/")) {
    return {
      isCommand: false,
      name: "",
      rawArgs: trimmed,
      args: [],
      isValid: false,
      category: null,
    };
  }

  // Extract command name and args
  const spaceIndex = trimmed.indexOf(" ");
  let commandName: string;
  let rawArgs: string;

  if (spaceIndex === -1) {
    commandName = trimmed.slice(1).toLowerCase();
    rawArgs = "";
  } else {
    commandName = trimmed.slice(1, spaceIndex).toLowerCase();
    rawArgs = trimmed.slice(spaceIndex + 1).trim();
  }

  // Tokenize arguments
  const args = rawArgs.length > 0 ? tokenize(rawArgs) : [];

  // Check if valid
  const valid = isValidCommand(commandName);
  const category = getCommandCategory(commandName);

  return {
    isCommand: true,
    name: commandName,
    rawArgs,
    args,
    isValid: valid,
    category,
  };
}

/**
 * Validate parsed command arguments
 */
export function validateCommand(parsed: ParsedCommand): ParseError | null {
  // Not a command, no validation needed
  if (!parsed.isCommand) {
    return null;
  }

  // Unknown command
  if (!parsed.isValid) {
    return {
      type: "unknown_command",
      message: `Unknown command: /${parsed.name}`,
      command: parsed.name,
      usage: "Type /help for available commands",
    };
  }

  const def = getCommandDefinition(parsed.name);
  if (!def) {
    return null; // Should not happen if isValid is true
  }

  // Check minimum args
  if (parsed.args.length < def.minArgs) {
    return {
      type: "missing_args",
      message: `Missing arguments for /${parsed.name}`,
      command: parsed.name,
      usage: def.usage,
    };
  }

  // Check maximum args (if not unlimited)
  if (def.maxArgs !== -1 && parsed.args.length > def.maxArgs) {
    return {
      type: "too_many_args",
      message: `Too many arguments for /${parsed.name}`,
      command: parsed.name,
      usage: def.usage,
    };
  }

  return null;
}

/**
 * Parse and validate a command in one step
 */
export function parseAndValidate(input: string): { parsed: ParsedCommand; error: ParseError | null } {
  const parsed = parseCommand(input);
  const error = validateCommand(parsed);
  return { parsed, error };
}

/**
 * Parse /issue command arguments
 */
export function parseIssueArgs(parsed: ParsedCommand): IssueCommandArgs | null {
  if (parsed.name !== "issue" || parsed.args.length === 0) {
    return null;
  }

  // Join all args as description
  return {
    description: parsed.rawArgs,
  };
}

/**
 * Parse /note command arguments
 */
export function parseNoteArgs(parsed: ParsedCommand): NoteCommandArgs | null {
  if (parsed.name !== "note" || parsed.args.length === 0) {
    return null;
  }

  // Check if first arg looks like a task ID (impl-XXX or US-XXX pattern)
  const firstArg = parsed.args[0];
  const taskIdPattern = /^(impl-\d+|us-\d+|review-\d+)$/i;

  if (firstArg !== undefined && taskIdPattern.test(firstArg) && parsed.args.length > 1) {
    return {
      taskId: firstArg,
      content: parsed.args.slice(1).join(" "),
    };
  }

  return {
    content: parsed.rawArgs,
  };
}

/**
 * Parse /priority command arguments
 */
export function parsePriorityArgs(parsed: ParsedCommand): PriorityCommandArgs | null {
  if (parsed.name !== "priority" || parsed.args.length !== 2) {
    return null;
  }

  const taskId = parsed.args[0];
  const priorityStr = parsed.args[1];

  if (taskId === undefined || priorityStr === undefined) {
    return null;
  }

  const priority = parseInt(priorityStr, 10);

  if (isNaN(priority)) {
    return null;
  }

  return {
    taskId,
    priority,
  };
}

/**
 * Parse /skip command arguments
 */
export function parseSkipArgs(parsed: ParsedCommand): SkipCommandArgs {
  if (parsed.name !== "skip") {
    return {};
  }

  if (parsed.rawArgs.length > 0) {
    return { reason: parsed.rawArgs };
  }

  return {};
}

/**
 * Parse /abort command arguments
 */
export function parseAbortArgs(parsed: ParsedCommand): AbortCommandArgs {
  if (parsed.name !== "abort") {
    return {};
  }

  const args: AbortCommandArgs = {};

  // Check for --force or -f flag
  if (parsed.args.includes("--force") || parsed.args.includes("-f")) {
    args.force = true;
    // Remove force flags from args to get reason
    const reasonArgs = parsed.args.filter((a) => a !== "--force" && a !== "-f");
    if (reasonArgs.length > 0) {
      args.reason = reasonArgs.join(" ");
    }
  } else if (parsed.rawArgs.length > 0) {
    args.reason = parsed.rawArgs;
  }

  return args;
}

/**
 * Parse /status command arguments
 */
export function parseStatusArgs(parsed: ParsedCommand): StatusCommandArgs {
  if (parsed.name !== "status") {
    return {};
  }

  // Check for -v or --verbose flag
  if (parsed.args.includes("-v") || parsed.args.includes("--verbose")) {
    // Remove verbose flags to check for task ID
    const remainingArgs = parsed.args.filter((a) => a !== "-v" && a !== "--verbose");
    const taskId = remainingArgs[0];
    if (taskId !== undefined) {
      return { verbose: true, taskId };
    }
    return { verbose: true };
  }

  const taskId = parsed.args[0];
  if (taskId !== undefined) {
    return { taskId };
  }

  return {};
}

/**
 * Parse /consensus command arguments
 */
export function parseConsensusArgs(parsed: ParsedCommand): ConsensusCommandArgs | null {
  if (parsed.name !== "consensus" || parsed.args.length === 0) {
    return null;
  }

  // Join all args as reason
  return {
    reason: parsed.rawArgs,
  };
}

/**
 * Valid reviewer subcommands
 */
const REVIEWER_SUBCOMMANDS = ["status", "pause", "resume", "skip"] as const;
type ReviewerSubcommand = (typeof REVIEWER_SUBCOMMANDS)[number];

/**
 * Check if string is a valid reviewer subcommand
 */
function isValidReviewerSubcommand(value: string): value is ReviewerSubcommand {
  return REVIEWER_SUBCOMMANDS.includes(value as ReviewerSubcommand);
}

/**
 * Parse /reviewer command arguments
 */
export function parseReviewerArgs(parsed: ParsedCommand): ReviewerCommandArgs | null {
  if (parsed.name !== "reviewer" || parsed.args.length === 0) {
    return null;
  }

  const subcommand = parsed.args[0]?.toLowerCase();
  if (!subcommand || !isValidReviewerSubcommand(subcommand)) {
    return null;
  }

  const result: ReviewerCommandArgs = { subcommand };

  // Skip requires a step ID
  if (subcommand === "skip") {
    const stepId = parsed.args[1];
    if (!stepId) {
      return null; // Missing step ID
    }
    result.stepId = stepId;
  }

  return result;
}

/**
 * Get color for command category (for UI styling)
 */
export function getCategoryColor(category: CommandCategory | null): string {
  switch (category) {
    case "control":
      return "#ffff55"; // Yellow
    case "prd":
      return "#55ffff"; // Cyan
    case "info":
      return "#55ff55"; // Green
    case "system":
      return "#ff55ff"; // Magenta
    default:
      return "#888888"; // Gray
  }
}

/**
 * Get help text for a specific command or all commands
 */
export function getHelpText(commandName?: string): string {
  if (commandName && isValidCommand(commandName)) {
    const def = COMMAND_DEFINITIONS[commandName];
    let help = `\n${def.usage}\n\n${def.description}\n`;
    if (def.examples.length > 0) {
      help += `\nExamples:\n${def.examples.map((e) => `  ${e}`).join("\n")}`;
    }
    return help;
  }

  // All commands grouped by category
  const categories: Record<CommandCategory, CommandDefinition[]> = {
    control: [],
    prd: [],
    info: [],
    system: [],
  };

  for (const def of Object.values(COMMAND_DEFINITIONS)) {
    categories[def.category].push(def);
  }

  let help = "\nAvailable Commands:\n";

  const categoryTitles: Record<CommandCategory, string> = {
    control: "Control",
    prd: "PRD Modification",
    info: "Information",
    system: "System",
  };

  for (const [cat, title] of Object.entries(categoryTitles)) {
    const defs = categories[cat as CommandCategory];
    if (defs.length > 0) {
      help += `\n${title}:\n`;
      for (const def of defs) {
        help += `  ${def.usage.padEnd(25)} ${def.description}\n`;
      }
    }
  }

  return help;
}

/**
 * Get command suggestions for partial input
 */
export function getCommandSuggestions(partial: string): CommandName[] {
  if (!partial.startsWith("/")) {
    return [];
  }

  const search = partial.slice(1).toLowerCase();
  return VALID_COMMAND_NAMES.filter((name) => name.startsWith(search));
}

/**
 * Format a command result for display
 */
export function formatCommandResult(
  command: string,
  success: boolean,
  message: string
): string {
  const prefix = success ? "[OK]" : "[ERROR]";
  return `${prefix} /${command}: ${message}`;
}

// Re-export types
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
  ReviewerCommandArgs,
} from "./types.js";
