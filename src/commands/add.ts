/**
 * Add command - Add features to an existing project post-scaffold
 * Allows users to add auth, ORM, backend, styling, testing, and skills to projects
 */

import * as p from "@clack/prompts";
import path from "node:path";
import fs from "fs-extra";
import { execa } from "execa";
import type {
  Framework,
  Styling,
  StateManagement,
  ORM,
  Backend,
  AuthProvider,
  Linter,
  Formatter,
  UnitTestFramework,
  E2ETestFramework,
  PreCommitTool,
} from "../compatibility/matrix.js";
import { FRAMEWORKS, DEFAULTS } from "../compatibility/matrix.js";
import {
  detectProjectConfig,
  type DetectedConfig,
} from "./init.js";
import { installSkills, installSingleSkill, getSkillsToInstall } from "../ralph/skills.js";
import { writeClaudeMd } from "../ralph/claudemd.js";
import { writeClaudeSettings } from "../ralph/settings.js";
import { writeHooksConfig } from "../ralph/hooks.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Features that can be added to a project
 */
export type AddableFeature =
  | "auth"
  | "orm"
  | "backend"
  | "styling"
  | "state"
  | "testing"
  | "e2e"
  | "linter"
  | "formatter"
  | "hooks"
  | "skill"
  | "ralph";

/**
 * Options for the add command
 */
export interface AddOptions {
  feature: AddableFeature;
  /** Specific provider/tool for the feature (e.g., "better-auth" for auth) */
  provider?: string;
  /** Skip confirmation prompts */
  yes?: boolean;
  /** Force overwrite existing configurations */
  force?: boolean;
}

/**
 * Result of the add command
 */
export interface AddResult {
  success: boolean;
  feature: AddableFeature;
  provider?: string;
  filesCreated: string[];
  filesModified: string[];
  dependenciesInstalled: string[];
  warnings: string[];
  errors: string[];
  nextSteps: string[];
}

// ============================================================================
// Feature Configuration Maps
// ============================================================================

const AUTH_PROVIDERS: Record<
  AuthProvider,
  { name: string; description: string; packages: string[] }
> = {
  "better-auth": {
    name: "better-auth",
    description: "Self-hosted, type-safe auth (Recommended)",
    packages: ["better-auth"],
  },
  clerk: {
    name: "Clerk",
    description: "Managed auth with great DX",
    packages: ["@clerk/nextjs"], // Will be adjusted per framework
  },
  "supabase-auth": {
    name: "Supabase Auth",
    description: "Auth via Supabase (50k MAU free tier)",
    packages: ["@supabase/supabase-js", "@supabase/ssr"],
  },
};

const ORM_OPTIONS: Record<
  Exclude<ORM, "none">,
  { name: string; description: string; packages: string[]; devPackages: string[] }
> = {
  drizzle: {
    name: "Drizzle",
    description: "Type-safe, lightweight, edge-compatible",
    packages: ["drizzle-orm"],
    devPackages: ["drizzle-kit"],
  },
  prisma: {
    name: "Prisma",
    description: "Full-featured ORM with great DX",
    packages: ["@prisma/client"],
    devPackages: ["prisma"],
  },
};

const BACKEND_OPTIONS: Record<
  Backend,
  { name: string; description: string; packages: string[] }
> = {
  supabase: {
    name: "Supabase",
    description: "Open-source Firebase alternative",
    packages: ["@supabase/supabase-js"],
  },
  convex: {
    name: "Convex",
    description: "Reactive backend with real-time sync",
    packages: ["convex"],
  },
  firebase: {
    name: "Firebase",
    description: "Google's app platform",
    packages: ["firebase"],
  },
  custom: {
    name: "Custom Backend",
    description: "Roll your own backend",
    packages: [],
  },
};

const STATE_OPTIONS: Record<
  StateManagement,
  { name: string; description: string; packages: string[] }
> = {
  zustand: {
    name: "Zustand",
    description: "Simple, fast state management",
    packages: ["zustand"],
  },
  jotai: {
    name: "Jotai",
    description: "Atomic state management",
    packages: ["jotai"],
  },
  "tanstack-query": {
    name: "TanStack Query",
    description: "Async state management for data fetching",
    packages: ["@tanstack/react-query"],
  },
};

const LINTER_OPTIONS: Record<
  Linter,
  { name: string; description: string; packages: string[] }
> = {
  oxlint: {
    name: "oxlint",
    description: "50-100x faster than ESLint, Rust-based",
    packages: ["oxlint"],
  },
  biome: {
    name: "Biome",
    description: "All-in-one linter + formatter",
    packages: ["@biomejs/biome"],
  },
  eslint: {
    name: "ESLint",
    description: "Ecosystem standard",
    packages: ["eslint"],
  },
};

const FORMATTER_OPTIONS: Record<
  Formatter,
  { name: string; description: string; packages: string[] }
> = {
  oxfmt: {
    name: "oxfmt",
    description: "30x faster than Prettier",
    packages: ["oxfmt"],
  },
  prettier: {
    name: "Prettier",
    description: "De-facto standard formatter",
    packages: ["prettier"],
  },
  biome: {
    name: "Biome",
    description: "Included with Biome linter",
    packages: [],
  },
};

// ============================================================================
// Main Add Command Handler
// ============================================================================

/**
 * Main handler for the add command
 */
export async function handleAdd(args: string[]): Promise<AddResult | undefined> {
  p.intro("bootstralph add - Add features to your project");

  // Step 1: Parse arguments
  const feature = args[0] as AddableFeature | undefined;
  const providerArg = findArgValue(args, "--provider", "-p");
  const forceArg = args.includes("--force") || args.includes("-f");
  const yesArg = args.includes("--yes") || args.includes("-y");

  // Step 2: If no feature specified, show interactive menu
  if (!feature) {
    const selectedFeature = await promptFeatureSelection();
    if (!selectedFeature) {
      p.cancel("Operation cancelled");
      return undefined;
    }
    return await addFeature(selectedFeature, undefined, { force: forceArg, yes: yesArg });
  }

  // Step 3: Validate feature
  const validFeatures: AddableFeature[] = [
    "auth",
    "orm",
    "backend",
    "styling",
    "state",
    "testing",
    "e2e",
    "linter",
    "formatter",
    "hooks",
    "skill",
    "ralph",
  ];

  if (!validFeatures.includes(feature)) {
    p.log.error(`Invalid feature: ${feature}`);
    p.log.info(`Available features: ${validFeatures.join(", ")}`);
    return undefined;
  }

  // Step 4: Add the feature
  return await addFeature(feature, providerArg, { force: forceArg, yes: yesArg });
}

/**
 * Add a specific feature to the project
 */
async function addFeature(
  feature: AddableFeature,
  provider?: string,
  options: { force?: boolean; yes?: boolean } = {}
): Promise<AddResult | undefined> {
  const projectPath = process.cwd();

  // Step 1: Detect project configuration
  const spinner = p.spinner();
  spinner.start("Analyzing project...");

  const detected = await detectProjectConfig(projectPath);

  if (!detected) {
    spinner.stop("Project analysis failed");
    p.log.error("Could not detect project configuration");
    p.log.info("Make sure you're in a directory with a package.json file");
    return undefined;
  }

  spinner.stop("Project analyzed");

  // Step 2: Validate compatibility
  if (!detected.framework) {
    p.log.error("Could not detect framework");
    p.log.info("bootstralph add requires a supported framework");
    return undefined;
  }

  // Step 3: Route to feature-specific handler
  switch (feature) {
    case "auth":
      return await addAuth(projectPath, detected, provider as AuthProvider | undefined, options);
    case "orm":
      return await addORM(projectPath, detected, provider as ORM | undefined, options);
    case "backend":
      return await addBackend(projectPath, detected, provider as Backend | undefined, options);
    case "state":
      return await addState(projectPath, detected, provider as StateManagement | undefined, options);
    case "styling":
      return await addStyling(projectPath, detected, provider as Styling | undefined, options);
    case "testing":
      return await addTesting(projectPath, detected, provider as UnitTestFramework | undefined, options);
    case "e2e":
      return await addE2E(projectPath, detected, provider as E2ETestFramework | undefined, options);
    case "linter":
      return await addLinter(projectPath, detected, provider as Linter | undefined, options);
    case "formatter":
      return await addFormatter(projectPath, detected, provider as Formatter | undefined, options);
    case "hooks":
      return await addHooks(projectPath, detected, provider as PreCommitTool | undefined, options);
    case "skill":
      return await addSkill(projectPath, detected, provider, options);
    case "ralph":
      return await addRalph(projectPath, detected, options);
    default:
      p.log.error(`Feature '${feature}' is not yet implemented`);
      return undefined;
  }
}

// ============================================================================
// Feature-Specific Handlers
// ============================================================================

/**
 * Add authentication to the project
 */
async function addAuth(
  projectPath: string,
  detected: DetectedConfig,
  provider?: AuthProvider,
  options: { force?: boolean; yes?: boolean } = {}
): Promise<AddResult> {
  const result = createEmptyResult("auth");
  const framework = detected.framework!;

  // Check if auth already exists
  if (detected.auth && !options.force) {
    p.log.warn(`Auth already configured: ${detected.auth}`);
    const proceed = await p.confirm({
      message: "Do you want to add a different auth provider?",
      initialValue: false,
    });
    if (p.isCancel(proceed) || !proceed) {
      result.warnings.push("Auth setup skipped - already configured");
      return result;
    }
  }

  // Get compatible auth providers for this framework
  const frameworkConfig = FRAMEWORKS[framework];
  const availableProviders = frameworkConfig.auth;

  // Prompt for provider if not specified
  let selectedProvider = provider;
  if (!selectedProvider) {
    const choice = await p.select({
      message: "Which auth provider would you like to add?",
      options: availableProviders.map((p) => ({
        value: p,
        label: AUTH_PROVIDERS[p].name,
        hint: AUTH_PROVIDERS[p].description,
      })),
    });

    if (p.isCancel(choice)) {
      return result;
    }
    selectedProvider = choice as AuthProvider;
  }

  // Validate provider is compatible
  if (!availableProviders.includes(selectedProvider)) {
    result.errors.push(
      `${selectedProvider} is not compatible with ${framework}. Available: ${availableProviders.join(", ")}`
    );
    return result;
  }

  result.provider = selectedProvider;

  // Install packages
  const packages = getAuthPackages(selectedProvider, framework);
  const spinner = p.spinner();
  spinner.start(`Installing ${selectedProvider} packages...`);

  try {
    await installPackages(projectPath, packages, detected.packageManager);
    result.dependenciesInstalled.push(...packages);
    spinner.stop("Packages installed");
  } catch (error) {
    spinner.stop("Package installation failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to install packages: ${errorMessage}`);
    return result;
  }

  // Generate auth files
  spinner.start("Generating auth configuration...");
  try {
    const files = await generateAuthFiles(projectPath, selectedProvider, framework);
    result.filesCreated.push(...files);
    spinner.stop("Auth configuration generated");
  } catch (error) {
    spinner.stop("Auth configuration failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to generate auth config: ${errorMessage}`);
  }

  // Add next steps
  result.nextSteps.push(...getAuthNextSteps(selectedProvider, framework));

  result.success = result.errors.length === 0;
  displayResult(result);
  return result;
}

/**
 * Add ORM to the project
 */
async function addORM(
  projectPath: string,
  detected: DetectedConfig,
  orm?: ORM,
  options: { force?: boolean; yes?: boolean } = {}
): Promise<AddResult> {
  const result = createEmptyResult("orm");
  const framework = detected.framework!;

  // Check if ORM already exists
  if (detected.orm && !options.force) {
    p.log.warn(`ORM already configured: ${detected.orm}`);
    const proceed = await p.confirm({
      message: "Do you want to replace it?",
      initialValue: false,
    });
    if (p.isCancel(proceed) || !proceed) {
      result.warnings.push("ORM setup skipped - already configured");
      return result;
    }
  }

  // Get compatible ORMs for this framework
  const frameworkConfig = FRAMEWORKS[framework];
  const availableORMs = frameworkConfig.orm.filter((o) => o !== "none");

  if (availableORMs.length === 0) {
    result.errors.push(`${framework} does not support ORMs`);
    return result;
  }

  // Prompt for ORM if not specified
  let selectedORM = orm;
  if (!selectedORM || selectedORM === "none") {
    const choice = await p.select({
      message: "Which ORM would you like to add?",
      options: availableORMs.map((o) => ({
        value: o,
        label: ORM_OPTIONS[o as Exclude<ORM, "none">].name,
        hint: ORM_OPTIONS[o as Exclude<ORM, "none">].description,
      })),
    });

    if (p.isCancel(choice)) {
      return result;
    }
    selectedORM = choice as ORM;
  }

  if (selectedORM === "none") {
    result.warnings.push("No ORM selected");
    return result;
  }

  result.provider = selectedORM;

  const ormConfig = ORM_OPTIONS[selectedORM];
  const allPackages = [...ormConfig.packages, ...ormConfig.devPackages];

  const spinner = p.spinner();
  spinner.start(`Installing ${selectedORM} packages...`);

  try {
    if (ormConfig.packages.length > 0) {
      await installPackages(projectPath, ormConfig.packages, detected.packageManager);
    }
    if (ormConfig.devPackages.length > 0) {
      await installPackages(projectPath, ormConfig.devPackages, detected.packageManager, true);
    }
    result.dependenciesInstalled.push(...allPackages);
    spinner.stop("Packages installed");
  } catch (error) {
    spinner.stop("Package installation failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to install packages: ${errorMessage}`);
    return result;
  }

  // Generate ORM files
  spinner.start("Generating ORM configuration...");
  try {
    const files = await generateORMFiles(projectPath, selectedORM, framework);
    result.filesCreated.push(...files);
    spinner.stop("ORM configuration generated");
  } catch (error) {
    spinner.stop("ORM configuration failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to generate ORM config: ${errorMessage}`);
  }

  result.nextSteps.push(...getORMNextSteps(selectedORM));

  result.success = result.errors.length === 0;
  displayResult(result);
  return result;
}

/**
 * Add backend service to the project
 */
async function addBackend(
  projectPath: string,
  detected: DetectedConfig,
  backend?: Backend,
  options: { force?: boolean; yes?: boolean } = {}
): Promise<AddResult> {
  const result = createEmptyResult("backend");
  const framework = detected.framework!;

  // Check if backend already exists
  if (detected.backend && !options.force) {
    p.log.warn(`Backend already configured: ${detected.backend}`);
    const proceed = await p.confirm({
      message: "Do you want to add a different backend?",
      initialValue: false,
    });
    if (p.isCancel(proceed) || !proceed) {
      result.warnings.push("Backend setup skipped - already configured");
      return result;
    }
  }

  // Get compatible backends for this framework
  const frameworkConfig = FRAMEWORKS[framework];
  const availableBackends = frameworkConfig.backend;

  // Prompt for backend if not specified
  let selectedBackend = backend;
  if (!selectedBackend) {
    const choice = await p.select({
      message: "Which backend service would you like to add?",
      options: availableBackends.map((b) => ({
        value: b,
        label: BACKEND_OPTIONS[b].name,
        hint: BACKEND_OPTIONS[b].description,
      })),
    });

    if (p.isCancel(choice)) {
      return result;
    }
    selectedBackend = choice as Backend;
  }

  result.provider = selectedBackend;

  const backendConfig = BACKEND_OPTIONS[selectedBackend];

  if (backendConfig.packages.length > 0) {
    const spinner = p.spinner();
    spinner.start(`Installing ${selectedBackend} packages...`);

    try {
      await installPackages(projectPath, backendConfig.packages, detected.packageManager);
      result.dependenciesInstalled.push(...backendConfig.packages);
      spinner.stop("Packages installed");
    } catch (error) {
      spinner.stop("Package installation failed");
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to install packages: ${errorMessage}`);
      return result;
    }
  }

  // Generate backend files
  const spinner = p.spinner();
  spinner.start("Generating backend configuration...");
  try {
    const files = await generateBackendFiles(projectPath, selectedBackend, framework);
    result.filesCreated.push(...files);
    spinner.stop("Backend configuration generated");
  } catch (error) {
    spinner.stop("Backend configuration failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to generate backend config: ${errorMessage}`);
  }

  result.nextSteps.push(...getBackendNextSteps(selectedBackend));

  result.success = result.errors.length === 0;
  displayResult(result);
  return result;
}

/**
 * Add state management to the project
 */
async function addState(
  projectPath: string,
  detected: DetectedConfig,
  state?: StateManagement,
  _options: { force?: boolean; yes?: boolean } = {}
): Promise<AddResult> {
  const result = createEmptyResult("state");
  const framework = detected.framework!;

  // Get compatible state management options
  const frameworkConfig = FRAMEWORKS[framework];
  const availableState = frameworkConfig.state;

  if (availableState.length === 0) {
    result.errors.push(`${framework} does not have state management options in bootstralph`);
    return result;
  }

  // Prompt for state if not specified
  let selectedState = state;
  if (!selectedState) {
    const choice = await p.select({
      message: "Which state management library would you like to add?",
      options: availableState.map((s) => ({
        value: s,
        label: STATE_OPTIONS[s].name,
        hint: STATE_OPTIONS[s].description,
      })),
    });

    if (p.isCancel(choice)) {
      return result;
    }
    selectedState = choice as StateManagement;
  }

  result.provider = selectedState;

  const stateConfig = STATE_OPTIONS[selectedState];
  const spinner = p.spinner();
  spinner.start(`Installing ${selectedState} packages...`);

  try {
    await installPackages(projectPath, stateConfig.packages, detected.packageManager);
    result.dependenciesInstalled.push(...stateConfig.packages);
    spinner.stop("Packages installed");
  } catch (error) {
    spinner.stop("Package installation failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to install packages: ${errorMessage}`);
    return result;
  }

  // Generate state example file
  spinner.start("Generating state example...");
  try {
    const files = await generateStateFiles(projectPath, selectedState, framework);
    result.filesCreated.push(...files);
    spinner.stop("State example generated");
  } catch (error) {
    spinner.stop("State generation had issues");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.warnings.push(`State example generation: ${errorMessage}`);
  }

  result.nextSteps.push(`See ${selectedState} documentation for usage patterns`);

  result.success = result.errors.length === 0;
  displayResult(result);
  return result;
}

/**
 * Add styling to the project
 */
async function addStyling(
  projectPath: string,
  detected: DetectedConfig,
  styling?: Styling,
  _options: { force?: boolean; yes?: boolean } = {}
): Promise<AddResult> {
  const result = createEmptyResult("styling");
  const framework = detected.framework!;

  // Get compatible styling options
  const frameworkConfig = FRAMEWORKS[framework];
  const availableStyling = frameworkConfig.styling;

  // Prompt for styling if not specified
  let selectedStyling = styling;
  if (!selectedStyling) {
    const choice = await p.select({
      message: "Which styling solution would you like to add?",
      options: availableStyling.map((s) => ({
        value: s,
        label: s,
      })),
    });

    if (p.isCancel(choice)) {
      return result;
    }
    selectedStyling = choice as Styling;
  }

  result.provider = selectedStyling;

  const spinner = p.spinner();
  spinner.start(`Setting up ${selectedStyling}...`);

  try {
    const { packages, files } = await setupStyling(
      projectPath,
      selectedStyling,
      framework,
      detected.packageManager
    );
    result.dependenciesInstalled.push(...packages);
    result.filesCreated.push(...files);
    spinner.stop("Styling configured");
  } catch (error) {
    spinner.stop("Styling setup failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to set up styling: ${errorMessage}`);
  }

  result.success = result.errors.length === 0;
  displayResult(result);
  return result;
}

/**
 * Add unit testing to the project
 */
async function addTesting(
  projectPath: string,
  detected: DetectedConfig,
  testing?: UnitTestFramework,
  _options: { force?: boolean; yes?: boolean } = {}
): Promise<AddResult> {
  const result = createEmptyResult("testing");
  const framework = detected.framework!;

  // Get compatible testing frameworks
  const frameworkConfig = FRAMEWORKS[framework];
  const availableTesting = frameworkConfig.unitTesting;

  // Prompt for testing framework if not specified
  let selectedTesting = testing;
  if (!selectedTesting) {
    const choice = await p.select({
      message: "Which unit testing framework would you like to add?",
      options: availableTesting.map((t) => ({
        value: t,
        label: t === "vitest" ? "Vitest (Recommended for web)" : "Jest (Required for RN)",
      })),
    });

    if (p.isCancel(choice)) {
      return result;
    }
    selectedTesting = choice as UnitTestFramework;
  }

  result.provider = selectedTesting;

  const packages =
    selectedTesting === "vitest"
      ? ["vitest", "@testing-library/react"]
      : ["jest", "@types/jest", "jest-environment-jsdom", "@testing-library/react"];

  const spinner = p.spinner();
  spinner.start(`Installing ${selectedTesting} packages...`);

  try {
    await installPackages(projectPath, packages, detected.packageManager, true);
    result.dependenciesInstalled.push(...packages);
    spinner.stop("Packages installed");
  } catch (error) {
    spinner.stop("Package installation failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to install packages: ${errorMessage}`);
    return result;
  }

  // Generate testing config
  spinner.start("Generating test configuration...");
  try {
    const files = await generateTestingFiles(projectPath, selectedTesting, framework);
    result.filesCreated.push(...files);
    spinner.stop("Test configuration generated");
  } catch (error) {
    spinner.stop("Test config generation failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to generate test config: ${errorMessage}`);
  }

  result.nextSteps.push(`Run tests with: ${selectedTesting === "vitest" ? "vitest" : "jest"}`);

  result.success = result.errors.length === 0;
  displayResult(result);
  return result;
}

/**
 * Add E2E testing to the project
 */
async function addE2E(
  projectPath: string,
  detected: DetectedConfig,
  e2e?: E2ETestFramework,
  _options: { force?: boolean; yes?: boolean } = {}
): Promise<AddResult> {
  const result = createEmptyResult("e2e");
  const framework = detected.framework!;

  // Get compatible E2E testing frameworks
  const frameworkConfig = FRAMEWORKS[framework];
  const availableE2E = frameworkConfig.e2eTesting;

  if (availableE2E.length === 0) {
    result.errors.push(`${framework} does not have E2E testing options configured`);
    return result;
  }

  // Prompt for E2E framework if not specified
  let selectedE2E = e2e;
  if (!selectedE2E) {
    const choice = await p.select({
      message: "Which E2E testing framework would you like to add?",
      options: availableE2E.map((e) => ({
        value: e,
        label: e.charAt(0).toUpperCase() + e.slice(1),
      })),
    });

    if (p.isCancel(choice)) {
      return result;
    }
    selectedE2E = choice as E2ETestFramework;
  }

  result.provider = selectedE2E;

  const packages =
    selectedE2E === "playwright"
      ? ["@playwright/test"]
      : selectedE2E === "cypress"
        ? ["cypress"]
        : selectedE2E === "detox"
          ? ["detox"]
          : []; // Maestro is CLI-based

  const spinner = p.spinner();

  if (packages.length > 0) {
    spinner.start(`Installing ${selectedE2E} packages...`);
    try {
      await installPackages(projectPath, packages, detected.packageManager, true);
      result.dependenciesInstalled.push(...packages);
      spinner.stop("Packages installed");
    } catch (error) {
      spinner.stop("Package installation failed");
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to install packages: ${errorMessage}`);
      return result;
    }
  }

  // Generate E2E config
  spinner.start("Generating E2E configuration...");
  try {
    const files = await generateE2EFiles(projectPath, selectedE2E, framework);
    result.filesCreated.push(...files);
    spinner.stop("E2E configuration generated");
  } catch (error) {
    spinner.stop("E2E config generation failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to generate E2E config: ${errorMessage}`);
  }

  result.nextSteps.push(...getE2ENextSteps(selectedE2E));

  result.success = result.errors.length === 0;
  displayResult(result);
  return result;
}

/**
 * Add linter to the project
 */
async function addLinter(
  projectPath: string,
  detected: DetectedConfig,
  linter?: Linter,
  _options: { force?: boolean; yes?: boolean } = {}
): Promise<AddResult> {
  const result = createEmptyResult("linter");

  // Prompt for linter if not specified
  let selectedLinter = linter;
  if (!selectedLinter) {
    const choice = await p.select({
      message: "Which linter would you like to add?",
      options: [
        { value: "oxlint", label: "oxlint (Recommended)", hint: LINTER_OPTIONS.oxlint.description },
        { value: "biome", label: "Biome", hint: LINTER_OPTIONS.biome.description },
        { value: "eslint", label: "ESLint", hint: LINTER_OPTIONS.eslint.description },
      ],
    });

    if (p.isCancel(choice)) {
      return result;
    }
    selectedLinter = choice as Linter;
  }

  result.provider = selectedLinter;

  const linterConfig = LINTER_OPTIONS[selectedLinter];
  const spinner = p.spinner();
  spinner.start(`Installing ${selectedLinter}...`);

  try {
    await installPackages(projectPath, linterConfig.packages, detected.packageManager, true);
    result.dependenciesInstalled.push(...linterConfig.packages);
    spinner.stop("Linter installed");
  } catch (error) {
    spinner.stop("Linter installation failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to install linter: ${errorMessage}`);
    return result;
  }

  // Generate linter config
  spinner.start("Generating linter configuration...");
  try {
    const files = await generateLinterFiles(projectPath, selectedLinter);
    result.filesCreated.push(...files);
    spinner.stop("Linter configuration generated");
  } catch (error) {
    spinner.stop("Linter config generation failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.warnings.push(`Linter config: ${errorMessage}`);
  }

  if (selectedLinter === "biome") {
    result.nextSteps.push("Biome includes formatting - no separate formatter needed");
  }

  result.success = result.errors.length === 0;
  displayResult(result);
  return result;
}

/**
 * Add formatter to the project
 */
async function addFormatter(
  projectPath: string,
  detected: DetectedConfig,
  formatter?: Formatter,
  _options: { force?: boolean; yes?: boolean } = {}
): Promise<AddResult> {
  const result = createEmptyResult("formatter");

  // Check if Biome is the linter (includes formatting)
  if (detected.linter === "biome") {
    result.warnings.push("Biome is already configured and includes formatting");
    result.success = true;
    return result;
  }

  // Prompt for formatter if not specified
  let selectedFormatter = formatter;
  if (!selectedFormatter) {
    const choice = await p.select({
      message: "Which formatter would you like to add?",
      options: [
        { value: "oxfmt", label: "oxfmt (Recommended)", hint: FORMATTER_OPTIONS.oxfmt.description },
        { value: "prettier", label: "Prettier", hint: FORMATTER_OPTIONS.prettier.description },
      ],
    });

    if (p.isCancel(choice)) {
      return result;
    }
    selectedFormatter = choice as Formatter;
  }

  result.provider = selectedFormatter;

  const formatterConfig = FORMATTER_OPTIONS[selectedFormatter];

  if (formatterConfig.packages.length > 0) {
    const spinner = p.spinner();
    spinner.start(`Installing ${selectedFormatter}...`);

    try {
      await installPackages(projectPath, formatterConfig.packages, detected.packageManager, true);
      result.dependenciesInstalled.push(...formatterConfig.packages);
      spinner.stop("Formatter installed");
    } catch (error) {
      spinner.stop("Formatter installation failed");
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to install formatter: ${errorMessage}`);
      return result;
    }
  }

  // Generate formatter config
  const spinner = p.spinner();
  spinner.start("Generating formatter configuration...");
  try {
    const files = await generateFormatterFiles(projectPath, selectedFormatter);
    result.filesCreated.push(...files);
    spinner.stop("Formatter configuration generated");
  } catch (error) {
    spinner.stop("Formatter config generation failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.warnings.push(`Formatter config: ${errorMessage}`);
  }

  result.success = result.errors.length === 0;
  displayResult(result);
  return result;
}

/**
 * Add pre-commit hooks to the project
 */
async function addHooks(
  projectPath: string,
  detected: DetectedConfig,
  hooks?: PreCommitTool,
  options: { force?: boolean; yes?: boolean } = {}
): Promise<AddResult> {
  const result = createEmptyResult("hooks");

  // Check if hooks already exist
  if (detected.preCommit && !options.force) {
    p.log.warn(`Pre-commit hooks already configured: ${detected.preCommit}`);
    const proceed = await p.confirm({
      message: "Do you want to replace them?",
      initialValue: false,
    });
    if (p.isCancel(proceed) || !proceed) {
      result.warnings.push("Hooks setup skipped - already configured");
      return result;
    }
  }

  // Prompt for hooks tool if not specified
  let selectedHooks = hooks;
  if (!selectedHooks) {
    const choice = await p.select({
      message: "Which pre-commit hooks tool would you like to add?",
      options: [
        { value: "lefthook", label: "Lefthook (Recommended)", hint: "Fast, simple config" },
        { value: "husky", label: "Husky", hint: "Widely used, npm ecosystem" },
        { value: "prek", label: "prek", hint: "pre-commit compatible, 10x faster" },
      ],
    });

    if (p.isCancel(choice)) {
      return result;
    }
    selectedHooks = choice as PreCommitTool;
  }

  result.provider = selectedHooks;

  const framework = detected.framework ?? "nextjs";
  const spinner = p.spinner();
  spinner.start(`Setting up ${selectedHooks}...`);

  try {
    const hookResult = await writeHooksConfig({
      projectPath,
      config: {
        preCommitTool: selectedHooks,
        framework,
        linter: detected.linter ?? DEFAULTS.linter,
        formatter: detected.formatter ?? DEFAULTS.formatter,
        packageManager: detected.packageManager,
      },
      overwrite: options.force ?? false,
      installHooks: true,
    });

    result.filesCreated.push(...hookResult.filesWritten);
    if (hookResult.manualSteps) {
      result.nextSteps.push(...hookResult.manualSteps);
    }
    spinner.stop("Hooks configured");
  } catch (error) {
    spinner.stop("Hooks setup failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to set up hooks: ${errorMessage}`);
  }

  result.success = result.errors.length === 0;
  displayResult(result);
  return result;
}

/**
 * Add a skill to the project
 */
async function addSkill(
  projectPath: string,
  detected: DetectedConfig,
  skillName?: string,
  _options: { force?: boolean; yes?: boolean } = {}
): Promise<AddResult> {
  const result = createEmptyResult("skill");

  if (!skillName) {
    // Show available skills based on project config
    const skillsConfig: Parameters<typeof getSkillsToInstall>[0] = {
      framework: detected.framework ?? "nextjs",
    };
    if (detected.backend) skillsConfig.backend = detected.backend;
    if (detected.orm) skillsConfig.orm = detected.orm;
    if (detected.auth) skillsConfig.auth = detected.auth;
    if (detected.styling) skillsConfig.styling = detected.styling;

    const availableSkills = getSkillsToInstall(skillsConfig);

    const skillChoice = await p.select({
      message: "Which skill would you like to install?",
      options: [
        ...availableSkills.map((s) => ({
          value: s.name,
          label: s.name,
          hint: s.source,
        })),
        { value: "__custom__", label: "Enter custom skill name" },
      ],
    });

    if (p.isCancel(skillChoice)) {
      return result;
    }

    if (skillChoice === "__custom__") {
      const customSkill = await p.text({
        message: "Enter skill name:",
        placeholder: "skill-name",
      });

      if (p.isCancel(customSkill)) {
        return result;
      }

      skillName = customSkill;
    } else {
      skillName = skillChoice as string;
    }
  }

  result.provider = skillName;

  const spinner = p.spinner();
  spinner.start(`Installing skill: ${skillName}...`);

  try {
    const skillResult = await installSingleSkill(projectPath, skillName);
    if (skillResult.success) {
      result.filesCreated.push("AGENTS.md");
      spinner.stop(`Skill '${skillName}' installed`);
    } else {
      spinner.stop(`Skill installation had issues`);
      if (skillResult.error) {
        result.warnings.push(skillResult.error);
      }
    }
  } catch (error) {
    spinner.stop("Skill installation failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to install skill: ${errorMessage}`);
  }

  result.success = result.errors.length === 0;
  displayResult(result);
  return result;
}

/**
 * Add full Ralph setup to the project
 */
async function addRalph(
  projectPath: string,
  detected: DetectedConfig,
  options: { force?: boolean; yes?: boolean } = {}
): Promise<AddResult> {
  const result = createEmptyResult("ralph");

  const framework = detected.framework ?? "nextjs";

  // Generate CLAUDE.md
  const spinner = p.spinner();
  spinner.start("Generating CLAUDE.md...");

  try {
    // Build ClaudeMdConfig conditionally for exactOptionalPropertyTypes
    const claudeMdConfig: Parameters<typeof writeClaudeMd>[0]["config"] = {
      projectName: detected.projectName,
      platform: detected.platform,
      framework,
      packageManager: detected.packageManager,
      linter: detected.linter ?? DEFAULTS.linter,
      formatter: detected.formatter ?? DEFAULTS.formatter,
      unitTesting: detected.unitTesting ?? DEFAULTS.unitTesting[detected.platform],
      preCommit: detected.preCommit ?? DEFAULTS.preCommit,
    };
    if (detected.styling) claudeMdConfig.styling = detected.styling;
    if (detected.state && detected.state.length > 0) claudeMdConfig.state = detected.state;
    if (detected.orm) claudeMdConfig.orm = detected.orm;
    if (detected.backend) claudeMdConfig.backend = detected.backend;
    if (detected.auth) claudeMdConfig.auth = detected.auth;
    if (detected.e2eTesting) claudeMdConfig.e2eTesting = detected.e2eTesting;

    await writeClaudeMd({
      projectPath,
      config: claudeMdConfig,
      overwrite: options.force ?? false,
    });
    result.filesCreated.push("CLAUDE.md");
    spinner.stop("CLAUDE.md generated");
  } catch (error) {
    spinner.stop("CLAUDE.md generation failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to generate CLAUDE.md: ${errorMessage}`);
  }

  // Generate Claude settings
  spinner.start("Generating Claude settings...");
  try {
    // Build ClaudeSettingsConfig conditionally for exactOptionalPropertyTypes
    const claudeSettingsConfig: Parameters<typeof writeClaudeSettings>[0]["config"] = {
      projectName: detected.projectName,
      framework,
    };
    if (detected.orm) claudeSettingsConfig.orm = detected.orm;
    if (detected.backend) claudeSettingsConfig.backend = detected.backend;
    if (detected.auth) claudeSettingsConfig.auth = detected.auth;

    await writeClaudeSettings({
      projectPath,
      config: claudeSettingsConfig,
      overwrite: options.force ?? false,
      generateLocal: true,
    });
    result.filesCreated.push(".claude/settings.json");
    result.filesCreated.push(".claude/settings.local.json");
    spinner.stop("Claude settings generated");
  } catch (error) {
    spinner.stop("Claude settings generation failed");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to generate Claude settings: ${errorMessage}`);
  }

  // Install skills
  spinner.start("Installing skills...");
  try {
    // Build SkillsConfig conditionally for exactOptionalPropertyTypes
    const installSkillsConfig: Parameters<typeof installSkills>[0]["config"] = {
      framework: detected.framework ?? "nextjs",
    };
    if (detected.backend) installSkillsConfig.backend = detected.backend;
    if (detected.orm) installSkillsConfig.orm = detected.orm;
    if (detected.auth) installSkillsConfig.auth = detected.auth;
    if (detected.styling) installSkillsConfig.styling = detected.styling;

    const skillsResult = await installSkills({
      projectPath,
      config: installSkillsConfig,
    });

    if (skillsResult.installedSkills.length > 0) {
      result.filesCreated.push("AGENTS.md");
    }
    if (skillsResult.failedSkills.length > 0) {
      const failedNames = skillsResult.failedSkills.map((f) => f.name).join(", ");
      result.warnings.push(`Some skills failed to install: ${failedNames}`);
    }
    spinner.stop(`Installed ${skillsResult.installedSkills.length} skills`);
  } catch (error) {
    spinner.stop("Skills installation had issues");
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.warnings.push(`Skills: ${errorMessage}`);
  }

  result.nextSteps.push(
    "Review CLAUDE.md and customize for your project",
    "Run 'claude' to start working with Claude Code"
  );

  result.success = result.errors.length === 0;
  displayResult(result);
  return result;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find argument value by flag
 */
function findArgValue(args: string[], ...flags: string[]): string | undefined {
  for (const flag of flags) {
    const index = args.indexOf(flag);
    if (index !== -1 && args[index + 1]) {
      return args[index + 1];
    }
  }
  return undefined;
}

/**
 * Prompt user to select a feature to add
 */
async function promptFeatureSelection(): Promise<AddableFeature | undefined> {
  const choice = await p.select({
    message: "What would you like to add to your project?",
    options: [
      { value: "auth", label: "Authentication", hint: "Add better-auth, Clerk, or Supabase Auth" },
      { value: "orm", label: "ORM", hint: "Add Drizzle or Prisma" },
      { value: "backend", label: "Backend Service", hint: "Add Supabase, Convex, or Firebase" },
      { value: "state", label: "State Management", hint: "Add Zustand, Jotai, or TanStack Query" },
      { value: "styling", label: "Styling", hint: "Add Tailwind, shadcn/ui, or mobile styling" },
      { value: "testing", label: "Unit Testing", hint: "Add Vitest or Jest" },
      { value: "e2e", label: "E2E Testing", hint: "Add Playwright, Cypress, Maestro, or Detox" },
      { value: "linter", label: "Linter", hint: "Add oxlint, Biome, or ESLint" },
      { value: "formatter", label: "Formatter", hint: "Add oxfmt or Prettier" },
      { value: "hooks", label: "Pre-commit Hooks", hint: "Add Lefthook, Husky, or prek" },
      { value: "skill", label: "Skill", hint: "Install an openskills skill" },
      { value: "ralph", label: "Ralph Setup", hint: "Add CLAUDE.md, settings, and skills" },
    ],
  });

  if (p.isCancel(choice)) {
    return undefined;
  }

  return choice as AddableFeature;
}

/**
 * Create empty result object
 */
function createEmptyResult(feature: AddableFeature): AddResult {
  return {
    success: false,
    feature,
    filesCreated: [],
    filesModified: [],
    dependenciesInstalled: [],
    warnings: [],
    errors: [],
    nextSteps: [],
  };
}

/**
 * Install packages using the project's package manager
 */
async function installPackages(
  projectPath: string,
  packages: string[],
  packageManager: "bun" | "pnpm" | "npm" | "yarn",
  dev = false
): Promise<void> {
  if (packages.length === 0) return;

  const args: string[] = [];

  switch (packageManager) {
    case "bun":
      args.push("add");
      if (dev) args.push("-d");
      args.push(...packages);
      break;
    case "pnpm":
      args.push("add");
      if (dev) args.push("-D");
      args.push(...packages);
      break;
    case "yarn":
      args.push("add");
      if (dev) args.push("-D");
      args.push(...packages);
      break;
    case "npm":
      args.push("install");
      if (dev) args.push("--save-dev");
      args.push(...packages);
      break;
  }

  await execa(packageManager, args, { cwd: projectPath, stdio: "pipe" });
}

/**
 * Display result to user
 */
function displayResult(result: AddResult): void {
  if (result.errors.length > 0) {
    p.log.error("Errors:");
    for (const error of result.errors) {
      p.log.error(`  - ${error}`);
    }
  }

  if (result.warnings.length > 0) {
    p.log.warn("Warnings:");
    for (const warning of result.warnings) {
      p.log.warn(`  - ${warning}`);
    }
  }

  if (result.filesCreated.length > 0) {
    p.note(result.filesCreated.join("\n"), "Files Created");
  }

  if (result.dependenciesInstalled.length > 0) {
    p.note(result.dependenciesInstalled.join("\n"), "Dependencies Installed");
  }

  if (result.nextSteps.length > 0) {
    p.note(result.nextSteps.join("\n"), "Next Steps");
  }

  if (result.success) {
    p.outro(`${result.feature} added successfully!`);
  } else {
    p.outro(`${result.feature} setup completed with errors`);
  }
}

// ============================================================================
// Auth Helper Functions
// ============================================================================

function getAuthPackages(provider: AuthProvider, framework: Framework): string[] {
  const basePackages = AUTH_PROVIDERS[provider].packages;

  // Adjust packages based on framework
  if (provider === "clerk") {
    switch (framework) {
      case "nextjs":
        return ["@clerk/nextjs"];
      case "expo":
        return ["@clerk/clerk-expo"];
      case "react-native-cli":
        return ["@clerk/clerk-expo"];
      case "astro":
        return ["@clerk/astro"];
      case "react-router":
        return ["@clerk/react-router"];
      default:
        return basePackages;
    }
  }

  if (provider === "better-auth") {
    if (framework === "expo" || framework === "react-native-cli") {
      return ["better-auth", "@better-auth/expo"];
    }
  }

  return basePackages;
}

async function generateAuthFiles(
  projectPath: string,
  provider: AuthProvider,
  framework: Framework
): Promise<string[]> {
  const files: string[] = [];

  if (provider === "better-auth") {
    // Generate auth.ts config
    const authConfig = `import { betterAuth } from "better-auth";

export const auth = betterAuth({
  // Configure your database adapter
  // database: drizzleAdapter(db),

  // Configure email/password authentication
  emailAndPassword: {
    enabled: true,
  },

  // Configure social providers
  socialProviders: {
    // github: {
    //   clientId: process.env.GITHUB_CLIENT_ID!,
    //   clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    // },
  },
});
`;

    const authDir = framework === "nextjs" ? "src/lib" : framework === "astro" ? "src/lib" : "app/lib";
    await fs.ensureDir(path.join(projectPath, authDir));
    await fs.writeFile(path.join(projectPath, authDir, "auth.ts"), authConfig);
    files.push(`${authDir}/auth.ts`);
  }

  if (provider === "clerk") {
    // Generate middleware for Next.js
    if (framework === "nextjs") {
      const middleware = `import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
`;
      await fs.writeFile(path.join(projectPath, "src", "middleware.ts"), middleware);
      files.push("src/middleware.ts");
    }
  }

  // Add env template
  const envExample = provider === "clerk"
    ? `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=`
    : provider === "better-auth"
      ? `BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000`
      : `NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=`;

  const envPath = path.join(projectPath, ".env.example");
  if (await fs.pathExists(envPath)) {
    const existing = await fs.readFile(envPath, "utf-8");
    if (!existing.includes(provider.toUpperCase())) {
      await fs.appendFile(envPath, `\n# ${provider}\n${envExample}\n`);
    }
  } else {
    await fs.writeFile(envPath, `# ${provider}\n${envExample}\n`);
  }
  files.push(".env.example");

  return files;
}

function getAuthNextSteps(provider: AuthProvider, _framework: Framework): string[] {
  const steps: string[] = [];

  if (provider === "better-auth") {
    steps.push("Configure your database adapter in auth.ts");
    steps.push("Set BETTER_AUTH_SECRET and BETTER_AUTH_URL in .env");
    steps.push("See: https://www.better-auth.com/docs");
  } else if (provider === "clerk") {
    steps.push("Get your API keys from https://dashboard.clerk.com");
    steps.push("Set CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in .env");
  } else if (provider === "supabase-auth") {
    steps.push("Get your API keys from https://app.supabase.com");
    steps.push("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env");
  }

  return steps;
}

// ============================================================================
// ORM Helper Functions
// ============================================================================

async function generateORMFiles(
  projectPath: string,
  orm: ORM,
  framework: Framework
): Promise<string[]> {
  const files: string[] = [];

  if (orm === "drizzle") {
    // Generate drizzle.config.ts
    const drizzleConfig = `import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql", // or "sqlite" / "mysql"
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
`;
    await fs.writeFile(path.join(projectPath, "drizzle.config.ts"), drizzleConfig);
    files.push("drizzle.config.ts");

    // Generate schema file
    const schemaDir = framework === "nextjs" || framework === "tanstack-start" ? "src/db" : "app/db";
    await fs.ensureDir(path.join(projectPath, schemaDir));

    const schema = `import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});
`;
    await fs.writeFile(path.join(projectPath, schemaDir, "schema.ts"), schema);
    files.push(`${schemaDir}/schema.ts`);

    // Generate client file
    const client = `import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);

export const db = drizzle(client, { schema });
`;
    await fs.writeFile(path.join(projectPath, schemaDir, "index.ts"), client);
    files.push(`${schemaDir}/index.ts`);
  }

  if (orm === "prisma") {
    // Generate prisma schema
    await fs.ensureDir(path.join(projectPath, "prisma"));

    const prismaSchema = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  name      String
  email     String   @unique
  createdAt DateTime @default(now())
}
`;
    await fs.writeFile(path.join(projectPath, "prisma", "schema.prisma"), prismaSchema);
    files.push("prisma/schema.prisma");
  }

  return files;
}

function getORMNextSteps(orm: ORM): string[] {
  if (orm === "drizzle") {
    return [
      "Set DATABASE_URL in your .env file",
      "Run 'npx drizzle-kit generate' to generate migrations",
      "Run 'npx drizzle-kit migrate' to apply migrations",
    ];
  }
  if (orm === "prisma") {
    return [
      "Set DATABASE_URL in your .env file",
      "Run 'npx prisma generate' to generate the client",
      "Run 'npx prisma db push' to sync schema to database",
    ];
  }
  return [];
}

// ============================================================================
// Backend Helper Functions
// ============================================================================

async function generateBackendFiles(
  projectPath: string,
  backend: Backend,
  framework: Framework
): Promise<string[]> {
  const files: string[] = [];

  if (backend === "supabase") {
    const libDir = framework === "nextjs" ? "src/lib" : "app/lib";
    await fs.ensureDir(path.join(projectPath, libDir));

    const supabaseClient = `import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
`;
    await fs.writeFile(path.join(projectPath, libDir, "supabase.ts"), supabaseClient);
    files.push(`${libDir}/supabase.ts`);
  }

  if (backend === "convex") {
    // Convex requires running convex init
    const convexReadme = `# Convex Setup

Run the following to set up Convex:

\`\`\`bash
npx convex dev
\`\`\`

This will:
1. Create a Convex project (if needed)
2. Generate the convex/_generated directory
3. Start the Convex dev server

See: https://docs.convex.dev/quickstart
`;
    await fs.writeFile(path.join(projectPath, "CONVEX_SETUP.md"), convexReadme);
    files.push("CONVEX_SETUP.md");
  }

  return files;
}

function getBackendNextSteps(backend: Backend): string[] {
  if (backend === "supabase") {
    return [
      "Create a project at https://app.supabase.com",
      "Copy your project URL and anon key to .env",
    ];
  }
  if (backend === "convex") {
    return ["Run 'npx convex dev' to initialize Convex"];
  }
  if (backend === "firebase") {
    return [
      "Create a project at https://console.firebase.google.com",
      "Run 'npx firebase init' to configure",
    ];
  }
  return [];
}

// ============================================================================
// State Helper Functions
// ============================================================================

async function generateStateFiles(
  projectPath: string,
  state: StateManagement,
  framework: Framework
): Promise<string[]> {
  const files: string[] = [];
  const libDir = framework === "nextjs" ? "src/lib" : "app/lib";
  await fs.ensureDir(path.join(projectPath, libDir));

  if (state === "zustand") {
    const store = `import { create } from "zustand";

interface AppState {
  count: number;
  increment: () => void;
  decrement: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
}));
`;
    await fs.writeFile(path.join(projectPath, libDir, "store.ts"), store);
    files.push(`${libDir}/store.ts`);
  }

  if (state === "jotai") {
    const atoms = `import { atom } from "jotai";

export const countAtom = atom(0);
export const incrementedCountAtom = atom((get) => get(countAtom) + 1);
`;
    await fs.writeFile(path.join(projectPath, libDir, "atoms.ts"), atoms);
    files.push(`${libDir}/atoms.ts`);
  }

  return files;
}

// ============================================================================
// Styling Helper Functions
// ============================================================================

async function setupStyling(
  projectPath: string,
  styling: Styling,
  _framework: Framework,
  packageManager: "bun" | "pnpm" | "npm" | "yarn"
): Promise<{ packages: string[]; files: string[] }> {
  const packages: string[] = [];
  const files: string[] = [];

  if (styling === "tailwind" || styling === "tailwind-shadcn") {
    packages.push("tailwindcss", "@tailwindcss/postcss");
    await installPackages(projectPath, packages, packageManager, true);

    // Create tailwind.config.ts if it doesn't exist
    if (!(await fs.pathExists(path.join(projectPath, "tailwind.config.ts")))) {
      const tailwindConfig = `import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
`;
      await fs.writeFile(path.join(projectPath, "tailwind.config.ts"), tailwindConfig);
      files.push("tailwind.config.ts");
    }
  }

  return { packages, files };
}

// ============================================================================
// Testing Helper Functions
// ============================================================================

async function generateTestingFiles(
  projectPath: string,
  testing: UnitTestFramework,
  _framework: Framework
): Promise<string[]> {
  const files: string[] = [];

  if (testing === "vitest") {
    const vitestConfig = `import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
  },
});
`;
    await fs.writeFile(path.join(projectPath, "vitest.config.ts"), vitestConfig);
    files.push("vitest.config.ts");

    // Create test setup
    await fs.ensureDir(path.join(projectPath, "test"));
    const setupFile = `import "@testing-library/jest-dom/vitest";
`;
    await fs.writeFile(path.join(projectPath, "test", "setup.ts"), setupFile);
    files.push("test/setup.ts");
  }

  if (testing === "jest") {
    const jestConfig = `/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

module.exports = config;
`;
    await fs.writeFile(path.join(projectPath, "jest.config.js"), jestConfig);
    files.push("jest.config.js");
  }

  return files;
}

// ============================================================================
// E2E Helper Functions
// ============================================================================

async function generateE2EFiles(
  projectPath: string,
  e2e: E2ETestFramework,
  _framework: Framework
): Promise<string[]> {
  const files: string[] = [];

  if (e2e === "playwright") {
    const playwrightConfig = `import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
`;
    await fs.writeFile(path.join(projectPath, "playwright.config.ts"), playwrightConfig);
    files.push("playwright.config.ts");

    // Create e2e directory with example test
    await fs.ensureDir(path.join(projectPath, "e2e"));
    const exampleTest = `import { test, expect } from "@playwright/test";

test("has title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/./);
});
`;
    await fs.writeFile(path.join(projectPath, "e2e", "example.spec.ts"), exampleTest);
    files.push("e2e/example.spec.ts");
  }

  if (e2e === "maestro") {
    await fs.ensureDir(path.join(projectPath, ".maestro"));
    const maestroFlow = `appId: com.example.app
---
- launchApp
- assertVisible: "Welcome"
`;
    await fs.writeFile(path.join(projectPath, ".maestro", "login.yaml"), maestroFlow);
    files.push(".maestro/login.yaml");
  }

  return files;
}

function getE2ENextSteps(e2e: E2ETestFramework): string[] {
  if (e2e === "playwright") {
    return [
      "Run 'npx playwright install' to install browsers",
      "Run 'npx playwright test' to run tests",
    ];
  }
  if (e2e === "maestro") {
    return [
      "Install Maestro: curl -fsSL https://get.maestro.mobile.dev | bash",
      "Run 'maestro test .maestro/' to run flows",
    ];
  }
  if (e2e === "detox") {
    return ["Run 'npx detox build' to build the app", "Run 'npx detox test' to run tests"];
  }
  return [];
}

// ============================================================================
// Linter/Formatter Helper Functions
// ============================================================================

async function generateLinterFiles(projectPath: string, linter: Linter): Promise<string[]> {
  const files: string[] = [];

  if (linter === "oxlint") {
    const config = `{
  "rules": {}
}
`;
    await fs.writeFile(path.join(projectPath, ".oxlintrc.json"), config);
    files.push(".oxlintrc.json");
  }

  if (linter === "biome") {
    const config = `{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
`;
    await fs.writeFile(path.join(projectPath, "biome.json"), config);
    files.push("biome.json");
  }

  return files;
}

async function generateFormatterFiles(projectPath: string, formatter: Formatter): Promise<string[]> {
  const files: string[] = [];

  if (formatter === "prettier") {
    const config = `{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5"
}
`;
    await fs.writeFile(path.join(projectPath, ".prettierrc"), config);
    files.push(".prettierrc");
  }

  return files;
}

// ============================================================================
// Exports
// ============================================================================

export {
  addFeature,
  promptFeatureSelection,
  addAuth,
  addORM,
  addBackend,
  addState,
  addStyling,
  addTesting,
  addE2E,
  addLinter,
  addFormatter,
  addHooks,
  addSkill,
  addRalph,
};
