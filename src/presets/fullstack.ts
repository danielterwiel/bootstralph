/**
 * Fullstack/Monorepo Preset Configuration
 * Optimized for building full-stack monorepo applications with Turborepo
 */

import type { PresetConfig } from "./saas.js";

// ============================================================================
// Fullstack/Monorepo Preset Configuration
// ============================================================================

/**
 * Fullstack preset optimized for building production-ready monorepo applications
 *
 * Stack:
 * - Turborepo for monorepo management and build orchestration
 * - Next.js for web application (apps/web)
 * - Expo for mobile application (apps/mobile) - optional
 * - Shared packages (packages/ui, packages/db, packages/config)
 * - Bun workspaces for package management
 * - Drizzle ORM for type-safe database access (shared)
 * - Supabase for backend services
 * - better-auth for authentication (shared across apps)
 *
 * Features included:
 * - Monorepo structure with Turborepo
 * - Shared UI components package
 * - Shared database schema and client
 * - Shared configuration (TypeScript, ESLint, Tailwind)
 * - Full-stack type safety
 * - Modern testing with Vitest and Playwright
 * - Pre-commit hooks with prek for fast checks
 *
 * Note: Uses bun workspaces with Turborepo 2.6+ (Bun support stable)
 * Use `--cwd` flag for workspace-specific installs
 */
export const FULLSTACK_PRESET: PresetConfig = {
  id: "fullstack",
  name: "Fullstack Monorepo",
  description: "Turborepo monorepo with web + shared packages",
  platform: "web",
  framework: "nextjs",
  styling: "tailwind-shadcn",
  state: ["zustand", "tanstack-query"],
  orm: "drizzle",
  backend: "supabase",
  auth: "better-auth",
  deployment: "vercel",
  linter: "oxlint",
  formatter: "oxfmt",
  unitTesting: "vitest",
  e2eTesting: "playwright",
  preCommit: "prek",
  packageManager: "bun",
  features: [
    "Turborepo monorepo structure",
    "Bun workspaces (use --cwd for workspace installs)",
    "Next.js web app (apps/web)",
    "Shared UI package (packages/ui)",
    "Shared database package (packages/db)",
    "Shared TypeScript config (packages/tsconfig)",
    "Shared ESLint config (packages/eslint-config)",
    "Drizzle ORM (shared schema)",
    "Supabase (Postgres, Storage, Realtime)",
    "better-auth (shared across apps)",
    "Tailwind CSS + shadcn/ui",
    "Remote caching with Turborepo",
    "Parallel task execution",
  ],
  skills: [
    "planning-with-files",
    "test-driven-development",
    "systematic-debugging",
    "verification-before-completion",
    "react-best-practices",
    "vercel-deploy-claimable",
    "web-design-guidelines",
    "supabase-operations",
    "drizzle-orm-d1",
    "drizzle",
    "drizzle-migration",
    "better-auth",
    "tailwind-v4-shadcn",
    "turborepo",
    "monorepo-management",
  ],
};

// ============================================================================
// Preset Variants
// ============================================================================

/**
 * Fullstack preset with Expo mobile app
 * Use this when you need both web and mobile apps sharing code
 */
export const FULLSTACK_MOBILE_PRESET: PresetConfig = {
  ...FULLSTACK_PRESET,
  id: "fullstack-mobile",
  name: "Fullstack with Mobile",
  description: "Turborepo monorepo with web + mobile + shared packages",
  platform: "universal",
  features: [
    ...FULLSTACK_PRESET.features.filter((f) => !f.includes("Next.js web app")),
    "Next.js web app (apps/web)",
    "Expo mobile app (apps/mobile)",
    "Shared code between web and mobile",
    "Uniwind styling for mobile",
    "EAS Build for mobile deployment",
  ],
  skills: [
    ...FULLSTACK_PRESET.skills,
    "expo-app-design",
    "expo-deployment",
    "upgrading-expo",
  ],
};

/**
 * Fullstack preset with TanStack Start
 * Use this when you prefer TanStack's type-safe routing
 */
export const FULLSTACK_TANSTACK_PRESET: PresetConfig = {
  ...FULLSTACK_PRESET,
  id: "fullstack-tanstack",
  name: "Fullstack with TanStack Start",
  description: "Turborepo monorepo with TanStack Start + shared packages",
  framework: "tanstack-start",
  features: [
    ...FULLSTACK_PRESET.features.filter((f) => !f.includes("Next.js")),
    "TanStack Start web app (apps/web)",
    "TanStack Router (type-safe routing)",
    "Server Functions",
  ],
  skills: FULLSTACK_PRESET.skills.filter((s) => s !== "vercel-deploy-claimable"),
};

/**
 * Fullstack preset with Convex backend
 * Use this for real-time applications with built-in state sync
 */
export const FULLSTACK_CONVEX_PRESET: PresetConfig = {
  ...FULLSTACK_PRESET,
  id: "fullstack-convex",
  name: "Fullstack with Convex",
  description: "Turborepo monorepo with Convex real-time backend",
  backend: "convex",
  orm: "none",
  features: [
    ...FULLSTACK_PRESET.features.filter(
      (f) => !f.includes("Drizzle") && !f.includes("Supabase")
    ),
    "Convex (real-time database, functions, file storage)",
    "Automatic caching and sync",
    "Shared Convex schema (packages/convex)",
  ],
  skills: [
    ...FULLSTACK_PRESET.skills.filter(
      (s) => !s.includes("drizzle") && s !== "supabase-operations"
    ),
    "convex",
  ],
};

/**
 * Fullstack preset with Clerk authentication
 * Use this when you need enterprise-grade auth with advanced features
 */
export const FULLSTACK_CLERK_PRESET: PresetConfig = {
  ...FULLSTACK_PRESET,
  id: "fullstack-clerk",
  name: "Fullstack with Clerk",
  description: "Turborepo monorepo with Clerk enterprise auth",
  auth: "clerk",
  features: [
    ...FULLSTACK_PRESET.features.filter((f) => !f.includes("better-auth")),
    "Clerk authentication (MFA, SSO, organizations)",
    "Shared auth utilities (packages/auth)",
  ],
  skills: [
    ...FULLSTACK_PRESET.skills.filter((s) => s !== "better-auth"),
    "clerk-pack",
  ],
};

/**
 * Fullstack preset with Prisma ORM
 * Use this when you prefer Prisma's API or need its ecosystem
 */
export const FULLSTACK_PRISMA_PRESET: PresetConfig = {
  ...FULLSTACK_PRESET,
  id: "fullstack-prisma",
  name: "Fullstack with Prisma",
  description: "Turborepo monorepo with Prisma ORM",
  orm: "prisma",
  features: [
    ...FULLSTACK_PRESET.features.filter((f) => !f.includes("Drizzle")),
    "Prisma ORM (shared schema in packages/db)",
  ],
  skills: FULLSTACK_PRESET.skills.filter((s) => !s.includes("drizzle")),
};

/**
 * Fullstack preset with API package
 * Use this when you need a separate API service in the monorepo
 */
export const FULLSTACK_API_PRESET: PresetConfig = {
  ...FULLSTACK_PRESET,
  id: "fullstack-api",
  name: "Fullstack with API",
  description: "Turborepo monorepo with web + API + shared packages",
  features: [
    ...FULLSTACK_PRESET.features,
    "Hono API service (apps/api)",
    "Shared types between web and API",
    "OpenAPI documentation",
  ],
  skills: [
    ...FULLSTACK_PRESET.skills,
    "docker-containerization",
  ],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the Fullstack preset configuration
 */
export function getFullstackPreset(): PresetConfig {
  return FULLSTACK_PRESET;
}

/**
 * Get a Fullstack variant by ID
 */
export function getFullstackVariant(
  variant:
    | "default"
    | "mobile"
    | "tanstack"
    | "convex"
    | "clerk"
    | "prisma"
    | "api"
): PresetConfig {
  switch (variant) {
    case "mobile":
      return FULLSTACK_MOBILE_PRESET;
    case "tanstack":
      return FULLSTACK_TANSTACK_PRESET;
    case "convex":
      return FULLSTACK_CONVEX_PRESET;
    case "clerk":
      return FULLSTACK_CLERK_PRESET;
    case "prisma":
      return FULLSTACK_PRISMA_PRESET;
    case "api":
      return FULLSTACK_API_PRESET;
    case "default":
    default:
      return FULLSTACK_PRESET;
  }
}

/**
 * Get all Fullstack preset variants
 */
export function getAllFullstackVariants(): PresetConfig[] {
  return [
    FULLSTACK_PRESET,
    FULLSTACK_MOBILE_PRESET,
    FULLSTACK_TANSTACK_PRESET,
    FULLSTACK_CONVEX_PRESET,
    FULLSTACK_CLERK_PRESET,
    FULLSTACK_PRISMA_PRESET,
    FULLSTACK_API_PRESET,
  ];
}

// ============================================================================
// Exports
// ============================================================================

export default FULLSTACK_PRESET;
