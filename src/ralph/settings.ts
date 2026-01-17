/**
 * Claude Code settings generator
 * Generates and writes .claude/settings.json and .claude/settings.local.json
 *
 * Settings file hierarchy (highest to lowest precedence):
 * 1. .claude/settings.local.json - Project settings (private, not tracked)
 * 2. .claude/settings.json - Project settings (shared, tracked in git)
 * 3. ~/.claude/settings.json - User settings (all projects)
 * 4. Managed settings - Enterprise policies
 *
 * NOTE: permissions.deny rules are NOT reliably enforced for Read/Write/Edit
 * tools as of late 2025. PreToolUse hooks are recommended for security.
 */

import path from "node:path";
import fs from "fs-extra";
import {
  generateClaudeSettingsJson,
  generateClaudeSettingsLocal,
  type ClaudeSettingsConfig,
  type ClaudeSettings,
} from "../templates/.claude/settings.json.js";
import type { Framework, ORM, Backend, AuthProvider } from "../compatibility/matrix.js";

// ============================================================================
// Types
// ============================================================================

export interface WriteClaudeSettingsOptions {
  /** Project directory path */
  projectPath: string;
  /** Settings configuration */
  config: ClaudeSettingsConfig;
  /** Overwrite existing settings if present */
  overwrite?: boolean;
  /** Also generate settings.local.json template */
  generateLocal?: boolean;
  /** Add .claude/settings.local.json to .gitignore */
  updateGitignore?: boolean;
}

export interface WriteClaudeSettingsResult {
  success: boolean;
  /** Files that were created or modified */
  filesWritten: string[];
  /** Any warnings during generation */
  warnings?: string[];
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Write Claude Code settings to project directory
 */
export async function writeClaudeSettings(
  options: WriteClaudeSettingsOptions
): Promise<WriteClaudeSettingsResult> {
  const {
    projectPath,
    config,
    overwrite = false,
    generateLocal = true,
    updateGitignore = true,
  } = options;

  const claudeDir = path.join(projectPath, ".claude");
  const settingsPath = path.join(claudeDir, "settings.json");
  const settingsLocalPath = path.join(claudeDir, "settings.local.json");
  const filesWritten: string[] = [];
  const warnings: string[] = [];

  try {
    // Verify project directory exists
    const projectExists = await fs.pathExists(projectPath);
    if (!projectExists) {
      return {
        success: false,
        filesWritten: [],
        error: `Project directory does not exist: ${projectPath}`,
      };
    }

    // Check if settings already exist
    if (!overwrite && (await fs.pathExists(settingsPath))) {
      return {
        success: false,
        filesWritten: [],
        error: ".claude/settings.json already exists. Use overwrite option to replace.",
      };
    }

    // Ensure .claude directory exists
    await fs.ensureDir(claudeDir);

    // Generate and write settings.json
    const settingsContent = generateClaudeSettingsJson(config);
    await fs.writeFile(settingsPath, settingsContent, "utf-8");
    filesWritten.push(".claude/settings.json");

    // Generate settings.local.json template if requested
    if (generateLocal && (overwrite || !(await fs.pathExists(settingsLocalPath)))) {
      const localSettings = generateClaudeSettingsLocal();
      const localContent = JSON.stringify(localSettings, null, 2);
      await fs.writeFile(settingsLocalPath, localContent, "utf-8");
      filesWritten.push(".claude/settings.local.json");
    }

    // Update .gitignore to exclude settings.local.json
    if (updateGitignore) {
      const gitignorePath = path.join(projectPath, ".gitignore");
      const gitignoreEntry = ".claude/settings.local.json";

      if (await fs.pathExists(gitignorePath)) {
        const gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
        if (!gitignoreContent.includes(gitignoreEntry)) {
          const newContent = gitignoreContent.trimEnd() + "\n\n# Claude Code local settings\n" + gitignoreEntry + "\n";
          await fs.writeFile(gitignorePath, newContent, "utf-8");
          filesWritten.push(".gitignore (updated)");
        }
      } else {
        // Create .gitignore with the entry
        const content = "# Claude Code local settings\n" + gitignoreEntry + "\n";
        await fs.writeFile(gitignorePath, content, "utf-8");
        filesWritten.push(".gitignore");
      }
    }

    // Add security warning about deny rule enforcement
    warnings.push(
      "Note: permissions.deny rules may not be reliably enforced. " +
        "PreToolUse hooks are included for security."
    );

    const result: WriteClaudeSettingsResult = {
      success: true,
      filesWritten,
    };

    if (warnings.length > 0) {
      result.warnings = warnings;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      filesWritten,
      error: `Failed to write Claude Code settings: ${errorMessage}`,
    };
  }
}

/**
 * Check if Claude Code settings exist in a project
 */
export async function hasClaudeSettings(projectPath: string): Promise<boolean> {
  const settingsPath = path.join(projectPath, ".claude", "settings.json");
  return fs.pathExists(settingsPath);
}

/**
 * Read existing Claude Code settings from a project
 */
export async function readClaudeSettings(
  projectPath: string
): Promise<ClaudeSettings | null> {
  const settingsPath = path.join(projectPath, ".claude", "settings.json");

  try {
    if (await fs.pathExists(settingsPath)) {
      const content = await fs.readFile(settingsPath, "utf-8");
      return JSON.parse(content) as ClaudeSettings;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the path to Claude Code settings file
 */
export function getClaudeSettingsPath(projectPath: string): string {
  return path.join(projectPath, ".claude", "settings.json");
}

/**
 * Get the path to Claude Code local settings file
 */
export function getClaudeSettingsLocalPath(projectPath: string): string {
  return path.join(projectPath, ".claude", "settings.local.json");
}

/**
 * Generate Claude Code settings content without writing to file
 * Useful for previewing or testing
 */
export function generateClaudeSettingsContent(
  config: ClaudeSettingsConfig
): string {
  return generateClaudeSettingsJson(config);
}

/**
 * Create a ClaudeSettingsConfig from common project options
 */
export function createClaudeSettingsConfig(options: {
  projectName: string;
  framework: Framework;
  orm?: ORM;
  backend?: Backend;
  auth?: AuthProvider;
  usePreToolUseHooks?: boolean;
}): ClaudeSettingsConfig {
  const config: ClaudeSettingsConfig = {
    projectName: options.projectName,
    framework: options.framework,
    usePreToolUseHooks: options.usePreToolUseHooks ?? true,
    includeCommonDenyPatterns: true,
    includeDevAllowPatterns: true,
  };

  if (options.orm !== undefined) {
    config.orm = options.orm;
  }
  if (options.backend !== undefined) {
    config.backend = options.backend;
  }
  if (options.auth !== undefined) {
    config.auth = options.auth;
  }

  return config;
}

// ============================================================================
// Re-exports
// ============================================================================

// Re-export template functions for direct use
export {
  generateClaudeSettings,
  generateClaudeSettingsJson,
  generateMinimalClaudeSettings,
  generateClaudeSettingsLocal,
} from "../templates/.claude/settings.json.js";

// Re-export types
export type {
  ClaudeSettingsConfig,
  ClaudeSettings,
} from "../templates/.claude/settings.json.js";
