/**
 * Astro scaffolder wrapper
 * Wraps `create astro` with bootstralph-specific configurations
 * Handles Vite, file-based routing, React islands, Tailwind, TypeScript setup
 */

import * as p from "@clack/prompts";
import { execa, type Options as ExecaOptions } from "execa";
import path from "node:path";
import fs from "fs-extra";
import type {
  Styling,
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

export interface AstroScaffoldOptions {
  /** Project name/directory */
  projectName: string;
  /** Target directory (defaults to cwd/projectName) */
  targetDir?: string;
  /** Styling choice from wizard */
  styling?: Extract<Styling, "tailwind" | "vanilla">;
  /** ORM choice */
  orm?: ORM;
  /** Backend service choice */
  backend?: Backend;
  /** Auth provider choice */
  auth?: AuthProvider;
  /** Deployment target */
  deployment?: Extract<DeploymentTarget, "vercel" | "netlify" | "cloudflare">;
  /** Linter choice */
  linter?: Linter;
  /** Formatter choice */
  formatter?: Formatter;
  /** Unit test framework */
  unitTesting?: UnitTestFramework;
  /** E2E test framework */
  e2eTesting?: E2ETestFramework;
  /** Pre-commit tool */
  preCommit?: PreCommitTool;
  /** Package manager to use */
  packageManager?: "bun" | "pnpm" | "npm" | "yarn";
  /** Use MDX for content */
  useMdx?: boolean;
  /** Add React for islands */
  addReact?: boolean;
}

export interface ScaffoldResult {
  success: boolean;
  projectPath: string;
  errors?: string[];
  warnings?: string[];
  nextSteps?: string[];
}

// Forward declaration of IntegrationOptions for use in main function
interface IntegrationOptions {
  styling: Extract<Styling, "tailwind" | "vanilla">;
  addReact: boolean;
  useMdx: boolean;
  deployment?: Extract<DeploymentTarget, "vercel" | "netlify" | "cloudflare">;
  packageManager: string;
}

// ============================================================================
// Main Scaffold Function
// ============================================================================

/**
 * Scaffold a new Astro project using create astro
 * Then applies bootstralph-specific configurations
 */
export async function scaffoldAstro(
  options: AstroScaffoldOptions
): Promise<ScaffoldResult> {
  const {
    projectName,
    targetDir = process.cwd(),
    styling = "tailwind",
    packageManager = "bun",
    useMdx = true,
    addReact = true,
  } = options;

  const projectPath = path.join(targetDir, projectName);
  const errors: string[] = [];
  const warnings: string[] = [];
  const nextSteps: string[] = [];

  // ============================================================================
  // Step 1: Run create astro
  // ============================================================================

  const spinner = p.spinner();
  spinner.start("Creating Astro project...");

  try {
    const createAstroArgs = buildCreateAstroArgs({
      projectName,
      packageManager,
    });

    await runCreateAstro(createAstroArgs, { cwd: targetDir });
    spinner.stop("Astro project created");
  } catch (error) {
    spinner.stop("Failed to create Astro project");
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`create astro failed: ${errorMessage}`);
    return { success: false, projectPath, errors };
  }

  // ============================================================================
  // Step 2: Add Astro integrations
  // ============================================================================

  spinner.start("Adding Astro integrations...");
  try {
    const integrationOpts: IntegrationOptions = {
      styling,
      addReact,
      useMdx,
      packageManager,
    };
    if (options.deployment) {
      integrationOpts.deployment = options.deployment;
    }
    await addAstroIntegrations(projectPath, integrationOpts);
    spinner.stop("Integrations added");
  } catch (error) {
    spinner.stop("Some integrations may not have been added");
    const errorMessage = error instanceof Error ? error.message : String(error);
    warnings.push(`Integration warning: ${errorMessage}`);
  }

  // ============================================================================
  // Step 3: Install additional dependencies based on selections
  // ============================================================================

  const additionalDeps = collectAdditionalDependencies(options);

  if (
    additionalDeps.dependencies.length > 0 ||
    additionalDeps.devDependencies.length > 0
  ) {
    spinner.start("Installing additional dependencies...");
    try {
      await installDependencies(projectPath, additionalDeps, packageManager);
      spinner.stop("Dependencies installed");
    } catch (error) {
      spinner.stop("Some dependencies may not have installed");
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      warnings.push(`Dependency installation warning: ${errorMessage}`);
    }
  }

  // ============================================================================
  // Step 4: Generate configuration files
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
  // Step 5: Build next steps list
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
// create astro Arguments
// ============================================================================

interface CreateAstroArgsOptions {
  projectName: string;
  packageManager: "bun" | "pnpm" | "npm" | "yarn";
}

/**
 * Build arguments array for create astro
 * Uses --template and --yes for non-interactive mode
 */
function buildCreateAstroArgs(options: CreateAstroArgsOptions): string[] {
  const { projectName } = options;

  const args: string[] = [
    projectName,
    "--template",
    "basics", // Use basics template as starting point
    "--yes", // Skip all prompts
    "--no-git", // Skip git init (we handle this separately)
    "--typescript",
    "strict", // Use strict TypeScript
  ];

  return args;
}

/**
 * Execute create astro with the given arguments
 */
async function runCreateAstro(
  args: string[],
  execaOptions: ExecaOptions
): Promise<void> {
  await execa("npm", ["create", "astro@latest", ...args], {
    ...execaOptions,
    stdio: "pipe",
  });
}

// ============================================================================
// Astro Integrations
// ============================================================================

/**
 * Add Astro integrations using `astro add`
 */
async function addAstroIntegrations(
  projectPath: string,
  options: IntegrationOptions
): Promise<void> {
  const integrations: string[] = [];

  // React for islands architecture
  if (options.addReact) {
    integrations.push("react");
  }

  // Tailwind CSS
  if (options.styling === "tailwind") {
    integrations.push("tailwind");
  }

  // MDX for content
  if (options.useMdx) {
    integrations.push("mdx");
  }

  // Deployment adapter
  if (options.deployment === "vercel") {
    integrations.push("vercel");
  } else if (options.deployment === "netlify") {
    integrations.push("netlify");
  } else if (options.deployment === "cloudflare") {
    integrations.push("cloudflare");
  }

  // Add integrations using npx astro add
  if (integrations.length > 0) {
    await execa(
      "npx",
      ["astro", "add", ...integrations, "--yes"],
      {
        cwd: projectPath,
        stdio: "pipe",
      }
    );
  }
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
  options: AstroScaffoldOptions
): DependencyList {
  const deps: string[] = [];
  const devDeps: string[] = [];

  // ORM
  if (options.orm && options.orm !== "none") {
    switch (options.orm) {
      case "drizzle":
        deps.push("drizzle-orm");
        devDeps.push("drizzle-kit");
        // Add driver based on deployment
        if (options.deployment === "cloudflare") {
          deps.push("@libsql/client");
        } else {
          deps.push("@neondatabase/serverless");
        }
        break;
      case "prisma":
        deps.push("@prisma/client");
        devDeps.push("prisma");
        break;
    }
  }

  // Backend
  if (options.backend) {
    switch (options.backend) {
      case "supabase":
        deps.push("@supabase/supabase-js");
        break;
      case "convex":
        // Convex in Astro uses React islands with withConvexProvider
        deps.push("convex");
        break;
      case "firebase":
        deps.push("firebase");
        break;
    }
  }

  // Auth - Astro has native SDK support for both better-auth and Clerk
  if (options.auth) {
    switch (options.auth) {
      case "better-auth":
        deps.push("better-auth");
        break;
      case "clerk":
        deps.push("@clerk/astro");
        break;
      case "supabase-auth":
        // Already installed with supabase backend
        if (!options.backend || options.backend !== "supabase") {
          deps.push("@supabase/supabase-js");
        }
        break;
    }
  }

  // Testing
  if (options.unitTesting === "vitest") {
    devDeps.push(
      "vitest",
      "@testing-library/react",
      "@testing-library/jest-dom",
      "jsdom"
    );
  }

  if (options.e2eTesting === "playwright") {
    devDeps.push("@playwright/test");
  }

  // Linting
  if (options.linter && options.linter !== "eslint") {
    switch (options.linter) {
      case "oxlint":
        devDeps.push("oxlint");
        break;
      case "biome":
        devDeps.push("@biomejs/biome");
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
        devDeps.push("prettier", "prettier-plugin-astro");
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
  options: AstroScaffoldOptions
): Promise<void> {
  const configGenerators: Array<() => Promise<void>> = [];

  // Vitest config
  if (options.unitTesting === "vitest") {
    configGenerators.push(() => generateVitestConfig(projectPath));
  }

  // Playwright config
  if (options.e2eTesting === "playwright") {
    configGenerators.push(() => generatePlaywrightConfig(projectPath));
  }

  // Drizzle config
  if (options.orm === "drizzle") {
    configGenerators.push(() =>
      generateDrizzleConfig(projectPath, options.deployment)
    );
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

  // Convex setup (for React islands)
  if (options.backend === "convex") {
    configGenerators.push(() => generateConvexSetup(projectPath));
  }

  // Supabase setup
  if (options.backend === "supabase" || options.auth === "supabase-auth") {
    configGenerators.push(() => generateSupabaseSetup(projectPath));
  }

  // Clerk setup
  if (options.auth === "clerk") {
    configGenerators.push(() => generateClerkSetup(projectPath));
  }

  // better-auth setup
  if (options.auth === "better-auth") {
    configGenerators.push(() => generateBetterAuthSetup(projectPath));
  }

  // Environment variables template
  configGenerators.push(() => generateEnvTemplate(projectPath, options));

  // Content Collections example (Astro-specific)
  if (options.useMdx) {
    configGenerators.push(() => generateContentCollections(projectPath));
  }

  // Run all generators
  await Promise.all(configGenerators.map((gen) => gen()));
}

async function generateVitestConfig(projectPath: string): Promise<void> {
  const config = `import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
});
`;

  await fs.writeFile(path.join(projectPath, "vitest.config.ts"), config);

  // Create test setup file
  const setupDir = path.join(projectPath, "src", "test");
  await fs.ensureDir(setupDir);

  const setupContent = `import '@testing-library/jest-dom';
`;

  await fs.writeFile(path.join(setupDir, "setup.ts"), setupContent);
}

async function generatePlaywrightConfig(projectPath: string): Promise<void> {
  const config = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
  },
});
`;

  await fs.writeFile(path.join(projectPath, "playwright.config.ts"), config);

  // Create e2e directory
  const e2eDir = path.join(projectPath, "e2e");
  await fs.ensureDir(e2eDir);

  const exampleTest = `import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Astro/);
});
`;

  await fs.writeFile(path.join(e2eDir, "example.spec.ts"), exampleTest);
}

async function generateDrizzleConfig(
  projectPath: string,
  deployment?: Extract<DeploymentTarget, "vercel" | "netlify" | "cloudflare">
): Promise<void> {
  const isCloudflare = deployment === "cloudflare";

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
  name: text('name'),
  email: text('email').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
`
    : `import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});
`;

  await fs.writeFile(path.join(dbDir, "schema.ts"), schemaContent);

  // Create db client
  const clientContent = isCloudflare
    ? `import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}
`
    : `import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(import.meta.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
`;

  await fs.writeFile(path.join(dbDir, "index.ts"), clientContent);
}

async function generateOxlintConfig(projectPath: string): Promise<void> {
  const config = {
    $schema:
      "https://raw.githubusercontent.com/oxc-project/oxc/main/crates/oxc_linter/src/schema.json",
    plugins: ["typescript", "react", "react-hooks", "jsx-a11y"],
    rules: {
      "no-unused-vars": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
    ignore: ["node_modules", "dist", ".astro"],
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
      ignore: ["node_modules", "dist", ".astro"],
    },
  };

  await fs.writeJSON(path.join(projectPath, "biome.json"), config, {
    spaces: 2,
  });
}

async function generateLefthookConfig(
  projectPath: string,
  options: AstroScaffoldOptions
): Promise<void> {
  const lintCommand =
    options.linter === "oxlint"
      ? "npx oxlint --fix {staged_files}"
      : options.linter === "biome"
        ? "npx biome check --write {staged_files}"
        : "npx eslint --fix {staged_files}";

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
      glob: "*.{js,jsx,ts,tsx,astro}"
      run: ${lintCommand}
      stage_fixed: true
    format:
      glob: "*.{js,jsx,ts,tsx,json,css,md,astro}"
      run: ${formatCommand}
      stage_fixed: true
    typecheck:
      run: npx astro check
`;

  await fs.writeFile(path.join(projectPath, "lefthook.yml"), config);
}

async function generateHuskyConfig(
  projectPath: string,
  options: AstroScaffoldOptions
): Promise<void> {
  // Create .husky directory
  const huskyDir = path.join(projectPath, ".husky");
  await fs.ensureDir(huskyDir);

  // Create pre-commit hook
  const lintCommand =
    options.linter === "oxlint"
      ? "npx oxlint --fix"
      : options.linter === "biome"
        ? "npx biome check --write"
        : "npx eslint --fix";

  const preCommit = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
`;

  await fs.writeFile(path.join(huskyDir, "pre-commit"), preCommit, {
    mode: 0o755,
  });

  // Create lint-staged config (ESM format for modern projects)
  const formatCommand =
    options.formatter === "oxfmt"
      ? "oxfmt"
      : options.formatter === "biome"
        ? "biome format --write"
        : "prettier --write";

  const lintStagedConfig = `export default {
  '*.{js,jsx,ts,tsx,astro}': ['${lintCommand}', '${formatCommand}'],
  '*.{json,css,md}': ['${formatCommand}'],
};
`;

  await fs.writeFile(
    path.join(projectPath, "lint-staged.config.js"),
    lintStagedConfig
  );
}

async function generateConvexSetup(projectPath: string): Promise<void> {
  // Create convex directory
  const convexDir = path.join(projectPath, "convex");
  await fs.ensureDir(convexDir);

  // Create convex schema
  const schemaContent = `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Example table - customize as needed
  posts: defineTable({
    title: v.string(),
    content: v.string(),
    published: v.boolean(),
  }),
});
`;

  await fs.writeFile(path.join(convexDir, "schema.ts"), schemaContent);

  // Create convex functions file
  const functionsContent = `import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("posts").collect();
  },
});

export const create = mutation({
  args: { title: v.string(), content: v.string() },
  handler: async (ctx, args) => {
    const postId = await ctx.db.insert("posts", {
      title: args.title,
      content: args.content,
      published: false,
    });
    return postId;
  },
});
`;

  await fs.writeFile(path.join(convexDir, "posts.ts"), functionsContent);

  // Create React island provider for Convex
  const providerContent = `import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convex = new ConvexReactClient(import.meta.env.PUBLIC_CONVEX_URL as string);

interface Props {
  children: ReactNode;
}

export function ConvexClientProvider({ children }: Props) {
  return (
    <ConvexProvider client={convex}>
      {children}
    </ConvexProvider>
  );
}
`;

  const componentsDir = path.join(projectPath, "src", "components");
  await fs.ensureDir(componentsDir);
  await fs.writeFile(
    path.join(componentsDir, "ConvexProvider.tsx"),
    providerContent
  );
}

async function generateSupabaseSetup(projectPath: string): Promise<void> {
  // Create lib directory for supabase client
  const libDir = path.join(projectPath, "src", "lib");
  await fs.ensureDir(libDir);

  const supabaseClientContent = `import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
`;

  await fs.writeFile(
    path.join(libDir, "supabase.ts"),
    supabaseClientContent
  );
}

async function generateClerkSetup(projectPath: string): Promise<void> {
  // Create middleware for Clerk
  const middlewareContent = `import { clerkMiddleware } from '@clerk/astro/server';

export const onRequest = clerkMiddleware();
`;

  await fs.writeFile(
    path.join(projectPath, "src", "middleware.ts"),
    middlewareContent
  );

  // Update astro.config.mjs to include Clerk integration
  // Note: The Clerk integration should be added via astro add clerk, but we provide a helper
  const clerkEnvContent = `// Add to astro.config.mjs:
// import clerk from '@clerk/astro';
//
// export default defineConfig({
//   integrations: [clerk()],
// });
//
// Clerk components are available in .astro files:
// <SignIn /> <SignUp /> <UserButton /> etc.
`;

  const docsDir = path.join(projectPath, "docs");
  await fs.ensureDir(docsDir);
  await fs.writeFile(
    path.join(docsDir, "clerk-setup.md"),
    clerkEnvContent
  );
}

async function generateBetterAuthSetup(projectPath: string): Promise<void> {
  // Create auth directory
  const authDir = path.join(projectPath, "src", "lib");
  await fs.ensureDir(authDir);

  // Create auth configuration
  const authContent = `import { betterAuth } from 'better-auth';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';

const sql = neon(import.meta.env.DATABASE_URL!);
const db = drizzle(sql);

export const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
  },
  // Add more providers as needed:
  // socialProviders: {
  //   github: {
  //     clientId: import.meta.env.GITHUB_CLIENT_ID,
  //     clientSecret: import.meta.env.GITHUB_CLIENT_SECRET,
  //   },
  // },
});
`;

  await fs.writeFile(path.join(authDir, "auth.ts"), authContent);

  // Create API route for auth
  const pagesDir = path.join(projectPath, "src", "pages", "api", "auth");
  await fs.ensureDir(pagesDir);

  const authApiContent = `import type { APIRoute } from 'astro';
import { auth } from '../../../lib/auth';

export const ALL: APIRoute = async (ctx) => {
  return auth.handler(ctx.request);
};
`;

  await fs.writeFile(
    path.join(pagesDir, "[...all].ts"),
    authApiContent
  );
}

async function generateContentCollections(projectPath: string): Promise<void> {
  // Create content directory structure
  const contentDir = path.join(projectPath, "src", "content");
  await fs.ensureDir(path.join(contentDir, "blog"));

  // Create content config
  const contentConfigContent = `import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
`;

  await fs.writeFile(
    path.join(contentDir, "config.ts"),
    contentConfigContent
  );

  // Create example blog post
  const examplePost = `---
title: 'Welcome to Astro'
description: 'Your first blog post built with Astro and MDX'
pubDate: '${new Date().toISOString().split("T")[0]}'
heroImage: '/blog-placeholder.jpg'
---

# Welcome

This is your first blog post using **Astro's Content Collections** with MDX support.

## Features

- Type-safe frontmatter with Zod schemas
- MDX support for interactive components
- Fast builds with Astro 5's Content Layer API

## Code Example

\`\`\`typescript
const message = "Hello, Astro!";
console.log(message);
\`\`\`
`;

  await fs.writeFile(
    path.join(contentDir, "blog", "first-post.mdx"),
    examplePost
  );
}

async function generateEnvTemplate(
  projectPath: string,
  options: AstroScaffoldOptions
): Promise<void> {
  const envLines: string[] = [
    "# Environment Variables",
    "# Copy this file to .env and fill in your values",
    "# For Astro, prefix public variables with PUBLIC_",
    "",
  ];

  // Database
  if (options.orm && options.orm !== "none") {
    envLines.push("# Database");
    if (options.deployment === "cloudflare") {
      envLines.push("CLOUDFLARE_ACCOUNT_ID=");
      envLines.push("CLOUDFLARE_D1_DATABASE_ID=");
      envLines.push("CLOUDFLARE_API_TOKEN=");
    } else {
      envLines.push("DATABASE_URL=");
    }
    envLines.push("");
  }

  // Backend
  if (options.backend === "supabase" || options.auth === "supabase-auth") {
    envLines.push("# Supabase");
    envLines.push("PUBLIC_SUPABASE_URL=");
    envLines.push("PUBLIC_SUPABASE_ANON_KEY=");
    envLines.push("SUPABASE_SERVICE_ROLE_KEY=");
    envLines.push("");
  }

  if (options.backend === "convex") {
    envLines.push("# Convex");
    envLines.push("PUBLIC_CONVEX_URL=");
    envLines.push("");
  }

  if (options.backend === "firebase") {
    envLines.push("# Firebase");
    envLines.push("PUBLIC_FIREBASE_API_KEY=");
    envLines.push("PUBLIC_FIREBASE_AUTH_DOMAIN=");
    envLines.push("PUBLIC_FIREBASE_PROJECT_ID=");
    envLines.push("");
  }

  // Auth
  if (options.auth === "clerk") {
    envLines.push("# Clerk");
    envLines.push("PUBLIC_CLERK_PUBLISHABLE_KEY=");
    envLines.push("CLERK_SECRET_KEY=");
    envLines.push("");
  }

  if (options.auth === "better-auth") {
    envLines.push("# Better Auth");
    envLines.push("BETTER_AUTH_SECRET=");
    envLines.push("BETTER_AUTH_URL=http://localhost:4321");
    envLines.push("");
  }

  await fs.writeFile(
    path.join(projectPath, ".env.example"),
    envLines.join("\n")
  );

  // Also create .env with empty values
  await fs.writeFile(path.join(projectPath, ".env"), envLines.join("\n"));
}

// ============================================================================
// Next Steps Builder
// ============================================================================

/**
 * Build list of next steps for the user
 */
function buildNextSteps(options: AstroScaffoldOptions): string[] {
  const steps: string[] = [];

  steps.push(`cd ${options.projectName}`);

  // Environment setup
  if (options.orm || options.backend || options.auth) {
    steps.push("Copy .env.example to .env and fill in your values");
  }

  // Convex setup
  if (options.backend === "convex") {
    steps.push("Run `npx convex dev` to set up Convex backend");
  }

  // Database setup
  if (options.orm === "drizzle") {
    if (options.deployment === "cloudflare") {
      steps.push("Set up Cloudflare D1 database and configure wrangler.toml");
      steps.push("Run `npx drizzle-kit push` to push schema");
    } else {
      steps.push("Set up your database and run `npx drizzle-kit push`");
    }
  }
  if (options.orm === "prisma") {
    steps.push("Run `npx prisma init` to set up Prisma schema");
    steps.push("Run `npx prisma db push` after configuring your schema");
  }

  // Clerk setup
  if (options.auth === "clerk") {
    steps.push("Run `npx astro add @clerk/astro` to complete Clerk setup");
  }

  // Playwright browsers
  if (options.e2eTesting === "playwright") {
    steps.push("Run `npx playwright install` to install browsers");
  }

  // prek installation
  if (options.preCommit === "prek") {
    steps.push(
      "Install prek: `cargo install prek` or download from GitHub releases"
    );
  }

  // Lefthook installation
  if (options.preCommit === "lefthook") {
    steps.push("Run `npx lefthook install` to set up git hooks");
  }

  // Husky installation
  if (options.preCommit === "husky") {
    steps.push("Run `npx husky install` to set up git hooks");
  }

  // Start dev server
  const pm = options.packageManager ?? "bun";
  const runCmd = pm === "npm" ? "npm run" : pm;
  steps.push(`Run \`${runCmd} dev\` to start the development server`);

  return steps;
}

// ============================================================================
// Exports
// ============================================================================

export {
  buildCreateAstroArgs,
  collectAdditionalDependencies,
  buildNextSteps,
};
