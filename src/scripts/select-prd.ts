#!/usr/bin/env node
/**
 * PRD Selector Script - Interactive PRD selection using OpenTUI
 *
 * This script is called by ralph.sh to present a nice TUI for selecting PRDs.
 * It outputs the selected PRD filename to stdout for the bash script to use.
 *
 * Usage:
 *   bun run src/scripts/select-prd.ts
 *   # Returns: prd-example.json (or exits with code 1 if cancelled)
 */

import {
  createCliRenderer,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type SelectOption,
  type CliRenderer,
} from "@opentui/core";
import * as fs from "fs-extra";
import * as path from "path";

interface PrdData {
  name: string;
  description?: string;
  status?: string;
  userStories?: Array<{ passes: boolean }>;
  implementation_tasks?: Array<{ status: string }>;
}

interface PrdInfo {
  filename: string;
  name: string;
  progress: string;
  isComplete: boolean;
}

const AGENTS_TASKS_DIR = ".agents/tasks";

/**
 * Load and parse a PRD file
 */
async function loadPrd(filepath: string): Promise<PrdData | null> {
  try {
    const content = await fs.readFile(filepath, "utf-8");
    return JSON.parse(content) as PrdData;
  } catch {
    return null;
  }
}

/**
 * Calculate PRD progress
 */
function getPrdProgress(prd: PrdData): { completed: number; total: number } {
  if (prd.userStories) {
    const total = prd.userStories.length;
    const completed = prd.userStories.filter((s) => s.passes).length;
    return { completed, total };
  }

  if (prd.implementation_tasks) {
    const total = prd.implementation_tasks.length;
    const completed = prd.implementation_tasks.filter(
      (t) => t.status === "completed"
    ).length;
    return { completed, total };
  }

  return { completed: 0, total: 0 };
}

/**
 * Check if PRD is complete
 */
function isPrdComplete(prd: PrdData): boolean {
  if (prd.userStories) {
    return prd.userStories.every((s) => s.passes);
  }

  if (prd.implementation_tasks) {
    return prd.implementation_tasks.every((t) => t.status === "completed");
  }

  return false;
}

/**
 * Get all PRD files with their info
 */
async function getPrdInfos(): Promise<PrdInfo[]> {
  const tasksDir = path.resolve(process.cwd(), AGENTS_TASKS_DIR);

  if (!(await fs.pathExists(tasksDir))) {
    return [];
  }

  const files = await fs.readdir(tasksDir);
  const prdFiles = files.filter(
    (f) => f.startsWith("prd-") && f.endsWith(".json")
  );

  const infos: PrdInfo[] = [];

  for (const filename of prdFiles) {
    const filepath = path.join(tasksDir, filename);
    const prd = await loadPrd(filepath);

    if (prd) {
      const progress = getPrdProgress(prd);
      const percentage =
        progress.total > 0
          ? Math.round((progress.completed / progress.total) * 100)
          : 0;

      infos.push({
        filename,
        name: prd.name || filename,
        progress: `${progress.completed}/${progress.total} (${percentage}%)`,
        isComplete: isPrdComplete(prd),
      });
    }
  }

  return infos;
}

/**
 * Get incomplete PRDs
 */
async function getIncompletePrds(): Promise<PrdInfo[]> {
  const allPrds = await getPrdInfos();
  return allPrds.filter((p) => !p.isComplete);
}

/**
 * Main selector function
 */
async function main(): Promise<void> {
  const incompletePrds = await getIncompletePrds();

  if (incompletePrds.length === 0) {
    // No incomplete PRDs - check if any exist at all
    const allPrds = await getPrdInfos();
    if (allPrds.length === 0) {
      console.error("No PRD files found in .agents/tasks/");
      console.error('Create one with: bootstralph prd "your feature description"');
    } else {
      console.error("All PRDs are complete!");
    }
    process.exit(1);
  }

  // If only one PRD, select it automatically
  if (incompletePrds.length === 1) {
    console.log(incompletePrds[0]!.filename);
    process.exit(0);
  }

  // Create the renderer
  let renderer: CliRenderer;
  try {
    renderer = await createCliRenderer({
      exitOnCtrlC: false,
      useAlternateScreen: true,
      useMouse: false,
    });
  } catch (error) {
    // Fallback for environments where OpenTUI can't initialize
    console.error("Could not initialize TUI, falling back to simple mode");
    process.exit(1);
  }

  // Create title
  const title = new TextRenderable(renderer, {
    id: "title",
    content: "Select a PRD to work on:",
    fg: "#38BDF8",
    top: 0,
    left: 0,
    height: 1,
  });

  // Create options for Select
  const options: SelectOption[] = incompletePrds.map((prd) => ({
    name: prd.name,
    description: `${prd.progress} - ${prd.filename}`,
    value: prd.filename,
  }));

  // Create select component
  const select = new SelectRenderable(renderer, {
    id: "prd-selector",
    top: 2,
    left: 0,
    height: Math.min(incompletePrds.length * 2 + 2, 20),
    options,
    backgroundColor: "transparent",
    focusedBackgroundColor: "transparent",
    selectedBackgroundColor: "#1E3A5F",
    textColor: "#E2E8F0",
    selectedTextColor: "#38BDF8",
    descriptionColor: "#64748B",
    selectedDescriptionColor: "#94A3B8",
    showScrollIndicator: true,
    wrapSelection: true,
    showDescription: true,
  });

  // Create help text
  const selectHeight = Math.min(incompletePrds.length * 2 + 2, 20);
  const help = new TextRenderable(renderer, {
    id: "help",
    content: "Use arrow keys to navigate, Enter to select, Ctrl+C to cancel",
    fg: "#64748B",
    top: selectHeight + 3,
    left: 0,
    height: 1,
  });

  // Handle selection
  select.on(
    SelectRenderableEvents.ITEM_SELECTED,
    (_index: number, option: SelectOption) => {
      renderer.destroy();
      console.log(option.value as string);
      process.exit(0);
    }
  );

  // Handle Ctrl+C
  renderer.keyInput.on("keypress", (key) => {
    if (key.ctrl && key.name === "c") {
      renderer.destroy();
      process.exit(1);
    }
  });

  // Add renderables to root
  renderer.root.add(title);
  renderer.root.add(select);
  renderer.root.add(help);

  // Focus the select and start
  renderer.focusRenderable(select);
  renderer.start();
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
