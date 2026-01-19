/**
 * Ralph skill generator
 *
 * Generates .ralph-tui/skills/bootsralph-stack/SKILL.md from Handlebars template
 * based on the detected or configured stack.
 */

import Handlebars from "handlebars";
import { readFile, writeFile, ensureDir } from "../utils/fs.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { StackConfig } from "../types.js";

// ============================================================================
// Types
// ============================================================================

// Re-export StackConfig for convenience
export type { StackConfig } from "../types.js";

/**
 * Template variables for Handlebars compilation
 */
interface RalphSkillTemplateVars {
  packageManager: string;
  framework: string | null;
  auth: string | null;
  database: string | null;
  styling: string | null;
  testing: string | null;
  deployment: string | null;
  linting: boolean;
  formatting: boolean;
  hasTypeScript: boolean;
  hasTests: boolean;
}

// ============================================================================
// Template Path Resolution
// ============================================================================

/**
 * Get the path to the ralph-skill.md.hbs template
 *
 * Resolves the template path relative to the bundled file location.
 * In dist: templates are copied to dist/templates/
 */
function getTemplatePath(): string {
  // In ESM, we need to get the current file's directory
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFilePath);

  // Templates are copied to dist/templates/ during build
  // From dist/index.js -> templates/ralph-skill.md.hbs
  return join(currentDir, "templates/ralph-skill.md.hbs");
}

// ============================================================================
// Handlebars Helpers
// ============================================================================

/**
 * Register custom Handlebars helpers for template compilation
 */
function registerHelpers(): void {
  // Register 'eq' helper for equality comparison in templates
  // Usage: {{#if (eq framework "nextjs")}}...{{/if}}
  Handlebars.registerHelper("eq", function (a: unknown, b: unknown) {
    return a === b;
  });
}

// ============================================================================
// Generator Function
// ============================================================================

/**
 * Generate ralph skill documentation from template and stack config
 *
 * Reads the Handlebars template, compiles it with variables mapped from
 * StackConfig, and writes the result to .ralph-tui/skills/bootsralph-stack/SKILL.md
 * in the specified directory.
 *
 * @param config - Stack configuration containing detected stack and tooling settings
 * @param outputDir - Directory where .ralph-tui/skills/bootsralph-stack/ should be created (default: cwd)
 * @returns Promise resolving to the path of the generated SKILL.md
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
 * const outputPath = await generateRalphSkill(config);
 * console.log(`Generated: ${outputPath}`);
 * ```
 *
 * @example
 * ```typescript
 * // Minimal config (no framework detected)
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
 * await generateRalphSkill(minimalConfig, "/path/to/project");
 * ```
 */
export async function generateRalphSkill(
  config: StackConfig,
  outputDir: string = process.cwd()
): Promise<string> {
  // Step 0: Register Handlebars helpers
  registerHelpers();

  // Step 1: Read the Handlebars template
  const templatePath = getTemplatePath();
  const templateContent = await readFile(templatePath);

  // Step 2: Compile the template
  const template = Handlebars.compile(templateContent);

  // Step 3: Map StackConfig to template variables
  const templateVars: RalphSkillTemplateVars = {
    packageManager: config.packageManager,
    framework: config.framework ?? null,
    auth: config.auth ?? null,
    database: config.database ?? null,
    styling: config.styling ?? null,
    testing: config.testing ?? null,
    deployment: config.deployment ?? null,
    linting: config.tooling?.linting ?? false,
    formatting: config.tooling?.formatting ?? false,
    hasTypeScript: config.tooling?.hasTypeScript ?? false,
    hasTests: config.tooling?.hasTests ?? false,
  };

  // Step 4: Render the template
  const rendered = template(templateVars);

  // Step 5: Ensure output directory exists
  const skillsDir = join(outputDir, ".ralph-tui/skills/bootsralph-stack");
  await ensureDir(skillsDir);

  // Step 6: Write to SKILL.md
  const outputPath = join(skillsDir, "SKILL.md");
  await writeFile(outputPath, rendered);

  return outputPath;
}
