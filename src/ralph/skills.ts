/**
 * Skills installation via openskills CLI
 * Manages the installation of Claude Code skills based on project configuration
 *
 * openskills is CLI-only (no programmatic API), so we use execa to spawn commands.
 */

import path from "node:path";
import { execa } from "execa";
import fs from "fs-extra";
import {
  getSkillsForConfig,
  type SkillDefinition,
  type Framework,
  type Backend,
  type ORM,
  type AuthProvider,
  type Styling,
} from "../compatibility/matrix.js";

// ============================================================================
// Types
// ============================================================================

export interface SkillsConfig {
  /** Project framework */
  framework: Framework;
  /** Backend service (optional) */
  backend?: Backend;
  /** ORM choice (optional) */
  orm?: ORM;
  /** Auth provider (optional) */
  auth?: AuthProvider;
  /** Styling approach (optional) */
  styling?: Styling;
}

export interface InstallSkillsOptions {
  /** Project directory path */
  projectPath: string;
  /** Configuration to determine which skills to install */
  config: SkillsConfig;
  /** Skip confirmation prompts (for non-interactive mode) */
  skipConfirmation?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

export interface InstallSkillsResult {
  success: boolean;
  /** Skills that were successfully installed */
  installedSkills: string[];
  /** Skills that failed to install */
  failedSkills: Array<{ name: string; error: string }>;
  /** Whether AGENTS.md was synced */
  agentsMdSynced: boolean;
  /** Error message if installation failed completely */
  error?: string;
}

export interface SkillInfo {
  name: string;
  source: string;
  description?: string;
  installed: boolean;
}

// ============================================================================
// Marketplace Sources
// ============================================================================

/**
 * Known skill marketplaces that should be added before installing skills
 */
const KNOWN_MARKETPLACES = [
  "anthropics/skills",
  "vercel-labs/agent-skills",
  "obra/superpowers",
  "expo/skills",
] as const;

/**
 * Map skill sources to their marketplace repositories
 */
function getMarketplaceForSource(source: string): string | null {
  // Direct mappings for known marketplaces
  if (KNOWN_MARKETPLACES.some((m) => source.includes(m))) {
    return source;
  }

  // Extract marketplace from common patterns
  // e.g., "@jezweb/claude-skills" -> "jezweb/claude-skills"
  // e.g., "FastMCP marketplace" -> null (needs special handling)
  if (source.startsWith("@")) {
    return source.slice(1);
  }

  // Handle community/custom sources
  if (source.includes("/")) {
    return source;
  }

  // Unknown or special sources
  return null;
}

// ============================================================================
// Openskills CLI Helpers
// ============================================================================

/**
 * Check if openskills CLI is installed globally
 */
export async function isOpenskillsInstalled(): Promise<boolean> {
  try {
    await execa("openskills", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Install openskills globally via npm
 */
export async function installOpenskills(): Promise<{ success: boolean; error?: string }> {
  try {
    await execa("npm", ["install", "-g", "openskills"], { stdio: "inherit" });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to install openskills: ${errorMessage}` };
  }
}

/**
 * Helper to safely get string from execa output
 */
function getOutputString(output: string | Uint8Array | unknown[] | undefined): string {
  if (output === undefined) return "";
  if (typeof output === "string") return output;
  if (output instanceof Uint8Array) return new TextDecoder().decode(output);
  return "";
}

/**
 * Add a marketplace to openskills
 */
async function addMarketplace(
  marketplace: string,
  options: { cwd: string; verbose?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await execa("openskills", ["marketplace", "add", marketplace], {
      cwd: options.cwd,
      reject: false,
    });

    if (result.exitCode !== 0) {
      const stderr = getOutputString(result.stderr);
      const stdout = getOutputString(result.stdout);
      // Marketplace might already be added - that's OK
      if (stderr.includes("already") || stdout.includes("already")) {
        return { success: true };
      }
      return { success: false, error: stderr || "Unknown error" };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Install a single skill via openskills CLI
 */
async function installSkill(
  skillName: string,
  source: string,
  options: { cwd: string; verbose?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Format: openskills install <source/skill-name> or openskills install <skill-name>@<source>
    // The exact format depends on the skill source
    let installArg: string;

    const marketplace = getMarketplaceForSource(source);
    if (marketplace) {
      // If we have a marketplace, use source/skill format
      installArg = `${marketplace}/${skillName}`;
    } else {
      // For community skills without clear marketplace, try skill name directly
      installArg = skillName;
    }

    const result = await execa("openskills", ["install", installArg], {
      cwd: options.cwd,
      reject: false,
    });

    if (result.exitCode !== 0) {
      const stderr = getOutputString(result.stderr);
      const stdout = getOutputString(result.stdout);
      // Check if skill is already installed
      if (stderr.includes("already installed") || stdout.includes("already installed")) {
        return { success: true };
      }
      return { success: false, error: stderr || stdout || "Unknown error" };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Run openskills sync to generate/update AGENTS.md
 */
async function syncAgentsMd(options: { cwd: string }): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await execa("openskills", ["sync"], {
      cwd: options.cwd,
      reject: false,
    });

    if (result.exitCode !== 0) {
      const stderr = getOutputString(result.stderr);
      return { success: false, error: stderr || "Unknown error" };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * List installed skills in a project
 */
export async function listInstalledSkills(projectPath: string): Promise<string[]> {
  try {
    const result = await execa("openskills", ["list"], {
      cwd: projectPath,
      reject: false,
    });

    if (result.exitCode !== 0) {
      return [];
    }

    // Parse output - openskills list outputs one skill per line
    const stdout = getOutputString(result.stdout);
    const skills = stdout
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0 && !line.startsWith("#"));

    return skills;
  } catch {
    return [];
  }
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Convert SkillsConfig to the format expected by getSkillsForConfig
 */
function configToRecord(config: SkillsConfig): Record<string, string> {
  const record: Record<string, string> = {
    framework: config.framework,
  };

  if (config.backend) record.backend = config.backend;
  if (config.orm) record.orm = config.orm;
  if (config.auth) record.auth = config.auth;
  if (config.styling) record.styling = config.styling;

  return record;
}

/**
 * Get the list of skills that should be installed for a configuration
 */
export function getSkillsToInstall(config: SkillsConfig): SkillDefinition[] {
  return getSkillsForConfig(configToRecord(config));
}

/**
 * Get unique marketplaces needed for a set of skills
 */
function getRequiredMarketplaces(skills: SkillDefinition[]): string[] {
  const marketplaces = new Set<string>();

  for (const skill of skills) {
    const marketplace = getMarketplaceForSource(skill.source);
    if (marketplace) {
      // Extract base marketplace (e.g., "vercel-labs/agent-skills" from "vercel-labs/agent-skills/skill-name")
      const parts = marketplace.split("/");
      if (parts.length >= 2) {
        marketplaces.add(`${parts[0]}/${parts[1]}`);
      }
    }
  }

  // Always add the known core marketplaces
  for (const known of KNOWN_MARKETPLACES) {
    marketplaces.add(known);
  }

  return Array.from(marketplaces);
}

/**
 * Install all skills for a project configuration
 */
export async function installSkills(options: InstallSkillsOptions): Promise<InstallSkillsResult> {
  const { projectPath, config, verbose = false } = options;

  // Verify openskills is installed
  const openskillsAvailable = await isOpenskillsInstalled();
  if (!openskillsAvailable) {
    return {
      success: false,
      installedSkills: [],
      failedSkills: [],
      agentsMdSynced: false,
      error:
        "openskills CLI is not installed. Run 'npm install -g openskills' to install it.",
    };
  }

  // Verify project directory exists
  const projectExists = await fs.pathExists(projectPath);
  if (!projectExists) {
    return {
      success: false,
      installedSkills: [],
      failedSkills: [],
      agentsMdSynced: false,
      error: `Project directory does not exist: ${projectPath}`,
    };
  }

  // Get skills to install
  const skills = getSkillsToInstall(config);

  if (skills.length === 0) {
    // No skills to install, but still sync AGENTS.md
    const syncResult = await syncAgentsMd({ cwd: projectPath });
    return {
      success: true,
      installedSkills: [],
      failedSkills: [],
      agentsMdSynced: syncResult.success,
    };
  }

  // Add required marketplaces
  const marketplaces = getRequiredMarketplaces(skills);
  for (const marketplace of marketplaces) {
    const result = await addMarketplace(marketplace, { cwd: projectPath, verbose });
    if (!result.success && verbose) {
      console.warn(`Warning: Could not add marketplace ${marketplace}: ${result.error}`);
    }
  }

  // Install each skill
  const installedSkills: string[] = [];
  const failedSkills: Array<{ name: string; error: string }> = [];

  for (const skill of skills) {
    const result = await installSkill(skill.name, skill.source, { cwd: projectPath, verbose });

    if (result.success) {
      installedSkills.push(skill.name);
    } else {
      failedSkills.push({ name: skill.name, error: result.error || "Unknown error" });
    }
  }

  // Sync AGENTS.md
  const syncResult = await syncAgentsMd({ cwd: projectPath });

  return {
    success: failedSkills.length === 0,
    installedSkills,
    failedSkills,
    agentsMdSynced: syncResult.success,
  };
}

/**
 * Install a single skill by name
 */
export async function installSingleSkill(
  projectPath: string,
  skillName: string,
  source?: string
): Promise<{ success: boolean; error?: string }> {
  // Verify openskills is installed
  const openskillsAvailable = await isOpenskillsInstalled();
  if (!openskillsAvailable) {
    return {
      success: false,
      error: "openskills CLI is not installed. Run 'npm install -g openskills' to install it.",
    };
  }

  // Install the skill
  const result = await installSkill(skillName, source || skillName, { cwd: projectPath });

  if (result.success) {
    // Sync AGENTS.md after installation
    await syncAgentsMd({ cwd: projectPath });
  }

  return result;
}

/**
 * Get information about skills for a configuration (without installing)
 */
export async function getSkillsInfo(
  projectPath: string,
  config: SkillsConfig
): Promise<SkillInfo[]> {
  const skills = getSkillsToInstall(config);
  const installedSkills = await listInstalledSkills(projectPath);

  return skills.map((skill) => {
    const info: SkillInfo = {
      name: skill.name,
      source: skill.source,
      installed: installedSkills.includes(skill.name),
    };
    // Only add description if defined (for exactOptionalPropertyTypes)
    if (skill.description !== undefined) {
      info.description = skill.description;
    }
    return info;
  });
}

/**
 * Check if AGENTS.md exists in a project directory
 */
export async function hasAgentsMd(projectPath: string): Promise<boolean> {
  const filePath = path.join(projectPath, "AGENTS.md");
  return fs.pathExists(filePath);
}

/**
 * Read existing AGENTS.md content from a project directory
 */
export async function readAgentsMd(projectPath: string): Promise<string | null> {
  const filePath = path.join(projectPath, "AGENTS.md");

  try {
    if (await fs.pathExists(filePath)) {
      return fs.readFile(filePath, "utf-8");
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Exports
// ============================================================================

export { type SkillDefinition } from "../compatibility/matrix.js";
