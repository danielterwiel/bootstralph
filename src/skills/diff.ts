/**
 * Skills diff computation
 *
 * Computes the difference between currently installed skills and required skills
 * to determine which skills need to be installed or removed during sync operations.
 */

import type { SkillsManifest, InstalledSkill } from "./manifest.js";
import type { RequiredSkill } from "./mappings.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Skills diff result
 *
 * Contains the lists of skills to install and skills to remove based on the
 * comparison between the current manifest and required skills.
 */
export interface SkillsDiff {
  /** Skills that need to be installed */
  toInstall: RequiredSkill[];
  /** Skills that need to be removed */
  toRemove: InstalledSkill[];
}

// ============================================================================
// Diff Computation
// ============================================================================

/**
 * Compute diff between current manifest and required skills
 *
 * Analyzes the current skills manifest and compares it against the list of
 * required skills to determine which skills need to be installed and which
 * need to be removed.
 *
 * Skills to install:
 * - Skills that are required but not currently installed
 * - Skills that are installed but with a different source URL (reinstall)
 *
 * Skills to remove (orphaned skills):
 * - Skills that are installed but no longer required
 * - Typically happens when packages are removed from package.json
 *
 * @param manifest - Current skills manifest from .bootsralph/skills-manifest.json
 * @param requiredSkills - Array of skills that should be installed
 * @returns SkillsDiff object with toInstall and toRemove arrays
 *
 * @example
 * ```typescript
 * const manifest = await loadManifest();
 * const required = await computeRequiredSkills(deps, devDeps, configFiles);
 * const diff = computeDiff(manifest, required);
 *
 * console.log(`Installing ${diff.toInstall.length} skills`);
 * console.log(`Removing ${diff.toRemove.length} skills`);
 * ```
 *
 * @example
 * ```typescript
 * // Common scenario: user removes Next.js from project
 * const manifest = {
 *   version: "1.0.0",
 *   updatedAt: "2024-01-19T00:00:00Z",
 *   skills: {
 *     "nextjs": {
 *       skill: "nextjs",
 *       source: "github:anthropics/openskills/nextjs",
 *       reason: "package: next",
 *       installedAt: "2024-01-19T00:00:00Z"
 *     }
 *   }
 * };
 *
 * // User removed "next" from package.json
 * const required = [
 *   // Only default skills remain
 *   { skill: "systematic-debugging", source: "...", reason: "default" }
 * ];
 *
 * const diff = computeDiff(manifest, required);
 * // diff.toRemove will contain the "nextjs" skill
 * ```
 *
 * @example
 * ```typescript
 * // Scenario: skill source URL changed
 * const manifest = {
 *   version: "1.0.0",
 *   updatedAt: "2024-01-19T00:00:00Z",
 *   skills: {
 *     "nextjs": {
 *       skill: "nextjs",
 *       source: "github:old-org/openskills/nextjs",
 *       reason: "package: next",
 *       installedAt: "2024-01-19T00:00:00Z"
 *     }
 *   }
 * };
 *
 * const required = [
 *   { skill: "nextjs", source: "github:anthropics/openskills/nextjs", reason: "package: next" }
 * ];
 *
 * const diff = computeDiff(manifest, required);
 * // diff.toInstall will contain the "nextjs" skill (for reinstall)
 * // diff.toRemove will be empty (old skill will be replaced)
 * ```
 */
export function computeDiff(
  manifest: SkillsManifest,
  requiredSkills: RequiredSkill[]
): SkillsDiff {
  const toInstall: RequiredSkill[] = [];
  const toRemove: InstalledSkill[] = [];

  // Create a map of required skills by skill name for fast lookup
  const requiredMap = new Map<string, RequiredSkill>();
  for (const skill of requiredSkills) {
    requiredMap.set(skill.skill, skill);
  }

  // Check for skills that need to be installed or updated
  for (const required of requiredSkills) {
    const installed = manifest.skills[required.skill];

    if (!installed) {
      // Skill is not installed, needs to be installed
      toInstall.push(required);
    } else if (installed.source !== required.source) {
      // Skill is installed but with a different source, needs to be reinstalled
      toInstall.push(required);
    }
    // If skill is installed with same source, no action needed
  }

  // Check for orphaned skills that need to be removed
  for (const [skillName, installed] of Object.entries(manifest.skills)) {
    const required = requiredMap.get(skillName);

    if (!required) {
      // Skill is installed but no longer required, mark for removal
      toRemove.push(installed);
    }
    // Note: We don't add to toRemove if source differs because toInstall
    // will handle the reinstall (which implicitly replaces the old version)
  }

  return {
    toInstall,
    toRemove,
  };
}
