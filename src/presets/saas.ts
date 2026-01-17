/**
 * SaaS Preset Configuration
 * Optimized for building SaaS applications with Next.js, authentication, payments, and database
 */

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

// ============================================================================
// Types
// ============================================================================

/**
 * Complete preset configuration interface
 */
export interface PresetConfig {
  /** Preset identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of what this preset is for */
  description: string;
  /** Target platform */
  platform: Platform;
  /** Framework to use */
  framework: Framework;
  /** Styling solution */
  styling?: Styling;
  /** State management libraries */
  state?: StateManagement[];
  /** ORM selection */
  orm?: ORM;
  /** Backend service */
  backend?: Backend;
  /** Authentication provider */
  auth?: AuthProvider;
  /** Deployment target */
  deployment?: DeploymentTarget;
  /** Linter */
  linter: Linter;
  /** Formatter */
  formatter: Formatter;
  /** Unit testing framework */
  unitTesting: UnitTestFramework;
  /** E2E testing framework */
  e2eTesting?: E2ETestFramework;
  /** Pre-commit hook tool */
  preCommit: PreCommitTool;
  /** Package manager */
  packageManager: "bun" | "pnpm" | "npm" | "yarn";
  /** Features included in this preset */
  features: string[];
  /** Recommended skills for this preset */
  skills: string[];
}

// ============================================================================
// SaaS Preset Configuration
// ============================================================================

/**
 * SaaS preset optimized for building production-ready SaaS applications
 *
 * Stack:
 * - Next.js with App Router for full-stack React
 * - Tailwind CSS + shadcn/ui for rapid UI development
 * - Drizzle ORM for type-safe database access
 * - Supabase for database, realtime, and storage
 * - better-auth for flexible authentication
 * - Vercel for deployment
 *
 * Features included:
 * - Authentication with multiple providers (email, OAuth)
 * - Database with migrations
 * - API routes with type safety
 * - Server components and server actions
 * - Modern testing with Vitest and Playwright
 * - Pre-commit hooks with prek for fast checks
 */
export const SAAS_PRESET: PresetConfig = {
  id: "saas",
  name: "SaaS Application",
  description: "Full-stack SaaS with auth, database, and payments ready",
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
    "App Router with RSC",
    "Server Actions",
    "Authentication (email, OAuth, magic link)",
    "Database with Drizzle ORM",
    "Supabase (Postgres, Storage, Realtime)",
    "Type-safe API with tRPC patterns",
    "shadcn/ui components",
    "Dark mode support",
    "SEO optimized",
    "Analytics ready",
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
  ],
};

// ============================================================================
// Preset Variants
// ============================================================================

/**
 * SaaS preset with Clerk authentication
 * Use this when you need enterprise-grade auth with advanced features
 */
export const SAAS_CLERK_PRESET: PresetConfig = {
  ...SAAS_PRESET,
  id: "saas-clerk",
  name: "SaaS with Clerk Auth",
  description: "Full-stack SaaS with Clerk for enterprise auth",
  auth: "clerk",
  features: [
    ...SAAS_PRESET.features.filter((f) => !f.includes("Authentication")),
    "Authentication with Clerk (MFA, SSO, organizations)",
  ],
  skills: [
    ...SAAS_PRESET.skills.filter((s) => s !== "better-auth"),
    "clerk-pack",
  ],
};

/**
 * SaaS preset with Prisma ORM
 * Use this when you prefer Prisma's API or need its ecosystem
 */
export const SAAS_PRISMA_PRESET: PresetConfig = {
  ...SAAS_PRESET,
  id: "saas-prisma",
  name: "SaaS with Prisma",
  description: "Full-stack SaaS with Prisma ORM",
  orm: "prisma",
  features: [
    ...SAAS_PRESET.features.filter((f) => !f.includes("Drizzle")),
    "Database with Prisma ORM",
  ],
  skills: SAAS_PRESET.skills.filter(
    (s) => !s.includes("drizzle")
  ),
};

/**
 * SaaS preset with TanStack Start
 * Use this when you want type-safe routing and modern patterns
 */
export const SAAS_TANSTACK_PRESET: PresetConfig = {
  ...SAAS_PRESET,
  id: "saas-tanstack",
  name: "SaaS with TanStack Start",
  description: "Full-stack SaaS with TanStack Start",
  framework: "tanstack-start",
  features: [
    "TanStack Router with type-safe routing",
    "Server Functions",
    "Authentication (email, OAuth, magic link)",
    "Database with Drizzle ORM",
    "Supabase (Postgres, Storage, Realtime)",
    "Type-safe API routes",
    "shadcn/ui components",
    "Dark mode support",
    "SEO optimized",
    "Analytics ready",
  ],
  skills: [
    "planning-with-files",
    "test-driven-development",
    "systematic-debugging",
    "verification-before-completion",
    "react-best-practices",
    "web-design-guidelines",
    "supabase-operations",
    "drizzle-orm-d1",
    "drizzle",
    "drizzle-migration",
    "better-auth",
    "tailwind-v4-shadcn",
  ],
};

/**
 * SaaS preset with Convex backend
 * Use this for real-time applications with built-in state sync
 */
export const SAAS_CONVEX_PRESET: PresetConfig = {
  ...SAAS_PRESET,
  id: "saas-convex",
  name: "SaaS with Convex",
  description: "Real-time SaaS with Convex backend",
  backend: "convex",
  orm: "none",
  features: [
    "App Router with RSC",
    "Server Actions",
    "Authentication (email, OAuth, magic link)",
    "Convex (real-time database, functions, file storage)",
    "Automatic caching and sync",
    "shadcn/ui components",
    "Dark mode support",
    "SEO optimized",
    "Analytics ready",
  ],
  skills: [
    "planning-with-files",
    "test-driven-development",
    "systematic-debugging",
    "verification-before-completion",
    "react-best-practices",
    "vercel-deploy-claimable",
    "web-design-guidelines",
    "convex",
    "better-auth",
    "tailwind-v4-shadcn",
  ],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the SaaS preset configuration
 */
export function getSaaSPreset(): PresetConfig {
  return SAAS_PRESET;
}

/**
 * Get a SaaS variant by ID
 */
export function getSaaSVariant(
  variant: "default" | "clerk" | "prisma" | "tanstack" | "convex"
): PresetConfig {
  switch (variant) {
    case "clerk":
      return SAAS_CLERK_PRESET;
    case "prisma":
      return SAAS_PRISMA_PRESET;
    case "tanstack":
      return SAAS_TANSTACK_PRESET;
    case "convex":
      return SAAS_CONVEX_PRESET;
    case "default":
    default:
      return SAAS_PRESET;
  }
}

/**
 * Get all SaaS preset variants
 */
export function getAllSaaSVariants(): PresetConfig[] {
  return [
    SAAS_PRESET,
    SAAS_CLERK_PRESET,
    SAAS_PRISMA_PRESET,
    SAAS_TANSTACK_PRESET,
    SAAS_CONVEX_PRESET,
  ];
}

/**
 * Convert preset config to project config partial (for use with create command)
 */
export function presetToProjectConfig(preset: PresetConfig): {
  platform: Platform;
  framework: Framework;
  styling?: Styling;
  state?: StateManagement[];
  orm?: ORM;
  backend?: Backend;
  auth?: AuthProvider;
  deployment?: DeploymentTarget;
  linter: Linter;
  formatter: Formatter;
  unitTesting: UnitTestFramework;
  e2eTesting?: E2ETestFramework;
  preCommit: PreCommitTool;
  packageManager: "bun" | "pnpm" | "npm" | "yarn";
} {
  const config: ReturnType<typeof presetToProjectConfig> = {
    platform: preset.platform,
    framework: preset.framework,
    linter: preset.linter,
    formatter: preset.formatter,
    unitTesting: preset.unitTesting,
    preCommit: preset.preCommit,
    packageManager: preset.packageManager,
  };

  if (preset.styling) config.styling = preset.styling;
  if (preset.state) config.state = preset.state;
  if (preset.orm) config.orm = preset.orm;
  if (preset.backend) config.backend = preset.backend;
  if (preset.auth) config.auth = preset.auth;
  if (preset.deployment) config.deployment = preset.deployment;
  if (preset.e2eTesting) config.e2eTesting = preset.e2eTesting;

  return config;
}

/**
 * Display preset information as formatted string
 */
export function formatPresetInfo(preset: PresetConfig): string {
  const lines: string[] = [
    `${preset.name}`,
    `${preset.description}`,
    "",
    "Stack:",
    `  Framework: ${preset.framework}`,
    `  Platform: ${preset.platform}`,
  ];

  if (preset.styling) lines.push(`  Styling: ${preset.styling}`);
  if (preset.orm && preset.orm !== "none") lines.push(`  ORM: ${preset.orm}`);
  if (preset.backend) lines.push(`  Backend: ${preset.backend}`);
  if (preset.auth) lines.push(`  Auth: ${preset.auth}`);
  if (preset.deployment) lines.push(`  Deploy: ${preset.deployment}`);

  lines.push("");
  lines.push("Features:");
  for (const feature of preset.features) {
    lines.push(`  • ${feature}`);
  }

  return lines.join("\n");
}

// ============================================================================
// Exports
// ============================================================================

export default SAAS_PRESET;
