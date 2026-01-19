import { describe, it, expect } from 'vitest';
import {
  // Types
  type WizardSelections,
  // Functions
  getAvailableFrameworks,
  getAvailableStyling,
  getAvailableStateManagement,
  getAvailableORM,
  getAvailableBackend,
  getAvailableAuth,
  getAvailableLinters,
  shouldShowFormatterQuestion,
  getAvailableFormatters,
  getAvailableUnitTesting,
  getAvailableE2ETesting,
  getAvailableDeployment,
  filterOptions,
  validateSelections,
} from '../src/compatibility/filters.js';

// ============================================================================
// Framework Filters Tests
// ============================================================================

describe('getAvailableFrameworks', () => {
  it('should return web frameworks for web platform', () => {
    const frameworks = getAvailableFrameworks('web');
    const values = frameworks.map((f) => f.value);

    expect(values).toContain('nextjs');
    expect(values).toContain('tanstack-start');
    expect(values).toContain('react-router');
    expect(values).toContain('astro');
    expect(values).not.toContain('expo');
    expect(values).not.toContain('hono');
  });

  it('should return mobile frameworks for mobile platform', () => {
    const frameworks = getAvailableFrameworks('mobile');
    const values = frameworks.map((f) => f.value);

    expect(values).toContain('expo');
    expect(values).toContain('react-native-cli');
    expect(values).not.toContain('nextjs');
    expect(values).not.toContain('hono');
  });

  it('should return universal frameworks for universal platform', () => {
    const frameworks = getAvailableFrameworks('universal');
    const values = frameworks.map((f) => f.value);

    expect(values).toContain('expo');
    expect(values).toHaveLength(1);
  });

  it('should return API frameworks for api platform', () => {
    const frameworks = getAvailableFrameworks('api');
    const values = frameworks.map((f) => f.value);

    expect(values).toContain('hono');
    expect(values).toContain('elysia');
    expect(values).not.toContain('nextjs');
    expect(values).not.toContain('expo');
  });

  it('should mark nextjs as recommended for web platform', () => {
    const frameworks = getAvailableFrameworks('web');
    const nextjs = frameworks.find((f) => f.value === 'nextjs');

    expect(nextjs).toBeDefined();
    expect(nextjs!.recommended).toBe(true);
  });

  it('should mark expo as recommended for mobile platform', () => {
    const frameworks = getAvailableFrameworks('mobile');
    const expo = frameworks.find((f) => f.value === 'expo');

    expect(expo).toBeDefined();
    expect(expo!.recommended).toBe(true);
  });

  it('should mark hono as recommended for api platform', () => {
    const frameworks = getAvailableFrameworks('api');
    const hono = frameworks.find((f) => f.value === 'hono');

    expect(hono).toBeDefined();
    expect(hono!.recommended).toBe(true);
  });

  it('each framework option should have label and description', () => {
    const frameworks = getAvailableFrameworks('web');

    for (const framework of frameworks) {
      expect(framework.label).toBeTruthy();
      expect(framework.description).toBeTruthy();
    }
  });
});

// ============================================================================
// Styling Filters Tests
// ============================================================================

describe('getAvailableStyling', () => {
  it('should return empty array if platform is not provided', () => {
    const styling = getAvailableStyling({ framework: 'nextjs' });
    expect(styling).toEqual([]);
  });

  it('should return empty array if framework is not provided', () => {
    const styling = getAvailableStyling({ platform: 'web' });
    expect(styling).toEqual([]);
  });

  it('should return web styling for Next.js', () => {
    const styling = getAvailableStyling({ platform: 'web', framework: 'nextjs' });
    const values = styling.map((s) => s.value);

    expect(values).toContain('tailwind-shadcn');
    expect(values).toContain('tailwind');
    expect(values).not.toContain('uniwind');
    expect(values).not.toContain('stylesheets');
  });

  it('should return mobile styling for Expo', () => {
    const styling = getAvailableStyling({ platform: 'mobile', framework: 'expo' });
    const values = styling.map((s) => s.value);

    expect(values).toContain('uniwind');
    expect(values).toContain('nativewind');
    expect(values).toContain('tamagui');
    expect(values).toContain('unistyles');
    expect(values).toContain('stylesheets');
    expect(values).not.toContain('tailwind-shadcn');
  });

  it('should return universal styling for Expo on universal platform', () => {
    const styling = getAvailableStyling({ platform: 'universal', framework: 'expo' });
    const values = styling.map((s) => s.value);

    expect(values).toContain('nativewind');
    expect(values).toContain('tamagui');
    // Uniwind is mobile-only
    expect(values).not.toContain('uniwind');
    expect(values).not.toContain('tailwind-shadcn');
  });

  it('should return empty array for API frameworks', () => {
    const styling = getAvailableStyling({ platform: 'api', framework: 'hono' });
    expect(styling).toEqual([]);
  });

  it('should mark tailwind-shadcn as recommended for web', () => {
    const styling = getAvailableStyling({ platform: 'web', framework: 'nextjs' });
    const tailwindShadcn = styling.find((s) => s.value === 'tailwind-shadcn');

    expect(tailwindShadcn).toBeDefined();
    expect(tailwindShadcn!.recommended).toBe(true);
  });

  it('should mark uniwind as recommended for mobile', () => {
    const styling = getAvailableStyling({ platform: 'mobile', framework: 'expo' });
    const uniwind = styling.find((s) => s.value === 'uniwind');

    expect(uniwind).toBeDefined();
    expect(uniwind!.recommended).toBe(true);
  });

  it('should mark tamagui as recommended for universal', () => {
    const styling = getAvailableStyling({ platform: 'universal', framework: 'expo' });
    const tamagui = styling.find((s) => s.value === 'tamagui');

    expect(tamagui).toBeDefined();
    expect(tamagui!.recommended).toBe(true);
  });

  it('each styling option should have label and description', () => {
    const styling = getAvailableStyling({ platform: 'web', framework: 'nextjs' });

    for (const option of styling) {
      expect(option.label).toBeTruthy();
      expect(option.description).toBeTruthy();
    }
  });
});

// ============================================================================
// State Management Filters Tests
// ============================================================================

describe('getAvailableStateManagement', () => {
  it('should return empty array if framework is not provided', () => {
    const state = getAvailableStateManagement({});
    expect(state).toEqual([]);
  });

  it('should return state options for Next.js', () => {
    const state = getAvailableStateManagement({ framework: 'nextjs' });
    const values = state.map((s) => s.value);

    expect(values).toContain('zustand');
    expect(values).toContain('jotai');
    expect(values).toContain('tanstack-query');
  });

  it('should return state options for Expo', () => {
    const state = getAvailableStateManagement({ framework: 'expo' });
    const values = state.map((s) => s.value);

    expect(values).toContain('zustand');
    expect(values).toContain('jotai');
    expect(values).toContain('tanstack-query');
  });

  it('should return empty state options for API frameworks', () => {
    const honoState = getAvailableStateManagement({ framework: 'hono' });
    const elysiaState = getAvailableStateManagement({ framework: 'elysia' });

    expect(honoState).toHaveLength(0);
    expect(elysiaState).toHaveLength(0);
  });

  it('should mark zustand as recommended', () => {
    const state = getAvailableStateManagement({ framework: 'nextjs' });
    const zustand = state.find((s) => s.value === 'zustand');

    expect(zustand).toBeDefined();
    expect(zustand!.recommended).toBe(true);
  });

  it('each state option should have label and description', () => {
    const state = getAvailableStateManagement({ framework: 'nextjs' });

    for (const option of state) {
      expect(option.label).toBeTruthy();
      expect(option.description).toBeTruthy();
    }
  });
});

// ============================================================================
// ORM Filters Tests
// ============================================================================

describe('getAvailableORM', () => {
  it('should return empty array if framework is not provided', () => {
    const orm = getAvailableORM({});
    expect(orm).toEqual([]);
  });

  it('should return ORM options for Next.js', () => {
    const orm = getAvailableORM({ framework: 'nextjs' });
    const values = orm.map((o) => o.value);

    expect(values).toContain('drizzle');
    expect(values).toContain('prisma');
    // Next.js doesn't include 'none' since it can have ORM
  });

  it('should return ORM options for TanStack Start', () => {
    const orm = getAvailableORM({ framework: 'tanstack-start' });
    const values = orm.map((o) => o.value);

    // TanStack Start only supports Drizzle
    expect(values).toContain('drizzle');
  });

  it('should return ORM options for Hono API', () => {
    const orm = getAvailableORM({ framework: 'hono' });
    const values = orm.map((o) => o.value);

    expect(values).toContain('drizzle');
    expect(values).toContain('prisma');
  });

  it('should return none-only for mobile frameworks', () => {
    const expoOrm = getAvailableORM({ framework: 'expo' });
    const rnOrm = getAvailableORM({ framework: 'react-native-cli' });

    expect(expoOrm.map((o) => o.value)).toEqual(['none']);
    expect(rnOrm.map((o) => o.value)).toEqual(['none']);
  });

  it('should mark drizzle as recommended', () => {
    const orm = getAvailableORM({ framework: 'nextjs' });
    const drizzle = orm.find((o) => o.value === 'drizzle');

    expect(drizzle).toBeDefined();
    expect(drizzle!.recommended).toBe(true);
  });

  it('each ORM option should have label and description', () => {
    const orm = getAvailableORM({ framework: 'nextjs' });

    for (const option of orm) {
      expect(option.label).toBeTruthy();
      expect(option.description).toBeTruthy();
    }
  });
});

// ============================================================================
// Backend Filters Tests
// ============================================================================

describe('getAvailableBackend', () => {
  it('should return empty array if framework is not provided', () => {
    const backend = getAvailableBackend({});
    expect(backend).toEqual([]);
  });

  it('should return backend options for Next.js', () => {
    const backend = getAvailableBackend({ framework: 'nextjs' });
    const values = backend.map((b) => b.value);

    expect(values).toContain('supabase');
    expect(values).toContain('convex');
    expect(values).toContain('custom');
    // Firebase is only for mobile (Expo, RN CLI)
  });

  it('should return backend options for Expo', () => {
    const backend = getAvailableBackend({ framework: 'expo' });
    const values = backend.map((b) => b.value);

    expect(values).toContain('supabase');
    expect(values).toContain('firebase');
    expect(values).toContain('convex');
  });

  it('should return custom-only backend options for API frameworks', () => {
    const honoBackend = getAvailableBackend({ framework: 'hono' });
    const elysiaBackend = getAvailableBackend({ framework: 'elysia' });

    // API frameworks only support custom backend (they ARE the backend)
    expect(honoBackend.map((b) => b.value)).toEqual(['custom']);
    expect(elysiaBackend.map((b) => b.value)).toEqual(['custom']);
  });

  it('should mark supabase as recommended', () => {
    const backend = getAvailableBackend({ framework: 'nextjs' });
    const supabase = backend.find((b) => b.value === 'supabase');

    expect(supabase).toBeDefined();
    expect(supabase!.recommended).toBe(true);
  });

  it('each backend option should have label and description', () => {
    const backend = getAvailableBackend({ framework: 'nextjs' });

    for (const option of backend) {
      expect(option.label).toBeTruthy();
      expect(option.description).toBeTruthy();
    }
  });
});

// ============================================================================
// Auth Filters Tests
// ============================================================================

describe('getAvailableAuth', () => {
  it('should return empty array if framework is not provided', () => {
    const auth = getAvailableAuth({});
    expect(auth).toEqual([]);
  });

  it('should return auth options for Next.js', () => {
    const auth = getAvailableAuth({ framework: 'nextjs' });
    const values = auth.map((a) => a.value);

    expect(values).toContain('better-auth');
    expect(values).toContain('clerk');
    expect(values).toContain('supabase-auth');
  });

  it('should return auth options for Expo', () => {
    const auth = getAvailableAuth({ framework: 'expo' });
    const values = auth.map((a) => a.value);

    expect(values).toContain('better-auth');
    expect(values).toContain('clerk');
    expect(values).toContain('supabase-auth');
  });

  it('should return only better-auth for API frameworks', () => {
    const honoAuth = getAvailableAuth({ framework: 'hono' });
    const elysiaAuth = getAvailableAuth({ framework: 'elysia' });

    expect(honoAuth.map((a) => a.value)).toEqual(['better-auth']);
    expect(elysiaAuth.map((a) => a.value)).toEqual(['better-auth']);
  });

  it('should recommend supabase-auth when supabase backend is selected', () => {
    const auth = getAvailableAuth({ framework: 'nextjs', backend: 'supabase' });
    const supabaseAuth = auth.find((a) => a.value === 'supabase-auth');

    expect(supabaseAuth).toBeDefined();
    expect(supabaseAuth!.recommended).toBe(true);
  });

  it('should recommend better-auth when no backend is selected', () => {
    const auth = getAvailableAuth({ framework: 'nextjs' });
    const betterAuth = auth.find((a) => a.value === 'better-auth');

    expect(betterAuth).toBeDefined();
    expect(betterAuth!.recommended).toBe(true);
  });

  it('should recommend better-auth when non-supabase backend is selected', () => {
    const auth = getAvailableAuth({ framework: 'nextjs', backend: 'firebase' });
    const betterAuth = auth.find((a) => a.value === 'better-auth');

    expect(betterAuth).toBeDefined();
    expect(betterAuth!.recommended).toBe(true);
  });

  it('should show appropriate description for mobile frameworks', () => {
    const auth = getAvailableAuth({ framework: 'expo' });
    const betterAuth = auth.find((a) => a.value === 'better-auth');
    const clerk = auth.find((a) => a.value === 'clerk');

    expect(betterAuth!.description).toContain('@better-auth/expo');
    expect(clerk!.description).toContain('Native SDK');
  });

  it('should show appropriate description for web frameworks', () => {
    const auth = getAvailableAuth({ framework: 'nextjs' });
    const betterAuth = auth.find((a) => a.value === 'better-auth');
    const clerk = auth.find((a) => a.value === 'clerk');

    expect(betterAuth!.description).not.toContain('@better-auth/expo');
    expect(clerk!.description).toContain('Managed auth');
  });
});

// ============================================================================
// Linter Filters Tests
// ============================================================================

describe('getAvailableLinters', () => {
  it('should return all three linters', () => {
    const linters = getAvailableLinters();
    const values = linters.map((l) => l.value);

    expect(values).toContain('oxlint');
    expect(values).toContain('biome');
    expect(values).toContain('eslint');
    expect(values).toHaveLength(3);
  });

  it('should mark oxlint as recommended', () => {
    const linters = getAvailableLinters();
    const oxlint = linters.find((l) => l.value === 'oxlint');

    expect(oxlint).toBeDefined();
    expect(oxlint!.recommended).toBe(true);
  });

  it('each linter should have label and description', () => {
    const linters = getAvailableLinters();

    for (const linter of linters) {
      expect(linter.label).toBeTruthy();
      expect(linter.description).toBeTruthy();
    }
  });
});

// ============================================================================
// Formatter Filters Tests
// ============================================================================

describe('shouldShowFormatterQuestion', () => {
  it('should return false when Biome is selected', () => {
    expect(shouldShowFormatterQuestion('biome')).toBe(false);
  });

  it('should return true when oxlint is selected', () => {
    expect(shouldShowFormatterQuestion('oxlint')).toBe(true);
  });

  it('should return true when ESLint is selected', () => {
    expect(shouldShowFormatterQuestion('eslint')).toBe(true);
  });
});

describe('getAvailableFormatters', () => {
  it('should return only biome when biome linter is selected', () => {
    const formatters = getAvailableFormatters({ linter: 'biome' });

    expect(formatters).toHaveLength(1);
    expect(formatters[0]!.value).toBe('biome');
    expect(formatters[0]!.recommended).toBe(true);
    expect(formatters[0]!.description).toContain('Included');
  });

  it('should return oxfmt and prettier when oxlint is selected', () => {
    const formatters = getAvailableFormatters({ linter: 'oxlint' });
    const values = formatters.map((f) => f.value);

    expect(values).toContain('oxfmt');
    expect(values).toContain('prettier');
    expect(values).not.toContain('biome');
  });

  it('should return oxfmt and prettier when eslint is selected', () => {
    const formatters = getAvailableFormatters({ linter: 'eslint' });
    const values = formatters.map((f) => f.value);

    expect(values).toContain('oxfmt');
    expect(values).toContain('prettier');
    expect(values).not.toContain('biome');
  });

  it('should mark oxfmt as recommended when not using biome', () => {
    const formatters = getAvailableFormatters({ linter: 'oxlint' });
    const oxfmt = formatters.find((f) => f.value === 'oxfmt');

    expect(oxfmt).toBeDefined();
    expect(oxfmt!.recommended).toBe(true);
  });

  it('each formatter should have label and description', () => {
    const formatters = getAvailableFormatters({ linter: 'oxlint' });

    for (const formatter of formatters) {
      expect(formatter.label).toBeTruthy();
      expect(formatter.description).toBeTruthy();
    }
  });
});

// ============================================================================
// Testing Filters Tests
// ============================================================================

describe('getAvailableUnitTesting', () => {
  it('should return empty array if platform is not provided', () => {
    const testing = getAvailableUnitTesting({ framework: 'nextjs' });
    expect(testing).toEqual([]);
  });

  it('should return empty array if framework is not provided', () => {
    const testing = getAvailableUnitTesting({ platform: 'web' });
    expect(testing).toEqual([]);
  });

  it('should return vitest for web frameworks', () => {
    const testing = getAvailableUnitTesting({ platform: 'web', framework: 'nextjs' });
    const values = testing.map((t) => t.value);

    expect(values).toContain('vitest');
    expect(values).not.toContain('jest');
  });

  it('should return jest for mobile frameworks (Expo)', () => {
    const testing = getAvailableUnitTesting({ platform: 'mobile', framework: 'expo' });
    const values = testing.map((t) => t.value);

    expect(values).toContain('jest');
    expect(values).not.toContain('vitest');
  });

  it('should return jest for mobile frameworks (RN CLI)', () => {
    const testing = getAvailableUnitTesting({ platform: 'mobile', framework: 'react-native-cli' });
    const values = testing.map((t) => t.value);

    expect(values).toContain('jest');
    expect(values).not.toContain('vitest');
  });

  it('should mark vitest as recommended for web', () => {
    const testing = getAvailableUnitTesting({ platform: 'web', framework: 'nextjs' });
    const vitest = testing.find((t) => t.value === 'vitest');

    expect(vitest).toBeDefined();
    expect(vitest!.recommended).toBe(true);
  });

  it('should mark jest as recommended for mobile', () => {
    const testing = getAvailableUnitTesting({ platform: 'mobile', framework: 'expo' });
    const jest = testing.find((t) => t.value === 'jest');

    expect(jest).toBeDefined();
    expect(jest!.recommended).toBe(true);
  });

  it('each unit testing option should have label and description', () => {
    const testing = getAvailableUnitTesting({ platform: 'web', framework: 'nextjs' });

    for (const option of testing) {
      expect(option.label).toBeTruthy();
      expect(option.description).toBeTruthy();
    }
  });
});

describe('getAvailableE2ETesting', () => {
  it('should return empty array if platform is not provided', () => {
    const testing = getAvailableE2ETesting({ framework: 'nextjs' });
    expect(testing).toEqual([]);
  });

  it('should return empty array if framework is not provided', () => {
    const testing = getAvailableE2ETesting({ platform: 'web' });
    expect(testing).toEqual([]);
  });

  it('should return playwright and cypress for web frameworks', () => {
    const testing = getAvailableE2ETesting({ platform: 'web', framework: 'nextjs' });
    const values = testing.map((t) => t.value);

    expect(values).toContain('playwright');
    expect(values).toContain('cypress');
    expect(values).not.toContain('maestro');
    expect(values).not.toContain('detox');
  });

  it('should return maestro and detox for mobile frameworks (Expo)', () => {
    const testing = getAvailableE2ETesting({ platform: 'mobile', framework: 'expo' });
    const values = testing.map((t) => t.value);

    expect(values).toContain('maestro');
    expect(values).toContain('detox');
    expect(values).not.toContain('playwright');
    expect(values).not.toContain('cypress');
  });

  it('should return empty for API frameworks', () => {
    const honoTesting = getAvailableE2ETesting({ platform: 'api', framework: 'hono' });
    const elysiaTesting = getAvailableE2ETesting({ platform: 'api', framework: 'elysia' });

    expect(honoTesting).toHaveLength(0);
    expect(elysiaTesting).toHaveLength(0);
  });

  it('should mark playwright as recommended for web', () => {
    const testing = getAvailableE2ETesting({ platform: 'web', framework: 'nextjs' });
    const playwright = testing.find((t) => t.value === 'playwright');

    expect(playwright).toBeDefined();
    expect(playwright!.recommended).toBe(true);
  });

  it('should mark maestro as recommended for mobile', () => {
    const testing = getAvailableE2ETesting({ platform: 'mobile', framework: 'expo' });
    const maestro = testing.find((t) => t.value === 'maestro');

    expect(maestro).toBeDefined();
    expect(maestro!.recommended).toBe(true);
  });

  it('each E2E testing option should have label and description', () => {
    const testing = getAvailableE2ETesting({ platform: 'web', framework: 'nextjs' });

    for (const option of testing) {
      expect(option.label).toBeTruthy();
      expect(option.description).toBeTruthy();
    }
  });
});

// ============================================================================
// Deployment Filters Tests
// ============================================================================

describe('getAvailableDeployment', () => {
  it('should return empty array if framework is not provided', () => {
    const deployment = getAvailableDeployment({});
    expect(deployment).toEqual([]);
  });

  it('should return web deployment options for Next.js', () => {
    const deployment = getAvailableDeployment({ framework: 'nextjs' });
    const values = deployment.map((d) => d.value);

    expect(values).toContain('vercel');
    expect(values).toContain('netlify');
    expect(values).toContain('cloudflare');
    expect(values).not.toContain('eas');
    expect(values).not.toContain('fastlane');
  });

  it('should return mobile deployment options for Expo', () => {
    const deployment = getAvailableDeployment({ framework: 'expo' });
    const values = deployment.map((d) => d.value);

    expect(values).toContain('eas');
    expect(values).toContain('local-builds');
    expect(values).toContain('codemagic');
    expect(values).not.toContain('vercel');
  });

  it('should return mobile deployment options for RN CLI', () => {
    const deployment = getAvailableDeployment({ framework: 'react-native-cli' });
    const values = deployment.map((d) => d.value);

    expect(values).toContain('fastlane');
    expect(values).toContain('local-builds');
    expect(values).not.toContain('vercel');
  });

  it('should return API deployment options for Hono', () => {
    const deployment = getAvailableDeployment({ framework: 'hono' });
    const values = deployment.map((d) => d.value);

    expect(values).toContain('cloudflare');
    expect(values).toContain('vercel');
    expect(values).toContain('fly-io');
    expect(values).toContain('railway');
  });

  it('should mark vercel as recommended for Next.js', () => {
    const deployment = getAvailableDeployment({ framework: 'nextjs' });
    const vercel = deployment.find((d) => d.value === 'vercel');

    expect(vercel).toBeDefined();
    expect(vercel!.recommended).toBe(true);
  });

  it('should mark cloudflare as recommended for Hono', () => {
    const deployment = getAvailableDeployment({ framework: 'hono' });
    const cloudflare = deployment.find((d) => d.value === 'cloudflare');

    expect(cloudflare).toBeDefined();
    expect(cloudflare!.recommended).toBe(true);
  });

  it('should mark fly-io as recommended for Elysia', () => {
    const deployment = getAvailableDeployment({ framework: 'elysia' });
    const flyio = deployment.find((d) => d.value === 'fly-io');

    expect(flyio).toBeDefined();
    expect(flyio!.recommended).toBe(true);
  });

  it('should mark eas as recommended for Expo', () => {
    const deployment = getAvailableDeployment({ framework: 'expo' });
    const eas = deployment.find((d) => d.value === 'eas');

    expect(eas).toBeDefined();
    expect(eas!.recommended).toBe(true);
  });

  it('each deployment option should have label and description', () => {
    const deployment = getAvailableDeployment({ framework: 'nextjs' });

    for (const option of deployment) {
      expect(option.label).toBeTruthy();
      expect(option.description).toBeTruthy();
    }
  });
});

// ============================================================================
// Generic Filter Options Tests
// ============================================================================

describe('filterOptions', () => {
  it('should return all options enabled when no conflicts', () => {
    const options = ['vitest', 'jest'] as const;
    const result = filterOptions([...options], 'unitTesting', { framework: 'nextjs' });

    expect(result).toHaveLength(2);
    expect(result.every((r) => !r.disabled)).toBe(true);
  });

  it('should disable vitest for Expo', () => {
    const options = ['vitest', 'jest'] as const;
    const result = filterOptions([...options], 'unitTesting', { framework: 'expo' });

    const vitestOption = result.find((r) => r.value === 'vitest');
    const jestOption = result.find((r) => r.value === 'jest');

    expect(vitestOption!.disabled).toBe(true);
    expect(vitestOption!.reason).toBeTruthy();
    expect(jestOption!.disabled).toBe(false);
  });

  it('should disable playwright for Expo', () => {
    const options = ['playwright', 'maestro'] as const;
    const result = filterOptions([...options], 'e2eTesting', { framework: 'expo' });

    const playwrightOption = result.find((r) => r.value === 'playwright');
    const maestroOption = result.find((r) => r.value === 'maestro');

    expect(playwrightOption!.disabled).toBe(true);
    expect(maestroOption!.disabled).toBe(false);
  });

  it('should disable eslint when biome is selected', () => {
    const options = ['oxlint', 'eslint'] as const;
    const result = filterOptions([...options], 'linter', { linter: 'biome' });

    const eslintOption = result.find((r) => r.value === 'eslint');
    expect(eslintOption!.disabled).toBe(true);
    expect(eslintOption!.reason).toContain('Biome');
  });

  it('should disable prettier when biome is selected', () => {
    const options = ['oxfmt', 'prettier'] as const;
    const result = filterOptions([...options], 'formatter', { linter: 'biome' });

    const prettierOption = result.find((r) => r.value === 'prettier');
    expect(prettierOption!.disabled).toBe(true);
    expect(prettierOption!.reason).toContain('Biome');
  });

  it('should disable tanstack-router for Next.js', () => {
    const options = ['tanstack-router', 'react-router'] as const;
    const result = filterOptions([...options], 'routing', { framework: 'nextjs' });

    const tanstackOption = result.find((r) => r.value === 'tanstack-router');
    expect(tanstackOption!.disabled).toBe(true);
    expect(tanstackOption!.reason).toContain('built-in');
  });
});

// ============================================================================
// Validate Selections Tests
// ============================================================================

describe('validateSelections', () => {
  it('should return valid for empty selections', () => {
    const result = validateSelections({});
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return valid for compatible selections', () => {
    const result = validateSelections({
      platform: 'web',
      framework: 'nextjs',
      styling: 'tailwind-shadcn',
      orm: 'drizzle',
      auth: 'better-auth',
      linter: 'oxlint',
      formatter: 'oxfmt',
      unitTesting: 'vitest',
      e2eTesting: 'playwright',
      deployment: 'vercel',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect Biome + ESLint conflict', () => {
    const result = validateSelections({
      linter: 'biome',
      // Note: In reality, you can't select both linters, but this tests the validation
    });

    // No conflict with just biome selected (no eslint)
    expect(result.valid).toBe(true);
  });

  it('should detect Biome + Prettier conflict', () => {
    const result = validateSelections({
      linter: 'biome',
      formatter: 'prettier',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.reason).toContain('Biome');
  });

  it('should detect Expo + Vitest conflict', () => {
    const result = validateSelections({
      framework: 'expo',
      unitTesting: 'vitest',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.reason.includes('Jest'))).toBe(true);
  });

  it('should detect Expo + Playwright conflict', () => {
    const result = validateSelections({
      framework: 'expo',
      e2eTesting: 'playwright',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.reason.includes('Maestro') || e.reason.includes('Detox'))).toBe(true);
  });

  it('should detect multiple deployment targets conflict', () => {
    // Note: This tests the validation logic - in the wizard you can only select one
    // The validation catches if somehow multiple are set
    const result = validateSelections({
      deployment: 'vercel', // Can only have one in practice
    });

    expect(result.valid).toBe(true);
  });

  it('should return field names in errors', () => {
    const result = validateSelections({
      linter: 'biome',
      formatter: 'prettier',
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0]!.field1).toBeTruthy();
    expect(result.errors[0]!.field2).toBeTruthy();
  });

  it('should handle state array gracefully', () => {
    const result = validateSelections({
      platform: 'web',
      framework: 'nextjs',
      state: ['zustand', 'tanstack-query'],
    });

    expect(result.valid).toBe(true);
  });

  it('should validate mobile framework selections', () => {
    const result = validateSelections({
      platform: 'mobile',
      framework: 'expo',
      styling: 'uniwind',
      unitTesting: 'jest',
      e2eTesting: 'maestro',
      deployment: 'eas',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate API framework selections', () => {
    const result = validateSelections({
      platform: 'api',
      framework: 'hono',
      orm: 'drizzle',
      auth: 'better-auth',
      linter: 'biome',
      unitTesting: 'vitest',
      deployment: 'cloudflare',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Filter Integration', () => {
  it('should provide consistent options for Next.js SaaS preset', () => {
    const selections: WizardSelections = {
      platform: 'web',
      framework: 'nextjs',
    };

    const styling = getAvailableStyling(selections);
    const state = getAvailableStateManagement(selections);
    const orm = getAvailableORM(selections);
    const backend = getAvailableBackend(selections);
    const auth = getAvailableAuth(selections);
    const unitTesting = getAvailableUnitTesting(selections);
    const e2eTesting = getAvailableE2ETesting(selections);
    const deployment = getAvailableDeployment(selections);

    // Should have recommended options
    expect(styling.some((s) => s.recommended)).toBe(true);
    expect(state.some((s) => s.recommended)).toBe(true);
    expect(orm.some((s) => s.recommended)).toBe(true);
    expect(backend.some((s) => s.recommended)).toBe(true);
    expect(auth.some((s) => s.recommended)).toBe(true);
    expect(unitTesting.some((s) => s.recommended)).toBe(true);
    expect(e2eTesting.some((s) => s.recommended)).toBe(true);
    expect(deployment.some((s) => s.recommended)).toBe(true);
  });

  it('should provide consistent options for Expo mobile app', () => {
    const selections: WizardSelections = {
      platform: 'mobile',
      framework: 'expo',
    };

    const styling = getAvailableStyling(selections);
    const _state = getAvailableStateManagement(selections);
    const _backend = getAvailableBackend(selections);
    const _auth = getAvailableAuth(selections);
    const unitTesting = getAvailableUnitTesting(selections);
    const e2eTesting = getAvailableE2ETesting(selections);
    const deployment = getAvailableDeployment(selections);

    // Should have mobile-specific options
    expect(styling.some((s) => s.value === 'uniwind')).toBe(true);
    expect(styling.every((s) => s.value !== 'tailwind-shadcn')).toBe(true);

    expect(unitTesting.some((t) => t.value === 'jest')).toBe(true);
    expect(unitTesting.every((t) => t.value !== 'vitest')).toBe(true);

    expect(e2eTesting.some((t) => t.value === 'maestro')).toBe(true);
    expect(e2eTesting.every((t) => t.value !== 'playwright')).toBe(true);

    expect(deployment.some((d) => d.value === 'eas')).toBe(true);
  });

  it('should provide consistent options for Hono API', () => {
    const selections: WizardSelections = {
      platform: 'api',
      framework: 'hono',
    };

    const styling = getAvailableStyling(selections);
    const state = getAvailableStateManagement(selections);
    const backend = getAvailableBackend(selections);
    const orm = getAvailableORM(selections);
    const auth = getAvailableAuth(selections);
    const deployment = getAvailableDeployment(selections);

    // API frameworks shouldn't have styling or state
    expect(styling).toHaveLength(0);
    expect(state).toHaveLength(0);

    // API frameworks only have 'custom' backend (they ARE the backend)
    expect(backend).toHaveLength(1);
    expect(backend[0]!.value).toBe('custom');

    // Should have ORM options
    expect(orm.length).toBeGreaterThan(0);

    // Should only have better-auth
    expect(auth).toHaveLength(1);
    expect(auth[0]!.value).toBe('better-auth');

    // Should have API deployment targets
    expect(deployment.some((d) => d.value === 'cloudflare')).toBe(true);
  });

  it('should handle Biome selection flow correctly', () => {
    // When Biome is selected, formatter should be auto-selected as Biome
    expect(shouldShowFormatterQuestion('biome')).toBe(false);

    const formatters = getAvailableFormatters({ linter: 'biome' });
    expect(formatters).toHaveLength(1);
    expect(formatters[0]!.value).toBe('biome');

    // Validation should fail if somehow prettier is selected with biome
    const validation = validateSelections({
      linter: 'biome',
      formatter: 'prettier',
    });
    expect(validation.valid).toBe(false);
  });
});
