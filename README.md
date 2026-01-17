# bootstralph

**Scaffold projects. Write PRDs. Let Claude Code build while you sleep.**

```bash
# Create a project, generate a PRD, run Ralph Loop
bootstralph create my-saas-app
bootstralph prd "Add Stripe payments with usage-based billing"
./ralph.sh afk 20   # Run 20 iterations autonomously
```

---

## What Makes bootstralph Different

| Feature | What it does |
|---------|--------------|
| **🔄 Ralph Loop** | Autonomous development cycles—Claude works through your PRD while you're AFK |
| **📋 PRD-Driven Development** | Structured task specs that Claude can execute without hand-holding |
| **🧠 Compatibility Matrix** | Wizard filters impossible combinations before you choose them |
| **🔌 Auto-Skill Installation** | Installs relevant [openskills](https://openskills.io) based on your stack |
| **🐳 Docker-First** | Claude Code always runs sandboxed—security by default |

---

## The Ralph Loop Pattern

Ralph is an autonomous development loop that iterates through your PRD:

```
┌─────────────────────────────────────────────────────────┐
│  1. Read PRD → Find next incomplete story               │
│  2. Implement ONLY that story (single-task focus)       │
│  3. Run tests + type checks                             │
│  4. Mark story as passes: true                          │
│  5. Commit + log progress                               │
│  6. Loop until done or max iterations                   │
└─────────────────────────────────────────────────────────┘
```

**AFK Mode**: Run `./ralph.sh afk 10` and come back to 10 completed stories.

---

## Cost Warning

> [!CAUTION]
> **This tool is a token blackhole.** The ~$20/month Claude Pro plan will NOT be sufficient.
>
> bootstralph orchestrates Claude Code in autonomous development loops, which consume significant tokens through:
> - Multi-step project scaffolding
> - Skill installation and configuration
> - CLAUDE.md generation with project-specific context
> - Pre-commit hook setup and validation
>
> **Recommended**: Claude API access with usage-based billing, or Claude Max subscription. Budget accordingly—heavy usage can easily exceed $100+/month.

---

## Features

- **Compatibility-Aware Selection**: Wizard automatically filters incompatible options based on your choices
- **Framework Scaffolding**: Wraps official CLIs for Next.js, TanStack Start, Expo, React Router v7, Astro, and more
- **Skill Auto-Installation**: Installs relevant [openskills](https://openskills.io) based on your stack
- **Docker Sandbox Setup**: Generates secure Docker configuration for Claude Code
- **Pre-commit Hooks**: Configures Lefthook/Husky with oxlint, oxfmt, or your preferred toolchain
- **CLAUDE.md Generation**: Creates project-specific guidance for Claude Code

## Supported Frameworks

| Framework | Scaffolder | Notes |
|-----------|------------|-------|
| Next.js | `create-next-app` | App Router, RSC, Tailwind + shadcn/ui |
| TanStack Start | `@tanstack/create-start` | Vite-based, TanStack Router |
| React Router v7 | `create-react-router` | Framework mode (formerly Remix) |
| Expo | `create-expo-app` | React Native with cloud builds |
| React Native CLI | `@react-native-community/cli` | Bare workflow |
| Astro | `create astro` | Content sites, React islands |
| Hono/Elysia | Custom template | API-only projects |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+ (recommended) or Node.js 20+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) for Claude Code sandbox
- Claude API key with sufficient credits

### Installation

```bash
# Install globally
bun add -g bootstralph

# Or run directly
bunx bootstralph create my-project
```

### Create a New Project

```bash
bootstralph create my-saas-app
```

The wizard will guide you through:

1. **Project Type** → Web, Mobile, Universal, API, Monorepo
2. **Framework** → Filtered options based on project type
3. **Features** → Auth, Database, Payments, etc. (compatibility-filtered)
4. **Deployment** → Vercel, Cloudflare, Fly.io, EAS, etc.
5. **Tooling** → Recommended defaults or customize

### Use a Preset

Skip the wizard with pre-configured stacks:

```bash
# SaaS starter (Next.js + Auth + Payments)
bootstralph create my-app --preset saas

# Mobile app (Expo + EAS)
bootstralph create my-app --preset mobile

# API service (Hono + Drizzle)
bootstralph create my-app --preset api

# Full-stack monorepo (Turborepo)
bootstralph create my-app --preset fullstack
```

### Initialize Existing Project

Add Ralph configuration to an existing project:

```bash
cd existing-project
bootstralph init
```

---

## PRD Commands

Create and manage Product Requirements Documents for autonomous development:

```bash
# Create a new PRD from a description
bootstralph prd "Add user authentication with better-auth"

# List all PRDs
bootstralph prd --list

# Run Ralph Loop on a PRD
bootstralph ralph                 # Interactive: select PRD
bootstralph ralph prd-auth        # Run specific PRD

# AFK mode (unattended)
./ralph.sh afk 10                 # Run 10 iterations
./afk-ralph.sh 20                 # Alternative script
```

PRD files are stored in `.agents/tasks/` with the schema defined in `prd.schema.json`.

### Writing Good PRDs

Each user story should be:
- **Atomic**: Completable in one Claude iteration (5-30 min)
- **Verifiable**: Clear acceptance criteria that can be tested
- **Independent**: Minimal dependencies on other stories

```json
{
  "id": "IMPL-001",
  "title": "Add login endpoint",
  "acceptanceCriteria": [
    "POST /api/auth/login returns JWT on valid credentials",
    "Returns 401 with error message on invalid credentials",
    "Rate limited to 5 attempts per minute"
  ],
  "passes": false
}
```

---

## Project Structure

```
bootstralph/
├── .agents/
│   └── tasks/                # PRD storage
│       ├── prd-*.json        # PRD files
│       └── prd.schema.json   # PRD JSON schema
├── .claude/
│   └── skills/               # Claude Code skills
│       └── prd-writer/       # PRD writing skill
├── src/
│   ├── index.ts              # CLI entry point
│   ├── commands/
│   │   ├── create.ts         # Main create command
│   │   ├── init.ts           # Initialize existing project
│   │   ├── prd.ts            # PRD management
│   │   ├── ralph.ts          # Ralph loop runner
│   │   └── add.ts            # Add features post-scaffold
│   ├── prompts/              # @clack/prompts wizard steps
│   ├── compatibility/        # Smart filtering logic
│   ├── scaffolders/          # Framework CLI wrappers
│   ├── ralph/                # Claude Code setup
│   │   ├── prd-schema.ts     # PRD TypeScript types
│   │   ├── claudemd.ts       # CLAUDE.md generator
│   │   ├── skills.ts         # openskills installation
│   │   ├── hooks.ts          # Pre-commit setup
│   │   └── sandbox.ts        # Docker configuration
│   ├── presets/              # Quick-start configurations
│   └── templates/            # Generated file templates
├── ralph.sh                  # Ralph loop shell script
├── afk-ralph.sh              # AFK mode runner
└── tests/
```

## How It Works

### Compatibility Matrix

bootstralph maintains a compatibility matrix that automatically filters options:

```
Next.js + TanStack Router = ❌ (conflicts with App Router)
Expo + Vitest = ❌ (use Jest instead)
Biome selected = skip formatting prompt (Biome handles both)
Cloudflare + Prisma = ⚠️ (requires Prisma Accelerate)
```

### Skills Installation

Based on your stack, bootstralph installs relevant skills via [openskills](https://openskills.io):

| Stack | Skills Installed |
|-------|------------------|
| Next.js | `react-best-practices`, `tailwind-v4-shadcn`, `vercel-deploy-claimable` |
| Expo | `expo-app-design`, `expo-deployment`, `upgrading-expo` |
| Auth | `better-auth`, `clerk-pack` (depending on choice) |
| Database | `drizzle-orm-d1`, `drizzle`, `supabase-operations` |
| Testing | `webapp-testing`, `test-driven-development` |

### Docker Sandbox

Generated Docker configuration ensures Claude Code runs securely:

```bash
# Recommended: Docker Desktop sandbox
docker sandbox run claude

# Alternative: Custom Dockerfile
docker compose up -d
```

## Configuration

### Tooling Defaults

| Category | Default | Alternatives |
|----------|---------|--------------|
| Package Manager | Bun | pnpm, npm, yarn |
| Linting | oxlint | ESLint, Biome |
| Formatting | oxfmt | Prettier, Biome |
| Unit Testing | Vitest (web), Jest (mobile) | - |
| E2E Testing | Playwright (web), Maestro (mobile) | Cypress, Detox |
| Pre-commit | Lefthook | Husky, prek |

### Auth Providers

| Provider | Web | Mobile |
|----------|-----|--------|
| better-auth | Native SDK | Native SDK via `@better-auth/expo` |
| Clerk | Native SDK | Native SDK |
| Supabase Auth | `@supabase/ssr` | Native SDK |

### Deployment Targets

| Platform | Web | Mobile |
|----------|-----|--------|
| Vercel | Next.js, TanStack Start, Astro | - |
| Cloudflare | TanStack Start, Astro, Hono | - |
| Fly.io | All web frameworks | - |
| Railway | All web frameworks | - |
| EAS Build | - | Expo (recommended) |
| Local Builds | - | `eas build --local` |

## Development

```bash
# Clone the repository
git clone https://github.com/your-org/bootstralph.git
cd bootstralph

# Install dependencies
bun install

# Run in development
bun run dev

# Build
bun run build

# Run tests
bun test
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

---

## Resources

- [PLAN.md](./PLAN.md) - Detailed implementation plan
- [openskills](https://openskills.io) - Skills marketplace
- [Claude Code Documentation](https://docs.anthropic.com/claude-code)

---

*Built for developers who want Claude Code to work autonomously—scaffold projects, execute PRDs, and ship features while you're AFK.*
