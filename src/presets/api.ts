/**
 * API Preset Configuration
 * Optimized for building API services with Hono or Elysia
 */

import type { PresetConfig } from "./saas.js";

// ============================================================================
// API Preset Configuration
// ============================================================================

/**
 * API preset optimized for building production-ready API services
 *
 * Stack:
 * - Hono for edge-first, multi-runtime API development
 * - Drizzle ORM for type-safe database access
 * - better-auth for API authentication
 * - Cloudflare Workers for edge deployment
 *
 * Features included:
 * - Edge-first architecture for global performance
 * - Multi-runtime support (Cloudflare, Vercel, Node.js, Bun)
 * - Type-safe database access with Drizzle
 * - JWT/session authentication with better-auth
 * - Modern testing with Vitest
 * - Pre-commit hooks with prek for fast checks
 */
export const API_PRESET: PresetConfig = {
  id: "api",
  name: "API Service",
  description: "Edge-first API with Hono, auth, and database",
  platform: "api",
  framework: "hono",
  orm: "drizzle",
  backend: "custom",
  auth: "better-auth",
  deployment: "cloudflare",
  linter: "oxlint",
  formatter: "oxfmt",
  unitTesting: "vitest",
  preCommit: "prek",
  packageManager: "bun",
  features: [
    "Hono (edge-first framework)",
    "Multi-runtime support (Cloudflare, Vercel, Node.js, Bun)",
    "Drizzle ORM with D1/LibSQL",
    "better-auth authentication (JWT, sessions)",
    "Cloudflare Workers deployment",
    "Type-safe request/response validation",
    "OpenAPI documentation ready",
    "Vitest unit testing",
    "Rate limiting middleware",
    "CORS configuration",
  ],
  skills: [
    "planning-with-files",
    "test-driven-development",
    "systematic-debugging",
    "verification-before-completion",
    "drizzle-orm-d1",
    "drizzle",
    "drizzle-migration",
    "better-auth",
    "docker-containerization",
  ],
};

// ============================================================================
// Preset Variants
// ============================================================================

/**
 * API preset with Elysia
 * Use this when you want Bun-native performance with excellent TypeScript DX
 */
export const API_ELYSIA_PRESET: PresetConfig = {
  ...API_PRESET,
  id: "api-elysia",
  name: "API with Elysia",
  description: "Bun-native API with Elysia for maximum performance",
  framework: "elysia",
  deployment: "fly-io",
  features: [
    "Elysia (Bun-native framework)",
    "End-to-end type safety with Eden client",
    "Drizzle ORM with PostgreSQL",
    "better-auth authentication (JWT, sessions)",
    "Fly.io deployment (global regions)",
    "Built-in validation with TypeBox",
    "Swagger/OpenAPI auto-generation",
    "Vitest unit testing",
    "Rate limiting plugin",
    "CORS plugin",
  ],
  skills: [
    "planning-with-files",
    "test-driven-development",
    "systematic-debugging",
    "verification-before-completion",
    "drizzle",
    "drizzle-migration",
    "better-auth",
    "docker-containerization",
  ],
};

/**
 * API preset with Prisma ORM
 * Use this when you prefer Prisma's API or need its ecosystem
 */
export const API_PRISMA_PRESET: PresetConfig = {
  ...API_PRESET,
  id: "api-prisma",
  name: "API with Prisma",
  description: "Edge-first API with Prisma ORM",
  orm: "prisma",
  features: [
    ...API_PRESET.features.filter((f) => !f.includes("Drizzle")),
    "Prisma ORM with edge adapter",
  ],
  skills: API_PRESET.skills.filter((s) => !s.includes("drizzle")),
};

/**
 * API preset with Vercel deployment
 * Use this when you want Vercel's serverless infrastructure
 */
export const API_VERCEL_PRESET: PresetConfig = {
  ...API_PRESET,
  id: "api-vercel",
  name: "API on Vercel",
  description: "Serverless API with Hono on Vercel",
  deployment: "vercel",
  features: [
    ...API_PRESET.features.filter((f) => !f.includes("Cloudflare")),
    "Vercel serverless deployment",
    "Vercel Edge Functions support",
  ],
  skills: [
    ...API_PRESET.skills,
    "vercel-deploy-claimable",
  ],
};

/**
 * API preset with Node.js runtime
 * Use this for traditional Node.js server deployment
 */
export const API_NODE_PRESET: PresetConfig = {
  ...API_PRESET,
  id: "api-node",
  name: "API on Node.js",
  description: "Node.js API with Hono for traditional hosting",
  deployment: "railway",
  features: [
    ...API_PRESET.features.filter((f) => !f.includes("Cloudflare") && !f.includes("Multi-runtime")),
    "Node.js runtime",
    "Railway/Render deployment",
    "PostgreSQL database",
  ],
};

/**
 * API preset with Supabase backend
 * Use this when you want Supabase's Postgres and real-time features
 */
export const API_SUPABASE_PRESET: PresetConfig = {
  ...API_PRESET,
  id: "api-supabase",
  name: "API with Supabase",
  description: "API with Supabase for database and auth",
  backend: "supabase",
  auth: "supabase-auth",
  features: [
    "Hono (edge-first framework)",
    "Multi-runtime support (Cloudflare, Vercel, Node.js, Bun)",
    "Drizzle ORM with Supabase Postgres",
    "Supabase Auth (JWT, RLS)",
    "Supabase Realtime",
    "Supabase Storage",
    "Cloudflare Workers deployment",
    "Type-safe request/response validation",
    "Vitest unit testing",
  ],
  skills: [
    "planning-with-files",
    "test-driven-development",
    "systematic-debugging",
    "verification-before-completion",
    "drizzle",
    "drizzle-migration",
    "supabase-operations",
    "docker-containerization",
  ],
};

/**
 * API preset with Fly.io deployment
 * Use this when you need global distribution with custom regions
 */
export const API_FLY_PRESET: PresetConfig = {
  ...API_PRESET,
  id: "api-fly",
  name: "API on Fly.io",
  description: "Globally distributed API on Fly.io",
  deployment: "fly-io",
  features: [
    ...API_PRESET.features.filter((f) => !f.includes("Cloudflare")),
    "Fly.io deployment (global regions)",
    "PostgreSQL on Fly",
    "Machine-based scaling",
  ],
  skills: [
    ...API_PRESET.skills,
    "docker-containerization",
  ],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the API preset configuration
 */
export function getAPIPreset(): PresetConfig {
  return API_PRESET;
}

/**
 * Get an API variant by ID
 */
export function getAPIVariant(
  variant:
    | "default"
    | "elysia"
    | "prisma"
    | "vercel"
    | "node"
    | "supabase"
    | "fly"
): PresetConfig {
  switch (variant) {
    case "elysia":
      return API_ELYSIA_PRESET;
    case "prisma":
      return API_PRISMA_PRESET;
    case "vercel":
      return API_VERCEL_PRESET;
    case "node":
      return API_NODE_PRESET;
    case "supabase":
      return API_SUPABASE_PRESET;
    case "fly":
      return API_FLY_PRESET;
    case "default":
    default:
      return API_PRESET;
  }
}

/**
 * Get all API preset variants
 */
export function getAllAPIVariants(): PresetConfig[] {
  return [
    API_PRESET,
    API_ELYSIA_PRESET,
    API_PRISMA_PRESET,
    API_VERCEL_PRESET,
    API_NODE_PRESET,
    API_SUPABASE_PRESET,
    API_FLY_PRESET,
  ];
}

// ============================================================================
// Exports
// ============================================================================

export default API_PRESET;
