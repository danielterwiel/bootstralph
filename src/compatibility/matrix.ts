/**
 * Compatibility matrix data structure
 * Defines all platform types, frameworks, and their compatible tech stacks
 */

// ============================================================================
// Core Types
// ============================================================================

export type Platform = 'web' | 'mobile' | 'universal' | 'api';

export type Framework =
  | 'nextjs'
  | 'tanstack-start'
  | 'react-router'
  | 'astro'
  | 'expo'
  | 'react-native-cli'
  | 'hono'
  | 'elysia';

export type Styling =
  | 'tailwind-shadcn'
  | 'tailwind'
  | 'nativewind'
  | 'uniwind'
  | 'tamagui'
  | 'unistyles'
  | 'stylesheets'
  | 'vanilla';

export type StateManagement = 'zustand' | 'jotai' | 'tanstack-query';

export type ORM = 'drizzle' | 'prisma' | 'none';

export type Backend = 'supabase' | 'firebase' | 'convex' | 'custom';

export type AuthProvider = 'better-auth' | 'clerk' | 'supabase-auth';

export type Linter = 'oxlint' | 'biome' | 'eslint';

export type Formatter = 'oxfmt' | 'prettier' | 'biome';

export type UnitTestFramework = 'vitest' | 'jest';

export type E2ETestFramework = 'playwright' | 'cypress' | 'maestro' | 'detox';

export type DeploymentTarget =
  | 'vercel'
  | 'netlify'
  | 'cloudflare'
  | 'fly-io'
  | 'railway'
  | 'render'
  | 'eas'
  | 'local-builds'
  | 'fastlane'
  | 'codemagic';

export type PreCommitTool = 'prek' | 'lefthook' | 'husky';

export type Bundler = 'turbopack' | 'webpack' | 'vite' | 'metro';

export type Routing =
  | 'nextjs-app-router'
  | 'nextjs-pages-router'
  | 'tanstack-router'
  | 'react-router'
  | 'expo-router'
  | 'react-navigation'
  | 'file-based';

// ============================================================================
// Platform Configuration
// ============================================================================

export interface PlatformConfig {
  id: Platform;
  name: string;
  description: string;
  frameworks: Framework[];
}

export const PLATFORMS: Record<Platform, PlatformConfig> = {
  web: {
    id: 'web',
    name: 'Web',
    description: 'Web applications (SSR, SSG, SPA)',
    frameworks: ['nextjs', 'tanstack-start', 'react-router', 'astro'],
  },
  mobile: {
    id: 'mobile',
    name: 'Mobile',
    description: 'iOS and Android applications',
    frameworks: ['expo', 'react-native-cli'],
  },
  universal: {
    id: 'universal',
    name: 'Universal',
    description: 'Web + Mobile with shared codebase',
    frameworks: ['expo'], // Uses Expo + Tamagui monorepo
  },
  api: {
    id: 'api',
    name: 'API Only',
    description: 'Backend API without UI',
    frameworks: ['hono', 'elysia'],
  },
};

// ============================================================================
// Framework Configuration
// ============================================================================

export interface FrameworkConfig {
  id: Framework;
  name: string;
  description: string;
  platform: Platform[];
  bundler: Bundler[];
  routing: Routing[];
  styling: Styling[];
  state: StateManagement[];
  orm: ORM[];
  backend: Backend[];
  auth: AuthProvider[];
  unitTesting: UnitTestFramework[];
  e2eTesting: E2ETestFramework[];
  deployment: DeploymentTarget[];
  scaffoldCommand: string;
  notes?: string;
}

export const FRAMEWORKS: Record<Framework, FrameworkConfig> = {
  nextjs: {
    id: 'nextjs',
    name: 'Next.js',
    description: 'React meta-framework with App Router',
    platform: ['web'],
    bundler: ['turbopack', 'webpack'],
    routing: ['nextjs-app-router', 'nextjs-pages-router'],
    styling: ['tailwind-shadcn', 'tailwind', 'vanilla'],
    state: ['zustand', 'jotai', 'tanstack-query'],
    orm: ['drizzle', 'prisma'],
    backend: ['supabase', 'convex', 'custom'],
    auth: ['better-auth', 'clerk', 'supabase-auth'],
    unitTesting: ['vitest'],
    e2eTesting: ['playwright', 'cypress'],
    deployment: ['vercel', 'netlify', 'cloudflare', 'railway'],
    scaffoldCommand: 'npx create-next-app@latest',
    notes: 'Convex provides server rendering via convex/nextjs helpers',
  },
  'tanstack-start': {
    id: 'tanstack-start',
    name: 'TanStack Start',
    description: 'Modern React framework with type-safe routing',
    platform: ['web'],
    bundler: ['vite'],
    routing: ['tanstack-router'],
    styling: ['tailwind-shadcn', 'tailwind', 'vanilla'],
    state: ['tanstack-query', 'zustand'],
    orm: ['drizzle'],
    backend: ['supabase', 'convex', 'custom'],
    auth: ['better-auth', 'clerk', 'supabase-auth'],
    unitTesting: ['vitest'],
    e2eTesting: ['playwright'],
    deployment: ['vercel', 'cloudflare', 'fly-io', 'railway'],
    scaffoldCommand: 'npm create @tanstack/start@latest',
    notes: 'RSC not yet supported. Convex + TanStack Query integration via @convex-dev/react-query',
  },
  'react-router': {
    id: 'react-router',
    name: 'React Router v7',
    description: 'Framework mode with loaders/actions (formerly Remix)',
    platform: ['web'],
    bundler: ['vite'],
    routing: ['react-router'],
    styling: ['tailwind-shadcn', 'tailwind', 'vanilla'],
    state: ['zustand', 'jotai', 'tanstack-query'],
    orm: ['drizzle', 'prisma'],
    backend: ['supabase', 'convex', 'custom'],
    auth: ['better-auth', 'clerk', 'supabase-auth'],
    unitTesting: ['vitest'],
    e2eTesting: ['playwright'],
    deployment: ['cloudflare', 'vercel', 'netlify', 'fly-io', 'railway'],
    scaffoldCommand: 'npx create-react-router@latest',
    notes: 'RSC preview available. Cloudflare Workers optimal deployment.',
  },
  astro: {
    id: 'astro',
    name: 'Astro',
    description: 'Content-first framework with islands architecture',
    platform: ['web'],
    bundler: ['vite'],
    routing: ['file-based'],
    styling: ['tailwind', 'vanilla'],
    state: [], // Minimal state - islands architecture
    orm: ['drizzle', 'prisma'],
    backend: ['supabase', 'convex', 'custom'],
    auth: ['better-auth', 'clerk', 'supabase-auth'],
    unitTesting: ['vitest'],
    e2eTesting: ['playwright'],
    deployment: ['vercel', 'netlify', 'cloudflare'],
    scaffoldCommand: 'npm create astro@latest',
    notes: 'Use React islands for interactive UI. Convex uses withConvexProvider wrapper.',
  },
  expo: {
    id: 'expo',
    name: 'Expo',
    description: 'Managed React Native workflow with cloud builds',
    platform: ['mobile', 'universal'],
    bundler: ['metro'],
    routing: ['expo-router', 'react-navigation'],
    styling: ['uniwind', 'nativewind', 'tamagui', 'unistyles', 'stylesheets'],
    state: ['zustand', 'jotai', 'tanstack-query'],
    orm: ['none'], // Use backend services
    backend: ['supabase', 'firebase', 'convex'],
    auth: ['clerk', 'better-auth', 'supabase-auth'],
    unitTesting: ['jest'],
    e2eTesting: ['maestro', 'detox'],
    deployment: ['eas', 'local-builds', 'fastlane', 'codemagic'],
    scaffoldCommand: 'npx create-expo-stack@latest',
    notes: 'better-auth has native SDK via @better-auth/expo',
  },
  'react-native-cli': {
    id: 'react-native-cli',
    name: 'React Native CLI',
    description: 'Bare React Native workflow with full native control',
    platform: ['mobile'],
    bundler: ['metro'],
    routing: ['react-navigation'],
    styling: ['uniwind', 'nativewind', 'tamagui', 'stylesheets'],
    state: ['zustand', 'jotai', 'tanstack-query'],
    orm: ['none'],
    backend: ['supabase', 'firebase', 'convex'],
    auth: ['clerk', 'better-auth', 'supabase-auth'],
    unitTesting: ['jest'],
    e2eTesting: ['maestro', 'detox'],
    deployment: ['fastlane', 'local-builds'],
    scaffoldCommand: 'npx react-native init',
    notes: 'Requires Xcode (iOS) and Android Studio (Android) setup',
  },
  hono: {
    id: 'hono',
    name: 'Hono',
    description: 'Lightweight, ultrafast web framework for the edge',
    platform: ['api'],
    bundler: ['vite'],
    routing: [],
    styling: [],
    state: [],
    orm: ['drizzle', 'prisma'],
    backend: ['custom'],
    auth: ['better-auth'],
    unitTesting: ['vitest'],
    e2eTesting: [],
    deployment: ['cloudflare', 'vercel', 'fly-io', 'railway'],
    scaffoldCommand: 'npm create hono@latest',
    notes: 'Edge-first, works with Cloudflare Workers',
  },
  elysia: {
    id: 'elysia',
    name: 'Elysia',
    description: 'TypeScript-first Bun web framework',
    platform: ['api'],
    bundler: ['vite'],
    routing: [],
    styling: [],
    state: [],
    orm: ['drizzle', 'prisma'],
    backend: ['custom'],
    auth: ['better-auth'],
    unitTesting: ['vitest'],
    e2eTesting: [],
    deployment: ['fly-io', 'railway', 'render'],
    scaffoldCommand: 'bun create elysia',
    notes: 'Requires Bun runtime',
  },
};

// ============================================================================
// Incompatibility Rules
// ============================================================================

export interface IncompatibilityRule {
  id: string;
  if: { key: string; value: string };
  cannotUse: { key: string; value: string };
  reason: string;
}

export const INCOMPATIBILITY_RULES: IncompatibilityRule[] = [
  // Framework + Routing conflicts
  {
    id: 'nextjs-tanstack-router',
    if: { key: 'framework', value: 'nextjs' },
    cannotUse: { key: 'routing', value: 'tanstack-router' },
    reason: 'Next.js has built-in routing',
  },
  {
    id: 'nextjs-react-router',
    if: { key: 'framework', value: 'nextjs' },
    cannotUse: { key: 'routing', value: 'react-router' },
    reason: 'Next.js has built-in routing',
  },
  {
    id: 'tanstack-react-router',
    if: { key: 'framework', value: 'tanstack-start' },
    cannotUse: { key: 'routing', value: 'react-router' },
    reason: 'TanStack Start uses TanStack Router',
  },
  {
    id: 'expo-tanstack-router',
    if: { key: 'framework', value: 'expo' },
    cannotUse: { key: 'routing', value: 'tanstack-router' },
    reason: 'Expo Router required for Expo',
  },
  {
    id: 'rn-cli-expo-router',
    if: { key: 'framework', value: 'react-native-cli' },
    cannotUse: { key: 'routing', value: 'expo-router' },
    reason: 'React Native CLI uses React Navigation',
  },

  // ORM conflicts
  {
    id: 'drizzle-prisma',
    if: { key: 'orm', value: 'drizzle' },
    cannotUse: { key: 'orm', value: 'prisma' },
    reason: 'Pick one ORM',
  },

  // Auth conflicts
  {
    id: 'better-auth-clerk',
    if: { key: 'auth', value: 'better-auth' },
    cannotUse: { key: 'auth', value: 'clerk' },
    reason: 'Pick one auth provider',
  },
  {
    id: 'better-auth-supabase-auth',
    if: { key: 'auth', value: 'better-auth' },
    cannotUse: { key: 'auth', value: 'supabase-auth' },
    reason: 'Pick one auth provider',
  },
  {
    id: 'clerk-supabase-auth',
    if: { key: 'auth', value: 'clerk' },
    cannotUse: { key: 'auth', value: 'supabase-auth' },
    reason: 'Pick one auth provider',
  },

  // Linting conflicts
  {
    id: 'biome-eslint',
    if: { key: 'linter', value: 'biome' },
    cannotUse: { key: 'linter', value: 'eslint' },
    reason: 'Biome replaces ESLint + Prettier',
  },
  {
    id: 'biome-prettier',
    if: { key: 'linter', value: 'biome' },
    cannotUse: { key: 'formatter', value: 'prettier' },
    reason: 'Biome includes formatting',
  },

  // Testing conflicts
  {
    id: 'expo-vitest',
    if: { key: 'framework', value: 'expo' },
    cannotUse: { key: 'unitTesting', value: 'vitest' },
    reason: 'Jest required for React Native',
  },
  {
    id: 'rn-cli-vitest',
    if: { key: 'framework', value: 'react-native-cli' },
    cannotUse: { key: 'unitTesting', value: 'vitest' },
    reason: 'Jest required for React Native',
  },
  {
    id: 'expo-playwright',
    if: { key: 'framework', value: 'expo' },
    cannotUse: { key: 'e2eTesting', value: 'playwright' },
    reason: 'Use Maestro/Detox for mobile E2E',
  },
  {
    id: 'expo-cypress',
    if: { key: 'framework', value: 'expo' },
    cannotUse: { key: 'e2eTesting', value: 'cypress' },
    reason: 'Use Maestro/Detox for mobile E2E',
  },
  {
    id: 'rn-cli-playwright',
    if: { key: 'framework', value: 'react-native-cli' },
    cannotUse: { key: 'e2eTesting', value: 'playwright' },
    reason: 'Use Maestro/Detox for mobile E2E',
  },
  {
    id: 'rn-cli-cypress',
    if: { key: 'framework', value: 'react-native-cli' },
    cannotUse: { key: 'e2eTesting', value: 'cypress' },
    reason: 'Use Maestro/Detox for mobile E2E',
  },

  // Bundler conflicts
  {
    id: 'tanstack-turbopack',
    if: { key: 'framework', value: 'tanstack-start' },
    cannotUse: { key: 'bundler', value: 'turbopack' },
    reason: 'TanStack Start uses Vite',
  },
  {
    id: 'expo-vite',
    if: { key: 'framework', value: 'expo' },
    cannotUse: { key: 'bundler', value: 'vite' },
    reason: 'Expo uses Metro bundler',
  },
  {
    id: 'rn-cli-vite',
    if: { key: 'framework', value: 'react-native-cli' },
    cannotUse: { key: 'bundler', value: 'vite' },
    reason: 'React Native uses Metro bundler',
  },

  // Deployment conflicts (primary targets)
  {
    id: 'vercel-fly',
    if: { key: 'deployment', value: 'vercel' },
    cannotUse: { key: 'deployment', value: 'fly-io' },
    reason: 'Pick primary deployment target',
  },
  {
    id: 'vercel-railway',
    if: { key: 'deployment', value: 'vercel' },
    cannotUse: { key: 'deployment', value: 'railway' },
    reason: 'Pick primary deployment target',
  },
];

// ============================================================================
// Edge Runtime Compatibility
// ============================================================================

export interface EdgeCompatibility {
  platform: DeploymentTarget;
  runtime: string;
  ormSupport: {
    drizzle: { supported: boolean; drivers: string[] };
    prisma: { supported: boolean; requirements: string[] };
  };
}

export const EDGE_COMPATIBILITY: EdgeCompatibility[] = [
  {
    platform: 'cloudflare',
    runtime: 'V8 isolates',
    ormSupport: {
      drizzle: {
        supported: true,
        drivers: ['@libsql/client', 'Neon serverless', 'PlanetScale serverless'],
      },
      prisma: {
        supported: true,
        requirements: ['Prisma Accelerate', 'Prisma Postgres'],
      },
    },
  },
  {
    platform: 'vercel',
    runtime: 'V8 isolates (Edge) / Node.js (Serverless)',
    ormSupport: {
      drizzle: {
        supported: true,
        drivers: ['Edge drivers', 'Node.js drivers'],
      },
      prisma: {
        supported: true,
        requirements: ['Prisma Accelerate for Edge', 'All features for Serverless'],
      },
    },
  },
  {
    platform: 'netlify',
    runtime: 'Deno (Edge) / Node.js (Functions)',
    ormSupport: {
      drizzle: {
        supported: true,
        drivers: ['Edge drivers'],
      },
      prisma: {
        supported: false,
        requirements: ['Limited support on Netlify Edge'],
      },
    },
  },
  {
    platform: 'railway',
    runtime: 'Node.js / Docker',
    ormSupport: {
      drizzle: { supported: true, drivers: ['All drivers'] },
      prisma: { supported: true, requirements: [] },
    },
  },
  {
    platform: 'fly-io',
    runtime: 'Node.js / Docker',
    ormSupport: {
      drizzle: { supported: true, drivers: ['All drivers'] },
      prisma: { supported: true, requirements: [] },
    },
  },
];

// ============================================================================
// Styling Compatibility Matrix
// ============================================================================

export interface StylingCompatibility {
  styling: Styling;
  web: boolean;
  expo: boolean;
  reactNative: boolean;
  universal: boolean;
  recommended?: Platform;
}

export const STYLING_COMPATIBILITY: StylingCompatibility[] = [
  {
    styling: 'tailwind-shadcn',
    web: true,
    expo: false,
    reactNative: false,
    universal: false,
  },
  {
    styling: 'tailwind',
    web: true,
    expo: false,
    reactNative: false,
    universal: false,
  },
  {
    styling: 'nativewind',
    web: true,
    expo: true,
    reactNative: true,
    universal: true,
  },
  {
    styling: 'uniwind',
    web: false,
    expo: true,
    reactNative: true,
    universal: false,
    recommended: 'mobile',
  },
  {
    styling: 'tamagui',
    web: true,
    expo: true,
    reactNative: true,
    universal: true,
    recommended: 'universal',
  },
  {
    styling: 'unistyles',
    web: false,
    expo: true,
    reactNative: true,
    universal: false,
  },
  {
    styling: 'stylesheets',
    web: false,
    expo: true,
    reactNative: true,
    universal: false,
  },
  {
    styling: 'vanilla',
    web: true,
    expo: false,
    reactNative: false,
    universal: false,
  },
];

// ============================================================================
// Testing Compatibility Matrix
// ============================================================================

export interface TestingCompatibility {
  framework: UnitTestFramework | E2ETestFramework;
  type: 'unit' | 'e2e';
  web: boolean;
  expo: boolean;
  reactNative: boolean;
  recommended?: Platform;
}

export const TESTING_COMPATIBILITY: TestingCompatibility[] = [
  // Unit testing
  { framework: 'vitest', type: 'unit', web: true, expo: false, reactNative: false, recommended: 'web' },
  { framework: 'jest', type: 'unit', web: true, expo: true, reactNative: true, recommended: 'mobile' },
  // E2E testing
  { framework: 'playwright', type: 'e2e', web: true, expo: false, reactNative: false, recommended: 'web' },
  { framework: 'cypress', type: 'e2e', web: true, expo: false, reactNative: false },
  { framework: 'maestro', type: 'e2e', web: false, expo: true, reactNative: true, recommended: 'mobile' },
  { framework: 'detox', type: 'e2e', web: false, expo: true, reactNative: true },
];

// ============================================================================
// Linting & Formatting Configuration
// ============================================================================

export interface LinterConfig {
  id: Linter;
  name: string;
  description: string;
  includesFormatter: boolean;
  speed: 'fast' | 'moderate' | 'slow';
}

export const LINTERS: Record<Linter, LinterConfig> = {
  oxlint: {
    id: 'oxlint',
    name: 'oxlint',
    description: '50-100x faster than ESLint, 660+ rules, Rust-based',
    includesFormatter: false,
    speed: 'fast',
  },
  biome: {
    id: 'biome',
    name: 'Biome',
    description: 'All-in-one linter and formatter, good adoption',
    includesFormatter: true,
    speed: 'fast',
  },
  eslint: {
    id: 'eslint',
    name: 'ESLint',
    description: 'Most rules available, ecosystem standard',
    includesFormatter: false,
    speed: 'slow',
  },
};

export interface FormatterConfig {
  id: Formatter;
  name: string;
  description: string;
  speed: 'fast' | 'moderate' | 'slow';
  stability: 'alpha' | 'stable';
}

export const FORMATTERS: Record<Formatter, FormatterConfig> = {
  oxfmt: {
    id: 'oxfmt',
    name: 'oxfmt',
    description: '30x faster than Prettier, 95%+ compatible',
    speed: 'fast',
    stability: 'alpha',
  },
  prettier: {
    id: 'prettier',
    name: 'Prettier',
    description: 'De-facto standard, 100% stable',
    speed: 'slow',
    stability: 'stable',
  },
  biome: {
    id: 'biome',
    name: 'Biome',
    description: 'Included with Biome linter',
    speed: 'fast',
    stability: 'stable',
  },
};

// ============================================================================
// Default Recommendations
// ============================================================================

export interface DefaultRecommendations {
  linter: Linter;
  formatter: Formatter;
  unitTesting: Record<Platform, UnitTestFramework>;
  e2eTesting: Record<Platform, E2ETestFramework>;
  styling: Record<Platform, Styling>;
  preCommit: PreCommitTool;
  packageManager: 'bun' | 'pnpm' | 'npm' | 'yarn';
}

export const DEFAULTS: DefaultRecommendations = {
  linter: 'oxlint',
  formatter: 'oxfmt',
  unitTesting: {
    web: 'vitest',
    mobile: 'jest',
    universal: 'jest',
    api: 'vitest',
  },
  e2eTesting: {
    web: 'playwright',
    mobile: 'maestro',
    universal: 'maestro',
    api: 'playwright',
  },
  styling: {
    web: 'tailwind-shadcn',
    mobile: 'uniwind',
    universal: 'tamagui',
    api: 'vanilla',
  },
  preCommit: 'prek',
  packageManager: 'bun',
};

// ============================================================================
// Skills Matrix
// ============================================================================

export interface SkillDefinition {
  name: string;
  source: string;
  description?: string;
}

export interface SkillsByStack {
  condition: { key: string; values: string[] } | 'all';
  skills: SkillDefinition[];
}

export const SKILLS_MATRIX: SkillsByStack[] = [
  {
    condition: 'all',
    skills: [
      { name: 'planning-with-files', source: 'OthmanAdi/planning-with-files' },
      { name: 'test-driven-development', source: 'obra/superpowers' },
      { name: 'systematic-debugging', source: 'obra/superpowers' },
      { name: 'verification-before-completion', source: 'obra/superpowers' },
    ],
  },
  {
    condition: { key: 'framework', values: ['nextjs'] },
    skills: [
      { name: 'react-best-practices', source: 'vercel-labs/agent-skills' },
      { name: 'vercel-deploy-claimable', source: 'vercel-labs/agent-skills' },
      { name: 'web-design-guidelines', source: 'vercel-labs/agent-skills' },
    ],
  },
  {
    condition: { key: 'framework', values: ['tanstack-start', 'react-router'] },
    skills: [
      { name: 'react-best-practices', source: 'vercel-labs/agent-skills' },
      { name: 'web-design-guidelines', source: 'vercel-labs/agent-skills' },
    ],
  },
  {
    condition: { key: 'framework', values: ['expo', 'react-native-cli'] },
    skills: [
      { name: 'expo-app-design', source: 'expo/skills' },
      { name: 'expo-deployment', source: 'expo/skills' },
      { name: 'upgrading-expo', source: 'expo/skills' },
    ],
  },
  {
    condition: { key: 'backend', values: ['supabase'] },
    skills: [{ name: 'supabase-operations', source: 'FastMCP marketplace' }],
  },
  {
    condition: { key: 'backend', values: ['convex'] },
    skills: [{ name: 'convex', source: '@ThijmenGThN/next-leaflet or community' }],
  },
  {
    condition: { key: 'backend', values: ['firebase'] },
    skills: [
      {
        name: 'firebase-functions-templates',
        source: '@onesmartguy/next-level-real-estate',
        description: 'Cloud Functions with TypeScript/Express',
      },
    ],
  },
  {
    condition: { key: 'orm', values: ['drizzle'] },
    skills: [
      { name: 'drizzle-orm-d1', source: '@jezweb/claude-skills' },
      { name: 'drizzle', source: '@korallis/Droidz' },
      { name: 'drizzle-migration', source: '@Dexploarer/hyper-forge' },
    ],
  },
  {
    condition: { key: 'auth', values: ['better-auth'] },
    skills: [{ name: 'better-auth', source: '@Microck/ordinary-claude-skills' }],
  },
  {
    condition: { key: 'auth', values: ['clerk'] },
    skills: [{ name: 'clerk-pack', source: 'claude-code-plugins-plus' }],
  },
  {
    condition: { key: 'styling', values: ['tailwind-shadcn', 'tailwind'] },
    skills: [{ name: 'tailwind-v4-shadcn', source: 'community skills' }],
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get frameworks available for a platform
 */
export function getFrameworksForPlatform(platform: Platform): Framework[] {
  return PLATFORMS[platform].frameworks;
}

/**
 * Get full framework configuration
 */
export function getFrameworkConfig(framework: Framework): FrameworkConfig {
  return FRAMEWORKS[framework];
}

/**
 * Check if two selections are compatible
 */
export function areSelectionsCompatible(
  selection1: { key: string; value: string },
  selection2: { key: string; value: string }
): { compatible: boolean; reason?: string } {
  for (const rule of INCOMPATIBILITY_RULES) {
    if (
      (rule.if.key === selection1.key &&
        rule.if.value === selection1.value &&
        rule.cannotUse.key === selection2.key &&
        rule.cannotUse.value === selection2.value) ||
      (rule.if.key === selection2.key &&
        rule.if.value === selection2.value &&
        rule.cannotUse.key === selection1.key &&
        rule.cannotUse.value === selection1.value)
    ) {
      return { compatible: false, reason: rule.reason };
    }
  }
  return { compatible: true };
}

/**
 * Get incompatible options for a given selection
 */
export function getIncompatibleOptions(selection: {
  key: string;
  value: string;
}): Array<{ key: string; value: string; reason: string }> {
  const incompatible: Array<{ key: string; value: string; reason: string }> = [];

  for (const rule of INCOMPATIBILITY_RULES) {
    if (rule.if.key === selection.key && rule.if.value === selection.value) {
      incompatible.push({
        key: rule.cannotUse.key,
        value: rule.cannotUse.value,
        reason: rule.reason,
      });
    }
  }

  return incompatible;
}

/**
 * Get styling options for a platform
 */
export function getStylingForPlatform(platform: Platform): Styling[] {
  const platformKey = platform === 'mobile' ? 'expo' : platform === 'universal' ? 'universal' : 'web';

  return STYLING_COMPATIBILITY.filter((s) => {
    if (platformKey === 'expo') return s.expo;
    if (platformKey === 'universal') return s.universal;
    return s.web;
  }).map((s) => s.styling);
}

/**
 * Get recommended styling for a platform
 */
export function getRecommendedStyling(platform: Platform): Styling {
  return DEFAULTS.styling[platform];
}

/**
 * Check if ORM is compatible with edge deployment
 */
export function checkEdgeORMCompatibility(
  orm: ORM,
  deployment: DeploymentTarget
): { compatible: boolean; requirements?: string[] } {
  const edgeConfig = EDGE_COMPATIBILITY.find((e) => e.platform === deployment);
  if (!edgeConfig) return { compatible: true };

  const ormConfig = edgeConfig.ormSupport[orm as 'drizzle' | 'prisma'];
  if (!ormConfig) return { compatible: true };

  const requirements =
    'requirements' in ormConfig && ormConfig.requirements.length > 0
      ? ormConfig.requirements
      : undefined;

  if (requirements) {
    return { compatible: ormConfig.supported, requirements };
  }
  return { compatible: ormConfig.supported };
}

/**
 * Get skills to install for a given configuration
 */
export function getSkillsForConfig(config: Record<string, string>): SkillDefinition[] {
  const skills: SkillDefinition[] = [];

  for (const skillSet of SKILLS_MATRIX) {
    if (skillSet.condition === 'all') {
      skills.push(...skillSet.skills);
    } else {
      const configValue = config[skillSet.condition.key];
      if (configValue && skillSet.condition.values.includes(configValue)) {
        skills.push(...skillSet.skills);
      }
    }
  }

  // Deduplicate by name
  const seen = new Set<string>();
  return skills.filter((skill) => {
    if (seen.has(skill.name)) return false;
    seen.add(skill.name);
    return true;
  });
}
