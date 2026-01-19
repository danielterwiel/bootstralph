/**
 * OpenSkills CLI wrapper
 *
 * Provides a typed wrapper around the OpenSkills CLI for installing, uninstalling,
 * syncing, and listing skills. Uses the exec utility for consistent command execution.
 */

import { exec } from "../utils/exec.js";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  detectPackageManager,
  getPackageManagerRunnerString,
} from "../utils/package-manager.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Installed skill information from openskills list command
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
 * Runs the package manager's runner (bunx, pnpm dlx, yarn dlx, npx) with
 * 'openskills install <source>' to install a skill from GitHub.
 *
 * @param source - GitHub source path (e.g., "anthropics/skills/skills/frontend-design")
 * @param projectRoot - Project root directory (defaults to current directory)
 * @returns Promise resolving when install completes
 * @throws ExecCommandError if the install command fails
 *
 * @example
 * ```typescript
 * // Install from GitHub
 * await openskillsInstall("anthropics/skills/skills/frontend-design");
 * ```
 */
export async function openskillsInstall(
  source: string,
  projectRoot: string = process.cwd()
): Promise<void> {
  // Detect the package manager and use its runner
  const pm = await detectPackageManager(projectRoot);
  const runner = getPackageManagerRunnerString(pm);

  // Build command based on package manager
  // npx needs --yes to auto-confirm, bunx doesn't
  const npxYes = pm === "npm" || pm === "yarn" ? "--yes " : "";
  const command = `${runner} ${npxYes}openskills install ${source} -y`;
  await exec(command, {
    cwd: projectRoot,
    timeout: 120000, // 2 minute timeout for install
  });
}

// ============================================================================
// OpenSkills Sync
// ============================================================================

/**
 * Sync skills using OpenSkills CLI
 *
 * Runs the package manager's runner with 'openskills sync -y' to synchronize
 * skills and generate AGENTS.md.
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
 */
export async function openskillsSync(
  projectRoot: string = process.cwd()
): Promise<void> {
  // Detect the package manager and use its runner
  const pm = await detectPackageManager(projectRoot);
  const runner = getPackageManagerRunnerString(pm);

  // Build command based on package manager
  const npxYes = pm === "npm" || pm === "yarn" ? "--yes " : "";
  const command = `${runner} ${npxYes}openskills sync -y`;
  await exec(command, {
    cwd: projectRoot,
    timeout: 120000, // 2 minute timeout for sync
  });
}

// ============================================================================
// OpenSkills List
// ============================================================================

/**
 * List installed skills using OpenSkills CLI
 *
 * Runs the package manager's runner with 'openskills list' and parses
 * the output to return an array of installed skill information.
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
  // Detect the package manager and use its runner
  const pm = await detectPackageManager(projectRoot);
  const runner = getPackageManagerRunnerString(pm);

  // Build command based on package manager
  const npxYes = pm === "npm" || pm === "yarn" ? "--yes " : "";
  const result = await exec(`${runner} ${npxYes}openskills list`, {
    cwd: projectRoot,
    timeout: 60000, // 1 minute timeout
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
