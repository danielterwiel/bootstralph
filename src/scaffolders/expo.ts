/**
 * Expo scaffolder wrapper
 * Wraps `create-expo-stack` with bootstralph-specific configurations
 * Handles Expo Router, styling (Uniwind/NativeWind/Tamagui), TypeScript setup
 */

import * as p from "@clack/prompts";
import { execa, type Options as ExecaOptions } from "execa";
import path from "node:path";
import fs from "fs-extra";
import type {
  Styling,
  StateManagement,
  Backend,
  AuthProvider,
  DeploymentTarget,
  Linter,
  Formatter,
  E2ETestFramework,
  PreCommitTool,
  Routing,
} from "../compatibility/matrix.js";

// ============================================================================
// Types
// ============================================================================

export interface ExpoScaffoldOptions {
  /** Project name/directory */
  projectName: string;
  /** Target directory (defaults to cwd/projectName) */
  targetDir?: string;
  /** Routing choice (expo-router or react-navigation) */
  routing?: Extract<Routing, "expo-router" | "react-navigation">;
  /** Styling choice from wizard */
  styling?: Extract<
    Styling,
    "uniwind" | "nativewind" | "tamagui" | "unistyles" | "stylesheets"
  >;
  /** State management choices */
  state?: StateManagement[];
  /** Backend service choice */
  backend?: Backend;
  /** Auth provider choice */
  auth?: AuthProvider;
  /** Deployment target */
  deployment?: Extract<
    DeploymentTarget,
    "eas" | "local-builds" | "fastlane" | "codemagic"
  >;
  /** Linter choice */
  linter?: Linter;
  /** Formatter choice */
  formatter?: Formatter;
  /** E2E test framework */
  e2eTesting?: Extract<E2ETestFramework, "maestro" | "detox">;
  /** Pre-commit tool */
  preCommit?: PreCommitTool;
  /** Package manager to use */
  packageManager?: "bun" | "pnpm" | "npm" | "yarn";
  /** Whether this is a universal (web + mobile) project */
  universal?: boolean;
}

export interface ScaffoldResult {
  success: boolean;
  projectPath: string;
  errors?: string[];
  warnings?: string[];
  nextSteps?: string[];
}

// ============================================================================
// Main Scaffold Function
// ============================================================================

/**
 * Scaffold a new Expo project using create-expo-stack
 * Then applies bootstralph-specific configurations
 */
export async function scaffoldExpo(
  options: ExpoScaffoldOptions
): Promise<ScaffoldResult> {
  const {
    projectName,
    targetDir = process.cwd(),
    routing = "expo-router",
    styling = "uniwind",
    packageManager = "bun",
    universal = false,
  } = options;

  const projectPath = path.join(targetDir, projectName);
  const errors: string[] = [];
  const warnings: string[] = [];
  const nextSteps: string[] = [];

  // ============================================================================
  // Step 1: Run create-expo-stack
  // ============================================================================

  const spinner = p.spinner();
  spinner.start("Creating Expo project...");

  try {
    const createExpoStackArgs = buildCreateExpoStackArgs({
      projectName,
      routing,
      styling,
      packageManager,
      universal,
    });

    await runCreateExpoStack(createExpoStackArgs, { cwd: targetDir });
    spinner.stop("Expo project created");
  } catch (error) {
    spinner.stop("Failed to create Expo project");
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`create-expo-stack failed: ${errorMessage}`);
    return { success: false, projectPath, errors };
  }

  // ============================================================================
  // Step 2: Install additional dependencies based on selections
  // ============================================================================

  const additionalDeps = collectAdditionalDependencies(options);

  if (
    additionalDeps.dependencies.length > 0 ||
    additionalDeps.devDependencies.length > 0
  ) {
    spinner.start("Installing additional dependencies...");
    try {
      await installDependencies(projectPath, additionalDeps, packageManager);
      spinner.stop("Dependencies installed");
    } catch (error) {
      spinner.stop("Some dependencies may not have installed");
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      warnings.push(`Dependency installation warning: ${errorMessage}`);
    }
  }

  // ============================================================================
  // Step 3: Generate configuration files
  // ============================================================================

  spinner.start("Generating configuration files...");
  try {
    await generateConfigFiles(projectPath, options);
    spinner.stop("Configuration files generated");
  } catch (error) {
    spinner.stop("Some config files may not have been generated");
    const errorMessage = error instanceof Error ? error.message : String(error);
    warnings.push(`Config generation warning: ${errorMessage}`);
  }

  // ============================================================================
  // Step 4: Set up EAS (if selected as deployment target)
  // ============================================================================

  if (options.deployment === "eas") {
    spinner.start("Configuring EAS Build...");
    try {
      await setupEAS(projectPath);
      spinner.stop("EAS Build configured");
    } catch (error) {
      spinner.stop("EAS configuration had issues");
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      warnings.push(`EAS setup warning: ${errorMessage}`);
      nextSteps.push("Run `eas build:configure` to complete EAS setup");
    }
  }

  // ============================================================================
  // Step 5: Build next steps list
  // ============================================================================

  nextSteps.push(...buildNextSteps(options));

  // Build result object conditionally to satisfy exactOptionalPropertyTypes
  const result: ScaffoldResult = {
    success: errors.length === 0,
    projectPath,
  };

  if (errors.length > 0) {
    result.errors = errors;
  }
  if (warnings.length > 0) {
    result.warnings = warnings;
  }
  if (nextSteps.length > 0) {
    result.nextSteps = nextSteps;
  }

  return result;
}

// ============================================================================
// create-expo-stack Arguments
// ============================================================================

interface CreateExpoStackArgsOptions {
  projectName: string;
  routing: Extract<Routing, "expo-router" | "react-navigation">;
  styling: Extract<
    Styling,
    "uniwind" | "nativewind" | "tamagui" | "unistyles" | "stylesheets"
  >;
  packageManager: "bun" | "pnpm" | "npm" | "yarn";
  universal: boolean;
}

/**
 * Build arguments array for create-expo-stack
 * CLI options: https://createexpostack.com/
 */
function buildCreateExpoStackArgs(options: CreateExpoStackArgsOptions): string[] {
  const { projectName, routing, styling, packageManager, universal } = options;

  const args: string[] = [projectName];

  // Use non-interactive mode
  args.push("--nonInteractive");

  // For universal apps (web + mobile), add web support
  if (universal) {
    // Note: Universal support may require additional setup post-scaffold
    // create-expo-stack doesn't have a direct --universal flag
  }

  // Navigation/Routing
  if (routing === "expo-router") {
    args.push("--expo-router");
    // Use tabs navigation as default with expo-router
    args.push("--tabs");
  } else {
    args.push("--react-navigation");
    // Use tabs navigation as default
    args.push("--tabs");
  }

  // Styling
  switch (styling) {
    case "uniwind":
      // Uniwind is relatively new, create-expo-stack may not support it directly
      // Fall back to nativewind and we'll swap in uniwind post-scaffold
      args.push("--nativewind");
      break;
    case "nativewind":
      args.push("--nativewind");
      break;
    case "tamagui":
      args.push("--tamagui");
      break;
    case "unistyles":
      args.push("--unistyles");
      break;
    case "stylesheets":
      // Default React Native stylesheets, no flag needed
      args.push("--stylesheet");
      break;
  }

  // Package manager
  args.push(`--${packageManager}`);

  // No git init (we handle this separately)
  args.push("--noGit");

  // Skip install (we'll install with additional deps)
  args.push("--noInstall");

  // TypeScript (always)
  // Note: create-expo-stack uses TypeScript by default

  return args;
}

/**
 * Execute create-expo-stack with the given arguments
 */
async function runCreateExpoStack(
  args: string[],
  execaOptions: ExecaOptions
): Promise<void> {
  await execa("npx", ["create-expo-stack@latest", ...args], {
    ...execaOptions,
    stdio: "pipe",
  });
}

// ============================================================================
// Dependency Collection
// ============================================================================

interface DependencyList {
  dependencies: string[];
  devDependencies: string[];
}

/**
 * Collect additional dependencies based on wizard selections
 */
function collectAdditionalDependencies(
  options: ExpoScaffoldOptions
): DependencyList {
  const deps: string[] = [];
  const devDeps: string[] = [];

  // Uniwind swap (if selected but we used nativewind in CLI)
  if (options.styling === "uniwind") {
    // Remove nativewind, add uniwind
    // This is handled by updating package.json post-scaffold
    deps.push("uniwind");
  }

  // State management
  if (options.state) {
    for (const state of options.state) {
      switch (state) {
        case "zustand":
          deps.push("zustand");
          break;
        case "jotai":
          deps.push("jotai");
          break;
        case "tanstack-query":
          deps.push("@tanstack/react-query");
          devDeps.push("@tanstack/react-query-devtools");
          break;
      }
    }
  }

  // Backend
  if (options.backend) {
    switch (options.backend) {
      case "supabase":
        deps.push("@supabase/supabase-js");
        // For React Native, use AsyncStorage for session persistence
        deps.push("@react-native-async-storage/async-storage");
        break;
      case "convex":
        deps.push("convex");
        break;
      case "firebase":
        // React Native Firebase
        deps.push(
          "@react-native-firebase/app",
          "@react-native-firebase/auth",
          "@react-native-firebase/firestore"
        );
        break;
    }
  }

  // Auth
  if (options.auth) {
    switch (options.auth) {
      case "better-auth":
        // better-auth has native Expo SDK
        deps.push("better-auth", "@better-auth/expo", "expo-secure-store");
        break;
      case "clerk":
        deps.push("@clerk/clerk-expo", "expo-secure-store");
        break;
      case "supabase-auth":
        // Already installed with supabase backend
        if (!options.backend || options.backend !== "supabase") {
          deps.push("@supabase/supabase-js");
        }
        deps.push("@react-native-async-storage/async-storage");
        break;
    }
  }

  // Testing - Jest is always used for unit testing in Expo
  // Jest comes with Expo, so we just need testing-library
  devDeps.push("@testing-library/react-native", "@testing-library/jest-native");

  // E2E Testing
  if (options.e2eTesting === "detox") {
    devDeps.push("detox", "jest-circus");
  }
  // Maestro is installed separately via brew/script, not npm

  // Linting
  if (options.linter) {
    switch (options.linter) {
      case "oxlint":
        devDeps.push("oxlint");
        break;
      case "biome":
        devDeps.push("@biomejs/biome");
        break;
      // ESLint comes with Expo
    }
  }

  // Formatting
  if (options.formatter && options.formatter !== "biome") {
    switch (options.formatter) {
      case "oxfmt":
        devDeps.push("oxfmt");
        break;
      case "prettier":
        // Prettier usually comes with Expo, but ensure it's there
        devDeps.push("prettier");
        break;
    }
  }

  // Pre-commit
  if (options.preCommit) {
    switch (options.preCommit) {
      case "lefthook":
        devDeps.push("lefthook");
        break;
      case "husky":
        devDeps.push("husky", "lint-staged");
        break;
      // prek is installed via cargo, not npm
    }
  }

  return { dependencies: deps, devDependencies: devDeps };
}

/**
 * Install dependencies in the project
 */
async function installDependencies(
  projectPath: string,
  deps: DependencyList,
  packageManager: string
): Promise<void> {
  const addCmd = packageManager === "npm" ? "install" : "add";

  // First, run regular install to get base dependencies
  await execa(packageManager, ["install"], {
    cwd: projectPath,
    stdio: "pipe",
  });

  if (deps.dependencies.length > 0) {
    await execa(packageManager, [addCmd, ...deps.dependencies], {
      cwd: projectPath,
      stdio: "pipe",
    });
  }

  if (deps.devDependencies.length > 0) {
    const devFlag = packageManager === "npm" ? "--save-dev" : "-D";
    await execa(packageManager, [addCmd, devFlag, ...deps.devDependencies], {
      cwd: projectPath,
      stdio: "pipe",
    });
  }
}

// ============================================================================
// EAS Build Setup
// ============================================================================

/**
 * Configure EAS Build for the project
 */
async function setupEAS(projectPath: string): Promise<void> {
  // Create eas.json configuration
  const easConfig = {
    cli: {
      version: ">= 13.0.0",
      appVersionSource: "remote",
    },
    build: {
      development: {
        developmentClient: true,
        distribution: "internal",
        ios: {
          simulator: true,
        },
      },
      preview: {
        distribution: "internal",
      },
      production: {
        autoIncrement: true,
      },
    },
    submit: {
      production: {},
    },
  };

  await fs.writeJSON(path.join(projectPath, "eas.json"), easConfig, {
    spaces: 2,
  });
}

// ============================================================================
// Configuration File Generation
// ============================================================================

/**
 * Generate configuration files based on selections
 */
async function generateConfigFiles(
  projectPath: string,
  options: ExpoScaffoldOptions
): Promise<void> {
  const configGenerators: Array<() => Promise<void>> = [];

  // Jest config enhancement
  configGenerators.push(() => generateJestConfig(projectPath));

  // Maestro test directory (if selected)
  if (options.e2eTesting === "maestro") {
    configGenerators.push(() => generateMaestroSetup(projectPath));
  }

  // Detox config (if selected)
  if (options.e2eTesting === "detox") {
    configGenerators.push(() => generateDetoxConfig(projectPath));
  }

  // oxlint config
  if (options.linter === "oxlint") {
    configGenerators.push(() => generateOxlintConfig(projectPath));
  }

  // Biome config
  if (options.linter === "biome") {
    configGenerators.push(() => generateBiomeConfig(projectPath));
  }

  // Lefthook config
  if (options.preCommit === "lefthook") {
    configGenerators.push(() => generateLefthookConfig(projectPath, options));
  }

  // Convex setup
  if (options.backend === "convex") {
    configGenerators.push(() => generateConvexSetup(projectPath));
  }

  // Supabase setup
  if (options.backend === "supabase" || options.auth === "supabase-auth") {
    configGenerators.push(() => generateSupabaseSetup(projectPath));
  }

  // Uniwind migration (if we used nativewind as fallback)
  if (options.styling === "uniwind") {
    configGenerators.push(() => migrateToUniwnd(projectPath));
  }

  // Environment variables template
  configGenerators.push(() => generateEnvTemplate(projectPath, options));

  // Run all generators
  await Promise.all(configGenerators.map((gen) => gen()));
}

async function generateJestConfig(projectPath: string): Promise<void> {
  // Check if jest config exists in package.json or separate file
  const packageJsonPath = path.join(projectPath, "package.json");
  const packageJson = await fs.readJSON(packageJsonPath);

  // Update or create jest config
  packageJson.jest = {
    preset: "jest-expo",
    setupFilesAfterEnv: ["@testing-library/jest-native/extend-expect"],
    transformIgnorePatterns: [
      "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)",
    ],
    moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
    testMatch: ["**/__tests__/**/*.(test|spec).(ts|tsx|js|jsx)"],
  };

  await fs.writeJSON(packageJsonPath, packageJson, { spaces: 2 });

  // Create test setup file
  const testDir = path.join(projectPath, "__tests__");
  await fs.ensureDir(testDir);

  const exampleTest = `import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

describe('Example', () => {
  it('renders correctly', () => {
    render(<Text>Hello World</Text>);
    expect(screen.getByText('Hello World')).toBeTruthy();
  });
});
`;

  await fs.writeFile(path.join(testDir, "example.test.tsx"), exampleTest);
}

async function generateMaestroSetup(projectPath: string): Promise<void> {
  // Create maestro directory
  const maestroDir = path.join(projectPath, ".maestro");
  await fs.ensureDir(maestroDir);

  // Create example flow
  const exampleFlow = `appId: \${APP_ID}
---
- launchApp
- assertVisible: "Welcome"
- tapOn: "Get Started"
`;

  await fs.writeFile(path.join(maestroDir, "example-flow.yaml"), exampleFlow);

  // Create config file
  const maestroConfig = `# Maestro Configuration
# See: https://maestro.mobile.dev/

# Default app ID (replace with your app's bundle identifier)
# iOS: com.yourcompany.yourapp
# Android: com.yourcompany.yourapp
`;

  await fs.writeFile(path.join(maestroDir, "README.md"), maestroConfig);
}

async function generateDetoxConfig(projectPath: string): Promise<void> {
  const config = `/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      '$0': 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/YourApp.app',
      build: 'xcodebuild -workspace ios/YourApp.xcworkspace -scheme YourApp -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 15',
      },
    },
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_5_API_34',
      },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
  },
};
`;

  await fs.writeFile(path.join(projectPath, ".detoxrc.js"), config);

  // Create e2e directory
  const e2eDir = path.join(projectPath, "e2e");
  await fs.ensureDir(e2eDir);

  // Create jest config for e2e
  const jestConfig = `/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/e2e/**/*.test.ts'],
  testTimeout: 120000,
  maxWorkers: 1,
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
};
`;

  await fs.writeFile(path.join(e2eDir, "jest.config.js"), jestConfig);

  // Create example test
  const exampleTest = `import { device, element, by, expect } from 'detox';

describe('Example', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should show welcome screen', async () => {
    await expect(element(by.text('Welcome'))).toBeVisible();
  });
});
`;

  await fs.writeFile(path.join(e2eDir, "starter.test.ts"), exampleTest);
}

async function generateOxlintConfig(projectPath: string): Promise<void> {
  const config = {
    $schema:
      "https://raw.githubusercontent.com/oxc-project/oxc/main/crates/oxc_linter/src/schema.json",
    plugins: ["typescript", "react", "react-hooks", "jsx-a11y"],
    rules: {
      "no-unused-vars": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
    ignore: ["node_modules", ".expo", "dist", "android", "ios"],
  };

  await fs.writeJSON(path.join(projectPath, ".oxlintrc.json"), config, {
    spaces: 2,
  });
}

async function generateBiomeConfig(projectPath: string): Promise<void> {
  const config = {
    $schema: "https://biomejs.dev/schemas/1.9.4/schema.json",
    organizeImports: {
      enabled: true,
    },
    linter: {
      enabled: true,
      rules: {
        recommended: true,
      },
    },
    formatter: {
      enabled: true,
      indentStyle: "space",
      indentWidth: 2,
    },
    javascript: {
      formatter: {
        quoteStyle: "single",
        semicolons: "always",
      },
    },
    files: {
      ignore: ["node_modules", ".expo", "dist", "android", "ios"],
    },
  };

  await fs.writeJSON(path.join(projectPath, "biome.json"), config, {
    spaces: 2,
  });
}

async function generateLefthookConfig(
  projectPath: string,
  options: ExpoScaffoldOptions
): Promise<void> {
  const lintCommand =
    options.linter === "oxlint"
      ? "npx oxlint {staged_files}"
      : options.linter === "biome"
        ? "npx biome check {staged_files}"
        : "npx eslint {staged_files}";

  const formatCommand =
    options.formatter === "oxfmt"
      ? "npx oxfmt {staged_files}"
      : options.formatter === "biome"
        ? "npx biome format --write {staged_files}"
        : "npx prettier --write {staged_files}";

  const config = `pre-commit:
  parallel: true
  commands:
    lint:
      glob: "*.{js,jsx,ts,tsx}"
      run: ${lintCommand}
    format:
      glob: "*.{js,jsx,ts,tsx,json,md}"
      run: ${formatCommand}
      stage_fixed: true
    typecheck:
      run: npx tsc --noEmit
`;

  await fs.writeFile(path.join(projectPath, "lefthook.yml"), config);
}

async function generateConvexSetup(projectPath: string): Promise<void> {
  // Create convex directory
  const convexDir = path.join(projectPath, "convex");
  await fs.ensureDir(convexDir);

  // Create convex schema
  const schemaContent = `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Example table - customize as needed
  tasks: defineTable({
    text: v.string(),
    isCompleted: v.boolean(),
  }),
});
`;

  await fs.writeFile(path.join(convexDir, "schema.ts"), schemaContent);

  // Create convex functions file
  const functionsContent = `import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tasks").collect();
  },
});

export const create = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const taskId = await ctx.db.insert("tasks", {
      text: args.text,
      isCompleted: false,
    });
    return taskId;
  },
});
`;

  await fs.writeFile(path.join(convexDir, "tasks.ts"), functionsContent);

  // Create Convex provider for React Native
  const providerContent = `import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL as string);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProvider client={convex}>
      {children}
    </ConvexProvider>
  );
}
`;

  const providersDir = path.join(projectPath, "providers");
  await fs.ensureDir(providersDir);
  await fs.writeFile(path.join(providersDir, "convex.tsx"), providerContent);
}

async function generateSupabaseSetup(projectPath: string): Promise<void> {
  // Create lib directory for supabase client
  const libDir = path.join(projectPath, "lib");
  await fs.ensureDir(libDir);

  const supabaseClientContent = `import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
`;

  await fs.writeFile(path.join(libDir, "supabase.ts"), supabaseClientContent);
}

async function migrateToUniwnd(projectPath: string): Promise<void> {
  // Read package.json
  const packageJsonPath = path.join(projectPath, "package.json");
  const packageJson = await fs.readJSON(packageJsonPath);

  // Remove nativewind, add uniwind
  if (packageJson.dependencies?.nativewind) {
    delete packageJson.dependencies.nativewind;
  }
  if (packageJson.devDependencies?.nativewind) {
    delete packageJson.devDependencies.nativewind;
  }

  // Uniwind is added via collectAdditionalDependencies

  await fs.writeJSON(packageJsonPath, packageJson, { spaces: 2 });

  // Update babel.config.js to use uniwind preset
  const babelConfigPath = path.join(projectPath, "babel.config.js");
  if (await fs.pathExists(babelConfigPath)) {
    let babelConfig = await fs.readFile(babelConfigPath, "utf-8");
    // Replace nativewind/babel with uniwind/babel
    babelConfig = babelConfig.replace(
      /nativewind\/babel/g,
      "uniwind/babel"
    );
    await fs.writeFile(babelConfigPath, babelConfig);
  }

  // Update tailwind.config.js/ts if it exists
  const tailwindConfigPath = path.join(projectPath, "tailwind.config.js");
  if (await fs.pathExists(tailwindConfigPath)) {
    let tailwindConfig = await fs.readFile(tailwindConfigPath, "utf-8");
    // Replace nativewind with uniwind in presets if applicable
    tailwindConfig = tailwindConfig.replace(
      /nativewind/g,
      "uniwind"
    );
    await fs.writeFile(tailwindConfigPath, tailwindConfig);
  }
}

async function generateEnvTemplate(
  projectPath: string,
  options: ExpoScaffoldOptions
): Promise<void> {
  const envLines: string[] = [
    "# Environment Variables",
    "# Copy this file to .env and fill in your values",
    "# For Expo, prefix public variables with EXPO_PUBLIC_",
    "",
  ];

  // Backend
  if (options.backend === "supabase" || options.auth === "supabase-auth") {
    envLines.push("# Supabase");
    envLines.push("EXPO_PUBLIC_SUPABASE_URL=");
    envLines.push("EXPO_PUBLIC_SUPABASE_ANON_KEY=");
    envLines.push("");
  }

  if (options.backend === "convex") {
    envLines.push("# Convex");
    envLines.push("EXPO_PUBLIC_CONVEX_URL=");
    envLines.push("");
  }

  if (options.backend === "firebase") {
    envLines.push("# Firebase");
    envLines.push("# Firebase config is typically in google-services.json (Android)");
    envLines.push("# and GoogleService-Info.plist (iOS)");
    envLines.push("");
  }

  // Auth
  if (options.auth === "clerk") {
    envLines.push("# Clerk");
    envLines.push("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=");
    envLines.push("");
  }

  if (options.auth === "better-auth") {
    envLines.push("# Better Auth");
    envLines.push("EXPO_PUBLIC_BETTER_AUTH_URL=");
    envLines.push("");
  }

  // EAS
  if (options.deployment === "eas") {
    envLines.push("# EAS");
    envLines.push("# EXPO_PUBLIC_EAS_PROJECT_ID=");
    envLines.push("");
  }

  await fs.writeFile(
    path.join(projectPath, ".env.example"),
    envLines.join("\n")
  );

  // Also create .env with empty values
  await fs.writeFile(path.join(projectPath, ".env"), envLines.join("\n"));
}

// ============================================================================
// Next Steps Builder
// ============================================================================

/**
 * Build list of next steps for the user
 */
function buildNextSteps(options: ExpoScaffoldOptions): string[] {
  const steps: string[] = [];

  steps.push(`cd ${options.projectName}`);

  // Environment setup
  if (options.backend || options.auth) {
    steps.push("Copy .env.example to .env and fill in your values");
  }

  // Convex setup
  if (options.backend === "convex") {
    steps.push("Run `npx convex dev` to set up Convex backend");
  }

  // Firebase setup
  if (options.backend === "firebase") {
    steps.push(
      "Add google-services.json (Android) and GoogleService-Info.plist (iOS)"
    );
  }

  // EAS setup
  if (options.deployment === "eas") {
    steps.push("Run `eas login` to log into your Expo account");
    steps.push("Run `eas build:configure` to complete EAS setup");
  }

  // Maestro setup
  if (options.e2eTesting === "maestro") {
    steps.push(
      "Install Maestro: `brew install maestro` (macOS) or see https://maestro.mobile.dev"
    );
    steps.push("Run `maestro test .maestro/` to run E2E tests");
  }

  // Detox setup
  if (options.e2eTesting === "detox") {
    steps.push("Run `detox build -c ios.sim.debug` to build for iOS");
    steps.push("Run `detox test -c ios.sim.debug` to run E2E tests");
  }

  // prek installation
  if (options.preCommit === "prek") {
    steps.push(
      "Install prek: `cargo install prek` or download from GitHub releases"
    );
  }

  // Lefthook installation
  if (options.preCommit === "lefthook") {
    steps.push("Run `npx lefthook install` to set up git hooks");
  }

  // Husky installation
  if (options.preCommit === "husky") {
    steps.push("Run `npx husky install` to set up git hooks");
  }

  // Start dev server
  const pm = options.packageManager ?? "bun";
  const runCmd = pm === "npm" ? "npm run" : pm;
  steps.push(`Run \`${runCmd} start\` to start the Expo development server`);
  steps.push("Press 'i' for iOS simulator, 'a' for Android emulator");

  return steps;
}

// ============================================================================
// Exports
// ============================================================================

export {
  buildCreateExpoStackArgs,
  collectAdditionalDependencies,
  buildNextSteps,
};
