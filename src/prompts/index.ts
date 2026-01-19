/**
 * Prompts module
 * Interactive wizard for collecting project configuration
 */

import * as p from "@clack/prompts";
import { promptProjectType } from "./project-type.js";
import { promptFramework } from "./framework.js";
import { promptFeatures } from "./features.js";
import { promptDeployment } from "./deployment.js";
import { promptTooling } from "./tooling.js";
import type { StackConfig } from "../generators/bootsralph-config.js";
import type {
  Target,
  Platform,
  Framework,
  Styling,
  StateManagement,
  ORM,
  Backend,
  AuthProvider,
  DeploymentTarget,
  Linter,
  Formatter,
  UnitTestFramework,
  E2ETestFramework,
  PreCommitTool,
} from "../compatibility/matrix.js";

// ============================================================================
// Re-exports
// ============================================================================

export { promptProjectType } from "./project-type.js";
export { promptFramework } from "./framework.js";
export { promptFeatures } from "./features.js";
export { promptDeployment } from "./deployment.js";
export { promptTooling } from "./tooling.js";

export type { ProjectTypeResult } from "./project-type.js";
export type { FrameworkResult } from "./framework.js";
export type { FeaturesResult } from "./features.js";
export type { DeploymentResult } from "./deployment.js";
export type { ToolingResult } from "./tooling.js";

// ============================================================================
// Wizard Result Types
// ============================================================================

/**
 * Complete result from the configuration wizard
 * Contains all user selections mapped to StackConfig format
 */
export interface WizardResult {
  /** Selected target platforms (web, ios, android, api) */
  targets: Target[];
  /** Derived platform (web, mobile, universal, api) */
  platform: Platform;
  /** Selected framework */
  framework: Framework;
  /** Selected styling solution */
  styling?: Styling;
  /** Selected state management solutions */
  state?: StateManagement[];
  /** Selected ORM */
  orm?: ORM;
  /** Selected backend */
  backend?: Backend;
  /** Selected auth provider */
  auth?: AuthProvider;
  /** Selected deployment target(s) */
  deployment?: DeploymentTarget;
  deployments?: DeploymentTarget[];
  /** Selected linter */
  linter: Linter;
  /** Selected formatter */
  formatter: Formatter;
  /** Selected unit test framework */
  unitTesting: UnitTestFramework;
  /** Selected e2e test framework */
  e2eTesting?: E2ETestFramework;
  /** Selected pre-commit tool */
  preCommit: PreCommitTool;
  /** Whether tooling was customized */
  isCustomized: boolean;
  /** Edge runtime warning if applicable */
  edgeWarning?: string;
}

/**
 * Options for running the wizard
 */
export interface WizardOptions {
  /** Starting step (for resuming wizard) */
  startAt?: "project-type" | "framework" | "features" | "deployment" | "tooling";
  /** Pre-selected values (for partial resume or defaults) */
  defaults?: Partial<WizardResult>;
  /** Package manager to use (defaults to detection or 'npm') */
  packageManager?: "bun" | "pnpm" | "npm" | "yarn";
}

// ============================================================================
// Main Wizard Function
// ============================================================================

/**
 * Run the complete configuration wizard
 *
 * Steps through all prompts in sequence:
 * 1. Project type (targets/platforms)
 * 2. Framework selection
 * 3. Features (styling, state, orm, backend, auth)
 * 4. Deployment target(s)
 * 5. Tooling (linter, formatter, testing, pre-commit)
 *
 * Returns complete configuration or undefined if cancelled
 *
 * @param options - Optional configuration for wizard behavior
 * @returns Promise resolving to WizardResult or undefined if cancelled
 *
 * @example
 * ```typescript
 * import { runWizard } from "./prompts/index.js";
 *
 * const result = await runWizard();
 * if (!result) {
 *   console.log("Wizard cancelled");
 *   return;
 * }
 *
 * console.log(`Creating ${result.framework} project...`);
 * ```
 *
 * @example
 * ```typescript
 * // With defaults
 * const result = await runWizard({
 *   packageManager: "bun",
 *   defaults: {
 *     targets: ["web"],
 *     framework: "nextjs",
 *   },
 * });
 * ```
 */
export async function runWizard(
  options: WizardOptions = {}
): Promise<WizardResult | undefined> {
  const { startAt = "project-type", defaults = {} } = options;

  // Show wizard introduction
  p.intro("Welcome to Bootsralph!");

  try {
    // Step 1: Project Type (Targets/Platform)
    let projectTypeResult = defaults.targets && defaults.platform
      ? { targets: defaults.targets, platform: defaults.platform }
      : undefined;

    if (!projectTypeResult && ["project-type"].includes(startAt)) {
      projectTypeResult = await promptProjectType();
      if (!projectTypeResult) {
        p.cancel("Wizard cancelled");
        return undefined;
      }
    }

    if (!projectTypeResult) {
      throw new Error("Project type is required");
    }

    const { targets, platform } = projectTypeResult;

    // Step 2: Framework
    let frameworkResult = defaults.framework
      ? { framework: defaults.framework }
      : undefined;

    if (!frameworkResult) {
      frameworkResult = await promptFramework(targets);
      if (!frameworkResult) {
        p.cancel("Wizard cancelled");
        return undefined;
      }
    }

    const { framework } = frameworkResult;

    // Step 3: Features (Styling, State, ORM, Backend, Auth)
    const featuresResult = await promptFeatures({
      platform,
      framework,
    });

    if (!featuresResult) {
      p.cancel("Wizard cancelled");
      return undefined;
    }

    const { styling, state, orm, backend, auth } = featuresResult;

    // Step 4: Deployment
    const deploymentContext: {
      framework: Framework;
      targets?: Target[];
      orm?: ORM;
    } = {
      framework,
      targets,
    };
    if (orm) {
      deploymentContext.orm = orm;
    }

    const deploymentResult = await promptDeployment(deploymentContext);

    if (!deploymentResult) {
      p.cancel("Wizard cancelled");
      return undefined;
    }

    const { deployment, deployments, edgeWarning } = deploymentResult;

    // Step 5: Tooling
    const toolingResult = await promptTooling({
      platform,
      framework,
    });

    if (!toolingResult) {
      p.cancel("Wizard cancelled");
      return undefined;
    }

    const { linter, formatter, unitTesting, e2eTesting, preCommit, isCustomized } =
      toolingResult;

    // Build complete result
    const result: WizardResult = {
      targets,
      platform,
      framework,
      linter,
      formatter,
      unitTesting,
      preCommit,
      isCustomized,
    };

    // Add optional properties only if they exist
    if (styling) result.styling = styling;
    if (state) result.state = state;
    if (orm) result.orm = orm;
    if (backend) result.backend = backend;
    if (auth) result.auth = auth;
    if (deployment) result.deployment = deployment;
    if (deployments) result.deployments = deployments;
    if (e2eTesting) result.e2eTesting = e2eTesting;
    if (edgeWarning) result.edgeWarning = edgeWarning;

    p.outro("Configuration complete!");

    return result;
  } catch (error) {
    if (error instanceof Error) {
      p.log.error(error.message);
    }
    p.cancel("Wizard failed");
    return undefined;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert WizardResult to StackConfig format
 *
 * Maps the detailed wizard result to the simpler StackConfig format
 * used for persistence in .bootsralph/config.json
 *
 * @param result - Complete wizard result
 * @param packageManager - Package manager to use (defaults to 'npm')
 * @returns StackConfig for persistence
 *
 * @example
 * ```typescript
 * const wizardResult = await runWizard();
 * if (wizardResult) {
 *   const config = wizardResultToStackConfig(wizardResult, "bun");
 *   await generateBootsralphConfig(config);
 * }
 * ```
 */
export function wizardResultToStackConfig(
  result: WizardResult,
  packageManager: "bun" | "pnpm" | "npm" | "yarn" = "npm"
): StackConfig {
  return {
    packageManager,
    framework: result.framework,
    auth: result.auth ?? null,
    database: result.backend ?? null,
    styling: result.styling ?? null,
    testing: result.unitTesting ?? null,
    deployment: result.deployment ?? null,
    tooling: {
      linting: !!result.linter,
      formatting: !!result.formatter,
      hasTypeScript: true, // Always true for new projects
      hasTests: !!result.unitTesting || !!result.e2eTesting,
    },
  };
}

/**
 * Run wizard and convert result to StackConfig in one step
 *
 * Convenience function that combines runWizard and wizardResultToStackConfig
 *
 * @param options - Wizard options including package manager
 * @returns Promise resolving to StackConfig or undefined if cancelled
 *
 * @example
 * ```typescript
 * const config = await runWizardAndConvert({ packageManager: "bun" });
 * if (config) {
 *   await generateBootsralphConfig(config);
 * }
 * ```
 */
export async function runWizardAndConvert(
  options: WizardOptions = {}
): Promise<StackConfig | undefined> {
  const result = await runWizard(options);
  if (!result) {
    return undefined;
  }

  const packageManager = options.packageManager ?? "npm";
  return wizardResultToStackConfig(result, packageManager);
}
