/**
 * Bootstralph config generator
 *
 * Creates .bootstralph/config.json with stack configuration, version, and metadata.
 */

import { writeJson, ensureDir } from "../utils/fs.js";
import { join } from "node:path";
import type { StackConfig } from "../types.js";

// ============================================================================
// Types
// ============================================================================

// Re-export StackConfig for convenience
export type { StackConfig } from "../types.js";

/**
 * Shape of .bootstralph/config.json
 */
interface BootstralphConfig {
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
 * Generate .bootstralph/config.json with stack configuration
 *
 * Creates .bootstralph/ directory and writes config.json with version,
 * creation timestamp, and stack configuration.
 *
 * @param stackConfig - Stack configuration to persist
 * @param outputDir - Directory where .bootstralph/ should be created (default: cwd)
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
 * const configPath = await generateBootstralphConfig(config);
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
 * await generateBootstralphConfig(minimalConfig, "/path/to/project");
 * ```
 */
export async function generateBootstralphConfig(
  stackConfig: StackConfig,
  outputDir: string = process.cwd(),
): Promise<string> {
  // Step 1: Ensure .bootstralph directory exists
  const bootstralphDir = join(outputDir, ".bootstralph");
  await ensureDir(bootstralphDir);

  // Step 2: Build config object
  const config: BootstralphConfig = {
    version: CONFIG_VERSION,
    createdAt: new Date().toISOString(),
    stack: stackConfig,
  };

  // Step 3: Write config.json
  const configPath = join(bootstralphDir, "config.json");
  await writeJson(configPath, config, { spaces: 2 });

  return configPath;
}
