/**
 * Docker sandbox configuration generator
 * Generates Docker configuration files for running Claude Code in containers
 *
 * Supports three approaches:
 * 1. Docker Desktop Sandbox (simplest) - `docker sandbox run claude`
 * 2. DevContainer (for VS Code users) - `.devcontainer/devcontainer.json`
 * 3. Custom Dockerfile (for CI/CD) - `docker-compose.yml` + `Dockerfile`
 */

import path from "node:path";
import fs from "fs-extra";
import { execa } from "execa";
import {
  generateDockerComposeYml,
  generateDockerfile,
  generateEnvExample,
  generateDevcontainerJson,
  generateStartClaudeScript,
  generateFirewallScript,
  generateDockerignore,
  type DockerComposeConfig,
} from "../templates/docker-compose.yml.js";

// ============================================================================
// Types
// ============================================================================

export type DockerEnvironment = 'sandbox' | 'devcontainer' | 'compose' | 'none';

export interface DockerDetectionResult {
  /** Detected Docker environment type */
  environment: DockerEnvironment;
  /** Whether Docker is installed */
  hasDocker: boolean;
  /** Whether Docker daemon is running */
  dockerRunning: boolean;
  /** Whether docker sandbox command is available (Docker Desktop feature) */
  hasSandbox: boolean;
  /** Whether VS Code is likely the user's environment */
  hasVSCode: boolean;
  /** Docker version if available */
  dockerVersion?: string;
  /** Recommendations for the user */
  recommendations: string[];
}

export interface WriteSandboxOptions {
  /** Project directory path */
  projectPath: string;
  /** Project name for container naming */
  projectName: string;
  /** Docker environment to configure for */
  environment: DockerEnvironment;
  /** Include network filtering capability */
  includeNetworkFiltering?: boolean;
  /** Additional environment variables */
  additionalEnvVars?: Record<string, string>;
  /** Overwrite existing configuration */
  overwrite?: boolean;
  /** Node.js version for containers */
  nodeVersion?: string;
}

export interface WriteSandboxResult {
  success: boolean;
  /** Files that were created or modified */
  filesWritten: string[];
  /** Any warnings during generation */
  warnings?: string[];
  /** Error message if failed */
  error?: string;
  /** Next steps for the user */
  nextSteps?: string[];
}

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Check if a command exists in PATH
 */
async function commandExists(command: string): Promise<boolean> {
  try {
    await execa('which', [command]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Docker daemon is running
 */
async function isDockerRunning(): Promise<boolean> {
  try {
    await execa('docker', ['info'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Docker version
 */
async function getDockerVersion(): Promise<string | undefined> {
  try {
    const result = await execa('docker', ['--version']);
    const stdout = typeof result.stdout === 'string' ? result.stdout : '';
    const match = stdout.match(/Docker version ([\d.]+)/);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check if docker sandbox command is available
 */
async function checkDockerSandbox(): Promise<boolean> {
  try {
    // docker sandbox is a Docker Desktop feature
    // Try to get help to see if it exists
    await execa('docker', ['sandbox', '--help'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the user's Docker environment and recommend the best approach
 */
export async function detectDockerEnvironment(): Promise<DockerDetectionResult> {
  const recommendations: string[] = [];

  // Check if Docker is installed
  const hasDocker = await commandExists('docker');
  if (!hasDocker) {
    return {
      environment: 'none',
      hasDocker: false,
      dockerRunning: false,
      hasSandbox: false,
      hasVSCode: false,
      recommendations: [
        'Docker is not installed. Please install Docker Desktop from:',
        'https://www.docker.com/products/docker-desktop/',
      ],
    };
  }

  // Check if Docker daemon is running
  const dockerRunning = await isDockerRunning();
  if (!dockerRunning) {
    return {
      environment: 'none',
      hasDocker: true,
      dockerRunning: false,
      hasSandbox: false,
      hasVSCode: false,
      recommendations: [
        'Docker is installed but not running.',
        'Please start Docker Desktop and try again.',
      ],
    };
  }

  // Get Docker version
  const dockerVersion = await getDockerVersion();

  // Check for docker sandbox (Docker Desktop feature)
  const hasSandbox = await checkDockerSandbox();

  // Check if VS Code is likely the environment
  const hasVSCode = process.env.TERM_PROGRAM === 'vscode' || await commandExists('code');

  // Determine best environment
  let environment: DockerEnvironment;

  if (hasSandbox) {
    environment = 'sandbox';
    recommendations.push('Docker Desktop sandbox detected - this is the simplest approach.');
    recommendations.push('Run: docker sandbox run claude');
  } else if (hasVSCode) {
    environment = 'devcontainer';
    recommendations.push('VS Code detected - DevContainer approach recommended.');
    recommendations.push('Open project in VS Code and reopen in container.');
  } else {
    environment = 'compose';
    recommendations.push('Using docker-compose approach for custom container setup.');
    recommendations.push('Run: docker compose up -d && docker compose exec claude-dev claude');
  }

  const result: DockerDetectionResult = {
    environment,
    hasDocker: true,
    dockerRunning: true,
    hasSandbox,
    hasVSCode,
    recommendations,
  };

  if (dockerVersion !== undefined) {
    result.dockerVersion = dockerVersion;
  }

  return result;
}

// ============================================================================
// File Generation
// ============================================================================

/**
 * Write sandbox configuration for docker sandbox approach
 */
async function writeSandboxConfig(
  projectPath: string,
  config: DockerComposeConfig,
  overwrite: boolean
): Promise<WriteSandboxResult> {
  const scriptPath = path.join(projectPath, 'start-claude.sh');
  const filesWritten: string[] = [];
  const warnings: string[] = [];
  const nextSteps: string[] = [];

  try {
    // Check if file exists
    if (!overwrite && await fs.pathExists(scriptPath)) {
      return {
        success: false,
        filesWritten: [],
        error: 'start-claude.sh already exists. Use overwrite option to replace.',
      };
    }

    // Write start script
    const scriptContent = generateStartClaudeScript(config);
    await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 });
    filesWritten.push('start-claude.sh');

    // Add next steps
    nextSteps.push('Run ./start-claude.sh to start Claude Code in Docker sandbox');
    nextSteps.push('Or use: docker sandbox run claude');

    const result: WriteSandboxResult = {
      success: true,
      filesWritten,
      nextSteps,
    };

    if (warnings.length > 0) {
      result.warnings = warnings;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      filesWritten,
      error: `Failed to write sandbox config: ${errorMessage}`,
    };
  }
}

/**
 * Write DevContainer configuration
 */
async function writeDevcontainerConfig(
  projectPath: string,
  config: DockerComposeConfig,
  overwrite: boolean
): Promise<WriteSandboxResult> {
  const devcontainerDir = path.join(projectPath, '.devcontainer');
  const devcontainerPath = path.join(devcontainerDir, 'devcontainer.json');
  const filesWritten: string[] = [];
  const warnings: string[] = [];
  const nextSteps: string[] = [];

  try {
    // Check if file exists
    if (!overwrite && await fs.pathExists(devcontainerPath)) {
      return {
        success: false,
        filesWritten: [],
        error: '.devcontainer/devcontainer.json already exists. Use overwrite option to replace.',
      };
    }

    // Create .devcontainer directory
    await fs.ensureDir(devcontainerDir);

    // Write devcontainer.json
    const content = generateDevcontainerJson(config);
    await fs.writeFile(devcontainerPath, content, 'utf-8');
    filesWritten.push('.devcontainer/devcontainer.json');

    // Add next steps
    nextSteps.push('Open project in VS Code');
    nextSteps.push('When prompted, click "Reopen in Container"');
    nextSteps.push('Or use: Cmd/Ctrl+Shift+P > "Dev Containers: Reopen in Container"');
    nextSteps.push('Once inside, run: claude --dangerously-skip-permissions');

    const result: WriteSandboxResult = {
      success: true,
      filesWritten,
      nextSteps,
    };

    if (warnings.length > 0) {
      result.warnings = warnings;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      filesWritten,
      error: `Failed to write devcontainer config: ${errorMessage}`,
    };
  }
}

/**
 * Write Docker Compose configuration
 */
async function writeComposeConfig(
  projectPath: string,
  config: DockerComposeConfig,
  overwrite: boolean
): Promise<WriteSandboxResult> {
  const composePath = path.join(projectPath, 'docker-compose.yml');
  const dockerfilePath = path.join(projectPath, 'Dockerfile');
  const envExamplePath = path.join(projectPath, '.env.example');
  const dockerignorePath = path.join(projectPath, '.dockerignore');
  const firewallPath = path.join(projectPath, 'firewall-setup.sh');
  const filesWritten: string[] = [];
  const warnings: string[] = [];
  const nextSteps: string[] = [];

  try {
    // Check if files exist
    if (!overwrite) {
      if (await fs.pathExists(composePath)) {
        return {
          success: false,
          filesWritten: [],
          error: 'docker-compose.yml already exists. Use overwrite option to replace.',
        };
      }
    }

    // Write docker-compose.yml
    const composeContent = generateDockerComposeYml(config);
    await fs.writeFile(composePath, composeContent, 'utf-8');
    filesWritten.push('docker-compose.yml');

    // Write Dockerfile
    const dockerfileContent = generateDockerfile(config);
    await fs.writeFile(dockerfilePath, dockerfileContent, 'utf-8');
    filesWritten.push('Dockerfile');

    // Write .env.example
    const envContent = generateEnvExample(config);
    await fs.writeFile(envExamplePath, envContent, 'utf-8');
    filesWritten.push('.env.example');

    // Write .dockerignore
    const dockerignoreContent = generateDockerignore();
    await fs.writeFile(dockerignorePath, dockerignoreContent, 'utf-8');
    filesWritten.push('.dockerignore');

    // Write firewall script if network filtering is enabled
    if (config.includeNetworkFiltering) {
      const firewallContent = generateFirewallScript();
      await fs.writeFile(firewallPath, firewallContent, { mode: 0o755 });
      filesWritten.push('firewall-setup.sh');
      warnings.push('Network filtering enabled. Run firewall-setup.sh inside container for domain whitelisting.');
    }

    // Update .gitignore to exclude .env
    const gitignorePath = path.join(projectPath, '.gitignore');
    const gitignoreEntries = ['.env', '.env.local', '!.env.example'];

    if (await fs.pathExists(gitignorePath)) {
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
      const newEntries = gitignoreEntries.filter(e => !gitignoreContent.includes(e));
      if (newEntries.length > 0) {
        const newContent = gitignoreContent.trimEnd() + '\n\n# Docker environment\n' + newEntries.join('\n') + '\n';
        await fs.writeFile(gitignorePath, newContent, 'utf-8');
        filesWritten.push('.gitignore (updated)');
      }
    }

    // Add next steps
    nextSteps.push('Copy .env.example to .env and add your ANTHROPIC_API_KEY');
    nextSteps.push('Run: docker compose build');
    nextSteps.push('Run: docker compose up -d');
    nextSteps.push('Run: docker compose exec claude-dev claude');

    const result: WriteSandboxResult = {
      success: true,
      filesWritten,
      nextSteps,
    };

    if (warnings.length > 0) {
      result.warnings = warnings;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      filesWritten,
      error: `Failed to write compose config: ${errorMessage}`,
    };
  }
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Write Docker sandbox configuration to project directory
 */
export async function writeSandboxConfig_main(
  options: WriteSandboxOptions
): Promise<WriteSandboxResult> {
  const {
    projectPath,
    projectName,
    environment,
    includeNetworkFiltering = false,
    additionalEnvVars = {},
    overwrite = false,
    nodeVersion = '20',
  } = options;

  // Verify project directory exists
  const projectExists = await fs.pathExists(projectPath);
  if (!projectExists) {
    return {
      success: false,
      filesWritten: [],
      error: `Project directory does not exist: ${projectPath}`,
    };
  }

  // Build config
  const config: DockerComposeConfig = {
    projectName,
    includeNetworkFiltering,
    additionalEnvVars,
    nodeVersion,
  };

  // Generate files based on environment
  switch (environment) {
    case 'sandbox':
      return writeSandboxConfig(projectPath, config, overwrite);
    case 'devcontainer':
      return writeDevcontainerConfig(projectPath, config, overwrite);
    case 'compose':
      return writeComposeConfig(projectPath, config, overwrite);
    case 'none':
      return {
        success: false,
        filesWritten: [],
        error: 'No Docker environment available. Please install Docker Desktop.',
      };
  }
}

/**
 * Write all Docker sandbox configurations (for users who want all options)
 */
export async function writeAllSandboxConfigs(
  options: Omit<WriteSandboxOptions, 'environment'>
): Promise<WriteSandboxResult> {
  const {
    projectPath,
    projectName,
    includeNetworkFiltering = false,
    additionalEnvVars = {},
    overwrite = false,
    nodeVersion = '20',
  } = options;

  const allFilesWritten: string[] = [];
  const allWarnings: string[] = [];
  const allNextSteps: string[] = [];

  // Build config
  const config: DockerComposeConfig = {
    projectName,
    includeNetworkFiltering,
    additionalEnvVars,
    nodeVersion,
  };

  // Write sandbox script
  const sandboxResult = await writeSandboxConfig(projectPath, config, overwrite);
  if (sandboxResult.success) {
    allFilesWritten.push(...sandboxResult.filesWritten);
    if (sandboxResult.warnings) allWarnings.push(...sandboxResult.warnings);
    if (sandboxResult.nextSteps) allNextSteps.push(...sandboxResult.nextSteps);
  }

  // Write devcontainer
  const devcontainerResult = await writeDevcontainerConfig(projectPath, config, overwrite);
  if (devcontainerResult.success) {
    allFilesWritten.push(...devcontainerResult.filesWritten);
    if (devcontainerResult.warnings) allWarnings.push(...devcontainerResult.warnings);
    if (devcontainerResult.nextSteps) allNextSteps.push(...devcontainerResult.nextSteps);
  }

  // Write compose config
  const composeResult = await writeComposeConfig(projectPath, config, overwrite);
  if (composeResult.success) {
    allFilesWritten.push(...composeResult.filesWritten);
    if (composeResult.warnings) allWarnings.push(...composeResult.warnings);
    if (composeResult.nextSteps) allNextSteps.push(...composeResult.nextSteps);
  }

  const result: WriteSandboxResult = {
    success: allFilesWritten.length > 0,
    filesWritten: allFilesWritten,
    nextSteps: ['Choose your preferred Docker approach:', ...allNextSteps],
  };

  if (allWarnings.length > 0) {
    result.warnings = allWarnings;
  }

  return result;
}

/**
 * Check if Docker sandbox configuration exists in a project
 */
export async function hasSandboxConfig(projectPath: string): Promise<{
  hasSandbox: boolean;
  hasDevcontainer: boolean;
  hasCompose: boolean;
}> {
  const [hasSandbox, hasDevcontainer, hasCompose] = await Promise.all([
    fs.pathExists(path.join(projectPath, 'start-claude.sh')),
    fs.pathExists(path.join(projectPath, '.devcontainer', 'devcontainer.json')),
    fs.pathExists(path.join(projectPath, 'docker-compose.yml')),
  ]);

  return { hasSandbox, hasDevcontainer, hasCompose };
}

/**
 * Get the recommended Docker setup for a user's environment
 */
export async function getRecommendedDockerSetup(): Promise<{
  environment: DockerEnvironment;
  reason: string;
  commands: string[];
}> {
  const detection = await detectDockerEnvironment();

  switch (detection.environment) {
    case 'sandbox':
      return {
        environment: 'sandbox',
        reason: 'Docker Desktop sandbox provides the simplest setup with automatic credential management.',
        commands: [
          'docker sandbox run claude',
          'docker sandbox run claude -c  # Continue previous conversation',
        ],
      };
    case 'devcontainer':
      return {
        environment: 'devcontainer',
        reason: 'VS Code DevContainer provides a seamless development experience.',
        commands: [
          'Open project in VS Code',
          'Click "Reopen in Container" when prompted',
          'Run: claude --dangerously-skip-permissions',
        ],
      };
    case 'compose':
      return {
        environment: 'compose',
        reason: 'Docker Compose provides full control over the container environment.',
        commands: [
          'cp .env.example .env',
          'docker compose build',
          'docker compose up -d',
          'docker compose exec claude-dev claude',
        ],
      };
    case 'none':
      return {
        environment: 'none',
        reason: detection.recommendations.join(' '),
        commands: [
          'Install Docker Desktop: https://www.docker.com/products/docker-desktop/',
        ],
      };
  }
}

// ============================================================================
// Re-exports
// ============================================================================

export {
  generateDockerComposeYml,
  generateDockerfile,
  generateEnvExample,
  generateDevcontainerJson,
  generateMinimalDevcontainerJson,
  generateStartClaudeScript,
  generateFirewallScript,
  generateDockerignore,
  type DockerComposeConfig,
} from "../templates/docker-compose.yml.js";

// Export main function with clearer name
export { writeSandboxConfig_main as writeSandboxConfig };
