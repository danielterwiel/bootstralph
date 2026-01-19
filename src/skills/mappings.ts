/**
 * Skill mappings loader for OpenSkills integration
 *
 * Loads and processes skill mappings that define which OpenSkills should be
 * installed based on detected packages and configuration files in the project.
 */

import { readJson } from "../utils/fs.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// Types
// ============================================================================

/**
 * Skill mapping definition
 *
 * Maps packages and configuration files to OpenSkills that should be installed.
 */
export interface SkillMapping {
  /** Skill identifier */
  skill: string;
  /** OpenSkills source URL */
  source: string;
  /** Runtime packages that trigger this skill */
  packages?: string[];
  /** Development packages that trigger this skill */
  devPackages?: string[];
  /** Configuration files that trigger this skill */
  configFiles?: string[];
  /** Frameworks that trigger this skill */
  frameworks?: string[];
}

/**
 * Required skill entry
 *
 * Represents a skill that should be installed along with the reason why.
 */
export interface RequiredSkill {
  /** Skill identifier */
  skill: string;
  /** OpenSkills source URL */
  source: string;
  /** Reason why this skill is required */
  reason: string;
}

/**
 * Skill mappings data file structure
 */
interface SkillMappingsData {
  /** Main skill mappings */
  mappings: SkillMapping[];
  /** Default skills always included */
  defaultSkills: Array<{
    skill: string;
    source: string;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default skills loaded from the mappings file
 * These skills are always included regardless of detected packages/configs
 */
export let DEFAULT_SKILLS: RequiredSkill[] = [];

// ============================================================================
// Mappings Loader
// ============================================================================

/**
 * Load skill mappings from data file
 *
 * Reads the skill-mappings.json file from the data directory and returns
 * the mapping definitions.
 *
 * @returns Promise resolving to array of skill mappings
 *
 * @example
 * ```typescript
 * const mappings = await loadMappings();
 * console.log(`Loaded ${mappings.length} skill mappings`);
 * ```
 */
export async function loadMappings(): Promise<SkillMapping[]> {
  // Get the path to the data directory
  // Data is copied to dist/data/ during build
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const dataPath = join(__dirname, "data/skill-mappings.json");

  // Load the mappings data
  const data = await readJson<SkillMappingsData>(dataPath);

  // Update DEFAULT_SKILLS from loaded data
  DEFAULT_SKILLS = (data.defaultSkills || []).map((s) => ({
    skill: s.skill,
    source: s.source,
    reason: "default",
  }));

  return data.mappings;
}

// ============================================================================
// Required Skills Computation
// ============================================================================

/**
 * Compute required skills based on dependencies, config files, and framework
 *
 * Analyzes the project's dependencies (both runtime and dev), configuration
 * files, and detected framework to determine which OpenSkills should be installed.
 * Always includes DEFAULT_SKILLS in the result.
 *
 * @param deps - Runtime dependencies from package.json
 * @param devDeps - Development dependencies from package.json
 * @param configFiles - Configuration file paths found in the project
 * @param framework - Optional detected framework name (e.g., "nextjs", "tanstack-start")
 * @returns Promise resolving to array of required skills with reasons
 *
 * @example
 * ```typescript
 * const deps = ["next", "react", "@clerk/nextjs"];
 * const devDeps = ["typescript", "tailwindcss"];
 * const configFiles = ["next.config.js", "tailwind.config.ts"];
 *
 * const required = await computeRequiredSkills(deps, devDeps, configFiles, "nextjs");
 * // Returns: [
 * //   { skill: "nextjs", source: "...", reason: "package: next" },
 * //   { skill: "clerk", source: "...", reason: "package: @clerk/nextjs" },
 * //   { skill: "tailwind", source: "...", reason: "package: tailwindcss" },
 * //   ...DEFAULT_SKILLS
 * // ]
 * ```
 *
 * @example
 * ```typescript
 * // From package scanner results
 * const packageScan = await scanPackageJson();
 * const configScan = await scanConfigFiles();
 *
 * const required = await computeRequiredSkills(
 *   packageScan.dependencies,
 *   packageScan.devDependencies,
 *   configScan,
 *   "tanstack-start"
 * );
 * ```
 */
export async function computeRequiredSkills(
  deps: string[],
  devDeps: string[],
  configFiles: string[],
  framework?: string | null
): Promise<RequiredSkill[]> {
  // Load mappings
  const mappings = await loadMappings();

  // Track required skills by skill name to avoid duplicates
  const skillMap = new Map<string, RequiredSkill>();

  // Check each mapping
  for (const mapping of mappings) {
    let matched = false;
    let matchReason = "";

    // Check runtime packages
    if (mapping.packages) {
      for (const pkg of mapping.packages) {
        if (deps.includes(pkg)) {
          matched = true;
          matchReason = `package: ${pkg}`;
          break;
        }
      }
    }

    // Check dev packages (if not already matched)
    if (!matched && mapping.devPackages) {
      for (const pkg of mapping.devPackages) {
        if (devDeps.includes(pkg)) {
          matched = true;
          matchReason = `devPackage: ${pkg}`;
          break;
        }
      }
    }

    // Check config files (if not already matched)
    if (!matched && mapping.configFiles) {
      for (const configPattern of mapping.configFiles) {
        // Check if any config file matches the pattern
        // Simple match: check if the pattern is contained in any config file path
        const matchedFile = configFiles.find((file) => {
          // Extract just the filename from the path
          const fileName = file.split("/").pop() || file;
          // Match exact filename or wildcard pattern
          if (configPattern.includes("*")) {
            // Simple wildcard matching
            const regexPattern = configPattern
              .replace(/\./g, "\\.")
              .replace(/\*/g, ".*");
            const regex = new RegExp(`^${regexPattern}$`);
            return regex.test(fileName);
          }
          return fileName === configPattern || file === configPattern;
        });

        if (matchedFile) {
          matched = true;
          matchReason = `config: ${matchedFile}`;
          break;
        }
      }
    }

    // Check frameworks (if not already matched)
    if (!matched && framework && mapping.frameworks) {
      if (mapping.frameworks.includes(framework)) {
        matched = true;
        matchReason = `framework: ${framework}`;
      }
    }

    // If matched, add to required skills
    if (matched) {
      skillMap.set(mapping.skill, {
        skill: mapping.skill,
        source: mapping.source,
        reason: matchReason,
      });
    }
  }

  // Convert map to array and add default skills
  const requiredSkills = Array.from(skillMap.values());

  // Add default skills if not already present
  for (const defaultSkill of DEFAULT_SKILLS) {
    if (!skillMap.has(defaultSkill.skill)) {
      requiredSkills.push(defaultSkill);
    }
  }

  return requiredSkills;
}
