/**
 * Skills sync entry point
 *
 * Orchestrates the full sync flow for OpenSkills integration:
 * 1. Read package.json dependencies
 * 2. Detect configuration files
 * 3. Load current skills manifest
 * 4. Compute diff (skills to install/remove)
 * 5. Install new skills
 * 6. Remove orphaned skills
 * 7. Save updated manifest
 * 8. Regenerate AGENTS.md via openskills sync
 */

import { scanPackageJson } from "../detection/package-scanner.js";
import { scanConfigFiles } from "../detection/config-scanner.js";
import { inferStack } from "../detection/stack-inferrer.js";
import { loadManifest, saveManifest } from "./manifest.js";
import { computeRequiredSkills } from "./mappings.js";
import { computeDiff } from "./diff.js";
import {
  openskillsInstall,
  openskillsUninstall,
  openskillsSync,
} from "./openskills.js";

// ============================================================================
// Re-exports
// ============================================================================

export {
  loadManifest,
  saveManifest,
  type SkillsManifest,
  type InstalledSkill,
} from "./manifest.js";
export {
  loadMappings,
  computeRequiredSkills,
  DEFAULT_SKILLS,
  type SkillMapping,
  type RequiredSkill,
} from "./mappings.js";
export { computeDiff, type SkillsDiff } from "./diff.js";
export {
  openskillsInstall,
  openskillsUninstall,
  openskillsSync,
  openskillsList,
  type OpenSkillInfo,
} from "./openskills.js";

// ============================================================================
// Sync Options
// ============================================================================

/**
 * Options for syncSkills function
 */
export interface SyncSkillsOptions {
  /** Suppress progress logs (default: false) */
  quiet?: boolean;
  /** Project root directory (default: process.cwd()) */
  projectRoot?: string;
}

/**
 * Result of syncSkills operation
 */
export interface SyncSkillsResult {
  /** Number of skills successfully installed */
  installed: number;
  /** Number of skills that failed to install */
  failed: number;
  /** Number of skills successfully removed */
  removed: number;
  /** Names of skills that failed to install */
  failedSkills: string[];
}

// ============================================================================
// Skills Sync Orchestration
// ============================================================================

/**
 * Sync OpenSkills based on project dependencies and configuration
 *
 * Orchestrates the complete skills sync flow:
 * 1. Scans package.json for dependencies
 * 2. Detects configuration files in the project
 * 3. Loads current skills manifest
 * 4. Computes which skills need to be installed or removed
 * 5. Installs new/updated skills via openskills CLI
 * 6. Removes orphaned skills
 * 7. Saves updated manifest
 * 8. Regenerates AGENTS.md via openskills sync
 *
 * @param options - Sync options (quiet mode, project root)
 * @returns Promise resolving when sync completes
 *
 * @example
 * ```typescript
 * // Sync skills with progress logs
 * const result = await syncSkills();
 * console.log(`Installed: ${result.installed}, Failed: ${result.failed}`);
 * ```
 *
 * @example
 * ```typescript
 * // Sync skills in quiet mode (no logs)
 * const result = await syncSkills({ quiet: true });
 * ```
 *
 * @example
 * ```typescript
 * // Sync skills in a specific project directory
 * const result = await syncSkills({ projectRoot: "/path/to/project" });
 * ```
 *
 * @example
 * ```typescript
 * // Common workflow: sync after dependency changes
 * import { syncSkills } from "./skills";
 *
 * // User just ran: bun add next @clerk/nextjs
 * const result = await syncSkills();
 * if (result.failed > 0) {
 *   console.error(`Failed to install: ${result.failedSkills.join(", ")}`);
 * }
 * ```
 */
export async function syncSkills(
  options: SyncSkillsOptions = {}
): Promise<SyncSkillsResult> {
  const { quiet = false, projectRoot = process.cwd() } = options;

  const log = (...args: unknown[]) => {
    if (!quiet) {
      console.log(...args);
    }
  };

  try {
    // Analyze project
    const packageScan = await scanPackageJson(projectRoot);
    const configFiles = await scanConfigFiles(projectRoot);
    const stack = inferStack(packageScan, configFiles);
    const manifest = await loadManifest(projectRoot);
    const requiredSkills = await computeRequiredSkills(
      packageScan.dependencies,
      packageScan.devDependencies,
      configFiles,
      stack.framework
    );
    const diff = computeDiff(manifest, requiredSkills);

    // Track results
    const result: SyncSkillsResult = {
      installed: 0,
      failed: 0,
      removed: 0,
      failedSkills: [],
    };

    // Install new skills
    for (const skill of diff.toInstall) {
      try {
        await openskillsInstall(skill.source, projectRoot);
        log(`   ✓ ${skill.skill}`);
        result.installed++;
        manifest.skills[skill.skill] = {
          skill: skill.skill,
          source: skill.source,
          reason: skill.reason,
          installedAt: new Date().toISOString(),
        };
      } catch {
        log(`   ✗ ${skill.skill} (failed)`);
        result.failed++;
        result.failedSkills.push(skill.skill);
      }
    }

    // Remove orphaned skills
    for (const skill of diff.toRemove) {
      try {
        await openskillsUninstall(skill.skill, projectRoot);
        log(`   - ${skill.skill} (removed)`);
        result.removed++;
      } catch {
        // Silent failure for removals
      }
      delete manifest.skills[skill.skill];
    }

    // Save manifest and regenerate AGENTS.md
    await saveManifest(manifest, projectRoot);
    try {
      await openskillsSync(projectRoot);
    } catch {
      // Non-fatal - skills are installed, just AGENTS.md wasn't regenerated
    }

    return result;
  } catch (error) {
    if (!quiet) {
      console.error("❌ Skills sync failed:", error);
    }
    throw error;
  }
}
