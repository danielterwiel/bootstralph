# bootstralph

**CLI for scaffolding Ralph-powered projects with intelligent skill installation and compatibility-aware option selection.**

> **Docker-First Philosophy**: Claude Code MUST always run in a Docker sandbox. This CLI makes container instantiation as frictionless as possible and guides users to interactive Claude sessions within the container.

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

## Project Structure

```
bootstralph/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── commands/
│   │   ├── create.ts         # Main create command
│   │   ├── init.ts           # Initialize existing project
│   │   └── add.ts            # Add features post-scaffold
│   ├── prompts/              # @clack/prompts wizard steps
│   │   ├── project-type.ts
│   │   ├── framework.ts
│   │   ├── features.ts
│   │   ├── deployment.ts
│   │   └── tooling.ts
│   ├── compatibility/        # Smart filtering logic
│   │   ├── matrix.ts         # Compatibility data
│   │   ├── filters.ts        # Option filtering
│   │   └── validators.ts     # Combination validation
│   ├── scaffolders/          # Framework CLI wrappers
│   │   ├── nextjs.ts
│   │   ├── tanstack.ts
│   │   ├── expo.ts
│   │   ├── react-router.ts
│   │   ├── rn-cli.ts
│   │   ├── astro.ts
│   │   └── api.ts
│   ├── ralph/                # Claude Code setup
│   │   ├── claudemd.ts       # CLAUDE.md generator
│   │   ├── skills.ts         # openskills installation
│   │   ├── hooks.ts          # Pre-commit setup
│   │   └── sandbox.ts        # Docker configuration
│   ├── presets/              # Quick-start configurations
│   │   ├── saas.ts
│   │   ├── mobile.ts
│   │   ├── api.ts
│   │   └── fullstack.ts
│   └── templates/            # Generated file templates
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

*Built for developers who want Claude Code to scaffold and configure projects autonomously—within secure Docker sandboxes.*
