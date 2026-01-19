/**
 * Package scripts generator
 *
 * Adds postinstall and prepare scripts to package.json for bootsralph sync
 * and lefthook installation.
 */

import { readJson, writeJson, exists } from "../utils/fs.js";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for adding package scripts
 */
export interface AddPackageScriptsOptions {
  /**
   * If true, preserves existing scripts when they conflict with new ones
   * If false, overwrites existing scripts with new values
   * @default false
   */
  merge?: boolean;
}

/**
 * Shape of package.json we care about
 */
interface PackageJson {
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

// ============================================================================
// Scripts to Add
// ============================================================================

/**
 * Scripts that should be added to package.json
 */
const SCRIPTS_TO_ADD = {
  postinstall: "bootsralph sync --quiet",
  prepare: "lefthook install && bootsralph sync --quiet",
} as const;

// ============================================================================
// Generator Function
// ============================================================================

/**
 * Add postinstall and prepare scripts to package.json
 *
 * Reads package.json, adds/updates scripts for bootsralph sync and lefthook
 * installation, and writes the result back to package.json.
 *
 * Scripts added:
 * - postinstall: 'bootsralph sync --quiet' - runs after npm/yarn/pnpm/bun install
 * - prepare: 'lefthook install && bootsralph sync --quiet' - runs before publish
 *
 * @param outputDir - Directory containing package.json (default: cwd)
 * @param options - Options for script merging behavior
 * @returns Promise resolving to the path of the modified package.json
 * @throws Error if package.json doesn't exist or write fails
 *
 * @example
 * ```typescript
 * // Add scripts, overwriting existing ones
 * await addPackageScripts();
 * ```
 *
 * @example
 * ```typescript
 * // Add scripts, preserving existing ones
 * await addPackageScripts(process.cwd(), { merge: true });
 * ```
 *
 * @example
 * ```typescript
 * // Add scripts to a specific directory
 * await addPackageScripts("/path/to/project", { merge: false });
 * ```
 */
export async function addPackageScripts(
  outputDir: string = process.cwd(),
  options: AddPackageScriptsOptions = {}
): Promise<string> {
  const { merge = false } = options;

  // Step 1: Check if package.json exists
  const packageJsonPath = join(outputDir, "package.json");
  const packageJsonExists = await exists(packageJsonPath);

  if (!packageJsonExists) {
    throw new Error(
      `package.json not found at ${packageJsonPath}. Cannot add scripts.`
    );
  }

  // Step 2: Read the existing package.json
  const packageJson = await readJson<PackageJson>(packageJsonPath);

  // Step 3: Ensure scripts object exists
  if (!packageJson.scripts) {
    packageJson.scripts = {};
  }

  // Step 4: Add or update scripts based on merge option
  if (merge) {
    // Only add scripts that don't already exist
    for (const [key, value] of Object.entries(SCRIPTS_TO_ADD)) {
      if (!(key in packageJson.scripts)) {
        packageJson.scripts[key] = value;
      }
    }
  } else {
    // Overwrite existing scripts
    for (const [key, value] of Object.entries(SCRIPTS_TO_ADD)) {
      packageJson.scripts[key] = value;
    }
  }

  // Step 5: Write updated package.json back to disk
  await writeJson(packageJsonPath, packageJson, { spaces: 2 });

  return packageJsonPath;
}
