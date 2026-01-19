/**
 * Package Manager Utilities
 *
 * Provides functions for detecting and working with different package managers
 * (npm, yarn, pnpm, bun) in a consistent way across the codebase.
 */

import fs from "fs-extra";
import path from "node:path";

export type PackageManager = "bun" | "pnpm" | "npm" | "yarn";

/**
 * Detect the package manager used in a project
 *
 * Detection order:
 * 1. packageManager field in package.json (e.g., "bun@1.0.0")
 * 2. Lock files (bun.lockb, bun.lock, pnpm-lock.yaml, yarn.lock, package-lock.json)
 * 3. Default to bun
 *
 * @param projectPath - Path to the project root
 * @returns The detected package manager
 */
export async function detectPackageManager(
  projectPath: string
): Promise<PackageManager> {
  // 1. Check packageManager field in package.json
  const packageJsonPath = path.join(projectPath, "package.json");
  if (await fs.pathExists(packageJsonPath)) {
    try {
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content) as { packageManager?: string };
      if (pkg.packageManager) {
        const pmName = pkg.packageManager.split("@")[0];
        if (pmName === "bun") return "bun";
        if (pmName === "pnpm") return "pnpm";
        if (pmName === "yarn") return "yarn";
        if (pmName === "npm") return "npm";
      }
    } catch {
      // Ignore parse errors, continue with lock file detection
    }
  }

  // 2. Check for lock files
  if (await fs.pathExists(path.join(projectPath, "bun.lockb"))) return "bun";
  if (await fs.pathExists(path.join(projectPath, "bun.lock"))) return "bun";
  if (await fs.pathExists(path.join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (await fs.pathExists(path.join(projectPath, "yarn.lock"))) return "yarn";
  if (await fs.pathExists(path.join(projectPath, "package-lock.json"))) return "npm";

  // 3. Default to bun
  return "bun";
}

/**
 * Get the package manager runner command for executing binaries
 *
 * Returns the equivalent of `npx` for each package manager:
 * - npm: npx
 * - yarn: yarn dlx (Yarn 2+, falls back to npx for compatibility)
 * - pnpm: pnpm dlx
 * - bun: bunx
 *
 * @param packageManager - The package manager to get the runner for
 * @returns Array of [command, ...prefixArgs] to be spread before actual command args
 */
export function getPackageManagerRunner(
  packageManager: PackageManager
): [string, ...string[]] {
  switch (packageManager) {
    case "bun":
      return ["bunx"];
    case "pnpm":
      return ["pnpm", "dlx"];
    case "yarn":
      return ["yarn", "dlx"];
    default:
      return ["npx"];
  }
}

/**
 * Get the package manager runner as a single string for use in shell commands
 *
 * @param packageManager - The package manager to get the runner for
 * @returns The runner command as a string (e.g., "bunx", "pnpm dlx", "yarn dlx", "npx")
 */
export function getPackageManagerRunnerString(
  packageManager: PackageManager
): string {
  return getPackageManagerRunner(packageManager).join(" ");
}
