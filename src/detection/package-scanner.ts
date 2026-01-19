/**
 * Package scanner for detecting dependencies from package.json
 *
 * Provides utilities for reading package.json and extracting dependency information
 * for stack detection and analysis.
 *
 * Supports npm workspaces: when the root package.json contains a "workspaces" field,
 * dependencies from all workspace package.json files are aggregated.
 */

import { readJson, exists } from "../utils/fs.js";
import { join } from "node:path";
import { readdir } from "node:fs/promises";

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
  workspaces?: string[] | { packages: string[] };
}

// ============================================================================
// Workspace Resolution
// ============================================================================

/**
 * Normalize workspaces field to array of patterns
 *
 * npm workspaces can be either:
 * - An array of strings: ["packages/*", "apps/*"]
 * - An object with packages key: { packages: ["packages/*"] }
 */
function normalizeWorkspaces(
  workspaces: string[] | { packages: string[] } | undefined
): string[] {
  if (!workspaces) return [];
  if (Array.isArray(workspaces)) return workspaces;
  return workspaces.packages ?? [];
}

/**
 * Resolve a single workspace pattern to directory paths
 *
 * Supports:
 * - Direct paths: "packages/ui" -> ["/project/packages/ui"]
 * - Single glob: "packages/*" -> ["/project/packages/ui", "/project/packages/utils"]
 */
async function resolveWorkspacePattern(
  cwd: string,
  pattern: string
): Promise<string[]> {
  // Handle glob patterns with trailing /*
  if (pattern.endsWith("/*")) {
    const baseDir = join(cwd, pattern.slice(0, -2));
    if (!(await exists(baseDir))) {
      return [];
    }

    const entries = await readdir(baseDir, { withFileTypes: true });
    const dirs: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const workspacePath = join(baseDir, entry.name);
        const pkgPath = join(workspacePath, "package.json");
        if (await exists(pkgPath)) {
          dirs.push(workspacePath);
        }
      }
    }
    return dirs;
  }

  // Direct path - check if it has a package.json
  const workspacePath = join(cwd, pattern);
  const pkgPath = join(workspacePath, "package.json");
  if (await exists(pkgPath)) {
    return [workspacePath];
  }

  return [];
}

/**
 * Resolve workspace patterns to actual directory paths
 *
 * @param cwd - Root directory containing package.json with workspaces
 * @returns Promise resolving to array of workspace directory paths
 *
 * @example
 * ```typescript
 * // Given workspaces: ["packages/*", "apps/web"]
 * const dirs = await resolveWorkspaces("/project");
 * // Returns: ["/project/packages/ui", "/project/packages/utils", "/project/apps/web"]
 * ```
 */
export async function resolveWorkspaces(cwd: string): Promise<string[]> {
  const packageJsonPath = join(cwd, "package.json");
  const packageJsonExists = await exists(packageJsonPath);

  if (!packageJsonExists) {
    return [];
  }

  const packageJson = await readJson<PackageJson>(packageJsonPath);
  const patterns = normalizeWorkspaces(packageJson.workspaces);

  if (patterns.length === 0) {
    return [];
  }

  // Resolve all patterns and flatten results
  const results = await Promise.all(
    patterns.map((p) => resolveWorkspacePattern(cwd, p))
  );

  return results.flat();
}

// ============================================================================
// Package Scanner
// ============================================================================

/**
 * Scan package.json and extract dependencies and scripts
 *
 * If the root package.json contains a "workspaces" field, dependencies from
 * all workspace package.json files are aggregated into the result.
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
 * // Scan a monorepo with workspaces
 * // Dependencies from all workspace packages are aggregated
 * const result = await scanPackageJson("/path/to/monorepo");
 * if (result.dependencies.includes("react")) {
 *   console.log("React found in root or workspaces");
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

  // Read and parse root package.json
  const packageJson = await readJson<PackageJson>(packageJsonPath);

  // Use Sets to collect unique dependencies
  const depsSet = new Set(Object.keys(packageJson.dependencies ?? {}));
  const devDepsSet = new Set(Object.keys(packageJson.devDependencies ?? {}));
  const scripts = packageJson.scripts ?? {};

  // Check for workspaces and aggregate their dependencies
  const workspaceDirs = await resolveWorkspaces(cwd);

  for (const workspaceDir of workspaceDirs) {
    const workspacePkgPath = join(workspaceDir, "package.json");
    try {
      const workspacePkg = await readJson<PackageJson>(workspacePkgPath);

      // Add workspace dependencies to sets
      for (const dep of Object.keys(workspacePkg.dependencies ?? {})) {
        depsSet.add(dep);
      }
      for (const devDep of Object.keys(workspacePkg.devDependencies ?? {})) {
        devDepsSet.add(devDep);
      }
    } catch {
      // Skip workspaces with invalid package.json
    }
  }

  return {
    dependencies: [...depsSet],
    devDependencies: [...devDepsSet],
    scripts,
  };
}
