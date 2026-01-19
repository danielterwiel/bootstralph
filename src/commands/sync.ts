/**
 * Sync command - Synchronize skills based on package.json
 *
 * Orchestrates the full skills sync flow:
 * - Scans package.json and config files
 * - Computes required skills
 * - Installs/removes skills as needed
 * - Reports results to user
 */

import * as p from "@clack/prompts";
import { syncSkills } from "../skills/index.js";
import { loadManifest } from "../skills/manifest.js";
import { computeDiff } from "../skills/diff.js";
import { computeRequiredSkills } from "../skills/mappings.js";
import { scanPackageJson } from "../detection/package-scanner.js";
import { scanConfigFiles } from "../detection/config-scanner.js";

/**
 * Options for sync command
 */
export interface SyncOptions {
  /**
   * Quiet mode - suppress progress logs (default: false)
   */
  quiet?: boolean;

  /**
   * Project root directory (default: process.cwd())
   */
  cwd?: string;
}

/**
 * Handle the sync command
 *
 * Synchronizes OpenSkills based on project dependencies and configuration.
 * Shows summary of installed and removed skills.
 *
 * @param options - Sync command options
 *
 * @example
 * ```typescript
 * // Sync with progress logs
 * await sync();
 *
 * // Sync in quiet mode
 * await sync({ quiet: true });
 *
 * // Sync specific directory
 * await sync({ cwd: '/path/to/project' });
 * ```
 */
export async function sync(options: SyncOptions = {}): Promise<void> {
  const { quiet = false, cwd = process.cwd() } = options;

  const log = (...args: unknown[]) => {
    if (!quiet) {
      console.log(...args);
    }
  };

  if (!quiet) {
    p.intro("bootsralph sync");
  }

  try {
    // Get pre-sync state to compute diff
    const preManifest = await loadManifest(cwd);
    const packageScan = await scanPackageJson(cwd);
    const configFiles = await scanConfigFiles(cwd);
    const requiredSkills = await computeRequiredSkills(
      packageScan.dependencies,
      packageScan.devDependencies,
      configFiles
    );
    const diff = computeDiff(preManifest, requiredSkills);

    // Perform sync
    await syncSkills({ quiet, projectRoot: cwd });

    // Report results
    const installed = diff.toInstall.length;
    const removed = diff.toRemove.length;

    if (!quiet) {
      const parts: string[] = [];
      if (installed > 0) {
        parts.push(`+${installed} installed`);
      }
      if (removed > 0) {
        parts.push(`-${removed} removed`);
      }

      if (parts.length > 0) {
        log(`\n${parts.join(", ")}`);
      } else {
        log("\nNo changes needed - skills already up to date");
      }

      p.outro("Done");
    }
  } catch (error) {
    if (!quiet) {
      p.log.error(
        `Sync failed: ${error instanceof Error ? error.message : String(error)}`
      );
      p.outro("Failed");
    }
    throw error;
  }
}
