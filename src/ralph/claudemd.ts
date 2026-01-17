/**
 * CLAUDE.md generator
 * Generates and writes CLAUDE.md file for projects scaffolded with bootstralph
 */

import path from "node:path";
import fs from "fs-extra";
import { generateClaudeMd, type ClaudeMdConfig } from "../templates/CLAUDE.md.js";

// ============================================================================
// Types
// ============================================================================

export interface GenerateClaudeMdOptions {
  /** Project directory path */
  projectPath: string;
  /** Project configuration */
  config: ClaudeMdConfig;
  /** Overwrite existing CLAUDE.md if present */
  overwrite?: boolean;
}

export interface GenerateClaudeMdResult {
  success: boolean;
  filePath: string;
  error?: string;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generate and write CLAUDE.md file to the project directory
 */
export async function writeClaudeMd(
  options: GenerateClaudeMdOptions
): Promise<GenerateClaudeMdResult> {
  const { projectPath, config, overwrite = false } = options;
  const filePath = path.join(projectPath, "CLAUDE.md");

  try {
    // Check if file exists and overwrite is not enabled
    if (!overwrite && (await fs.pathExists(filePath))) {
      return {
        success: false,
        filePath,
        error: "CLAUDE.md already exists. Use overwrite option to replace.",
      };
    }

    // Generate content
    const content = generateClaudeMd(config);

    // Write file
    await fs.writeFile(filePath, content, "utf-8");

    return {
      success: true,
      filePath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      filePath,
      error: `Failed to write CLAUDE.md: ${errorMessage}`,
    };
  }
}

/**
 * Generate CLAUDE.md content without writing to file
 * Useful for previewing or testing
 */
export function generateClaudeMdContent(config: ClaudeMdConfig): string {
  return generateClaudeMd(config);
}

/**
 * Check if CLAUDE.md exists in a project directory
 */
export async function hasClaudeMd(projectPath: string): Promise<boolean> {
  const filePath = path.join(projectPath, "CLAUDE.md");
  return fs.pathExists(filePath);
}

/**
 * Read existing CLAUDE.md content from a project directory
 */
export async function readClaudeMd(projectPath: string): Promise<string | null> {
  const filePath = path.join(projectPath, "CLAUDE.md");

  try {
    if (await fs.pathExists(filePath)) {
      return fs.readFile(filePath, "utf-8");
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Exports
// ============================================================================

export { type ClaudeMdConfig } from "../templates/CLAUDE.md.js";
