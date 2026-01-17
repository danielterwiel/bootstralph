/**
 * Git hooks configuration generator
 * Generates and writes pre-commit hook configurations for Lefthook, Husky, and prek
 *
 * Supports:
 * - Lefthook (recommended): Fast, parallel, works with any package manager
 * - Husky: Popular, well-documented, ESM-compatible
 * - prek: 10x faster than pre-commit, uses npm for Node.js hook environments
 */

import path from "node:path";
import fs from "fs-extra";
import { execa } from "execa";
import {
  generateLefthookYml,
  type LefthookConfig,
} from "../templates/lefthook.yml.js";
import type {
  Linter,
  Formatter,
  Framework,
  PreCommitTool,
} from "../compatibility/matrix.js";

// ============================================================================
// Types
// ============================================================================

export interface HooksConfig {
  /** Pre-commit tool to use */
  preCommitTool: PreCommitTool;
  /** Linter choice */
  linter: Linter;
  /** Formatter choice */
  formatter: Formatter;
  /** Target framework */
  framework: Framework;
  /** Package manager */
  packageManager: "bun" | "pnpm" | "npm" | "yarn";
  /** Include typecheck in pre-commit */
  includeTypecheck?: boolean;
  /** Include commitlint for commit message validation */
  includeCommitlint?: boolean;
}

export interface WriteHooksOptions {
  /** Project directory path */
  projectPath: string;
  /** Hooks configuration */
  config: HooksConfig;
  /** Overwrite existing configuration */
  overwrite?: boolean;
  /** Install hook tool after generating config */
  installHooks?: boolean;
}

export interface WriteHooksResult {
  success: boolean;
  /** Files that were created or modified */
  filesWritten: string[];
  /** Any warnings during generation */
  warnings?: string[];
  /** Error message if failed */
  error?: string;
  /** Instructions for manual steps if needed */
  manualSteps?: string[];
}

// ============================================================================
// Lefthook Generator
// ============================================================================

/**
 * Write Lefthook configuration to project
 */
async function writeLefthookConfig(
  projectPath: string,
  config: HooksConfig,
  overwrite: boolean
): Promise<WriteHooksResult> {
  const filePath = path.join(projectPath, "lefthook.yml");
  const filesWritten: string[] = [];
  const warnings: string[] = [];
  const manualSteps: string[] = [];

  try {
    // Check if file exists and overwrite is not enabled
    if (!overwrite && (await fs.pathExists(filePath))) {
      return {
        success: false,
        filesWritten: [],
        error: "lefthook.yml already exists. Use overwrite option to replace.",
      };
    }

    // Generate config
    const lefthookConfig: LefthookConfig = {
      linter: config.linter,
      formatter: config.formatter,
      framework: config.framework,
      parallel: true,
      includeTypecheck: config.includeTypecheck ?? true,
      includeCommitlint: config.includeCommitlint ?? false,
      skipFormatForBiome: true,
    };

    const content = generateLefthookYml(lefthookConfig);

    // Write file
    await fs.writeFile(filePath, content, "utf-8");
    filesWritten.push("lefthook.yml");

    // Add manual step for hook installation
    manualSteps.push("npx lefthook install");

    const result: WriteHooksResult = {
      success: true,
      filesWritten,
    };

    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    if (manualSteps.length > 0) {
      result.manualSteps = manualSteps;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      filesWritten,
      error: `Failed to write Lefthook config: ${errorMessage}`,
    };
  }
}

// ============================================================================
// Husky Generator
// ============================================================================

/**
 * Build lint-staged config content based on linter and formatter
 */
function buildLintStagedConfig(config: HooksConfig): string {
  const { linter, formatter, framework } = config;

  const jsGlob = framework === "astro"
    ? "*.{js,jsx,ts,tsx,astro}"
    : "*.{js,jsx,ts,tsx}";

  const formatGlob = framework === "astro"
    ? "*.{js,jsx,ts,tsx,json,css,md,astro}"
    : "*.{js,jsx,ts,tsx,json,css,md}";

  // Build lint command
  let lintCommand: string;
  switch (linter) {
    case "oxlint":
      lintCommand = "oxlint --fix";
      break;
    case "biome":
      lintCommand = "biome check --write";
      break;
    case "eslint":
      lintCommand = "eslint --fix";
      break;
  }

  // Build format command
  let formatCommand: string;
  switch (formatter) {
    case "oxfmt":
      formatCommand = "oxfmt";
      break;
    case "biome":
      formatCommand = "biome format --write";
      break;
    case "prettier":
      formatCommand = framework === "astro"
        ? "prettier --write --plugin prettier-plugin-astro"
        : "prettier --write";
      break;
  }

  // If Biome handles both, don't add separate format step
  const skipFormat = linter === "biome";

  const rules: Record<string, string | string[]> = {};

  // Add lint rule
  rules[jsGlob] = lintCommand;

  // Add format rule (unless Biome handles both)
  if (!skipFormat) {
    rules[formatGlob] = formatCommand;
  }

  // ESM export format for modern projects
  return `export default ${JSON.stringify(rules, null, 2)};
`;
}

/**
 * Write Husky configuration to project
 */
async function writeHuskyConfig(
  projectPath: string,
  config: HooksConfig,
  overwrite: boolean
): Promise<WriteHooksResult> {
  const huskyDir = path.join(projectPath, ".husky");
  const preCommitPath = path.join(huskyDir, "pre-commit");
  const lintStagedPath = path.join(projectPath, "lint-staged.config.js");
  const filesWritten: string[] = [];
  const warnings: string[] = [];
  const manualSteps: string[] = [];

  try {
    // Check if files exist and overwrite is not enabled
    if (!overwrite) {
      if (await fs.pathExists(huskyDir)) {
        return {
          success: false,
          filesWritten: [],
          error: ".husky directory already exists. Use overwrite option to replace.",
        };
      }
    }

    // Create .husky directory
    await fs.ensureDir(huskyDir);

    // Write pre-commit hook
    const preCommitContent = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
`;

    await fs.writeFile(preCommitPath, preCommitContent, { mode: 0o755 });
    filesWritten.push(".husky/pre-commit");

    // Write lint-staged config (ESM format)
    const lintStagedContent = buildLintStagedConfig(config);
    await fs.writeFile(lintStagedPath, lintStagedContent, "utf-8");
    filesWritten.push("lint-staged.config.js");

    // Add commit-msg hook if commitlint is enabled
    if (config.includeCommitlint) {
      const commitMsgPath = path.join(huskyDir, "commit-msg");
      const commitMsgContent = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx --no -- commitlint --edit $1
`;

      await fs.writeFile(commitMsgPath, commitMsgContent, { mode: 0o755 });
      filesWritten.push(".husky/commit-msg");

      // Add commitlint config (ESM format for ESM projects)
      const commitlintConfigPath = path.join(projectPath, "commitlint.config.cjs");
      const commitlintContent = `module.exports = {
  extends: ['@commitlint/config-conventional'],
};
`;

      await fs.writeFile(commitlintConfigPath, commitlintContent, "utf-8");
      filesWritten.push("commitlint.config.cjs");

      warnings.push(
        "commitlint.config.cjs uses CommonJS format for ESM compatibility"
      );
    }

    // Manual steps
    manualSteps.push("npx husky install");
    manualSteps.push('Ensure package.json has "prepare": "husky" script');

    const result: WriteHooksResult = {
      success: true,
      filesWritten,
    };

    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    if (manualSteps.length > 0) {
      result.manualSteps = manualSteps;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      filesWritten,
      error: `Failed to write Husky config: ${errorMessage}`,
    };
  }
}

// ============================================================================
// prek Generator
// ============================================================================

/**
 * Generate .pre-commit-config.yaml for prek
 * prek is compatible with pre-commit config format
 */
function buildPrekConfig(config: HooksConfig): string {
  const { linter, formatter, framework } = config;

  // prek uses the same format as pre-commit
  const repos: Array<{
    repo: string;
    rev?: string;
    hooks: Array<{ id: string; args?: string[]; types?: string[] }>;
  }> = [];

  // Add linter repo
  switch (linter) {
    case "oxlint":
      repos.push({
        repo: "local",
        hooks: [
          {
            id: "oxlint",
            args: ["--fix"],
            types: ["javascript", "typescript", "jsx", "tsx"],
          },
        ],
      });
      break;
    case "biome":
      repos.push({
        repo: "local",
        hooks: [
          {
            id: "biome",
            args: ["check", "--write"],
            types: ["javascript", "typescript", "jsx", "tsx"],
          },
        ],
      });
      break;
    case "eslint":
      repos.push({
        repo: "local",
        hooks: [
          {
            id: "eslint",
            args: ["--fix"],
            types: ["javascript", "typescript", "jsx", "tsx"],
          },
        ],
      });
      break;
  }

  // Add formatter repo (unless Biome handles both)
  if (linter !== "biome") {
    switch (formatter) {
      case "oxfmt":
        repos.push({
          repo: "local",
          hooks: [
            {
              id: "oxfmt",
              types: ["javascript", "typescript", "jsx", "tsx", "json", "css", "markdown"],
            },
          ],
        });
        break;
      case "prettier":
        repos.push({
          repo: "local",
          hooks: [
            {
              id: "prettier",
              args: framework === "astro"
                ? ["--write", "--plugin", "prettier-plugin-astro"]
                : ["--write"],
              types: ["javascript", "typescript", "jsx", "tsx", "json", "css", "markdown"],
            },
          ],
        });
        break;
    }
  }

  // Build YAML content
  const lines: string[] = ["repos:"];

  for (const repo of repos) {
    lines.push(`  - repo: ${repo.repo}`);
    if (repo.rev) {
      lines.push(`    rev: ${repo.rev}`);
    }
    lines.push("    hooks:");

    for (const hook of repo.hooks) {
      lines.push(`      - id: ${hook.id}`);
      if (hook.args && hook.args.length > 0) {
        lines.push(`        args: [${hook.args.map((a) => `"${a}"`).join(", ")}]`);
      }
      if (hook.types && hook.types.length > 0) {
        lines.push(`        types: [${hook.types.join(", ")}]`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Write prek configuration to project
 */
async function writePrekConfig(
  projectPath: string,
  config: HooksConfig,
  overwrite: boolean
): Promise<WriteHooksResult> {
  const filePath = path.join(projectPath, ".pre-commit-config.yaml");
  const filesWritten: string[] = [];
  const warnings: string[] = [];
  const manualSteps: string[] = [];

  try {
    // Check if file exists and overwrite is not enabled
    if (!overwrite && (await fs.pathExists(filePath))) {
      return {
        success: false,
        filesWritten: [],
        error:
          ".pre-commit-config.yaml already exists. Use overwrite option to replace.",
      };
    }

    // Generate config
    const content = buildPrekConfig(config);

    // Write file
    await fs.writeFile(filePath, content, "utf-8");
    filesWritten.push(".pre-commit-config.yaml");

    // Add warnings about prek
    warnings.push(
      "prek uses npm for Node.js hook environments regardless of project package manager"
    );

    // Manual steps
    manualSteps.push(
      "Install prek: cargo install prek OR download from GitHub releases"
    );
    manualSteps.push("prek install");

    const result: WriteHooksResult = {
      success: true,
      filesWritten,
    };

    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    if (manualSteps.length > 0) {
      result.manualSteps = manualSteps;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      filesWritten,
      error: `Failed to write prek config: ${errorMessage}`,
    };
  }
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Write git hooks configuration to project
 */
export async function writeHooksConfig(
  options: WriteHooksOptions
): Promise<WriteHooksResult> {
  const { projectPath, config, overwrite = false, installHooks = false } = options;

  // Verify project directory exists
  const projectExists = await fs.pathExists(projectPath);
  if (!projectExists) {
    return {
      success: false,
      filesWritten: [],
      error: `Project directory does not exist: ${projectPath}`,
    };
  }

  // Generate config based on tool choice
  let result: WriteHooksResult;

  switch (config.preCommitTool) {
    case "lefthook":
      result = await writeLefthookConfig(projectPath, config, overwrite);
      break;
    case "husky":
      result = await writeHuskyConfig(projectPath, config, overwrite);
      break;
    case "prek":
      result = await writePrekConfig(projectPath, config, overwrite);
      break;
  }

  // Install hooks if requested
  if (result.success && installHooks) {
    try {
      await installGitHooks(projectPath, config.preCommitTool);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const warnings = result.warnings ?? [];
      warnings.push(`Hook installation failed: ${errorMessage}`);
      result.warnings = warnings;
    }
  }

  return result;
}

/**
 * Install git hooks using the configured tool
 */
async function installGitHooks(
  projectPath: string,
  tool: PreCommitTool
): Promise<void> {
  switch (tool) {
    case "lefthook":
      await execa("npx", ["lefthook", "install"], { cwd: projectPath });
      break;
    case "husky":
      await execa("npx", ["husky", "install"], { cwd: projectPath });
      break;
    case "prek":
      // prek needs to be installed via cargo, then run prek install
      await execa("prek", ["install"], { cwd: projectPath });
      break;
  }
}

/**
 * Check if git hooks are installed in the project
 */
export async function hasHooksInstalled(
  projectPath: string,
  tool: PreCommitTool
): Promise<boolean> {
  const gitHooksPath = path.join(projectPath, ".git", "hooks");

  switch (tool) {
    case "lefthook":
      // Check for lefthook.yml and .git/hooks/pre-commit
      const lefthookConfigExists = await fs.pathExists(
        path.join(projectPath, "lefthook.yml")
      );
      const lefthookHookExists = await fs.pathExists(
        path.join(gitHooksPath, "pre-commit")
      );
      return lefthookConfigExists && lefthookHookExists;

    case "husky":
      // Check for .husky directory
      return fs.pathExists(path.join(projectPath, ".husky"));

    case "prek":
      // Check for .pre-commit-config.yaml
      return fs.pathExists(path.join(projectPath, ".pre-commit-config.yaml"));
  }
}

/**
 * Get hooks configuration file path for a tool
 */
export function getHooksConfigPath(
  projectPath: string,
  tool: PreCommitTool
): string {
  switch (tool) {
    case "lefthook":
      return path.join(projectPath, "lefthook.yml");
    case "husky":
      return path.join(projectPath, ".husky", "pre-commit");
    case "prek":
      return path.join(projectPath, ".pre-commit-config.yaml");
  }
}

/**
 * Read existing hooks configuration from a project
 */
export async function readHooksConfig(
  projectPath: string,
  tool: PreCommitTool
): Promise<string | null> {
  const configPath = getHooksConfigPath(projectPath, tool);

  try {
    if (await fs.pathExists(configPath)) {
      return fs.readFile(configPath, "utf-8");
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  generateLefthookYml,
  type LefthookConfig,
} from "../templates/lefthook.yml.js";
