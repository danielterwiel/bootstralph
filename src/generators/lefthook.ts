/**
 * Lefthook generator
 *
 * Generates lefthook.yml configuration file from Handlebars template
 * based on the detected or configured stack.
 */

import Handlebars from "handlebars";
import { readFile, writeFile } from "../utils/fs.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// Types
// ============================================================================

/**
 * Stack configuration for lefthook generation
 *
 * This is a simplified interface matching what the template expects.
 * Maps to DetectedConfig from detection/init modules.
 */
export interface StackConfig {
  /** Package manager (bun, pnpm, npm, yarn) */
  packageManager: "bun" | "pnpm" | "npm" | "yarn";
  /** Tooling configuration */
  tooling: {
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
 * Template variables for Handlebars compilation
 */
interface LefthookTemplateVars {
  packageManager: string;
  linting: boolean;
  formatting: boolean;
  hasTypeScript: boolean;
  hasTests: boolean;
}

// ============================================================================
// Template Path Resolution
// ============================================================================

/**
 * Get the path to the lefthook.yml.hbs template
 *
 * Resolves the template path relative to the project root,
 * supporting both development and built/packaged contexts.
 */
function getTemplatePath(): string {
  // In ESM, we need to get the current file's directory
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFilePath);

  // Navigate from src/generators/ to templates/
  // In dev: src/generators/lefthook.ts -> ../../templates/lefthook.yml.hbs
  // In dist: dist/generators/lefthook.js -> ../../templates/lefthook.yml.hbs
  return join(currentDir, "../../templates/lefthook.yml.hbs");
}

// ============================================================================
// Generator Function
// ============================================================================

/**
 * Generate lefthook.yml from template and stack config
 *
 * Reads the Handlebars template, compiles it with variables mapped from
 * StackConfig.tooling, and writes the result to lefthook.yml in the
 * specified directory.
 *
 * @param config - Stack configuration containing tooling settings
 * @param outputDir - Directory where lefthook.yml should be written (default: cwd)
 * @returns Promise resolving to the path of the generated lefthook.yml
 *
 * @example
 * ```typescript
 * const config: StackConfig = {
 *   packageManager: "bun",
 *   tooling: {
 *     linting: true,
 *     formatting: true,
 *     hasTypeScript: true,
 *     hasTests: true,
 *   },
 * };
 *
 * const outputPath = await generateLefthook(config);
 * console.log(`Generated: ${outputPath}`);
 * ```
 *
 * @example
 * ```typescript
 * // Minimal config (no linting/formatting)
 * const minimalConfig: StackConfig = {
 *   packageManager: "npm",
 *   tooling: {
 *     linting: false,
 *     formatting: false,
 *     hasTypeScript: false,
 *     hasTests: false,
 *   },
 * };
 *
 * await generateLefthook(minimalConfig, "/path/to/project");
 * ```
 */
export async function generateLefthook(
  config: StackConfig,
  outputDir: string = process.cwd()
): Promise<string> {
  // Step 1: Read the Handlebars template
  const templatePath = getTemplatePath();
  const templateContent = await readFile(templatePath);

  // Step 2: Compile the template
  const template = Handlebars.compile(templateContent);

  // Step 3: Map StackConfig.tooling to template variables
  const templateVars: LefthookTemplateVars = {
    packageManager: config.packageManager,
    linting: config.tooling.linting ?? false,
    formatting: config.tooling.formatting ?? false,
    hasTypeScript: config.tooling.hasTypeScript ?? false,
    hasTests: config.tooling.hasTests ?? false,
  };

  // Step 4: Render the template
  const rendered = template(templateVars);

  // Step 5: Write to lefthook.yml
  const outputPath = join(outputDir, "lefthook.yml");
  await writeFile(outputPath, rendered);

  return outputPath;
}
