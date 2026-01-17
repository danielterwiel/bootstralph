/**
 * Claude Code settings.json template generator
 * Generates project-specific Claude Code settings with permissions and hooks
 *
 * Settings file locations:
 * - .claude/settings.json - Project settings (shared, tracked in git)
 * - .claude/settings.local.json - Project settings (private, not tracked)
 * - ~/.claude/settings.json - User settings (all projects)
 *
 * NOTE: As of late 2025, permissions.deny rules are NOT reliably enforced
 * for Read/Write/Edit tools. Use PreToolUse hooks for security-critical
 * file protection (see GitHub issues #6631, #6699, #4467).
 */

import type { Framework, ORM, Backend, AuthProvider } from "../../compatibility/matrix.js";

// ============================================================================
// Types
// ============================================================================

export interface ClaudeSettingsConfig {
  /** Project name for documentation */
  projectName: string;
  /** Target framework */
  framework: Framework;
  /** ORM choice (affects database file protection) */
  orm?: ORM;
  /** Backend choice (affects environment variable patterns) */
  backend?: Backend;
  /** Auth provider (affects secret patterns) */
  auth?: AuthProvider;
  /** Include PreToolUse hooks for reliable security */
  usePreToolUseHooks?: boolean;
  /** Include common deny patterns */
  includeCommonDenyPatterns?: boolean;
  /** Include allow patterns for common dev commands */
  includeDevAllowPatterns?: boolean;
}

export interface ClaudeSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
    ask?: string[];
  };
  hooks?: {
    PreToolUse?: PreToolUseHook[];
    PostToolUse?: PostToolUseHook[];
    Stop?: StopHook[];
  };
  env?: Record<string, string>;
}

export interface PreToolUseHook {
  matcher: string;
  hooks: Array<{
    type: "command";
    command: string;
  }>;
}

export interface PostToolUseHook {
  matcher: string;
  hooks: Array<{
    type: "command";
    command: string;
  }>;
}

export interface StopHook {
  hooks: Array<{
    type: "command";
    command: string;
  }>;
}

// ============================================================================
// Sensitive File Patterns
// ============================================================================

/**
 * Common sensitive file patterns that should be protected
 */
const COMMON_DENY_PATTERNS = {
  read: [
    // Environment files
    "Read(**/.env)",
    "Read(**/.env.local)",
    "Read(**/.env.production)",
    "Read(**/.env.*.local)",
    // Key files
    "Read(**/*.key)",
    "Read(**/*.pem)",
    "Read(**/*.p12)",
    "Read(**/*.pfx)",
    // Secret directories
    "Read(**/secrets/**)",
    "Read(**/.secrets/**)",
    // Cloud credentials
    "Read(**/.aws/**)",
    "Read(**/.gcp/**)",
    "Read(**/service-account*.json)",
    // SSH keys
    "Read(**/.ssh/**)",
    "Read(**/id_rsa)",
    "Read(**/id_ed25519)",
  ],
  bash: [
    // Dangerous commands
    "Bash(sudo:*)",
    "Bash(rm:-rf:*)",
    "Bash(chmod:777:*)",
    // Network commands that could exfiltrate data
    "Bash(curl:*)",
    "Bash(wget:*)",
    // Database dump commands
    "Bash(mysqldump:*)",
    "Bash(pg_dump:*)",
  ],
  write: [
    // Prevent writing to sensitive files
    "Write(**/.env)",
    "Write(**/.env.local)",
    "Write(**/.env.production)",
    "Write(**/*.key)",
    "Write(**/*.pem)",
  ],
};

/**
 * Framework-specific patterns
 */
function getFrameworkPatterns(framework: Framework): {
  allow: string[];
  deny: string[];
} {
  const patterns: { allow: string[]; deny: string[] } = {
    allow: [],
    deny: [],
  };

  switch (framework) {
    case "nextjs":
      patterns.allow.push(
        "Bash(npm run dev:*)",
        "Bash(npm run build:*)",
        "Bash(npm run test:*)",
        "Bash(npx next:*)"
      );
      break;

    case "tanstack-start":
      patterns.allow.push(
        "Bash(npm run dev:*)",
        "Bash(npm run build:*)",
        "Bash(npm run test:*)",
        "Bash(npx vinxi:*)"
      );
      break;

    case "react-router":
      patterns.allow.push(
        "Bash(npm run dev:*)",
        "Bash(npm run build:*)",
        "Bash(npm run test:*)"
      );
      break;

    case "astro":
      patterns.allow.push(
        "Bash(npm run dev:*)",
        "Bash(npm run build:*)",
        "Bash(npm run test:*)",
        "Bash(npx astro:*)"
      );
      break;

    case "expo":
      patterns.allow.push(
        "Bash(npx expo start:*)",
        "Bash(npx expo build:*)",
        "Bash(npx eas:*)",
        "Bash(npm run test:*)"
      );
      // Expo-specific secrets
      patterns.deny.push(
        "Read(**/app.json:*expo.android.googleServicesFile*)",
        "Read(**/google-services.json)",
        "Read(**/GoogleService-Info.plist)"
      );
      break;

    case "react-native-cli":
      patterns.allow.push(
        "Bash(npx react-native:*)",
        "Bash(npm run start:*)",
        "Bash(npm run test:*)"
      );
      // RN-specific secrets
      patterns.deny.push(
        "Read(**/google-services.json)",
        "Read(**/GoogleService-Info.plist)",
        "Read(**/android/app/signing.properties)"
      );
      break;

    case "hono":
      patterns.allow.push(
        "Bash(npm run dev:*)",
        "Bash(npm run deploy:*)",
        "Bash(wrangler:*)"
      );
      // Cloudflare secrets
      patterns.deny.push("Read(**/.wrangler/**)", "Read(**/wrangler.toml)");
      break;

    case "elysia":
      patterns.allow.push(
        "Bash(bun run dev:*)",
        "Bash(bun run build:*)",
        "Bash(bun test:*)"
      );
      break;
  }

  return patterns;
}

/**
 * ORM-specific patterns
 */
function getORMPatterns(orm: ORM): { allow: string[]; deny: string[] } {
  const patterns: { allow: string[]; deny: string[] } = {
    allow: [],
    deny: [],
  };

  switch (orm) {
    case "drizzle":
      patterns.allow.push(
        "Bash(npm run db:generate:*)",
        "Bash(npm run db:push:*)",
        "Bash(npm run db:studio:*)",
        "Bash(npx drizzle-kit:*)"
      );
      // Drizzle config may contain database URLs
      patterns.deny.push("Read(**/drizzle.config.ts:*connectionString*)");
      break;

    case "prisma":
      patterns.allow.push(
        "Bash(npx prisma generate:*)",
        "Bash(npx prisma db push:*)",
        "Bash(npx prisma studio:*)",
        "Bash(npx prisma migrate:*)"
      );
      break;
  }

  return patterns;
}

/**
 * Backend-specific patterns
 */
function getBackendPatterns(backend: Backend): { allow: string[]; deny: string[] } {
  const patterns: { allow: string[]; deny: string[] } = {
    allow: [],
    deny: [],
  };

  switch (backend) {
    case "supabase":
      patterns.allow.push("Bash(npx supabase:*)");
      patterns.deny.push(
        "Read(**/supabase/.env)",
        "Read(**/supabase/config.toml)"
      );
      break;

    case "firebase":
      patterns.allow.push("Bash(firebase:*)");
      patterns.deny.push(
        "Read(**/.firebaserc)",
        "Read(**/firebase-adminsdk*.json)",
        "Read(**/service-account*.json)"
      );
      break;

    case "convex":
      patterns.allow.push("Bash(npx convex:*)");
      break;
  }

  return patterns;
}

/**
 * Auth-specific patterns
 */
function getAuthPatterns(auth: AuthProvider): { allow: string[]; deny: string[] } {
  const patterns: { allow: string[]; deny: string[] } = {
    allow: [],
    deny: [],
  };

  switch (auth) {
    case "clerk":
      patterns.deny.push(
        "Read(**/*CLERK_SECRET*)",
        "Read(**/*CLERK_JWT*)"
      );
      break;

    case "better-auth":
      patterns.deny.push("Read(**/*AUTH_SECRET*)");
      break;

    case "supabase-auth":
      patterns.deny.push(
        "Read(**/*SUPABASE_SERVICE_ROLE*)",
        "Read(**/*SUPABASE_JWT*)"
      );
      break;
  }

  return patterns;
}

// ============================================================================
// PreToolUse Hook Generators
// ============================================================================

/**
 * Generate PreToolUse hook for Read tool security
 * This is the recommended approach since permissions.deny is not reliable
 */
function generateReadSecurityHook(): PreToolUseHook {
  // Patterns to block - using grep regex
  const patterns = [
    "\\.env",
    "\\.env\\.",
    "\\.key$",
    "\\.pem$",
    "\\.p12$",
    "\\.pfx$",
    "/secrets/",
    "/\\.secrets/",
    "/\\.aws/",
    "/\\.gcp/",
    "service-account",
    "/\\.ssh/",
    "id_rsa",
    "id_ed25519",
    "google-services\\.json",
    "GoogleService-Info\\.plist",
  ].join("|");

  return {
    matcher: "Read",
    hooks: [
      {
        type: "command",
        command: `if echo "$CLAUDE_TOOL_INPUT" | grep -qE '${patterns}'; then echo "Blocked: Cannot read sensitive files"; exit 2; fi`,
      },
    ],
  };
}

/**
 * Generate PreToolUse hook for Write tool security
 */
function generateWriteSecurityHook(): PreToolUseHook {
  const patterns = [
    "\\.env",
    "\\.key$",
    "\\.pem$",
    "/secrets/",
    "/\\.secrets/",
  ].join("|");

  return {
    matcher: "Write",
    hooks: [
      {
        type: "command",
        command: `if echo "$CLAUDE_TOOL_INPUT" | grep -qE '${patterns}'; then echo "Blocked: Cannot write to sensitive files"; exit 2; fi`,
      },
    ],
  };
}

/**
 * Generate PreToolUse hook for Edit tool security
 */
function generateEditSecurityHook(): PreToolUseHook {
  const patterns = [
    "\\.env",
    "\\.key$",
    "\\.pem$",
    "/secrets/",
    "/\\.secrets/",
  ].join("|");

  return {
    matcher: "Edit",
    hooks: [
      {
        type: "command",
        command: `if echo "$CLAUDE_TOOL_INPUT" | grep -qE '${patterns}'; then echo "Blocked: Cannot edit sensitive files"; exit 2; fi`,
      },
    ],
  };
}

/**
 * Generate PreToolUse hook for Bash command security
 */
function generateBashSecurityHook(): PreToolUseHook {
  // Dangerous command patterns
  const patterns = [
    "^sudo ",
    "rm -rf",
    "chmod 777",
    "^curl ",
    "^wget ",
    "mysqldump",
    "pg_dump",
  ].join("|");

  return {
    matcher: "Bash",
    hooks: [
      {
        type: "command",
        command: `if echo "$CLAUDE_TOOL_INPUT" | grep -qE '${patterns}'; then echo "Blocked: Dangerous command detected"; exit 2; fi`,
      },
    ],
  };
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate Claude Code settings.json content
 */
export function generateClaudeSettings(config: ClaudeSettingsConfig): ClaudeSettings {
  const {
    framework,
    orm,
    backend,
    auth,
    usePreToolUseHooks = true,
    includeCommonDenyPatterns = true,
    includeDevAllowPatterns = true,
  } = config;

  const settings: ClaudeSettings = {};

  // ========================================
  // Permissions
  // ========================================

  const allowPatterns: string[] = [];
  const denyPatterns: string[] = [];

  // Add common deny patterns
  if (includeCommonDenyPatterns) {
    denyPatterns.push(...COMMON_DENY_PATTERNS.read);
    denyPatterns.push(...COMMON_DENY_PATTERNS.bash);
    denyPatterns.push(...COMMON_DENY_PATTERNS.write);
  }

  // Add framework-specific patterns
  const frameworkPatterns = getFrameworkPatterns(framework);
  if (includeDevAllowPatterns) {
    allowPatterns.push(...frameworkPatterns.allow);
  }
  denyPatterns.push(...frameworkPatterns.deny);

  // Add ORM-specific patterns
  if (orm && orm !== "none") {
    const ormPatterns = getORMPatterns(orm);
    if (includeDevAllowPatterns) {
      allowPatterns.push(...ormPatterns.allow);
    }
    denyPatterns.push(...ormPatterns.deny);
  }

  // Add backend-specific patterns
  if (backend) {
    const backendPatterns = getBackendPatterns(backend);
    if (includeDevAllowPatterns) {
      allowPatterns.push(...backendPatterns.allow);
    }
    denyPatterns.push(...backendPatterns.deny);
  }

  // Add auth-specific patterns
  if (auth) {
    const authPatterns = getAuthPatterns(auth);
    denyPatterns.push(...authPatterns.deny);
  }

  // Common dev commands
  if (includeDevAllowPatterns) {
    allowPatterns.push(
      "Bash(git:*)",
      "Bash(npm run lint:*)",
      "Bash(npm run format:*)",
      "Bash(npm run typecheck:*)"
    );
  }

  // Add permissions to settings if we have any
  if (allowPatterns.length > 0 || denyPatterns.length > 0) {
    settings.permissions = {};
    if (allowPatterns.length > 0) {
      settings.permissions.allow = [...new Set(allowPatterns)];
    }
    if (denyPatterns.length > 0) {
      settings.permissions.deny = [...new Set(denyPatterns)];
    }
  }

  // ========================================
  // PreToolUse Hooks (Recommended Security)
  // ========================================

  if (usePreToolUseHooks) {
    settings.hooks = {
      PreToolUse: [
        generateReadSecurityHook(),
        generateWriteSecurityHook(),
        generateEditSecurityHook(),
        generateBashSecurityHook(),
      ],
    };
  }

  return settings;
}

/**
 * Convert ClaudeSettings to JSON string with proper formatting
 */
export function generateClaudeSettingsJson(config: ClaudeSettingsConfig): string {
  const settings = generateClaudeSettings(config);
  return JSON.stringify(settings, null, 2);
}

/**
 * Generate a minimal settings file (deny patterns only, no hooks)
 * Use this when PreToolUse hooks are not desired
 */
export function generateMinimalClaudeSettings(config: ClaudeSettingsConfig): ClaudeSettings {
  return generateClaudeSettings({
    ...config,
    usePreToolUseHooks: false,
    includeDevAllowPatterns: false,
  });
}

/**
 * Generate settings.local.json content
 * This is for private settings not tracked in git
 */
export function generateClaudeSettingsLocal(): ClaudeSettings {
  return {
    // Local settings typically contain environment overrides
    // or user-specific preferences
    env: {
      // Example: Custom API endpoints for local development
      // "API_BASE_URL": "http://localhost:3000"
    },
  };
}

/**
 * Generate settings.local.json with comment header
 */
export function generateClaudeSettingsLocalJson(): string {
  const settings = generateClaudeSettingsLocal();
  // Add a note about what this file is for
  const content = JSON.stringify(settings, null, 2);
  return content;
}
