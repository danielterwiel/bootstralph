import * as p from "@clack/prompts";
import { setTimeout } from "node:timers/promises";

/**
 * CLI version - should match package.json
 */
const VERSION = "0.1.0";

/**
 * Available presets for quick project scaffolding
 */
const VALID_PRESETS = [
  "saas",
  "mobile",
  "api",
  "content",
  "universal",
  "fullstack",
] as const;

type Preset = (typeof VALID_PRESETS)[number];

/**
 * Parsed CLI arguments
 */
interface ParsedArgs {
  command: "create" | "init" | "add" | "help" | "version";
  projectName: string | undefined;
  preset: Preset | undefined;
  args: string[];
}

/**
 * Parse command-line arguments
 */
function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // Remove node and script path

  // Handle flags first
  if (args.includes("--version") || args.includes("-v")) {
    return { command: "version", projectName: undefined, preset: undefined, args: [] };
  }
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    return { command: "help", projectName: undefined, preset: undefined, args: [] };
  }

  const command = args[0];
  const restArgs = args.slice(1);

  // Find --preset flag
  let preset: Preset | undefined;
  const presetIndex = restArgs.findIndex(
    (arg) => arg === "--preset" || arg === "-p"
  );
  if (presetIndex !== -1 && restArgs[presetIndex + 1]) {
    const presetValue = restArgs[presetIndex + 1];
    if (VALID_PRESETS.includes(presetValue as Preset)) {
      preset = presetValue as Preset;
    } else {
      // Invalid preset will be handled in the command
      preset = undefined;
    }
    // Remove preset args from restArgs
    restArgs.splice(presetIndex, 2);
  }

  // Get project name (first non-flag argument)
  const projectName = restArgs.find((arg) => !arg.startsWith("-"));

  switch (command) {
    case "create":
      return { command: "create", projectName, preset, args: restArgs };
    case "init":
      return { command: "init", projectName: undefined, preset: undefined, args: restArgs };
    case "add":
      return { command: "add", projectName: undefined, preset: undefined, args: restArgs };
    default:
      // Treat unknown command as project name for create
      if (command && !command.startsWith("-")) {
        return {
          command: "create",
          projectName: command,
          preset,
          args: restArgs,
        };
      }
      return { command: "help", projectName: undefined, preset: undefined, args: [] };
  }
}

/**
 * Display version information
 */
function showVersion(): void {
  console.log(`bootstralph v${VERSION}`);
}

/**
 * Display help information
 */
function showHelp(): void {
  console.log(`
bootstralph v${VERSION}
CLI for scaffolding Ralph-powered projects

Usage:
  bootstralph create [project-name] [options]
  bootstralph init
  bootstralph add <feature> [options]

Commands:
  create [name]    Create a new Ralph-powered project
  init             Initialize Ralph in an existing project
  add <feature>    Add features to an existing project

Options:
  -p, --preset <preset>   Use a preset configuration
                          Presets: saas, mobile, api, content, universal, fullstack
  -v, --version           Show version number
  -h, --help              Show this help message

Examples:
  bootstralph create my-app
  bootstralph create my-app --preset saas
  bootstralph my-app                         # Shorthand for 'create my-app'
  bootstralph init
  bootstralph add auth --provider better-auth

Learn more: https://github.com/danterwiel/bootstralph
`);
}

/**
 * Handle the 'create' command - main wizard entry point
 */
async function handleCreate(
  projectName?: string,
  preset?: Preset
): Promise<void> {
  p.intro("bootstralph - Ralph-powered project scaffolding");

  // If no project name provided, prompt for it
  let name = projectName;
  if (!name) {
    const nameResult = await p.text({
      message: "What is your project named?",
      placeholder: "my-ralph-app",
      validate: (value) => {
        if (!value) return "Project name is required";
        if (!/^[a-z0-9-_]+$/i.test(value)) {
          return "Project name can only contain letters, numbers, hyphens, and underscores";
        }
        return undefined;
      },
    });

    if (p.isCancel(nameResult)) {
      p.cancel("Operation cancelled");
      process.exit(0);
    }

    name = nameResult;
  }

  // Display preset info if provided
  if (preset) {
    p.note(`Using preset: ${preset}`, "Preset");
  }

  // TODO: This will be implemented in subsequent tasks (impl-006 through impl-018)
  // For now, show a placeholder message
  const s = p.spinner();
  s.start("Initializing project configuration...");
  await setTimeout(500);
  s.stop("Configuration ready");

  p.note(
    `Project: ${name}${preset ? `\nPreset: ${preset}` : ""}`,
    "Project Details"
  );

  // Placeholder for future implementation
  p.log.info("The full wizard will be implemented in upcoming tasks:");
  p.log.step("impl-006: Project type selection (Web/Mobile/API)");
  p.log.step("impl-007: Framework selection with compatibility filtering");
  p.log.step("impl-008: Features selection (auth, DB, etc.)");
  p.log.step("impl-009: Deployment target selection");
  p.log.step("impl-010: Tooling selection (linting, formatting, testing)");
  p.log.step("impl-011 to impl-017: Scaffolders for each framework");
  p.log.step("impl-018: Create command orchestration");

  p.outro(`Ready to build ${name} with Ralph!`);
}

/**
 * Handle the 'init' command - initialize Ralph in existing project
 */
async function handleInit(): Promise<void> {
  p.intro("bootstralph init - Add Ralph to existing project");

  // TODO: Will be implemented in impl-025
  p.log.warn("The init command will be implemented in impl-025");

  p.outro("Coming soon!");
}

/**
 * Handle the 'add' command - add features to existing project
 */
async function handleAdd(args: string[]): Promise<void> {
  p.intro("bootstralph add - Add features to your project");

  const feature = args[0];
  if (!feature) {
    p.log.error("Please specify a feature to add");
    p.log.info("Usage: bootstralph add <feature> [options]");
    p.log.info("Available features: auth, payments, skill");
    process.exit(1);
  }

  // TODO: Will be implemented in impl-026
  p.log.warn(`Adding '${feature}' will be implemented in impl-026`);

  p.outro("Coming soon!");
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  switch (parsed.command) {
    case "version":
      showVersion();
      break;
    case "help":
      showHelp();
      break;
    case "create":
      await handleCreate(parsed.projectName, parsed.preset);
      break;
    case "init":
      await handleInit();
      break;
    case "add":
      await handleAdd(parsed.args);
      break;
  }
}

// Run the CLI
main().catch((error: unknown) => {
  p.log.error("An unexpected error occurred:");
  console.error(error);
  process.exit(1);
});
