/**
 * Config scanner for detecting configuration files
 *
 * Provides utilities for finding framework and tool configuration files
 * to help detect the technology stack.
 */

import fg from "fast-glob";

// ============================================================================
// Constants
// ============================================================================

/**
 * Mapping of config file patterns to their framework/feature
 *
 * This constant defines which configuration files indicate which technologies.
 * Patterns use glob syntax and are searched relative to the project root.
 */
export const CONFIG_PATTERNS = {
  // Next.js
  "next.config.*": "nextjs",
  // React Native / Expo
  "app.json": "react-native",
  "expo.config.*": "expo",
  // Drizzle ORM
  "drizzle.config.*": "drizzle",
  // Prisma ORM
  "prisma/schema.prisma": "prisma",
  // Docker
  "Dockerfile": "docker",
  "docker-compose.yml": "docker",
  "docker-compose.yaml": "docker",
  // Tailwind CSS
  "tailwind.config.*": "tailwind",
  // TypeScript
  "tsconfig.json": "typescript",
  // Vite
  "vite.config.*": "vite",
  // Astro
  "astro.config.*": "astro",
  // SvelteKit
  "svelte.config.*": "svelte",
  // Remix
  "remix.config.*": "remix",
  // Nuxt
  "nuxt.config.*": "nuxt",
  // Vue
  "vue.config.*": "vue",
  // ESLint
  ".eslintrc.*": "eslint",
  "eslint.config.*": "eslint",
  // Prettier
  ".prettierrc.*": "prettier",
  "prettier.config.*": "prettier",
  // Vitest
  "vitest.config.*": "vitest",
  // Jest
  "jest.config.*": "jest",
  // Playwright
  "playwright.config.*": "playwright",
  // tRPC
  "trpc.config.*": "trpc",
} as const;

// ============================================================================
// Config Scanner
// ============================================================================

/**
 * Scan for configuration files in the project
 *
 * Uses fast-glob to search for common configuration files that indicate
 * which frameworks and tools are being used in the project.
 *
 * @param cwd - Directory to search in (default: process.cwd())
 * @returns Promise resolving to array of found config file paths
 *
 * @example
 * ```typescript
 * const configFiles = await scanConfigFiles();
 * console.log("Found config files:", configFiles);
 * // ["next.config.js", "tailwind.config.ts", "tsconfig.json"]
 * ```
 *
 * @example
 * ```typescript
 * // Scan a specific directory
 * const configFiles = await scanConfigFiles("/path/to/project");
 * if (configFiles.some(f => f.includes("next.config"))) {
 *   console.log("Next.js project detected");
 * }
 * ```
 */
export async function scanConfigFiles(
  cwd: string = process.cwd()
): Promise<string[]> {
  // Get all config patterns to search for
  const patterns = Object.keys(CONFIG_PATTERNS);

  // Use fast-glob to find all matching files
  const files = await fg(patterns, {
    cwd,
    dot: true, // Include dotfiles like .eslintrc
    ignore: ["node_modules", ".git"], // Exclude common directories
    onlyFiles: true, // Only return files, not directories
  });

  return files;
}
