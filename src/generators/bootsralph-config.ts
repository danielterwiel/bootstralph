/**
 * Bootsralph config generator
 *
 * Creates .bootsralph/config.json with stack configuration, version, and metadata.
 */

import { writeJson, ensureDir } from "../utils/fs.js";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * Stack configuration for bootsralph
 *
 * This interface defines the complete technology stack configuration
 * that will be persisted in .bootsralph/config.json
 */
export interface StackConfig {
  /** Package manager (bun, pnpm, npm, yarn) */
  packageManager: "bun" | "pnpm" | "npm" | "yarn";

  /** Framework detected (nextjs, expo, tanstack-start, astro, hono, elysia) */
  framework?: string | null;

  /** Authentication provider (clerk, supabase-auth) */
  auth?: string | null;

  /** Database/Backend (postgres, supabase, firebase, mysql, sqlite, mongodb) */
  database?: string | null;

  /** Styling framework (tailwind, styled-components, emotion, css-modules, sass) */
  styling?: string | null;

  /** Testing framework (vitest, jest, playwright, cypress) */
  testing?: string | null;

  /** Deployment platform (vercel, cloudflare) */
  deployment?: string | null;

  /** Tooling configuration */
  tooling?: {
    /** Whether linting is configured */
    linting?: boolean;
    /** Whether formatting is configured */
    formatting?: boolean;
    /** Whether TypeScript is used */
    hasTypeScript?: boolean;
    /** Whether tests are configured */
    hasTests?: boolean;
  };
}

/**
 * Shape of .bootsralph/config.json
 */
interface BootsralphConfig {
  /** Config format version */
  version: string;
  /** ISO timestamp when config was created */
  createdAt: string;
  /** Stack configuration */
  stack: StackConfig;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Current config format version
 * Increment this when making breaking changes to the config structure
 */
const CONFIG_VERSION = "1.0.0";

// ============================================================================
// Generator Function
// ============================================================================

/**
 * Generate .bootsralph/config.json with stack configuration
 *
 * Creates .bootsralph/ directory and writes config.json with version,
 * creation timestamp, and stack configuration.
 *
 * @param stackConfig - Stack configuration to persist
 * @param outputDir - Directory where .bootsralph/ should be created (default: cwd)
 * @returns Promise resolving to the path of the generated config.json
 *
 * @example
 * ```typescript
 * const config: StackConfig = {
 *   packageManager: "bun",
 *   framework: "nextjs",
 *   auth: "clerk",
 *   database: "supabase",
 *   styling: "tailwind",
 *   testing: "vitest",
 *   deployment: "vercel",
 *   tooling: {
 *     linting: true,
 *     formatting: true,
 *     hasTypeScript: true,
 *     hasTests: true,
 *   },
 * };
 *
 * const configPath = await generateBootsralphConfig(config);
 * console.log(`Generated: ${configPath}`);
 * ```
 *
 * @example
 * ```typescript
 * // Minimal config
 * const minimalConfig: StackConfig = {
 *   packageManager: "npm",
 * };
 *
 * await generateBootsralphConfig(minimalConfig, "/path/to/project");
 * ```
 */
export async function generateBootsralphConfig(
  stackConfig: StackConfig,
  outputDir: string = process.cwd()
): Promise<string> {
  // Step 1: Ensure .bootsralph directory exists
  const bootsralphDir = join(outputDir, ".bootsralph");
  await ensureDir(bootsralphDir);

  // Step 2: Build config object
  const config: BootsralphConfig = {
    version: CONFIG_VERSION,
    createdAt: new Date().toISOString(),
    stack: stackConfig,
  };

  // Step 3: Write config.json
  const configPath = join(bootsralphDir, "config.json");
  await writeJson(configPath, config, { spaces: 2 });

  return configPath;
}
