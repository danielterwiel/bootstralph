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
    // Perform sync (which handles all the internal steps)
    const result = await syncSkills({ quiet, projectRoot: cwd });

    // Report results based on actual sync outcome
    if (!quiet) {
      const parts: string[] = [];
      if (result.installed > 0) {
        parts.push(`+${result.installed} installed`);
      }
      if (result.failed > 0) {
        parts.push(`${result.failed} failed`);
      }
      if (result.removed > 0) {
        parts.push(`-${result.removed} removed`);
      }

      if (parts.length > 0) {
        log(`\n${parts.join(", ")}`);
      } else {
        log("\nNo changes needed - skills already up to date");
      }

      // Show failed skills if any
      if (result.failed > 0 && result.failedSkills.length > 0) {
        p.log.warn(`Failed to install: ${result.failedSkills.join(", ")}`);
        p.outro("Completed with errors");
      } else {
        p.outro("Done");
      }
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
