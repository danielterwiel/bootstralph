/**
 * Init command - Initialize bootsralph in an existing project
 *
 * v2 Flow:
 * 1. Detect stack from package.json and config files
 * 2. Generate lefthook.yml, .ralph-tui/skills/, .bootsralph/config.json
 * 3. Add postinstall/prepare scripts to package.json
 * 4. Run lefthook install
 * 5. Sync skills based on detected stack
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
import { generateLefthook } from "../generators/lefthook.js";
import { generateRalphSkill } from "../generators/ralph-skill.js";
import { generateBootsralphConfig } from "../generators/bootsralph-config.js";
import { addPackageScripts } from "../generators/package-scripts.js";
import { sync } from "./sync.js";
import { runWizard } from "../prompts/index.js";
import type { StackConfig } from "../types.js";
import { execa } from "execa";
import { resolveWorkspaces } from "../detection/package-scanner.js";
import {
  detectPackageManager as detectPackageManagerUtil,
  getPackageManagerRunner,
  type PackageManager,
} from "../utils/package-manager.js";

// ============================================================================
// Types
// ============================================================================

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
  workspaces?: string[] | { packages: string[] };
  packageManager?: string;
}

/**
 * Read and aggregate package.json from root and all workspaces
 *
 * Dependencies from workspaces are merged into the root package.json,
 * allowing detection to find packages used anywhere in the monorepo.
 */
async function readAggregatedPackageJson(projectPath: string): Promise<PackageJson | null> {
  const rootPkg = await readPackageJson(projectPath);
  if (!rootPkg) return null;

  // Resolve workspaces and aggregate their dependencies
  const workspaceDirs = await resolveWorkspaces(projectPath);

  if (workspaceDirs.length === 0) {
    return rootPkg;
  }

  // Create aggregated package with merged dependencies
  const aggregated: PackageJson = {
    dependencies: { ...rootPkg.dependencies },
    devDependencies: { ...rootPkg.devDependencies },
  };
  if (rootPkg.name) aggregated.name = rootPkg.name;
  if (rootPkg.scripts) aggregated.scripts = rootPkg.scripts;

  for (const workspaceDir of workspaceDirs) {
    const workspacePkg = await readPackageJson(workspaceDir);
    if (workspacePkg) {
      // Merge workspace dependencies
      if (workspacePkg.dependencies) {
        aggregated.dependencies = {
          ...aggregated.dependencies,
          ...workspacePkg.dependencies,
        };
      }
      if (workspacePkg.devDependencies) {
        aggregated.devDependencies = {
          ...aggregated.devDependencies,
          ...workspacePkg.devDependencies,
        };
      }
    }
  }

  return aggregated;
}

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

function hasDependency(pkg: PackageJson, name: string): boolean {
  return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

// Use the shared detectPackageManager utility
async function detectPackageManager(
  projectPath: string
): Promise<PackageManager> {
  return detectPackageManagerUtil(projectPath);
}

// ============================================================================
// Framework Detection
// ============================================================================

function detectFramework(pkg: PackageJson): { framework: Framework | null; confidence: "high" | "medium" | "low" } {
  if (hasDependency(pkg, "next")) return { framework: "nextjs", confidence: "high" };
  if (hasDependency(pkg, "@tanstack/react-start") || hasDependency(pkg, "@tanstack/start")) {
    return { framework: "tanstack-start", confidence: "high" };
  }
  if (hasDependency(pkg, "react-router") || hasDependency(pkg, "@react-router/dev")) {
    return { framework: "react-router", confidence: "medium" };
  }
  if (hasDependency(pkg, "astro")) return { framework: "astro", confidence: "high" };
  if (hasDependency(pkg, "expo")) return { framework: "expo", confidence: "high" };
  if (hasDependency(pkg, "react-native") && !hasDependency(pkg, "expo")) {
    return { framework: "react-native-cli", confidence: "high" };
  }
  if (hasDependency(pkg, "hono")) return { framework: "hono", confidence: "high" };
  if (hasDependency(pkg, "elysia")) return { framework: "elysia", confidence: "high" };

  return { framework: null, confidence: "low" };
}

function detectPlatform(framework: Framework | null, pkg: PackageJson): Platform {
  if (framework === "expo") {
    if (hasDependency(pkg, "tamagui") || hasDependency(pkg, "@tamagui/core")) return "universal";
    return "mobile";
  }
  if (framework === "react-native-cli") return "mobile";
  if (framework === "hono" || framework === "elysia") return "api";
  return "web";
}

// ============================================================================
// Tech Stack Detection
// ============================================================================

function detectStyling(pkg: PackageJson, framework: Framework | null): Styling | undefined {
  if (hasDependency(pkg, "class-variance-authority") && hasDependency(pkg, "tailwindcss")) {
    return "tailwind-shadcn";
  }
  if (hasDependency(pkg, "tamagui") || hasDependency(pkg, "@tamagui/core")) return "tamagui";
  if (hasDependency(pkg, "uniwind")) return "uniwind";
  if (hasDependency(pkg, "nativewind")) return "nativewind";
  if (hasDependency(pkg, "react-native-unistyles")) return "unistyles";
  if (hasDependency(pkg, "tailwindcss")) return "tailwind";
  if (framework === "expo" || framework === "react-native-cli") return "stylesheets";
  return undefined;
}

function detectState(pkg: PackageJson): StateManagement[] {
  const state: StateManagement[] = [];
  if (hasDependency(pkg, "zustand")) state.push("zustand");
  if (hasDependency(pkg, "jotai")) state.push("jotai");
  if (hasDependency(pkg, "@tanstack/react-query")) state.push("tanstack-query");
  return state;
}

function detectORM(pkg: PackageJson): ORM | undefined {
  if (hasDependency(pkg, "drizzle-orm")) return "drizzle";
  if (hasDependency(pkg, "@prisma/client") || hasDependency(pkg, "prisma")) return "prisma";
  return undefined;
}

function detectBackend(pkg: PackageJson): Backend | undefined {
  if (hasDependency(pkg, "@supabase/supabase-js") || hasDependency(pkg, "@supabase/ssr")) return "supabase";
  if (hasDependency(pkg, "convex")) return "convex";
  if (hasDependency(pkg, "firebase") || hasDependency(pkg, "@react-native-firebase/app")) return "firebase";
  return undefined;
}

function detectAuth(pkg: PackageJson): AuthProvider | undefined {
  if (hasDependency(pkg, "better-auth") || hasDependency(pkg, "@better-auth/expo")) return "better-auth";
  if (hasDependency(pkg, "@clerk/nextjs") || hasDependency(pkg, "@clerk/clerk-expo")) return "clerk";
  if (hasDependency(pkg, "@supabase/auth-helpers-nextjs")) return "supabase-auth";
  return undefined;
}

async function detectLinter(pkg: PackageJson, projectPath: string): Promise<Linter | undefined> {
  if (hasDependency(pkg, "@biomejs/biome")) return "biome";
  if (await fs.pathExists(path.join(projectPath, "biome.json"))) return "biome";
  if (hasDependency(pkg, "oxlint")) return "oxlint";
  if (hasDependency(pkg, "eslint")) return "eslint";
  return undefined;
}

async function detectFormatter(pkg: PackageJson, projectPath: string, linter?: Linter): Promise<Formatter | undefined> {
  if (linter === "biome") return "biome";
  if (hasDependency(pkg, "oxfmt")) return "oxfmt";
  if (hasDependency(pkg, "prettier")) return "prettier";
  if (await fs.pathExists(path.join(projectPath, ".prettierrc"))) return "prettier";
  return undefined;
}

function detectUnitTesting(pkg: PackageJson): UnitTestFramework | undefined {
  if (hasDependency(pkg, "vitest")) return "vitest";
  if (hasDependency(pkg, "jest")) return "jest";
  return undefined;
}

function detectE2ETesting(pkg: PackageJson): E2ETestFramework | undefined {
  if (hasDependency(pkg, "@playwright/test") || hasDependency(pkg, "playwright")) return "playwright";
  if (hasDependency(pkg, "cypress")) return "cypress";
  if (hasDependency(pkg, "detox")) return "detox";
  return undefined;
}

async function detectPreCommit(pkg: PackageJson, projectPath: string): Promise<PreCommitTool | undefined> {
  if (hasDependency(pkg, "lefthook")) return "lefthook";
  if (await fs.pathExists(path.join(projectPath, "lefthook.yml"))) return "lefthook";
  if (hasDependency(pkg, "husky")) return "husky";
  if (await fs.pathExists(path.join(projectPath, ".husky"))) return "husky";
  return undefined;
}

// ============================================================================
// Main Detection
// ============================================================================

async function detectProjectConfig(projectPath: string): Promise<DetectedConfig | null> {
  // Use aggregated package.json to detect dependencies from all workspaces
  const pkg = await readAggregatedPackageJson(projectPath);
  if (!pkg) return null;

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

  const e2eTesting = detectE2ETesting(pkg);
  if (e2eTesting) config.e2eTesting = e2eTesting;

  if (preCommit) config.preCommit = preCommit;

  return config;
}

// ============================================================================
// Configuration Conversion
// ============================================================================

/**
 * Convert DetectedConfig to StackConfig for generators
 */
function detectedConfigToStackConfig(detected: DetectedConfig): StackConfig {
  const stackConfig: StackConfig = {
    packageManager: detected.packageManager,
  };

  // Map framework
  if (detected.framework) {
    stackConfig.framework = detected.framework;
  }

  // Map auth
  if (detected.auth) {
    stackConfig.auth = detected.auth;
  }

  // Map database - use backend or orm
  if (detected.backend) {
    stackConfig.database = detected.backend;
  } else if (detected.orm) {
    stackConfig.database = detected.orm;
  }

  // Map styling
  if (detected.styling) {
    stackConfig.styling = detected.styling;
  }

  // Map testing
  if (detected.unitTesting) {
    stackConfig.testing = detected.unitTesting;
  } else if (detected.e2eTesting) {
    stackConfig.testing = detected.e2eTesting;
  }

  // Map deployment (not detected in init, so not included)

  // Map tooling based on detection
  stackConfig.tooling = {
    linting: !!detected.linter,
    formatting: !!detected.formatter,
    hasTypeScript: true, // Assume TypeScript for existing projects
    hasTests: !!detected.unitTesting,
  };

  return stackConfig;
}

// ============================================================================
// Display
// ============================================================================

function displayDetectedConfig(detected: DetectedConfig): void {
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
    p.log.warn("Low confidence in detection. Some settings may need manual configuration.");
  }
}

// ============================================================================
// Main Command Handler
// ============================================================================

export async function handleInit(): Promise<InitResult | undefined> {
  p.intro("bootsralph init - Initialize in existing project");

  const projectPath = process.cwd();

  // Check for package.json
  const packageJsonExists = await fs.pathExists(path.join(projectPath, "package.json"));
  if (!packageJsonExists) {
    p.log.error("No package.json found in current directory");
    p.log.info("Please run this command from a Node.js project root");
    p.log.info("Or use 'bootsralph create' to create a new project");
    return undefined;
  }

  // Detect project configuration
  const spinner = p.spinner();
  spinner.start("Analyzing project...");

  const detected = await detectProjectConfig(projectPath);

  spinner.stop("Project analyzed");

  if (!detected) {
    p.log.error("Failed to analyze project");
    return undefined;
  }

  // Display detected configuration
  displayDetectedConfig(detected);

  // Handle low confidence - offer to run wizard
  let finalConfig: DetectedConfig = detected;

  if (detected.confidence === "low") {
    const useDetected = await p.confirm({
      message: "Low confidence in detection. Use detected configuration anyway?",
      initialValue: false,
    });

    if (p.isCancel(useDetected)) {
      p.cancel("Operation cancelled");
      return undefined;
    }

    if (!useDetected) {
      p.log.info("Running configuration wizard...");

      const wizardResult = await runWizard({
        packageManager: detected.packageManager,
      });
      if (!wizardResult) {
        p.cancel("Operation cancelled");
        return undefined;
      }

      // Convert wizard result to DetectedConfig format
      // Build object with required fields first, then add optional fields conditionally
      const newConfig: DetectedConfig = {
        projectName: detected.projectName,
        projectPath,
        platform: wizardResult.platform,
        framework: wizardResult.framework,
        linter: wizardResult.linter,
        formatter: wizardResult.formatter,
        unitTesting: wizardResult.unitTesting,
        preCommit: wizardResult.preCommit,
        packageManager: detected.packageManager,
        confidence: "high",
      };

      // Add optional fields only when they have values
      if (wizardResult.styling) newConfig.styling = wizardResult.styling;
      if (wizardResult.state) newConfig.state = wizardResult.state;
      if (wizardResult.orm) newConfig.orm = wizardResult.orm;
      if (wizardResult.backend) newConfig.backend = wizardResult.backend;
      if (wizardResult.auth) newConfig.auth = wizardResult.auth;
      if (wizardResult.e2eTesting) newConfig.e2eTesting = wizardResult.e2eTesting;

      finalConfig = newConfig;
    }
  } else {
    // Confirm with high/medium confidence
    const proceed = await p.confirm({
      message: "Initialize bootsralph with detected configuration?",
      initialValue: true,
    });

    if (p.isCancel(proceed) || !proceed) {
      p.cancel("Operation cancelled");
      return undefined;
    }
  }

  const filesWritten: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    // Convert to StackConfig for generators
    const stackConfig = detectedConfigToStackConfig(finalConfig);

    // Step 1: Generate lefthook configuration
    p.log.step("Generating lefthook configuration...");
    const lefthookPath = await generateLefthook(stackConfig, projectPath);
    filesWritten.push(lefthookPath);

    // Step 2: Generate Ralph skill
    p.log.step("Generating Ralph skill...");
    const ralphSkillPath = await generateRalphSkill(stackConfig, projectPath);
    filesWritten.push(ralphSkillPath);

    // Step 3: Generate bootsralph config
    p.log.step("Generating bootsralph configuration...");
    const bootsralphConfigPath = await generateBootsralphConfig(stackConfig, projectPath);
    filesWritten.push(bootsralphConfigPath);

    // Step 4: Add package scripts (merge mode to preserve existing scripts)
    p.log.step("Adding package scripts...");
    const packageJsonPath = await addPackageScripts(projectPath, { merge: true });
    filesWritten.push(packageJsonPath);

    // Step 5: Run lefthook install
    p.log.step("Installing lefthook...");
    try {
      // Use package manager runner to execute lefthook
      const [cmd, ...prefixArgs] = getPackageManagerRunner(finalConfig.packageManager);
      // Use --force to overwrite existing hooks (handles pre-commit.old already exists error)
      await execa(cmd, [...prefixArgs, "lefthook", "install", "--force"], { cwd: projectPath });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      warnings.push(`Failed to run lefthook install: ${errorMsg}`);
      p.log.warn(`Failed to run lefthook install: ${errorMsg}`);
    }

    // Step 6: Sync skills (verbose for debugging)
    p.log.step("Syncing skills...");
    try {
      await sync({ quiet: false, cwd: projectPath });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      warnings.push(`Failed to sync skills: ${errorMsg}`);
      p.log.warn(`Failed to sync skills: ${errorMsg}`);
    }

    // Display success message
    const nextSteps = [
      `${finalConfig.packageManager} install`,
      `${finalConfig.packageManager} run dev`,
      "",
      "Your project is initialized! Ralph skills have been synced.",
      "Use 'ralph-tui' to plan and execute your next tasks.",
    ];

    p.note(nextSteps.join("\n"), "Next Steps");
    p.outro(`Project "${finalConfig.projectName}" initialized successfully!`);

    return {
      success: true,
      projectPath,
      filesWritten,
      warnings,
      errors,
      nextSteps,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(errorMessage);
    p.log.error(`Initialization failed: ${errorMessage}`);
    p.outro("Failed");

    return {
      success: false,
      projectPath,
      filesWritten,
      warnings,
      errors,
      nextSteps: [],
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  detectProjectConfig,
  displayDetectedConfig,
  readPackageJson,
  detectFramework,
  detectPlatform,
};
