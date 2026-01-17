# PRD Writer Skill

Write optimal Product Requirements Documents (PRDs) for Ralph Loop autonomous development.

## Overview

This skill guides you in creating PRDs that work effectively with the Ralph Loop pattern for autonomous AI coding. A well-structured PRD enables Claude Code to work through tasks systematically while you're AFK (away from keyboard).

## PRD Philosophy

### The Ralph Loop Pattern
Ralph runs Claude Code in iterative loops where each iteration:
1. Reads the PRD to find the next incomplete story
2. Implements ONLY that story (single-task focus)
3. Runs tests and type checks to validate
4. Marks the story as `passes: true` if successful
5. Commits changes and logs progress
6. Loops until all stories pass or max iterations reached

### Key Principles
- **Atomic Stories**: Each story should be completable in one iteration (5-30 minutes of Claude work)
- **Clear Acceptance Criteria**: Claude needs unambiguous criteria to know when a story passes
- **Proper Dependencies**: Stories must specify dependencies to prevent blocked work
- **Verifiable Outcomes**: Every criterion should be testable via code, tests, or file existence

## PRD Schema

```json
{
  "name": "feature-name",
  "version": "0.1.0",
  "description": "Brief description of what this PRD achieves",
  "status": "planning",
  "branchName": "feature/feature-name",
  "userStories": [
    {
      "id": "US-001",
      "title": "Short descriptive title",
      "description": "Detailed description of what needs to be done",
      "acceptanceCriteria": [
        "Specific, testable criterion 1",
        "Specific, testable criterion 2"
      ],
      "priority": 1,
      "passes": false,
      "dependsOn": []
    }
  ],
  "metadata": {
    "createdAt": "2025-01-17T00:00:00Z",
    "completionPromise": "<promise>COMPLETE</promise>"
  }
}
```

## Writing Effective User Stories

### Story ID Convention
- Use semantic IDs: `US-001`, `IMPL-001`, `FIX-001`, `TEST-001`
- Keep IDs sequential within categories

### Title Guidelines
- Start with a verb: "Create", "Implement", "Add", "Fix", "Update"
- Keep under 60 characters
- Be specific: "Add user authentication with better-auth" not "Add auth"

### Description Guidelines
- Provide enough context for Claude to work independently
- Reference specific files or patterns in the codebase
- Include technical approach if there's a preferred method
- Mention any constraints or non-functional requirements

### Acceptance Criteria Best Practices

**Good Criteria (Verifiable):**
- "File `src/auth/config.ts` exists with better-auth configuration"
- "Running `bun test` passes all tests including new auth tests"
- "TypeScript compilation succeeds with no errors"
- "API endpoint `POST /api/auth/login` returns 200 for valid credentials"
- "Component renders login form with email and password fields"

**Bad Criteria (Vague):**
- "Authentication works" (How to verify?)
- "Code is clean" (Subjective)
- "Performance is good" (No measurable threshold)
- "Error handling is robust" (What errors? What handling?)

### Priority Guidelines
- Priority 1: Foundation/blocking work (must be done first)
- Priority 2: Core functionality
- Priority 3: Enhanced features
- Priority 4: Polish, optimization, nice-to-haves

### Dependencies
- List story IDs that must complete before this story
- Use dependencies for:
  - Stories that create files another story modifies
  - Database schema changes needed by other stories
  - Shared utilities or types
- Don't over-specify: only direct dependencies

## Story Size Guidelines

### Too Small (Combine)
- "Create auth folder"
- "Add single import"
- "Fix typo"

### Good Size (One Iteration)
- "Implement login form component with validation"
- "Add user registration API endpoint with password hashing"
- "Create database migration for users table"
- "Write unit tests for auth utilities"

### Too Large (Split)
- "Implement entire authentication system" (Split into: config, registration, login, session, middleware)
- "Add payments with Stripe" (Split into: SDK setup, webhook handler, checkout flow, subscription management)

## Example PRD

```json
{
  "name": "user-authentication",
  "version": "0.1.0",
  "description": "Add user authentication using better-auth with email/password and session management",
  "status": "planning",
  "branchName": "feature/auth",
  "userStories": [
    {
      "id": "US-001",
      "title": "Initialize better-auth configuration",
      "description": "Set up better-auth with SQLite database adapter and basic configuration. Create the auth configuration file and initialize the auth instance.",
      "acceptanceCriteria": [
        "File src/lib/auth.ts exists with better-auth configuration",
        "Database adapter configured for SQLite using existing db connection",
        "TypeScript compilation succeeds",
        "Auth instance exports getSession and signIn functions"
      ],
      "priority": 1,
      "passes": false,
      "dependsOn": []
    },
    {
      "id": "US-002",
      "title": "Add auth API routes",
      "description": "Create API route handlers for better-auth. These routes handle all auth operations (login, register, logout, session).",
      "acceptanceCriteria": [
        "File src/app/api/auth/[...all]/route.ts exists",
        "Routes handle GET and POST requests",
        "Integration test for /api/auth/session returns valid response",
        "TypeScript compilation succeeds"
      ],
      "priority": 2,
      "passes": false,
      "dependsOn": ["US-001"]
    },
    {
      "id": "US-003",
      "title": "Create login page component",
      "description": "Build the login page with email/password form. Include client-side validation and error handling.",
      "acceptanceCriteria": [
        "File src/app/login/page.tsx exists",
        "Form has email and password inputs with validation",
        "Form submits to better-auth signIn function",
        "Error messages display for invalid credentials",
        "Successful login redirects to /dashboard"
      ],
      "priority": 2,
      "passes": false,
      "dependsOn": ["US-002"]
    },
    {
      "id": "US-004",
      "title": "Add auth middleware for protected routes",
      "description": "Create middleware to protect routes that require authentication. Redirect unauthenticated users to login.",
      "acceptanceCriteria": [
        "File src/middleware.ts exists with auth check",
        "Middleware protects /dashboard/* routes",
        "Unauthenticated requests redirect to /login",
        "Authenticated requests pass through",
        "TypeScript compilation succeeds"
      ],
      "priority": 3,
      "passes": false,
      "dependsOn": ["US-002"]
    },
    {
      "id": "US-005",
      "title": "Write auth integration tests",
      "description": "Add integration tests for the authentication flow including registration, login, and session management.",
      "acceptanceCriteria": [
        "File tests/auth.test.ts exists",
        "Tests cover: registration success, registration validation errors",
        "Tests cover: login success, login with wrong password",
        "Tests cover: session retrieval for authenticated user",
        "All tests pass with bun test"
      ],
      "priority": 4,
      "passes": false,
      "dependsOn": ["US-003", "US-004"]
    }
  ],
  "metadata": {
    "createdAt": "2025-01-17T00:00:00Z",
    "completionPromise": "<promise>COMPLETE</promise>"
  }
}
```

## PRD Generation Workflow

When asked to create a PRD:

1. **Understand the Request**: Ask clarifying questions if the scope is unclear
2. **Identify Components**: Break down into logical implementation units
3. **Order by Dependencies**: Put foundational work first
4. **Size Appropriately**: Ensure each story is one iteration of work
5. **Write Clear Criteria**: Make every criterion verifiable
6. **Review Dependencies**: Ensure the graph is valid (no cycles, correct ordering)

## Common Patterns

### Feature Addition PRD
- Config/setup story first
- Core implementation stories (2-4)
- Integration stories
- Test story last (depends on all implementation)

### Bug Fix PRD
- Investigation/reproduction story first
- Fix implementation story
- Regression test story

### Refactoring PRD
- Add tests for existing behavior (if missing)
- Incremental refactoring stories
- Update dependent code stories
- Verification story

## Output Location

PRDs should be saved to `.agents/tasks/prd-{slug}.json` where `{slug}` is derived from the PRD name:
- "User Authentication" -> `prd-user-authentication.json`
- "Add Stripe Payments" -> `prd-add-stripe-payments.json`

## Review Checklist

Before finalizing a PRD, verify:
- [ ] All stories have unique IDs
- [ ] Dependencies form a valid DAG (no cycles)
- [ ] Each story is completable in one Claude iteration
- [ ] Acceptance criteria are specific and verifiable
- [ ] Priorities are assigned (1 = highest)
- [ ] Initial stories have no dependencies
- [ ] Test stories depend on implementation stories
