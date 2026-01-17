/**
 * Tooling selection prompt
 * Fifth step in the wizard - select development tooling (linting, formatting, testing, pre-commit)
 * Offers "recommended" preset vs "customize" for advanced users
 * Uses filtering logic to show only compatible options based on platform/framework
 */

import * as p from "@clack/prompts";
import {
  type Platform,
  type Framework,
  type Linter,
  type Formatter,
  type UnitTestFramework,
  type E2ETestFramework,
  type PreCommitTool,
  LINTERS,
  FORMATTERS,
  DEFAULTS,
} from "../compatibility/matrix.js";
import {
  getAvailableLinters,
  getAvailableFormatters,
  shouldShowFormatterQuestion,
  getAvailableUnitTesting,
  getAvailableE2ETesting,
  type FilteredOption,
} from "../compatibility/filters.js";

// ============================================================================
// Types
// ============================================================================

export interface ToolingResult {
  linter: Linter;
  formatter: Formatter;
  unitTesting: UnitTestFramework;
  e2eTesting?: E2ETestFramework;
  preCommit: PreCommitTool;
  isCustomized: boolean;
}

export interface ToolingPromptContext {
  platform: Platform;
  framework: Framework;
}

// ============================================================================
// Pre-commit Tool Configuration
// ============================================================================

interface PreCommitConfig {
  id: PreCommitTool;
  name: string;
  description: string;
}

const PRE_COMMIT_TOOLS: Record<PreCommitTool, PreCommitConfig> = {
  prek: {
    id: "prek",
    name: "prek",
    description: "Fastest (Rust), drop-in pre-commit replacement",
  },
  lefthook: {
    id: "lefthook",
    name: "Lefthook",
    description: "Fast (Go), simple config, good Turborepo integration",
  },
  husky: {
    id: "husky",
    name: "Husky",
    description: "Most popular, npm ecosystem native",
  },
};

// ============================================================================
// Main Prompt Function
// ============================================================================

/**
 * Prompt user to select development tooling
 * Offers quick "recommended" option or detailed customization
 * Returns the selected tooling or undefined if cancelled
 */
export async function promptTooling(
  context: ToolingPromptContext
): Promise<ToolingResult | undefined> {
  const { platform, framework } = context;

  // First, ask if user wants recommended or custom tooling
  const approachResult = await promptToolingApproach(platform);
  if (approachResult === null) return undefined;

  if (approachResult === "recommended") {
    return getRecommendedTooling(platform, framework);
  }

  // Custom tooling selection
  return promptCustomTooling(context);
}

// ============================================================================
// Approach Selection
// ============================================================================

/**
 * Ask user if they want recommended tooling or want to customize
 */
async function promptToolingApproach(
  platform: Platform
): Promise<"recommended" | "customize" | null> {
  const recommended = getRecommendedToolingSummary(platform);

  const result = await p.select({
    message: "How would you like to configure development tooling?",
    options: [
      {
        value: "recommended" as const,
        label: "Use Recommended (Recommended)",
        hint: recommended,
      },
      {
        value: "customize" as const,
        label: "Customize",
        hint: "Choose linter, formatter, testing, and pre-commit tools",
      },
    ],
    initialValue: "recommended" as const,
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result as "recommended" | "customize";
}

/**
 * Get summary of recommended tooling for display
 */
function getRecommendedToolingSummary(platform: Platform): string {
  const unitTest = DEFAULTS.unitTesting[platform];
  const e2eTest = DEFAULTS.e2eTesting[platform];

  const parts = [
    "oxlint",
    "oxfmt",
    unitTest === "vitest" ? "Vitest" : "Jest",
    e2eTest === "playwright" ? "Playwright" : "Maestro",
    "prek",
  ];

  return parts.join(" + ");
}

/**
 * Get default recommended tooling for a platform
 */
function getRecommendedTooling(
  platform: Platform,
  framework: Framework
): ToolingResult {
  const e2eOptions = getAvailableE2ETesting({ platform, framework });
  const hasE2E = e2eOptions.length > 0;

  const result: ToolingResult = {
    linter: DEFAULTS.linter,
    formatter: DEFAULTS.formatter,
    unitTesting: DEFAULTS.unitTesting[platform],
    preCommit: DEFAULTS.preCommit,
    isCustomized: false,
  };

  if (hasE2E) {
    result.e2eTesting = DEFAULTS.e2eTesting[platform];
  }

  return result;
}

// ============================================================================
// Custom Tooling Selection
// ============================================================================

/**
 * Prompt user to select each tooling option individually
 */
async function promptCustomTooling(
  context: ToolingPromptContext
): Promise<ToolingResult | undefined> {
  const { platform, framework } = context;

  // 1. Linter selection
  const linterResult = await promptLinter();
  if (linterResult === null) return undefined;

  // 2. Formatter selection (skip if Biome selected)
  let formatterResult: Formatter;
  if (shouldShowFormatterQuestion(linterResult)) {
    const formatter = await promptFormatter({ linter: linterResult });
    if (formatter === null) return undefined;
    formatterResult = formatter;
  } else {
    // Biome handles formatting
    formatterResult = "biome";
    p.log.info("Biome includes formatting - skipping formatter selection");
  }

  // 3. Unit testing selection
  const unitTestResult = await promptUnitTesting({ platform, framework });
  if (unitTestResult === null) return undefined;

  // 4. E2E testing selection (if available)
  const e2eOptions = getAvailableE2ETesting({ platform, framework });
  let e2eTestResult: E2ETestFramework | undefined;
  if (e2eOptions.length > 0) {
    const e2e = await promptE2ETesting({ platform, framework });
    if (e2e === null) return undefined;
    e2eTestResult = e2e;
  }

  // 5. Pre-commit tool selection
  const preCommitResult = await promptPreCommit();
  if (preCommitResult === null) return undefined;

  const result: ToolingResult = {
    linter: linterResult,
    formatter: formatterResult,
    unitTesting: unitTestResult,
    preCommit: preCommitResult,
    isCustomized: true,
  };

  if (e2eTestResult) {
    result.e2eTesting = e2eTestResult;
  }

  return result;
}

// ============================================================================
// Individual Tool Prompts
// ============================================================================

/**
 * Prompt for linter selection
 */
async function promptLinter(): Promise<Linter | null> {
  const availableOptions = getAvailableLinters();
  const options = buildSelectOptions(availableOptions);
  const recommended = availableOptions.find((o) => o.recommended);
  const initialValue = recommended?.value ?? availableOptions[0]!.value;

  const result = await p.select<Linter>({
    message: "Which linter would you like to use?",
    options,
    initialValue,
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result as Linter;
}

/**
 * Prompt for formatter selection
 * Only shown if linter is not Biome (which includes formatting)
 */
async function promptFormatter(
  context: { linter: Linter }
): Promise<Formatter | null> {
  const availableOptions = getAvailableFormatters(context);

  // Auto-select if only one option
  if (availableOptions.length === 1) {
    const formatter = availableOptions[0]!;
    p.log.info(`Auto-selected formatter: ${formatter.label}`);
    return formatter.value;
  }

  const options = buildSelectOptions(availableOptions);
  const recommended = availableOptions.find((o) => o.recommended);
  const initialValue = recommended?.value ?? availableOptions[0]!.value;

  const result = await p.select<Formatter>({
    message: "Which formatter would you like to use?",
    options,
    initialValue,
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result as Formatter;
}

/**
 * Prompt for unit testing framework selection
 */
async function promptUnitTesting(
  context: Pick<ToolingPromptContext, "platform" | "framework">
): Promise<UnitTestFramework | null> {
  const availableOptions = getAvailableUnitTesting(context);

  // Auto-select if only one option (common for mobile - Jest only)
  if (availableOptions.length === 1) {
    const testing = availableOptions[0]!;
    p.log.info(`Auto-selected unit testing: ${testing.label}`);
    return testing.value;
  }

  if (availableOptions.length === 0) {
    // Fallback to default for platform
    return DEFAULTS.unitTesting[context.platform];
  }

  const options = buildSelectOptions(availableOptions);
  const recommended = availableOptions.find((o) => o.recommended);
  const initialValue = recommended?.value ?? availableOptions[0]!.value;

  const result = await p.select<UnitTestFramework>({
    message: "Which unit testing framework would you like to use?",
    options,
    initialValue,
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result as UnitTestFramework;
}

/**
 * Prompt for E2E testing framework selection
 */
async function promptE2ETesting(
  context: Pick<ToolingPromptContext, "platform" | "framework">
): Promise<E2ETestFramework | null> {
  const availableOptions = getAvailableE2ETesting(context);

  if (availableOptions.length === 0) {
    return null;
  }

  // Auto-select if only one option
  if (availableOptions.length === 1) {
    const testing = availableOptions[0]!;
    p.log.info(`Auto-selected E2E testing: ${testing.label}`);
    return testing.value;
  }

  const options = buildSelectOptions(availableOptions);
  const recommended = availableOptions.find((o) => o.recommended);
  const initialValue = recommended?.value ?? availableOptions[0]!.value;

  const result = await p.select<E2ETestFramework>({
    message: "Which E2E testing framework would you like to use?",
    options,
    initialValue,
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result as E2ETestFramework;
}

/**
 * Prompt for pre-commit tool selection
 */
async function promptPreCommit(): Promise<PreCommitTool | null> {
  const options = (Object.keys(PRE_COMMIT_TOOLS) as PreCommitTool[]).map(
    (tool) => {
      const config = PRE_COMMIT_TOOLS[tool];
      const option: { value: PreCommitTool; label: string; hint?: string } = {
        value: tool,
        label: tool === DEFAULTS.preCommit
          ? `${config.name} (Recommended)`
          : config.name,
      };
      if (config.description) {
        option.hint = config.description;
      }
      return option;
    }
  );

  const result = await p.select<PreCommitTool>({
    message: "Which pre-commit hook tool would you like to use?",
    options,
    initialValue: DEFAULTS.preCommit,
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result as PreCommitTool;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build select options with proper typing for @clack/prompts
 */
function buildSelectOptions<T extends string>(
  options: FilteredOption<T>[]
): Array<{ value: T; label: string; hint?: string }> {
  return options.map((opt) => {
    const option: { value: T; label: string; hint?: string } = {
      value: opt.value,
      label: opt.recommended ? `${opt.label} (Recommended)` : opt.label,
    };
    if (opt.description) {
      option.hint = opt.description;
    }
    return option;
  });
}

/**
 * Get a summary of selected tooling for display
 */
export function getToolingSummary(tooling: ToolingResult): string[] {
  const summary: string[] = [];

  summary.push(`Linter: ${getLinterDisplayName(tooling.linter)}`);
  summary.push(`Formatter: ${getFormatterDisplayName(tooling.formatter)}`);
  summary.push(`Unit Testing: ${getUnitTestDisplayName(tooling.unitTesting)}`);

  if (tooling.e2eTesting) {
    summary.push(`E2E Testing: ${getE2ETestDisplayName(tooling.e2eTesting)}`);
  }

  summary.push(`Pre-commit: ${getPreCommitDisplayName(tooling.preCommit)}`);

  return summary;
}

function getLinterDisplayName(linter: Linter): string {
  return LINTERS[linter].name;
}

function getFormatterDisplayName(formatter: Formatter): string {
  return FORMATTERS[formatter].name;
}

function getUnitTestDisplayName(test: UnitTestFramework): string {
  const names: Record<UnitTestFramework, string> = {
    vitest: "Vitest",
    jest: "Jest",
  };
  return names[test];
}

function getE2ETestDisplayName(test: E2ETestFramework): string {
  const names: Record<E2ETestFramework, string> = {
    playwright: "Playwright",
    cypress: "Cypress",
    maestro: "Maestro",
    detox: "Detox",
  };
  return names[test];
}

function getPreCommitDisplayName(tool: PreCommitTool): string {
  return PRE_COMMIT_TOOLS[tool].name;
}

/**
 * Check if tooling uses Biome (all-in-one linter + formatter)
 */
export function usesBiome(tooling: ToolingResult): boolean {
  return tooling.linter === "biome";
}

/**
 * Check if tooling uses oxc tools (oxlint + oxfmt)
 */
export function usesOxcTools(tooling: ToolingResult): boolean {
  return tooling.linter === "oxlint" && tooling.formatter === "oxfmt";
}

/**
 * Get packages to install based on tooling selection
 */
export function getToolingPackages(tooling: ToolingResult): {
  devDependencies: string[];
  notes: string[];
} {
  const devDeps: string[] = [];
  const notes: string[] = [];

  // Linter packages
  switch (tooling.linter) {
    case "oxlint":
      devDeps.push("oxlint");
      break;
    case "biome":
      devDeps.push("@biomejs/biome");
      break;
    case "eslint":
      devDeps.push("eslint", "@eslint/js", "typescript-eslint");
      break;
  }

  // Formatter packages (skip if Biome)
  if (tooling.formatter !== "biome") {
    switch (tooling.formatter) {
      case "oxfmt":
        devDeps.push("oxfmt");
        notes.push("oxfmt is in alpha - fallback to Prettier if issues arise");
        break;
      case "prettier":
        devDeps.push("prettier");
        break;
    }
  }

  // Unit testing packages
  switch (tooling.unitTesting) {
    case "vitest":
      devDeps.push("vitest", "@vitest/ui");
      break;
    case "jest":
      devDeps.push("jest", "@types/jest", "ts-jest");
      break;
  }

  // E2E testing packages
  if (tooling.e2eTesting) {
    switch (tooling.e2eTesting) {
      case "playwright":
        devDeps.push("@playwright/test");
        notes.push("Run `npx playwright install` to install browsers");
        break;
      case "cypress":
        devDeps.push("cypress");
        break;
      case "maestro":
        notes.push("Install Maestro CLI: `curl -Ls https://get.maestro.mobile.dev | bash`");
        break;
      case "detox":
        devDeps.push("detox", "detox-cli");
        notes.push("Detox requires additional native setup");
        break;
    }
  }

  // Pre-commit packages
  switch (tooling.preCommit) {
    case "prek":
      notes.push("Install prek: `cargo install prek` or use prebuilt binaries");
      break;
    case "lefthook":
      devDeps.push("lefthook");
      break;
    case "husky":
      devDeps.push("husky", "lint-staged");
      break;
  }

  return { devDependencies: devDeps, notes };
}

/**
 * Get configuration files needed for tooling
 */
export function getToolingConfigFiles(tooling: ToolingResult): string[] {
  const files: string[] = [];

  // Linter config
  switch (tooling.linter) {
    case "oxlint":
      files.push(".oxlintrc.json");
      break;
    case "biome":
      files.push("biome.json");
      break;
    case "eslint":
      files.push("eslint.config.js");
      break;
  }

  // Formatter config (skip if Biome)
  if (tooling.formatter !== "biome") {
    switch (tooling.formatter) {
      case "prettier":
        files.push(".prettierrc", ".prettierignore");
        break;
      // oxfmt uses Prettier-compatible config or none
    }
  }

  // Testing config
  switch (tooling.unitTesting) {
    case "vitest":
      files.push("vitest.config.ts");
      break;
    case "jest":
      files.push("jest.config.js");
      break;
  }

  if (tooling.e2eTesting) {
    switch (tooling.e2eTesting) {
      case "playwright":
        files.push("playwright.config.ts");
        break;
      case "cypress":
        files.push("cypress.config.ts");
        break;
    }
  }

  // Pre-commit config
  switch (tooling.preCommit) {
    case "prek":
      files.push(".pre-commit-config.yaml");
      break;
    case "lefthook":
      files.push("lefthook.yml");
      break;
    case "husky":
      files.push(".husky/pre-commit", "lint-staged.config.js");
      break;
  }

  return files;
}
