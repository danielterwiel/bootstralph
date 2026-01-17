/**
 * Create command orchestration
 * Orchestrates the full wizard flow: project type → framework → features → deployment → tooling → scaffold
 * Handles presets for quick project setup and validates all selections
 */

import * as p from "@clack/prompts";
import path from "node:path";
import fs from "fs-extra";
import type {
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
import { FRAMEWORKS, DEFAULTS } from "../compatibility/matrix.js";
import { validateAllSelections } from "../compatibility/validators.js";
import { promptProjectType } from "../prompts/project-type.js";
import { promptFramework, getFrameworkDisplayName } from "../prompts/framework.js";
import { promptFeatures } from "../prompts/features.js";
import { promptDeployment } from "../prompts/deployment.js";
import { promptTooling } from "../prompts/tooling.js";
import { scaffoldNextjs, type NextjsScaffoldOptions } from "../scaffolders/nextjs.js";
import { scaffoldTanStack, type TanStackScaffoldOptions } from "../scaffolders/tanstack.js";
import { scaffoldExpo, type ExpoScaffoldOptions } from "../scaffolders/expo.js";
import { scaffoldRNCli, type RNCliScaffoldOptions } from "../scaffolders/rn-cli.js";
import { scaffoldReactRouter, type ReactRouterScaffoldOptions } from "../scaffolders/react-router.js";
import { scaffoldAstro, type AstroScaffoldOptions } from "../scaffolders/astro.js";
import { scaffoldApi, type ApiScaffoldOptions, type ApiFramework } from "../scaffolders/api.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Preset configurations for quick project setup
 */
export type Preset = "saas" | "mobile" | "api" | "content" | "universal" | "fullstack";

/**
 * Complete project configuration collected from wizard
 */
export interface ProjectConfig {
  projectName: string;
  platform: Platform;
  framework: Framework;
  styling?: Styling;
  state?: StateManagement[];
  orm?: ORM;
  backend?: Backend;
  auth?: AuthProvider;
  deployment?: DeploymentTarget;
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
    platform: "universal",
    framework: "expo",
    styling: "tamagui",
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
  fullstack: {
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
  preset?: Preset
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
  }

  // Step 7: Display warnings and next steps
  if (scaffoldResult.warnings && scaffoldResult.warnings.length > 0) {
    p.log.warn("Warnings:");
    for (const warning of scaffoldResult.warnings) {
      p.log.warn(`  - ${warning}`);
    }
  }

  if (scaffoldResult.nextSteps && scaffoldResult.nextSteps.length > 0) {
    p.note(scaffoldResult.nextSteps.join("\n"), "Next Steps");
  }

  if (scaffoldResult.success) {
    p.outro(`Project "${name}" created successfully!`);
  }

  // Build result object conditionally for exactOptionalPropertyTypes
  const result: CreateResult = {
    success: scaffoldResult.success,
    projectPath: scaffoldResult.projectPath,
    config,
  };

  if (scaffoldResult.errors && scaffoldResult.errors.length > 0) {
    result.errors = scaffoldResult.errors;
  }
  if (scaffoldResult.warnings && scaffoldResult.warnings.length > 0) {
    result.warnings = scaffoldResult.warnings;
  }
  if (scaffoldResult.nextSteps && scaffoldResult.nextSteps.length > 0) {
    result.nextSteps = scaffoldResult.nextSteps;
  }

  return result;
}

// ============================================================================
// Wizard Flow
// ============================================================================

/**
 * Run the full wizard flow to collect project configuration
 */
async function runWizard(projectName: string): Promise<ProjectConfig | undefined> {
  // Step 1: Project type selection
  const projectTypeResult = await promptProjectType();
  if (!projectTypeResult) {
    p.cancel("Operation cancelled");
    return undefined;
  }

  // Step 2: Framework selection
  const frameworkResult = await promptFramework(projectTypeResult.platform);
  if (!frameworkResult) {
    p.cancel("Operation cancelled");
    return undefined;
  }

  // Step 2.5: API framework selection (if API platform)
  let apiFramework: ApiFramework | undefined;
  if (projectTypeResult.platform === "api") {
    apiFramework = frameworkResult.framework as ApiFramework;
  }

  // Step 3: Features selection
  const featuresResult = await promptFeatures({
    platform: projectTypeResult.platform,
    framework: frameworkResult.framework,
  });
  if (!featuresResult) {
    p.cancel("Operation cancelled");
    return undefined;
  }

  // Step 4: Deployment selection
  const deploymentContext: { framework: Framework; orm?: ORM } = {
    framework: frameworkResult.framework,
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
    platform: projectTypeResult.platform,
    framework: frameworkResult.framework,
  });
  if (!toolingResult) {
    p.cancel("Operation cancelled");
    return undefined;
  }

  // Build configuration
  const config: ProjectConfig = {
    projectName,
    platform: projectTypeResult.platform,
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

  // Merge preset with defaults
  const config: ProjectConfig = {
    projectName,
    platform: presetConfig.platform ?? "web",
    framework: presetConfig.framework ?? "nextjs",
    linter: presetConfig.linter ?? DEFAULTS.linter,
    formatter: presetConfig.formatter ?? DEFAULTS.formatter,
    unitTesting: presetConfig.unitTesting ?? DEFAULTS.unitTesting[presetConfig.platform ?? "web"],
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
  targetDir: string
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
      return await scaffoldReactRouter(buildReactRouterOptions(config, targetDir));

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

function buildNextjsOptions(config: ProjectConfig, targetDir: string): NextjsScaffoldOptions {
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

function buildTanStackOptions(config: ProjectConfig, targetDir: string): TanStackScaffoldOptions {
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

function buildExpoOptions(config: ProjectConfig, targetDir: string): ExpoScaffoldOptions {
  const options: ExpoScaffoldOptions = {
    projectName: config.projectName,
    targetDir,
    packageManager: config.packageManager,
    universal: config.platform === "universal",
  };

  if (config.routing) {
    options.routing = config.routing as Extract<Routing, "expo-router" | "react-navigation">;
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
    options.e2eTesting = config.e2eTesting as Extract<E2ETestFramework, "maestro" | "detox">;
  }
  if (config.preCommit) options.preCommit = config.preCommit;

  return options;
}

function buildRNCliOptions(config: ProjectConfig, targetDir: string): RNCliScaffoldOptions {
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
    options.e2eTesting = config.e2eTesting as Extract<E2ETestFramework, "maestro" | "detox">;
  }
  if (config.preCommit) options.preCommit = config.preCommit;

  return options;
}

function buildReactRouterOptions(config: ProjectConfig, targetDir: string): ReactRouterScaffoldOptions {
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

function buildAstroOptions(config: ProjectConfig, targetDir: string): AstroScaffoldOptions {
  const options: AstroScaffoldOptions = {
    projectName: config.projectName,
    targetDir,
    packageManager: config.packageManager,
  };

  if (config.styling) {
    options.styling = config.styling as Extract<Styling, "tailwind" | "vanilla">;
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

function buildApiOptions(config: ProjectConfig, targetDir: string): ApiScaffoldOptions {
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
 * Get project name from argument or prompt
 */
async function getProjectName(projectName?: string): Promise<string | undefined> {
  if (projectName) {
    // Validate provided name
    if (!/^[a-z0-9-_]+$/i.test(projectName)) {
      p.log.error("Project name can only contain letters, numbers, hyphens, and underscores");
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
  const summaryLines: string[] = [
    `Project: ${config.projectName}`,
    `Platform: ${config.platform}`,
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
  if (config.deployment) {
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
