/**
 * Package scanner for detecting dependencies from package.json
 *
 * Provides utilities for reading package.json and extracting dependency information
 * for stack detection and analysis.
 */

import { readJson, exists } from "../utils/fs.js";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * Result from scanning package.json
 */
export interface PackageScanResult {
  /** Runtime dependencies */
  dependencies: string[];
  /** Development dependencies */
  devDependencies: string[];
  /** NPM scripts */
  scripts: Record<string, string>;
}

/**
 * Shape of package.json we care about
 */
interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

// ============================================================================
// Package Scanner
// ============================================================================

/**
 * Scan package.json and extract dependencies and scripts
 *
 * @param cwd - Directory to search for package.json (default: process.cwd())
 * @returns Promise resolving to dependency and script information
 *
 * @example
 * ```typescript
 * const result = await scanPackageJson();
 * console.log("Dependencies:", result.dependencies);
 * console.log("Dev dependencies:", result.devDependencies);
 * console.log("Scripts:", result.scripts);
 * ```
 *
 * @example
 * ```typescript
 * // Scan a specific directory
 * const result = await scanPackageJson("/path/to/project");
 * if (result.dependencies.includes("react")) {
 *   console.log("React project detected");
 * }
 * ```
 */
export async function scanPackageJson(
  cwd: string = process.cwd()
): Promise<PackageScanResult> {
  const packageJsonPath = join(cwd, "package.json");

  // Check if package.json exists
  const packageJsonExists = await exists(packageJsonPath);

  if (!packageJsonExists) {
    // Return empty result if package.json doesn't exist
    return {
      dependencies: [],
      devDependencies: [],
      scripts: {},
    };
  }

  // Read and parse package.json
  const packageJson = await readJson<PackageJson>(packageJsonPath);

  // Extract dependency names (keys from dependency objects)
  const dependencies = Object.keys(packageJson.dependencies ?? {});
  const devDependencies = Object.keys(packageJson.devDependencies ?? {});
  const scripts = packageJson.scripts ?? {};

  return {
    dependencies,
    devDependencies,
    scripts,
  };
}
