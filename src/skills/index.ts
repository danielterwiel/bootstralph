/**
 * Skills sync entry point
 *
 * Orchestrates the full sync flow for OpenSkills integration:
 * 1. Read package.json dependencies
 * 2. Detect configuration files
 * 3. Load current skills manifest
 * 4. Compute diff (skills to install/remove)
 * 5. (Optionally) preview changes or prompt for confirmation
 * 6. Install selected skills
 * 7. Remove orphaned skills
 * 8. Save updated manifest
 * 9. Regenerate AGENTS.md via openskills sync
 *
 * This follows Anthropic's context engineering best practices:
 * - Skills are opt-in, not automatic
 * - Only skills that match project characteristics are suggested
 * - Users can preview and select which skills to install
 */

import { scanPackageJson } from "../detection/package-scanner.js";
import { scanConfigFiles } from "../detection/config-scanner.js";
import { inferStack } from "../detection/stack-inferrer.js";
import { loadManifest, saveManifest } from "./manifest.js";
import { computeRequiredSkills, type RequiredSkill } from "./mappings.js";
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
// Types
// ============================================================================

/**
 * Options for syncSkills function
 */
export interface SyncSkillsOptions {
  /** Suppress progress logs (default: false) */
  quiet?: boolean;
  /** Project root directory (default: process.cwd()) */
  projectRoot?: string;
  /** Only preview changes without installing (default: false) */
  dryRun?: boolean;
  /** Specific skills to install (if provided, only these skills will be installed) */
  selectedSkills?: string[];
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

/**
 * Preview of what skills would be changed
 */
export interface SkillsPreview {
  /** Skills that would be installed */
  toInstall: RequiredSkill[];
  /** Skills that would be removed */
  toRemove: Array<{ skill: string; reason: string }>;
  /** Currently installed skills */
  installed: string[];
}

// ============================================================================
// Skills Preview
// ============================================================================

/**
 * Preview which skills would be installed/removed without making changes
 *
 * This allows users to see what skills match their project before deciding
 * which to install. Follows the opt-in principle from Anthropic's context
 * engineering best practices.
 *
 * @param projectRoot - Project root directory (default: process.cwd())
 * @returns Promise resolving to preview of skill changes
 *
 * @example
 * ```typescript
 * const preview = await previewSkills();
 * console.log("Would install:", preview.toInstall.map(s => s.skill));
 * console.log("Would remove:", preview.toRemove.map(s => s.skill));
 * ```
 */
export async function previewSkills(
  projectRoot: string = process.cwd()
): Promise<SkillsPreview> {
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

  return {
    toInstall: diff.toInstall,
    toRemove: diff.toRemove,
    installed: Object.keys(manifest.skills),
  };
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
 * @param options - Sync options (quiet mode, project root, dry run, selected skills)
 * @returns Promise resolving when sync completes
 *
 * @example
 * ```typescript
 * // Preview what would change (dry run)
 * const result = await syncSkills({ dryRun: true });
 *
 * // Sync only specific skills (opt-in)
 * const result = await syncSkills({ selectedSkills: ["nextjs", "clerk-auth"] });
 *
 * // Sync all matched skills
 * const result = await syncSkills();
 * ```
 */
export async function syncSkills(
  options: SyncSkillsOptions = {}
): Promise<SyncSkillsResult> {
  const {
    quiet = false,
    projectRoot = process.cwd(),
    dryRun = false,
    selectedSkills,
  } = options;

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
    let diff = computeDiff(manifest, requiredSkills);

    // Filter to selected skills if provided (opt-in mode)
    if (selectedSkills && selectedSkills.length > 0) {
      diff = {
        toInstall: diff.toInstall.filter((s) =>
          selectedSkills.includes(s.skill)
        ),
        toRemove: diff.toRemove.filter((s) => selectedSkills.includes(s.skill)),
      };
    }

    // Track results
    const result: SyncSkillsResult = {
      installed: 0,
      failed: 0,
      removed: 0,
      failedSkills: [],
    };

    // If dry run, just return what would happen
    if (dryRun) {
      return {
        installed: diff.toInstall.length,
        failed: 0,
        removed: diff.toRemove.length,
        failedSkills: [],
      };
    }

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
