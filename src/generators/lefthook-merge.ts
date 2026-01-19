/**
 * Lefthook configuration merger
 *
 * Provides utilities for progressively enhancing existing lefthook.yml
 * configurations without overwriting user customizations.
 *
 * Strategy:
 * 1. Parse existing lefthook.yml if present
 * 2. Detect what tools are already configured (by command names and tool references)
 * 3. Only add commands that don't already exist or serve the same purpose
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { readFile, exists } from "../utils/fs.js";
import { join } from "node:path";
import { stat } from "node:fs/promises";

// ============================================================================
// Types
// ============================================================================

export interface LefthookCommand {
  run: string;
  glob?: string;
  files?: string;
  only?: Array<{ glob: string }>;
  stage_fixed?: boolean;
  skip?: string[];
  priority?: number;
  [key: string]: unknown;
}

export interface LefthookHook {
  parallel?: boolean;
  commands?: Record<string, LefthookCommand>;
  jobs?: Array<{ name?: string; run: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface LefthookConfig {
  "pre-commit"?: LefthookHook;
  "pre-push"?: LefthookHook;
  "commit-msg"?: LefthookHook;
  "prepare-commit-msg"?: LefthookHook;
  extends?: string[];
  remotes?: Array<{ git_url: string; configs?: string[] }>;
  [key: string]: unknown;
}

/**
 * Categories of tools that serve the same purpose
 * If any tool in a category is detected, we skip adding commands for that category
 */
export interface ToolCategory {
  name: string;
  /** Tool names/binaries to detect in run commands */
  tools: string[];
  /** Command names that typically serve this purpose */
  commandNames: string[];
}

/**
 * Detected hook system information
 */
export interface DetectedHookSystem {
  /** Name of the hook system (e.g., "husky", "pre-commit") */
  name: string;
  /** What triggered the detection (e.g., ".husky/ directory") */
  indicator: string;
}

/**
 * Result of generateOrMergeLefthook
 */
export interface GenerateLefthookResult {
  /** Merged lefthook configuration, or null if skipped */
  config: LefthookConfig | null;
  /** Information about why generation was skipped */
  skipped?: {
    reason: string;
    hookSystem: DetectedHookSystem;
  };
}

// ============================================================================
// Tool Detection Configuration
// ============================================================================

/**
 * Tool categories - if any tool in a category is detected,
 * we don't add our default command for that category
 */
export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    name: "formatting",
    tools: [
      "prettier",
      "biome format",
      "biome check",
      "oxfmt",
      "dprint",
      "rome format",
    ],
    commandNames: ["format", "formatting", "prettier", "fmt"],
  },
  {
    name: "linting",
    tools: [
      "eslint",
      "biome lint",
      "biome check",
      "oxlint",
      "rome lint",
      "tslint",
      "xo",
      "standard",
    ],
    commandNames: ["lint", "linting", "eslint", "lint:check"],
  },
  {
    name: "typecheck",
    tools: ["tsc", "typescript", "typecheck", "type-check"],
    commandNames: ["typecheck", "type-check", "types", "tsc"],
  },
  {
    name: "testing",
    tools: [
      "vitest",
      "jest",
      "mocha",
      "ava",
      "tap",
      "bun test",
      "npm test",
      "yarn test",
      "pnpm test",
    ],
    commandNames: ["test", "tests", "testing", "unit-test"],
  },
  {
    name: "lockfile",
    tools: [
      "install --frozen-lockfile",
      "install --lockfile-only",
      "bun.lock",
      "package-lock",
      "pnpm-lock",
      "yarn.lock",
    ],
    commandNames: ["lockfile", "lockfile-check", "lock-check", "lock"],
  },
  {
    name: "secrets",
    tools: ["gitleaks", "trufflehog", "detect-secrets", "git-secrets"],
    commandNames: ["gitleaks", "secrets", "secret-scan", "security:secrets"],
  },
  {
    name: "commitlint",
    tools: ["commitlint", "commit-lint", "@commitlint"],
    commandNames: ["commitlint", "lint-message", "commit-lint"],
  },
  {
    name: "actionlint",
    tools: ["actionlint"],
    commandNames: ["actionlint", "action-lint", "workflow-lint"],
  },
  {
    name: "knip",
    tools: ["knip"],
    commandNames: ["knip", "unused-exports", "dead-code"],
  },
  {
    name: "db-check",
    tools: ["drizzle-kit", "prisma", "db:check", "db:sync"],
    commandNames: ["db-check", "db-sync", "database-check"],
  },
  {
    name: "trivy",
    tools: ["trivy"],
    commandNames: ["trivy", "trivy-iac", "security:iac"],
  },
  {
    name: "statix",
    tools: ["statix"],
    commandNames: ["statix", "nix-lint", "security:nix"],
  },
];

// ============================================================================
// Alternative Hook System Detection
// ============================================================================

/**
 * Known hook systems that we should not compete with
 */
interface HookSystemDetector {
  name: string;
  /** Check if this hook system is present */
  detect: (projectRoot: string) => Promise<DetectedHookSystem | null>;
}

/**
 * Detectors for alternative hook systems
 */
const HOOK_SYSTEM_DETECTORS: HookSystemDetector[] = [
  {
    name: "husky",
    detect: async (projectRoot: string): Promise<DetectedHookSystem | null> => {
      const huskyDir = join(projectRoot, ".husky");
      try {
        const stats = await stat(huskyDir);
        if (stats.isDirectory()) {
          return { name: "husky", indicator: ".husky/ directory" };
        }
      } catch {
        // Directory doesn't exist
      }
      return null;
    },
  },
  {
    name: "pre-commit",
    detect: async (projectRoot: string): Promise<DetectedHookSystem | null> => {
      // Check for .pre-commit-config.yaml or .pre-commit-config.yml
      // This also covers prek which uses the same config format
      for (const filename of [
        ".pre-commit-config.yaml",
        ".pre-commit-config.yml",
      ]) {
        const configPath = join(projectRoot, filename);
        if (await exists(configPath)) {
          return { name: "pre-commit", indicator: filename };
        }
      }
      return null;
    },
  },
  {
    name: "simple-git-hooks",
    detect: async (projectRoot: string): Promise<DetectedHookSystem | null> => {
      // Check package.json for simple-git-hooks config
      const packageJsonPath = join(projectRoot, "package.json");
      if (await exists(packageJsonPath)) {
        try {
          const content = await readFile(packageJsonPath);
          const pkg = JSON.parse(content);
          if (pkg["simple-git-hooks"]) {
            return {
              name: "simple-git-hooks",
              indicator: "simple-git-hooks in package.json",
            };
          }
        } catch {
          // Ignore parse errors
        }
      }
      return null;
    },
  },
  {
    name: "yorkie",
    detect: async (projectRoot: string): Promise<DetectedHookSystem | null> => {
      // Check package.json for yorkie in devDependencies
      const packageJsonPath = join(projectRoot, "package.json");
      if (await exists(packageJsonPath)) {
        try {
          const content = await readFile(packageJsonPath);
          const pkg = JSON.parse(content);
          if (pkg.devDependencies?.yorkie || pkg.dependencies?.yorkie) {
            return {
              name: "yorkie",
              indicator: "yorkie in package.json dependencies",
            };
          }
        } catch {
          // Ignore parse errors
        }
      }
      return null;
    },
  },
];

/**
 * Detect if an alternative hook system is already in use
 *
 * @param projectRoot - Project root directory
 * @returns Detected hook system info, or null if none found
 */
export async function detectExistingHookSystem(
  projectRoot: string
): Promise<DetectedHookSystem | null> {
  for (const detector of HOOK_SYSTEM_DETECTORS) {
    const result = await detector.detect(projectRoot);
    if (result) {
      return result;
    }
  }
  return null;
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Read and parse existing lefthook.yml if it exists
 *
 * @param projectRoot - Project root directory
 * @returns Parsed lefthook config or null if not found
 */
export async function parseExistingLefthook(
  projectRoot: string
): Promise<LefthookConfig | null> {
  const lefthookPath = join(projectRoot, "lefthook.yml");

  if (!(await exists(lefthookPath))) {
    return null;
  }

  try {
    const content = await readFile(lefthookPath);
    const config = parseYaml(content) as LefthookConfig;
    return config;
  } catch {
    // If we can't parse it, treat as non-existent
    return null;
  }
}

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Check if a tool is referenced in a run command
 *
 * @param runCommand - The run command string
 * @param tool - Tool name/pattern to search for
 * @returns true if tool is found
 */
function toolInCommand(runCommand: string, tool: string): boolean {
  // Normalize for comparison
  const normalized = runCommand.toLowerCase();
  const toolLower = tool.toLowerCase();

  // Check for exact match or as part of command
  return (
    normalized.includes(toolLower) ||
    // Also check for common patterns like "bun run format" or "npx prettier"
    normalized.includes(`run ${toolLower}`) ||
    normalized.includes(`npx ${toolLower}`) ||
    normalized.includes(`bunx ${toolLower}`)
  );
}

/**
 * Detect which tool categories are already configured in a hook
 *
 * @param hook - Lefthook hook configuration
 * @returns Set of category names that are already configured
 */
export function detectConfiguredCategories(hook: LefthookHook): Set<string> {
  const configured = new Set<string>();

  if (!hook.commands) {
    return configured;
  }

  for (const [commandName, command] of Object.entries(hook.commands)) {
    const normalizedName = commandName.toLowerCase();

    for (const category of TOOL_CATEGORIES) {
      // Check if command name matches any known names for this category
      if (
        category.commandNames.some(
          (name) =>
            normalizedName === name.toLowerCase() ||
            normalizedName.includes(name.toLowerCase())
        )
      ) {
        configured.add(category.name);
        continue;
      }

      // Check if run command contains any tools from this category
      if (
        command.run &&
        category.tools.some((tool) => toolInCommand(command.run, tool))
      ) {
        configured.add(category.name);
      }
    }
  }

  return configured;
}

/**
 * Get the category name for a command based on its name or run content
 *
 * @param commandName - Name of the command
 * @param command - Command configuration
 * @returns Category name or null if not recognized
 */
export function getCategoryForCommand(
  commandName: string,
  command: LefthookCommand
): string | null {
  const normalizedName = commandName.toLowerCase();

  for (const category of TOOL_CATEGORIES) {
    // Check command name
    if (
      category.commandNames.some(
        (name) =>
          normalizedName === name.toLowerCase() ||
          normalizedName.includes(name.toLowerCase())
      )
    ) {
      return category.name;
    }

    // Check run command
    if (
      command.run &&
      category.tools.some((tool) => toolInCommand(command.run, tool))
    ) {
      return category.name;
    }
  }

  return null;
}

// ============================================================================
// Merge Functions
// ============================================================================

/**
 * Merge new commands into existing hook, only adding what's missing
 *
 * @param existing - Existing hook configuration (may be undefined)
 * @param newCommands - New commands to potentially add
 * @returns Merged hook configuration
 */
export function mergeHookCommands(
  existing: LefthookHook | undefined,
  newCommands: Record<string, LefthookCommand>
): LefthookHook {
  // If no existing hook, just use new commands (but preserve parallel setting if any)
  if (!existing || !existing.commands) {
    return {
      parallel: true,
      commands: { ...newCommands },
    };
  }

  // Detect what categories are already configured
  const configuredCategories = detectConfiguredCategories(existing);

  // Build merged commands - start with existing
  const mergedCommands: Record<string, LefthookCommand> = {
    ...existing.commands,
  };

  // Add new commands only if their category isn't already configured
  for (const [name, command] of Object.entries(newCommands)) {
    // Skip if command already exists by name
    if (existing.commands[name]) {
      continue;
    }

    // Check if this command's category is already covered
    const category = getCategoryForCommand(name, command);
    if (category && configuredCategories.has(category)) {
      // Category already configured, skip
      continue;
    }

    // Add the new command
    mergedCommands[name] = command;
  }

  return {
    ...existing,
    commands: mergedCommands,
  };
}

/**
 * Merge two lefthook configurations, preserving existing customizations
 *
 * @param existing - Existing lefthook configuration
 * @param additions - New configuration to merge in
 * @returns Merged configuration
 */
export function mergeLefthookConfigs(
  existing: LefthookConfig | null,
  additions: LefthookConfig
): LefthookConfig {
  // If no existing config, return additions as-is
  if (!existing) {
    return additions;
  }

  const merged: LefthookConfig = { ...existing };

  // Merge each hook type
  const hookTypes = [
    "pre-commit",
    "pre-push",
    "commit-msg",
    "prepare-commit-msg",
  ] as const;

  for (const hookType of hookTypes) {
    const existingHook = existing[hookType];
    const newHook = additions[hookType];

    if (newHook?.commands) {
      merged[hookType] = mergeHookCommands(existingHook, newHook.commands);
    }
  }

  return merged;
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize lefthook config to YAML string
 *
 * @param config - Lefthook configuration
 * @returns YAML string
 */
export function serializeLefthookConfig(config: LefthookConfig): string {
  // Add header comment
  const header = `# Generated by bootsralph
# Pre-commit hooks for code quality and consistency
# Docs: https://github.com/evilmartians/lefthook

`;

  return header + stringifyYaml(config, { lineWidth: 0 });
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Options for generating/merging lefthook configuration
 */
export interface GenerateLefthookOptions {
  /** Project root directory */
  projectRoot: string;
  /** New commands to add to pre-commit */
  preCommitCommands?: Record<string, LefthookCommand>;
  /** New commands to add to pre-push */
  prePushCommands?: Record<string, LefthookCommand>;
  /** New commands to add to commit-msg */
  commitMsgCommands?: Record<string, LefthookCommand>;
  /** New commands to add to prepare-commit-msg */
  prepareCommitMsgCommands?: Record<string, LefthookCommand>;
  /** Force overwrite (don't merge) */
  force?: boolean;
  /** Skip generation if another hook system is detected (default: true) */
  skipIfOtherHookSystem?: boolean;
}

/**
 * Generate or merge lefthook configuration
 *
 * If an existing lefthook.yml exists, merges new commands intelligently.
 * Only adds commands for categories not already configured.
 *
 * If another hook system (husky, pre-commit, etc.) is detected,
 * generation is skipped by default to avoid conflicts.
 *
 * @param options - Generation options
 * @returns Result containing merged config or skip information
 */
export async function generateOrMergeLefthook(
  options: GenerateLefthookOptions
): Promise<GenerateLefthookResult> {
  const {
    projectRoot,
    preCommitCommands,
    prePushCommands,
    commitMsgCommands,
    prepareCommitMsgCommands,
    force = false,
    skipIfOtherHookSystem = true,
  } = options;

  // Check for other hook systems first (unless force mode)
  if (!force && skipIfOtherHookSystem) {
    const existingHookSystem = await detectExistingHookSystem(projectRoot);
    if (existingHookSystem) {
      return {
        config: null,
        skipped: {
          reason: `Project already uses ${existingHookSystem.name} for git hooks`,
          hookSystem: existingHookSystem,
        },
      };
    }
  }

  // Build the new config
  const newConfig: LefthookConfig = {};

  if (preCommitCommands && Object.keys(preCommitCommands).length > 0) {
    newConfig["pre-commit"] = {
      parallel: true,
      commands: preCommitCommands,
    };
  }

  if (prePushCommands && Object.keys(prePushCommands).length > 0) {
    newConfig["pre-push"] = {
      parallel: true,
      commands: prePushCommands,
    };
  }

  if (commitMsgCommands && Object.keys(commitMsgCommands).length > 0) {
    newConfig["commit-msg"] = {
      commands: commitMsgCommands,
    };
  }

  if (
    prepareCommitMsgCommands &&
    Object.keys(prepareCommitMsgCommands).length > 0
  ) {
    newConfig["prepare-commit-msg"] = {
      commands: prepareCommitMsgCommands,
    };
  }

  // If force mode, just return new config
  if (force) {
    return { config: newConfig };
  }

  // Try to parse existing config and merge
  const existingConfig = await parseExistingLefthook(projectRoot);
  return { config: mergeLefthookConfigs(existingConfig, newConfig) };
}
