# bootstralph

**Scaffold Ralph projects**

```bash
bootstralph create my-saas-app --preset saas
bootstralph prd "Add Stripe payments with usage-based billing"
./ralph.sh afk 20   # 20 autonomous iterations
```

## What Makes It Different

### Compatibility Matrix

Impossible combinations are hidden before you can select them. 30+ conflict rules ensure your stack works.

```
Next.js selected   → TanStack Router hidden (conflicts with App Router)
Expo selected      → Playwright hidden (use Maestro instead)
Biome selected     → formatting prompt skipped (handles both)
```

### Intelligent Skill Installation

700+ [OpenSkills](https://openskills.io) mappings. Skills install **only** when matched to your dependencies.

```
drizzle-orm detected     → drizzle skill installed
@clerk/nextjs detected   → clerk-auth skill installed
next detected            → nextjs + react-best-practices installed
```

## Quick Start

```bash
# Install
bun add -g bootstralph

# Create with wizard
bootstralph create my-app

# Create with preset
bootstralph create my-app --preset saas

# Initialize existing project
bootstralph init
```

## Supported Stacks

| Platform  | Frameworks                                      |
| --------- | ----------------------------------------------- |
| Web       | Next.js, TanStack Start, React Router v7, Astro |
| Mobile    | Expo, React Native CLI                          |
| Universal | Expo + Tamagui                                  |
| API       | Hono, Elysia                                    |

## Presets

| Preset      | Stack                                                   |
| ----------- | ------------------------------------------------------- |
| `saas`      | Next.js + Tailwind + shadcn/ui + Supabase + better-auth |
| `mobile`    | Expo + NativeWind + Clerk + EAS Build                   |
| `api`       | Hono + Drizzle + Cloudflare Workers                     |
| `content`   | Astro + Tailwind + Vercel                               |
| `universal` | Expo + Tamagui + shared codebase                        |
| `fullstack` | Turborepo monorepo                                      |

## Commands

```bash
bootstralph create <name>              # Interactive wizard
bootstralph create <name> -p <preset>  # Use preset
bootstralph init                       # Initialize existing project
bootstralph sync                       # Sync skills to dependencies
bootstralph prd "description"          # Create PRD
bootstralph ralph                      # Run Ralph Loop
```

## What Gets Generated

- Framework scaffolding via official CLIs
- `CLAUDE.md` with project context for Claude Code
- `lefthook.yml` pre-commit hooks (lint, format, typecheck)
- `.bootstralph/config.json` stack configuration
- Docker sandbox configuration

## Requirements

- Bun 1.0+ or Node.js 20+
- Claude API key

## License

MIT
