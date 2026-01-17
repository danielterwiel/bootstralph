/**
 * Option filtering logic for the wizard
 * Filters available options based on current selections and compatibility rules
 */

import {
  type Platform,
  type Framework,
  type Styling,
  type ORM,
  type AuthProvider,
  type Linter,
  type Formatter,
  type UnitTestFramework,
  type E2ETestFramework,
  type DeploymentTarget,
  type StateManagement,
  type Backend,
  PLATFORMS,
  FRAMEWORKS,
  INCOMPATIBILITY_RULES,
  STYLING_COMPATIBILITY,
  LINTERS,
  DEFAULTS,
} from './matrix.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Current wizard selections
 */
export interface WizardSelections {
  platform?: Platform;
  framework?: Framework;
  styling?: Styling;
  state?: StateManagement[];
  orm?: ORM;
  backend?: Backend;
  auth?: AuthProvider;
  linter?: Linter;
  formatter?: Formatter;
  unitTesting?: UnitTestFramework;
  e2eTesting?: E2ETestFramework;
  deployment?: DeploymentTarget;
}

/**
 * Option with metadata for display
 */
export interface FilteredOption<T> {
  value: T;
  label: string;
  description?: string;
  recommended?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

// ============================================================================
// Framework Filters
// ============================================================================

/**
 * Get available frameworks for a platform
 */
export function getAvailableFrameworks(platform: Platform): FilteredOption<Framework>[] {
  const frameworks = PLATFORMS[platform].frameworks;

  return frameworks.map((framework) => {
    const config = FRAMEWORKS[framework];
    return {
      value: framework,
      label: config.name,
      description: config.description,
      recommended: framework === getRecommendedFramework(platform),
    };
  });
}

/**
 * Get recommended framework for a platform
 */
function getRecommendedFramework(platform: Platform): Framework {
  switch (platform) {
    case 'web':
      return 'nextjs';
    case 'mobile':
      return 'expo';
    case 'universal':
      return 'expo';
    case 'api':
      return 'hono';
  }
}

// ============================================================================
// Styling Filters
// ============================================================================

/**
 * Get available styling options based on platform and framework
 */
export function getAvailableStyling(
  selections: Pick<WizardSelections, 'platform' | 'framework'>
): FilteredOption<Styling>[] {
  const { platform, framework } = selections;

  if (!platform || !framework) {
    return [];
  }

  // Get framework-supported styling options
  const frameworkConfig = FRAMEWORKS[framework];
  const frameworkStyling = frameworkConfig.styling;

  // Filter by platform compatibility
  const platformKey =
    platform === 'mobile' ? 'expo' : platform === 'universal' ? 'universal' : 'web';

  const compatibleStyling = STYLING_COMPATIBILITY.filter((s) => {
    // Must be supported by framework
    if (!frameworkStyling.includes(s.styling)) {
      return false;
    }

    // Must be compatible with platform
    if (platformKey === 'expo') return s.expo;
    if (platformKey === 'universal') return s.universal;
    if (platform === 'api') return false; // API doesn't need styling
    return s.web;
  });

  const recommended = DEFAULTS.styling[platform];

  return compatibleStyling.map((s) => ({
    value: s.styling,
    label: getStylingLabel(s.styling),
    description: getStylingDescription(s.styling),
    recommended: s.styling === recommended,
  }));
}

function getStylingLabel(styling: Styling): string {
  switch (styling) {
    case 'tailwind-shadcn':
      return 'Tailwind CSS + shadcn/ui';
    case 'tailwind':
      return 'Tailwind CSS';
    case 'nativewind':
      return 'NativeWind';
    case 'uniwind':
      return 'Uniwind';
    case 'tamagui':
      return 'Tamagui';
    case 'unistyles':
      return 'Unistyles';
    case 'stylesheets':
      return 'StyleSheets';
    case 'vanilla':
      return 'Vanilla CSS';
  }
}

function getStylingDescription(styling: Styling): string {
  switch (styling) {
    case 'tailwind-shadcn':
      return 'Utility-first CSS + accessible components';
    case 'tailwind':
      return 'Utility-first CSS framework';
    case 'nativewind':
      return 'Tailwind CSS for React Native';
    case 'uniwind':
      return 'Fastest Tailwind for RN (2.5x faster than NativeWind)';
    case 'tamagui':
      return 'Universal design system with optimizing compiler';
    case 'unistyles':
      return 'Type-safe StyleSheets with media queries';
    case 'stylesheets':
      return 'React Native StyleSheets (basic)';
    case 'vanilla':
      return 'Plain CSS or CSS-in-JS';
  }
}

// ============================================================================
// State Management Filters
// ============================================================================

/**
 * Get available state management options based on framework
 */
export function getAvailableStateManagement(
  selections: Pick<WizardSelections, 'framework'>
): FilteredOption<StateManagement>[] {
  const { framework } = selections;

  if (!framework) {
    return [];
  }

  const frameworkConfig = FRAMEWORKS[framework];
  const stateOptions = frameworkConfig.state;

  return stateOptions.map((state) => ({
    value: state,
    label: getStateLabel(state),
    description: getStateDescription(state),
    recommended: state === 'zustand',
  }));
}

function getStateLabel(state: StateManagement): string {
  switch (state) {
    case 'zustand':
      return 'Zustand';
    case 'jotai':
      return 'Jotai';
    case 'tanstack-query':
      return 'TanStack Query';
  }
}

function getStateDescription(state: StateManagement): string {
  switch (state) {
    case 'zustand':
      return 'Simple, fast state management';
    case 'jotai':
      return 'Atomic state management';
    case 'tanstack-query':
      return 'Server state management (caching, fetching)';
  }
}

// ============================================================================
// ORM Filters
// ============================================================================

/**
 * Get available ORM options based on framework
 */
export function getAvailableORM(
  selections: Pick<WizardSelections, 'framework'>
): FilteredOption<ORM>[] {
  const { framework } = selections;

  if (!framework) {
    return [];
  }

  const frameworkConfig = FRAMEWORKS[framework];
  const ormOptions = frameworkConfig.orm;

  return ormOptions.map((orm) => ({
    value: orm,
    label: getORMLabel(orm),
    description: getORMDescription(orm),
    recommended: orm === 'drizzle',
  }));
}

function getORMLabel(orm: ORM): string {
  switch (orm) {
    case 'drizzle':
      return 'Drizzle';
    case 'prisma':
      return 'Prisma';
    case 'none':
      return 'None';
  }
}

function getORMDescription(orm: ORM): string {
  switch (orm) {
    case 'drizzle':
      return 'Type-safe SQL, lightweight, edge-compatible';
    case 'prisma':
      return 'Popular ORM with great DX (may require Accelerate for edge)';
    case 'none':
      return 'Use backend service (Supabase, Firebase, Convex)';
  }
}

// ============================================================================
// Backend Filters
// ============================================================================

/**
 * Get available backend options based on framework
 */
export function getAvailableBackend(
  selections: Pick<WizardSelections, 'framework'>
): FilteredOption<Backend>[] {
  const { framework } = selections;

  if (!framework) {
    return [];
  }

  const frameworkConfig = FRAMEWORKS[framework];
  const backendOptions = frameworkConfig.backend;

  return backendOptions.map((backend) => ({
    value: backend,
    label: getBackendLabel(backend),
    description: getBackendDescription(backend),
    recommended: backend === 'supabase',
  }));
}

function getBackendLabel(backend: Backend): string {
  switch (backend) {
    case 'supabase':
      return 'Supabase';
    case 'firebase':
      return 'Firebase';
    case 'convex':
      return 'Convex';
    case 'custom':
      return 'Custom Backend';
  }
}

function getBackendDescription(backend: Backend): string {
  switch (backend) {
    case 'supabase':
      return 'Postgres + Auth + Storage + Realtime';
    case 'firebase':
      return 'NoSQL + Auth + Storage + Realtime';
    case 'convex':
      return 'Reactive backend with real-time sync';
    case 'custom':
      return 'Build your own backend API';
  }
}

// ============================================================================
// Auth Filters
// ============================================================================

/**
 * Get available auth providers based on framework and backend
 */
export function getAvailableAuth(
  selections: Pick<WizardSelections, 'framework' | 'backend'>
): FilteredOption<AuthProvider>[] {
  const { framework, backend } = selections;

  if (!framework) {
    return [];
  }

  const frameworkConfig = FRAMEWORKS[framework];
  let authOptions = [...frameworkConfig.auth];

  // If Supabase backend is selected, recommend Supabase Auth
  const recommended = backend === 'supabase' ? 'supabase-auth' : 'better-auth';

  return authOptions.map((auth) => ({
    value: auth,
    label: getAuthLabel(auth),
    description: getAuthDescription(auth, framework),
    recommended: auth === recommended,
  }));
}

function getAuthLabel(auth: AuthProvider): string {
  switch (auth) {
    case 'better-auth':
      return 'better-auth';
    case 'clerk':
      return 'Clerk';
    case 'supabase-auth':
      return 'Supabase Auth';
  }
}

function getAuthDescription(auth: AuthProvider, framework: Framework): string {
  const isMobile = framework === 'expo' || framework === 'react-native-cli';

  switch (auth) {
    case 'better-auth':
      return isMobile
        ? 'Native SDK via @better-auth/expo'
        : 'Open source, self-hosted auth';
    case 'clerk':
      return isMobile ? 'Native SDK with managed service' : 'Managed auth service';
    case 'supabase-auth':
      return 'Integrated with Supabase, 50k MAU free tier';
  }
}

// ============================================================================
// Linter & Formatter Filters
// ============================================================================

/**
 * Get available linter options
 * Note: If Biome is selected, formatter question should be skipped
 */
export function getAvailableLinters(): FilteredOption<Linter>[] {
  return (Object.keys(LINTERS) as Linter[]).map((linter) => {
    const config = LINTERS[linter];
    return {
      value: linter,
      label: config.name,
      description: config.description,
      recommended: linter === DEFAULTS.linter,
    };
  });
}

/**
 * Check if formatter question should be shown based on linter selection
 * Biome includes formatter, so skip if Biome is selected
 */
export function shouldShowFormatterQuestion(linter: Linter): boolean {
  return linter !== 'biome';
}

/**
 * Get available formatter options based on linter selection
 */
export function getAvailableFormatters(
  selections: Pick<WizardSelections, 'linter'>
): FilteredOption<Formatter>[] {
  const { linter } = selections;

  // If Biome is selected, it handles formatting
  if (linter === 'biome') {
    return [
      {
        value: 'biome',
        label: 'Biome',
        description: 'Included with Biome linter',
        recommended: true,
      },
    ];
  }

  // Show oxfmt and prettier as options
  const formatters: Formatter[] = ['oxfmt', 'prettier'];

  return formatters.map((formatter) => ({
    value: formatter,
    label: formatter === 'oxfmt' ? 'oxfmt' : 'Prettier',
    description:
      formatter === 'oxfmt'
        ? '30x faster than Prettier (alpha, 95%+ compatible)'
        : 'De-facto standard, 100% stable',
    recommended: formatter === DEFAULTS.formatter,
  }));
}

// ============================================================================
// Testing Filters
// ============================================================================

/**
 * Get available unit testing frameworks based on platform/framework
 */
export function getAvailableUnitTesting(
  selections: Pick<WizardSelections, 'platform' | 'framework'>
): FilteredOption<UnitTestFramework>[] {
  const { platform, framework } = selections;

  if (!platform || !framework) {
    return [];
  }

  const frameworkConfig = FRAMEWORKS[framework];
  const testingOptions = frameworkConfig.unitTesting;

  // Apply incompatibility rules
  const filtered = testingOptions.filter((test) => {
    const compatible = checkIncompatibility({ framework }, 'unitTesting', test);
    return compatible.compatible;
  });

  const recommended = DEFAULTS.unitTesting[platform];

  return filtered.map((test) => ({
    value: test,
    label: test === 'vitest' ? 'Vitest' : 'Jest',
    description:
      test === 'vitest'
        ? 'Fast, Vite-native testing (v4.0 stable)'
        : 'Standard testing (required for React Native)',
    recommended: test === recommended,
  }));
}

/**
 * Get available E2E testing frameworks based on platform/framework
 */
export function getAvailableE2ETesting(
  selections: Pick<WizardSelections, 'platform' | 'framework'>
): FilteredOption<E2ETestFramework>[] {
  const { platform, framework } = selections;

  if (!platform || !framework) {
    return [];
  }

  const frameworkConfig = FRAMEWORKS[framework];
  const testingOptions = frameworkConfig.e2eTesting;

  if (testingOptions.length === 0) {
    return [];
  }

  // Apply incompatibility rules
  const filtered = testingOptions.filter((test) => {
    const compatible = checkIncompatibility({ framework }, 'e2eTesting', test);
    return compatible.compatible;
  });

  const recommended = DEFAULTS.e2eTesting[platform];

  return filtered.map((test) => ({
    value: test,
    label: getE2ELabel(test),
    description: getE2EDescription(test),
    recommended: test === recommended,
  }));
}

function getE2ELabel(test: E2ETestFramework): string {
  switch (test) {
    case 'playwright':
      return 'Playwright';
    case 'cypress':
      return 'Cypress';
    case 'maestro':
      return 'Maestro';
    case 'detox':
      return 'Detox';
  }
}

function getE2EDescription(test: E2ETestFramework): string {
  switch (test) {
    case 'playwright':
      return 'Cross-browser testing with auto-wait';
    case 'cypress':
      return 'Developer-friendly E2E testing';
    case 'maestro':
      return 'Mobile E2E with simple YAML flows';
    case 'detox':
      return 'Gray-box mobile testing by Wix';
  }
}

// ============================================================================
// Deployment Filters
// ============================================================================

/**
 * Get available deployment targets based on framework
 */
export function getAvailableDeployment(
  selections: Pick<WizardSelections, 'framework'>
): FilteredOption<DeploymentTarget>[] {
  const { framework } = selections;

  if (!framework) {
    return [];
  }

  const frameworkConfig = FRAMEWORKS[framework];
  const deploymentOptions = frameworkConfig.deployment;

  return deploymentOptions.map((deploy) => ({
    value: deploy,
    label: getDeploymentLabel(deploy),
    description: getDeploymentDescription(deploy),
    recommended: deploy === getRecommendedDeployment(framework),
  }));
}

function getDeploymentLabel(deploy: DeploymentTarget): string {
  switch (deploy) {
    case 'vercel':
      return 'Vercel';
    case 'netlify':
      return 'Netlify';
    case 'cloudflare':
      return 'Cloudflare';
    case 'fly-io':
      return 'Fly.io';
    case 'railway':
      return 'Railway';
    case 'render':
      return 'Render';
    case 'eas':
      return 'EAS Build';
    case 'local-builds':
      return 'Local Builds';
    case 'fastlane':
      return 'Fastlane';
    case 'codemagic':
      return 'Codemagic';
  }
}

function getDeploymentDescription(deploy: DeploymentTarget): string {
  switch (deploy) {
    case 'vercel':
      return 'Best for Next.js, great DX';
    case 'netlify':
      return 'JAMstack pioneer, good for Astro';
    case 'cloudflare':
      return 'Edge-first, great for Hono/RR7';
    case 'fly-io':
      return 'Container-based, good for custom setups';
    case 'railway':
      return 'Simple Docker/Node.js deploys';
    case 'render':
      return 'PaaS alternative to Railway';
    case 'eas':
      return 'Expo cloud builds (recommended)';
    case 'local-builds':
      return 'Build locally with eas build --local';
    case 'fastlane':
      return 'CI/CD automation for mobile';
    case 'codemagic':
      return 'Third-party mobile CI/CD';
  }
}

function getRecommendedDeployment(framework: Framework): DeploymentTarget {
  switch (framework) {
    case 'nextjs':
      return 'vercel';
    case 'tanstack-start':
      return 'vercel';
    case 'react-router':
      return 'cloudflare';
    case 'astro':
      return 'cloudflare';
    case 'expo':
      return 'eas';
    case 'react-native-cli':
      return 'fastlane';
    case 'hono':
      return 'cloudflare';
    case 'elysia':
      return 'fly-io';
  }
}

// ============================================================================
// Generic Incompatibility Checker
// ============================================================================

/**
 * Check if a value is compatible with current selections
 */
function checkIncompatibility(
  currentSelections: Partial<WizardSelections>,
  key: string,
  value: string
): { compatible: boolean; reason?: string } {
  for (const rule of INCOMPATIBILITY_RULES) {
    // Check if current selection triggers the rule
    const ifKey = rule.if.key as keyof WizardSelections;
    const currentValue = currentSelections[ifKey];

    if (currentValue === rule.if.value) {
      // Check if the value we're testing is blocked
      if (rule.cannotUse.key === key && rule.cannotUse.value === value) {
        return { compatible: false, reason: rule.reason };
      }
    }

    // Also check reverse direction
    if (key === rule.if.key && value === rule.if.value) {
      const blockedKey = rule.cannotUse.key as keyof WizardSelections;
      const blockedValue = currentSelections[blockedKey];
      if (blockedValue === rule.cannotUse.value) {
        return { compatible: false, reason: rule.reason };
      }
    }
  }

  return { compatible: true };
}

/**
 * Filter any option list based on current selections and incompatibility rules
 */
export function filterOptions<T extends string>(
  options: T[],
  key: string,
  currentSelections: Partial<WizardSelections>
): Array<{ value: T; disabled: boolean; reason?: string | undefined }> {
  return options.map((option) => {
    const result = checkIncompatibility(currentSelections, key, option);
    return {
      value: option,
      disabled: !result.compatible,
      reason: result.reason,
    };
  });
}

// ============================================================================
// Complete Selections Validation
// ============================================================================

/**
 * Validate all selections are compatible with each other
 */
export function validateSelections(selections: WizardSelections): {
  valid: boolean;
  errors: Array<{ field1: string; field2: string; reason: string }>;
} {
  const errors: Array<{ field1: string; field2: string; reason: string }> = [];

  const entries = Object.entries(selections).filter(
    ([, value]) => value !== undefined
  ) as Array<[string, string]>;

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [key1, value1] = entries[i]!;
      const [key2, value2] = entries[j]!;

      for (const rule of INCOMPATIBILITY_RULES) {
        if (
          (rule.if.key === key1 &&
            rule.if.value === value1 &&
            rule.cannotUse.key === key2 &&
            rule.cannotUse.value === value2) ||
          (rule.if.key === key2 &&
            rule.if.value === value2 &&
            rule.cannotUse.key === key1 &&
            rule.cannotUse.value === value1)
        ) {
          errors.push({
            field1: key1,
            field2: key2,
            reason: rule.reason,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
