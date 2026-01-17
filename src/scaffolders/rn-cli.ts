/**
 * React Native CLI scaffolder wrapper
 * Wraps `npx @react-native-community/cli init` with bootstralph-specific configurations
 * Handles React Navigation, styling (Uniwind/NativeWind/Tamagui), TypeScript setup
 *
 * Prerequisites: Xcode (iOS) and Android Studio (Android) required
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
} from "../compatibility/matrix.js";

// ============================================================================
// Types
// ============================================================================

export interface RNCliScaffoldOptions {
  /** Project name/directory */
  projectName: string;
  /** Target directory (defaults to cwd/projectName) */
  targetDir?: string;
  /** Styling choice from wizard */
  styling?: Extract<Styling, "uniwind" | "nativewind" | "tamagui" | "stylesheets">;
  /** State management choices */
  state?: StateManagement[];
  /** Backend service choice */
  backend?: Backend;
  /** Auth provider choice */
  auth?: AuthProvider;
  /** Deployment target */
  deployment?: Extract<DeploymentTarget, "fastlane" | "local-builds">;
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
  /** Skip prerequisite check (for testing) */
  skipPrerequisiteCheck?: boolean;
}

export interface ScaffoldResult {
  success: boolean;
  projectPath: string;
  errors?: string[];
  warnings?: string[];
  nextSteps?: string[];
}

export interface PrerequisiteCheckResult {
  hasXcode: boolean;
  hasAndroidStudio: boolean;
  xcodeVersion?: string;
  androidSdkPath?: string;
}

// ============================================================================
// Prerequisite Checking
// ============================================================================

/**
 * Check if development prerequisites are installed
 */
export async function checkPrerequisites(): Promise<PrerequisiteCheckResult> {
  const result: PrerequisiteCheckResult = {
    hasXcode: false,
    hasAndroidStudio: false,
  };

  // Check for Xcode (macOS only)
  if (process.platform === "darwin") {
    try {
      const { stdout } = await execa("xcode-select", ["-p"], { reject: false });
      if (stdout && stdout.includes("/Xcode")) {
        result.hasXcode = true;
        // Get Xcode version
        try {
          const versionResult = await execa("xcodebuild", ["-version"], {
            reject: false,
          });
          const versionMatch = versionResult.stdout.match(/Xcode (\d+\.\d+)/);
          if (versionMatch && versionMatch[1]) {
            result.xcodeVersion = versionMatch[1];
          }
        } catch {
          // Ignore version fetch errors
        }
      }
    } catch {
      // Xcode not installed
    }
  }

  // Check for Android SDK
  const androidHome =
    process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";
  if (androidHome) {
    try {
      const platformToolsPath = path.join(androidHome, "platform-tools");
      const exists = await fs.pathExists(platformToolsPath);
      if (exists) {
        result.hasAndroidStudio = true;
        result.androidSdkPath = androidHome;
      }
    } catch {
      // Android SDK not found
    }
  }

  return result;
}

/**
 * Display prerequisite warning and offer to switch to Expo
 * Returns true if user wants to continue with RN CLI, false if they want to switch
 */
export async function showPrerequisiteWarning(
  prerequisites: PrerequisiteCheckResult
): Promise<boolean> {
  const missing: string[] = [];

  if (!prerequisites.hasXcode && process.platform === "darwin") {
    missing.push("Xcode (for iOS development)");
  }
  if (!prerequisites.hasAndroidStudio) {
    missing.push("Android Studio SDK (for Android development)");
  }

  if (missing.length === 0) {
    return true; // All prerequisites met
  }

  p.note(
    [
      "⚠️  React Native CLI requires local development tools:",
      "",
      "Missing:",
      ...missing.map((m) => `  • ${m}`),
      "",
      "iOS Development:",
      "  • Xcode (Mac App Store) with Command Line Tools",
      "  • CocoaPods (`sudo gem install cocoapods` or via Homebrew)",
      "",
      "Android Development:",
      "  • Android Studio with Android SDK",
      "  • ANDROID_HOME environment variable configured",
      "  • Java Development Kit (JDK 17+)",
      "",
      "Estimated setup time: ~1 hour if not already installed",
      "",
      "💡 Consider Expo instead? Expo offers:",
      "  • No Xcode/Android Studio required for development",
      "  • Cloud builds via EAS (test on device without local tools)",
      "  • Same React Native code, easier setup",
      "  • Can 'eject' to bare workflow later if needed",
    ].join("\n"),
    "Prerequisites Warning"
  );

  const continueChoice = await p.confirm({
    message: "Continue with React Native CLI anyway?",
    initialValue: false,
  });

  if (p.isCancel(continueChoice)) {
    return false;
  }

  return continueChoice;
}

// ============================================================================
// Main Scaffold Function
// ============================================================================

/**
 * Scaffold a new React Native CLI project using @react-native-community/cli
 * Then applies bootstralph-specific configurations
 */
export async function scaffoldRNCli(
  options: RNCliScaffoldOptions
): Promise<ScaffoldResult> {
  const {
    projectName,
    targetDir = process.cwd(),
    styling = "uniwind",
    packageManager = "bun",
    skipPrerequisiteCheck = false,
  } = options;

  const projectPath = path.join(targetDir, projectName);
  const errors: string[] = [];
  const warnings: string[] = [];
  const nextSteps: string[] = [];

  // ============================================================================
  // Step 0: Check prerequisites (unless skipped)
  // ============================================================================

  if (!skipPrerequisiteCheck) {
    const prerequisites = await checkPrerequisites();
    const shouldContinue = await showPrerequisiteWarning(prerequisites);

    if (!shouldContinue) {
      return {
        success: false,
        projectPath,
        errors: ["User chose to switch to Expo instead of React Native CLI"],
      };
    }
  }

  // ============================================================================
  // Step 1: Run react-native init
  // ============================================================================

  const spinner = p.spinner();
  spinner.start("Creating React Native project...");

  try {
    const initArgs = buildReactNativeInitArgs({
      projectName,
      packageManager,
    });

    await runReactNativeInit(initArgs, { cwd: targetDir });
    spinner.stop("React Native project created");
  } catch (error) {
    spinner.stop("Failed to create React Native project");
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`react-native init failed: ${errorMessage}`);
    return { success: false, projectPath, errors };
  }

  // ============================================================================
  // Step 2: Install React Navigation
  // ============================================================================

  spinner.start("Setting up React Navigation...");
  try {
    await setupReactNavigation(projectPath, packageManager);
    spinner.stop("React Navigation configured");
  } catch (error) {
    spinner.stop("React Navigation setup had issues");
    const errorMessage = error instanceof Error ? error.message : String(error);
    warnings.push(`React Navigation setup warning: ${errorMessage}`);
  }

  // ============================================================================
  // Step 3: Install additional dependencies based on selections
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
  // Step 4: Generate configuration files
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
  // Step 5: Set up styling
  // ============================================================================

  if (styling !== "stylesheets") {
    spinner.start(`Setting up ${styling}...`);
    try {
      await setupStyling(projectPath, styling, packageManager);
      spinner.stop(`${styling} configured`);
    } catch (error) {
      spinner.stop(`${styling} setup had issues`);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      warnings.push(`${styling} setup warning: ${errorMessage}`);
    }
  }

  // ============================================================================
  // Step 6: Set up Fastlane (if selected as deployment target)
  // ============================================================================

  if (options.deployment === "fastlane") {
    spinner.start("Configuring Fastlane...");
    try {
      await setupFastlane(projectPath, projectName);
      spinner.stop("Fastlane configured");
    } catch (error) {
      spinner.stop("Fastlane configuration had issues");
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      warnings.push(`Fastlane setup warning: ${errorMessage}`);
      nextSteps.push("Run `fastlane init` to complete Fastlane setup");
    }
  }

  // ============================================================================
  // Step 7: Build next steps list
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
// react-native init Arguments
// ============================================================================

interface ReactNativeInitArgsOptions {
  projectName: string;
  packageManager: "bun" | "pnpm" | "npm" | "yarn";
}

/**
 * Build arguments array for react-native init
 */
function buildReactNativeInitArgs(options: ReactNativeInitArgsOptions): string[] {
  const { projectName, packageManager } = options;

  const args: string[] = [projectName];

  // Use TypeScript template
  args.push("--template", "react-native-template-typescript");

  // Skip git init (we handle this separately)
  args.push("--skip-git-init");

  // Package manager
  // Note: React Native CLI uses --pm for package manager
  args.push("--pm", packageManager);

  return args;
}

/**
 * Execute react-native init with the given arguments
 */
async function runReactNativeInit(
  args: string[],
  execaOptions: ExecaOptions
): Promise<void> {
  // Use npx to run @react-native-community/cli
  await execa("npx", ["@react-native-community/cli", "init", ...args], {
    ...execaOptions,
    stdio: "pipe",
  });
}

// ============================================================================
// React Navigation Setup
// ============================================================================

/**
 * Set up React Navigation with stack navigator
 */
async function setupReactNavigation(
  projectPath: string,
  packageManager: string
): Promise<void> {
  const addCmd = packageManager === "npm" ? "install" : "add";

  // Install React Navigation core and dependencies
  const navDeps = [
    "@react-navigation/native",
    "@react-navigation/native-stack",
    "react-native-screens",
    "react-native-safe-area-context",
  ];

  await execa(packageManager, [addCmd, ...navDeps], {
    cwd: projectPath,
    stdio: "pipe",
  });

  // Create navigation setup file
  const navigationDir = path.join(projectPath, "src", "navigation");
  await fs.ensureDir(navigationDir);

  const rootNavigatorContent = `import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import your screens here
// import HomeScreen from '../screens/HomeScreen';

export type RootStackParamList = {
  Home: undefined;
  // Add more screen params here
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        {/* Add your screens here */}
        {/* <Stack.Screen name="Home" component={HomeScreen} /> */}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
`;

  await fs.writeFile(
    path.join(navigationDir, "RootNavigator.tsx"),
    rootNavigatorContent
  );

  // Create screens directory
  const screensDir = path.join(projectPath, "src", "screens");
  await fs.ensureDir(screensDir);

  const homeScreenContent = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to React Native!</Text>
        <Text style={styles.subtitle}>Edit src/screens/HomeScreen.tsx to get started</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
`;

  await fs.writeFile(path.join(screensDir, "HomeScreen.tsx"), homeScreenContent);

  // Create index file for screens
  const screensIndexContent = `export { default as HomeScreen } from './HomeScreen';
`;

  await fs.writeFile(path.join(screensDir, "index.ts"), screensIndexContent);

  // Update App.tsx to use navigation
  const appContent = `import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <RootNavigator />
    </SafeAreaProvider>
  );
}

export default App;
`;

  await fs.writeFile(path.join(projectPath, "App.tsx"), appContent);
}

// ============================================================================
// Styling Setup
// ============================================================================

/**
 * Set up styling library
 */
async function setupStyling(
  projectPath: string,
  styling: Extract<Styling, "uniwind" | "nativewind" | "tamagui" | "stylesheets">,
  packageManager: string
): Promise<void> {
  const addCmd = packageManager === "npm" ? "install" : "add";

  switch (styling) {
    case "uniwind":
      await setupUniwnd(projectPath, packageManager, addCmd);
      break;
    case "nativewind":
      await setupNativewind(projectPath, packageManager, addCmd);
      break;
    case "tamagui":
      await setupTamagui(projectPath, packageManager, addCmd);
      break;
    case "stylesheets":
      // Default React Native stylesheets, nothing to set up
      break;
  }
}

async function setupUniwnd(
  projectPath: string,
  packageManager: string,
  addCmd: string
): Promise<void> {
  // Install uniwind and dependencies
  await execa(packageManager, [addCmd, "uniwind", "tailwindcss"], {
    cwd: projectPath,
    stdio: "pipe",
  });

  // Create tailwind.config.js
  const tailwindConfig = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('uniwind/tailwind.preset')],
  theme: {
    extend: {},
  },
  plugins: [],
};
`;

  await fs.writeFile(path.join(projectPath, "tailwind.config.js"), tailwindConfig);

  // Update babel.config.js
  const babelConfig = `module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['uniwind/babel'],
};
`;

  await fs.writeFile(path.join(projectPath, "babel.config.js"), babelConfig);

  // Create global.css for Tailwind
  const globalCss = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

  await fs.writeFile(path.join(projectPath, "global.css"), globalCss);
}

async function setupNativewind(
  projectPath: string,
  packageManager: string,
  addCmd: string
): Promise<void> {
  // Install NativeWind v4 and dependencies
  await execa(
    packageManager,
    [addCmd, "nativewind", "tailwindcss", "react-native-css-interop"],
    {
      cwd: projectPath,
      stdio: "pipe",
    }
  );

  // Create tailwind.config.js
  const tailwindConfig = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {},
  },
  plugins: [],
};
`;

  await fs.writeFile(path.join(projectPath, "tailwind.config.js"), tailwindConfig);

  // Update babel.config.js
  const babelConfig = `module.exports = {
  presets: ['module:@react-native/babel-preset', 'nativewind/babel'],
};
`;

  await fs.writeFile(path.join(projectPath, "babel.config.js"), babelConfig);

  // Create metro.config.js for NativeWind
  const metroConfig = `const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = mergeConfig(getDefaultConfig(__dirname), {});

module.exports = withNativeWind(config, { input: './global.css' });
`;

  await fs.writeFile(path.join(projectPath, "metro.config.js"), metroConfig);

  // Create global.css
  const globalCss = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

  await fs.writeFile(path.join(projectPath, "global.css"), globalCss);
}

async function setupTamagui(
  projectPath: string,
  packageManager: string,
  addCmd: string
): Promise<void> {
  // Install Tamagui
  await execa(
    packageManager,
    [
      addCmd,
      "tamagui",
      "@tamagui/config",
      "@tamagui/babel-plugin",
      "react-native-reanimated",
    ],
    {
      cwd: projectPath,
      stdio: "pipe",
    }
  );

  // Create tamagui.config.ts
  const tamaguiConfig = `import { config } from '@tamagui/config/v3';
import { createTamagui } from 'tamagui';

export const tamaguiConfig = createTamagui(config);

export default tamaguiConfig;

export type Conf = typeof tamaguiConfig;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
`;

  await fs.writeFile(
    path.join(projectPath, "tamagui.config.ts"),
    tamaguiConfig
  );

  // Update babel.config.js
  const babelConfig = `module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      '@tamagui/babel-plugin',
      {
        config: './tamagui.config.ts',
        components: ['tamagui'],
      },
    ],
    'react-native-reanimated/plugin',
  ],
};
`;

  await fs.writeFile(path.join(projectPath, "babel.config.js"), babelConfig);
}

// ============================================================================
// Fastlane Setup
// ============================================================================

/**
 * Set up Fastlane for CI/CD
 */
async function setupFastlane(
  projectPath: string,
  projectName: string
): Promise<void> {
  const fastlaneDir = path.join(projectPath, "fastlane");
  await fs.ensureDir(fastlaneDir);

  // Create Fastfile
  const fastfile = `# Fastlane configuration for ${projectName}
# See: https://docs.fastlane.tools/

default_platform(:ios)

platform :ios do
  desc "Build iOS app for development"
  lane :build_dev do
    build_ios_app(
      scheme: "${projectName}",
      configuration: "Debug",
      export_method: "development"
    )
  end

  desc "Build iOS app for production"
  lane :build_prod do
    build_ios_app(
      scheme: "${projectName}",
      configuration: "Release",
      export_method: "app-store"
    )
  end

  desc "Submit to TestFlight"
  lane :beta do
    build_prod
    upload_to_testflight
  end
end

platform :android do
  desc "Build Android app for development"
  lane :build_dev do
    gradle(
      task: "assembleDebug",
      project_dir: "./android"
    )
  end

  desc "Build Android app for production"
  lane :build_prod do
    gradle(
      task: "assembleRelease",
      project_dir: "./android"
    )
  end

  desc "Build and upload to Google Play internal track"
  lane :beta do
    gradle(
      task: "bundleRelease",
      project_dir: "./android"
    )
    upload_to_play_store(
      track: "internal",
      aab: "./android/app/build/outputs/bundle/release/app-release.aab"
    )
  end
end
`;

  await fs.writeFile(path.join(fastlaneDir, "Fastfile"), fastfile);

  // Create Appfile
  const appfile = `# App-specific configuration
# Update these values with your actual app identifiers

# iOS
# app_identifier("com.example.${projectName.toLowerCase()}")
# apple_id("your@email.com")
# team_id("YOUR_TEAM_ID")

# Android
# package_name("com.example.${projectName.toLowerCase()}")
# json_key_file("path/to/service-account.json")
`;

  await fs.writeFile(path.join(fastlaneDir, "Appfile"), appfile);

  // Create README for Fastlane
  const readme = `# Fastlane Setup

## Prerequisites
- Install Fastlane: \`gem install fastlane\` or \`brew install fastlane\`
- Update \`Appfile\` with your app identifiers

## Usage

### iOS
\`\`\`bash
# Development build
fastlane ios build_dev

# Production build
fastlane ios build_prod

# Submit to TestFlight
fastlane ios beta
\`\`\`

### Android
\`\`\`bash
# Development build
fastlane android build_dev

# Production build
fastlane android build_prod

# Submit to Play Store internal track
fastlane android beta
\`\`\`

## Configuration
1. Update \`Appfile\` with your team/app identifiers
2. For iOS, ensure you have valid certificates and provisioning profiles
3. For Android, create a service account JSON key for Play Store uploads
`;

  await fs.writeFile(path.join(fastlaneDir, "README.md"), readme);
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
  options: RNCliScaffoldOptions
): DependencyList {
  const deps: string[] = [];
  const devDeps: string[] = [];

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
        deps.push("@react-native-async-storage/async-storage");
        break;
      case "convex":
        deps.push("convex", "convex-react-native");
        break;
      case "firebase":
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
        deps.push("better-auth", "@better-auth/react-native");
        break;
      case "clerk":
        deps.push("@clerk/clerk-react");
        deps.push("@react-native-async-storage/async-storage");
        break;
      case "supabase-auth":
        if (!options.backend || options.backend !== "supabase") {
          deps.push("@supabase/supabase-js");
        }
        deps.push("@react-native-async-storage/async-storage");
        break;
    }
  }

  // Testing - Jest comes with React Native, just add testing-library
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
      // ESLint comes with React Native
    }
  }

  // Formatting
  if (options.formatter && options.formatter !== "biome") {
    switch (options.formatter) {
      case "oxfmt":
        devDeps.push("oxfmt");
        break;
      case "prettier":
        // Prettier usually comes with RN, but ensure it's there
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
// Configuration File Generation
// ============================================================================

/**
 * Generate configuration files based on selections
 */
async function generateConfigFiles(
  projectPath: string,
  options: RNCliScaffoldOptions
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
    configGenerators.push(() =>
      generateDetoxConfig(projectPath, options.projectName)
    );
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

  // Environment variables template
  configGenerators.push(() => generateEnvTemplate(projectPath, options));

  // Run all generators
  await Promise.all(configGenerators.map((gen) => gen()));
}

async function generateJestConfig(projectPath: string): Promise<void> {
  const packageJsonPath = path.join(projectPath, "package.json");
  const packageJson = await fs.readJSON(packageJsonPath);

  // Update or create jest config
  packageJson.jest = {
    preset: "react-native",
    setupFilesAfterEnv: ["@testing-library/jest-native/extend-expect"],
    transformIgnorePatterns: [
      "node_modules/(?!(react-native|@react-native|@react-navigation)/)",
    ],
    moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
    testMatch: ["**/__tests__/**/*.(test|spec).(ts|tsx|js|jsx)"],
  };

  await fs.writeJSON(packageJsonPath, packageJson, { spaces: 2 });

  // Create test setup file and example test
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
  const maestroDir = path.join(projectPath, ".maestro");
  await fs.ensureDir(maestroDir);

  const exampleFlow = `appId: \${APP_ID}
---
- launchApp
- assertVisible: "Welcome to React Native"
- tapOn: "Get Started"
`;

  await fs.writeFile(path.join(maestroDir, "example-flow.yaml"), exampleFlow);

  const readme = `# Maestro E2E Tests

## Installation
\`\`\`bash
# macOS
brew install maestro

# Other platforms: https://maestro.mobile.dev/getting-started/installing-maestro
\`\`\`

## Running Tests
\`\`\`bash
# Run all flows
maestro test .maestro/

# Run specific flow
maestro test .maestro/example-flow.yaml
\`\`\`

## Writing Flows
See: https://maestro.mobile.dev/
`;

  await fs.writeFile(path.join(maestroDir, "README.md"), readme);
}

async function generateDetoxConfig(
  projectPath: string,
  projectName: string
): Promise<void> {
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
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/${projectName}.app',
      build: 'xcodebuild -workspace ios/${projectName}.xcworkspace -scheme ${projectName} -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
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

  // Create e2e directory with jest config and example test
  const e2eDir = path.join(projectPath, "e2e");
  await fs.ensureDir(e2eDir);

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

  const exampleTest = `import { device, element, by, expect } from 'detox';

describe('Example', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should show welcome screen', async () => {
    await expect(element(by.text('Welcome to React Native!'))).toBeVisible();
  });
});
`;

  await fs.writeFile(path.join(e2eDir, "starter.test.ts"), exampleTest);
}

async function generateOxlintConfig(projectPath: string): Promise<void> {
  const config = {
    $schema:
      "https://raw.githubusercontent.com/oxc-project/oxc/main/crates/oxc_linter/src/schema.json",
    plugins: ["typescript", "react", "react-hooks", "jsx-a11y", "jest"],
    rules: {
      "no-unused-vars": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
    ignore: ["node_modules", "android", "ios", "dist"],
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
      ignore: ["node_modules", "android", "ios", "dist"],
    },
  };

  await fs.writeJSON(path.join(projectPath, "biome.json"), config, {
    spaces: 2,
  });
}

async function generateLefthookConfig(
  projectPath: string,
  options: RNCliScaffoldOptions
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
  const convexDir = path.join(projectPath, "convex");
  await fs.ensureDir(convexDir);

  const schemaContent = `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tasks: defineTable({
    text: v.string(),
    isCompleted: v.boolean(),
  }),
});
`;

  await fs.writeFile(path.join(convexDir, "schema.ts"), schemaContent);

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

  // Create Convex provider
  const providersDir = path.join(projectPath, "src", "providers");
  await fs.ensureDir(providersDir);

  const providerContent = `import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.CONVEX_URL as string);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProvider client={convex}>
      {children}
    </ConvexProvider>
  );
}
`;

  await fs.writeFile(path.join(providersDir, "convex.tsx"), providerContent);
}

async function generateSupabaseSetup(projectPath: string): Promise<void> {
  const libDir = path.join(projectPath, "src", "lib");
  await fs.ensureDir(libDir);

  const supabaseClientContent = `import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

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

async function generateEnvTemplate(
  projectPath: string,
  options: RNCliScaffoldOptions
): Promise<void> {
  const envLines: string[] = [
    "# Environment Variables",
    "# Copy this file to .env and fill in your values",
    "",
  ];

  // Backend
  if (options.backend === "supabase" || options.auth === "supabase-auth") {
    envLines.push("# Supabase");
    envLines.push("SUPABASE_URL=");
    envLines.push("SUPABASE_ANON_KEY=");
    envLines.push("");
  }

  if (options.backend === "convex") {
    envLines.push("# Convex");
    envLines.push("CONVEX_URL=");
    envLines.push("");
  }

  if (options.backend === "firebase") {
    envLines.push("# Firebase");
    envLines.push("# Firebase config is in google-services.json (Android)");
    envLines.push("# and GoogleService-Info.plist (iOS)");
    envLines.push("");
  }

  // Auth
  if (options.auth === "clerk") {
    envLines.push("# Clerk");
    envLines.push("CLERK_PUBLISHABLE_KEY=");
    envLines.push("");
  }

  if (options.auth === "better-auth") {
    envLines.push("# Better Auth");
    envLines.push("BETTER_AUTH_URL=");
    envLines.push("");
  }

  await fs.writeFile(
    path.join(projectPath, ".env.example"),
    envLines.join("\n")
  );

  await fs.writeFile(path.join(projectPath, ".env"), envLines.join("\n"));
}

// ============================================================================
// Next Steps Builder
// ============================================================================

/**
 * Build list of next steps for the user
 */
function buildNextSteps(options: RNCliScaffoldOptions): string[] {
  const steps: string[] = [];

  steps.push(`cd ${options.projectName}`);

  // Environment setup
  if (options.backend || options.auth) {
    steps.push("Copy .env.example to .env and fill in your values");
  }

  // iOS pod install
  if (process.platform === "darwin") {
    steps.push("Run `cd ios && pod install && cd ..` to install iOS dependencies");
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

  // Fastlane setup
  if (options.deployment === "fastlane") {
    steps.push("Install Fastlane: `gem install fastlane` or `brew install fastlane`");
    steps.push("Update fastlane/Appfile with your app identifiers");
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
  steps.push(`Run \`${runCmd} start\` to start Metro bundler`);
  steps.push("Run `${runCmd} ios` or `${runCmd} android` to start the app");

  return steps;
}

// ============================================================================
// Exports
// ============================================================================

export {
  buildReactNativeInitArgs,
  collectAdditionalDependencies,
  buildNextSteps,
};
