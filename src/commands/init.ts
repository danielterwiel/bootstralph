/**
 * Init command - Add Ralph to an existing project
 * Detects project configuration from existing files and sets up Ralph tooling
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
  Linter,
  Formatter,
  UnitTestFramework,
  E2ETestFramework,
  PreCommitTool,
} from "../compatibility/matrix.js";
import { DEFAULTS } from "../compatibility/matrix.js";
import {
  setupRalphInteractive,
  type RalphSetupConfig,
} from "../ralph/setup.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Detected project configuration from existing files
 */
export interface DetectedConfig {
  projectName: string;
  projectPath: string;
  platform: Platform;
  framework: Framework | null;
  styling?: Styling;
  state?: StateManagement[];
  orm?: ORM;
  backend?: Backend;
  auth?: AuthProvider;
  linter?: Linter;
  formatter?: Formatter;
  unitTesting?: UnitTestFramework;
  e2eTesting?: E2ETestFramework;
  preCommit?: PreCommitTool;
  packageManager: "bun" | "pnpm" | "npm" | "yarn";
  confidence: "high" | "medium" | "low";
}

/**
 * Result of the init command
 */
export interface InitResult {
  success: boolean;
  projectPath: string;
  filesWritten: string[];
  warnings: string[];
  errors: string[];
  nextSteps: string[];
}

// ============================================================================
// Package.json analysis
// ============================================================================

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

/**
 * Read and parse package.json from a directory
 */
async function readPackageJson(projectPath: string): Promise<PackageJson | null> {
  const packageJsonPath = path.join(projectPath, "package.json");

  if (!(await fs.pathExists(packageJsonPath))) {
    return null;
  }

  try {
    const content = await fs.readFile(packageJsonPath, "utf-8");
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

/**
 * Check if a dependency exists in package.json
 */
function hasDependency(pkg: PackageJson, name: string): boolean {
  return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

/**
 * Detect the package manager from lock files
 */
async function detectPackageManager(
  projectPath: string
): Promise<"bun" | "pnpm" | "npm" | "yarn"> {
  if (await fs.pathExists(path.join(projectPath, "bun.lockb"))) {
    return "bun";
  }
  if (await fs.pathExists(path.join(projectPath, "bun.lock"))) {
    return "bun";
  }
  if (await fs.pathExists(path.join(projectPath, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (await fs.pathExists(path.join(projectPath, "yarn.lock"))) {
    return "yarn";
  }
  return "npm";
}

// ============================================================================
// Framework Detection
// ============================================================================

/**
 * Detect the framework from package.json dependencies
 */
function detectFramework(pkg: PackageJson): { framework: Framework | null; confidence: "high" | "medium" | "low" } {
  // Next.js
  if (hasDependency(pkg, "next")) {
    return { framework: "nextjs", confidence: "high" };
  }

  // TanStack Start
  if (hasDependency(pkg, "@tanstack/react-start") || hasDependency(pkg, "@tanstack/start")) {
    return { framework: "tanstack-start", confidence: "high" };
  }

  // React Router v7 (framework mode)
  if (hasDependency(pkg, "react-router") || hasDependency(pkg, "@react-router/dev")) {
    // Check for framework mode indicators
    if (hasDependency(pkg, "@react-router/node") || hasDependency(pkg, "@react-router/cloudflare")) {
      return { framework: "react-router", confidence: "high" };
    }
    return { framework: "react-router", confidence: "medium" };
  }

  // Astro
  if (hasDependency(pkg, "astro")) {
    return { framework: "astro", confidence: "high" };
  }

  // Expo
  if (hasDependency(pkg, "expo")) {
    return { framework: "expo", confidence: "high" };
  }

  // React Native CLI (no Expo)
  if (hasDependency(pkg, "react-native") && !hasDependency(pkg, "expo")) {
    return { framework: "react-native-cli", confidence: "high" };
  }

  // Hono
  if (hasDependency(pkg, "hono")) {
    return { framework: "hono", confidence: "high" };
  }

  // Elysia
  if (hasDependency(pkg, "elysia")) {
    return { framework: "elysia", confidence: "high" };
  }

  return { framework: null, confidence: "low" };
}

/**
 * Detect the platform from the framework
 */
function detectPlatform(framework: Framework | null, pkg: PackageJson): Platform {
  if (framework === "expo") {
    // Check if it's a universal app (web + mobile)
    if (hasDependency(pkg, "tamagui") || hasDependency(pkg, "@tamagui/core")) {
      return "universal";
    }
    return "mobile";
  }

  if (framework === "react-native-cli") {
    return "mobile";
  }

  if (framework === "hono" || framework === "elysia") {
    return "api";
  }

  return "web";
}

// ============================================================================
// Tech Stack Detection
// ============================================================================

/**
 * Detect styling from dependencies
 */
function detectStyling(pkg: PackageJson, framework: Framework | null): Styling | undefined {
  // shadcn/ui (Tailwind-based)
  if (
    hasDependency(pkg, "@shadcn/ui") ||
    hasDependency(pkg, "class-variance-authority") ||
    hasDependency(pkg, "lucide-react")
  ) {
    if (hasDependency(pkg, "tailwindcss")) {
      return "tailwind-shadcn";
    }
  }

  // Tamagui (universal)
  if (hasDependency(pkg, "tamagui") || hasDependency(pkg, "@tamagui/core")) {
    return "tamagui";
  }

  // Uniwind
  if (hasDependency(pkg, "uniwind")) {
    return "uniwind";
  }

  // NativeWind
  if (hasDependency(pkg, "nativewind")) {
    return "nativewind";
  }

  // Unistyles
  if (hasDependency(pkg, "react-native-unistyles")) {
    return "unistyles";
  }

  // Tailwind (standalone)
  if (hasDependency(pkg, "tailwindcss")) {
    return "tailwind";
  }

  // Mobile frameworks default to stylesheets
  if (framework === "expo" || framework === "react-native-cli") {
    return "stylesheets";
  }

  return undefined;
}

/**
 * Detect state management from dependencies
 */
function detectState(pkg: PackageJson): StateManagement[] {
  const state: StateManagement[] = [];

  if (hasDependency(pkg, "zustand")) {
    state.push("zustand");
  }
  if (hasDependency(pkg, "jotai")) {
    state.push("jotai");
  }
  if (hasDependency(pkg, "@tanstack/react-query")) {
    state.push("tanstack-query");
  }

  return state;
}

/**
 * Detect ORM from dependencies
 */
function detectORM(pkg: PackageJson): ORM | undefined {
  if (hasDependency(pkg, "drizzle-orm")) {
    return "drizzle";
  }
  if (hasDependency(pkg, "@prisma/client") || hasDependency(pkg, "prisma")) {
    return "prisma";
  }
  return undefined;
}

/**
 * Detect backend from dependencies
 */
function detectBackend(pkg: PackageJson): Backend | undefined {
  if (hasDependency(pkg, "@supabase/supabase-js") || hasDependency(pkg, "@supabase/ssr")) {
    return "supabase";
  }
  if (hasDependency(pkg, "convex")) {
    return "convex";
  }
  if (hasDependency(pkg, "firebase") || hasDependency(pkg, "@react-native-firebase/app")) {
    return "firebase";
  }
  return undefined;
}

/**
 * Detect auth provider from dependencies
 */
function detectAuth(pkg: PackageJson): AuthProvider | undefined {
  if (hasDependency(pkg, "better-auth") || hasDependency(pkg, "@better-auth/expo")) {
    return "better-auth";
  }
  if (
    hasDependency(pkg, "@clerk/nextjs") ||
    hasDependency(pkg, "@clerk/clerk-expo") ||
    hasDependency(pkg, "@clerk/astro") ||
    hasDependency(pkg, "@clerk/react-router")
  ) {
    return "clerk";
  }
  // Supabase Auth is part of supabase-js, check for auth-specific usage
  if (hasDependency(pkg, "@supabase/auth-helpers-nextjs") || hasDependency(pkg, "@supabase/auth-ui-react")) {
    return "supabase-auth";
  }
  return undefined;
}

/**
 * Detect linter from dependencies and config files
 */
async function detectLinter(pkg: PackageJson, projectPath: string): Promise<Linter | undefined> {
  // Check for Biome
  if (hasDependency(pkg, "@biomejs/biome")) {
    return "biome";
  }
  if (await fs.pathExists(path.join(projectPath, "biome.json"))) {
    return "biome";
  }

  // Check for oxlint
  if (hasDependency(pkg, "oxlint")) {
    return "oxlint";
  }

  // Check for ESLint
  if (hasDependency(pkg, "eslint")) {
    return "eslint";
  }
  if (
    (await fs.pathExists(path.join(projectPath, ".eslintrc.js"))) ||
    (await fs.pathExists(path.join(projectPath, ".eslintrc.json"))) ||
    (await fs.pathExists(path.join(projectPath, "eslint.config.js"))) ||
    (await fs.pathExists(path.join(projectPath, "eslint.config.mjs")))
  ) {
    return "eslint";
  }

  return undefined;
}

/**
 * Detect formatter from dependencies and config files
 */
async function detectFormatter(
  pkg: PackageJson,
  projectPath: string,
  linter?: Linter
): Promise<Formatter | undefined> {
  // If Biome is the linter, it also handles formatting
  if (linter === "biome") {
    return "biome";
  }

  // Check for oxfmt
  if (hasDependency(pkg, "oxfmt")) {
    return "oxfmt";
  }

  // Check for Prettier
  if (hasDependency(pkg, "prettier")) {
    return "prettier";
  }
  if (
    (await fs.pathExists(path.join(projectPath, ".prettierrc"))) ||
    (await fs.pathExists(path.join(projectPath, ".prettierrc.js"))) ||
    (await fs.pathExists(path.join(projectPath, ".prettierrc.json"))) ||
    (await fs.pathExists(path.join(projectPath, "prettier.config.js")))
  ) {
    return "prettier";
  }

  return undefined;
}

/**
 * Detect unit testing framework from dependencies
 */
function detectUnitTesting(pkg: PackageJson): UnitTestFramework | undefined {
  if (hasDependency(pkg, "vitest")) {
    return "vitest";
  }
  if (hasDependency(pkg, "jest")) {
    return "jest";
  }
  return undefined;
}

/**
 * Detect E2E testing framework from dependencies
 */
function detectE2ETesting(pkg: PackageJson): E2ETestFramework | undefined {
  if (hasDependency(pkg, "@playwright/test") || hasDependency(pkg, "playwright")) {
    return "playwright";
  }
  if (hasDependency(pkg, "cypress")) {
    return "cypress";
  }
  if (hasDependency(pkg, "detox")) {
    return "detox";
  }
  // Maestro is CLI-only, check for config files
  return undefined;
}

/**
 * Detect pre-commit tool from dependencies and config files
 */
async function detectPreCommit(pkg: PackageJson, projectPath: string): Promise<PreCommitTool | undefined> {
  // Check for Lefthook
  if (hasDependency(pkg, "lefthook") || hasDependency(pkg, "@evilmartians/lefthook")) {
    return "lefthook";
  }
  if (await fs.pathExists(path.join(projectPath, "lefthook.yml"))) {
    return "lefthook";
  }

  // Check for Husky
  if (hasDependency(pkg, "husky")) {
    return "husky";
  }
  if (await fs.pathExists(path.join(projectPath, ".husky"))) {
    return "husky";
  }

  // Check for prek
  if (await fs.pathExists(path.join(projectPath, ".pre-commit-config.yaml"))) {
    return "prek";
  }

  return undefined;
}

/**
 * Check for Maestro config files
 */
async function detectMaestro(projectPath: string): Promise<boolean> {
  return (
    (await fs.pathExists(path.join(projectPath, ".maestro"))) ||
    (await fs.pathExists(path.join(projectPath, "maestro")))
  );
}

// ============================================================================
// Main Detection
// ============================================================================

/**
 * Detect project configuration from existing files
 */
async function detectProjectConfig(projectPath: string): Promise<DetectedConfig | null> {
  const pkg = await readPackageJson(projectPath);

  if (!pkg) {
    return null;
  }

  const projectName = pkg.name ?? path.basename(projectPath);
  const packageManager = await detectPackageManager(projectPath);
  const { framework, confidence } = detectFramework(pkg);
  const platform = detectPlatform(framework, pkg);
  const linter = await detectLinter(pkg, projectPath);
  const formatter = await detectFormatter(pkg, projectPath, linter);
  const preCommit = await detectPreCommit(pkg, projectPath);

  const config: DetectedConfig = {
    projectName,
    projectPath,
    platform,
    framework,
    packageManager,
    confidence,
  };

  // Add detected optional properties
  const styling = detectStyling(pkg, framework);
  if (styling) config.styling = styling;

  const state = detectState(pkg);
  if (state.length > 0) config.state = state;

  const orm = detectORM(pkg);
  if (orm) config.orm = orm;

  const backend = detectBackend(pkg);
  if (backend) config.backend = backend;

  const auth = detectAuth(pkg);
  if (auth) config.auth = auth;

  if (linter) config.linter = linter;
  if (formatter) config.formatter = formatter;

  const unitTesting = detectUnitTesting(pkg);
  if (unitTesting) config.unitTesting = unitTesting;

  let e2eTesting = detectE2ETesting(pkg);
  if (!e2eTesting && (await detectMaestro(projectPath))) {
    e2eTesting = "maestro";
  }
  if (e2eTesting) config.e2eTesting = e2eTesting;

  if (preCommit) config.preCommit = preCommit;

  return config;
}

// ============================================================================
// User Prompts
// ============================================================================

/**
 * Display detected configuration and get user confirmation
 */
async function confirmConfiguration(detected: DetectedConfig): Promise<RalphSetupConfig | undefined> {
  // Build summary of detected configuration
  const summaryLines: string[] = [];
  summaryLines.push(`Project: ${detected.projectName}`);
  summaryLines.push(`Platform: ${detected.platform}`);
  summaryLines.push(`Framework: ${detected.framework ?? "Unknown"}`);
  summaryLines.push(`Package Manager: ${detected.packageManager}`);

  if (detected.styling) summaryLines.push(`Styling: ${detected.styling}`);
  if (detected.state && detected.state.length > 0) summaryLines.push(`State: ${detected.state.join(", ")}`);
  if (detected.orm) summaryLines.push(`ORM: ${detected.orm}`);
  if (detected.backend) summaryLines.push(`Backend: ${detected.backend}`);
  if (detected.auth) summaryLines.push(`Auth: ${detected.auth}`);
  if (detected.linter) summaryLines.push(`Linter: ${detected.linter}`);
  if (detected.formatter) summaryLines.push(`Formatter: ${detected.formatter}`);
  if (detected.unitTesting) summaryLines.push(`Unit Testing: ${detected.unitTesting}`);
  if (detected.e2eTesting) summaryLines.push(`E2E Testing: ${detected.e2eTesting}`);
  if (detected.preCommit) summaryLines.push(`Pre-commit: ${detected.preCommit}`);

  p.note(summaryLines.join("\n"), "Detected Configuration");

  if (detected.confidence === "low") {
    p.log.warn("Low confidence in detection. Please verify the configuration.");
  }

  // If no framework was detected, we need to ask
  let framework = detected.framework;
  if (!framework) {
    const frameworkChoice = await p.select({
      message: "Which framework is this project using?",
      options: [
        { value: "nextjs", label: "Next.js" },
        { value: "tanstack-start", label: "TanStack Start" },
        { value: "react-router", label: "React Router v7" },
        { value: "astro", label: "Astro" },
        { value: "expo", label: "Expo" },
        { value: "react-native-cli", label: "React Native CLI" },
        { value: "hono", label: "Hono" },
        { value: "elysia", label: "Elysia" },
      ],
    });

    if (p.isCancel(frameworkChoice)) {
      return undefined;
    }

    framework = frameworkChoice as Framework;
  }

  // Ask to confirm or modify
  const confirmChoice = await p.select({
    message: "How would you like to proceed?",
    options: [
      { value: "confirm", label: "Use detected configuration" },
      { value: "modify", label: "Modify some settings" },
      { value: "cancel", label: "Cancel" },
    ],
  });

  if (p.isCancel(confirmChoice) || confirmChoice === "cancel") {
    return undefined;
  }

  let linter = detected.linter ?? DEFAULTS.linter;
  let formatter = detected.formatter ?? DEFAULTS.formatter;
  let preCommit = detected.preCommit ?? DEFAULTS.preCommit;
  let unitTesting = detected.unitTesting ?? DEFAULTS.unitTesting[detected.platform];

  if (confirmChoice === "modify") {
    // Allow user to modify key settings
    const linterChoice = await p.select({
      message: "Linter",
      initialValue: linter,
      options: [
        { value: "oxlint", label: "oxlint (Recommended - fast, Rust-based)" },
        { value: "biome", label: "Biome (lint + format)" },
        { value: "eslint", label: "ESLint (ecosystem standard)" },
      ],
    });

    if (p.isCancel(linterChoice)) {
      return undefined;
    }
    linter = linterChoice as Linter;

    // Skip formatter if Biome (handles both)
    if (linter !== "biome") {
      const formatterChoice = await p.select({
        message: "Formatter",
        initialValue: formatter,
        options: [
          { value: "oxfmt", label: "oxfmt (Recommended - fast, Prettier-compatible)" },
          { value: "prettier", label: "Prettier (ecosystem standard)" },
        ],
      });

      if (p.isCancel(formatterChoice)) {
        return undefined;
      }
      formatter = formatterChoice as Formatter;
    } else {
      formatter = "biome";
    }

    const preCommitChoice = await p.select({
      message: "Pre-commit hooks",
      initialValue: preCommit,
      options: [
        { value: "lefthook", label: "Lefthook (Recommended - fast, simple config)" },
        { value: "husky", label: "Husky (widely used, npm ecosystem)" },
        { value: "prek", label: "prek (pre-commit compatible, Python-friendly)" },
      ],
    });

    if (p.isCancel(preCommitChoice)) {
      return undefined;
    }
    preCommit = preCommitChoice as PreCommitTool;
  }

  // Build final config
  const config: RalphSetupConfig = {
    projectName: detected.projectName,
    projectPath: detected.projectPath,
    platform: detected.platform,
    framework,
    linter,
    formatter,
    unitTesting,
    preCommit,
    packageManager: detected.packageManager,
  };

  // Add optional properties
  if (detected.styling) config.styling = detected.styling;
  if (detected.state && detected.state.length > 0) config.state = detected.state;
  if (detected.orm) config.orm = detected.orm;
  if (detected.backend) config.backend = detected.backend;
  if (detected.auth) config.auth = detected.auth;
  if (detected.e2eTesting) config.e2eTesting = detected.e2eTesting;

  return config;
}

// ============================================================================
// Setup Options
// ============================================================================

/**
 * Prompt user for setup options
 */
async function promptSetupOptions(): Promise<{
  skipSkills: boolean;
  skipDocker: boolean;
  skipHooks: boolean;
  overwrite: boolean;
} | undefined> {
  const setupChoice = await p.multiselect({
    message: "What should Ralph set up? (Space to toggle, Enter to confirm)",
    options: [
      { value: "claudemd", label: "CLAUDE.md - Project context for Claude Code" },
      { value: "skills", label: "Skills - Install relevant openskills" },
      { value: "hooks", label: "Git hooks - Pre-commit hooks configuration" },
      { value: "settings", label: "Claude settings - .claude/settings.json" },
      { value: "docker", label: "Docker - Sandbox configuration" },
    ],
    initialValues: ["claudemd", "skills", "hooks", "settings"],
    required: true,
  });

  if (p.isCancel(setupChoice)) {
    return undefined;
  }

  const selectedOptions = setupChoice as string[];

  return {
    skipSkills: !selectedOptions.includes("skills"),
    skipDocker: !selectedOptions.includes("docker"),
    skipHooks: !selectedOptions.includes("hooks"),
    overwrite: false,
  };
}

// ============================================================================
// Main Command Handler
// ============================================================================

/**
 * Handle the 'init' command - Initialize Ralph in existing project
 */
export async function handleInit(): Promise<InitResult | undefined> {
  p.intro("bootstralph init - Add Ralph to existing project");

  // Step 1: Determine project path (current directory)
  const projectPath = process.cwd();

  // Step 2: Check if it's a valid project
  const packageJsonExists = await fs.pathExists(path.join(projectPath, "package.json"));

  if (!packageJsonExists) {
    p.log.error("No package.json found in current directory");
    p.log.info("Please run this command from a Node.js project root");
    p.log.info("Or use 'bootstralph create' to create a new project");
    return undefined;
  }

  // Step 3: Check if Ralph is already initialized
  const claudeMdExists = await fs.pathExists(path.join(projectPath, "CLAUDE.md"));
  const claudeSettingsExists = await fs.pathExists(path.join(projectPath, ".claude", "settings.json"));

  if (claudeMdExists || claudeSettingsExists) {
    const existingFiles: string[] = [];
    if (claudeMdExists) existingFiles.push("CLAUDE.md");
    if (claudeSettingsExists) existingFiles.push(".claude/settings.json");

    p.log.warn(`Ralph appears to be already initialized (found: ${existingFiles.join(", ")})`);

    const overwriteChoice = await p.confirm({
      message: "Do you want to reinitialize? This will overwrite existing files.",
      initialValue: false,
    });

    if (p.isCancel(overwriteChoice) || !overwriteChoice) {
      p.cancel("Operation cancelled");
      return undefined;
    }
  }

  // Step 4: Detect project configuration
  const spinner = p.spinner();
  spinner.start("Analyzing project...");

  const detected = await detectProjectConfig(projectPath);

  spinner.stop("Project analyzed");

  if (!detected) {
    p.log.error("Failed to analyze project");
    return undefined;
  }

  // Step 5: Confirm/modify configuration
  const config = await confirmConfiguration(detected);

  if (!config) {
    p.cancel("Operation cancelled");
    return undefined;
  }

  // Step 6: Get setup options
  const setupOptions = await promptSetupOptions();

  if (!setupOptions) {
    p.cancel("Operation cancelled");
    return undefined;
  }

  // Step 7: Run Ralph setup
  p.log.step("Setting up Ralph...");

  const result = await setupRalphInteractive({
    config,
    skipSkills: setupOptions.skipSkills,
    skipDocker: setupOptions.skipDocker,
    skipHooks: setupOptions.skipHooks,
    skipSettings: false,
    skipClaudeMd: false,
    overwrite: setupOptions.overwrite || claudeMdExists || claudeSettingsExists,
    installHooks: false,
  });

  // Step 8: Display results
  if (result.warnings.length > 0) {
    p.log.warn("Warnings:");
    for (const warning of result.warnings) {
      p.log.warn(`  - ${warning}`);
    }
  }

  if (result.errors.length > 0) {
    p.log.error("Errors:");
    for (const error of result.errors) {
      p.log.error(`  - ${error}`);
    }
  }

  if (result.filesWritten.length > 0) {
    p.note(result.filesWritten.join("\n"), "Files Created");
  }

  if (result.nextSteps.length > 0) {
    p.note(result.nextSteps.join("\n"), "Next Steps");
  }

  if (result.success) {
    p.outro("Ralph initialization complete!");
  } else {
    p.outro("Ralph initialization completed with errors");
  }

  return {
    success: result.success,
    projectPath,
    filesWritten: result.filesWritten,
    warnings: result.warnings,
    errors: result.errors,
    nextSteps: result.nextSteps,
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
  detectProjectConfig,
  confirmConfiguration,
  promptSetupOptions,
  readPackageJson,
  detectFramework,
  detectPlatform,
};
