/**
 * Create command orchestration
 * Orchestrates the full wizard flow: project type → framework → features → deployment → tooling → scaffold
 * Handles presets for quick project setup and validates all selections
 */

import * as p from "@clack/prompts";
import path from "node:path";
import fs from "fs-extra";
import type {
  Target,
  Platform,
  Framework,
  Styling,
  StateManagement,
  ORM,
  Backend,
  AuthProvider,
  DeploymentTarget,
  Linter,
  Formatter,
  UnitTestFramework,
  E2ETestFramework,
  PreCommitTool,
  Routing,
} from "../compatibility/matrix.js";
import {
  FRAMEWORKS,
  DEFAULTS,
  derivePlatformFromTargets,
} from "../compatibility/matrix.js";
import { validateAllSelections } from "../compatibility/validators.js";
import { promptProjectType } from "../prompts/project-type.js";
import {
  promptFramework,
  getFrameworkDisplayName,
} from "../prompts/framework.js";
import { promptFeatures } from "../prompts/features.js";
import { promptDeployment } from "../prompts/deployment.js";
import { promptTooling } from "../prompts/tooling.js";
import {
  scaffoldNextjs,
  type NextjsScaffoldOptions,
} from "../scaffolders/nextjs.js";
import {
  scaffoldTanStack,
  type TanStackScaffoldOptions,
} from "../scaffolders/tanstack.js";
import { scaffoldExpo, type ExpoScaffoldOptions } from "../scaffolders/expo.js";
import {
  scaffoldRNCli,
  type RNCliScaffoldOptions,
} from "../scaffolders/rn-cli.js";
import {
  scaffoldReactRouter,
  type ReactRouterScaffoldOptions,
} from "../scaffolders/react-router.js";
import {
  scaffoldAstro,
  type AstroScaffoldOptions,
} from "../scaffolders/astro.js";
import {
  scaffoldApi,
  type ApiScaffoldOptions,
  type ApiFramework,
} from "../scaffolders/api.js";
import { generateLefthook } from "../generators/lefthook.js";
import { generateBootstralphConfig } from "../generators/bootstralph-config.js";
import { addPackageScripts } from "../generators/package-scripts.js";
import { sync } from "./sync.js";
import type { StackConfig } from "../types.js";
import { execa } from "execa";

// ============================================================================
// Types
// ============================================================================

/**
 * Preset configurations for quick project setup
 */
export type Preset =
  | "saas"
  | "mobile"
  | "api"
  | "content"
  | "universal"
  | "fullstack";

/**
 * Complete project configuration collected from wizard
 */
export interface ProjectConfig {
  projectName: string;
  targets: Target[];
  platform: Platform; // Derived from targets for backward compatibility
  framework: Framework;
  styling?: Styling;
  state?: StateManagement[];
  orm?: ORM;
  backend?: Backend;
  auth?: AuthProvider;
  deployment?: DeploymentTarget;
  deployments?: DeploymentTarget[]; // For multi-platform projects
  linter: Linter;
  formatter: Formatter;
  unitTesting: UnitTestFramework;
  e2eTesting?: E2ETestFramework;
  preCommit: PreCommitTool;
  packageManager: "bun" | "pnpm" | "npm" | "yarn";
  routing?: Routing;
  apiFramework?: ApiFramework;
}

/**
 * Result of the create command
 */
export interface CreateResult {
  success: boolean;
  projectPath: string;
  config: ProjectConfig;
  errors?: string[];
  warnings?: string[];
  nextSteps?: string[];
}

// ============================================================================
// Preset Configurations
// ============================================================================

/**
 * Preset configuration definitions
 * Each preset provides a complete configuration for a specific use case
 */
const PRESET_CONFIGS: Record<Preset, Partial<ProjectConfig>> = {
  saas: {
    targets: ["web"],
    platform: "web",
    framework: "nextjs",
    styling: "tailwind-shadcn",
    state: ["zustand", "tanstack-query"],
    orm: "drizzle",
    backend: "supabase",
    auth: "better-auth",
    deployment: "vercel",
    linter: "oxlint",
    formatter: "oxfmt",
    unitTesting: "vitest",
    e2eTesting: "playwright",
    preCommit: "prek",
    packageManager: "bun",
  },
  mobile: {
    targets: ["ios", "android"],
    platform: "mobile",
    framework: "expo",
    styling: "uniwind",
    state: ["zustand", "tanstack-query"],
    backend: "supabase",
    auth: "clerk",
    deployment: "eas",
    linter: "oxlint",
    formatter: "oxfmt",
    unitTesting: "jest",
    e2eTesting: "maestro",
    preCommit: "prek",
    packageManager: "bun",
    routing: "expo-router",
  },
  api: {
    targets: ["api"],
    platform: "api",
    framework: "hono",
    orm: "drizzle",
    auth: "better-auth",
    deployment: "cloudflare",
    linter: "oxlint",
    formatter: "oxfmt",
    unitTesting: "vitest",
    preCommit: "prek",
    packageManager: "bun",
    apiFramework: "hono",
  },
  content: {
    targets: ["web"],
    platform: "web",
    framework: "astro",
    styling: "tailwind",
    orm: "drizzle",
    backend: "supabase",
    deployment: "vercel",
    linter: "oxlint",
    formatter: "oxfmt",
    unitTesting: "vitest",
    e2eTesting: "playwright",
    preCommit: "prek",
    packageManager: "bun",
  },
  universal: {
    targets: ["web", "ios", "android"],
    platform: "universal",
    framework: "expo",
    styling: "tamagui",
    state: ["zustand", "tanstack-query"],
    backend: "supabase",
    auth: "clerk",
    deployment: "eas",
    deployments: ["vercel", "eas"], // Web + Mobile deployments
    linter: "oxlint",
    formatter: "oxfmt",
    unitTesting: "jest",
    e2eTesting: "maestro",
    preCommit: "prek",
    packageManager: "bun",
    routing: "expo-router",
  },
  fullstack: {
    targets: ["web"],
    platform: "web",
    framework: "nextjs",
    styling: "tailwind-shadcn",
    state: ["zustand", "tanstack-query"],
    orm: "drizzle",
    backend: "supabase",
    auth: "better-auth",
    deployment: "vercel",
    linter: "oxlint",
    formatter: "oxfmt",
    unitTesting: "vitest",
    e2eTesting: "playwright",
    preCommit: "prek",
    packageManager: "bun",
  },
};

// ============================================================================
// Main Create Command
// ============================================================================

/**
 * Main create command handler
 * Orchestrates the full wizard flow or applies preset configuration
 */
export async function handleCreate(
  projectName?: string,
  preset?: Preset,
): Promise<CreateResult | undefined> {
  p.intro("bootstralph - Ralph-powered project scaffolding");

  // Step 1: Get project name
  const name = await getProjectName(projectName);
  if (!name) return undefined;

  // Step 2: Check if project directory already exists
  const targetDir = process.cwd();
  const projectPath = path.join(targetDir, name);

  if (await fs.pathExists(projectPath)) {
    p.log.error(`Directory "${name}" already exists`);
    const overwrite = await p.confirm({
      message: "Do you want to overwrite it?",
      initialValue: false,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel("Operation cancelled");
      return undefined;
    }

    // Remove existing directory
    await fs.remove(projectPath);
  }

  // Step 3: Apply preset or run full wizard
  let config: ProjectConfig;

  if (preset) {
    config = await applyPreset(name, preset);
    p.log.info(`Using preset: ${preset}`);
    displayConfigSummary(config);
  } else {
    const wizardResult = await runWizard(name);
    if (!wizardResult) return undefined;
    config = wizardResult;
  }

  // Step 4: Validate configuration
  // Build selections object conditionally for exactOptionalPropertyTypes
  const selections: {
    platform?: Platform;
    framework?: Framework;
    styling?: Styling;
    orm?: ORM;
    auth?: AuthProvider;
    linter?: Linter;
    formatter?: Formatter;
    unitTesting?: UnitTestFramework;
    e2eTesting?: E2ETestFramework;
    deployment?: DeploymentTarget;
  } = {
    platform: config.platform,
    framework: config.framework,
    linter: config.linter,
    formatter: config.formatter,
    unitTesting: config.unitTesting,
  };
  if (config.styling) selections.styling = config.styling;
  if (config.orm) selections.orm = config.orm;
  if (config.auth) selections.auth = config.auth;
  if (config.e2eTesting) selections.e2eTesting = config.e2eTesting;
  if (config.deployment) selections.deployment = config.deployment;

  const validation = validateAllSelections(selections);

  if (!validation.valid) {
    p.log.error("Invalid configuration:");
    for (const error of validation.errors) {
      p.log.error(`  - ${error.message}`);
    }
    return undefined;
  }

  // Step 5: Confirm and scaffold
  const proceed = await p.confirm({
    message: "Ready to scaffold your project?",
    initialValue: true,
  });

  if (p.isCancel(proceed) || !proceed) {
    p.cancel("Operation cancelled");
    return undefined;
  }

  // Step 6: Run scaffolder
  const scaffoldResult = await runScaffolder(config, targetDir);

  if (!scaffoldResult.success) {
    p.log.error("Project scaffolding failed");
    if (scaffoldResult.errors) {
      for (const error of scaffoldResult.errors) {
        p.log.error(`  - ${error}`);
      }
    }
    return undefined;
  }

  // Step 7: Change to project directory
  const originalCwd = process.cwd();
  process.chdir(projectPath);

  try {
    // Step 8: Convert to StackConfig for generators
    const stackConfig = projectConfigToStackConfig(config);

    // Step 9: Generate lefthook configuration
    p.log.step("Generating lefthook configuration...");
    const lefthookResult = await generateLefthook(stackConfig, projectPath);
    let lefthookSkipped = false;
    if (!lefthookResult.success) {
      lefthookSkipped = true;
      p.log.info(
        `Skipping lefthook: ${lefthookResult.reason} (detected ${lefthookResult.hookSystem.indicator})`,
      );
    }

    // Step 10: Generate bootstralph config
    p.log.step("Generating bootstralph configuration...");
    await generateBootstralphConfig(stackConfig, projectPath);

    // Step 11: Add package scripts
    p.log.step("Adding package scripts...");
    await addPackageScripts(projectPath);

    // Step 12: Run lefthook install (only if lefthook was generated)
    if (!lefthookSkipped) {
      p.log.step("Installing lefthook...");
      await execa("lefthook", ["install"], { cwd: projectPath });
    }

    // Step 13: Sync skills (auto mode - install all matched skills for new projects)
    p.log.step("Syncing skills...");
    await sync({ quiet: true, cwd: projectPath, auto: true });

    // Step 14: Display warnings and next steps
    if (scaffoldResult.warnings && scaffoldResult.warnings.length > 0) {
      p.log.warn("Warnings:");
      for (const warning of scaffoldResult.warnings) {
        p.log.warn(`  - ${warning}`);
      }
    }

    const nextSteps = [
      `cd ${name}`,
      `${config.packageManager} install`,
      `${config.packageManager} run dev`,
      "",
      "Your project is ready! Ralph skills have been synced.",
      "Use 'ralph-tui' to plan and execute your next tasks.",
    ];

    if (scaffoldResult.nextSteps && scaffoldResult.nextSteps.length > 0) {
      nextSteps.push("", ...scaffoldResult.nextSteps);
    }

    p.note(nextSteps.join("\n"), "Next Steps");
    p.outro(`Project "${name}" created successfully!`);
  } catch (error) {
    p.log.error(
      `Post-scaffolding setup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  } finally {
    // Restore original working directory
    process.chdir(originalCwd);
  }

  // Build result object conditionally for exactOptionalPropertyTypes
  const result: CreateResult = {
    success: true,
    projectPath,
    config,
  };

  if (scaffoldResult.warnings && scaffoldResult.warnings.length > 0) {
    result.warnings = scaffoldResult.warnings;
  }

  // Always include next steps since we built them
  const nextStepsList = [
    `cd ${name}`,
    `${config.packageManager} install`,
    `${config.packageManager} run dev`,
    "",
    "Your project is ready! Ralph skills have been synced.",
    "Use 'ralph-tui' to plan and execute your next tasks.",
  ];

  if (scaffoldResult.nextSteps && scaffoldResult.nextSteps.length > 0) {
    nextStepsList.push("", ...scaffoldResult.nextSteps);
  }

  result.nextSteps = nextStepsList;

  return result;
}

// ============================================================================
// Wizard Flow
// ============================================================================

/**
 * Run the full wizard flow to collect project configuration
 */
async function runWizard(
  projectName: string,
): Promise<ProjectConfig | undefined> {
  // Step 1: Target platforms selection
  const projectTypeResult = await promptProjectType();
  if (!projectTypeResult) {
    p.cancel("Operation cancelled");
    return undefined;
  }

  const { targets, platform } = projectTypeResult;

  // Step 2: Framework selection (pass targets for better filtering)
  const frameworkResult = await promptFramework(targets);
  if (!frameworkResult) {
    p.cancel("Operation cancelled");
    return undefined;
  }

  // Step 2.5: API framework selection (if API platform)
  let apiFramework: ApiFramework | undefined;
  if (platform === "api") {
    apiFramework = frameworkResult.framework as ApiFramework;
  }

  // Step 3: Features selection
  const featuresResult = await promptFeatures({
    platform,
    framework: frameworkResult.framework,
  });
  if (!featuresResult) {
    p.cancel("Operation cancelled");
    return undefined;
  }

  // Step 4: Deployment selection (pass targets for multi-platform deployment)
  const deploymentContext: {
    framework: Framework;
    orm?: ORM;
    targets?: Target[];
  } = {
    framework: frameworkResult.framework,
    targets,
  };
  if (featuresResult.orm) {
    deploymentContext.orm = featuresResult.orm;
  }
  const deploymentResult = await promptDeployment(deploymentContext);
  if (!deploymentResult) {
    p.cancel("Operation cancelled");
    return undefined;
  }

  // Step 5: Tooling selection
  const toolingResult = await promptTooling({
    platform,
    framework: frameworkResult.framework,
  });
  if (!toolingResult) {
    p.cancel("Operation cancelled");
    return undefined;
  }

  // Build configuration
  const config: ProjectConfig = {
    projectName,
    targets,
    platform,
    framework: frameworkResult.framework,
    linter: toolingResult.linter,
    formatter: toolingResult.formatter,
    unitTesting: toolingResult.unitTesting,
    preCommit: toolingResult.preCommit,
    packageManager: DEFAULTS.packageManager,
  };

  // Add optional properties
  if (featuresResult.styling) {
    config.styling = featuresResult.styling;
  }
  if (featuresResult.state && featuresResult.state.length > 0) {
    config.state = featuresResult.state;
  }
  if (featuresResult.orm) {
    config.orm = featuresResult.orm;
  }
  if (featuresResult.backend) {
    config.backend = featuresResult.backend;
  }
  if (featuresResult.auth) {
    config.auth = featuresResult.auth;
  }
  if (deploymentResult.deployment) {
    config.deployment = deploymentResult.deployment;
  }
  if (deploymentResult.deployments && deploymentResult.deployments.length > 1) {
    config.deployments = deploymentResult.deployments;
  }
  if (toolingResult.e2eTesting) {
    config.e2eTesting = toolingResult.e2eTesting;
  }
  if (apiFramework) {
    config.apiFramework = apiFramework;
  }

  // Set routing based on framework
  const defaultRouting = getDefaultRouting(frameworkResult.framework);
  if (defaultRouting) {
    config.routing = defaultRouting;
  }

  // Display summary
  displayConfigSummary(config);

  return config;
}

// ============================================================================
// Preset Application
// ============================================================================

/**
 * Apply a preset configuration
 */
function applyPreset(projectName: string, preset: Preset): ProjectConfig {
  const presetConfig = PRESET_CONFIGS[preset];

  // Determine targets and platform
  const targets = presetConfig.targets ?? ["web"];
  const platform = presetConfig.platform ?? derivePlatformFromTargets(targets);

  // Merge preset with defaults
  const config: ProjectConfig = {
    projectName,
    targets,
    platform,
    framework: presetConfig.framework ?? "nextjs",
    linter: presetConfig.linter ?? DEFAULTS.linter,
    formatter: presetConfig.formatter ?? DEFAULTS.formatter,
    unitTesting: presetConfig.unitTesting ?? DEFAULTS.unitTesting[platform],
    preCommit: presetConfig.preCommit ?? DEFAULTS.preCommit,
    packageManager: presetConfig.packageManager ?? DEFAULTS.packageManager,
  };

  // Add optional properties from preset
  if (presetConfig.styling) {
    config.styling = presetConfig.styling;
  }
  if (presetConfig.state) {
    config.state = presetConfig.state;
  }
  if (presetConfig.orm) {
    config.orm = presetConfig.orm;
  }
  if (presetConfig.backend) {
    config.backend = presetConfig.backend;
  }
  if (presetConfig.auth) {
    config.auth = presetConfig.auth;
  }
  if (presetConfig.deployment) {
    config.deployment = presetConfig.deployment;
  }
  if (presetConfig.deployments) {
    config.deployments = presetConfig.deployments;
  }
  if (presetConfig.e2eTesting) {
    config.e2eTesting = presetConfig.e2eTesting;
  }
  if (presetConfig.routing) {
    config.routing = presetConfig.routing;
  }
  if (presetConfig.apiFramework) {
    config.apiFramework = presetConfig.apiFramework;
  }

  return config;
}

// ============================================================================
// Scaffolding
// ============================================================================

/**
 * Run the appropriate scaffolder based on framework
 */
async function runScaffolder(
  config: ProjectConfig,
  targetDir: string,
): Promise<{
  success: boolean;
  projectPath: string;
  errors?: string[];
  warnings?: string[];
  nextSteps?: string[];
}> {
  const projectPath = path.join(targetDir, config.projectName);

  switch (config.framework) {
    case "nextjs":
      return await scaffoldNextjs(buildNextjsOptions(config, targetDir));

    case "tanstack-start":
      return await scaffoldTanStack(buildTanStackOptions(config, targetDir));

    case "expo":
      return await scaffoldExpo(buildExpoOptions(config, targetDir));

    case "react-native-cli":
      return await scaffoldRNCli(buildRNCliOptions(config, targetDir));

    case "react-router":
      return await scaffoldReactRouter(
        buildReactRouterOptions(config, targetDir),
      );

    case "astro":
      return await scaffoldAstro(buildAstroOptions(config, targetDir));

    case "hono":
    case "elysia":
      return await scaffoldApi(buildApiOptions(config, targetDir));

    default:
      return {
        success: false,
        projectPath,
        errors: [`Unknown framework: ${config.framework}`],
      };
  }
}

// ============================================================================
// Options Builders
// ============================================================================

function buildNextjsOptions(
  config: ProjectConfig,
  targetDir: string,
): NextjsScaffoldOptions {
  const options: NextjsScaffoldOptions = {
    projectName: config.projectName,
    targetDir,
    packageManager: config.packageManager,
    appRouter: true,
    turbopack: true,
  };

  if (config.styling) options.styling = config.styling;
  if (config.state) options.state = config.state;
  if (config.orm) options.orm = config.orm;
  if (config.backend) options.backend = config.backend;
  if (config.auth) options.auth = config.auth;
  if (config.deployment) options.deployment = config.deployment;
  if (config.linter) options.linter = config.linter;
  if (config.formatter) options.formatter = config.formatter;
  if (config.unitTesting) options.unitTesting = config.unitTesting;
  if (config.e2eTesting) options.e2eTesting = config.e2eTesting;
  if (config.preCommit) options.preCommit = config.preCommit;

  return options;
}

function buildTanStackOptions(
  config: ProjectConfig,
  targetDir: string,
): TanStackScaffoldOptions {
  const options: TanStackScaffoldOptions = {
    projectName: config.projectName,
    targetDir,
    packageManager: config.packageManager,
    useBiome: config.linter === "biome",
    addShadcn: config.styling === "tailwind-shadcn",
    addTanStackQuery: config.state?.includes("tanstack-query") ?? true,
  };

  if (config.styling) options.styling = config.styling;
  if (config.state) options.state = config.state;
  if (config.orm) options.orm = config.orm;
  if (config.backend) options.backend = config.backend;
  if (config.auth) options.auth = config.auth;
  if (config.deployment) options.deployment = config.deployment;
  if (config.linter) options.linter = config.linter;
  if (config.formatter) options.formatter = config.formatter;
  if (config.unitTesting) options.unitTesting = config.unitTesting;
  if (config.e2eTesting) options.e2eTesting = config.e2eTesting;
  if (config.preCommit) options.preCommit = config.preCommit;

  return options;
}

function buildExpoOptions(
  config: ProjectConfig,
  targetDir: string,
): ExpoScaffoldOptions {
  const options: ExpoScaffoldOptions = {
    projectName: config.projectName,
    targetDir,
    packageManager: config.packageManager,
    universal: config.platform === "universal",
  };

  if (config.routing) {
    options.routing = config.routing as Extract<
      Routing,
      "expo-router" | "react-navigation"
    >;
  }
  if (config.styling) {
    options.styling = config.styling as Extract<
      Styling,
      "uniwind" | "nativewind" | "tamagui" | "unistyles" | "stylesheets"
    >;
  }
  if (config.state) options.state = config.state;
  if (config.backend) options.backend = config.backend;
  if (config.auth) options.auth = config.auth;
  if (config.deployment) {
    options.deployment = config.deployment as Extract<
      DeploymentTarget,
      "eas" | "local-builds" | "fastlane" | "codemagic"
    >;
  }
  if (config.linter) options.linter = config.linter;
  if (config.formatter) options.formatter = config.formatter;
  if (config.e2eTesting) {
    options.e2eTesting = config.e2eTesting as Extract<
      E2ETestFramework,
      "maestro" | "detox"
    >;
  }
  if (config.preCommit) options.preCommit = config.preCommit;

  return options;
}

function buildRNCliOptions(
  config: ProjectConfig,
  targetDir: string,
): RNCliScaffoldOptions {
  const options: RNCliScaffoldOptions = {
    projectName: config.projectName,
    targetDir,
    packageManager: config.packageManager,
  };

  if (config.styling) {
    options.styling = config.styling as Extract<
      Styling,
      "uniwind" | "nativewind" | "tamagui" | "stylesheets"
    >;
  }
  if (config.state) options.state = config.state;
  if (config.backend) options.backend = config.backend;
  if (config.auth) options.auth = config.auth;
  if (config.deployment) {
    options.deployment = config.deployment as Extract<
      DeploymentTarget,
      "fastlane" | "local-builds"
    >;
  }
  if (config.linter) options.linter = config.linter;
  if (config.formatter) options.formatter = config.formatter;
  if (config.e2eTesting) {
    options.e2eTesting = config.e2eTesting as Extract<
      E2ETestFramework,
      "maestro" | "detox"
    >;
  }
  if (config.preCommit) options.preCommit = config.preCommit;

  return options;
}

function buildReactRouterOptions(
  config: ProjectConfig,
  targetDir: string,
): ReactRouterScaffoldOptions {
  const options: ReactRouterScaffoldOptions = {
    projectName: config.projectName,
    targetDir,
    packageManager: config.packageManager,
  };

  if (config.styling) options.styling = config.styling;
  if (config.state) options.state = config.state;
  if (config.orm) options.orm = config.orm;
  if (config.backend) options.backend = config.backend;
  if (config.auth) options.auth = config.auth;
  if (config.deployment) options.deployment = config.deployment;
  if (config.linter) options.linter = config.linter;
  if (config.formatter) options.formatter = config.formatter;
  if (config.unitTesting) options.unitTesting = config.unitTesting;
  if (config.e2eTesting) options.e2eTesting = config.e2eTesting;
  if (config.preCommit) options.preCommit = config.preCommit;

  return options;
}

function buildAstroOptions(
  config: ProjectConfig,
  targetDir: string,
): AstroScaffoldOptions {
  const options: AstroScaffoldOptions = {
    projectName: config.projectName,
    targetDir,
    packageManager: config.packageManager,
  };

  if (config.styling) {
    options.styling = config.styling as Extract<
      Styling,
      "tailwind" | "vanilla"
    >;
  }
  if (config.orm) options.orm = config.orm;
  if (config.backend) options.backend = config.backend;
  if (config.auth) options.auth = config.auth;
  if (config.deployment) {
    options.deployment = config.deployment as Extract<
      DeploymentTarget,
      "vercel" | "netlify" | "cloudflare"
    >;
  }
  if (config.linter) options.linter = config.linter;
  if (config.formatter) options.formatter = config.formatter;
  if (config.unitTesting) options.unitTesting = config.unitTesting;
  if (config.e2eTesting) options.e2eTesting = config.e2eTesting;
  if (config.preCommit) options.preCommit = config.preCommit;

  return options;
}

function buildApiOptions(
  config: ProjectConfig,
  targetDir: string,
): ApiScaffoldOptions {
  const options: ApiScaffoldOptions = {
    projectName: config.projectName,
    targetDir,
    packageManager: config.packageManager,
    framework: config.apiFramework ?? (config.framework as ApiFramework),
  };

  if (config.orm) options.orm = config.orm;
  if (config.auth) options.auth = config.auth;
  if (config.deployment) options.deployment = config.deployment;
  if (config.linter) options.linter = config.linter;
  if (config.formatter) options.formatter = config.formatter;
  if (config.unitTesting) options.unitTesting = config.unitTesting;
  if (config.preCommit) options.preCommit = config.preCommit;

  return options;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert ProjectConfig to StackConfig for generators
 */
function projectConfigToStackConfig(config: ProjectConfig): StackConfig {
  const stackConfig: StackConfig = {
    packageManager: config.packageManager,
  };

  // Map framework
  if (config.framework) {
    stackConfig.framework = config.framework;
  }

  // Map auth
  if (config.auth) {
    stackConfig.auth = config.auth;
  }

  // Map database - use backend or orm
  if (config.backend) {
    stackConfig.database = config.backend;
  } else if (config.orm && config.orm !== "none") {
    stackConfig.database = config.orm;
  }

  // Map styling
  if (config.styling) {
    stackConfig.styling = config.styling;
  }

  // Map testing
  if (config.unitTesting) {
    stackConfig.testing = config.unitTesting;
  } else if (config.e2eTesting) {
    stackConfig.testing = config.e2eTesting;
  }

  // Map deployment
  if (config.deployment) {
    stackConfig.deployment = config.deployment;
  }

  // Map tooling
  stackConfig.tooling = {
    linting: !!config.linter,
    formatting: !!config.formatter,
    hasTypeScript: true, // Default to true for new projects
    hasTests: !!config.unitTesting,
  };

  return stackConfig;
}

/**
 * Get project name from argument or prompt
 */
async function getProjectName(
  projectName?: string,
): Promise<string | undefined> {
  if (projectName) {
    // Validate provided name
    if (!/^[a-z0-9-_]+$/i.test(projectName)) {
      p.log.error(
        "Project name can only contain letters, numbers, hyphens, and underscores",
      );
      return undefined;
    }
    return projectName;
  }

  const result = await p.text({
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

  if (p.isCancel(result)) {
    p.cancel("Operation cancelled");
    return undefined;
  }

  return result;
}

/**
 * Get default routing for a framework
 */
function getDefaultRouting(framework: Framework): Routing | undefined {
  const frameworkConfig = FRAMEWORKS[framework];
  if (frameworkConfig.routing.length === 0) return undefined;
  return frameworkConfig.routing[0];
}

/**
 * Display configuration summary
 */
function displayConfigSummary(config: ProjectConfig): void {
  // Format targets for display
  const targetLabels: Record<Target, string> = {
    web: "Web",
    ios: "iOS",
    android: "Android",
    api: "API",
  };
  const targetsDisplay = config.targets.map((t) => targetLabels[t]).join(" + ");

  const summaryLines: string[] = [
    `Project: ${config.projectName}`,
    `Targets: ${targetsDisplay}`,
    `Framework: ${getFrameworkDisplayName(config.framework)}`,
  ];

  if (config.styling) {
    summaryLines.push(`Styling: ${config.styling}`);
  }
  if (config.state && config.state.length > 0) {
    summaryLines.push(`State: ${config.state.join(", ")}`);
  }
  if (config.orm && config.orm !== "none") {
    summaryLines.push(`ORM: ${config.orm}`);
  }
  if (config.backend) {
    summaryLines.push(`Backend: ${config.backend}`);
  }
  if (config.auth) {
    summaryLines.push(`Auth: ${config.auth}`);
  }
  if (config.deployments && config.deployments.length > 1) {
    summaryLines.push(`Deployments: ${config.deployments.join(", ")}`);
  } else if (config.deployment) {
    summaryLines.push(`Deployment: ${config.deployment}`);
  }
  summaryLines.push(`Linter: ${config.linter}`);
  summaryLines.push(`Formatter: ${config.formatter}`);
  summaryLines.push(`Unit Testing: ${config.unitTesting}`);
  if (config.e2eTesting) {
    summaryLines.push(`E2E Testing: ${config.e2eTesting}`);
  }
  summaryLines.push(`Pre-commit: ${config.preCommit}`);
  summaryLines.push(`Package Manager: ${config.packageManager}`);

  p.note(summaryLines.join("\n"), "Configuration Summary");
}

// ============================================================================
// Exports
// ============================================================================

export {
  PRESET_CONFIGS,
  runWizard,
  applyPreset,
  runScaffolder,
  displayConfigSummary,
};
