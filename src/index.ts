#!/usr/bin/env bun
/**
 * bootsralph CLI entry point
 *
 * v2: Stack scaffolding + skills sync + pre-commit hooks
 * Delegates planning/execution to Ralph TUI
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import { handleCreate, type Preset } from "./commands/create.js";
import { handleInit } from "./commands/init.js";

const VERSION = "0.2.0";

const VALID_PRESETS: readonly Preset[] = [
  "saas",
  "mobile",
  "api",
  "content",
  "universal",
  "fullstack",
];

async function handleSync(quiet: boolean): Promise<void> {
  if (!quiet) {
    p.intro("bootsralph sync");
  }
  // TODO: Implement skills sync (US-017)
  p.log.warn("sync command not yet implemented - coming in v2");
  if (!quiet) {
    p.outro("Done");
  }
}

async function handleDetect(): Promise<void> {
  p.intro("bootsralph detect");
  // TODO: Implement stack detection (US-010)
  p.log.warn("detect command not yet implemented - coming in v2");
  p.outro("Done");
}

const program = new Command();

program
  .name("bootsralph")
  .version(VERSION)
  .description("Stack scaffolding + skills sync + pre-commit hooks");

program
  .command("create")
  .description("Create a new project with wizard")
  .argument("[project-name]", "Name of the project to create")
  .option("-p, --preset <preset>", `Use a preset configuration (${VALID_PRESETS.join(", ")})`)
  .option("-q, --quiet", "Quiet mode (less output)")
  .action(async (projectName: string | undefined, options: { preset?: Preset; quiet?: boolean }) => {
    await handleCreate(projectName, options.preset);
  });

program
  .command("init")
  .description("Initialize bootsralph in existing project")
  .action(async () => {
    await handleInit();
  });

program
  .command("sync")
  .description("Sync skills based on package.json")
  .option("-q, --quiet", "Quiet mode (less output)")
  .action(async (options: { quiet?: boolean }) => {
    await handleSync(options.quiet ?? false);
  });

program
  .command("detect")
  .description("Print detected stack (debug)")
  .action(async () => {
    await handleDetect();
  });

program.parse();
