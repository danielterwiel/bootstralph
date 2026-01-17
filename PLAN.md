# bootstralph - CLI for Ralph-Powered Project Scaffolding

## Overview

A CLI tool to scaffold projects configured for the Ralph Wiggum autonomous development loop, with intelligent skill installation and compatibility-aware option selection.

## Core Philosophy

**Docker-First**: Claude Code MUST always run in a Docker sandbox. This is non-negotiable for Ralph loops - it's the safest way to run autonomous AI coding agents.

**Interactive Claude by Default**: We don't call the Anthropic API directly. Instead, we guide users to run Claude Code interactively inside the container. Users who want billed API usage can opt-in explicitly.

**Easy Container Setup**: We make instantiating Claude Code in Docker as frictionless as possible, even though it requires manual steps (API key, Docker install, etc.).

---

## Comprehensive Compatibility Matrix

### Platform Types & Compatible Options

```
PLATFORM
├── Web
│   ├── React Meta-Frameworks: Next.js, TanStack Start, React Router v7
│   ├── Content-First: Astro (supports React islands)
│   ├── Routing: Built-in (framework-specific)
│   └── Styling: Tailwind + shadcn/ui, vanilla
├── Mobile
│   ├── Expo (Recommended): Managed workflow, EAS builds
│   ├── React Native CLI: Full native control, manual setup
│   ├── Routing: Expo Router (Expo), React Navigation (both)
│   └── Styling: NativeWind, Tamagui, Unistyles, StyleSheets
├── Universal (Web + Mobile)
│   ├── Framework: Expo + Tamagui (shared components)
│   └── Note: TanStack Router NOT compatible with Expo Router
└── API Only
    ├── Frameworks: Hono, Elysia, tRPC standalone
    └── No UI layer needed
```

### Incompatibility Rules (CRITICAL)

| If Selected | CANNOT Use | Reason |
|-------------|-----------|--------|
| Next.js | TanStack Router | Next.js has built-in routing |
| Next.js | Remix routing | Different framework |
| TanStack Start | React Router | TanStack has own router |
| Expo | TanStack Router | Expo Router required for Expo |
| Expo | Playwright/Cypress | Use Maestro/Detox instead |
| React Native CLI | Expo Router | Use React Navigation |
| Drizzle | Prisma | Pick one ORM |
| better-auth | Clerk | Pick one auth |
| Biome | ESLint + Prettier | Pick one linting approach |
| Vercel deploy | Fly.io/Railway deploy | Pick primary deployment |
| Vitest | Jest (for RN) | Jest required for React Native |
| TanStack Start | Turbopack | TanStack uses Vite |
| Next.js App Router | Pages Router patterns | Different paradigms |

### Framework → Compatible Tech Stack

#### Next.js (Web)
```yaml
routing: built-in (App Router or Pages Router)
bundler: Turbopack (default) or Webpack
styling: Tailwind + shadcn/ui
state: Zustand, Jotai, TanStack Query
orm: Drizzle (edge-compatible), Prisma
auth: better-auth, Clerk
api: tRPC, Server Actions, Route Handlers
testing: Vitest (unit), Playwright (e2e)
deploy: Vercel (optimal), Netlify, Cloudflare, Railway
```

#### TanStack Start (Web)
```yaml
routing: TanStack Router (built-in)
bundler: Vite (required)
styling: Tailwind + shadcn/ui
state: TanStack Query (built-in), Zustand
orm: Drizzle (recommended for edge)
auth: better-auth, Clerk
api: Server Functions, tRPC, Hono
testing: Vitest (unit), Playwright (e2e)
deploy: Any (Vercel, Cloudflare, Fly.io, Railway)
rsc: Not yet supported (coming soon)
```

#### React Router v7 - Framework Mode (Web)
```yaml
routing: React Router (built-in)
bundler: Vite (built-in)
styling: Tailwind + shadcn/ui
state: Zustand, Jotai, TanStack Query
orm: Drizzle, Prisma
auth: better-auth, Clerk
api: Loaders/Actions (built-in)
testing: Vitest (unit), Playwright (e2e)
deploy: Any (Cloudflare Workers optimal)
rsc: Preview available (unstable)
```

#### Expo (Mobile)
```yaml
routing: Expo Router (file-based), React Navigation
bundler: Metro (required)
styling: Uniwind (recommended), NativeWind, Tamagui, Unistyles, StyleSheets
state: Zustand (recommended), Jotai, TanStack Query
orm: N/A (use backend)
auth: Clerk (native support), better-auth (API)
backend: Supabase, Firebase, Convex
testing: Jest (unit), Maestro (e2e, recommended), Detox
deploy: EAS (Expo Application Services)
```

#### React Native CLI (Mobile)
```yaml
routing: React Navigation
bundler: Metro
styling: Uniwind (recommended), NativeWind, Tamagui, StyleSheets
state: Zustand, Jotai, TanStack Query
auth: Clerk, better-auth
testing: Jest (unit), Maestro/Detox (e2e)
deploy: Manual (Xcode/Android Studio), Fastlane
```

#### Astro (Content-First Web)
```yaml
routing: File-based (built-in)
bundler: Vite
styling: Tailwind, vanilla CSS
state: Minimal (islands architecture)
orm: Drizzle, Prisma (for API routes)
auth: better-auth, Clerk (native Astro SDKs with server-side middleware)
api: API Routes, Server Endpoints
testing: Vitest (unit), Playwright (e2e)
deploy: Vercel, Netlify, Cloudflare
note: Use React islands for interactive UI; auth works server-side via middleware
```

### Database/Backend Options by Use Case

| Use Case | Recommended | Alternatives |
|----------|-------------|--------------|
| Real-time + Postgres | Supabase | Convex |
| Real-time collaborative | Convex | Supabase |
| MySQL at scale | PlanetScale | - |
| Edge-compatible | Drizzle + Turso/Neon | Drizzle + PlanetScale |
| NoSQL / Firebase-like | Firebase | Supabase |
| Self-hosted | Postgres + Drizzle | Supabase (self-host) |

### Deployment Platform Compatibility

| Platform | Best For | Limitations |
|----------|----------|-------------|
| Vercel | Next.js, static sites | Vendor lock-in concerns |
| Netlify | Static, ISR, edge | Serverless function limits |
| Cloudflare | Edge-first, Workers | Node.js API differences |
| Fly.io | Docker, global distribution | Learning curve |
| Railway | Full-stack, databases | - |
| Render | Backend, containers | - |

### Edge Runtime Compatibility (IMPORTANT)

Edge runtimes have significant limitations that affect ORM and driver choices:

| Platform | Runtime | ORM Compatibility |
|----------|---------|-------------------|
| Cloudflare Workers | V8 isolates | Drizzle (with @libsql/client, Neon serverless, PlanetScale serverless), Prisma (requires Accelerate or Prisma Postgres) |
| Vercel Edge | V8 isolates | Drizzle (with edge drivers), Prisma (requires Accelerate) |
| Netlify Edge | Deno | Drizzle (with edge drivers), limited Prisma support |
| Vercel Serverless | Node.js | All ORMs supported |
| Railway/Fly.io | Node.js/Docker | All ORMs supported |

**Wizard Validation**: After deployment selection, validate ORM choice against edge runtime. If user selects Prisma + edge platform, warn that Prisma Accelerate is required OR suggest switching to Drizzle with edge-compatible driver.

### Auth Provider Compatibility

| Provider | Next.js | TanStack | Expo | React Native |
|----------|---------|----------|------|--------------|
| better-auth | ✅ | ✅ | ✅ (API) | ✅ (API) |
| Clerk | ✅ | ✅ | ✅ Native | ✅ Native |
| Supabase Auth | ✅ | ✅ | ✅ | ✅ |

### Styling Compatibility

| Library | Web | Expo | React Native | Universal |
|---------|-----|------|--------------|-----------|
| Tailwind + shadcn | ✅ | ❌ | ❌ | ❌ |
| NativeWind | ✅ | ✅ | ✅ | ✅ |
| Uniwind | ❌ | ✅ Best | ✅ Best | ❌ |
| Tamagui | ✅ | ✅ | ✅ | ✅ Best |
| Unistyles | ❌ | ✅ | ✅ | ❌ |

### Linting/Formatting Compatibility

| Tool | Type | Speed | Notes |
|------|------|-------|-------|
| **oxlint** | Linter | 50-100x ESLint | 660+ rules, Rust-based, v1.0 stable |
| **oxfmt** | Formatter | 30x Prettier | Alpha, 95%+ Prettier compatible |
| Biome | Lint + Format | Fast | All-in-one, good adoption |
| ESLint | Linter | Slow | Most rules, legacy standard |
| Prettier | Formatter | Slow | De-facto standard |

### Wizard Flow Logic: Linting & Formatting

The wizard must implement mutual exclusivity for linting/formatting tool selection:

```
LINTING QUESTION → User selects: oxlint | Biome | ESLint

IF Biome selected:
  → SKIP formatting question (Biome handles both lint + format)
  → Set formatter = "biome"

IF oxlint selected:
  → SHOW formatting question: oxfmt (Recommended) | Prettier
  → Set linter = "oxlint", formatter = user_choice

IF ESLint selected:
  → SHOW formatting question: Prettier (Recommended) | oxfmt
  → Set linter = "eslint", formatter = user_choice
```

**Implementation**: This logic should be handled in `src/compatibility/filters.ts` and the formatting prompt in `src/prompts/tooling.ts` should conditionally render based on prior linting selection.

### Pre-Commit Hook Compatibility

| Tool | Language | Speed | Notes |
|------|----------|-------|-------|
| **prek** | Rust | Fastest | Drop-in pre-commit replacement, single binary, parallel execution |
| Lefthook | Go | Fast | Simple config, good Turborepo integration |
| Husky | JavaScript | Moderate | Most popular, npm ecosystem native |

### E2E Testing Compatibility

| Framework | Web | Expo | React Native | Best For |
|-----------|-----|------|--------------|----------|
| **Playwright** | ✅ Best | ❌ | ❌ | Web cross-browser |
| Cypress | ✅ | ❌ | ❌ | Web, good DX |
| **Maestro** | ❌ | ✅ Best | ✅ | Mobile, YAML-based |
| Detox | ❌ | ✅ | ✅ | Mobile, deep RN integration |

### Testing Framework Compatibility

| Framework | Web | Expo | React Native |
|-----------|-----|------|--------------|
| Vitest | ✅ Best | ❌ | ❌ |
| Jest | ✅ | ✅ Best | ✅ Best |
| Playwright | ✅ Best | ❌ | ❌ |
| Cypress | ✅ | ❌ | ❌ |
| Maestro | ❌ | ✅ Best | ✅ |
| Detox | ❌ | ✅ | ✅ |

---

## Skills Installation Strategy

### Using openskills CLI

```bash
# Install openskills globally
npm i -g openskills

# Install from marketplaces
openskills install anthropics/skills
openskills install vercel-labs/agent-skills
openskills install obra/superpowers

# Sync to generate AGENTS.md
openskills sync
```

### Skills by Stack (Auto-Install Matrix)

| Stack Selection | Skills to Install |
|-----------------|-------------------|
| **All Projects** | `planning-with-files`, `superpowers` (TDD, debugging) |
| **Next.js** | `react-best-practices`, `vercel-deploy-claimable`, `web-design-guidelines` |
| **TanStack Start** | `react-best-practices`, `web-design-guidelines` |
| **Expo** | `expo-app-design`, `expo-deployment`, `upgrading-expo` |
| **Supabase** | `supabase-operations`, `supabase-platform-specialist` |
| **Drizzle** | Drizzle patterns (community) |
| **better-auth** | `better-auth` skill |
| **Clerk** | `clerk-pack` (24 skills) |
| **Stripe** | `stripe-integration`, `stripe-best-practices` |
| **Testing (web)** | `vitest-testing-expert`, `webapp-testing` |
| **Tailwind** | `tailwind-v4-shadcn` |
| **Docker** | `docker-containerization` |
| **Monorepo** | `turborepo`, `monorepo-management` |
| **Security** | Trail of Bits skills |

---

## CLI Architecture

### Tech Stack
- **CLI Framework**: `@clack/prompts` (used by create-t3-app, simpler than Ink)
- **Build**: `tsup` (ESM + CJS output)
- **Package Manager Detection**: `detect-package-manager`
- **Command Execution**: `execa`
- **File Operations**: `fs-extra`
- **Skills Management**: `openskills` (programmatic API)
- **No direct AI API calls**: We guide users to use Claude Code in Docker instead

### Scaffolding Strategy (Hybrid)
| Framework | Approach |
|-----------|----------|
| Next.js | Wrap `create-next-app` |
| TanStack Start | Wrap `@tanstack/create-start` (`npm create @tanstack/start@latest`) |
| Expo | Wrap `create-expo-stack` |
| React Native CLI | Wrap `npx react-native init` |
| Astro | Wrap `create astro` |
| React Router v7 | Wrap `create-react-router` (`npx create-react-router@latest`) |
| API (Hono/Elysia) | Own templates (simple) |
| Minimal TypeScript | Own templates (simple) |

### Command Structure

```bash
# Main command - interactive wizard
npx bootstralph create [project-name]

# With preset
npx bootstralph create my-app --preset saas
npx bootstralph create my-app --preset mobile
npx bootstralph create my-app --preset api

# Initialize Ralph in existing project
npx bootstralph init

# Add features post-scaffold
npx bootstralph add auth --provider better-auth
npx bootstralph add payments --provider stripe
npx bootstralph add skill react-best-practices
```

### Directory Structure

```
bootstralph/
├── src/
│   ├── index.ts                    # CLI entry
│   ├── commands/
│   │   ├── create.ts               # Main create wizard
│   │   ├── init.ts                 # Init in existing project
│   │   └── add.ts                  # Add features
│   ├── prompts/
│   │   ├── project-type.ts         # Web/Mobile/API selection
│   │   ├── framework.ts            # Framework selection (filtered by type)
│   │   ├── features.ts             # Auth, DB, etc (filtered by framework)
│   │   └── deployment.ts           # Deploy target
│   ├── compatibility/
│   │   ├── matrix.ts               # Compatibility rules
│   │   ├── filters.ts              # Filter options by prior selections
│   │   └── validators.ts           # Validate combinations
│   ├── scaffolders/
│   │   ├── nextjs.ts               # Wraps create-next-app
│   │   ├── tanstack.ts             # Wraps create-start
│   │   ├── expo.ts                 # Wraps create-expo-stack
│   │   └── base.ts                 # Minimal TypeScript
│   ├── ralph/
│   │   ├── setup.ts                # Ralph loop config
│   │   ├── claudemd.ts             # Generate CLAUDE.md
│   │   ├── skills.ts               # Skills installation
│   │   ├── hooks.ts                # Lefthook + Claude hooks
│   │   └── sandbox.ts              # Docker sandbox
│   ├── templates/
│   │   ├── CLAUDE.md.ts            # Template generator
│   │   ├── lefthook.yml.ts
│   │   └── .claude/
│   │       └── settings.json.ts
│   └── presets/
│       ├── saas.ts                 # Next.js + auth + payments
│       ├── mobile.ts               # Expo + Supabase
│       ├── api.ts                  # Hono + Drizzle
│       └── fullstack.ts            # Monorepo setup
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Claude Code execution | Docker container ONLY | Security, isolation, best practice |
| AI prefill | Via Claude Code in container | No direct API calls, uses interactive Claude |
| Scaffolding | Hybrid | Wrap existing CLIs, own templates for simple setups |
| Web frameworks | Next.js, TanStack, React Router v7, Astro | Cover all major use cases |
| Mobile frameworks | Expo + React Native CLI | Support both managed and bare workflows |
| Mobile styling (default) | Uniwind | Fastest Tailwind for RN, from Unistyles creators |
| Linting (default) | oxlint | 50-100x faster than ESLint, 660+ rules |
| Formatting (default) | oxfmt | 30x faster than Prettier, 95%+ compatible |
| Unit testing (default) | Vitest (web), Jest (mobile) | Vitest fastest, Jest required for RN |
| E2E testing (default) | Playwright (web), Maestro (mobile) | Cross-browser/YAML-based, cloud options |
| Pre-commit hooks (default) | prek | Rust, fastest, drop-in pre-commit replacement |
| Package manager (default) | bun | Fastest, all-in-one runtime |
| CLI framework | @clack/prompts | Simple, proven, used by create-t3-app |
| Skills management | openskills | Universal loader, works with any agent |

---

## Sources

- [openskills](https://github.com/numman-ali/openskills) - Universal skills loader
- [Oxc (oxlint + oxfmt)](https://oxc.rs/) - High-performance JavaScript tools in Rust
- [Uniwind](https://uniwind.dev/) - Fastest Tailwind bindings for React Native
- [prek](https://github.com/j178/prek) - Rust-based pre-commit replacement
- [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) - Vercel's React/deploy skills
- [obra/superpowers](https://github.com/obra/superpowers) - TDD/debugging skills
- [expo/skills](https://github.com/expo/skills) - Official Expo skills
- [create-t3-app](https://create.t3.gg/) - Inspiration for CLI UX
- [create-expo-stack](https://github.com/roninoss/create-expo-stack) - Expo scaffolding
- [TanStack Start](https://tanstack.com/start/latest) - Modern React framework
- [Lefthook](https://lefthook.dev/) - Git hooks manager
- [Husky](https://typicode.github.io/husky/) - Git hooks for JavaScript
- [Claude Code Hooks](https://code.claude.com/docs/en/hooks-guide) - Hook configuration
