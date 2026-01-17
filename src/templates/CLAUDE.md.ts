/**
 * CLAUDE.md template generator
 * Generates project-specific guidance for Claude Code based on scaffolded configuration
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

export interface ClaudeMdConfig {
  projectName: string;
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
}

// ============================================================================
// Template Sections
// ============================================================================

function generateHeader(config: ClaudeMdConfig): string {
  return `# ${config.projectName}

This project was scaffolded with [bootstralph](https://github.com/bootstralph/bootstralph) - a CLI for Ralph-powered project scaffolding.`;
}

function generateProjectOverview(config: ClaudeMdConfig): string {
  const frameworkName = getFrameworkDisplayName(config.framework);
  const platformName = getPlatformDisplayName(config.platform);

  return `## Project Overview

- **Platform**: ${platformName}
- **Framework**: ${frameworkName}
- **Package Manager**: ${config.packageManager}`;
}

function generateTechStack(config: ClaudeMdConfig): string {
  const lines: string[] = ["## Tech Stack"];

  // Core framework
  lines.push(`\n### Core\n- **Framework**: ${getFrameworkDisplayName(config.framework)}`);

  // Styling
  if (config.styling) {
    lines.push(`- **Styling**: ${getStylingDisplayName(config.styling)}`);
  }

  // State management
  if (config.state && config.state.length > 0) {
    const stateNames = config.state.map(getStateDisplayName).join(", ");
    lines.push(`- **State Management**: ${stateNames}`);
  }

  // Database/ORM
  if (config.orm && config.orm !== "none") {
    lines.push(`\n### Database\n- **ORM**: ${getOrmDisplayName(config.orm)}`);
  }

  // Backend
  if (config.backend) {
    lines.push(`- **Backend**: ${getBackendDisplayName(config.backend)}`);
  }

  // Auth
  if (config.auth) {
    lines.push(`\n### Authentication\n- **Provider**: ${getAuthDisplayName(config.auth)}`);
  }

  // Testing
  lines.push(`\n### Testing\n- **Unit Testing**: ${getTestingDisplayName(config.unitTesting)}`);
  if (config.e2eTesting) {
    lines.push(`- **E2E Testing**: ${getE2EDisplayName(config.e2eTesting)}`);
  }

  // Tooling
  lines.push(`\n### Tooling\n- **Linter**: ${getLinterDisplayName(config.linter)}`);
  lines.push(`- **Formatter**: ${getFormatterDisplayName(config.formatter)}`);
  lines.push(`- **Pre-commit Hooks**: ${getPreCommitDisplayName(config.preCommit)}`);

  // Deployment
  if (config.deployment) {
    lines.push(`\n### Deployment\n- **Target**: ${getDeploymentDisplayName(config.deployment)}`);
  }

  return lines.join("\n");
}

function generateDevelopmentWorkflow(config: ClaudeMdConfig): string {
  const pm = config.packageManager;
  const runCmd = pm === "npm" ? "npm run" : pm;

  const lines: string[] = [
    "## Development Workflow",
    "",
    "### Getting Started",
    "```bash",
    `# Install dependencies`,
    `${pm} install`,
    "",
    "# Start development server",
    `${runCmd} dev`,
    "```",
  ];

  // Testing commands
  lines.push("\n### Testing");
  lines.push("```bash");
  lines.push("# Run unit tests");
  lines.push(`${runCmd} test`);

  if (config.e2eTesting) {
    lines.push("");
    lines.push("# Run E2E tests");
    if (config.e2eTesting === "playwright") {
      lines.push(`${runCmd} test:e2e`);
    } else if (config.e2eTesting === "maestro") {
      lines.push("maestro test .maestro/");
    } else if (config.e2eTesting === "detox") {
      lines.push("detox test -c ios.sim.debug");
    }
  }
  lines.push("```");

  // Linting/formatting commands
  lines.push("\n### Code Quality");
  lines.push("```bash");
  lines.push("# Lint code");
  lines.push(`${runCmd} lint`);
  lines.push("");
  lines.push("# Format code");
  lines.push(`${runCmd} format`);
  lines.push("");
  lines.push("# Type check");
  lines.push(`${runCmd} typecheck`);
  lines.push("```");

  // Database commands
  if (config.orm && config.orm !== "none") {
    lines.push("\n### Database");
    lines.push("```bash");
    if (config.orm === "drizzle") {
      lines.push("# Generate migrations");
      lines.push(`${runCmd} db:generate`);
      lines.push("");
      lines.push("# Push schema changes");
      lines.push(`${runCmd} db:push`);
      lines.push("");
      lines.push("# Open Drizzle Studio");
      lines.push(`${runCmd} db:studio`);
    } else if (config.orm === "prisma") {
      lines.push("# Generate Prisma client");
      lines.push("npx prisma generate");
      lines.push("");
      lines.push("# Push schema changes");
      lines.push("npx prisma db push");
      lines.push("");
      lines.push("# Open Prisma Studio");
      lines.push("npx prisma studio");
    }
    lines.push("```");
  }

  return lines.join("\n");
}

function generateCodingStandards(config: ClaudeMdConfig): string {
  const lines: string[] = ["## Coding Standards"];

  // Framework-specific patterns
  lines.push("\n### Architecture Patterns");

  switch (config.framework) {
    case "nextjs":
      lines.push(`
- Use the **App Router** for all routing
- Prefer **Server Components** by default, use 'use client' only when needed
- Use **Server Actions** for mutations
- Keep components in \`src/components/\` with co-located styles
- Store shared utilities in \`src/lib/\`
- API routes go in \`src/app/api/\``);
      break;

    case "tanstack-start":
      lines.push(`
- Use **TanStack Router** for type-safe routing
- Leverage **Server Functions** for data loading
- Use **TanStack Query** for server state management
- Keep route files in \`app/routes/\`
- Store utilities in \`app/lib/\``);
      break;

    case "react-router":
      lines.push(`
- Use **loaders** for data fetching on routes
- Use **actions** for mutations
- Keep route files in \`app/routes/\`
- Use the \`~/\` import alias for app-relative imports
- Store utilities in \`app/lib/\``);
      break;

    case "astro":
      lines.push(`
- Use **Astro components** for static content
- Use **React islands** for interactive UI (add \`client:load\` or \`client:visible\`)
- Store content in \`src/content/\` with Content Collections
- API routes go in \`src/pages/api/\`
- Keep React components in \`src/components/\``);
      break;

    case "expo":
      lines.push(`
- Use **Expo Router** for file-based routing in \`app/\` directory
- Keep shared components in \`components/\`
- Store utilities in \`lib/\` or \`utils/\`
- Use **AsyncStorage** for local persistence
- Configure app in \`app.json\` or \`app.config.ts\``);
      break;

    case "react-native-cli":
      lines.push(`
- Use **React Navigation** for routing
- Keep navigation config in \`src/navigation/\`
- Store shared components in \`src/components/\`
- Use \`src/screens/\` for screen components
- Store utilities in \`src/utils/\``);
      break;

    case "hono":
    case "elysia":
      lines.push(`
- Keep route handlers organized by domain
- Use middleware for cross-cutting concerns
- Store shared utilities in \`src/lib/\`
- Keep database schema in \`src/db/\``);
      break;
  }

  // Styling patterns
  if (config.styling) {
    lines.push("\n### Styling");
    switch (config.styling) {
      case "tailwind-shadcn":
        lines.push(`
- Use **Tailwind CSS** utility classes for styling
- Import **shadcn/ui** components from \`@/components/ui/\`
- Use the \`cn()\` helper from \`@/lib/utils\` for conditional classes
- Keep custom component styles within the component file
- Use CSS variables for theming (defined in \`globals.css\`)`);
        break;

      case "tailwind":
        lines.push(`
- Use **Tailwind CSS** utility classes for styling
- Keep custom styles in \`@layer\` directives when needed
- Use \`@apply\` sparingly for truly reusable patterns`);
        break;

      case "uniwind":
      case "nativewind":
        lines.push(`
- Use **Tailwind CSS** syntax via ${config.styling === "uniwind" ? "Uniwind" : "NativeWind"}
- Apply classes using \`className\` prop
- Some Tailwind features may not be available on native`);
        break;

      case "tamagui":
        lines.push(`
- Use **Tamagui** components and styling system
- Leverage the optimizing compiler for production builds
- Use typed theme tokens for consistent styling
- Create custom components with \`styled()\``);
        break;
    }
  }

  // State management patterns
  if (config.state && config.state.length > 0) {
    lines.push("\n### State Management");
    if (config.state.includes("zustand")) {
      lines.push(`
- Use **Zustand** for client-side global state
- Keep stores in \`src/stores/\` or \`stores/\`
- Prefer atomic stores over monolithic state
- Use \`immer\` middleware for complex state updates`);
    }
    if (config.state.includes("tanstack-query")) {
      lines.push(`
- Use **TanStack Query** for server state (fetching, caching)
- Define query keys consistently
- Use \`queryOptions\` helper for type-safe queries
- Prefer optimistic updates for better UX`);
    }
    if (config.state.includes("jotai")) {
      lines.push(`
- Use **Jotai** for atomic state management
- Keep atoms in \`src/atoms/\` or co-locate with components
- Use derived atoms for computed values`);
    }
  }

  // Database patterns
  if (config.orm && config.orm !== "none") {
    lines.push("\n### Database");
    if (config.orm === "drizzle") {
      lines.push(`
- Define schema in \`src/db/schema.ts\`
- Use Drizzle's type-safe query builder
- Keep migrations in \`drizzle/\` directory
- Use transactions for multi-step operations`);
    } else if (config.orm === "prisma") {
      lines.push(`
- Define schema in \`prisma/schema.prisma\`
- Generate client after schema changes: \`npx prisma generate\`
- Use Prisma Client for all database operations
- Keep database utilities in \`src/lib/db.ts\``);
    }
  }

  // Auth patterns
  if (config.auth) {
    lines.push("\n### Authentication");
    switch (config.auth) {
      case "better-auth":
        lines.push(`
- Auth configuration in \`src/lib/auth.ts\`
- Use \`auth()\` helper to get session in server components/functions
- Protect routes with middleware
- Handle auth callbacks at \`/api/auth/[...all]\``);
        break;

      case "clerk":
        lines.push(`
- Use \`@clerk/nextjs\` (or framework-specific package) components
- Wrap app with \`ClerkProvider\`
- Use \`auth()\` or \`currentUser()\` for server-side auth
- Use \`useUser()\` hook for client-side auth state`);
        break;

      case "supabase-auth":
        lines.push(`
- Use \`@supabase/ssr\` for server-side auth
- Create client helpers in \`src/lib/supabase/\`
- Use middleware for session refresh
- Row Level Security (RLS) handles authorization`);
        break;
    }
  }

  return lines.join("\n");
}

function generateImportantFiles(config: ClaudeMdConfig): string {
  const lines: string[] = ["## Important Files"];

  // Configuration files
  lines.push("\n### Configuration");
  lines.push("- `package.json` - Dependencies and scripts");
  lines.push("- `tsconfig.json` - TypeScript configuration");

  if (config.framework === "nextjs") {
    lines.push("- `next.config.ts` - Next.js configuration");
  } else if (config.framework === "astro") {
    lines.push("- `astro.config.mjs` - Astro configuration");
  } else if (config.framework === "expo" || config.framework === "react-native-cli") {
    lines.push("- `app.json` or `app.config.ts` - App configuration");
    lines.push("- `metro.config.js` - Metro bundler configuration");
  }

  // Styling
  if (config.styling === "tailwind-shadcn" || config.styling === "tailwind") {
    lines.push("- `tailwind.config.ts` - Tailwind CSS configuration");
  }
  if (config.styling === "tamagui") {
    lines.push("- `tamagui.config.ts` - Tamagui configuration");
  }

  // Database
  if (config.orm === "drizzle") {
    lines.push("- `drizzle.config.ts` - Drizzle Kit configuration");
    lines.push("- `src/db/schema.ts` - Database schema definition");
  } else if (config.orm === "prisma") {
    lines.push("- `prisma/schema.prisma` - Prisma schema");
  }

  // Linting/Formatting
  if (config.linter === "oxlint") {
    lines.push("- `.oxlintrc.json` - oxlint configuration");
  } else if (config.linter === "biome") {
    lines.push("- `biome.json` - Biome configuration");
  } else if (config.linter === "eslint") {
    lines.push("- `eslint.config.js` or `.eslintrc.json` - ESLint configuration");
  }

  // Testing
  if (config.unitTesting === "vitest") {
    lines.push("- `vitest.config.ts` - Vitest configuration");
  }
  if (config.e2eTesting === "playwright") {
    lines.push("- `playwright.config.ts` - Playwright configuration");
  }

  // Pre-commit
  if (config.preCommit === "lefthook") {
    lines.push("- `lefthook.yml` - Git hooks configuration");
  }

  // Environment
  lines.push("\n### Environment");
  lines.push("- `.env.example` - Environment variables template");
  lines.push("- `.env.local` - Local environment variables (not committed)");

  return lines.join("\n");
}

function generateConventions(config: ClaudeMdConfig): string {
  return `## Conventions

### Git
- Write clear, concise commit messages
- Use conventional commits format: \`type(scope): description\`
- Run tests before committing (enforced by pre-commit hooks)

### Code Style
- Follow the configured linter rules (\`${config.linter}\`)
- Format code with \`${config.formatter}\` before committing
- Use TypeScript strict mode
- Prefer explicit types over \`any\`
- Use early returns to reduce nesting

### Testing
- Write tests for new features
- Maintain existing test coverage
- Name test files with \`.test.ts\` or \`.spec.ts\` suffix`;
}

function generateRalphNotes(): string {
  return `## Ralph Loop Notes

This project is configured for autonomous development with the Ralph Wiggum plugin.

### Running Ralph Loops
\`\`\`bash
# Start an autonomous loop
/ralph-loop "Your task description" --max-iterations 30

# With completion promise
/ralph-loop "Fix all type errors" --max-iterations 20 --completion-promise "COMPLETE"

# Cancel an active loop
/cancel-ralph
\`\`\`

### Best Practices for Ralph
- Always use \`--max-iterations\` as a safety limit
- Write specific, measurable task descriptions
- Break complex tasks into smaller loops
- The completion promise uses exact string matching`;
}

// ============================================================================
// Display Name Helpers
// ============================================================================

function getFrameworkDisplayName(framework: Framework): string {
  const names: Record<Framework, string> = {
    nextjs: "Next.js",
    "tanstack-start": "TanStack Start",
    "react-router": "React Router v7",
    astro: "Astro",
    expo: "Expo",
    "react-native-cli": "React Native CLI",
    hono: "Hono",
    elysia: "Elysia",
  };
  return names[framework];
}

function getPlatformDisplayName(platform: Platform): string {
  const names: Record<Platform, string> = {
    web: "Web",
    mobile: "Mobile (iOS & Android)",
    universal: "Universal (Web + Mobile)",
    api: "API Only",
  };
  return names[platform];
}

function getStylingDisplayName(styling: Styling): string {
  const names: Record<Styling, string> = {
    "tailwind-shadcn": "Tailwind CSS + shadcn/ui",
    tailwind: "Tailwind CSS",
    nativewind: "NativeWind",
    uniwind: "Uniwind",
    tamagui: "Tamagui",
    unistyles: "Unistyles",
    stylesheets: "StyleSheets",
    vanilla: "Vanilla CSS",
  };
  return names[styling];
}

function getStateDisplayName(state: StateManagement): string {
  const names: Record<StateManagement, string> = {
    zustand: "Zustand",
    jotai: "Jotai",
    "tanstack-query": "TanStack Query",
  };
  return names[state];
}

function getOrmDisplayName(orm: ORM): string {
  const names: Record<ORM, string> = {
    drizzle: "Drizzle ORM",
    prisma: "Prisma",
    none: "None",
  };
  return names[orm];
}

function getBackendDisplayName(backend: Backend): string {
  const names: Record<Backend, string> = {
    supabase: "Supabase",
    firebase: "Firebase",
    convex: "Convex",
    custom: "Custom Backend",
  };
  return names[backend];
}

function getAuthDisplayName(auth: AuthProvider): string {
  const names: Record<AuthProvider, string> = {
    "better-auth": "better-auth",
    clerk: "Clerk",
    "supabase-auth": "Supabase Auth",
  };
  return names[auth];
}

function getTestingDisplayName(testing: UnitTestFramework): string {
  const names: Record<UnitTestFramework, string> = {
    vitest: "Vitest",
    jest: "Jest",
  };
  return names[testing];
}

function getE2EDisplayName(testing: E2ETestFramework): string {
  const names: Record<E2ETestFramework, string> = {
    playwright: "Playwright",
    cypress: "Cypress",
    maestro: "Maestro",
    detox: "Detox",
  };
  return names[testing];
}

function getLinterDisplayName(linter: Linter): string {
  const names: Record<Linter, string> = {
    oxlint: "oxlint",
    biome: "Biome",
    eslint: "ESLint",
  };
  return names[linter];
}

function getFormatterDisplayName(formatter: Formatter): string {
  const names: Record<Formatter, string> = {
    oxfmt: "oxfmt",
    prettier: "Prettier",
    biome: "Biome",
  };
  return names[formatter];
}

function getPreCommitDisplayName(preCommit: PreCommitTool): string {
  const names: Record<PreCommitTool, string> = {
    prek: "prek",
    lefthook: "Lefthook",
    husky: "Husky",
  };
  return names[preCommit];
}

function getDeploymentDisplayName(deployment: DeploymentTarget): string {
  const names: Record<DeploymentTarget, string> = {
    vercel: "Vercel",
    netlify: "Netlify",
    cloudflare: "Cloudflare",
    "fly-io": "Fly.io",
    railway: "Railway",
    render: "Render",
    eas: "EAS Build",
    "local-builds": "Local Builds",
    fastlane: "Fastlane",
    codemagic: "Codemagic",
  };
  return names[deployment];
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate CLAUDE.md content based on project configuration
 */
export function generateClaudeMd(config: ClaudeMdConfig): string {
  const sections: string[] = [
    generateHeader(config),
    generateProjectOverview(config),
    generateTechStack(config),
    generateDevelopmentWorkflow(config),
    generateCodingStandards(config),
    generateImportantFiles(config),
    generateConventions(config),
    generateRalphNotes(),
  ];

  return sections.join("\n\n---\n\n");
}
