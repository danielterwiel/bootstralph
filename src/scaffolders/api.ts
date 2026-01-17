/**
 * Hono/Elysia API scaffolder
 * Creates API-only projects using Hono (edge-first) or Elysia (Bun-native)
 * Handles ORM setup, authentication, testing, and deployment configuration
 */

import * as p from "@clack/prompts";
import { execa } from "execa";
import path from "node:path";
import fs from "fs-extra";
import type {
  ORM,
  AuthProvider,
  DeploymentTarget,
  Linter,
  Formatter,
  UnitTestFramework,
  PreCommitTool,
} from "../compatibility/matrix.js";

// ============================================================================
// Types
// ============================================================================

export type ApiFramework = "hono" | "elysia";

export interface ApiScaffoldOptions {
  /** Project name/directory */
  projectName: string;
  /** Target directory (defaults to cwd/projectName) */
  targetDir?: string;
  /** API framework choice */
  framework?: ApiFramework;
  /** ORM choice */
  orm?: ORM;
  /** Auth provider choice */
  auth?: AuthProvider;
  /** Deployment target */
  deployment?: DeploymentTarget;
  /** Linter choice */
  linter?: Linter;
  /** Formatter choice */
  formatter?: Formatter;
  /** Unit test framework */
  unitTesting?: UnitTestFramework;
  /** Pre-commit tool */
  preCommit?: PreCommitTool;
  /** Package manager to use */
  packageManager?: "bun" | "pnpm" | "npm" | "yarn";
}

export interface ScaffoldResult {
  success: boolean;
  projectPath: string;
  errors?: string[];
  warnings?: string[];
  nextSteps?: string[];
}

// ============================================================================
// Main Scaffold Function
// ============================================================================

/**
 * Scaffold a new API project using Hono or Elysia
 * Applies bootstralph-specific configurations for ORM, auth, testing, etc.
 */
export async function scaffoldApi(
  options: ApiScaffoldOptions
): Promise<ScaffoldResult> {
  const {
    projectName,
    targetDir = process.cwd(),
    framework = "hono",
    packageManager = "bun",
  } = options;

  const projectPath = path.join(targetDir, projectName);
  const errors: string[] = [];
  const warnings: string[] = [];
  const nextSteps: string[] = [];

  // ============================================================================
  // Step 1: Run create command for chosen framework
  // ============================================================================

  const spinner = p.spinner();
  spinner.start(`Creating ${framework === "hono" ? "Hono" : "Elysia"} project...`);

  try {
    if (framework === "elysia") {
      await scaffoldElysia(projectName, targetDir, packageManager);
    } else {
      await scaffoldHono(projectName, targetDir, packageManager, options.deployment);
    }
    spinner.stop(`${framework === "hono" ? "Hono" : "Elysia"} project created`);
  } catch (error) {
    spinner.stop(`Failed to create ${framework} project`);
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`create ${framework} failed: ${errorMessage}`);
    return { success: false, projectPath, errors };
  }

  // ============================================================================
  // Step 2: Install additional dependencies based on selections
  // ============================================================================

  const additionalDeps = collectAdditionalDependencies(options);

  if (additionalDeps.dependencies.length > 0 || additionalDeps.devDependencies.length > 0) {
    spinner.start("Installing additional dependencies...");
    try {
      await installDependencies(projectPath, additionalDeps, packageManager);
      spinner.stop("Dependencies installed");
    } catch (error) {
      spinner.stop("Some dependencies may not have installed");
      const errorMessage = error instanceof Error ? error.message : String(error);
      warnings.push(`Dependency installation warning: ${errorMessage}`);
    }
  }

  // ============================================================================
  // Step 3: Generate configuration files
  // ============================================================================

  spinner.start("Generating configuration files...");
  try {
    await generateConfigFiles(projectPath, options);
    spinner.stop("Configuration files generated");
  } catch (error) {
    spinner.stop("Some config files may not have been generated");
    const errorMessage = error instanceof Error ? error.message : String(error);
    warnings.push(`Config generation warning: ${errorMessage}`);
  }

  // ============================================================================
  // Step 4: Build next steps list
  // ============================================================================

  nextSteps.push(...buildNextSteps(options));

  // Build result object conditionally to satisfy exactOptionalPropertyTypes
  const result: ScaffoldResult = {
    success: errors.length === 0,
    projectPath,
  };

  if (errors.length > 0) {
    result.errors = errors;
  }
  if (warnings.length > 0) {
    result.warnings = warnings;
  }
  if (nextSteps.length > 0) {
    result.nextSteps = nextSteps;
  }

  return result;
}

// ============================================================================
// Hono Scaffolding
// ============================================================================

/**
 * Scaffold Hono project using create-hono
 * Selects appropriate template based on deployment target
 */
async function scaffoldHono(
  projectName: string,
  targetDir: string,
  packageManager: string,
  deployment?: DeploymentTarget
): Promise<void> {
  // Determine template based on deployment target
  const template = getHonoTemplate(deployment);

  // create-hono uses npm create hono@latest <project-name> --template <template>
  const args = [projectName, "--template", template];

  switch (packageManager) {
    case "bun":
      await execa("bun", ["create", "hono@latest", ...args], {
        cwd: targetDir,
        stdio: "pipe",
      });
      break;
    case "pnpm":
      await execa("pnpm", ["create", "hono@latest", ...args], {
        cwd: targetDir,
        stdio: "pipe",
      });
      break;
    case "yarn":
      await execa("yarn", ["create", "hono@latest", ...args], {
        cwd: targetDir,
        stdio: "pipe",
      });
      break;
    default:
      await execa("npm", ["create", "hono@latest", ...args], {
        cwd: targetDir,
        stdio: "pipe",
      });
      break;
  }
}

/**
 * Get Hono template based on deployment target
 */
function getHonoTemplate(deployment?: DeploymentTarget): string {
  switch (deployment) {
    case "cloudflare":
      return "cloudflare-workers";
    case "vercel":
      return "vercel";
    case "netlify":
      return "netlify";
    case "fly-io":
    case "railway":
    case "render":
      return "nodejs"; // Standard Node.js for container deployments
    default:
      return "bun"; // Default to Bun for local development
  }
}

// ============================================================================
// Elysia Scaffolding
// ============================================================================

/**
 * Scaffold Elysia project using bun create elysia
 * Elysia is Bun-native, so always uses Bun
 */
async function scaffoldElysia(
  projectName: string,
  targetDir: string,
  _packageManager: string
): Promise<void> {
  // Elysia requires Bun, so we always use bun create
  await execa("bun", ["create", "elysia", projectName], {
    cwd: targetDir,
    stdio: "pipe",
  });
}

// ============================================================================
// Dependency Collection
// ============================================================================

interface DependencyList {
  dependencies: string[];
  devDependencies: string[];
}

/**
 * Collect additional dependencies based on wizard selections
 */
function collectAdditionalDependencies(
  options: ApiScaffoldOptions
): DependencyList {
  const deps: string[] = [];
  const devDeps: string[] = [];

  const isElysia = options.framework === "elysia";

  // ORM
  if (options.orm && options.orm !== "none") {
    switch (options.orm) {
      case "drizzle":
        deps.push("drizzle-orm");
        devDeps.push("drizzle-kit");
        // Add appropriate driver based on deployment target
        if (options.deployment === "cloudflare") {
          // Cloudflare D1 or Turso for edge
          deps.push("@libsql/client");
        } else {
          // Default to Postgres via Neon for edge-compatibility
          deps.push("@neondatabase/serverless");
        }
        break;
      case "prisma":
        deps.push("@prisma/client");
        devDeps.push("prisma");
        // Note: Prisma requires Accelerate for edge runtimes
        if (options.deployment === "cloudflare") {
          deps.push("@prisma/adapter-libsql");
        }
        break;
    }
  }

  // Auth - better-auth has Hono and Elysia integrations
  if (options.auth === "better-auth") {
    deps.push("better-auth");
  }

  // Testing - Vitest is the default for API projects
  if (options.unitTesting === "vitest") {
    devDeps.push("vitest");
    if (isElysia) {
      // Elysia has its own testing utilities
      devDeps.push("@elysiajs/eden"); // For type-safe client testing
    }
  }

  // Linting
  if (options.linter) {
    switch (options.linter) {
      case "oxlint":
        devDeps.push("oxlint");
        break;
      case "biome":
        devDeps.push("@biomejs/biome");
        break;
      case "eslint":
        devDeps.push("eslint", "@typescript-eslint/eslint-plugin", "@typescript-eslint/parser");
        break;
    }
  }

  // Formatting
  if (options.formatter && options.formatter !== "biome") {
    switch (options.formatter) {
      case "oxfmt":
        devDeps.push("oxfmt");
        break;
      case "prettier":
        devDeps.push("prettier");
        break;
    }
  }

  // Pre-commit
  if (options.preCommit) {
    switch (options.preCommit) {
      case "lefthook":
        devDeps.push("lefthook");
        break;
      case "husky":
        devDeps.push("husky", "lint-staged");
        break;
      // prek is installed via cargo, not npm
    }
  }

  // Deployment-specific dependencies
  if (options.deployment === "cloudflare" && options.framework === "hono") {
    devDeps.push("wrangler"); // Cloudflare CLI
  }

  return { dependencies: deps, devDependencies: devDeps };
}

/**
 * Install dependencies in the project
 */
async function installDependencies(
  projectPath: string,
  deps: DependencyList,
  packageManager: string
): Promise<void> {
  const addCmd = packageManager === "npm" ? "install" : "add";

  if (deps.dependencies.length > 0) {
    await execa(packageManager, [addCmd, ...deps.dependencies], {
      cwd: projectPath,
      stdio: "pipe",
    });
  }

  if (deps.devDependencies.length > 0) {
    const devFlag = packageManager === "npm" ? "--save-dev" : "-D";
    await execa(packageManager, [addCmd, devFlag, ...deps.devDependencies], {
      cwd: projectPath,
      stdio: "pipe",
    });
  }
}

// ============================================================================
// Configuration File Generation
// ============================================================================

/**
 * Generate configuration files based on selections
 */
async function generateConfigFiles(
  projectPath: string,
  options: ApiScaffoldOptions
): Promise<void> {
  const configGenerators: Array<() => Promise<void>> = [];

  // Vitest config
  if (options.unitTesting === "vitest") {
    configGenerators.push(() => generateVitestConfig(projectPath, options));
  }

  // Drizzle config
  if (options.orm === "drizzle") {
    configGenerators.push(() => generateDrizzleConfig(projectPath, options));
  }

  // Prisma setup
  if (options.orm === "prisma") {
    configGenerators.push(() => generatePrismaSetup(projectPath, options));
  }

  // better-auth setup
  if (options.auth === "better-auth") {
    configGenerators.push(() => generateBetterAuthSetup(projectPath, options));
  }

  // oxlint config
  if (options.linter === "oxlint") {
    configGenerators.push(() => generateOxlintConfig(projectPath));
  }

  // Biome config
  if (options.linter === "biome") {
    configGenerators.push(() => generateBiomeConfig(projectPath));
  }

  // Lefthook config
  if (options.preCommit === "lefthook") {
    configGenerators.push(() => generateLefthookConfig(projectPath, options));
  }

  // Husky config
  if (options.preCommit === "husky") {
    configGenerators.push(() => generateHuskyConfig(projectPath, options));
  }

  // Environment variables template
  configGenerators.push(() => generateEnvTemplate(projectPath, options));

  // Run all generators
  await Promise.all(configGenerators.map((gen) => gen()));
}

async function generateVitestConfig(
  projectPath: string,
  options: ApiScaffoldOptions
): Promise<void> {
  const isElysia = options.framework === "elysia";

  const config = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', '*.config.*'],
    },
  },
});
`;

  await fs.writeFile(path.join(projectPath, "vitest.config.ts"), config);

  // Create tests directory with example test
  const testsDir = path.join(projectPath, "tests");
  await fs.ensureDir(testsDir);

  const exampleTest = isElysia
    ? `import { describe, it, expect } from 'vitest';
import { treaty } from '@elysiajs/eden';
import { app } from '../src/index';

const api = treaty(app);

describe('API', () => {
  it('should return hello world', async () => {
    const response = await api.index.get();
    expect(response.status).toBe(200);
  });
});
`
    : `import { describe, it, expect } from 'vitest';
import app from '../src/index';

describe('API', () => {
  it('should return hello world', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
  });
});
`;

  await fs.writeFile(path.join(testsDir, "api.test.ts"), exampleTest);
}

async function generateDrizzleConfig(
  projectPath: string,
  options: ApiScaffoldOptions
): Promise<void> {
  const isCloudflare = options.deployment === "cloudflare";

  const config = isCloudflare
    ? `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID!,
    token: process.env.CLOUDFLARE_API_TOKEN!,
  },
});
`
    : `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
`;

  await fs.writeFile(path.join(projectPath, "drizzle.config.ts"), config);

  // Create db directory and schema file
  const dbDir = path.join(projectPath, "src", "db");
  await fs.ensureDir(dbDir);

  const schemaContent = isCloudflare
    ? `import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
`
    : `import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow(),
});
`;

  await fs.writeFile(path.join(dbDir, "schema.ts"), schemaContent);

  // Create db client
  const clientContent = isCloudflare
    ? `import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export type Env = {
  DB: D1Database;
};

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
`
    : `import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });

export type Database = typeof db;
`;

  await fs.writeFile(path.join(dbDir, "index.ts"), clientContent);
}

async function generatePrismaSetup(
  projectPath: string,
  options: ApiScaffoldOptions
): Promise<void> {
  const prismaDir = path.join(projectPath, "prisma");
  await fs.ensureDir(prismaDir);

  const isCloudflare = options.deployment === "cloudflare";

  const schema = isCloudflare
    ? `generator client {
  provider = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
}
`
    : `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
}
`;

  await fs.writeFile(path.join(prismaDir, "schema.prisma"), schema);

  // Create db client in src
  const dbDir = path.join(projectPath, "src", "db");
  await fs.ensureDir(dbDir);

  const clientContent = isCloudflare
    ? `import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

export function createDb(url: string) {
  const libsql = createClient({ url });
  const adapter = new PrismaLibSQL(libsql);
  return new PrismaClient({ adapter });
}

export type Database = ReturnType<typeof createDb>;
`
    : `import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export type Database = typeof db;
`;

  await fs.writeFile(path.join(dbDir, "index.ts"), clientContent);
}

async function generateBetterAuthSetup(
  projectPath: string,
  options: ApiScaffoldOptions
): Promise<void> {
  const authDir = path.join(projectPath, "src", "auth");
  await fs.ensureDir(authDir);

  const isHono = options.framework === "hono";
  const isElysia = options.framework === "elysia";

  // Auth config
  const authConfig = `import { betterAuth } from 'better-auth';
${options.orm === "drizzle" ? "import { drizzleAdapter } from 'better-auth/adapters/drizzle';\nimport { db } from '../db';" : ""}
${options.orm === "prisma" ? "import { prismaAdapter } from 'better-auth/adapters/prisma';\nimport { db } from '../db';" : ""}

export const auth = betterAuth({
  database: ${
    options.orm === "drizzle"
      ? "drizzleAdapter(db, { provider: 'pg' })"
      : options.orm === "prisma"
        ? "prismaAdapter(db)"
        : "undefined // Configure your database adapter"
  },
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
});

export type Auth = typeof auth;
`;

  await fs.writeFile(path.join(authDir, "index.ts"), authConfig);

  // Framework-specific handler
  if (isHono) {
    const honoHandler = `import { Hono } from 'hono';
import { auth } from './index';

const authApp = new Hono();

// Mount better-auth handler at /api/auth/*
authApp.on(['GET', 'POST'], '/*', (c) => {
  return auth.handler(c.req.raw);
});

export { authApp };
`;

    await fs.writeFile(path.join(authDir, "handler.ts"), honoHandler);
  } else if (isElysia) {
    const elysiaHandler = `import { Elysia } from 'elysia';
import { auth } from './index';

export const authPlugin = new Elysia({ prefix: '/api/auth' })
  .all('/*', async ({ request }) => {
    return auth.handler(request);
  });
`;

    await fs.writeFile(path.join(authDir, "handler.ts"), elysiaHandler);
  }
}

async function generateOxlintConfig(projectPath: string): Promise<void> {
  const config = {
    $schema: "https://raw.githubusercontent.com/oxc-project/oxc/main/crates/oxc_linter/src/schema.json",
    plugins: ["typescript"],
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off", // APIs commonly use console for logging
    },
    ignore: ["node_modules", "dist", ".wrangler"],
  };

  await fs.writeJSON(path.join(projectPath, ".oxlintrc.json"), config, {
    spaces: 2,
  });
}

async function generateBiomeConfig(projectPath: string): Promise<void> {
  const config = {
    $schema: "https://biomejs.dev/schemas/1.9.4/schema.json",
    organizeImports: {
      enabled: true,
    },
    linter: {
      enabled: true,
      rules: {
        recommended: true,
      },
    },
    formatter: {
      enabled: true,
      indentStyle: "space",
      indentWidth: 2,
    },
    javascript: {
      formatter: {
        quoteStyle: "single",
        semicolons: "always",
      },
    },
    files: {
      ignore: ["node_modules", "dist", ".wrangler"],
    },
  };

  await fs.writeJSON(path.join(projectPath, "biome.json"), config, {
    spaces: 2,
  });
}

async function generateLefthookConfig(
  projectPath: string,
  options: ApiScaffoldOptions
): Promise<void> {
  const lintCommand =
    options.linter === "oxlint"
      ? "npx oxlint {staged_files}"
      : options.linter === "biome"
        ? "npx biome check {staged_files}"
        : "npx eslint {staged_files}";

  const formatCommand =
    options.formatter === "oxfmt"
      ? "npx oxfmt {staged_files}"
      : options.formatter === "biome"
        ? "npx biome format --write {staged_files}"
        : "npx prettier --write {staged_files}";

  const config = `pre-commit:
  parallel: true
  commands:
    lint:
      glob: "*.{js,ts}"
      run: ${lintCommand}
    format:
      glob: "*.{js,ts,json,md}"
      run: ${formatCommand}
      stage_fixed: true
    typecheck:
      run: npx tsc --noEmit
`;

  await fs.writeFile(path.join(projectPath, "lefthook.yml"), config);
}

async function generateHuskyConfig(
  projectPath: string,
  options: ApiScaffoldOptions
): Promise<void> {
  // Create .husky directory
  const huskyDir = path.join(projectPath, ".husky");
  await fs.ensureDir(huskyDir);

  // Pre-commit hook
  const lintCommand =
    options.linter === "oxlint"
      ? "npx oxlint"
      : options.linter === "biome"
        ? "npx biome check"
        : "npx eslint";

  const preCommit = `npx lint-staged
`;

  await fs.writeFile(path.join(huskyDir, "pre-commit"), preCommit, { mode: 0o755 });

  // Create lint-staged config (ESM format)
  const formatCommand =
    options.formatter === "oxfmt"
      ? "oxfmt"
      : options.formatter === "biome"
        ? "biome format --write"
        : "prettier --write";

  const lintStagedConfig = `export default {
  '*.{js,ts}': ['${lintCommand}', '${formatCommand}'],
  '*.{json,md}': ['${formatCommand}'],
};
`;

  await fs.writeFile(path.join(projectPath, "lint-staged.config.js"), lintStagedConfig);
}

async function generateEnvTemplate(
  projectPath: string,
  options: ApiScaffoldOptions
): Promise<void> {
  const envLines: string[] = [
    "# Environment Variables",
    "# Copy this file to .env and fill in your values",
    "",
  ];

  // Database
  if (options.orm && options.orm !== "none") {
    envLines.push("# Database");
    if (options.deployment === "cloudflare") {
      envLines.push("# Cloudflare D1 - configured via wrangler.toml");
      envLines.push("CLOUDFLARE_ACCOUNT_ID=");
      envLines.push("CLOUDFLARE_D1_DATABASE_ID=");
      envLines.push("CLOUDFLARE_API_TOKEN=");
    } else {
      envLines.push("DATABASE_URL=postgresql://user:password@localhost:5432/dbname");
    }
    envLines.push("");
  }

  // Auth
  if (options.auth === "better-auth") {
    envLines.push("# Better Auth");
    envLines.push("BETTER_AUTH_SECRET=your-secret-key-here");
    envLines.push("BETTER_AUTH_URL=http://localhost:3000");
    envLines.push("");
  }

  // Deployment-specific
  if (options.deployment === "cloudflare") {
    envLines.push("# Cloudflare Workers");
    envLines.push("# See wrangler.toml for worker configuration");
    envLines.push("");
  }

  await fs.writeFile(path.join(projectPath, ".env.example"), envLines.join("\n"));

  // Also create .env with empty values
  await fs.writeFile(path.join(projectPath, ".env"), envLines.join("\n"));
}

// ============================================================================
// Next Steps Builder
// ============================================================================

/**
 * Build list of next steps for the user
 */
function buildNextSteps(options: ApiScaffoldOptions): string[] {
  const steps: string[] = [];
  const pm = options.packageManager ?? "bun";

  steps.push(`cd ${options.projectName}`);

  // Environment setup
  if (options.orm || options.auth) {
    steps.push("Copy .env.example to .env and fill in your values");
  }

  // Database setup
  if (options.orm === "drizzle") {
    if (options.deployment === "cloudflare") {
      steps.push("Configure Cloudflare D1 database in wrangler.toml");
      steps.push("Run `npx drizzle-kit push` to push schema");
    } else {
      steps.push("Set up your PostgreSQL database");
      steps.push("Run `npx drizzle-kit push` to push schema");
    }
  }
  if (options.orm === "prisma") {
    steps.push("Run `npx prisma db push` to push schema");
    steps.push("Run `npx prisma generate` to generate client");
  }

  // Cloudflare-specific
  if (options.deployment === "cloudflare" && options.framework === "hono") {
    steps.push("Run `npx wrangler dev` for local development");
    steps.push("Run `npx wrangler deploy` to deploy to Cloudflare Workers");
  }

  // Pre-commit hooks
  if (options.preCommit === "lefthook") {
    steps.push("Run `npx lefthook install` to set up git hooks");
  }
  if (options.preCommit === "husky") {
    steps.push("Run `npx husky` to set up git hooks");
  }
  if (options.preCommit === "prek") {
    steps.push("Install prek: `cargo install prek` or download from GitHub releases");
  }

  // Start dev server
  if (options.framework === "elysia") {
    steps.push("Run `bun run dev` to start the development server");
  } else if (options.deployment === "cloudflare") {
    steps.push("Run `npx wrangler dev` to start local development");
  } else {
    steps.push(`Run \`${pm} run dev\` to start the development server`);
  }

  return steps;
}

// ============================================================================
// Exports
// ============================================================================

export {
  collectAdditionalDependencies,
  buildNextSteps,
  getHonoTemplate,
};
