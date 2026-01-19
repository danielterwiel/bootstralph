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
 * await syncSkills();
 * ```
 *
 * @example
 * ```typescript
 * // Sync skills in quiet mode (no logs)
 * await syncSkills({ quiet: true });
 * ```
 *
 * @example
 * ```typescript
 * // Sync skills in a specific project directory
 * await syncSkills({ projectRoot: "/path/to/project" });
 * ```
 *
 * @example
 * ```typescript
 * // Common workflow: sync after dependency changes
 * import { syncSkills } from "./skills";
 *
 * // User just ran: bun add next @clerk/nextjs
 * await syncSkills();
 * // Skills are now installed: nextjs, clerk, systematic-debugging, verification-before-completion
 * ```
 */
export async function syncSkills(
  options: SyncSkillsOptions = {}
): Promise<void> {
  const { quiet = false, projectRoot = process.cwd() } = options;

  const log = (...args: unknown[]) => {
    if (!quiet) {
      console.log(...args);
    }
  };

  try {
    // Step 1: Read package.json
    log("📦 Reading package.json...");
    const packageScan = await scanPackageJson(projectRoot);

    // Step 2: Detect config files
    log("🔍 Detecting configuration files...");
    const configFiles = await scanConfigFiles(projectRoot);

    // Step 3: Load current manifest
    log("📋 Loading skills manifest...");
    const manifest = await loadManifest(projectRoot);

    // Step 4: Compute required skills
    log("🧮 Computing required skills...");
    const requiredSkills = await computeRequiredSkills(
      packageScan.dependencies,
      packageScan.devDependencies,
      configFiles
    );

    // Step 5: Compute diff
    log("📊 Computing skills diff...");
    const diff = computeDiff(manifest, requiredSkills);

    // Step 6: Install new/updated skills
    if (diff.toInstall.length > 0) {
      log(`⬇️  Installing ${diff.toInstall.length} skill(s)...`);
      for (const skill of diff.toInstall) {
        log(`   • ${skill.skill} (${skill.reason})`);
        await openskillsInstall(skill.source, projectRoot);

        // Update manifest with installed skill
        manifest.skills[skill.skill] = {
          skill: skill.skill,
          source: skill.source,
          reason: skill.reason,
          installedAt: new Date().toISOString(),
        };
      }
    } else {
      log("✓ No new skills to install");
    }

    // Step 7: Remove orphaned skills
    if (diff.toRemove.length > 0) {
      log(`🗑️  Removing ${diff.toRemove.length} orphaned skill(s)...`);
      for (const skill of diff.toRemove) {
        log(`   • ${skill.skill}`);
        await openskillsUninstall(skill.skill, projectRoot);

        // Update manifest by removing the skill
        delete manifest.skills[skill.skill];
      }
    } else {
      log("✓ No orphaned skills to remove");
    }

    // Step 8: Save updated manifest
    log("💾 Saving manifest...");
    await saveManifest(manifest, projectRoot);

    // Step 9: Regenerate AGENTS.md via openskills sync
    log("📝 Regenerating AGENTS.md...");
    await openskillsSync(projectRoot);

    log("✅ Skills sync complete!");
  } catch (error) {
    if (!quiet) {
      console.error("❌ Skills sync failed:", error);
    }
    throw error;
  }
}
