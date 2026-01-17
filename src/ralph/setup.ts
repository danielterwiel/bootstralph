/**
 * Ralph setup orchestration
 * Orchestrates the complete Ralph setup process including:
 * - CLAUDE.md generation
 * - Skills installation via openskills
 * - Git hooks configuration (Lefthook/Husky/prek)
 * - Claude Code settings (.claude/settings.json)
 * - Docker sandbox configuration
 *
 * This is the main entry point for setting up Ralph on a scaffolded project.
 */

import * as p from "@clack/prompts";
import type {
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
import {
  writeClaudeMd,
  type ClaudeMdConfig,
} from "./claudemd.js";
import {
  installSkills,
  isOpenskillsInstalled,
  installOpenskills,
  type SkillsConfig,
} from "./skills.js";
import {
  writeHooksConfig,
  type HooksConfig,
} from "./hooks.js";
import {
  writeClaudeSettings,
  createClaudeSettingsConfig,
} from "./settings.js";
import {
  writeSandboxConfig,
  detectDockerEnvironment,
  writeAllSandboxConfigs,
  type DockerEnvironment,
} from "./sandbox.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for Ralph setup
 * Contains all the information needed to configure Ralph for a project
 */
export interface RalphSetupConfig {
  /** Project name */
  projectName: string;
  /** Project directory path */
  projectPath: string;
  /** Target platform */
  platform: Platform;
  /** Framework used */
  framework: Framework;
  /** Styling approach */
  styling?: Styling;
  /** State management choices */
  state?: StateManagement[];
  /** ORM choice */
  orm?: ORM;
  /** Backend service */
  backend?: Backend;
  /** Auth provider */
  auth?: AuthProvider;
  /** Deployment target */
  deployment?: DeploymentTarget;
  /** Linter choice */
  linter: Linter;
  /** Formatter choice */
  formatter: Formatter;
  /** Unit testing framework */
  unitTesting: UnitTestFramework;
  /** E2E testing framework */
  e2eTesting?: E2ETestFramework;
  /** Pre-commit tool */
  preCommit: PreCommitTool;
  /** Package manager */
  packageManager: "bun" | "pnpm" | "npm" | "yarn";
}

/**
 * Options for Ralph setup
 */
export interface RalphSetupOptions {
  /** Project configuration */
  config: RalphSetupConfig;
  /** Skip skills installation */
  skipSkills?: boolean;
  /** Skip Docker configuration */
  skipDocker?: boolean;
  /** Skip hooks configuration */
  skipHooks?: boolean;
  /** Skip Claude Code settings */
  skipSettings?: boolean;
  /** Skip CLAUDE.md generation */
  skipClaudeMd?: boolean;
  /** Install hooks after generating config */
  installHooks?: boolean;
  /** Overwrite existing files */
  overwrite?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Docker environment to configure (auto-detect if not provided) */
  dockerEnvironment?: DockerEnvironment;
  /** Write all Docker configurations (sandbox, devcontainer, compose) */
  allDockerConfigs?: boolean;
}

/**
 * Result of Ralph setup
 */
export interface RalphSetupResult {
  success: boolean;
  /** Files that were created or modified */
  filesWritten: string[];
  /** Skills that were installed */
  skillsInstalled: string[];
  /** Skills that failed to install */
  skillsFailed: string[];
  /** Any warnings during setup */
  warnings: string[];
  /** Any errors during setup */
  errors: string[];
  /** Next steps for the user */
  nextSteps: string[];
}

/**
 * Individual step result for tracking
 */
interface StepResult {
  name: string;
  success: boolean;
  filesWritten?: string[];
  warnings?: string[];
  errors?: string[];
  nextSteps?: string[];
}

// ============================================================================
// Setup Functions
// ============================================================================

/**
 * Set up CLAUDE.md for the project
 */
async function setupClaudeMd(
  config: RalphSetupConfig,
  overwrite: boolean
): Promise<StepResult> {
  const claudeMdConfig: ClaudeMdConfig = {
    projectName: config.projectName,
    platform: config.platform,
    framework: config.framework,
    linter: config.linter,
    formatter: config.formatter,
    unitTesting: config.unitTesting,
    preCommit: config.preCommit,
    packageManager: config.packageManager,
  };

  // Add optional properties
  if (config.styling) claudeMdConfig.styling = config.styling;
  if (config.state && config.state.length > 0) claudeMdConfig.state = config.state;
  if (config.orm) claudeMdConfig.orm = config.orm;
  if (config.backend) claudeMdConfig.backend = config.backend;
  if (config.auth) claudeMdConfig.auth = config.auth;
  if (config.deployment) claudeMdConfig.deployment = config.deployment;
  if (config.e2eTesting) claudeMdConfig.e2eTesting = config.e2eTesting;

  const result = await writeClaudeMd({
    projectPath: config.projectPath,
    config: claudeMdConfig,
    overwrite,
  });

  if (result.success) {
    return {
      name: "CLAUDE.md",
      success: true,
      filesWritten: [result.filePath],
    };
  }

  return {
    name: "CLAUDE.md",
    success: false,
    errors: [result.error ?? "Unknown error writing CLAUDE.md"],
  };
}

/**
 * Set up skills via openskills
 */
async function setupSkills(
  config: RalphSetupConfig,
  verbose: boolean
): Promise<StepResult> {
  // Check if openskills is installed
  const openskillsAvailable = await isOpenskillsInstalled();

  if (!openskillsAvailable) {
    // Try to install openskills
    const installResult = await installOpenskills();
    if (!installResult.success) {
      return {
        name: "Skills",
        success: false,
        errors: [
          installResult.error ??
            "Failed to install openskills. Run 'npm install -g openskills' manually.",
        ],
        warnings: ["Skills installation skipped - openskills not available"],
      };
    }
  }

  // Build skills config
  const skillsConfig: SkillsConfig = {
    framework: config.framework,
  };
  if (config.backend) skillsConfig.backend = config.backend;
  if (config.orm) skillsConfig.orm = config.orm;
  if (config.auth) skillsConfig.auth = config.auth;
  if (config.styling) skillsConfig.styling = config.styling;

  // Install skills
  const result = await installSkills({
    projectPath: config.projectPath,
    config: skillsConfig,
    verbose,
  });

  const stepResult: StepResult = {
    name: "Skills",
    success: result.success,
  };

  if (result.agentsMdSynced) {
    stepResult.filesWritten = ["AGENTS.md"];
  }

  if (result.failedSkills.length > 0) {
    stepResult.warnings = result.failedSkills.map(
      (f) => `Failed to install skill '${f.name}': ${f.error}`
    );
  }

  if (result.error) {
    stepResult.errors = [result.error];
  }

  return stepResult;
}

/**
 * Set up git hooks configuration
 */
async function setupHooks(
  config: RalphSetupConfig,
  overwrite: boolean,
  installHooks: boolean
): Promise<StepResult> {
  const hooksConfig: HooksConfig = {
    preCommitTool: config.preCommit,
    linter: config.linter,
    formatter: config.formatter,
    framework: config.framework,
    packageManager: config.packageManager,
    includeTypecheck: true,
    includeCommitlint: false,
  };

  const result = await writeHooksConfig({
    projectPath: config.projectPath,
    config: hooksConfig,
    overwrite,
    installHooks,
  });

  const stepResult: StepResult = {
    name: "Git Hooks",
    success: result.success,
    filesWritten: result.filesWritten,
  };

  if (result.warnings && result.warnings.length > 0) {
    stepResult.warnings = result.warnings;
  }
  if (result.manualSteps && result.manualSteps.length > 0) {
    stepResult.nextSteps = result.manualSteps;
  }
  if (result.error) {
    stepResult.errors = [result.error];
  }

  return stepResult;
}

/**
 * Set up Claude Code settings
 */
async function setupSettings(
  config: RalphSetupConfig,
  overwrite: boolean
): Promise<StepResult> {
  // Build settings config conditionally for exactOptionalPropertyTypes
  const settingsOptions: {
    projectName: string;
    framework: Framework;
    orm?: ORM;
    backend?: Backend;
    auth?: AuthProvider;
    usePreToolUseHooks?: boolean;
  } = {
    projectName: config.projectName,
    framework: config.framework,
    usePreToolUseHooks: true,
  };
  if (config.orm) settingsOptions.orm = config.orm;
  if (config.backend) settingsOptions.backend = config.backend;
  if (config.auth) settingsOptions.auth = config.auth;

  const settingsConfig = createClaudeSettingsConfig(settingsOptions);

  const result = await writeClaudeSettings({
    projectPath: config.projectPath,
    config: settingsConfig,
    overwrite,
    generateLocal: true,
    updateGitignore: true,
  });

  const stepResult: StepResult = {
    name: "Claude Settings",
    success: result.success,
    filesWritten: result.filesWritten,
  };

  if (result.warnings && result.warnings.length > 0) {
    stepResult.warnings = result.warnings;
  }
  if (result.error) {
    stepResult.errors = [result.error];
  }

  return stepResult;
}

/**
 * Set up Docker sandbox configuration
 */
async function setupDocker(
  config: RalphSetupConfig,
  overwrite: boolean,
  environment?: DockerEnvironment,
  allConfigs?: boolean
): Promise<StepResult> {
  // Auto-detect environment if not provided
  let targetEnvironment = environment;
  if (!targetEnvironment) {
    const detection = await detectDockerEnvironment();
    targetEnvironment = detection.environment;
  }

  // If no Docker available, return with warning
  if (targetEnvironment === "none") {
    return {
      name: "Docker Sandbox",
      success: true, // Not a failure, just skipped
      warnings: [
        "Docker not available. Install Docker Desktop for sandbox support.",
        "See: https://www.docker.com/products/docker-desktop/",
      ],
    };
  }

  // Write all configs or just the detected one
  const result = allConfigs
    ? await writeAllSandboxConfigs({
        projectPath: config.projectPath,
        projectName: config.projectName,
        overwrite,
        includeNetworkFiltering: false,
      })
    : await writeSandboxConfig({
        projectPath: config.projectPath,
        projectName: config.projectName,
        environment: targetEnvironment,
        overwrite,
        includeNetworkFiltering: false,
      });

  const stepResult: StepResult = {
    name: "Docker Sandbox",
    success: result.success,
    filesWritten: result.filesWritten,
  };

  if (result.warnings && result.warnings.length > 0) {
    stepResult.warnings = result.warnings;
  }
  if (result.nextSteps && result.nextSteps.length > 0) {
    stepResult.nextSteps = result.nextSteps;
  }
  if (result.error) {
    stepResult.errors = [result.error];
  }

  return stepResult;
}

// ============================================================================
// Main Orchestration
// ============================================================================

/**
 * Run the complete Ralph setup process
 * This is the main entry point for setting up Ralph on a scaffolded project
 */
export async function setupRalph(options: RalphSetupOptions): Promise<RalphSetupResult> {
  const {
    config,
    skipSkills = false,
    skipDocker = false,
    skipHooks = false,
    skipSettings = false,
    skipClaudeMd = false,
    installHooks = false,
    overwrite = false,
    verbose = false,
    dockerEnvironment,
    allDockerConfigs = false,
  } = options;

  // Track all results
  const allFilesWritten: string[] = [];
  const allWarnings: string[] = [];
  const allErrors: string[] = [];
  const allNextSteps: string[] = [];
  let skillsInstalled: string[] = [];
  let skillsFailed: string[] = [];
  let overallSuccess = true;

  // Helper to process step results
  const processStepResult = (result: StepResult) => {
    if (!result.success) {
      overallSuccess = false;
    }
    if (result.filesWritten) {
      allFilesWritten.push(...result.filesWritten);
    }
    if (result.warnings) {
      allWarnings.push(...result.warnings);
    }
    if (result.errors) {
      allErrors.push(...result.errors);
    }
    if (result.nextSteps) {
      allNextSteps.push(...result.nextSteps);
    }
  };

  // Step 1: Generate CLAUDE.md
  if (!skipClaudeMd) {
    if (verbose) p.log.step("Generating CLAUDE.md...");
    const claudeMdResult = await setupClaudeMd(config, overwrite);
    processStepResult(claudeMdResult);
    if (verbose && claudeMdResult.success) {
      p.log.success("CLAUDE.md generated");
    }
  }

  // Step 2: Install skills
  if (!skipSkills) {
    if (verbose) p.log.step("Installing skills via openskills...");
    const skillsResult = await setupSkills(config, verbose);
    processStepResult(skillsResult);

    // Track installed/failed skills
    if (skillsResult.filesWritten?.includes("AGENTS.md")) {
      // Skills were synced, we consider this successful
      skillsInstalled = []; // We don't track individual skills here
    }
    if (skillsResult.warnings) {
      // Extract failed skill names from warnings
      skillsFailed = skillsResult.warnings
        .filter((w) => w.startsWith("Failed to install skill"))
        .map((w) => {
          const match = w.match(/skill '([^']+)'/);
          return match ? match[1] : "";
        })
        .filter((s): s is string => s !== "");
    }

    if (verbose && skillsResult.success) {
      p.log.success("Skills installed");
    }
  }

  // Step 3: Configure git hooks
  if (!skipHooks) {
    if (verbose) p.log.step(`Configuring ${config.preCommit} hooks...`);
    const hooksResult = await setupHooks(config, overwrite, installHooks);
    processStepResult(hooksResult);
    if (verbose && hooksResult.success) {
      p.log.success("Git hooks configured");
    }
  }

  // Step 4: Configure Claude Code settings
  if (!skipSettings) {
    if (verbose) p.log.step("Configuring Claude Code settings...");
    const settingsResult = await setupSettings(config, overwrite);
    processStepResult(settingsResult);
    if (verbose && settingsResult.success) {
      p.log.success("Claude Code settings configured");
    }
  }

  // Step 5: Configure Docker sandbox
  if (!skipDocker) {
    if (verbose) p.log.step("Configuring Docker sandbox...");
    const dockerResult = await setupDocker(
      config,
      overwrite,
      dockerEnvironment,
      allDockerConfigs
    );
    processStepResult(dockerResult);
    if (verbose && dockerResult.success) {
      p.log.success("Docker sandbox configured");
    }
  }

  // Add common next steps
  if (allNextSteps.length === 0 && overallSuccess) {
    allNextSteps.push(`cd ${config.projectName}`);
    allNextSteps.push(`${config.packageManager} install`);
    allNextSteps.push(`${config.packageManager === "npm" ? "npm run" : config.packageManager} dev`);
  }

  return {
    success: overallSuccess,
    filesWritten: allFilesWritten,
    skillsInstalled,
    skillsFailed,
    warnings: allWarnings,
    errors: allErrors,
    nextSteps: allNextSteps,
  };
}

/**
 * Run Ralph setup with interactive progress display
 * Shows a spinner for each step and displays results
 */
export async function setupRalphInteractive(
  options: RalphSetupOptions
): Promise<RalphSetupResult> {
  const {
    config,
    skipSkills = false,
    skipDocker = false,
    skipHooks = false,
    skipSettings = false,
    skipClaudeMd = false,
    installHooks = false,
    overwrite = false,
    dockerEnvironment,
    allDockerConfigs = false,
  } = options;

  // Track all results
  const allFilesWritten: string[] = [];
  const allWarnings: string[] = [];
  const allErrors: string[] = [];
  const allNextSteps: string[] = [];
  let skillsInstalled: string[] = [];
  let skillsFailed: string[] = [];
  let overallSuccess = true;

  // Define steps
  interface Step {
    name: string;
    message: string;
    skip: boolean;
    run: () => Promise<StepResult>;
  }

  const steps: Step[] = [
    {
      name: "claudemd",
      message: "Generating CLAUDE.md",
      skip: skipClaudeMd,
      run: () => setupClaudeMd(config, overwrite),
    },
    {
      name: "skills",
      message: "Installing skills via openskills",
      skip: skipSkills,
      run: () => setupSkills(config, false),
    },
    {
      name: "hooks",
      message: `Configuring ${config.preCommit} hooks`,
      skip: skipHooks,
      run: () => setupHooks(config, overwrite, installHooks),
    },
    {
      name: "settings",
      message: "Configuring Claude Code settings",
      skip: skipSettings,
      run: () => setupSettings(config, overwrite),
    },
    {
      name: "docker",
      message: "Configuring Docker sandbox",
      skip: skipDocker,
      run: () => setupDocker(config, overwrite, dockerEnvironment, allDockerConfigs),
    },
  ];

  // Run each step
  for (const step of steps) {
    if (step.skip) continue;

    const spinner = p.spinner();
    spinner.start(step.message);

    try {
      const result = await step.run();

      if (result.success) {
        spinner.stop(`${step.message} ✓`);
      } else {
        spinner.stop(`${step.message} ✗`);
        overallSuccess = false;
      }

      // Collect results
      if (result.filesWritten) {
        allFilesWritten.push(...result.filesWritten);
      }
      if (result.warnings) {
        allWarnings.push(...result.warnings);
      }
      if (result.errors) {
        allErrors.push(...result.errors);
      }
      if (result.nextSteps) {
        allNextSteps.push(...result.nextSteps);
      }

      // Track skills
      if (step.name === "skills" && result.warnings) {
        skillsFailed = result.warnings
          .filter((w) => w.startsWith("Failed to install skill"))
          .map((w) => {
            const match = w.match(/skill '([^']+)'/);
            return match ? match[1] : "";
          })
          .filter((s): s is string => s !== "");
      }
    } catch (error) {
      spinner.stop(`${step.message} ✗`);
      overallSuccess = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      allErrors.push(`${step.name}: ${errorMessage}`);
    }
  }

  // Add common next steps
  if (allNextSteps.length === 0 && overallSuccess) {
    allNextSteps.push(`cd ${config.projectName}`);
    allNextSteps.push(`${config.packageManager} install`);
    allNextSteps.push(`${config.packageManager === "npm" ? "npm run" : config.packageManager} dev`);
  }

  return {
    success: overallSuccess,
    filesWritten: allFilesWritten,
    skillsInstalled,
    skillsFailed,
    warnings: allWarnings,
    errors: allErrors,
    nextSteps: allNextSteps,
  };
}

/**
 * Quick setup for Ralph - minimal configuration
 * Uses sensible defaults and skips optional components
 */
export async function setupRalphQuick(
  projectPath: string,
  projectName: string,
  framework: Framework,
  platform: Platform = "web"
): Promise<RalphSetupResult> {
  const config: RalphSetupConfig = {
    projectName,
    projectPath,
    platform,
    framework,
    linter: "oxlint",
    formatter: "oxfmt",
    unitTesting: platform === "mobile" ? "jest" : "vitest",
    preCommit: "lefthook",
    packageManager: "bun",
  };

  return setupRalph({
    config,
    skipSkills: true, // Skip skills for quick setup
    skipDocker: true, // Skip Docker for quick setup
    overwrite: false,
    verbose: false,
  });
}

/**
 * Add Ralph to an existing project
 * Detects project configuration from package.json and existing files
 */
export async function addRalphToExistingProject(
  projectPath: string,
  options?: Partial<RalphSetupOptions>
): Promise<RalphSetupResult> {
  // This is a placeholder for future implementation
  // Would detect framework, styling, etc. from existing project
  const config: RalphSetupConfig = {
    projectName: projectPath.split("/").pop() ?? "my-project",
    projectPath,
    platform: "web",
    framework: "nextjs", // Default, would be detected
    linter: "oxlint",
    formatter: "oxfmt",
    unitTesting: "vitest",
    preCommit: "lefthook",
    packageManager: "bun",
  };

  return setupRalph({
    config,
    ...options,
    overwrite: options?.overwrite ?? false,
  });
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Sub-module re-exports for direct access
  writeClaudeMd,
  installSkills,
  writeHooksConfig,
  writeClaudeSettings,
  writeSandboxConfig,
  detectDockerEnvironment,
};
