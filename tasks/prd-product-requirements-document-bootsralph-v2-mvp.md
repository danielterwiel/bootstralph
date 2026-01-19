# Product Requirements Document: bootstralph v2 MVP

## Executive Summary

**Product**: bootstralph v2
**Version**: 2.0.0
**Target Release**: Q1 2026
**Status**: Planning

bootstralph v2 is a complete rewrite that transforms from a monolithic CLI orchestrator into a thin glue layer that delegates planning and execution to Ralph TUI while providing intelligent stack scaffolding, configuration generation, and bidirectional skills synchronization.

## Problem Statement

bootstralph v1 attempted to build its own TUI, PRD management, and execution engine. This led to:

- Feature duplication with Ralph TUI
- Maintenance burden for TUI components
- Complex codebase with mixed responsibilities
- Limited extensibility

**Core insight**: Ralph TUI already does planning and execution excellently. bootstralph should focus on what it does best: stack detection, scaffolding, and skills management.

## Goals

### Primary Goals

1. **Scaffold projects** with opinionated, compatible stack choices
2. **Detect existing projects** and generate Ralph TUI configs
3. **Bidirectionally sync skills** based on dependencies
4. **Delegate to Ralph TUI** for all planning and execution

### Non-Goals (v2 MVP)

- Backward compatibility with v1
- Extensive testing suite (defer post-MVP)
- Documentation and polish (defer post-MVP)
- Migration tooling from v1 to v2
- Presets or quick-start templates
- Multi-agent orchestration (upstream to Ralph TUI)

## Architecture Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│                       bootstralph v2                         │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Scaffold   │  │   Detect     │  │  Skills Sync │      │
│  │   (create)   │  │   (init)     │  │  (wrapper)   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │              │
│         ▼                 ▼                 ▼              │
│  ┌──────────────────────────────────────────────────┐      │
│  │         Stack Config + Generated Configs         │      │
│  └──────────────────────────────────────────────────┘      │
│         │                 │                 │              │
│         ▼                 ▼                 ▼              │
│  Official CLIs     lefthook.yml      OpenSkills CLI        │
│  (create-next-app) (.ralph-tui/)     (install/sync)        │
│  (create-expo-app) (AGENTS.md)                             │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
            ┌─────────────────┐
            │   Ralph TUI     │
            │ (planning/exec) │
            └─────────────────┘
```

## User Stories

### Phase 1: Core Infrastructure

**US-01: CLI Foundation**

```
As a developer
I want a responsive CLI with clear feedback
So that I understand what bootstralph is doing at all times

Acceptance Criteria:
- CLI built with commander.js
- Spinners and progress indicators via @clack/prompts
- Exec wrapper using execa with proper error handling
- File utilities for reading/writing configs
- Logger with intro/outro/spinner/log helpers

Tasks:
- P1-01: Setup package.json, tsconfig.json, tsup.config.ts
- P1-02: Create src/index.ts with commander CLI entry
- P1-03: Implement src/utils/logger.ts with @clack/prompts
- P1-04: Implement src/utils/exec.ts with execa wrapper
- P1-05: Implement src/utils/fs.ts with file helpers
```

### Phase 2: Stack Detection

**US-02: Detect Existing Projects**

```
As a developer with an existing project
I want bootstralph to detect my stack automatically
So that I can quickly integrate Ralph TUI workflows

Acceptance Criteria:
- Reads package.json dependencies and devDependencies
- Scans for framework config files (next.config.*, app.json, etc.)
- Infers framework, features, and tooling with confidence score
- Returns DetectedStack object with framework, features, packages, configFiles
- Confidence threshold of 0.5 triggers wizard fallback

Tasks:
- P2-01: Implement src/detection/package-scanner.ts (read package.json)
- P2-02: Implement src/detection/config-scanner.ts (glob config patterns)
- P2-03: Implement src/detection/stack-inferrer.ts (deps → framework logic)
- P2-04: Implement src/detection/index.ts (main detectStack function)
- P2-05: Implement src/commands/detect.ts (debug command)
```

**US-03: Config Patterns Database**

```
As a maintainer
I want a clear mapping of config files to frameworks
So that detection is accurate and maintainable

Acceptance Criteria:
- CONFIG_PATTERNS mapping in config-scanner.ts
- Supports glob patterns (next.config.*, *.config.ts)
- Maps to framework identifiers (nextjs, expo, etc.)
- Includes feature detection (drizzle.config.*, tailwind.config.*)

Tasks:
- Included in P2-02
```

### Phase 3: Skills Synchronization

**US-04: Skills Mappings Database**

```
As a developer
I want relevant Claude Code skills installed automatically
So that Claude has context about my stack

Acceptance Criteria:
- JSON database in data/skill-mappings.json
- Each mapping includes: skill name, source, trigger packages/configs/frameworks
- Covers: frameworks (React, Next.js, Expo), auth, databases, styling, testing
- Includes default skills (systematic-debugging, verification-before-completion)

Tasks:
- P3-01: Create data/skill-mappings.json with comprehensive mappings
- P3-02: Implement src/skills/mappings.ts (load and query mappings)
```

**US-05: Skills Manifest Management**

```
As a developer
I want to track which skills are installed and why
So that sync operations are deterministic

Acceptance Criteria:
- Manifest stored in .bootstralph/skills-manifest.json
- Tracks: skill name, source, installedFor packages, installedAt timestamp
- CRUD operations: load, save, add skill, remove skill
- Version field for future compatibility

Tasks:
- P3-03: Implement src/skills/manifest.ts (manifest CRUD operations)
```

**US-06: Bidirectional Skills Sync**

```
As a developer
I want skills to auto-install when I add deps and auto-remove when I remove deps
So that my Claude context stays lean and relevant

Acceptance Criteria:
- Compares current dependencies vs installed skills
- Computes diff: skills to install, skills to remove
- Installs via openskills CLI (npx openskills install <source>)
- Removes by deleting .claude/skills/<skill-name>
- Regenerates AGENTS.md via openskills sync
- Updates manifest with changes
- Runs automatically via package.json postinstall hook
- Supports --quiet flag for hook usage

Tasks:
- P3-04: Implement src/skills/diff.ts (compute SkillsDiff)
- P3-05: Implement src/skills/openskills.ts (CLI wrapper with install/uninstall)
- P3-06: Implement src/skills/index.ts (main sync function)
- P3-07: Implement src/commands/sync.ts (sync command with --quiet flag)
```

### Phase 4: Configuration Generation

**US-07: Lefthook Config Generation**

```
As a developer
I want pre-commit hooks configured automatically
So that linting, formatting, and skills sync run before commits

Acceptance Criteria:
- Generates lefthook.yml based on stack tooling choices
- Includes: linting (oxlint/eslint/biome), formatting (oxfmt/prettier/biome)
- Includes: typecheck (tsc --noEmit for TS projects)
- Includes: skills-sync hook (npx bootstralph sync --quiet)
- Includes: test hook on pre-push
- Uses Handlebars template for generation

Tasks:
- P4-01: Create templates/lefthook.yml.hbs
- P4-02: Implement src/generators/lefthook.ts (render template)
```

**US-08: Ralph TUI Skill Generation**

```
As a Ralph TUI user
I want a bootstralph-stack skill with my project's stack context
So that Ralph TUI can make informed decisions

Acceptance Criteria:
- Generates .ralph-tui/skills/bootstralph-stack/SKILL.md
- Includes: framework, auth, database, styling, testing, deployment
- Includes: key patterns for framework (e.g., Next.js App Router patterns)
- Includes: file conventions (directory structure)
- Includes: common commands (dev, test, db operations)
- Uses Handlebars template for generation

Tasks:
- P4-03: Create templates/ralph-skill.md.hbs
- P4-04: Implement src/generators/ralph-skill.ts (render template with stack context)
```

**US-09: Package Scripts Injection**

```
As a developer
I want skills sync to run automatically on install
So that I never have outdated skills

Acceptance Criteria:
- Adds postinstall script: "bootstralph sync --quiet"
- Adds prepare script: "lefthook install && bootstralph sync --quiet"
- Merges with existing scripts (doesn't overwrite)
- Warns if scripts already exist with different content

Tasks:
- P4-05: Implement src/generators/package-scripts.ts (inject scripts safely)
```

**US-10: Bootstralph Config Generation**

```
As a developer
I want my stack choices persisted
So that I can reference them later or regenerate configs

Acceptance Criteria:
- Generates .bootstralph/config.json
- Includes: version, createdAt, full StackConfig object
- Pretty-printed JSON for human readability

Tasks:
- P4-06: Implement src/generators/bootstralph-config.ts (write config.json)
```

### Phase 6: Commands (Rewritten Scaffolders)

**US-11: Create Command - New Project Wizard**

```
As a developer
I want to create a new project with a guided wizard
So that I get a fully configured stack quickly

Acceptance Criteria:
- Command: bootstralph create <name>
- Delegates to official CLIs for scaffolding:
  - Next.js: create-next-app
  - Expo: create-expo-app
  - TanStack Start: official starter (npx degit)
  - React Router: official starter
  - Astro: create-astro
  - Hono/Elysia: manual template or official starters
- After scaffolding:
  - cd into project directory
  - Generate lefthook.yml, ralph skill, bootstralph config
  - Add package.json scripts
  - Run lefthook install
  - Run bootstralph sync
- Prints next steps: cd <name>, ralph-tui create-prd, ralph-tui run

Tasks:
- P6-01: Implement src/commands/create.ts with wizard + official CLI delegation
```

**US-12: Init Command - Existing Project Setup**

```
As a developer with an existing project
I want to add bootstralph configs without re-scaffolding
So that I can use Ralph TUI workflows immediately

Acceptance Criteria:
- Command: bootstralph init
- Detects stack via detectStack()
- Falls back to wizard if confidence < 0.5
- Generates lefthook.yml, ralph skill, bootstralph config
- Adds package.json scripts (merge mode)
- Runs lefthook install
- Runs bootstralph sync
- Prints next steps: ralph-tui create-prd

Tasks:
- P6-02: Implement src/commands/init.ts with detection + fallback wizard
- P6-03: Wire up CLI in src/index.ts (commander setup with all commands)
```

## Technical Specifications

### Type Definitions

```typescript
// src/types.ts

export interface StackConfig {
  projectType: "web" | "mobile" | "universal" | "api" | "monorepo";
  framework: Framework;
  features: Features;
  deployment: Deployment;
  tooling: Tooling;
}

export type Framework =
  | "nextjs"
  | "tanstack-start"
  | "react-router"
  | "expo"
  | "rn-cli"
  | "astro"
  | "hono"
  | "elysia";

export interface Features {
  auth?: "better-auth" | "clerk" | "supabase";
  database?: "drizzle" | "prisma" | "convex";
  styling?: "tailwind" | "uniwind" | "nativewind" | "tamagui";
  testing?: "vitest" | "jest";
  e2e?: "playwright" | "maestro" | "detox";
}

export interface Deployment {
  platform: "vercel" | "cloudflare" | "fly" | "railway" | "eas" | "local";
}

export interface Tooling {
  packageManager: "bun" | "pnpm" | "npm";
  linting: "oxlint" | "eslint" | "biome";
  formatting: "oxfmt" | "prettier" | "biome";
  preCommit: "lefthook";
}

export interface DetectedStack {
  framework: Framework | null;
  features: Partial<Features>;
  packages: string[];
  devPackages: string[];
  configFiles: string[];
  confidence: number; // 0-1
}

export interface SkillMapping {
  skill: string;
  source: string;
  packages?: string[];
  devPackages?: string[];
  configFiles?: string[];
  frameworks?: Framework[];
}

export interface SkillsManifest {
  version: "1.0.0";
  updatedAt: string;
  skills: Record<string, InstalledSkill>;
}

export interface InstalledSkill {
  source: string;
  installedFor: string[];
  installedAt: string;
}

export interface SkillsDiff {
  toInstall: SkillMapping[];
  toRemove: string[];
}
```

### Directory Structure

```
bootstralph/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts                      # CLI entry
│   ├── types.ts                      # Type definitions
│   ├── commands/
│   │   ├── create.ts                 # US-11
│   │   ├── init.ts                   # US-12
│   │   ├── sync.ts                   # US-06
│   │   └── detect.ts                 # US-02 (debug)
│   ├── detection/
│   │   ├── index.ts                  # US-02
│   │   ├── package-scanner.ts        # US-02
│   │   ├── config-scanner.ts         # US-02, US-03
│   │   └── stack-inferrer.ts         # US-02
│   ├── skills/
│   │   ├── index.ts                  # US-06
│   │   ├── mappings.ts               # US-04
│   │   ├── manifest.ts               # US-05
│   │   ├── diff.ts                   # US-06
│   │   └── openskills.ts             # US-06
│   ├── generators/
│   │   ├── lefthook.ts               # US-07
│   │   ├── ralph-skill.ts            # US-08
│   │   ├── package-scripts.ts        # US-09
│   │   └── bootstralph-config.ts      # US-10
│   └── utils/
│       ├── exec.ts                   # US-01
│       ├── fs.ts                     # US-01
│       └── logger.ts                 # US-01
├── templates/
│   ├── lefthook.yml.hbs              # US-07
│   └── ralph-skill.md.hbs            # US-08
├── data/
│   └── skill-mappings.json           # US-04
└── README.md
```

### Dependencies

```json
{
  "dependencies": {
    "@clack/prompts": "^0.11.0",
    "commander": "^12.0.0",
    "execa": "^9.0.0",
    "handlebars": "^4.7.8",
    "fast-glob": "^3.3.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "tsup": "^8.0.0",
    "typescript": "^5.5.0"
  },
  "peerDependencies": {
    "openskills": "^1.3.0",
    "lefthook": "^1.10.0"
  }
}
```

## Success Metrics

### MVP Success Criteria

1. **End-to-end `create` flow works** for at least Next.js and Expo
2. **End-to-end `init` flow works** for detecting existing Next.js/Expo projects
3. **Skills sync installs/removes skills** correctly based on dependencies
4. **Generated configs are valid**: lefthook.yml runs hooks, ralph skill loads in Ralph TUI
5. **Ralph TUI integration works**: Can run `ralph-tui create-prd --prd-skill bootstralph-stack`

### Key Metrics

- Time from `bootstralph create` to `ralph-tui run`: < 2 minutes
- Detection accuracy for top 3 frameworks: > 90% confidence
- Skills sync accuracy: 100% (no false positives/negatives)
- Zero manual config editing required for happy path

## Risks & Mitigations

| Risk                           | Impact | Mitigation                                   |
| ------------------------------ | ------ | -------------------------------------------- |
| OpenSkills API changes         | High   | Pin version, abstract CLI wrapper            |
| Official CLI breaking changes  | Medium | Version locking, periodic updates            |
| Ralph TUI skill format changes | Medium | Versioned templates, schema validation       |
| Skill mappings incomplete      | Low    | Community contributions, defaults            |
| Lefthook not installed         | Medium | Check in prepare script, clear error message |

## Dependencies

### External Dependencies

- **Ralph TUI**: For planning and execution (peer dependency)
- **OpenSkills**: For skills management (peer dependency)
- **Lefthook**: For pre-commit hooks (peer dependency)
- **Official framework CLIs**: create-next-app, create-expo-app, etc.

### Internal Dependencies

- Phase 1 must complete before all other phases
- Phase 2 required for Phase 6 (init command)
- Phase 3 required for Phase 6 (both commands run sync)
- Phase 4 required for Phase 6 (both commands generate configs)

## Out of Scope (Post-MVP)

1. **Testing**: Unit tests, integration tests, e2e tests (Phase 7)
2. **Documentation**: README, API docs, examples (Phase 8)
3. **CI/CD**: GitHub Actions, npm publish setup (Phase 8)
4. **V1 Migration**: No backward compatibility, migration guide, or v1 code porting
5. **Advanced Features**: Presets, custom mappings, offline mode, multi-agent

## Appendix: Skill Mappings Sample

```json
{
  "mappings": [
    {
      "skill": "react-best-practices",
      "source": "vercel-labs/agent-skills",
      "packages": ["react", "react-dom"]
    },
    {
      "skill": "nextjs-app-router",
      "source": "vercel-labs/agent-skills",
      "packages": ["next"],
      "configFiles": ["next.config.*"]
    },
    {
      "skill": "expo-app-design",
      "source": "expo/skills",
      "packages": ["expo"],
      "configFiles": ["app.json", "app.config.*"]
    },
    {
      "skill": "better-auth",
      "source": "@Microck/ordinary-claude-skills",
      "packages": ["better-auth"]
    },
    {
      "skill": "drizzle",
      "source": "@korallis/Droidz",
      "packages": ["drizzle-orm"]
    },
    {
      "skill": "tailwind-v4-shadcn",
      "source": "community",
      "packages": ["tailwindcss"]
    },
    {
      "skill": "systematic-debugging",
      "source": "obra/superpowers",
      "packages": []
    },
    {
      "skill": "verification-before-completion",
      "source": "obra/superpowers",
      "packages": []
    }
  ],
  "defaults": ["systematic-debugging", "verification-before-completion"]
}
```

## Appendix: Generated File Examples

### .bootstralph/config.json

```json
{
  "version": "1.0.0",
  "createdAt": "2026-01-18T12:00:00.000Z",
  "stack": {
    "projectType": "web",
    "framework": "nextjs",
    "features": {
      "auth": "better-auth",
      "database": "drizzle",
      "styling": "tailwind"
    },
    "deployment": {
      "platform": "vercel"
    },
    "tooling": {
      "packageManager": "bun",
      "linting": "oxlint",
      "formatting": "oxfmt",
      "preCommit": "lefthook"
    }
  }
}
```

### lefthook.yml

```yaml
# Generated by bootstralph

pre-commit:
  parallel: true
  commands:
    oxlint:
      glob: "*.{js,jsx,ts,tsx}"
      run: npx oxlint --fix {staged_files}
      stage_fixed: true

    oxfmt:
      glob: "*.{js,jsx,ts,tsx}"
      run: npx oxfmt {staged_files}
      stage_fixed: true

    typecheck:
      glob: "*.{ts,tsx}"
      run: npx tsc --noEmit

    skills-sync:
      run: npx bootstralph sync --quiet

pre-push:
  commands:
    test:
      run: bun test
```

### .ralph-tui/skills/bootstralph-stack/SKILL.md

````markdown
# bootstralph Stack Context

This project was scaffolded with bootstralph.

## Stack

- **Framework**: Next.js 15 (App Router)
- **Auth**: better-auth
- **Database**: Drizzle ORM + PostgreSQL
- **Styling**: Tailwind CSS v4
- **Deployment**: Vercel

## Key Patterns

### Authentication

- Server: `auth()` from `@/lib/auth`
- Client: `useSession()` hook
- Middleware: protect routes in `middleware.ts`

### Database

- Schema: `src/db/schema.ts`
- Migrations: `drizzle-kit push`
- Client: `db` from `@/lib/db`

## Commands

```bash
bun dev       # Start dev server
bun db:push   # Push schema changes
```
````

```

---

**End of PRD**
```
