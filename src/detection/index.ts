/**
 * Detection module entry point
 *
 * Orchestrates full stack detection flow by combining package scanning,
 * config file detection, and stack inference to identify the project's
 * technology stack.
 */

import { scanPackageJson } from "./package-scanner.js";
import { scanConfigFiles } from "./config-scanner.js";
import { inferStack, type DetectedStack } from "./stack-inferrer.js";
import type { DetectedConfig } from "../commands/init.js";
import { basename } from "node:path";

// ============================================================================
// Re-exports
// ============================================================================

export { scanPackageJson, type PackageScanResult } from "./package-scanner.js";
export { scanConfigFiles, CONFIG_PATTERNS } from "./config-scanner.js";
export {
  inferStack,
  type DetectedStack,
  type DetectedFeatures,
  type Framework,
  type AuthType,
  type Database,
  type Styling,
  type Testing,
} from "./stack-inferrer.js";

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect technology stack from project files
 *
 * Orchestrates the full detection flow:
 * 1. Scan package.json for dependencies and scripts
 * 2. Scan for configuration files
 * 3. Infer stack from combined signals
 *
 * @param cwd - Directory to analyze (default: process.cwd())
 * @returns Promise resolving to detected stack with confidence score
 *
 * @example
 * ```typescript
 * const stack = await detectStack();
 * console.log(`Framework: ${stack.framework}`);
 * console.log(`Auth: ${stack.features.auth}`);
 * console.log(`Database: ${stack.features.database}`);
 * console.log(`Confidence: ${(stack.confidence * 100).toFixed(1)}%`);
 * ```
 *
 * @example
 * ```typescript
 * // Detect a specific project directory
 * const stack = await detectStack("/path/to/project");
 * if (stack.confidence > 0.7) {
 *   console.log("High confidence detection");
 * }
 * ```
 */
export async function detectStack(
  cwd: string = process.cwd()
): Promise<DetectedStack> {
  // Step 1: Scan package.json
  const packageScan = await scanPackageJson(cwd);

  // Step 2: Scan for config files
  const configFiles = await scanConfigFiles(cwd);

  // Step 3: Infer stack from combined signals
  const stack = inferStack(packageScan, configFiles);

  return stack;
}

// ============================================================================
// Conversion Helpers
// ============================================================================

/**
 * Map detection framework to platform
 *
 * @internal
 */
function inferPlatform(
  framework: DetectedStack["framework"]
): DetectedConfig["platform"] {
  if (framework === "expo") return "mobile";
  if (framework === "hono" || framework === "elysia") return "api";
  // nextjs, tanstack-start, astro, or null → web
  return "web";
}

/**
 * Map confidence score to confidence level
 *
 * @internal
 */
function mapConfidenceLevel(
  score: number
): "high" | "medium" | "low" {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

/**
 * Detect package manager from lock files
 *
 * @internal
 */
async function detectPackageManager(
  cwd: string
): Promise<"bun" | "pnpm" | "npm" | "yarn"> {
  const { exists } = await import("../utils/fs.js");
  const { join } = await import("node:path");

  if (await exists(join(cwd, "bun.lockb"))) return "bun";
  if (await exists(join(cwd, "bun.lock"))) return "bun";
  if (await exists(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}

/**
 * Convert DetectedStack to DetectedConfig format
 *
 * Bridges the gap between the detection module's output and the
 * format expected by init command and other parts of the system.
 *
 * @param stack - Detected stack from detectStack()
 * @param projectPath - Path to the project directory
 * @param projectName - Name of the project (defaults to directory name)
 * @returns Promise resolving to DetectedConfig for use with init command
 *
 * @example
 * ```typescript
 * const stack = await detectStack();
 * const config = await detectedToConfig(stack, process.cwd());
 *
 * console.log(`Project: ${config.projectName}`);
 * console.log(`Platform: ${config.platform}`);
 * console.log(`Framework: ${config.framework}`);
 * ```
 *
 * @example
 * ```typescript
 * // Custom project name
 * const stack = await detectStack("/path/to/project");
 * const config = await detectedToConfig(
 *   stack,
 *   "/path/to/project",
 *   "my-awesome-app"
 * );
 * ```
 */
export async function detectedToConfig(
  stack: DetectedStack,
  projectPath: string,
  projectName?: string
): Promise<DetectedConfig> {
  const packageManager = await detectPackageManager(projectPath);
  const platform = inferPlatform(stack.framework);
  const confidence = mapConfidenceLevel(stack.confidence);

  const config: DetectedConfig = {
    projectName: projectName ?? basename(projectPath),
    projectPath,
    platform,
    framework: stack.framework,
    packageManager,
    confidence,
  };

  // Map detected features to config properties
  if (stack.features.auth) {
    // Map detection auth types to config auth types
    const authMap: Record<
      NonNullable<typeof stack.features.auth>,
      DetectedConfig["auth"]
    > = {
      clerk: "clerk",
      auth0: undefined, // Not in DetectedConfig type
      nextauth: undefined, // Not in DetectedConfig type
      "supabase-auth": "supabase-auth",
      "firebase-auth": undefined, // Not in DetectedConfig type
    };
    const mappedAuth = authMap[stack.features.auth];
    if (mappedAuth) {
      config.auth = mappedAuth;
    }
  }

  if (stack.features.database) {
    // Map detection database types to backend
    const backendMap: Record<
      NonNullable<typeof stack.features.database>,
      DetectedConfig["backend"]
    > = {
      postgres: undefined, // Raw DB, not a backend service
      mysql: undefined,
      sqlite: undefined,
      mongodb: undefined,
      supabase: "supabase",
      firebase: "firebase",
    };
    const mappedBackend = backendMap[stack.features.database];
    if (mappedBackend) {
      config.backend = mappedBackend;
    }
  }

  if (stack.features.styling) {
    // Map detection styling types to config styling types
    const stylingMap: Record<
      NonNullable<typeof stack.features.styling>,
      DetectedConfig["styling"]
    > = {
      tailwind: "tailwind",
      "styled-components": undefined, // Not in DetectedConfig type
      emotion: undefined,
      "css-modules": undefined,
      sass: undefined,
    };
    const mappedStyling = stylingMap[stack.features.styling];
    if (mappedStyling) {
      config.styling = mappedStyling;
    }
  }

  if (stack.features.testing) {
    // Map testing framework
    const testingMap: Record<
      NonNullable<typeof stack.features.testing>,
      DetectedConfig["unitTesting"]
    > = {
      vitest: "vitest",
      jest: "jest",
      playwright: undefined, // E2E, not unit testing
      cypress: undefined, // E2E, not unit testing
    };
    const mappedTesting = testingMap[stack.features.testing];
    if (mappedTesting) {
      config.unitTesting = mappedTesting;
    }

    // Map E2E testing
    const e2eMap: Record<
      NonNullable<typeof stack.features.testing>,
      DetectedConfig["e2eTesting"]
    > = {
      vitest: undefined, // Unit testing, not E2E
      jest: undefined, // Unit testing, not E2E
      playwright: "playwright",
      cypress: "cypress",
    };
    const mappedE2E = e2eMap[stack.features.testing];
    if (mappedE2E) {
      config.e2eTesting = mappedE2E;
    }
  }

  return config;
}
