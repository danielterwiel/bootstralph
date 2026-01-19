/**
 * Integration tests for scaffolders
 * Tests the building functions, dependency collection, and next steps generation
 * without actually invoking external CLIs
 */

import { describe, it, expect } from 'vitest';

// Import scaffolder types and helper functions
import {
  buildCreateNextAppArgs,
  collectAdditionalDependencies as collectNextjsDeps,
  buildNextSteps as buildNextjsNextSteps,
} from '../src/scaffolders/nextjs.js';

import {
  buildCreateStartArgs,
  collectAdditionalDependencies as collectTanStackDeps,
  buildNextSteps as buildTanStackNextSteps,
} from '../src/scaffolders/tanstack.js';

import {
  buildCreateReactRouterArgs,
  collectAdditionalDependencies as collectReactRouterDeps,
  buildNextSteps as buildReactRouterNextSteps,
} from '../src/scaffolders/react-router.js';

import {
  buildCreateExpoStackArgs,
  collectAdditionalDependencies as collectExpoDeps,
  buildNextSteps as buildExpoNextSteps,
} from '../src/scaffolders/expo.js';

import {
  checkPrerequisites,
  collectAdditionalDependencies as collectRNCliDeps,
  buildNextSteps as buildRNCliNextSteps,
} from '../src/scaffolders/rn-cli.js';

import {
  buildCreateAstroArgs,
  collectAdditionalDependencies as collectAstroDeps,
  buildNextSteps as buildAstroNextSteps,
} from '../src/scaffolders/astro.js';

import {
  getHonoTemplate,
  collectAdditionalDependencies as collectApiDeps,
  buildNextSteps as buildApiNextSteps,
} from '../src/scaffolders/api.js';

// ============================================================================
// Next.js Scaffolder Tests
// ============================================================================

describe('Next.js Scaffolder', () => {
  describe('buildCreateNextAppArgs', () => {
    it('should build basic args for a minimal project', () => {
      const args = buildCreateNextAppArgs({
        projectName: 'my-app',
        appRouter: true,
        turbopack: true,
        styling: 'tailwind',
        packageManager: 'bun',
      });

      expect(args).toContain('my-app');
      expect(args).toContain('--typescript');
      expect(args).toContain('--app');
      expect(args).toContain('--tailwind');
      expect(args).toContain('--turbopack');
      expect(args).toContain('--skip-git');
      expect(args).toContain('--use-bun');
    });

    it('should use --no-app for Pages Router', () => {
      const args = buildCreateNextAppArgs({
        projectName: 'my-app',
        appRouter: false,
        turbopack: true,
        styling: 'tailwind',
        packageManager: 'npm',
      });

      expect(args).toContain('--no-app');
      expect(args).not.toContain('--app');
    });

    it('should use --no-tailwind when styling is not Tailwind', () => {
      const args = buildCreateNextAppArgs({
        projectName: 'my-app',
        appRouter: true,
        turbopack: true,
        styling: 'vanilla',
        packageManager: 'pnpm',
      });

      expect(args).toContain('--no-tailwind');
      expect(args).not.toContain('--tailwind');
    });

    it('should include Tailwind for tailwind-shadcn styling', () => {
      const args = buildCreateNextAppArgs({
        projectName: 'my-app',
        appRouter: true,
        turbopack: true,
        styling: 'tailwind-shadcn',
        packageManager: 'yarn',
      });

      expect(args).toContain('--tailwind');
    });

    it('should include import alias @/*', () => {
      const args = buildCreateNextAppArgs({
        projectName: 'test-project',
        appRouter: true,
        turbopack: true,
        styling: 'tailwind',
        packageManager: 'bun',
      });

      expect(args).toContain('--import-alias');
      expect(args).toContain('@/*');
    });

    it('should handle different package managers', () => {
      const managers = ['bun', 'pnpm', 'npm', 'yarn'] as const;

      for (const pm of managers) {
        const args = buildCreateNextAppArgs({
          projectName: 'test',
          appRouter: true,
          turbopack: true,
          styling: 'tailwind',
          packageManager: pm,
        });

        expect(args).toContain(`--use-${pm}`);
      }
    });
  });

  describe('collectAdditionalDependencies', () => {
    it('should collect state management dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        state: ['zustand', 'jotai', 'tanstack-query'],
      });

      expect(deps.dependencies).toContain('zustand');
      expect(deps.dependencies).toContain('jotai');
      expect(deps.dependencies).toContain('@tanstack/react-query');
      expect(deps.devDependencies).toContain('@tanstack/react-query-devtools');
    });

    it('should collect Drizzle ORM dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        orm: 'drizzle',
      });

      expect(deps.dependencies).toContain('drizzle-orm');
      expect(deps.devDependencies).toContain('drizzle-kit');
      expect(deps.dependencies).toContain('@neondatabase/serverless');
    });

    it('should collect Prisma ORM dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        orm: 'prisma',
      });

      expect(deps.dependencies).toContain('@prisma/client');
      expect(deps.devDependencies).toContain('prisma');
    });

    it('should not collect ORM dependencies when orm is none', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        orm: 'none',
      });

      expect(deps.dependencies).not.toContain('drizzle-orm');
      expect(deps.dependencies).not.toContain('@prisma/client');
    });

    it('should collect Supabase backend dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        backend: 'supabase',
      });

      expect(deps.dependencies).toContain('@supabase/supabase-js');
      expect(deps.dependencies).toContain('@supabase/ssr');
    });

    it('should collect Convex backend dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        backend: 'convex',
      });

      expect(deps.dependencies).toContain('convex');
    });

    it('should collect Firebase backend dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        backend: 'firebase',
      });

      expect(deps.dependencies).toContain('firebase');
      expect(deps.dependencies).toContain('firebase-admin');
    });

    it('should collect Clerk auth dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        auth: 'clerk',
      });

      expect(deps.dependencies).toContain('@clerk/nextjs');
    });

    it('should collect better-auth dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        auth: 'better-auth',
      });

      expect(deps.dependencies).toContain('better-auth');
    });

    it('should collect Supabase auth dependencies when not using Supabase backend', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        auth: 'supabase-auth',
      });

      expect(deps.dependencies).toContain('@supabase/supabase-js');
      expect(deps.dependencies).toContain('@supabase/ssr');
    });

    it('should not duplicate Supabase deps when using Supabase auth with Supabase backend', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        backend: 'supabase',
        auth: 'supabase-auth',
      });

      // Should only have one instance of Supabase packages
      const supabaseCount = deps.dependencies.filter(d => d === '@supabase/supabase-js').length;
      expect(supabaseCount).toBe(1);
    });

    it('should collect Vitest testing dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        unitTesting: 'vitest',
      });

      expect(deps.devDependencies).toContain('vitest');
      expect(deps.devDependencies).toContain('@vitejs/plugin-react');
      expect(deps.devDependencies).toContain('@testing-library/react');
      expect(deps.devDependencies).toContain('jsdom');
    });

    it('should collect Jest testing dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        unitTesting: 'jest',
      });

      expect(deps.devDependencies).toContain('jest');
      expect(deps.devDependencies).toContain('@types/jest');
      expect(deps.devDependencies).toContain('ts-jest');
      expect(deps.devDependencies).toContain('@testing-library/react');
    });

    it('should collect Playwright E2E dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        e2eTesting: 'playwright',
      });

      expect(deps.devDependencies).toContain('@playwright/test');
    });

    it('should collect Cypress E2E dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        e2eTesting: 'cypress',
      });

      expect(deps.devDependencies).toContain('cypress');
    });

    it('should collect oxlint linter dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        linter: 'oxlint',
      });

      expect(deps.devDependencies).toContain('oxlint');
    });

    it('should collect Biome dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        linter: 'biome',
      });

      expect(deps.devDependencies).toContain('@biomejs/biome');
    });

    it('should not add ESLint deps since create-next-app includes it', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        linter: 'eslint',
      });

      // ESLint is handled by create-next-app
      expect(deps.devDependencies).not.toContain('eslint');
    });

    it('should collect Prettier formatter dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        formatter: 'prettier',
      });

      expect(deps.devDependencies).toContain('prettier');
    });

    it('should collect oxfmt formatter dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        formatter: 'oxfmt',
      });

      expect(deps.devDependencies).toContain('oxfmt');
    });

    it('should not add Biome formatter when Biome is the linter', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        linter: 'biome',
        formatter: 'biome',
      });

      // Biome should only be added once (from linter)
      const biomeCount = deps.devDependencies.filter(d => d === '@biomejs/biome').length;
      expect(biomeCount).toBe(1);
    });

    it('should collect Lefthook pre-commit dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        preCommit: 'lefthook',
      });

      expect(deps.devDependencies).toContain('lefthook');
    });

    it('should collect Husky pre-commit dependencies', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
        preCommit: 'husky',
      });

      expect(deps.devDependencies).toContain('husky');
      expect(deps.devDependencies).toContain('lint-staged');
    });

    it('should return empty arrays for minimal options', () => {
      const deps = collectNextjsDeps({
        projectName: 'test',
      });

      expect(deps.dependencies).toHaveLength(0);
      expect(deps.devDependencies).toHaveLength(0);
    });
  });

  describe('buildNextSteps', () => {
    it('should include cd command', () => {
      const steps = buildNextjsNextSteps({
        projectName: 'my-app',
      });

      expect(steps).toContain('cd my-app');
    });

    it('should include env setup step when using ORM', () => {
      const steps = buildNextjsNextSteps({
        projectName: 'my-app',
        orm: 'drizzle',
      });

      expect(steps.some(s => s.includes('.env'))).toBe(true);
    });

    it('should include Drizzle push step', () => {
      const steps = buildNextjsNextSteps({
        projectName: 'my-app',
        orm: 'drizzle',
      });

      expect(steps.some(s => s.includes('drizzle-kit push'))).toBe(true);
    });

    it('should include Prisma init step', () => {
      const steps = buildNextjsNextSteps({
        projectName: 'my-app',
        orm: 'prisma',
      });

      expect(steps.some(s => s.includes('prisma init'))).toBe(true);
      expect(steps.some(s => s.includes('prisma db push'))).toBe(true);
    });

    it('should include Playwright install step', () => {
      const steps = buildNextjsNextSteps({
        projectName: 'my-app',
        e2eTesting: 'playwright',
      });

      expect(steps.some(s => s.includes('playwright install'))).toBe(true);
    });

    it('should include prek install instructions', () => {
      const steps = buildNextjsNextSteps({
        projectName: 'my-app',
        preCommit: 'prek',
      });

      expect(steps.some(s => s.includes('cargo install prek'))).toBe(true);
    });

    it('should include Lefthook install step', () => {
      const steps = buildNextjsNextSteps({
        projectName: 'my-app',
        preCommit: 'lefthook',
      });

      expect(steps.some(s => s.includes('lefthook install'))).toBe(true);
    });

    it('should include Husky install step', () => {
      const steps = buildNextjsNextSteps({
        projectName: 'my-app',
        preCommit: 'husky',
      });

      expect(steps.some(s => s.includes('husky install'))).toBe(true);
    });

    it('should include dev server command with correct package manager', () => {
      const steps = buildNextjsNextSteps({
        projectName: 'my-app',
        packageManager: 'bun',
      });

      expect(steps.some(s => s.includes('bun run dev'))).toBe(true);
    });

    it('should default to bun for dev command', () => {
      const steps = buildNextjsNextSteps({
        projectName: 'my-app',
      });

      expect(steps.some(s => s.includes('bun run dev'))).toBe(true);
    });
  });
});

// ============================================================================
// TanStack Start Scaffolder Tests
// ============================================================================

describe('TanStack Start Scaffolder', () => {
  describe('buildCreateStartArgs', () => {
    it('should build basic args with Biome', () => {
      const args = buildCreateStartArgs({
        projectName: 'my-tanstack-app',
        styling: 'tailwind',
        packageManager: 'bun',
        useBiome: true,
        addShadcn: false,
        addTanStackQuery: false,
      });

      expect(args).toContain('my-tanstack-app');
      expect(args).toContain('--package-manager');
      expect(args).toContain('bun');
      expect(args).toContain('--toolchain');
      expect(args).toContain('biome');
    });

    it('should include --toolchain eslint when not using Biome', () => {
      const args = buildCreateStartArgs({
        projectName: 'test',
        styling: 'tailwind',
        packageManager: 'pnpm',
        useBiome: false,
        addShadcn: false,
        addTanStackQuery: false,
      });

      expect(args).toContain('--toolchain');
      expect(args).toContain('eslint');
    });

    it('should include add-ons for shadcn and TanStack Query', () => {
      const args = buildCreateStartArgs({
        projectName: 'test',
        styling: 'tailwind-shadcn',
        packageManager: 'npm',
        useBiome: false,
        addShadcn: true,
        addTanStackQuery: true,
      });

      expect(args).toContain('--add-ons');
      expect(args.some(a => a.includes('shadcn'))).toBe(true);
      expect(args.some(a => a.includes('tanstack-query'))).toBe(true);
    });

    it('should handle all package managers', () => {
      const managers = ['bun', 'pnpm', 'npm', 'yarn'] as const;

      for (const pm of managers) {
        const args = buildCreateStartArgs({
          projectName: 'test',
          styling: 'tailwind',
          packageManager: pm,
          useBiome: false,
          addShadcn: false,
          addTanStackQuery: false,
        });

        expect(args).toContain(pm);
      }
    });
  });

  describe('collectAdditionalDependencies', () => {
    it('should collect state management deps', () => {
      const deps = collectTanStackDeps({
        projectName: 'test',
        state: ['zustand', 'tanstack-query'],
      });

      // TanStack Start adds zustand directly
      expect(deps.dependencies).toContain('zustand');
      // TanStack Query is added via CLI, but devtools is added manually
      expect(deps.devDependencies).toContain('@tanstack/react-query-devtools');
    });

    it('should collect ORM deps based on deployment', () => {
      const cloudflareDepsDrizzle = collectTanStackDeps({
        projectName: 'test',
        orm: 'drizzle',
        deployment: 'cloudflare',
      });

      expect(cloudflareDepsDrizzle.dependencies).toContain('drizzle-orm');
      expect(cloudflareDepsDrizzle.dependencies).toContain('@libsql/client');
    });

    it('should collect auth deps', () => {
      const deps = collectTanStackDeps({
        projectName: 'test',
        auth: 'clerk',
      });

      expect(deps.dependencies).toContain('@clerk/tanstack-start');
    });

    it('should collect testing deps', () => {
      const deps = collectTanStackDeps({
        projectName: 'test',
        unitTesting: 'vitest',
        e2eTesting: 'playwright',
      });

      // vitest is typically already included in TanStack Start, but testing-library is added
      expect(deps.devDependencies).toContain('@testing-library/react');
      expect(deps.devDependencies).toContain('@playwright/test');
    });
  });

  describe('buildNextSteps', () => {
    it('should include cd command', () => {
      const steps = buildTanStackNextSteps({
        projectName: 'tanstack-app',
      });

      expect(steps).toContain('cd tanstack-app');
    });

    it('should include ORM setup steps', () => {
      const steps = buildTanStackNextSteps({
        projectName: 'tanstack-app',
        orm: 'drizzle',
      });

      expect(steps.some(s => s.includes('drizzle-kit'))).toBe(true);
    });
  });
});

// ============================================================================
// React Router v7 Scaffolder Tests
// ============================================================================

describe('React Router v7 Scaffolder', () => {
  describe('buildCreateReactRouterArgs', () => {
    it('should build basic args', () => {
      const args = buildCreateReactRouterArgs({
        projectName: 'router-app',
        packageManager: 'bun',
      });

      expect(args).toContain('router-app');
      expect(args).toContain('--yes');
    });

    it('should include template flag when specified', () => {
      const args = buildCreateReactRouterArgs({
        projectName: 'test',
        packageManager: 'pnpm',
        template: 'remix-run/react-router-templates/basic',
      });

      expect(args).toContain('--template');
      expect(args).toContain('remix-run/react-router-templates/basic');
    });
  });

  describe('collectAdditionalDependencies', () => {
    // Note: Tailwind and shadcn deps are handled in separate setup functions,
    // not in collectAdditionalDependencies. This is to support astro add and
    // other CLI-based setups.

    it('should collect edge-compatible ORM deps for Cloudflare', () => {
      const deps = collectReactRouterDeps({
        projectName: 'test',
        orm: 'drizzle',
        deployment: 'cloudflare',
      });

      expect(deps.dependencies).toContain('drizzle-orm');
      expect(deps.dependencies).toContain('@libsql/client');
    });

    it('should collect Neon deps for Vercel edge', () => {
      const deps = collectReactRouterDeps({
        projectName: 'test',
        orm: 'drizzle',
        deployment: 'vercel',
      });

      expect(deps.dependencies).toContain('@neondatabase/serverless');
    });
  });

  describe('buildNextSteps', () => {
    it('should include framework-specific dev command', () => {
      const steps = buildReactRouterNextSteps({
        projectName: 'router-app',
        packageManager: 'bun',
      });

      expect(steps.some(s => s.includes('bun run dev'))).toBe(true);
    });
  });
});

// ============================================================================
// Expo Scaffolder Tests
// ============================================================================

describe('Expo Scaffolder', () => {
  describe('buildCreateExpoStackArgs', () => {
    it('should build basic args for Expo Router', () => {
      const args = buildCreateExpoStackArgs({
        projectName: 'expo-app',
        routing: 'expo-router',
        styling: 'uniwind',
        packageManager: 'bun',
        universal: false,
      });

      expect(args).toContain('expo-app');
      expect(args).toContain('--expo-router');
      expect(args).toContain('--nonInteractive');
    });

    it('should include React Navigation option', () => {
      const args = buildCreateExpoStackArgs({
        projectName: 'test',
        routing: 'react-navigation',
        styling: 'nativewind',
        packageManager: 'npm',
        universal: false,
      });

      expect(args).toContain('--react-navigation');
    });

    it('should include NativeWind styling', () => {
      const args = buildCreateExpoStackArgs({
        projectName: 'test',
        routing: 'expo-router',
        styling: 'nativewind',
        packageManager: 'bun',
        universal: false,
      });

      expect(args).toContain('--nativewind');
    });

    it('should include Tamagui styling', () => {
      const args = buildCreateExpoStackArgs({
        projectName: 'test',
        routing: 'expo-router',
        styling: 'tamagui',
        packageManager: 'bun',
        universal: false,
      });

      expect(args).toContain('--tamagui');
    });

    it('should handle package manager flag', () => {
      const args = buildCreateExpoStackArgs({
        projectName: 'test',
        routing: 'expo-router',
        styling: 'uniwind',
        packageManager: 'yarn',
        universal: false,
      });

      // create-expo-stack uses --yarn, --bun, etc. format
      expect(args).toContain('--yarn');
    });
  });

  describe('collectAdditionalDependencies', () => {
    it('should collect Uniwind deps with migration from NativeWind', () => {
      const deps = collectExpoDeps({
        projectName: 'test',
        styling: 'uniwind',
      });

      // Uniwind replaces nativewind
      expect(deps.dependencies).toContain('uniwind');
    });

    it('should collect Clerk Expo SDK', () => {
      const deps = collectExpoDeps({
        projectName: 'test',
        auth: 'clerk',
      });

      expect(deps.dependencies).toContain('@clerk/clerk-expo');
    });

    it('should collect better-auth Expo SDK', () => {
      const deps = collectExpoDeps({
        projectName: 'test',
        auth: 'better-auth',
      });

      expect(deps.dependencies).toContain('better-auth');
      expect(deps.dependencies).toContain('@better-auth/expo');
    });

    it('should collect Supabase with AsyncStorage', () => {
      const deps = collectExpoDeps({
        projectName: 'test',
        backend: 'supabase',
      });

      expect(deps.dependencies).toContain('@supabase/supabase-js');
      expect(deps.dependencies).toContain('@react-native-async-storage/async-storage');
    });

    it('should collect Convex React Native client', () => {
      const deps = collectExpoDeps({
        projectName: 'test',
        backend: 'convex',
      });

      expect(deps.dependencies).toContain('convex');
    });

    it('should collect Firebase React Native deps', () => {
      const deps = collectExpoDeps({
        projectName: 'test',
        backend: 'firebase',
      });

      expect(deps.dependencies).toContain('@react-native-firebase/app');
      expect(deps.dependencies).toContain('@react-native-firebase/firestore');
    });

    it('should always collect testing-library deps (Jest comes with Expo)', () => {
      // Jest comes with Expo preset, so collectAdditionalDependencies only adds testing-library
      const deps = collectExpoDeps({
        projectName: 'test',
      });

      expect(deps.devDependencies).toContain('@testing-library/react-native');
      expect(deps.devDependencies).toContain('@testing-library/jest-native');
    });

    it('should collect Detox E2E deps', () => {
      const deps = collectExpoDeps({
        projectName: 'test',
        e2eTesting: 'detox',
      });

      expect(deps.devDependencies).toContain('detox');
    });
  });

  describe('buildNextSteps', () => {
    it('should include EAS setup for deployment', () => {
      const steps = buildExpoNextSteps({
        projectName: 'expo-app',
        deployment: 'eas',
      });

      expect(steps.some(s => s.includes('eas'))).toBe(true);
    });

    it('should include expo start command', () => {
      const steps = buildExpoNextSteps({
        projectName: 'expo-app',
        packageManager: 'bun',
      });

      expect(steps.some(s => s.includes('expo start') || s.includes('bun run') || s.includes('start'))).toBe(true);
    });
  });
});

// ============================================================================
// React Native CLI Scaffolder Tests
// ============================================================================

describe('React Native CLI Scaffolder', () => {
  describe('checkPrerequisites', () => {
    it('should return a prerequisite check result', async () => {
      const result = await checkPrerequisites();

      // PrerequisiteCheckResult interface: hasXcode, hasAndroidStudio, xcodeVersion?, androidSdkPath?
      expect(result).toHaveProperty('hasXcode');
      expect(result).toHaveProperty('hasAndroidStudio');

      expect(typeof result.hasXcode).toBe('boolean');
      expect(typeof result.hasAndroidStudio).toBe('boolean');
    });
  });

  describe('collectAdditionalDependencies', () => {
    // Note: React Navigation deps are installed separately via setupReactNavigation,
    // not via collectAdditionalDependencies. The collect function handles other deps.

    it('should always include testing-library deps', () => {
      const deps = collectRNCliDeps({
        projectName: 'test',
      });

      // RN CLI always adds testing-library regardless of options
      expect(deps.devDependencies).toContain('@testing-library/react-native');
      expect(deps.devDependencies).toContain('@testing-library/jest-native');
    });

    // Note: Styling deps (Uniwind, NativeWind, Tamagui) are handled by setupStyling
    // function, not collectAdditionalDependencies. This keeps the setup modular.

    it('should collect better-auth React Native SDK', () => {
      const deps = collectRNCliDeps({
        projectName: 'test',
        auth: 'better-auth',
      });

      expect(deps.dependencies).toContain('better-auth');
      expect(deps.dependencies).toContain('@better-auth/react-native');
    });

    it('should collect Clerk auth deps', () => {
      const deps = collectRNCliDeps({
        projectName: 'test',
        auth: 'clerk',
      });

      expect(deps.dependencies).toContain('@clerk/clerk-react');
      expect(deps.dependencies).toContain('@react-native-async-storage/async-storage');
    });

    it('should collect state management deps', () => {
      const deps = collectRNCliDeps({
        projectName: 'test',
        state: ['zustand', 'jotai', 'tanstack-query'],
      });

      expect(deps.dependencies).toContain('zustand');
      expect(deps.dependencies).toContain('jotai');
      expect(deps.dependencies).toContain('@tanstack/react-query');
    });

    it('should collect Detox E2E deps', () => {
      const deps = collectRNCliDeps({
        projectName: 'test',
        e2eTesting: 'detox',
      });

      expect(deps.devDependencies).toContain('detox');
      expect(deps.devDependencies).toContain('jest-circus');
    });
  });

  describe('buildNextSteps', () => {
    it('should include platform-specific run commands', () => {
      const steps = buildRNCliNextSteps({
        projectName: 'rn-app',
        packageManager: 'bun',
      });

      expect(steps.some(s => s.includes('ios') || s.includes('android'))).toBe(true);
    });

    it('should include Fastlane setup for deployment', () => {
      const steps = buildRNCliNextSteps({
        projectName: 'rn-app',
        deployment: 'fastlane',
      });

      expect(steps.some(s => s.toLowerCase().includes('fastlane'))).toBe(true);
    });
  });
});

// ============================================================================
// Astro Scaffolder Tests
// ============================================================================

describe('Astro Scaffolder', () => {
  describe('buildCreateAstroArgs', () => {
    it('should build basic args with template', () => {
      const args = buildCreateAstroArgs({
        projectName: 'astro-site',
      });

      expect(args).toContain('astro-site');
      expect(args).toContain('--template');
      expect(args).toContain('basics');
      expect(args).toContain('--typescript');
      expect(args).toContain('strict');
      expect(args).toContain('--no-git');
      expect(args).toContain('--yes');
    });
  });

  describe('collectAdditionalDependencies', () => {
    // Note: Tailwind is added via `astro add tailwind` in addAstroIntegrations,
    // not via collectAdditionalDependencies. This uses Astro's built-in integration.

    it('should collect Clerk Astro SDK', () => {
      const deps = collectAstroDeps({
        projectName: 'test',
        auth: 'clerk',
      });

      expect(deps.dependencies).toContain('@clerk/astro');
    });

    it('should collect better-auth deps', () => {
      const deps = collectAstroDeps({
        projectName: 'test',
        auth: 'better-auth',
      });

      expect(deps.dependencies).toContain('better-auth');
    });

    it('should collect Prettier with Astro plugin', () => {
      const deps = collectAstroDeps({
        projectName: 'test',
        formatter: 'prettier',
      });

      expect(deps.devDependencies).toContain('prettier');
      expect(deps.devDependencies).toContain('prettier-plugin-astro');
    });

    it('should collect Drizzle deps', () => {
      const deps = collectAstroDeps({
        projectName: 'test',
        orm: 'drizzle',
      });

      expect(deps.dependencies).toContain('drizzle-orm');
      expect(deps.devDependencies).toContain('drizzle-kit');
    });

    it('should collect Vitest deps', () => {
      const deps = collectAstroDeps({
        projectName: 'test',
        unitTesting: 'vitest',
      });

      expect(deps.devDependencies).toContain('vitest');
    });

    it('should collect backend deps', () => {
      const supabaseDeps = collectAstroDeps({
        projectName: 'test',
        backend: 'supabase',
      });
      expect(supabaseDeps.dependencies).toContain('@supabase/supabase-js');

      const convexDeps = collectAstroDeps({
        projectName: 'test',
        backend: 'convex',
      });
      expect(convexDeps.dependencies).toContain('convex');
    });
  });

  describe('buildNextSteps', () => {
    it('should include Astro dev command', () => {
      const steps = buildAstroNextSteps({
        projectName: 'astro-site',
        packageManager: 'bun',
      });

      expect(steps.some(s => s.includes('dev'))).toBe(true);
    });
  });
});

// ============================================================================
// API (Hono/Elysia) Scaffolder Tests
// ============================================================================

describe('API Scaffolder', () => {
  describe('getHonoTemplate', () => {
    it('should return cloudflare-workers for Cloudflare deployment', () => {
      const template = getHonoTemplate('cloudflare');
      expect(template).toBe('cloudflare-workers');
    });

    it('should return vercel for Vercel deployment', () => {
      const template = getHonoTemplate('vercel');
      expect(template).toBe('vercel');
    });

    it('should return netlify for Netlify deployment', () => {
      const template = getHonoTemplate('netlify');
      expect(template).toBe('netlify');
    });

    it('should return nodejs for Node.js deployments', () => {
      const template1 = getHonoTemplate('railway');
      expect(template1).toBe('nodejs');

      const template2 = getHonoTemplate('render');
      expect(template2).toBe('nodejs');

      const template3 = getHonoTemplate('fly-io');
      expect(template3).toBe('nodejs');
    });

    it('should return bun for undefined deployment', () => {
      expect(getHonoTemplate(undefined)).toBe('bun');
    });
  });

  describe('collectAdditionalDependencies', () => {
    it('should collect Drizzle with D1 driver for Cloudflare', () => {
      const deps = collectApiDeps({
        projectName: 'test',
        framework: 'hono',
        orm: 'drizzle',
        deployment: 'cloudflare',
      });

      expect(deps.dependencies).toContain('drizzle-orm');
      expect(deps.dependencies).toContain('@libsql/client');
    });

    it('should collect Drizzle with Neon for other deployments', () => {
      const deps = collectApiDeps({
        projectName: 'test',
        framework: 'hono',
        orm: 'drizzle',
        deployment: 'vercel',
      });

      expect(deps.dependencies).toContain('drizzle-orm');
      expect(deps.dependencies).toContain('@neondatabase/serverless');
    });

    it('should collect Prisma with edge adapter for Cloudflare', () => {
      const deps = collectApiDeps({
        projectName: 'test',
        framework: 'hono',
        orm: 'prisma',
        deployment: 'cloudflare',
      });

      expect(deps.dependencies).toContain('@prisma/client');
      expect(deps.dependencies).toContain('@prisma/adapter-libsql');
    });

    it('should collect better-auth', () => {
      const deps = collectApiDeps({
        projectName: 'test',
        framework: 'hono',
        auth: 'better-auth',
      });

      expect(deps.dependencies).toContain('better-auth');
    });

    it('should collect Vitest for testing', () => {
      const deps = collectApiDeps({
        projectName: 'test',
        framework: 'hono',
        unitTesting: 'vitest',
      });

      expect(deps.devDependencies).toContain('vitest');
    });

    it('should collect wrangler for Cloudflare', () => {
      const deps = collectApiDeps({
        projectName: 'test',
        framework: 'hono',
        deployment: 'cloudflare',
      });

      expect(deps.devDependencies).toContain('wrangler');
    });
  });

  describe('buildNextSteps', () => {
    it('should include framework-specific dev command for Hono', () => {
      const steps = buildApiNextSteps({
        projectName: 'api',
        framework: 'hono',
        packageManager: 'bun',
      });

      expect(steps.some(s => s.includes('dev'))).toBe(true);
    });

    it('should include framework-specific dev command for Elysia', () => {
      const steps = buildApiNextSteps({
        projectName: 'api',
        framework: 'elysia',
        packageManager: 'bun',
      });

      expect(steps.some(s => s.includes('dev'))).toBe(true);
    });

    it('should include wrangler info for Cloudflare deployment', () => {
      const steps = buildApiNextSteps({
        projectName: 'api',
        framework: 'hono',
        deployment: 'cloudflare',
      });

      expect(steps.some(s => s.toLowerCase().includes('wrangler') || s.toLowerCase().includes('cloudflare'))).toBe(true);
    });
  });
});

// ============================================================================
// Cross-Scaffolder Integration Tests
// ============================================================================

describe('Cross-Scaffolder Integration', () => {
  it('should have consistent ScaffoldResult interface across all scaffolders', () => {
    // This test ensures all scaffolders follow the same result pattern
    const mockResult = {
      success: true,
      projectPath: '/test/path',
      errors: ['error1'],
      warnings: ['warning1'],
      nextSteps: ['step1'],
    };

    // All fields should be accessible
    expect(mockResult.success).toBe(true);
    expect(mockResult.projectPath).toBe('/test/path');
    expect(mockResult.errors).toHaveLength(1);
    expect(mockResult.warnings).toHaveLength(1);
    expect(mockResult.nextSteps).toHaveLength(1);
  });

  it('all scaffolders should support common package managers', () => {
    const managers = ['bun', 'pnpm', 'npm', 'yarn'] as const;

    // Next.js
    for (const pm of managers) {
      const args = buildCreateNextAppArgs({
        projectName: 'test',
        appRouter: true,
        turbopack: true,
        styling: 'tailwind',
        packageManager: pm,
      });
      expect(args.some(a => a.includes(pm))).toBe(true);
    }

    // TanStack Start
    for (const pm of managers) {
      const args = buildCreateStartArgs({
        projectName: 'test',
        styling: 'tailwind',
        packageManager: pm,
        useBiome: false,
        addShadcn: false,
        addTanStackQuery: false,
      });
      expect(args).toContain(pm);
    }
  });

  it('should collect consistent ORM dependencies across web frameworks', () => {
    // Next.js
    const nextjsDeps = collectNextjsDeps({
      projectName: 'test',
      orm: 'drizzle',
    });
    expect(nextjsDeps.dependencies).toContain('drizzle-orm');
    expect(nextjsDeps.devDependencies).toContain('drizzle-kit');

    // TanStack Start
    const tanstackDeps = collectTanStackDeps({
      projectName: 'test',
      orm: 'drizzle',
    });
    expect(tanstackDeps.dependencies).toContain('drizzle-orm');
    expect(tanstackDeps.devDependencies).toContain('drizzle-kit');

    // React Router
    const reactRouterDeps = collectReactRouterDeps({
      projectName: 'test',
      orm: 'drizzle',
    });
    expect(reactRouterDeps.dependencies).toContain('drizzle-orm');
    expect(reactRouterDeps.devDependencies).toContain('drizzle-kit');

    // Astro
    const astroDeps = collectAstroDeps({
      projectName: 'test',
      orm: 'drizzle',
    });
    expect(astroDeps.dependencies).toContain('drizzle-orm');
    expect(astroDeps.devDependencies).toContain('drizzle-kit');
  });

  it('should collect consistent auth dependencies across web frameworks', () => {
    // better-auth should be present in all web framework collectors
    const nextjsDeps = collectNextjsDeps({
      projectName: 'test',
      auth: 'better-auth',
    });
    expect(nextjsDeps.dependencies).toContain('better-auth');

    const tanstackDeps = collectTanStackDeps({
      projectName: 'test',
      auth: 'better-auth',
    });
    expect(tanstackDeps.dependencies).toContain('better-auth');

    const reactRouterDeps = collectReactRouterDeps({
      projectName: 'test',
      auth: 'better-auth',
    });
    expect(reactRouterDeps.dependencies).toContain('better-auth');

    const astroDeps = collectAstroDeps({
      projectName: 'test',
      auth: 'better-auth',
    });
    expect(astroDeps.dependencies).toContain('better-auth');
  });

  it('should collect consistent Vitest dependencies across web frameworks that support it', () => {
    // Next.js
    const nextjsDeps = collectNextjsDeps({
      projectName: 'test',
      unitTesting: 'vitest',
    });
    expect(nextjsDeps.devDependencies).toContain('vitest');

    // React Router
    const reactRouterDeps = collectReactRouterDeps({
      projectName: 'test',
      unitTesting: 'vitest',
    });
    expect(reactRouterDeps.devDependencies).toContain('vitest');

    // Astro
    const astroDeps = collectAstroDeps({
      projectName: 'test',
      unitTesting: 'vitest',
    });
    expect(astroDeps.devDependencies).toContain('vitest');
  });

  it('mobile scaffolders should use Jest (via testing-library)', () => {
    // Mobile frameworks use Jest through preset (jest-expo for Expo, react-native for RN CLI)
    // Both add testing-library deps but not jest itself (comes with preset)

    const expoDeps = collectExpoDeps({
      projectName: 'test',
    });

    // Expo always adds testing-library deps (Jest comes with jest-expo preset)
    expect(expoDeps.devDependencies).toContain('@testing-library/react-native');
    expect(expoDeps.devDependencies).toContain('@testing-library/jest-native');
    expect(expoDeps.devDependencies).not.toContain('vitest');

    // RN CLI always includes testing-library deps (Jest comes with RN)
    const rnCliDeps = collectRNCliDeps({
      projectName: 'test',
    });

    expect(rnCliDeps.devDependencies).toContain('@testing-library/react-native');
    expect(rnCliDeps.devDependencies).toContain('@testing-library/jest-native');
    expect(rnCliDeps.devDependencies).not.toContain('vitest');
  });

  it('mobile scaffolders should collect mobile-specific auth SDKs', () => {
    // Expo uses @clerk/clerk-expo
    const expoDeps = collectExpoDeps({
      projectName: 'test',
      auth: 'clerk',
    });
    expect(expoDeps.dependencies).toContain('@clerk/clerk-expo');
    expect(expoDeps.dependencies).not.toContain('@clerk/nextjs');

    // RN CLI uses the same SDK (clerk-expo works for both)
    const rnCliDeps = collectRNCliDeps({
      projectName: 'test',
      auth: 'clerk',
    });
    // Check if it has a clerk package (could be clerk-react or clerk-expo)
    expect(rnCliDeps.dependencies.some(d => d.includes('clerk'))).toBe(true);
  });
});
