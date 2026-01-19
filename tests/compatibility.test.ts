import { describe, it, expect } from 'vitest';
import {
  // Constants
  PLATFORMS,
  FRAMEWORKS,
  INCOMPATIBILITY_RULES,
  EDGE_COMPATIBILITY,
  STYLING_COMPATIBILITY,
  TESTING_COMPATIBILITY,
  LINTERS,
  FORMATTERS,
  DEFAULTS,
  SKILLS_MATRIX,
  // Functions
  getFrameworksForPlatform,
  getFrameworkConfig,
  areSelectionsCompatible,
  getIncompatibleOptions,
  getStylingForPlatform,
  getRecommendedStyling,
  checkEdgeORMCompatibility,
  getSkillsForConfig,
} from '../src/compatibility/matrix.js';

// ============================================================================
// Platform Configuration Tests
// ============================================================================

describe('PLATFORMS', () => {
  it('should have all four platform types', () => {
    expect(Object.keys(PLATFORMS)).toHaveLength(4);
    expect(PLATFORMS).toHaveProperty('web');
    expect(PLATFORMS).toHaveProperty('mobile');
    expect(PLATFORMS).toHaveProperty('universal');
    expect(PLATFORMS).toHaveProperty('api');
  });

  it('should have valid frameworks for web platform', () => {
    const webFrameworks = PLATFORMS.web.frameworks;
    expect(webFrameworks).toContain('nextjs');
    expect(webFrameworks).toContain('tanstack-start');
    expect(webFrameworks).toContain('react-router');
    expect(webFrameworks).toContain('astro');
    expect(webFrameworks).not.toContain('expo');
    expect(webFrameworks).not.toContain('hono');
  });

  it('should have valid frameworks for mobile platform', () => {
    const mobileFrameworks = PLATFORMS.mobile.frameworks;
    expect(mobileFrameworks).toContain('expo');
    expect(mobileFrameworks).toContain('react-native-cli');
    expect(mobileFrameworks).not.toContain('nextjs');
  });

  it('should have valid frameworks for universal platform', () => {
    const universalFrameworks = PLATFORMS.universal.frameworks;
    expect(universalFrameworks).toContain('expo');
    expect(universalFrameworks).toHaveLength(1);
  });

  it('should have valid frameworks for api platform', () => {
    const apiFrameworks = PLATFORMS.api.frameworks;
    expect(apiFrameworks).toContain('hono');
    expect(apiFrameworks).toContain('elysia');
    expect(apiFrameworks).not.toContain('nextjs');
  });

  it('each platform should have id, name, and description', () => {
    for (const [key, config] of Object.entries(PLATFORMS)) {
      expect(config.id).toBe(key);
      expect(config.name).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(config.frameworks.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Framework Configuration Tests
// ============================================================================

describe('FRAMEWORKS', () => {
  it('should have all eight frameworks', () => {
    expect(Object.keys(FRAMEWORKS)).toHaveLength(8);
  });

  const frameworkIds: Framework[] = [
    'nextjs',
    'tanstack-start',
    'react-router',
    'astro',
    'expo',
    'react-native-cli',
    'hono',
    'elysia',
  ];

  it.each(frameworkIds)('should have valid config for %s', (frameworkId) => {
    const config = FRAMEWORKS[frameworkId];
    expect(config.id).toBe(frameworkId);
    expect(config.name).toBeTruthy();
    expect(config.description).toBeTruthy();
    expect(config.platform.length).toBeGreaterThan(0);
    expect(config.scaffoldCommand).toBeTruthy();
  });

  describe('Next.js configuration', () => {
    it('should be web-only platform', () => {
      expect(FRAMEWORKS.nextjs.platform).toEqual(['web']);
    });

    it('should support both turbopack and webpack', () => {
      expect(FRAMEWORKS.nextjs.bundler).toContain('turbopack');
      expect(FRAMEWORKS.nextjs.bundler).toContain('webpack');
    });

    it('should support tailwind and shadcn styling', () => {
      expect(FRAMEWORKS.nextjs.styling).toContain('tailwind-shadcn');
      expect(FRAMEWORKS.nextjs.styling).toContain('tailwind');
    });

    it('should support vitest for unit testing', () => {
      expect(FRAMEWORKS.nextjs.unitTesting).toContain('vitest');
      expect(FRAMEWORKS.nextjs.unitTesting).not.toContain('jest');
    });

    it('should support playwright and cypress for e2e', () => {
      expect(FRAMEWORKS.nextjs.e2eTesting).toContain('playwright');
      expect(FRAMEWORKS.nextjs.e2eTesting).toContain('cypress');
    });

    it('should have correct scaffold command', () => {
      expect(FRAMEWORKS.nextjs.scaffoldCommand).toBe('npx create-next-app@latest');
    });
  });

  describe('Expo configuration', () => {
    it('should support mobile and universal platforms', () => {
      expect(FRAMEWORKS.expo.platform).toContain('mobile');
      expect(FRAMEWORKS.expo.platform).toContain('universal');
    });

    it('should use metro bundler', () => {
      expect(FRAMEWORKS.expo.bundler).toEqual(['metro']);
    });

    it('should support mobile styling options', () => {
      expect(FRAMEWORKS.expo.styling).toContain('uniwind');
      expect(FRAMEWORKS.expo.styling).toContain('nativewind');
      expect(FRAMEWORKS.expo.styling).toContain('tamagui');
      expect(FRAMEWORKS.expo.styling).not.toContain('tailwind-shadcn');
    });

    it('should use jest for unit testing (not vitest)', () => {
      expect(FRAMEWORKS.expo.unitTesting).toContain('jest');
      expect(FRAMEWORKS.expo.unitTesting).not.toContain('vitest');
    });

    it('should use maestro and detox for e2e (not playwright)', () => {
      expect(FRAMEWORKS.expo.e2eTesting).toContain('maestro');
      expect(FRAMEWORKS.expo.e2eTesting).toContain('detox');
      expect(FRAMEWORKS.expo.e2eTesting).not.toContain('playwright');
    });

    it('should have create-expo-stack as scaffold command', () => {
      expect(FRAMEWORKS.expo.scaffoldCommand).toBe('npx create-expo-stack@latest');
    });
  });

  describe('API frameworks (Hono/Elysia)', () => {
    it('should have no styling options', () => {
      expect(FRAMEWORKS.hono.styling).toHaveLength(0);
      expect(FRAMEWORKS.elysia.styling).toHaveLength(0);
    });

    it('should have no state management options', () => {
      expect(FRAMEWORKS.hono.state).toHaveLength(0);
      expect(FRAMEWORKS.elysia.state).toHaveLength(0);
    });

    it('should have no e2e testing options', () => {
      expect(FRAMEWORKS.hono.e2eTesting).toHaveLength(0);
      expect(FRAMEWORKS.elysia.e2eTesting).toHaveLength(0);
    });

    it('should support only better-auth for authentication', () => {
      expect(FRAMEWORKS.hono.auth).toEqual(['better-auth']);
      expect(FRAMEWORKS.elysia.auth).toEqual(['better-auth']);
    });

    it('Elysia should require Bun (scaffold with bun create)', () => {
      expect(FRAMEWORKS.elysia.scaffoldCommand).toBe('bun create elysia');
    });
  });
});

// ============================================================================
// Incompatibility Rules Tests
// ============================================================================

describe('INCOMPATIBILITY_RULES', () => {
  it('should have rules defined', () => {
    expect(INCOMPATIBILITY_RULES.length).toBeGreaterThan(0);
  });

  it('each rule should have required fields', () => {
    for (const rule of INCOMPATIBILITY_RULES) {
      expect(rule.id).toBeTruthy();
      expect(rule.if.key).toBeTruthy();
      expect(rule.if.value).toBeTruthy();
      expect(rule.cannotUse.key).toBeTruthy();
      expect(rule.cannotUse.value).toBeTruthy();
      expect(rule.reason).toBeTruthy();
    }
  });

  it('should have unique rule IDs', () => {
    const ids = INCOMPATIBILITY_RULES.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('areSelectionsCompatible', () => {
  it('should return compatible for unrelated selections', () => {
    const result = areSelectionsCompatible(
      { key: 'framework', value: 'nextjs' },
      { key: 'styling', value: 'tailwind' }
    );
    expect(result.compatible).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should detect Next.js + TanStack Router incompatibility', () => {
    const result = areSelectionsCompatible(
      { key: 'framework', value: 'nextjs' },
      { key: 'routing', value: 'tanstack-router' }
    );
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe('Next.js has built-in routing');
  });

  it('should detect incompatibility in either order', () => {
    const result1 = areSelectionsCompatible(
      { key: 'framework', value: 'nextjs' },
      { key: 'routing', value: 'tanstack-router' }
    );
    const result2 = areSelectionsCompatible(
      { key: 'routing', value: 'tanstack-router' },
      { key: 'framework', value: 'nextjs' }
    );
    expect(result1).toEqual(result2);
  });

  it('should detect Biome + ESLint incompatibility', () => {
    const result = areSelectionsCompatible(
      { key: 'linter', value: 'biome' },
      { key: 'linter', value: 'eslint' }
    );
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe('Biome replaces ESLint + Prettier');
  });

  it('should detect Biome + Prettier incompatibility', () => {
    const result = areSelectionsCompatible(
      { key: 'linter', value: 'biome' },
      { key: 'formatter', value: 'prettier' }
    );
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe('Biome includes formatting');
  });

  it('should detect Expo + Vitest incompatibility', () => {
    const result = areSelectionsCompatible(
      { key: 'framework', value: 'expo' },
      { key: 'unitTesting', value: 'vitest' }
    );
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe('Jest required for React Native');
  });

  it('should detect Expo + Playwright incompatibility', () => {
    const result = areSelectionsCompatible(
      { key: 'framework', value: 'expo' },
      { key: 'e2eTesting', value: 'playwright' }
    );
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe('Use Maestro/Detox for mobile E2E');
  });

  it('should detect ORM mutual exclusivity', () => {
    const result = areSelectionsCompatible(
      { key: 'orm', value: 'drizzle' },
      { key: 'orm', value: 'prisma' }
    );
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe('Pick one ORM');
  });

  it('should detect auth provider mutual exclusivity', () => {
    const result1 = areSelectionsCompatible(
      { key: 'auth', value: 'better-auth' },
      { key: 'auth', value: 'clerk' }
    );
    expect(result1.compatible).toBe(false);

    const result2 = areSelectionsCompatible(
      { key: 'auth', value: 'clerk' },
      { key: 'auth', value: 'supabase-auth' }
    );
    expect(result2.compatible).toBe(false);
  });

  it('should detect deployment target mutual exclusivity', () => {
    const result = areSelectionsCompatible(
      { key: 'deployment', value: 'vercel' },
      { key: 'deployment', value: 'fly-io' }
    );
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe('Pick primary deployment target');
  });
});

describe('getIncompatibleOptions', () => {
  it('should return empty array for selection with no incompatibilities', () => {
    const result = getIncompatibleOptions({ key: 'styling', value: 'tailwind' });
    expect(result).toEqual([]);
  });

  it('should return all incompatible options for Next.js framework', () => {
    const result = getIncompatibleOptions({ key: 'framework', value: 'nextjs' });
    expect(result.length).toBeGreaterThan(0);

    const routingConflicts = result.filter((r) => r.key === 'routing');
    expect(routingConflicts).toContainEqual({
      key: 'routing',
      value: 'tanstack-router',
      reason: 'Next.js has built-in routing',
    });
    expect(routingConflicts).toContainEqual({
      key: 'routing',
      value: 'react-router',
      reason: 'Next.js has built-in routing',
    });
  });

  it('should return incompatible options for Biome linter', () => {
    const result = getIncompatibleOptions({ key: 'linter', value: 'biome' });
    expect(result).toContainEqual({
      key: 'linter',
      value: 'eslint',
      reason: 'Biome replaces ESLint + Prettier',
    });
    expect(result).toContainEqual({
      key: 'formatter',
      value: 'prettier',
      reason: 'Biome includes formatting',
    });
  });

  it('should return mobile framework incompatibilities', () => {
    const expoResult = getIncompatibleOptions({ key: 'framework', value: 'expo' });

    // Expo should be incompatible with vitest
    expect(expoResult).toContainEqual({
      key: 'unitTesting',
      value: 'vitest',
      reason: 'Jest required for React Native',
    });

    // Expo should be incompatible with playwright
    expect(expoResult).toContainEqual({
      key: 'e2eTesting',
      value: 'playwright',
      reason: 'Use Maestro/Detox for mobile E2E',
    });

    // Expo should be incompatible with vite bundler
    expect(expoResult).toContainEqual({
      key: 'bundler',
      value: 'vite',
      reason: 'Expo uses Metro bundler',
    });
  });
});

// ============================================================================
// Edge Compatibility Tests
// ============================================================================

describe('EDGE_COMPATIBILITY', () => {
  it('should have edge compatibility data for major platforms', () => {
    const platforms = EDGE_COMPATIBILITY.map((e) => e.platform);
    expect(platforms).toContain('cloudflare');
    expect(platforms).toContain('vercel');
    expect(platforms).toContain('netlify');
    expect(platforms).toContain('railway');
    expect(platforms).toContain('fly-io');
  });

  it('Cloudflare should have edge-specific Drizzle drivers', () => {
    const cloudflare = EDGE_COMPATIBILITY.find((e) => e.platform === 'cloudflare');
    expect(cloudflare).toBeDefined();
    expect(cloudflare!.ormSupport.drizzle.supported).toBe(true);
    expect(cloudflare!.ormSupport.drizzle.drivers).toContain('@libsql/client');
  });

  it('Cloudflare Prisma should require Accelerate', () => {
    const cloudflare = EDGE_COMPATIBILITY.find((e) => e.platform === 'cloudflare');
    expect(cloudflare).toBeDefined();
    expect(cloudflare!.ormSupport.prisma.supported).toBe(true);
    expect(cloudflare!.ormSupport.prisma.requirements).toContain('Prisma Accelerate');
  });

  it('Railway should support all ORM drivers', () => {
    const railway = EDGE_COMPATIBILITY.find((e) => e.platform === 'railway');
    expect(railway).toBeDefined();
    expect(railway!.ormSupport.drizzle.supported).toBe(true);
    expect(railway!.ormSupport.prisma.supported).toBe(true);
    expect(railway!.ormSupport.prisma.requirements).toEqual([]);
  });
});

describe('checkEdgeORMCompatibility', () => {
  it('should return compatible for unknown deployment', () => {
    const result = checkEdgeORMCompatibility('drizzle', 'eas' as DeploymentTarget);
    expect(result.compatible).toBe(true);
  });

  it('should return compatible for drizzle on cloudflare', () => {
    const result = checkEdgeORMCompatibility('drizzle', 'cloudflare');
    expect(result.compatible).toBe(true);
  });

  it('should return requirements for prisma on cloudflare', () => {
    const result = checkEdgeORMCompatibility('prisma', 'cloudflare');
    expect(result.compatible).toBe(true);
    expect(result.requirements).toBeDefined();
    expect(result.requirements).toContain('Prisma Accelerate');
  });

  it('should return compatible with no requirements for railway', () => {
    const drizzleResult = checkEdgeORMCompatibility('drizzle', 'railway');
    expect(drizzleResult.compatible).toBe(true);
    expect(drizzleResult.requirements).toBeUndefined();

    const prismaResult = checkEdgeORMCompatibility('prisma', 'railway');
    expect(prismaResult.compatible).toBe(true);
    expect(prismaResult.requirements).toBeUndefined();
  });

  it('should handle "none" ORM gracefully', () => {
    const result = checkEdgeORMCompatibility('none', 'cloudflare');
    expect(result.compatible).toBe(true);
  });
});

// ============================================================================
// Styling Compatibility Tests
// ============================================================================

describe('STYLING_COMPATIBILITY', () => {
  it('should have all styling options', () => {
    const styles = STYLING_COMPATIBILITY.map((s) => s.styling);
    expect(styles).toContain('tailwind-shadcn');
    expect(styles).toContain('tailwind');
    expect(styles).toContain('nativewind');
    expect(styles).toContain('uniwind');
    expect(styles).toContain('tamagui');
    expect(styles).toContain('unistyles');
    expect(styles).toContain('stylesheets');
    expect(styles).toContain('vanilla');
  });

  it('tailwind-shadcn should be web-only', () => {
    const tailwindShadcn = STYLING_COMPATIBILITY.find((s) => s.styling === 'tailwind-shadcn');
    expect(tailwindShadcn).toBeDefined();
    expect(tailwindShadcn!.web).toBe(true);
    expect(tailwindShadcn!.expo).toBe(false);
    expect(tailwindShadcn!.reactNative).toBe(false);
    expect(tailwindShadcn!.universal).toBe(false);
  });

  it('uniwind should be mobile-only and recommended for mobile', () => {
    const uniwind = STYLING_COMPATIBILITY.find((s) => s.styling === 'uniwind');
    expect(uniwind).toBeDefined();
    expect(uniwind!.web).toBe(false);
    expect(uniwind!.expo).toBe(true);
    expect(uniwind!.reactNative).toBe(true);
    expect(uniwind!.recommended).toBe('mobile');
  });

  it('tamagui should support all platforms and be recommended for universal', () => {
    const tamagui = STYLING_COMPATIBILITY.find((s) => s.styling === 'tamagui');
    expect(tamagui).toBeDefined();
    expect(tamagui!.web).toBe(true);
    expect(tamagui!.expo).toBe(true);
    expect(tamagui!.reactNative).toBe(true);
    expect(tamagui!.universal).toBe(true);
    expect(tamagui!.recommended).toBe('universal');
  });

  it('nativewind should support all platforms', () => {
    const nativewind = STYLING_COMPATIBILITY.find((s) => s.styling === 'nativewind');
    expect(nativewind).toBeDefined();
    expect(nativewind!.web).toBe(true);
    expect(nativewind!.expo).toBe(true);
    expect(nativewind!.reactNative).toBe(true);
    expect(nativewind!.universal).toBe(true);
  });
});

describe('getStylingForPlatform', () => {
  it('should return web styling for web platform', () => {
    const webStyles = getStylingForPlatform('web');
    expect(webStyles).toContain('tailwind-shadcn');
    expect(webStyles).toContain('tailwind');
    expect(webStyles).toContain('nativewind');
    expect(webStyles).toContain('tamagui');
    expect(webStyles).toContain('vanilla');
    expect(webStyles).not.toContain('uniwind');
    expect(webStyles).not.toContain('stylesheets');
  });

  it('should return mobile styling for mobile platform', () => {
    const mobileStyles = getStylingForPlatform('mobile');
    expect(mobileStyles).toContain('uniwind');
    expect(mobileStyles).toContain('nativewind');
    expect(mobileStyles).toContain('tamagui');
    expect(mobileStyles).toContain('unistyles');
    expect(mobileStyles).toContain('stylesheets');
    expect(mobileStyles).not.toContain('tailwind-shadcn');
    expect(mobileStyles).not.toContain('vanilla');
  });

  it('should return universal styling for universal platform', () => {
    const universalStyles = getStylingForPlatform('universal');
    expect(universalStyles).toContain('nativewind');
    expect(universalStyles).toContain('tamagui');
    expect(universalStyles).not.toContain('uniwind');
    expect(universalStyles).not.toContain('tailwind-shadcn');
  });
});

describe('getRecommendedStyling', () => {
  it('should recommend tailwind-shadcn for web', () => {
    expect(getRecommendedStyling('web')).toBe('tailwind-shadcn');
  });

  it('should recommend uniwind for mobile', () => {
    expect(getRecommendedStyling('mobile')).toBe('uniwind');
  });

  it('should recommend tamagui for universal', () => {
    expect(getRecommendedStyling('universal')).toBe('tamagui');
  });

  it('should recommend vanilla for api', () => {
    expect(getRecommendedStyling('api')).toBe('vanilla');
  });
});

// ============================================================================
// Testing Compatibility Tests
// ============================================================================

describe('TESTING_COMPATIBILITY', () => {
  it('should have unit and e2e testing frameworks', () => {
    const unitTests = TESTING_COMPATIBILITY.filter((t) => t.type === 'unit');
    const e2eTests = TESTING_COMPATIBILITY.filter((t) => t.type === 'e2e');

    expect(unitTests.length).toBeGreaterThan(0);
    expect(e2eTests.length).toBeGreaterThan(0);
  });

  it('vitest should be web-only and recommended for web', () => {
    const vitest = TESTING_COMPATIBILITY.find((t) => t.framework === 'vitest');
    expect(vitest).toBeDefined();
    expect(vitest!.web).toBe(true);
    expect(vitest!.expo).toBe(false);
    expect(vitest!.reactNative).toBe(false);
    expect(vitest!.recommended).toBe('web');
  });

  it('jest should support all platforms and be recommended for mobile', () => {
    const jest = TESTING_COMPATIBILITY.find((t) => t.framework === 'jest');
    expect(jest).toBeDefined();
    expect(jest!.web).toBe(true);
    expect(jest!.expo).toBe(true);
    expect(jest!.reactNative).toBe(true);
    expect(jest!.recommended).toBe('mobile');
  });

  it('playwright should be web-only and recommended for web e2e', () => {
    const playwright = TESTING_COMPATIBILITY.find((t) => t.framework === 'playwright');
    expect(playwright).toBeDefined();
    expect(playwright!.web).toBe(true);
    expect(playwright!.expo).toBe(false);
    expect(playwright!.recommended).toBe('web');
  });

  it('maestro should be mobile-only and recommended for mobile e2e', () => {
    const maestro = TESTING_COMPATIBILITY.find((t) => t.framework === 'maestro');
    expect(maestro).toBeDefined();
    expect(maestro!.web).toBe(false);
    expect(maestro!.expo).toBe(true);
    expect(maestro!.reactNative).toBe(true);
    expect(maestro!.recommended).toBe('mobile');
  });
});

// ============================================================================
// Linter and Formatter Tests
// ============================================================================

describe('LINTERS', () => {
  it('should have all three linters', () => {
    expect(Object.keys(LINTERS)).toHaveLength(3);
    expect(LINTERS).toHaveProperty('oxlint');
    expect(LINTERS).toHaveProperty('biome');
    expect(LINTERS).toHaveProperty('eslint');
  });

  it('biome should include formatter', () => {
    expect(LINTERS.biome.includesFormatter).toBe(true);
  });

  it('oxlint and eslint should not include formatter', () => {
    expect(LINTERS.oxlint.includesFormatter).toBe(false);
    expect(LINTERS.eslint.includesFormatter).toBe(false);
  });

  it('oxlint and biome should be fast', () => {
    expect(LINTERS.oxlint.speed).toBe('fast');
    expect(LINTERS.biome.speed).toBe('fast');
  });

  it('eslint should be slow', () => {
    expect(LINTERS.eslint.speed).toBe('slow');
  });
});

describe('FORMATTERS', () => {
  it('should have all three formatters', () => {
    expect(Object.keys(FORMATTERS)).toHaveLength(3);
    expect(FORMATTERS).toHaveProperty('oxfmt');
    expect(FORMATTERS).toHaveProperty('prettier');
    expect(FORMATTERS).toHaveProperty('biome');
  });

  it('oxfmt should be alpha stability', () => {
    expect(FORMATTERS.oxfmt.stability).toBe('alpha');
  });

  it('prettier and biome should be stable', () => {
    expect(FORMATTERS.prettier.stability).toBe('stable');
    expect(FORMATTERS.biome.stability).toBe('stable');
  });

  it('oxfmt and biome should be fast', () => {
    expect(FORMATTERS.oxfmt.speed).toBe('fast');
    expect(FORMATTERS.biome.speed).toBe('fast');
  });

  it('prettier should be slow', () => {
    expect(FORMATTERS.prettier.speed).toBe('slow');
  });
});

// ============================================================================
// Default Recommendations Tests
// ============================================================================

describe('DEFAULTS', () => {
  it('should have oxlint as default linter', () => {
    expect(DEFAULTS.linter).toBe('oxlint');
  });

  it('should have oxfmt as default formatter', () => {
    expect(DEFAULTS.formatter).toBe('oxfmt');
  });

  it('should have prek as default pre-commit tool', () => {
    expect(DEFAULTS.preCommit).toBe('prek');
  });

  it('should have bun as default package manager', () => {
    expect(DEFAULTS.packageManager).toBe('bun');
  });

  it('should have vitest for web and jest for mobile unit testing', () => {
    expect(DEFAULTS.unitTesting.web).toBe('vitest');
    expect(DEFAULTS.unitTesting.mobile).toBe('jest');
    expect(DEFAULTS.unitTesting.universal).toBe('jest');
    expect(DEFAULTS.unitTesting.api).toBe('vitest');
  });

  it('should have playwright for web and maestro for mobile e2e testing', () => {
    expect(DEFAULTS.e2eTesting.web).toBe('playwright');
    expect(DEFAULTS.e2eTesting.mobile).toBe('maestro');
    expect(DEFAULTS.e2eTesting.universal).toBe('maestro');
  });

  it('should have platform-specific styling defaults', () => {
    expect(DEFAULTS.styling.web).toBe('tailwind-shadcn');
    expect(DEFAULTS.styling.mobile).toBe('uniwind');
    expect(DEFAULTS.styling.universal).toBe('tamagui');
    expect(DEFAULTS.styling.api).toBe('vanilla');
  });
});

// ============================================================================
// Helper Functions Tests
// ============================================================================

describe('getFrameworksForPlatform', () => {
  it('should return correct frameworks for web platform', () => {
    const frameworks = getFrameworksForPlatform('web');
    expect(frameworks).toEqual(PLATFORMS.web.frameworks);
    expect(frameworks).toContain('nextjs');
  });

  it('should return correct frameworks for mobile platform', () => {
    const frameworks = getFrameworksForPlatform('mobile');
    expect(frameworks).toEqual(PLATFORMS.mobile.frameworks);
    expect(frameworks).toContain('expo');
  });

  it('should return correct frameworks for api platform', () => {
    const frameworks = getFrameworksForPlatform('api');
    expect(frameworks).toEqual(PLATFORMS.api.frameworks);
    expect(frameworks).toContain('hono');
    expect(frameworks).toContain('elysia');
  });
});

describe('getFrameworkConfig', () => {
  it('should return full config for nextjs', () => {
    const config = getFrameworkConfig('nextjs');
    expect(config).toBe(FRAMEWORKS.nextjs);
    expect(config.id).toBe('nextjs');
    expect(config.name).toBe('Next.js');
  });

  it('should return full config for expo', () => {
    const config = getFrameworkConfig('expo');
    expect(config).toBe(FRAMEWORKS.expo);
    expect(config.id).toBe('expo');
    expect(config.name).toBe('Expo');
  });
});

// ============================================================================
// Skills Matrix Tests
// ============================================================================

describe('SKILLS_MATRIX', () => {
  it('should have skills for all projects', () => {
    const allProjectsSkills = SKILLS_MATRIX.find((s) => s.condition === 'all');
    expect(allProjectsSkills).toBeDefined();
    expect(allProjectsSkills!.skills.length).toBeGreaterThan(0);

    const skillNames = allProjectsSkills!.skills.map((s) => s.name);
    expect(skillNames).toContain('planning-with-files');
    expect(skillNames).toContain('test-driven-development');
  });

  it('should have framework-specific skills', () => {
    const nextjsSkills = SKILLS_MATRIX.find(
      (s) =>
        s.condition !== 'all' &&
        s.condition.key === 'framework' &&
        s.condition.values.includes('nextjs')
    );
    expect(nextjsSkills).toBeDefined();
    expect(nextjsSkills!.skills.some((s) => s.name === 'react-best-practices')).toBe(true);
  });

  it('should have skills for mobile frameworks', () => {
    const mobileSkills = SKILLS_MATRIX.find(
      (s) =>
        s.condition !== 'all' &&
        s.condition.key === 'framework' &&
        s.condition.values.includes('expo')
    );
    expect(mobileSkills).toBeDefined();
    expect(mobileSkills!.skills.some((s) => s.name === 'expo-app-design')).toBe(true);
  });

  it('should have backend-specific skills', () => {
    const supabaseSkills = SKILLS_MATRIX.find(
      (s) =>
        s.condition !== 'all' &&
        s.condition.key === 'backend' &&
        s.condition.values.includes('supabase')
    );
    expect(supabaseSkills).toBeDefined();
    expect(supabaseSkills!.skills.some((s) => s.name === 'supabase-operations')).toBe(true);
  });

  it('should have ORM-specific skills', () => {
    const drizzleSkills = SKILLS_MATRIX.find(
      (s) =>
        s.condition !== 'all' && s.condition.key === 'orm' && s.condition.values.includes('drizzle')
    );
    expect(drizzleSkills).toBeDefined();
    expect(drizzleSkills!.skills.length).toBeGreaterThan(0);
  });

  it('each skill should have name and source', () => {
    for (const skillSet of SKILLS_MATRIX) {
      for (const skill of skillSet.skills) {
        expect(skill.name).toBeTruthy();
        expect(skill.source).toBeTruthy();
      }
    }
  });
});

describe('getSkillsForConfig', () => {
  it('should always include base skills', () => {
    const skills = getSkillsForConfig({});
    const skillNames = skills.map((s) => s.name);
    expect(skillNames).toContain('planning-with-files');
    expect(skillNames).toContain('test-driven-development');
    expect(skillNames).toContain('systematic-debugging');
    expect(skillNames).toContain('verification-before-completion');
  });

  it('should include Next.js skills for nextjs framework', () => {
    const skills = getSkillsForConfig({ framework: 'nextjs' });
    const skillNames = skills.map((s) => s.name);
    expect(skillNames).toContain('react-best-practices');
    expect(skillNames).toContain('vercel-deploy-claimable');
    expect(skillNames).toContain('web-design-guidelines');
  });

  it('should include Expo skills for expo framework', () => {
    const skills = getSkillsForConfig({ framework: 'expo' });
    const skillNames = skills.map((s) => s.name);
    expect(skillNames).toContain('expo-app-design');
    expect(skillNames).toContain('expo-deployment');
    expect(skillNames).toContain('upgrading-expo');
  });

  it('should include Supabase skills when supabase backend is selected', () => {
    const skills = getSkillsForConfig({ backend: 'supabase' });
    const skillNames = skills.map((s) => s.name);
    expect(skillNames).toContain('supabase-operations');
  });

  it('should include Drizzle skills when drizzle ORM is selected', () => {
    const skills = getSkillsForConfig({ orm: 'drizzle' });
    const skillNames = skills.map((s) => s.name);
    expect(skillNames).toContain('drizzle-orm-d1');
    expect(skillNames).toContain('drizzle');
    expect(skillNames).toContain('drizzle-migration');
  });

  it('should include better-auth skills when better-auth is selected', () => {
    const skills = getSkillsForConfig({ auth: 'better-auth' });
    const skillNames = skills.map((s) => s.name);
    expect(skillNames).toContain('better-auth');
  });

  it('should include Clerk skills when clerk is selected', () => {
    const skills = getSkillsForConfig({ auth: 'clerk' });
    const skillNames = skills.map((s) => s.name);
    expect(skillNames).toContain('clerk-pack');
  });

  it('should include Tailwind skills when tailwind styling is selected', () => {
    const skills = getSkillsForConfig({ styling: 'tailwind-shadcn' });
    const skillNames = skills.map((s) => s.name);
    expect(skillNames).toContain('tailwind-v4-shadcn');
  });

  it('should combine skills from multiple config options', () => {
    const skills = getSkillsForConfig({
      framework: 'nextjs',
      backend: 'supabase',
      orm: 'drizzle',
      auth: 'better-auth',
      styling: 'tailwind-shadcn',
    });
    const skillNames = skills.map((s) => s.name);

    // Base skills
    expect(skillNames).toContain('planning-with-files');
    // Next.js skills
    expect(skillNames).toContain('react-best-practices');
    // Supabase skills
    expect(skillNames).toContain('supabase-operations');
    // Drizzle skills
    expect(skillNames).toContain('drizzle-orm-d1');
    // better-auth skills
    expect(skillNames).toContain('better-auth');
    // Tailwind skills
    expect(skillNames).toContain('tailwind-v4-shadcn');
  });

  it('should deduplicate skills', () => {
    const skills = getSkillsForConfig({
      framework: 'nextjs',
      styling: 'tailwind-shadcn',
    });

    const skillNames = skills.map((s) => s.name);
    const uniqueNames = [...new Set(skillNames)];
    expect(skillNames.length).toBe(uniqueNames.length);
  });

  it('should not include irrelevant skills', () => {
    const skills = getSkillsForConfig({ framework: 'nextjs' });
    const skillNames = skills.map((s) => s.name);

    // Should not include Expo skills
    expect(skillNames).not.toContain('expo-app-design');
    // Should not include Drizzle skills (not selected)
    expect(skillNames).not.toContain('drizzle-orm-d1');
  });
});
