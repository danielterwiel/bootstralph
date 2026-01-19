/**
 * Shared types across the bootstralph codebase
 *
 * This file contains type definitions that are used by multiple modules
 * to ensure consistency and avoid duplication.
 *
 * @module types
 */

// ============================================================================
// Stack Configuration Types
// ============================================================================

/**
 * Stack configuration for bootstralph
 *
 * This interface defines the complete technology stack configuration
 * that is persisted in .bootstralph/config.json and used throughout
 * the application for generating config files, skills, and documentation.
 */
export interface StackConfig {
  /** Package manager (bun, pnpm, npm, yarn) */
  packageManager: "bun" | "pnpm" | "npm" | "yarn";

  /** Framework detected (nextjs, expo, tanstack-start, astro, hono, elysia) */
  framework?: string | null;

  /** Authentication provider (clerk, supabase-auth) */
  auth?: string | null;

  /** Database/Backend (postgres, supabase, firebase, mysql, sqlite, mongodb) */
  database?: string | null;

  /** Styling framework (tailwind, styled-components, emotion, css-modules, sass) */
  styling?: string | null;

  /** Testing framework (vitest, jest, playwright, cypress) */
  testing?: string | null;

  /** Deployment platform (vercel, cloudflare) */
  deployment?: string | null;

  /** Tooling configuration */
  tooling?: {
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
 * Package manager type
 * Supported package managers for project scaffolding
 */
export type PackageManager = "bun" | "pnpm" | "npm" | "yarn";
