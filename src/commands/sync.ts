/**
 * Sync command - Synchronize skills based on package.json
 *
 * Orchestrates the full skills sync flow:
 * - Scans package.json and config files
 * - Computes required skills
 * - (Interactive mode) Shows skills and lets user select
 * - Installs/removes skills as needed
 * - Reports results to user
 *
 * This follows Anthropic's context engineering best practices:
 * - Skills are opt-in by default in interactive mode
 * - Users can preview and select which skills to install
 * - Only skills that match project characteristics are suggested
 */

import * as p from "@clack/prompts";
import { previewSkills, syncSkills } from "../skills/index.js";

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

  /**
   * Interactive mode - prompt user to select skills (default: true)
   */
  interactive?: boolean;

  /**
   * Auto mode - install all matched skills without prompting (default: false)
   * When true, behaves like the old automatic installation
   */
  auto?: boolean;
}

/**
 * Handle the sync command
 *
 * Synchronizes OpenSkills based on project dependencies and configuration.
 * By default, shows users which skills match their project and lets them
 * choose which to install (opt-in). Use --auto to install all matched skills.
 *
 * @param options - Sync command options
 *
 * @example
 * ```typescript
 * // Interactive sync (default) - user selects skills
 * await sync();
 *
 * // Auto sync - install all matched skills
 * await sync({ auto: true });
 *
 * // Quiet mode with auto
 * await sync({ quiet: true, auto: true });
 * ```
 */
export async function sync(options: SyncOptions = {}): Promise<void> {
  const {
    quiet = false,
    cwd = process.cwd(),
    interactive = true,
    auto = false,
  } = options;

  const log = (...args: unknown[]) => {
    if (!quiet) {
      console.log(...args);
    }
  };

  if (!quiet) {
    p.intro("bootstralph sync");
  }

  try {
    // Preview what skills would be installed
    const preview = await previewSkills(cwd);

    // If nothing to do, exit early
    if (preview.toInstall.length === 0 && preview.toRemove.length === 0) {
      if (!quiet) {
        log("\nNo skill changes detected");
        if (preview.installed.length > 0) {
          log(`Currently installed: ${preview.installed.join(", ")}`);
        }
        p.outro("Done");
      }
      return;
    }

    let selectedSkills: string[] | undefined;

    // Interactive mode: let user select skills
    if (interactive && !auto && !quiet && preview.toInstall.length > 0) {
      log("\nDetected skills based on your project:");

      const SELECT_ALL_VALUE = "__select_all__";
      const skillOptions = preview.toInstall.map((skill) => ({
        value: skill.skill,
        label: skill.skill,
        hint: skill.reason,
      }));

      const options = [
        {
          value: SELECT_ALL_VALUE,
          label: "Select all",
          hint: "Install all recommended skills",
        },
        ...skillOptions,
      ];

      const selected = await p.multiselect({
        message: "Select skills to install (space to toggle, enter to confirm)",
        options,
        initialValues: [], // None selected by default - true opt-in
        required: false,
      });

      if (p.isCancel(selected)) {
        p.cancel("Operation cancelled");
        return;
      }

      const selectedValues = selected as string[];

      // Handle "Select all" option
      if (selectedValues.includes(SELECT_ALL_VALUE)) {
        selectedSkills = preview.toInstall.map((s) => s.skill);
      } else {
        selectedSkills = selectedValues;
      }

      if (selectedSkills.length === 0) {
        log("\nNo skills selected");
        p.outro("Done");
        return;
      }
    }

    // Perform sync
    const syncOptions: Parameters<typeof syncSkills>[0] = {
      quiet,
      projectRoot: cwd,
    };
    // Only add selectedSkills if we have a selection (opt-in mode)
    if (!auto && selectedSkills && selectedSkills.length > 0) {
      syncOptions.selectedSkills = selectedSkills;
    }
    const result = await syncSkills(syncOptions);

    // Report results
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
        log("\nNo changes made");
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
        `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      p.outro("Failed");
    }
    throw error;
  }
}
