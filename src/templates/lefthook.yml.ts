/**
 * Lefthook configuration template generator
 * Generates lefthook.yml for pre-commit hooks based on project configuration
 *
 * Supports:
 * - oxlint, Biome, ESLint for linting
 * - oxfmt, Biome, Prettier for formatting
 * - TypeScript type checking
 * - Framework-specific patterns (React Native, Astro, etc.)
 */

import type {
  Linter,
  Formatter,
  Framework,
  UnitTestFramework,
} from "../compatibility/matrix.js";

// ============================================================================
// Types
// ============================================================================

export interface LefthookConfig {
  /** Linter to use */
  linter: Linter;
  /** Formatter to use */
  formatter: Formatter;
  /** Target framework (affects glob patterns) */
  framework: Framework;
  /** Unit testing framework (for test file patterns) */
  unitTesting?: UnitTestFramework;
  /** Enable parallel execution (default: true) */
  parallel?: boolean;
  /** Include typecheck in pre-commit (default: true) */
  includeTypecheck?: boolean;
  /** Include commit message validation (default: false) */
  includeCommitlint?: boolean;
  /** Skip formatting for Biome linter (since it handles both) */
  skipFormatForBiome?: boolean;
}

interface HookCommand {
  name: string;
  glob?: string;
  run: string;
  stageFixed?: boolean;
  priority?: number;
}

// ============================================================================
// Glob Patterns
// ============================================================================

/**
 * Get source file glob patterns based on framework
 */
function getSourceGlobPattern(framework: Framework): string {
  switch (framework) {
    case "astro":
      return "*.{js,jsx,ts,tsx,astro}";
    case "expo":
    case "react-native-cli":
      return "*.{js,jsx,ts,tsx}";
    default:
      return "*.{js,jsx,ts,tsx}";
  }
}

/**
 * Get all formattable file glob patterns
 */
function getFormatGlobPattern(framework: Framework): string {
  switch (framework) {
    case "astro":
      return "*.{js,jsx,ts,tsx,json,css,md,astro}";
    default:
      return "*.{js,jsx,ts,tsx,json,css,md}";
  }
}

// ============================================================================
// Command Builders
// ============================================================================

/**
 * Build lint command based on linter choice
 */
function buildLintCommand(linter: Linter, framework: Framework): HookCommand {
  const glob = getSourceGlobPattern(framework);

  switch (linter) {
    case "oxlint":
      return {
        name: "lint",
        glob,
        run: "npx oxlint --fix {staged_files}",
        stageFixed: true,
        priority: 1,
      };

    case "biome":
      return {
        name: "lint",
        glob,
        run: "npx biome check --write {staged_files}",
        stageFixed: true,
        priority: 1,
      };

    case "eslint":
      return {
        name: "lint",
        glob,
        run: "npx eslint --fix {staged_files}",
        stageFixed: true,
        priority: 1,
      };
  }
}

/**
 * Build format command based on formatter choice
 */
function buildFormatCommand(
  formatter: Formatter,
  framework: Framework
): HookCommand {
  const glob = getFormatGlobPattern(framework);

  switch (formatter) {
    case "oxfmt":
      return {
        name: "format",
        glob,
        run: "npx oxfmt {staged_files}",
        stageFixed: true,
        priority: 2,
      };

    case "biome":
      return {
        name: "format",
        glob,
        run: "npx biome format --write {staged_files}",
        stageFixed: true,
        priority: 2,
      };

    case "prettier":
      // Include Astro plugin if framework is Astro
      if (framework === "astro") {
        return {
          name: "format",
          glob,
          run: "npx prettier --write --plugin prettier-plugin-astro {staged_files}",
          stageFixed: true,
          priority: 2,
        };
      }
      return {
        name: "format",
        glob,
        run: "npx prettier --write {staged_files}",
        stageFixed: true,
        priority: 2,
      };
  }
}

/**
 * Build typecheck command
 */
function buildTypecheckCommand(): HookCommand {
  return {
    name: "typecheck",
    run: "npx tsc --noEmit",
    priority: 3,
  };
}

/**
 * Build commitlint command for commit-msg hook
 */
function buildCommitlintCommand(): string {
  return "npx commitlint --edit $1";
}

// ============================================================================
// YAML Generator
// ============================================================================

/**
 * Escape YAML string values that might need quoting
 */
function escapeYamlValue(value: string): string {
  // If contains special characters or starts with special chars, quote it
  if (
    value.includes("{") ||
    value.includes("}") ||
    value.includes(":") ||
    value.startsWith("*")
  ) {
    return `"${value}"`;
  }
  return value;
}

/**
 * Format a hook command as YAML
 */
function formatCommand(command: HookCommand, indent: number = 4): string {
  const spaces = " ".repeat(indent);
  const lines: string[] = [`${spaces}${command.name}:`];

  if (command.glob) {
    lines.push(`${spaces}  glob: ${escapeYamlValue(command.glob)}`);
  }

  lines.push(`${spaces}  run: ${command.run}`);

  if (command.stageFixed) {
    lines.push(`${spaces}  stage_fixed: true`);
  }

  return lines.join("\n");
}

/**
 * Generate lefthook.yml content
 */
export function generateLefthookYml(config: LefthookConfig): string {
  const {
    linter,
    formatter,
    framework,
    parallel = true,
    includeTypecheck = true,
    includeCommitlint = false,
    skipFormatForBiome = true,
  } = config;

  const lines: string[] = [];

  // Pre-commit hook
  lines.push("pre-commit:");
  if (parallel) {
    lines.push("  parallel: true");
  }
  lines.push("  commands:");

  // Lint command
  const lintCmd = buildLintCommand(linter, framework);
  lines.push(formatCommand(lintCmd));

  // Format command (skip if Biome handles both linting and formatting)
  const shouldSkipFormat = skipFormatForBiome && linter === "biome";
  if (!shouldSkipFormat) {
    const formatCmd = buildFormatCommand(formatter, framework);
    lines.push(formatCommand(formatCmd));
  }

  // Typecheck command
  if (includeTypecheck) {
    const typecheckCmd = buildTypecheckCommand();
    lines.push(formatCommand(typecheckCmd));
  }

  // Commit-msg hook (optional)
  if (includeCommitlint) {
    lines.push("");
    lines.push("commit-msg:");
    lines.push("  commands:");
    lines.push("    commitlint:");
    lines.push(`      run: ${buildCommitlintCommand()}`);
  }

  return lines.join("\n") + "\n";
}

// ============================================================================
// Framework-Specific Generators
// ============================================================================

/**
 * Generate Lefthook config for Next.js projects
 */
export function generateNextjsLefthook(config: Omit<LefthookConfig, "framework">): string {
  return generateLefthookYml({ ...config, framework: "nextjs" });
}

/**
 * Generate Lefthook config for TanStack Start projects
 */
export function generateTanStackLefthook(config: Omit<LefthookConfig, "framework">): string {
  return generateLefthookYml({ ...config, framework: "tanstack-start" });
}

/**
 * Generate Lefthook config for React Router v7 projects
 */
export function generateReactRouterLefthook(config: Omit<LefthookConfig, "framework">): string {
  return generateLefthookYml({ ...config, framework: "react-router" });
}

/**
 * Generate Lefthook config for Astro projects
 */
export function generateAstroLefthook(config: Omit<LefthookConfig, "framework">): string {
  return generateLefthookYml({ ...config, framework: "astro" });
}

/**
 * Generate Lefthook config for Expo projects
 */
export function generateExpoLefthook(config: Omit<LefthookConfig, "framework">): string {
  return generateLefthookYml({ ...config, framework: "expo" });
}

/**
 * Generate Lefthook config for React Native CLI projects
 */
export function generateRNCliLefthook(config: Omit<LefthookConfig, "framework">): string {
  return generateLefthookYml({ ...config, framework: "react-native-cli" });
}

/**
 * Generate Lefthook config for Hono projects
 */
export function generateHonoLefthook(config: Omit<LefthookConfig, "framework">): string {
  return generateLefthookYml({ ...config, framework: "hono" });
}

/**
 * Generate Lefthook config for Elysia projects
 */
export function generateElysiaLefthook(config: Omit<LefthookConfig, "framework">): string {
  return generateLefthookYml({ ...config, framework: "elysia" });
}

// ============================================================================
// Default Export
// ============================================================================

export default generateLefthookYml;
