/**
 * bootsralph CLI entry point
 *
 * v2: Stack scaffolding + skills sync + pre-commit hooks
 * Delegates planning/execution to Ralph TUI
 */

import { Command } from "commander";
import { handleCreate, type Preset } from "./commands/create.js";
import { handleInit } from "./commands/init.js";
import { detect } from "./commands/detect.js";
import { sync } from "./commands/sync.js";

const VERSION = "0.2.0";

const VALID_PRESETS: readonly Preset[] = [
  "saas",
  "mobile",
  "api",
  "content",
  "universal",
  "fullstack",
];


async function handleDetect(): Promise<void> {
  await detect();
}

const program = new Command();

program
  .name("bootsralph")
  .version(VERSION)
  .description("Stack scaffolding + skills sync + pre-commit hooks");

program
  .command("create")
  .description("Create a new project with wizard")
  .argument("<name>", "Name of the project to create")
  .option("-p, --preset <preset>", `Use a preset configuration (${VALID_PRESETS.join(", ")})`)
  .action(async (name: string, options: { preset?: Preset }) => {
    await handleCreate(name, options.preset);
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
    await sync({ quiet: options.quiet ?? false });
  });

program
  .command("detect")
  .description("Print detected stack (debug)")
  .action(async () => {
    await handleDetect();
  });

program.parse();
