/**
 * React Router v7 (Framework Mode) scaffolder wrapper
 * Wraps `create-react-router` with bootstralph-specific configurations
 * React Router v7 is the successor to Remix v2, using Vite for bundling
 */

import * as p from "@clack/prompts";
import { execa, type Options as ExecaOptions } from "execa";
import path from "node:path";
import fs from "fs-extra";
import type { ScaffoldResult } from "./base.js";
import type {
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

export interface ReactRouterScaffoldOptions {
  /** Project name/directory */
  projectName: string;
  /** Target directory (defaults to cwd/projectName) */
  targetDir?: string;
  /** Styling choice from wizard */
  styling?: Styling;
  /** State management choices */
  state?: StateManagement[];
  /** ORM choice */
  orm?: ORM;
  /** Backend service choice */
  backend?: Backend;
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
  /** E2E test framework */
  e2eTesting?: E2ETestFramework;
  /** Pre-commit tool */
  preCommit?: PreCommitTool;
  /** Package manager to use */
  packageManager?: "bun" | "pnpm" | "npm" | "yarn";
  /** Template to use (from remix-run/react-router-templates) */
  template?: string;
}

// ============================================================================
// Main Scaffold Function
// ============================================================================

/**
 * Scaffold a new React Router v7 project using create-react-router
 * Then applies bootstralph-specific configurations
 */
export async function scaffoldReactRouter(
  options: ReactRouterScaffoldOptions
): Promise<ScaffoldResult> {
  const {
    projectName,
    targetDir = process.cwd(),
    styling = "tailwind-shadcn",
    packageManager = "bun",
  } = options;

  const projectPath = path.join(targetDir, projectName);
  const errors: string[] = [];
  const warnings: string[] = [];
  const nextSteps: string[] = [];

  // ============================================================================
  // Step 1: Run create-react-router
  // ============================================================================

  const spinner = p.spinner();
  spinner.start("Creating React Router v7 project...");

  try {
    const createReactRouterArgs = buildCreateReactRouterArgs({
      projectName,
      packageManager,
      template: options.template,
    });

    await runCreateReactRouter(createReactRouterArgs, { cwd: targetDir });
    spinner.stop("React Router v7 project created");
  } catch (error) {
    spinner.stop("Failed to create React Router v7 project");
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`create-react-router failed: ${errorMessage}`);
    return { success: false, projectPath, errors };
  }

  // ============================================================================
  // Step 2: Set up Tailwind (if styling includes tailwind)
  // ============================================================================

  if (styling === "tailwind-shadcn" || styling === "tailwind") {
    spinner.start("Setting up Tailwind CSS...");
    try {
      await setupTailwind(projectPath, packageManager);
      spinner.stop("Tailwind CSS configured");
    } catch (error) {
      spinner.stop("Tailwind setup had issues");
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      warnings.push(`Tailwind setup warning: ${errorMessage}`);
    }
  }

  // ============================================================================
  // Step 3: Set up shadcn/ui (if tailwind-shadcn selected)
  // ============================================================================

  if (styling === "tailwind-shadcn") {
    spinner.start("Setting up shadcn/ui...");
    try {
      await setupShadcnUI(projectPath, packageManager);
      spinner.stop("shadcn/ui configured");
    } catch (error) {
      spinner.stop("shadcn/ui setup had issues");
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      warnings.push(`shadcn/ui setup warning: ${errorMessage}`);
      nextSteps.push("Run `npx shadcn@latest init` to complete shadcn/ui setup");
    }
  }

  // ============================================================================
  // Step 4: Install additional dependencies based on selections
  // ============================================================================

  const additionalDeps = collectAdditionalDependencies(options);

  if (additionalDeps.dependencies.length > 0 || additionalDeps.devDependencies.length > 0) {
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
  // Step 5: Generate configuration files
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
  // Step 6: Build next steps list
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
// create-react-router Arguments
// ============================================================================

interface CreateReactRouterArgsOptions {
  projectName: string;
  packageManager: "bun" | "pnpm" | "npm" | "yarn";
  template?: string | undefined;
}

/**
 * Build arguments array for create-react-router
 * The CLI supports: --template, --yes (non-interactive)
 */
function buildCreateReactRouterArgs(options: CreateReactRouterArgsOptions): string[] {
  const { projectName, template } = options;

  const args: string[] = [projectName];

  // Use template if specified (e.g., remix-run/react-router-templates/basic)
  if (template) {
    args.push("--template", template);
  }

  // Non-interactive mode to avoid prompts
  args.push("--yes");

  return args;
}

/**
 * Execute create-react-router with the given arguments
 */
async function runCreateReactRouter(
  args: string[],
  execaOptions: ExecaOptions
): Promise<void> {
  // Use npx to run create-react-router@latest
  await execa("npx", ["create-react-router@latest", ...args], {
    ...execaOptions,
    stdio: "pipe",
  });
}

// ============================================================================
// Tailwind Setup
// ============================================================================

/**
 * Set up Tailwind CSS in the React Router v7 project
 */
async function setupTailwind(
  projectPath: string,
  packageManager: string
): Promise<void> {
  // Install Tailwind and its dependencies
  const addCmd = packageManager === "npm" ? "install" : "add";
  const devFlag = packageManager === "npm" ? "--save-dev" : "-D";

  await execa(
    packageManager,
    [addCmd, devFlag, "tailwindcss", "@tailwindcss/vite", "autoprefixer"],
    {
      cwd: projectPath,
      stdio: "pipe",
    }
  );

  // Create tailwind.config.ts
  const tailwindConfig = `import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/{**,.client,.server}/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
`;

  await fs.writeFile(path.join(projectPath, "tailwind.config.ts"), tailwindConfig);

  // Update vite.config.ts to include Tailwind plugin
  const viteConfigPath = path.join(projectPath, "vite.config.ts");
  if (await fs.pathExists(viteConfigPath)) {
    let viteConfig = await fs.readFile(viteConfigPath, "utf-8");

    // Add Tailwind import if not present
    if (!viteConfig.includes("@tailwindcss/vite")) {
      viteConfig = `import tailwindcss from '@tailwindcss/vite';\n${viteConfig}`;

      // Add Tailwind to plugins array
      viteConfig = viteConfig.replace(
        /plugins:\s*\[/,
        "plugins: [\n    tailwindcss(),"
      );

      await fs.writeFile(viteConfigPath, viteConfig);
    }
  }

  // Create/update global CSS file with Tailwind directives
  const stylesDir = path.join(projectPath, "app");
  await fs.ensureDir(stylesDir);

  const globalCss = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

  await fs.writeFile(path.join(stylesDir, "tailwind.css"), globalCss);
}

// ============================================================================
// shadcn/ui Setup
// ============================================================================

/**
 * Initialize shadcn/ui in the project
 */
async function setupShadcnUI(
  projectPath: string,
  packageManager: string
): Promise<void> {
  // Create components.json for shadcn/ui
  const componentsConfig = {
    $schema: "https://ui.shadcn.com/schema.json",
    style: "new-york",
    rsc: false, // React Router v7 RSC support is still preview/unstable
    tsx: true,
    tailwind: {
      config: "tailwind.config.ts",
      css: "app/tailwind.css",
      baseColor: "neutral",
      cssVariables: true,
      prefix: "",
    },
    aliases: {
      components: "~/components",
      utils: "~/lib/utils",
      ui: "~/components/ui",
      lib: "~/lib",
      hooks: "~/hooks",
    },
    iconLibrary: "lucide",
  };

  await fs.writeJSON(path.join(projectPath, "components.json"), componentsConfig, {
    spaces: 2,
  });

  // Create lib/utils.ts for cn() helper
  const libDir = path.join(projectPath, "app", "lib");
  await fs.ensureDir(libDir);

  const utilsContent = `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

  await fs.writeFile(path.join(libDir, "utils.ts"), utilsContent);

  // Install shadcn dependencies
  const addCmd = packageManager === "npm" ? "install" : "add";
  await execa(
    packageManager,
    [addCmd, "clsx", "tailwind-merge", "class-variance-authority", "lucide-react"],
    {
      cwd: projectPath,
      stdio: "pipe",
    }
  );
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
  options: ReactRouterScaffoldOptions
): DependencyList {
  const deps: string[] = [];
  const devDeps: string[] = [];

  // State management
  if (options.state) {
    for (const state of options.state) {
      switch (state) {
        case "zustand":
          deps.push("zustand");
          break;
        case "jotai":
          deps.push("jotai");
          break;
        case "tanstack-query":
          deps.push("@tanstack/react-query");
          devDeps.push("@tanstack/react-query-devtools");
          break;
      }
    }
  }

  // ORM
  if (options.orm && options.orm !== "none") {
    switch (options.orm) {
      case "drizzle":
        deps.push("drizzle-orm");
        devDeps.push("drizzle-kit");
        // Add appropriate driver based on deployment target
        if (options.deployment === "cloudflare") {
          // Cloudflare D1 or Turso
          deps.push("@libsql/client");
        } else {
          // Default to Neon for Vercel/generic or postgres
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
        deps.push("@supabase/supabase-js", "@supabase/ssr");
        break;
      case "convex":
        deps.push("convex");
        break;
      case "firebase":
        deps.push("firebase");
        break;
    }
  }

  // Auth
  if (options.auth) {
    switch (options.auth) {
      case "better-auth":
        deps.push("better-auth");
        break;
      case "clerk":
        // Clerk has react-router specific package
        deps.push("@clerk/react-router");
        break;
      case "supabase-auth":
        // Already installed with supabase backend
        if (!options.backend || options.backend !== "supabase") {
          deps.push("@supabase/supabase-js", "@supabase/ssr");
        }
        break;
    }
  }

  // Testing - Vitest is the default for React Router v7 (Vite-based)
  if (options.unitTesting === "vitest") {
    devDeps.push("vitest", "@vitejs/plugin-react", "@testing-library/react", "@testing-library/jest-dom", "jsdom");
  }

  if (options.e2eTesting === "playwright") {
    devDeps.push("@playwright/test");
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
      // ESLint is typically included by default
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
  options: ReactRouterScaffoldOptions
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
    configGenerators.push(() => generateDrizzleConfig(projectPath, options.deployment));
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

  // Convex setup
  if (options.backend === "convex") {
    configGenerators.push(() => generateConvexSetup(projectPath));
  }

  // Supabase client setup
  if (options.backend === "supabase" || options.auth === "supabase-auth") {
    configGenerators.push(() => generateSupabaseSetup(projectPath));
  }

  // Environment variables template
  configGenerators.push(() => generateEnvTemplate(projectPath, options));

  // Run all generators
  await Promise.all(configGenerators.map((gen) => gen()));
}

async function generateVitestConfig(projectPath: string): Promise<void> {
  // Check if vitest config already exists
  const existingConfig = path.join(projectPath, "vitest.config.ts");
  if (await fs.pathExists(existingConfig)) {
    return;
  }

  const config = `import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./app/test/setup.ts'],
    include: ['app/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
});
`;

  await fs.writeFile(existingConfig, config);

  // Create test setup file
  const setupDir = path.join(projectPath, "app", "test");
  await fs.ensureDir(setupDir);

  const setupContent = `import '@testing-library/jest-dom';
`;

  await fs.writeFile(path.join(setupDir, "setup.ts"), setupContent);

  // Add vite-tsconfig-paths as dev dependency
  const pkgJsonPath = path.join(projectPath, "package.json");
  if (await fs.pathExists(pkgJsonPath)) {
    const pkgJson = await fs.readJSON(pkgJsonPath);
    pkgJson.devDependencies = pkgJson.devDependencies || {};
    pkgJson.devDependencies["vite-tsconfig-paths"] = "^4.0.0";
    await fs.writeJSON(pkgJsonPath, pkgJson, { spaces: 2 });
  }
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
    baseURL: 'http://localhost:5173',
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
    url: 'http://localhost:5173',
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
  await expect(page).toHaveTitle(/React Router/);
});
`;

  await fs.writeFile(path.join(e2eDir, "example.spec.ts"), exampleTest);
}

async function generateDrizzleConfig(
  projectPath: string,
  deployment?: DeploymentTarget
): Promise<void> {
  // Determine dialect based on deployment target
  const isCloudflare = deployment === "cloudflare";

  const config = isCloudflare
    ? `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './app/db/schema.ts',
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
  schema: './app/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
`;

  await fs.writeFile(path.join(projectPath, "drizzle.config.ts"), config);

  // Create db directory and schema file
  const dbDir = path.join(projectPath, "app", "db");
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

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
`;

  await fs.writeFile(path.join(dbDir, "index.ts"), clientContent);
}

async function generateOxlintConfig(projectPath: string): Promise<void> {
  const config = {
    $schema: "https://raw.githubusercontent.com/oxc-project/oxc/main/crates/oxc_linter/src/schema.json",
    plugins: ["typescript", "react", "react-hooks", "jsx-a11y"],
    rules: {
      "no-unused-vars": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
    ignore: ["node_modules", "build", ".react-router"],
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
      ignore: ["node_modules", "build", ".react-router"],
    },
  };

  await fs.writeJSON(path.join(projectPath, "biome.json"), config, {
    spaces: 2,
  });
}

async function generateLefthookConfig(
  projectPath: string,
  options: ReactRouterScaffoldOptions
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
      glob: "*.{js,jsx,ts,tsx}"
      run: ${lintCommand}
      stage_fixed: true
    format:
      glob: "*.{js,jsx,ts,tsx,json,css,md}"
      run: ${formatCommand}
      stage_fixed: true
    typecheck:
      run: npx tsc --noEmit
`;

  await fs.writeFile(path.join(projectPath, "lefthook.yml"), config);
}

async function generateHuskyConfig(
  projectPath: string,
  options: ReactRouterScaffoldOptions
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

  const preCommitContent = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
`;

  await fs.writeFile(path.join(huskyDir, "pre-commit"), preCommitContent);
  await fs.chmod(path.join(huskyDir, "pre-commit"), 0o755);

  // Create lint-staged.config.js (ESM format)
  const lintStagedConfig = `export default {
  '*.{js,jsx,ts,tsx}': [
    '${lintCommand}',
    '${options.formatter === "biome" ? "npx biome format --write" : options.formatter === "oxfmt" ? "npx oxfmt" : "npx prettier --write"}',
  ],
  '*.{json,css,md}': [
    '${options.formatter === "biome" ? "npx biome format --write" : "npx prettier --write"}',
  ],
};
`;

  await fs.writeFile(path.join(projectPath, "lint-staged.config.js"), lintStagedConfig);
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
  tasks: defineTable({
    text: v.string(),
    isCompleted: v.boolean(),
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
    return await ctx.db.query("tasks").collect();
  },
});

export const create = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const taskId = await ctx.db.insert("tasks", {
      text: args.text,
      isCompleted: false,
    });
    return taskId;
  },
});
`;

  await fs.writeFile(path.join(convexDir, "tasks.ts"), functionsContent);

  // Create Convex provider for React Router
  const providerContent = `import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProvider client={convex}>
      {children}
    </ConvexProvider>
  );
}
`;

  const providersDir = path.join(projectPath, "app", "providers");
  await fs.ensureDir(providersDir);
  await fs.writeFile(path.join(providersDir, "convex.tsx"), providerContent);
}

async function generateSupabaseSetup(projectPath: string): Promise<void> {
  // Create lib directory if not exists
  const libDir = path.join(projectPath, "app", "lib");
  await fs.ensureDir(libDir);

  // Create Supabase client
  const clientContent = `import { createBrowserClient, createServerClient } from '@supabase/ssr';

// Browser client for client-side usage
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!
  );
}

// Server client for loaders/actions
export function createSupabaseServerClient(request: Request) {
  const cookies = Object.fromEntries(
    request.headers.get('Cookie')?.split('; ').map(c => c.split('=')) || []
  );

  return createServerClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(key) {
          return cookies[key];
        },
        set() {
          // Set via response headers in your loader/action
        },
        remove() {
          // Remove via response headers in your loader/action
        },
      },
    }
  );
}
`;

  await fs.writeFile(path.join(libDir, "supabase.ts"), clientContent);
}

async function generateEnvTemplate(
  projectPath: string,
  options: ReactRouterScaffoldOptions
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
    envLines.push("VITE_SUPABASE_URL=");
    envLines.push("VITE_SUPABASE_ANON_KEY=");
    envLines.push("SUPABASE_SERVICE_ROLE_KEY=");
    envLines.push("");
  }

  if (options.backend === "convex") {
    envLines.push("# Convex");
    envLines.push("VITE_CONVEX_URL=");
    envLines.push("");
  }

  if (options.backend === "firebase") {
    envLines.push("# Firebase");
    envLines.push("VITE_FIREBASE_API_KEY=");
    envLines.push("VITE_FIREBASE_AUTH_DOMAIN=");
    envLines.push("VITE_FIREBASE_PROJECT_ID=");
    envLines.push("VITE_FIREBASE_STORAGE_BUCKET=");
    envLines.push("VITE_FIREBASE_MESSAGING_SENDER_ID=");
    envLines.push("VITE_FIREBASE_APP_ID=");
    envLines.push("");
  }

  // Auth
  if (options.auth === "clerk") {
    envLines.push("# Clerk");
    envLines.push("VITE_CLERK_PUBLISHABLE_KEY=");
    envLines.push("CLERK_SECRET_KEY=");
    envLines.push("");
  }

  if (options.auth === "better-auth") {
    envLines.push("# Better Auth");
    envLines.push("BETTER_AUTH_SECRET=");
    envLines.push("BETTER_AUTH_URL=http://localhost:5173");
    envLines.push("");
  }

  await fs.writeFile(
    path.join(projectPath, ".env.example"),
    envLines.join("\n")
  );

  // Also create .env with empty values
  await fs.writeFile(
    path.join(projectPath, ".env"),
    envLines.join("\n")
  );
}

// ============================================================================
// Next Steps Builder
// ============================================================================

/**
 * Build list of next steps for the user
 */
function buildNextSteps(options: ReactRouterScaffoldOptions): string[] {
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
  steps.push(`Run \`${pm} run dev\` to start the development server`);

  return steps;
}

// ============================================================================
// Exports
// ============================================================================

export { buildCreateReactRouterArgs, collectAdditionalDependencies, buildNextSteps };
