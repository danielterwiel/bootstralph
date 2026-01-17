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
backend: Convex (real-time), Supabase
auth: better-auth, Clerk, Supabase Auth
api: tRPC, Server Actions, Route Handlers
testing: Vitest (unit), Playwright (e2e)
deploy: Vercel (optimal), Netlify, Cloudflare, Railway
note: Convex provides server rendering via convex/nextjs helpers (preloadQuery, fetchQuery)
```

#### TanStack Start (Web)
```yaml
routing: TanStack Router (built-in)
bundler: Vite (required)
styling: Tailwind + shadcn/ui
state: TanStack Query (built-in), Zustand
orm: Drizzle (recommended for edge)
backend: Convex (real-time), Supabase
auth: better-auth, Clerk, Supabase Auth
api: Server Functions, tRPC, Hono
testing: Vitest (unit), Playwright (e2e)
deploy: Any (Vercel, Cloudflare, Fly.io, Railway)
rsc: Not yet supported (coming soon)
note: Convex + TanStack Query integration via @convex-dev/react-query with SSR and live updates
```

#### React Router v7 - Framework Mode (Web)
```yaml
routing: React Router (built-in)
bundler: Vite (built-in)
styling: Tailwind + shadcn/ui
state: Zustand, Jotai, TanStack Query
orm: Drizzle, Prisma
backend: Convex (real-time), Supabase
auth: better-auth, Clerk, Supabase Auth
api: Loaders/Actions (built-in)
testing: Vitest (unit), Playwright (e2e)
deploy: Any (Cloudflare Workers optimal)
rsc: Preview available (unstable)
note: Convex React client works with React Router v7's standard React patterns
```

#### Expo (Mobile)
```yaml
routing: Expo Router (file-based), React Navigation
bundler: Metro (required)
styling: Uniwind (recommended), NativeWind, Tamagui, Unistyles, StyleSheets
state: Zustand (recommended), Jotai, TanStack Query
orm: N/A (use backend)
auth: Clerk (native SDK), better-auth (native SDK via @better-auth/expo), Supabase Auth (native via @supabase/supabase-js)
backend: Supabase, Firebase, Convex
testing: Jest (unit), Maestro (e2e, recommended), Detox
deploy: EAS Build (recommended), Local Builds (eas build --local), GitHub Actions + Fastlane, Codemagic
```

**Expo Deployment Options:**
- **EAS Build (Recommended)**: Cloud builds with automatic credential management, no local Xcode/Android Studio required
- **Local Builds**: `eas build --local` for unlimited free builds on your own hardware (requires Xcode/Android Studio)
- **GitHub Actions + Fastlane**: Self-hosted CI/CD for teams wanting full control and no per-build costs
- **Codemagic**: Third-party cloud CI/CD with pay-as-you-go pricing

#### React Native CLI (Mobile)
```yaml
routing: React Navigation
bundler: Metro
styling: Uniwind (recommended), NativeWind, Tamagui, StyleSheets
state: Zustand, Jotai, TanStack Query
auth: Clerk, better-auth, Supabase Auth
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
backend: Convex (via React islands), Supabase
auth: better-auth, Clerk, Supabase Auth (native Astro SDKs with server-side middleware)
api: API Routes, Server Endpoints
testing: Vitest (unit), Playwright (e2e)
deploy: Vercel, Netlify, Cloudflare
note: Use React islands for interactive UI; Convex uses withConvexProvider wrapper for islands
```

### Database/Backend Options by Use Case

| Use Case | Recommended | Alternatives |
|----------|-------------|--------------|
| Real-time + Postgres | Supabase | Convex |
| Real-time collaborative | Convex | Supabase |
| Reactive queries + type-safety | Convex | Supabase |
| MySQL at scale | PlanetScale | - |
| Edge-compatible | Drizzle + Turso/Neon | Drizzle + PlanetScale |
| NoSQL / Firebase-like | Firebase | Supabase, Convex |
| Self-hosted | Postgres + Drizzle | Supabase (self-host) |
| Full-stack type-safe backend | Convex | tRPC + Drizzle |

**Convex Framework Compatibility:**
- **Next.js**: Full support via `convex/nextjs` helpers (preloadQuery, fetchQuery, fetchMutation)
- **TanStack Start**: First-class integration via `@convex-dev/react-query` with SSR and live updates
- **React Router v7**: Works with standard Convex React client
- **Expo/React Native**: Official quickstart, same React client as web
- **Astro**: Official starter template with `withConvexProvider` wrapper for React islands

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
| better-auth | ✅ | ✅ | ✅ Native | ✅ Native |
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

**prek + bun Note**: Prek uses `npm install .` for Node.js hook dependencies regardless of the project's package manager. This is intentional - prek manages isolated hook environments separate from the project. A bun-based project works perfectly with prek because:
1. Hook environments are isolated (prek uses its own npm-based Node.js environments)
2. prek itself is a standalone Rust binary with no JavaScript runtime dependency
3. Project development uses bun, while hooks run in prek's managed environments

### Lefthook Configuration Examples

Example `lefthook.yml` for oxlint and oxfmt:

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    oxlint:
      glob: "*.{js,ts,jsx,tsx}"
      run: npx oxlint --fix {staged_files}
      stage_fixed: true
      skip:
        - merge
        - rebase

    oxfmt:
      glob: "*.{js,ts,jsx,tsx}"
      run: npx oxfmt {staged_files}
      stage_fixed: true
      skip:
        - merge
        - rebase

pre-push:
  parallel: true
  commands:
    typecheck:
      glob: "*.{ts,tsx}"
      run: npx tsc --noEmit
```

**Key Configuration Options:**
- `{staged_files}` - Template for files in staging area (pre-commit) or unpushed files (pre-push)
- `stage_fixed: true` - Automatically `git add` files modified by `--fix` flags
- `glob` - Filter files by pattern (supports multiple patterns as list in v1.10.10+)
- `parallel: true` - Run commands concurrently for speed
- `skip: [merge, rebase]` - Skip hooks during merge/rebase operations

**Command Reference:**
- **oxlint**: `npx oxlint --fix {staged_files}` applies safe auto-fixes; use `--fix-suggestions` for behavior-changing fixes
- **oxfmt**: `npx oxfmt {staged_files}` writes formatted output in place (default); use `--check` for CI verification only

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
| **All Projects** | `planning-with-files` (OthmanAdi/planning-with-files), `test-driven-development`, `systematic-debugging`, `verification-before-completion` (obra/superpowers) |
| **Next.js** | `react-best-practices`, `vercel-deploy-claimable`, `web-design-guidelines` (vercel-labs/agent-skills) |
| **TanStack Start** | `react-best-practices`, `web-design-guidelines` (vercel-labs/agent-skills) |
| **Expo** | `expo-app-design`, `expo-deployment`, `upgrading-expo` (expo/skills) |
| **Supabase** | `supabase-operations` (FastMCP marketplace) |
| **Convex** | `convex` (@ThijmenGThN/next-leaflet or community) - schema patterns, validation, auth integration |
| **Drizzle** | `drizzle-orm-d1`, `drizzle`, `drizzle-migration` (community skills) |
| **Firebase** | `firebase-functions-templates` (@onesmartguy/next-level-real-estate) - Cloud Functions with TypeScript/Express. Note: For Firestore/Auth operations, consider using `firebase-mcp` MCP server instead of skills |
| **better-auth** | `better-auth` (@Microck/ordinary-claude-skills) |
| **Clerk** | `clerk-pack` (24 skills from claude-code-plugins-plus) |
| **Stripe** | Custom skills required - no official marketplace skill available |
| **Testing (web)** | `webapp-testing` (anthropics/skills) |
| **Tailwind** | `tailwind-v4-shadcn` (community skills) |
| **Docker** | `docker-containerization` (community skills) |
| **Monorepo** | `turborepo`, `monorepo-management` (community skills) |
| **Security** | `building-secure-contracts`, `burpsuite-project-parser` (trailofbits/skills) |

---

## CLI Architecture

### Tech Stack
- **CLI Framework**: `@clack/prompts` ^0.11.0 (used by create-t3-app, simpler than Ink)
- **Build**: `tsup` (ESM + CJS output)
- **Package Manager Detection**: `detect-package-manager`
- **Command Execution**: `execa` ^9.0.0
- **File Operations**: `fs-extra`
- **Skills Management**: `openskills` CLI (via `execa` - no programmatic API available)
- **No direct AI API calls**: We guide users to use Claude Code in Docker instead

#### Execa v9 Migration Notes
Execa v9.0.0+ introduces breaking changes from v8.x that affect usage patterns:
- **Requires Node.js 18.19.0+** (dropped support for older versions)
- **Pipe methods renamed**: `pipeStdout()`, `pipeStderr()`, `pipeAll()` → unified `pipe()` method
- **Option renames**: `signal` → `cancelSignal`, `execPath` → `nodePath`, `forceKillAfterTimeout` → `forceKillAfterDelay`
- **Error property renamed**: `error.killed` → `error.isTerminated`
- **Encoding values renamed**: `null` → `'buffer'`, `'utf-8'` → `'utf8'`
- **Buffer output**: Returns `Uint8Array` instead of `Buffer` when `encoding: 'buffer'`
- **execaCommand() deprecated** (v9.2.0): Use `parseCommandString()` + `execa()` instead
- **Verbose option**: Changed from boolean to string enum (`false` → `'none'`, `true` → `'short'`)

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
│   │   ├── tanstack.ts             # Wraps @tanstack/create-start
│   │   ├── react-router.ts         # Wraps create-react-router (React Router v7)
│   │   ├── expo.ts                 # Wraps create-expo-stack
│   │   ├── rn-cli.ts               # Wraps npx react-native init
│   │   ├── astro.ts                # Wraps create astro
│   │   ├── api.ts                  # Own templates for Hono/Elysia
│   │   └── base.ts                 # Minimal TypeScript template
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

## Preset Configurations

Presets provide opinionated configurations for common project types.

### SaaS Preset (`--preset saas`)
```yaml
platform: Web
framework: Next.js (App Router)
styling: Tailwind CSS + shadcn/ui
auth: better-auth (or Clerk)
database: Drizzle + Postgres (Neon/Supabase)
payments: Stripe
testing: Vitest (unit), Playwright (e2e)
linting: oxlint
formatting: oxfmt
deploy: Vercel
skills: planning-with-files, react-best-practices, vercel-deploy-claimable, webapp-testing, tailwind-v4-shadcn
```

### Mobile Preset (`--preset mobile`)
```yaml
platform: Mobile
framework: Expo (managed workflow)
styling: Uniwind (recommended)
auth: Clerk (native SDK)
backend: Supabase
testing: Jest (unit), Maestro (e2e)
linting: oxlint
formatting: oxfmt
deploy: EAS Build (recommended, cloud) or Local Builds (eas build --local)
skills: planning-with-files, expo-app-design, expo-deployment, upgrading-expo
```

### API Preset (`--preset api`)
```yaml
platform: API Only
framework: Hono (or Elysia)
database: Drizzle + Postgres (or Turso for edge)
auth: better-auth
testing: Vitest
linting: oxlint
formatting: oxfmt
deploy: Cloudflare Workers (or Fly.io)
skills: planning-with-files, drizzle-orm-d1
```

### Fullstack/Monorepo Preset (`--preset fullstack`)
```yaml
platform: Web + API (monorepo)
structure: Turborepo
package_manager: bun (with bun workspaces)
apps:
  - web: Next.js + Tailwind + shadcn/ui
  - api: Hono + Drizzle
packages:
  - ui: Shared components
  - db: Drizzle schema
  - config: Shared ESLint/TS config
auth: better-auth (shared)
testing: Vitest (unit), Playwright (e2e)
linting: Biome (monorepo-wide)
formatting: Biome
deploy: Vercel (web) + Fly.io (api)
skills: planning-with-files, turborepo, monorepo-management, react-best-practices
```

**Monorepo Package Manager Notes:**
- Turborepo 2.6 (December 2025) moved Bun support from beta to **stable**
- Configure via `"packageManager": "bun@1.x.x"` and `"workspaces": ["apps/*", "packages/*"]` in root package.json
- Use `--cwd` flag for workspace-specific installs: `bun add <package> --cwd apps/web` (not `--filter`)
- Bun is ~4x faster than pnpm for clean installs in monorepos

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

## Docker Configuration for Claude Code

### Available Methods (Choose Based on User Environment)

#### 1. Docker Desktop Sandbox (Recommended - Simplest)

For users with Docker Desktop installed:

```bash
# Run Claude Code in a sandboxed container
docker sandbox run claude

# With a specific workspace
docker sandbox run -w ~/my-project claude

# Continue previous conversation
docker sandbox run claude -c

# Direct prompt
docker sandbox run claude "explain this codebase"
```

- Uses `docker/sandbox-templates:claude-code` image
- Automatic credential management (API key stored in Docker volume)
- Includes: Docker CLI, GitHub CLI, Node.js, Go, Python 3, Git, ripgrep, jq
- Runs as non-root user with sudo access

#### 2. Custom Dockerfile (For CI/CD or Custom Environments)

Generate a Dockerfile based on Anthropic's reference:

```dockerfile
FROM node:20

# Install development tools
RUN apt-get update && apt-get install -y \
    git zsh vim \
    iproute2 iptables \
    fzf jq gnupg2 unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code
ARG CLAUDE_CODE_VERSION=latest
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# Setup non-root user
USER node
WORKDIR /workspace

CMD ["claude"]
```

#### 3. DevContainer (For VS Code Users)

Add to `.devcontainer/devcontainer.json`:

```json
{
  "name": "Claude Code Dev",
  "image": "node:20",
  "features": {
    "ghcr.io/anthropics/devcontainer-features/claude-code:1": {}
  },
  "remoteUser": "node"
}
```

Or with explicit Node.js feature:

```json
{
  "name": "Claude Code Dev",
  "features": {
    "ghcr.io/devcontainers/features/node:1": {},
    "ghcr.io/anthropics/devcontainer-features/claude-code:1": {}
  }
}
```

### Implementation Strategy for bootstralph

The CLI should:
1. **Detect Docker Desktop**: If available, prefer `docker sandbox run claude` approach
2. **Generate Dockerfile**: For users who need custom containers or CI/CD integration
3. **Generate DevContainer**: For VS Code users who prefer devcontainer workflow

Files to generate in `src/ralph/sandbox.ts`:
- `docker-compose.yml` (for custom Dockerfile approach)
- `.devcontainer/devcontainer.json` (for VS Code approach)
- Shell scripts for `docker sandbox` approach

**Note**: There is no official `ghcr.io/anthropics/claude-code` image. Use the methods above instead.

#### docker-compose.yml Template (Custom Dockerfile Approach)

```yaml
version: '3.8'

services:
  claude-dev:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ${PROJECT_NAME:-claude-dev}
    volumes:
      # Mount project workspace
      - .:/workspace
      # Persist Claude configuration between restarts
      - claude-config:/home/node/.claude
      # Persist command history and shell config
      - claude-data:/home/node/.local
    environment:
      # API key from .env file - NEVER hardcode
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      # Optional: for GitHub operations
      - GITHUB_TOKEN=${GITHUB_TOKEN:-}
      # Development environment
      - NODE_ENV=development
    working_dir: /workspace
    # Keep container running for interactive use
    stdin_open: true
    tty: true
    # Optional: restrict network (uncomment for isolation)
    # network_mode: none

volumes:
  # Named volumes for persistence across container restarts
  claude-config:
    name: ${PROJECT_NAME:-claude}-config
  claude-data:
    name: ${PROJECT_NAME:-claude}-data
```

**Security Notes:**
- API keys MUST be provided via `.env` file or host environment variables
- Never commit `.env` files to version control (add to `.gitignore`)
- Consider using Docker secrets for production environments

### Network Isolation Strategy

**`network_mode: none` is NOT viable** - Claude Code requires network access to function:

#### Required Domains (Minimum Whitelist)
| Domain | Purpose |
|--------|---------|
| `api.anthropic.com` | Core Claude API communication |
| `claude.ai` | Platform services |
| `registry.npmjs.org` | npm package installation |
| `github.com` | Repository access, cloning |

#### Recommended Approach: Network Filtering (Not Full Isolation)

Instead of `network_mode: none`, use iptables-based filtering for security:

```dockerfile
# Add to Dockerfile for network filtering capability
RUN apt-get update && apt-get install -y iptables dnsutils
```

```yaml
# In docker-compose.yml, add cap_add for iptables
services:
  claude-dev:
    cap_add:
      - NET_ADMIN
```

```bash
# firewall-setup.sh - Run inside container at startup
#!/bin/bash

# Default deny policy
iptables -P OUTPUT DROP
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow DNS
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# Whitelist required domains
whitelist_domain() {
    local domain=$1
    for ip in $(dig +short $domain 2>/dev/null); do
        iptables -A OUTPUT -d $ip -j ACCEPT
    done
}

whitelist_domain "api.anthropic.com"
whitelist_domain "claude.ai"
whitelist_domain "registry.npmjs.org"
whitelist_domain "github.com"
# Add more as needed for your workflow
```

#### Security Trade-offs

| Approach | Security | Functionality | Recommended For |
|----------|----------|---------------|-----------------|
| Full network access | Low | Full | Local development, trusted environments |
| Domain whitelist (iptables) | Medium | Most features | Production CI/CD, security-conscious teams |
| `network_mode: none` | High | ❌ Broken | NOT viable - Claude cannot reach API |

#### Why Not `network_mode: none`?

Claude Code's core architecture requires network connectivity:
1. **API Communication**: Every Claude response requires calling `api.anthropic.com`
2. **Package Installation**: `npm install` needs `registry.npmjs.org`
3. **Git Operations**: Cloning and pushing require `github.com`

Without network, Claude Code cannot:
- Send prompts to Claude API (the AI doesn't run locally)
- Install dependencies for scaffolded projects
- Clone templates or push code

**Recommendation**: Use domain whitelisting instead of full isolation. This provides defense-in-depth (prevents data exfiltration to arbitrary servers) while maintaining functionality

---

## Claude Code Settings Configuration

### Settings File Locations

Claude Code uses hierarchical settings with the following precedence (highest to lowest):

| Location | Purpose | Git Tracked |
|----------|---------|-------------|
| `.claude/settings.local.json` | Project settings (private) | No |
| `.claude/settings.json` | Project settings (shared) | Yes |
| `~/.claude/settings.json` | User settings (all projects) | N/A |
| Managed settings (system-level) | Enterprise policies | N/A |

### Permissions Syntax

The `permissions` object supports `allow`, `deny`, and `ask` arrays using `Tool(pattern)` syntax:

```json
{
  "permissions": {
    "deny": [
      "Read(**/.env)",
      "Read(**/*.key)",
      "Read(**/secrets/**)",
      "Bash(sudo:*)",
      "Bash(rm:-rf:*)",
      "Bash(curl:*)",
      "WebFetch(domain:example.com)"
    ],
    "allow": [
      "Bash(npm run test:*)",
      "Bash(git commit:*)"
    ]
  }
}
```

### Tool Pattern Reference

| Tool | Pattern Syntax | Examples |
|------|----------------|----------|
| **Read** | Gitignore-style file patterns | `Read(**/.env)`, `Read(**/*.key)`, `Read(**/node_modules/**)` |
| **Edit** | Gitignore-style file patterns | `Edit(**/.env)`, `Edit(**/secrets/*)` |
| **Write** | Gitignore-style file patterns | `Write(**/.env)`, `Write(**/config/*)` |
| **Bash** | Command patterns with `command:args` | `Bash(sudo:*)`, `Bash(rm:-rf:*)`, `Bash(curl:*)` |
| **WebFetch** | Domain specification | `WebFetch(domain:example.com)` (wildcards not supported) |

### Known Enforcement Issues (As of Late 2025)

**WARNING**: Multiple GitHub issues report that `permissions.deny` rules are NOT being enforced for Read, Write, and Edit tools:
- Issue #6631: Permission deny configuration not enforced for Read/Write tools
- Issue #6699: Critical security bug - deny permissions in settings.json not enforced
- Issue #4467: Permission deny patterns not working for Read/Write tools

**Workaround - PreToolUse Hooks**: For reliable security enforcement, use PreToolUse hooks instead of deny rules:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read",
        "hooks": [
          {
            "type": "command",
            "command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -qE '\\.env|\\.key|secrets'; then exit 2; fi"
          }
        ]
      }
    ]
  }
}
```

PreToolUse hooks execute before a tool is used and can:
- Exit 0: Allow the tool call to proceed
- Exit 2: Block the tool call completely
- Output JSON to modify tool input

**Recommendation**: Until deny rules are reliably enforced, use PreToolUse hooks for protecting sensitive files in production environments.

---

## Ralph Wiggum Plugin Installation

The Ralph Wiggum plugin enables autonomous development loops in Claude Code. It's the official Anthropic plugin for iterative, self-referential AI development.

### Installation Commands

```bash
# Step 1: Add Anthropic's marketplace (note: 'anthropics' with 's')
/plugin marketplace add anthropics/claude-code

# Step 2: Install the ralph-wiggum plugin
/plugin install ralph-wiggum@claude-plugins-official
```

**Important**: The marketplace add command adds a catalog to browse available plugins, not install them directly. You must use `/plugin install` to actually install plugins.

### Basic Usage

```bash
# Start an autonomous loop with a task
/ralph-loop "Implement user authentication with better-auth" --max-iterations 30

# With completion promise (auto-stops when promise is found in output)
/ralph-loop "Fix all type errors in the codebase" --max-iterations 20 --completion-promise "COMPLETE"

# Cancel an active loop
/cancel-ralph
```

### Key Options

| Option | Description |
|--------|-------------|
| `--max-iterations` | Maximum number of iteration cycles (safety limit, recommended) |
| `--completion-promise` | Exact string that signals completion (e.g., "DONE", "COMPLETE") |

### How It Works

1. You provide Claude a task and optional completion criteria
2. Claude works on the task and attempts to exit when done
3. The Stop Hook intercepts exit attempts, checking for the completion promise
4. If promise not found, Claude sees its previous work and continues iterating
5. Each iteration refines the approach based on what broke or what's left

### Best Practices

- **Always use `--max-iterations`** as your primary safety mechanism
- Write prompts that converge toward correct solutions
- Use specific, measurable completion criteria
- The completion promise uses exact string matching (no regex)
- For complex tasks, break them into smaller loops

---

## Sources

- [Ralph Wiggum Plugin](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum) - Official Anthropic plugin for autonomous loops
- [Claude Code Plugins](https://code.claude.com/docs/en/discover-plugins) - Plugin marketplace and installation
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
