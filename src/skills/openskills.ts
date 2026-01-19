/**
 * OpenSkills CLI wrapper
 *
 * Provides a typed wrapper around the OpenSkills CLI for installing, uninstalling,
 * syncing, and listing skills. Uses the exec utility for consistent command execution.
 */

import { exec } from "../utils/exec.js";
import { rm } from "node:fs/promises";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * Installed skill information from 'npx openskills list'
 */
export interface OpenSkillInfo {
  /** Skill identifier/name */
  name: string;
  /** Skill source path or URL */
  source: string;
}

// ============================================================================
// OpenSkills Install
// ============================================================================

/**
 * Install a skill using OpenSkills CLI
 *
 * Runs 'npx openskills install <source>' to install a skill from a source URL
 * or path. The source can be a GitHub URL, local path, or any valid OpenSkills
 * source identifier.
 *
 * @param source - OpenSkills source URL or path
 * @param projectRoot - Project root directory (defaults to current directory)
 * @returns Promise resolving when install completes
 * @throws ExecCommandError if the install command fails
 *
 * @example
 * ```typescript
 * // Install from GitHub
 * await openskillsInstall("github:anthropics/openskills/nextjs");
 * ```
 *
 * @example
 * ```typescript
 * // Install from local path
 * await openskillsInstall("./my-custom-skill");
 * ```
 *
 * @example
 * ```typescript
 * // Install in specific project directory
 * await openskillsInstall("github:anthropics/openskills/nextjs", "/path/to/project");
 * ```
 */
export async function openskillsInstall(
  source: string,
  projectRoot: string = process.cwd()
): Promise<void> {
  await exec(`npx openskills install ${source}`, {
    cwd: projectRoot,
  });
}

// ============================================================================
// OpenSkills Sync
// ============================================================================

/**
 * Sync skills using OpenSkills CLI
 *
 * Runs 'npx openskills sync -y' to synchronize skills, automatically confirming
 * any prompts with the -y flag.
 *
 * @param projectRoot - Project root directory (defaults to current directory)
 * @returns Promise resolving when sync completes
 * @throws ExecCommandError if the sync command fails
 *
 * @example
 * ```typescript
 * // Sync skills in current directory
 * await openskillsSync();
 * ```
 *
 * @example
 * ```typescript
 * // Sync skills in specific project directory
 * await openskillsSync("/path/to/project");
 * ```
 */
export async function openskillsSync(
  projectRoot: string = process.cwd()
): Promise<void> {
  await exec("npx openskills sync -y", {
    cwd: projectRoot,
  });
}

// ============================================================================
// OpenSkills List
// ============================================================================

/**
 * List installed skills using OpenSkills CLI
 *
 * Runs 'npx openskills list' and parses the output to return an array of
 * installed skill information.
 *
 * @param projectRoot - Project root directory (defaults to current directory)
 * @returns Promise resolving to array of installed skills
 * @throws ExecCommandError if the list command fails
 *
 * @example
 * ```typescript
 * const skills = await openskillsList();
 * console.log(`${skills.length} skills installed:`);
 * skills.forEach(skill => {
 *   console.log(`  - ${skill.name} (${skill.source})`);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // List skills in specific project directory
 * const skills = await openskillsList("/path/to/project");
 * ```
 */
export async function openskillsList(
  projectRoot: string = process.cwd()
): Promise<OpenSkillInfo[]> {
  const result = await exec("npx openskills list", {
    cwd: projectRoot,
  });

  // Parse the output to extract skill information
  const skills: OpenSkillInfo[] = [];
  const lines = result.stdout.split("\n").filter((line) => line.trim());

  for (const line of lines) {
    // Parse each line to extract skill name and source
    // Expected format varies, but commonly: "skill-name (source)"
    // or just "skill-name"
    const match = line.match(/^(\S+)\s*(?:\((.+)\))?$/);
    if (match) {
      const [, name, source] = match;
      skills.push({
        name: name || "",
        source: source || "",
      });
    }
  }

  return skills;
}

// ============================================================================
// OpenSkills Uninstall
// ============================================================================

/**
 * Uninstall a skill by deleting its directory
 *
 * Removes a skill by deleting the .claude/skills/{skillName} directory.
 * This is the manual uninstall approach as OpenSkills may not have a
 * built-in uninstall command.
 *
 * @param skillName - Name of the skill to uninstall
 * @param projectRoot - Project root directory (defaults to current directory)
 * @returns Promise resolving when uninstall completes
 * @throws Error if deletion fails
 *
 * @example
 * ```typescript
 * // Uninstall nextjs skill
 * await openskillsUninstall("nextjs");
 * ```
 *
 * @example
 * ```typescript
 * // Uninstall from specific project directory
 * await openskillsUninstall("nextjs", "/path/to/project");
 * ```
 */
export async function openskillsUninstall(
  skillName: string,
  projectRoot: string = process.cwd()
): Promise<void> {
  const skillPath = join(projectRoot, ".claude", "skills", skillName);
  await rm(skillPath, { recursive: true, force: true });
}
