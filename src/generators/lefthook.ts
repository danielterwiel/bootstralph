/**
 * Lefthook generator
 *
 * Generates lefthook.yml configuration file with progressive enhancement.
 * Preserves existing user customizations and only adds commands that
 * don't already exist or serve the same purpose.
 */

import { writeFile } from "../utils/fs.js";
import { join } from "node:path";
import type { StackConfig } from "../types.js";
import { getPackageManagerRunnerString } from "../utils/package-manager.js";
import {
  generateOrMergeLefthook,
  serializeLefthookConfig,
  type LefthookCommand,
  type DetectedHookSystem,
} from "./lefthook-merge.js";

// ============================================================================
// Types
// ============================================================================

// Re-export StackConfig for convenience
export type { StackConfig } from "../types.js";

// Re-export detection types
export type { DetectedHookSystem } from "./lefthook-merge.js";

/**
 * Options for lefthook generation
 */
export interface GenerateLefthookOptions {
  /** Force overwrite existing config (default: false for progressive enhancement) */
  force?: boolean;
}

/**
 * Result of lefthook generation
 */
export type GenerateLefthookGeneratorResult =
  | { success: true; path: string }
  | {
      success: false;
      skipped: true;
      reason: string;
      hookSystem: DetectedHookSystem;
    };

// ============================================================================
// Command Builders
// ============================================================================

/**
 * Build lockfile check command for a package manager
 */
function buildLockfileCommand(packageManager: string): LefthookCommand {
  // Different package managers have different lockfile check approaches
  switch (packageManager) {
    case "bun":
      return {
        glob: "package.json",
        run: `bun install --lockfile-only --no-save 2>/dev/null && git diff --quiet bun.lock || (echo "Lockfile was out of sync, auto-fixing..." && git add bun.lock)`,
        skip: ["merge", "rebase"],
      };
    case "pnpm":
      return {
        glob: "package.json",
        run: `pnpm install --lockfile-only 2>/dev/null && git diff --quiet pnpm-lock.yaml || (echo "Lockfile was out of sync, auto-fixing..." && git add pnpm-lock.yaml)`,
        skip: ["merge", "rebase"],
      };
    case "yarn":
      return {
        glob: "package.json",
        run: `yarn install --mode update-lockfile 2>/dev/null && git diff --quiet yarn.lock || (echo "Lockfile was out of sync, auto-fixing..." && git add yarn.lock)`,
        skip: ["merge", "rebase"],
      };
    default: // npm
      return {
        glob: "package.json",
        run: `npm install --package-lock-only 2>/dev/null && git diff --quiet package-lock.json || (echo "Lockfile was out of sync, auto-fixing..." && git add package-lock.json)`,
        skip: ["merge", "rebase"],
      };
  }
}

/**
 * Build format command
 */
function buildFormatCommand(packageManager: string): LefthookCommand {
  return {
    glob: "*.{ts,tsx,js,jsx,json,md,yaml,yml}",
    run: `${packageManager} run format -- --no-error-on-unmatched-pattern {staged_files}`,
    stage_fixed: true,
  };
}

/**
 * Build lint command
 */
function buildLintCommand(packageManager: string): LefthookCommand {
  return {
    only: [{ glob: "**/*.{ts,tsx,js,jsx}" }],
    run: `${packageManager} run lint:check --force`,
  };
}

/**
 * Build typecheck command
 */
function buildTypecheckCommand(packageManager: string): LefthookCommand {
  return {
    only: [{ glob: "**/*.{ts,tsx}" }],
    run: `${packageManager} run typecheck`,
  };
}

/**
 * Build test command
 */
function buildTestCommand(packageManager: string): LefthookCommand {
  return {
    only: [
      { glob: "**/*.{ts,tsx}" },
      { glob: "**/*.test.{ts,tsx}" },
      { glob: "**/*.spec.{ts,tsx}" },
    ],
    run: `${packageManager} run test`,
  };
}

/**
 * Build skills-sync command
 */
function buildSkillsSyncCommand(packageManagerRunner: string): LefthookCommand {
  return {
    glob: "package.json",
    run: `${packageManagerRunner} bootstralph sync --quiet`,
  };
}

// ============================================================================
// Generator Function
// ============================================================================

/**
 * Generate lefthook.yml with progressive enhancement
 *
 * If an existing lefthook.yml exists, merges new commands intelligently.
 * Only adds commands for categories not already configured.
 *
 * If another hook system (husky, pre-commit, etc.) is detected,
 * generation is skipped and information is returned about the existing system.
 *
 * Detection works by:
 * 1. Checking command names (e.g., "format", "lint", "typecheck")
 * 2. Checking tool references in run commands (e.g., "prettier", "biome", "eslint")
 *
 * @param config - Stack configuration containing tooling settings
 * @param outputDir - Directory where lefthook.yml should be written (default: cwd)
 * @param options - Generation options
 * @returns Promise resolving to success with path, or skipped with reason
 *
 * @example
 * ```typescript
 * const config: StackConfig = {
 *   packageManager: "bun",
 *   tooling: {
 *     linting: true,
 *     formatting: true,
 *     hasTypeScript: true,
 *     hasTests: true,
 *   },
 * };
 *
 * // Progressive enhancement (default) - preserves existing commands
 * const result = await generateLefthook(config);
 * if (result.success) {
 *   console.log(`Generated: ${result.path}`);
 * } else {
 *   console.log(`Skipped: ${result.reason}`);
 * }
 *
 * // Force overwrite - replaces entire config, ignores other hook systems
 * const result = await generateLefthook(config, "/path/to/project", { force: true });
 * ```
 */
export async function generateLefthook(
  config: StackConfig,
  outputDir: string = process.cwd(),
  options: GenerateLefthookOptions = {},
): Promise<GenerateLefthookGeneratorResult> {
  const { force = false } = options;
  const packageManager = config.packageManager;
  const packageManagerRunner = getPackageManagerRunnerString(packageManager);

  // Build commands based on config
  const preCommitCommands: Record<string, LefthookCommand> = {};

  // Always add lockfile check if we have a package manager
  if (packageManager) {
    preCommitCommands["lockfile"] = buildLockfileCommand(packageManager);
  }

  // Add format command if formatting is enabled
  if (config.tooling?.formatting) {
    preCommitCommands["format"] = buildFormatCommand(packageManager);
  }

  // Add lint command if linting is enabled
  if (config.tooling?.linting) {
    preCommitCommands["lint"] = buildLintCommand(packageManager);
  }

  // Add typecheck if TypeScript is used
  if (config.tooling?.hasTypeScript) {
    preCommitCommands["typecheck"] = buildTypecheckCommand(packageManager);
  }

  // Add test command if tests are enabled
  if (config.tooling?.hasTests) {
    preCommitCommands["test"] = buildTestCommand(packageManager);
  }

  // Always add skills-sync
  preCommitCommands["skills-sync"] =
    buildSkillsSyncCommand(packageManagerRunner);

  // Generate or merge configuration (checks for other hook systems)
  const result = await generateOrMergeLefthook({
    projectRoot: outputDir,
    preCommitCommands,
    force,
  });

  // If skipped due to other hook system, return skip info
  if (result.skipped) {
    return {
      success: false,
      skipped: true,
      reason: result.skipped.reason,
      hookSystem: result.skipped.hookSystem,
    };
  }

  // Serialize and write
  const yamlContent = serializeLefthookConfig(result.config!);
  const outputPath = join(outputDir, "lefthook.yml");
  await writeFile(outputPath, yamlContent);

  return { success: true, path: outputPath };
}
