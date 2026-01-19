# Ralph Progress Log

This file tracks progress across iterations. It's automatically updated
after each iteration and included in agent prompts for context.

## Codebase Patterns (Study These First)

### Generator Pattern
All generators follow a consistent pattern:
1. Read Handlebars template using `getTemplatePath()` helper
2. Register any custom Handlebars helpers (e.g., `eq` for equality checks)
3. Compile template with `Handlebars.compile()`
4. Map config to template variables
5. Render template
6. Ensure output directory exists with `ensureDir()`
7. Write rendered content with `writeFile()`
8. Return output path

Example: `src/generators/ralph-skill.ts`, `src/generators/lefthook.ts`

### JSON Manipulation Pattern
For generators that modify package.json or other JSON files:
1. Check if file exists with `exists()`
2. Read JSON with `readJson<Type>()`
3. Modify the parsed object
4. Write back with `writeJson()` with proper spacing
5. Return file path

Example: `src/generators/package-scripts.ts`

### Sequential Wizard Pattern
For interactive CLI wizards that collect user input across multiple steps:
1. Use `p.intro()` to start the wizard
2. Call each prompt function in sequence
3. Pass context from earlier prompts to later ones (e.g., platform → framework selection)
4. Check for cancellation after each prompt (if undefined, call `p.cancel()` and return)
5. Build result object with required fields first
6. Conditionally add optional fields only when they have values (for exactOptionalPropertyTypes)
7. Use `p.outro()` on success
8. Catch errors and use `p.cancel()` on failure

Example: `src/prompts/index.ts`

---

## 2026-01-19 - US-021
- **What was implemented:** Ralph skill generator that creates `.ralph-tui/skills/bootsralph-stack/SKILL.md`
- **Files changed:** `src/generators/ralph-skill.ts` (already existed from previous iteration)
- **Learnings:**
  - Work was already completed in a previous iteration
  - Generator follows established pattern with Handlebars template compilation
  - Uses custom Handlebars helper `eq` for equality comparisons in templates
  - Template path resolution works for both dev and built contexts
  - All quality checks pass (typecheck, lint, format)

---

## 2026-01-19 - US-022
- **What was implemented:** Package scripts generator that adds postinstall and prepare scripts to package.json
- **Files changed:** `src/generators/package-scripts.ts` (created)
- **Learnings:**
  - This generator differs from template-based generators - it directly manipulates JSON
  - Uses `readJson`/`writeJson` from fs utils for type-safe JSON operations
  - Includes a `merge` option to preserve existing scripts if desired (default: overwrite)
  - Added scripts:
    - `postinstall: 'bootsralph sync --quiet'` - runs after package installation
    - `prepare: 'lefthook install && bootsralph sync --quiet'` - runs before publish
  - Throws error if package.json doesn't exist (unlike template generators that create new files)
  - All quality checks pass (typecheck, lint, format)

---

## ✓ Iteration 1 - US-021: Create ralph skill generator
*2026-01-19T12:49:53.118Z (45s)*

**Status:** Completed

**Notes:**
template conditionals\n3. Compiles template with stack configuration variables\n4. Maps `StackConfig` to template variables (packageManager, framework, auth, database, styling, testing, deployment, tooling)\n5. Ensures output directory exists\n6. Writes rendered content to `.ralph-tui/skills/bootsralph-stack/SKILL.md`\n\nThe work was completed in a previous iteration and I've documented it in `.ralph-tui/progress.md` with the reusable Generator Pattern added to the Codebase Patterns section.\n\n

---
## ✓ Iteration 2 - US-022: Create package scripts generator
*2026-01-19T12:51:44.063Z (110s)*

**Status:** Completed

**Notes:**
per formatting using `writeJson()`\n\nThe `merge` option allows flexible behavior:\n- `merge: false` (default) - overwrites existing scripts\n- `merge: true` - preserves existing scripts, only adds missing ones\n\n### Documentation:\n\n- Added new \"JSON Manipulation Pattern\" to Codebase Patterns section in `progress.md`\n- Documented learnings including the difference between this generator and template-based ones\n- Committed with message: `feat: US-022 - Create package scripts generator`\n\n

---

## 2026-01-19 - US-023
- **What was implemented:** Bootsralph config generator that creates `.bootsralph/config.json` with stack configuration
- **Files changed:** `src/generators/bootsralph-config.ts` (created)
- **Learnings:**
  - Follows JSON Manipulation Pattern but creates new JSON files instead of modifying existing ones
  - Uses `writeJson()` to write config with version, createdAt timestamp, and stack configuration
  - Does NOT need to check if file exists (unlike package-scripts.ts which requires existing package.json)
  - Uses `ensureDir()` to create `.bootsralph/` directory before writing config
  - Includes version field for future config schema evolution (currently "1.0.0")
  - All quality checks pass (typecheck, lint, format)

---
## ✓ Iteration 3 - US-023: Create bootsralph config generator
*2026-01-19T12:53:14.521Z (89s)*

**Status:** Completed

**Notes:**
creates the complete configuration structure\n3. Uses `ensureDir()` to create the `.bootsralph/` directory\n4. Writes `config.json` with:\n   - `version`: \"1.0.0\" (for future schema evolution)\n   - `createdAt`: ISO timestamp\n   - `stack`: Complete StackConfig object\n5. All quality checks pass without errors\n\nThe generator follows the JSON Manipulation Pattern, creating a new JSON file with proper structure and formatting. It's documented with comprehensive JSDoc comments and examples.\n\n

---

## 2026-01-19 - US-024
- **What was implemented:** Created src/compatibility/index.ts to complete the compatibility module from v1
- **Files changed:**
  - `src/compatibility/index.ts` (created)
  - Three module files already existed: `matrix.ts`, `filters.ts`, `validators.ts`
- **Learnings:**
  - The compatibility module files (matrix.ts, filters.ts, validators.ts) were already copied from v1 in a previous iteration
  - Only the index.ts barrel export file was missing
  - The compatibility module types are independent from StackConfig - they serve different purposes:
    - Compatibility module: Detailed types for validation, option filtering, and compatibility rules
    - StackConfig: Simple persisted configuration format for .bootsralph/config.json
  - No type updates were needed - the modules are compatible as-is
  - All quality checks pass (typecheck, lint, format)

---
## ✓ Iteration 4 - US-024: Copy compatibility module from v1
*2026-01-19T12:55:13.048Z (118s)*

**Status:** Completed

**Notes:**
\n✅ **src/compatibility/validators.ts copied and adapted** - Already existed from v1, no adaptation needed\n✅ **src/compatibility/index.ts created with re-exports** - Created with comprehensive exports\n✅ **Types updated to match new StackConfig types** - No updates needed; types are compatible as-is\n✅ **bun run typecheck passes** - ✓ Passed\n✅ **bun run lint passes** - ✓ Passed (warnings in test files only)\n✅ **bun run format passes** - ✓ Passed\n\nAll acceptance criteria have been met!\n\n

---

## 2026-01-19 - US-025
- **What was implemented:** Created src/prompts/index.ts with runWizard export to orchestrate the wizard flow
- **Files changed:**
  - `src/prompts/index.ts` (created)
  - Five prompt module files already existed from v1: `project-type.ts`, `framework.ts`, `features.ts`, `deployment.ts`, `tooling.ts`
- **Learnings:**
  - The individual prompt modules were already copied from v1 in previous iterations - only the index.ts orchestrator was missing
  - All prompt modules already use @clack/prompts for UI (logger utilities requirement satisfied)
  - The runWizard function follows a sequential prompt pattern:
    1. Calls each prompt in order (project-type → framework → features → deployment → tooling)
    2. Passes context from earlier prompts to later ones (e.g., targets/platform to framework, platform/framework to features)
    3. Handles cancellation at any step by checking for undefined returns
    4. Uses p.intro/p.outro/p.cancel from @clack/prompts for consistent UX
  - TypeScript's exactOptionalPropertyTypes requires careful handling:
    - Cannot pass `property: undefined` for optional properties in strict mode
    - Must conditionally add optional properties only when they have values
    - Build objects with required fields first, then conditionally add optional fields
  - Created helper functions:
    - `wizardResultToStackConfig()` - converts WizardResult to StackConfig format for persistence
    - `runWizardAndConvert()` - convenience function combining wizard and conversion
  - All quality checks pass (typecheck, lint, format)

---
## ✓ Iteration 5 - US-025: Copy prompts module from v1
*2026-01-19T12:58:16.737Z (183s)*

**Status:** Completed

**Notes:**
ial prompts with context passing between steps\n- Includes helper functions for converting wizard results to StackConfig format\n- Re-exports all prompt functions and types for convenient importing\n- Properly handles TypeScript's exactOptionalPropertyTypes with conditional property assignment\n\nAll quality checks pass (typecheck, lint, format), the changes have been committed, and learnings have been documented including a new \"Sequential Wizard Pattern\" in the Codebase Patterns section.\n\n

---
