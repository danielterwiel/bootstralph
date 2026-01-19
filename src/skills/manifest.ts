/**
 * Skills manifest CRUD operations
 *
 * Manages the skills manifest file that tracks which OpenSkills are installed
 * and why they were installed. The manifest is stored at .bootstralph/skills-manifest.json
 * and is used to determine which skills need to be added or removed during sync.
 */

import { readJson, writeJson, exists, ensureDir } from "../utils/fs.js";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * Installed skill entry
 *
 * Tracks an installed skill along with metadata about why it was installed.
 */
export interface InstalledSkill {
  /** Skill identifier */
  skill: string;
  /** OpenSkills source URL */
  source: string;
  /** Reason why this skill was installed */
  reason: string;
  /** Timestamp when the skill was installed */
  installedAt: string;
}

/**
 * Skills manifest structure
 *
 * The manifest file tracks all installed skills and when it was last updated.
 */
export interface SkillsManifest {
  /** Manifest format version */
  version: string;
  /** Timestamp when the manifest was last updated */
  updatedAt: string;
  /** Record of installed skills by skill name */
  skills: Record<string, InstalledSkill>;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default manifest path relative to project root
 */
const MANIFEST_PATH = ".bootstralph/skills-manifest.json";

/**
 * Current manifest format version
 */
const MANIFEST_VERSION = "1.0.0";

// ============================================================================
// Manifest Loader
// ============================================================================

/**
 * Load the skills manifest from disk
 *
 * Reads the skills manifest from .bootstralph/skills-manifest.json. If the
 * manifest doesn't exist, returns a default empty manifest.
 *
 * @param projectRoot - Project root directory (defaults to current directory)
 * @returns Promise resolving to the skills manifest
 *
 * @example
 * ```typescript
 * const manifest = await loadManifest();
 * console.log(`${Object.keys(manifest.skills).length} skills installed`);
 * ```
 *
 * @example
 * ```typescript
 * // Load from specific project directory
 * const manifest = await loadManifest("/path/to/project");
 * ```
 */
export async function loadManifest(
  projectRoot: string = process.cwd(),
): Promise<SkillsManifest> {
  const manifestPath = join(projectRoot, MANIFEST_PATH);

  // Check if manifest exists
  if (!(await exists(manifestPath))) {
    // Return default manifest
    return {
      version: MANIFEST_VERSION,
      updatedAt: new Date().toISOString(),
      skills: {},
    };
  }

  // Load existing manifest
  const manifest = await readJson<SkillsManifest>(manifestPath);

  return manifest;
}

// ============================================================================
// Manifest Saver
// ============================================================================

/**
 * Save the skills manifest to disk
 *
 * Writes the skills manifest to .bootstralph/skills-manifest.json. Creates the
 * .bootstralph directory if it doesn't exist. Automatically updates the
 * updatedAt timestamp.
 *
 * @param manifest - The skills manifest to save
 * @param projectRoot - Project root directory (defaults to current directory)
 * @returns Promise resolving when save completes
 *
 * @example
 * ```typescript
 * const manifest = await loadManifest();
 * manifest.skills["nextjs"] = {
 *   skill: "nextjs",
 *   source: "github:anthropics/openskills/nextjs",
 *   reason: "package: next",
 *   installedAt: new Date().toISOString(),
 * };
 * await saveManifest(manifest);
 * ```
 *
 * @example
 * ```typescript
 * // Save to specific project directory
 * await saveManifest(manifest, "/path/to/project");
 * ```
 */
export async function saveManifest(
  manifest: SkillsManifest,
  projectRoot: string = process.cwd(),
): Promise<void> {
  const manifestPath = join(projectRoot, MANIFEST_PATH);
  const manifestDir = join(projectRoot, ".bootstralph");

  // Ensure .bootstralph directory exists
  await ensureDir(manifestDir);

  // Update timestamp
  manifest.updatedAt = new Date().toISOString();

  // Write manifest to disk
  await writeJson(manifestPath, manifest, { spaces: 2 });
}
