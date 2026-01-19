/**
 * Base types and utilities for scaffolders
 * Shared across all framework scaffolders
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Result returned by all scaffold functions
 */
export interface ScaffoldResult {
  /** Whether the scaffold operation succeeded */
  success: boolean;
  /** Absolute path to the created project */
  projectPath: string;
  /** Errors encountered during scaffolding (empty if success) */
  errors?: string[];
  /** Non-fatal warnings */
  warnings?: string[];
  /** Suggested next steps for the user */
  nextSteps?: string[];
}

/**
 * Package manager options
 */
export type PackageManager = "bun" | "pnpm" | "npm" | "yarn";
