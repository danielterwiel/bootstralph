# bootstralph

**Scaffold projects. Write PRDs. Let Claude Code build while you sleep.**

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

### Ralph Loop
Autonomous development cycles that iterate through your PRD:

```
1. Read PRD → Find next incomplete story
2. Implement (single-task focus)
3. Run tests + type checks
4. Mark story complete
5. Commit + loop
```

Run `./ralph.sh afk 10` and come back to 10 completed stories.

## Cost Warning

> **This tool is a token blackhole.** Claude Pro ($20/mo) won't cut it.
>
> Recommended: Claude API with usage-based billing or Claude Max. Budget $100+/month for heavy use.

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

| Platform | Frameworks |
|----------|------------|
| Web | Next.js, TanStack Start, React Router v7, Astro |
| Mobile | Expo, React Native CLI |
| Universal | Expo + Tamagui |
| API | Hono, Elysia |

## Presets

| Preset | Stack |
|--------|-------|
| `saas` | Next.js + Tailwind + shadcn/ui + Supabase + better-auth |
| `mobile` | Expo + NativeWind + Clerk + EAS Build |
| `api` | Hono + Drizzle + Cloudflare Workers |
| `content` | Astro + Tailwind + Vercel |
| `universal` | Expo + Tamagui + shared codebase |
| `fullstack` | Turborepo monorepo |

## Commands

```bash
bootstralph create <name>           # Interactive wizard
bootstralph create <name> -p <preset>  # Use preset
bootstralph init                    # Initialize existing project
bootstralph sync                    # Sync skills to dependencies
bootstralph prd "description"       # Create PRD
bootstralph ralph                   # Run Ralph Loop
```

## What Gets Generated

- Framework scaffolding via official CLIs
- `CLAUDE.md` with project context for Claude Code
- `lefthook.yml` pre-commit hooks (lint, format, typecheck)
- `.bootsralph/config.json` stack configuration
- Docker sandbox configuration

## PRD-Driven Development

Create atomic, verifiable stories:

```json
{
  "id": "IMPL-001",
  "title": "Add login endpoint",
  "acceptanceCriteria": [
    "POST /api/auth/login returns JWT on valid credentials",
    "Returns 401 on invalid credentials",
    "Rate limited to 5 attempts per minute"
  ],
  "passes": false
}
```

Store PRDs in `.agents/tasks/` and let Ralph Loop execute them autonomously.

## Requirements

- Bun 1.0+ or Node.js 20+
- Docker Desktop (for Claude Code sandbox)
- Claude API key

## License

MIT

---

*Built for developers who want Claude Code to work autonomously.*
