/**
 * Stack inferrer for detecting technology stack from package and config signals
 *
 * Combines signals from package.json dependencies and configuration files to
 * determine the framework, features, and provide a confidence score.
 */

import { type PackageScanResult } from "./package-scanner.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Supported frameworks
 */
export type Framework =
  | "nextjs"
  | "expo"
  | "tanstack-start"
  | "astro"
  | "hono"
  | "elysia"
  | null;

/**
 * Authentication method types
 */
export type AuthType =
  | "clerk"
  | "auth0"
  | "nextauth"
  | "supabase-auth"
  | "firebase-auth"
  | null;

/**
 * Database types
 */
export type Database =
  | "postgres"
  | "mysql"
  | "sqlite"
  | "mongodb"
  | "supabase"
  | "firebase"
  | null;

/**
 * Styling solution types
 */
export type Styling =
  | "tailwind"
  | "styled-components"
  | "emotion"
  | "css-modules"
  | "sass"
  | null;

/**
 * Testing framework types
 */
export type Testing = "vitest" | "jest" | "playwright" | "cypress" | null;

/**
 * Detected features
 */
export interface DetectedFeatures {
  /** Authentication method */
  auth: AuthType;
  /** Database solution */
  database: Database;
  /** Styling solution */
  styling: Styling;
  /** Testing framework */
  testing: Testing;
  /** TypeScript enabled */
  typescript: boolean;
  /** Docker configured */
  docker: boolean;
}

/**
 * Detected stack with confidence
 */
export interface DetectedStack {
  /** Primary framework (null if uncertain) */
  framework: Framework;
  /** Detected features */
  features: DetectedFeatures;
  /** Confidence score 0-1 (higher is more certain) */
  confidence: number;
}

// ============================================================================
// Framework Detection
// ============================================================================

/**
 * Framework detection rules
 *
 * Each rule specifies packages and config files that indicate a framework,
 * along with confidence multipliers for strong signals.
 */
const FRAMEWORK_RULES = {
  nextjs: {
    packages: ["next"],
    configs: ["next.config.*"],
    requiredPackage: true, // Must have the package
  },
  expo: {
    packages: ["expo"],
    configs: ["expo.config.*", "app.json"],
    requiredPackage: true,
  },
  "tanstack-start": {
    packages: ["@tanstack/start"],
    configs: [],
    requiredPackage: true,
  },
  astro: {
    packages: ["astro"],
    configs: ["astro.config.*"],
    requiredPackage: true,
  },
  hono: {
    packages: ["hono"],
    configs: [],
    requiredPackage: true,
  },
  elysia: {
    packages: ["elysia"],
    configs: [],
    requiredPackage: true,
  },
} as const;

/**
 * Detect framework from package and config signals
 */
function detectFramework(
  packageScan: PackageScanResult,
  _configFiles: string[]
): Framework {
  const allPackages = [
    ...packageScan.dependencies,
    ...packageScan.devDependencies,
  ];

  // Check each framework's rules
  for (const [framework, rules] of Object.entries(FRAMEWORK_RULES)) {
    // Check if required package is present
    const hasRequiredPackage = rules.packages.some((pkg) =>
      allPackages.includes(pkg)
    );

    if (!hasRequiredPackage && rules.requiredPackage) {
      continue;
    }

    // If we have the required package, it's a match
    // (config files provide additional confidence but aren't required)
    if (hasRequiredPackage) {
      return framework as Framework;
    }
  }

  return null;
}

// ============================================================================
// Feature Detection
// ============================================================================

/**
 * Detect authentication method
 */
function detectAuth(packageScan: PackageScanResult): AuthType {
  const allPackages = [
    ...packageScan.dependencies,
    ...packageScan.devDependencies,
  ];

  if (allPackages.some((pkg) => pkg.includes("@clerk"))) return "clerk";
  if (allPackages.includes("auth0")) return "auth0";
  if (allPackages.includes("next-auth")) return "nextauth";
  if (allPackages.includes("@supabase/auth-helpers")) return "supabase-auth";
  if (allPackages.includes("firebase")) return "firebase-auth";

  return null;
}

/**
 * Detect database solution
 */
function detectDatabase(
  packageScan: PackageScanResult,
  configFiles: string[]
): Database {
  const allPackages = [
    ...packageScan.dependencies,
    ...packageScan.devDependencies,
  ];

  // Check for specific database packages
  if (
    allPackages.some(
      (pkg) => pkg === "pg" || pkg === "postgres" || pkg === "@vercel/postgres"
    )
  ) {
    return "postgres";
  }
  if (allPackages.some((pkg) => pkg === "mysql" || pkg === "mysql2")) {
    return "mysql";
  }
  if (
    allPackages.some((pkg) => pkg === "sqlite3" || pkg === "better-sqlite3")
  ) {
    return "sqlite";
  }
  if (allPackages.some((pkg) => pkg === "mongodb" || pkg === "mongoose")) {
    return "mongodb";
  }

  // Check for database-as-a-service
  if (allPackages.includes("@supabase/supabase-js")) return "supabase";
  if (allPackages.includes("firebase")) return "firebase";

  // Check for ORMs that might indicate database (lower confidence)
  if (configFiles.some((f) => f.includes("prisma"))) {
    // Prisma config exists, but need to infer database from packages
    // Default to postgres as it's most common with Prisma
    return "postgres";
  }
  if (configFiles.some((f) => f.includes("drizzle"))) {
    // Similar for Drizzle - default to postgres
    return "postgres";
  }

  return null;
}

/**
 * Detect styling solution
 */
function detectStyling(
  packageScan: PackageScanResult,
  configFiles: string[]
): Styling {
  const allPackages = [
    ...packageScan.dependencies,
    ...packageScan.devDependencies,
  ];

  // Config-based detection (higher confidence)
  if (configFiles.some((f) => f.includes("tailwind.config"))) return "tailwind";

  // Package-based detection
  if (allPackages.includes("styled-components")) return "styled-components";
  if (allPackages.includes("@emotion/react")) return "emotion";
  if (allPackages.some((pkg) => pkg.includes("sass") || pkg.includes("scss")))
    return "sass";

  // CSS modules are typically built-in, check for common patterns in scripts
  const hasModuleCss = Object.keys(packageScan.scripts).some(
    (script) =>
      packageScan.scripts[script]?.includes(".module.css") ||
      packageScan.scripts[script]?.includes(".module.scss")
  );
  if (hasModuleCss) return "css-modules";

  return null;
}

/**
 * Detect testing framework
 */
function detectTesting(
  packageScan: PackageScanResult,
  configFiles: string[]
): Testing {
  const allPackages = [
    ...packageScan.dependencies,
    ...packageScan.devDependencies,
  ];

  // Check configs first (higher confidence)
  if (configFiles.some((f) => f.includes("vitest.config"))) return "vitest";
  if (configFiles.some((f) => f.includes("jest.config"))) return "jest";
  if (configFiles.some((f) => f.includes("playwright.config")))
    return "playwright";

  // Package-based detection
  if (allPackages.includes("vitest")) return "vitest";
  if (allPackages.includes("jest")) return "jest";
  if (allPackages.includes("@playwright/test")) return "playwright";
  if (allPackages.includes("cypress")) return "cypress";

  return null;
}

// ============================================================================
// Confidence Calculation
// ============================================================================

/**
 * Calculate confidence score based on detected signals
 *
 * Higher confidence when:
 * - Framework has both package and config file
 * - Multiple features are detected
 * - TypeScript is configured
 */
function calculateConfidence(
  framework: Framework,
  packageScan: PackageScanResult,
  configFiles: string[],
  features: DetectedFeatures
): number {
  let score = 0;
  let maxScore = 0;

  // Framework detection (40 points)
  maxScore += 40;
  if (framework) {
    score += 20; // Base score for detecting a framework

    // Bonus if config file exists
    const frameworkRules = FRAMEWORK_RULES[framework];
    if (frameworkRules) {
      const hasConfig = frameworkRules.configs.some((pattern) =>
        configFiles.some((file) => matchPattern(file, pattern))
      );
      if (hasConfig) {
        score += 20;
      }
    }
  }

  // Feature detection (30 points - 5 per feature category)
  maxScore += 30;
  if (features.auth) score += 5;
  if (features.database) score += 5;
  if (features.styling) score += 5;
  if (features.testing) score += 5;
  if (features.typescript) score += 5;
  if (features.docker) score += 5;

  // Package.json existence (20 points)
  maxScore += 20;
  if (
    packageScan.dependencies.length > 0 ||
    packageScan.devDependencies.length > 0
  ) {
    score += 20;
  }

  // Config files existence (10 points)
  maxScore += 10;
  if (configFiles.length > 0) {
    score += Math.min(10, configFiles.length * 2);
  }

  // Normalize to 0-1 range
  return maxScore > 0 ? score / maxScore : 0;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Match a file path against a glob-style pattern
 *
 * Simple implementation supporting * wildcard
 */
function matchPattern(file: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, "\\.") // Escape dots
    .replace(/\*/g, ".*"); // Convert * to .*

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(file);
}

// ============================================================================
// Main Inference Function
// ============================================================================

/**
 * Infer technology stack from package and config scans
 *
 * Combines signals from package.json dependencies and configuration files
 * to determine the framework and features being used.
 *
 * @param packageScan - Result from scanPackageJson
 * @param configFiles - Result from scanConfigFiles
 * @returns Detected stack with framework, features, and confidence score
 *
 * @example
 * ```typescript
 * const packageScan = await scanPackageJson();
 * const configFiles = await scanConfigFiles();
 * const stack = inferStack(packageScan, configFiles);
 *
 * console.log(`Framework: ${stack.framework}`);
 * console.log(`Auth: ${stack.features.auth}`);
 * console.log(`Confidence: ${(stack.confidence * 100).toFixed(1)}%`);
 * ```
 *
 * @example
 * ```typescript
 * // Next.js project with Clerk auth and Tailwind
 * const stack = inferStack(
 *   {
 *     dependencies: ["next", "react", "@clerk/nextjs"],
 *     devDependencies: ["typescript", "tailwindcss"],
 *     scripts: { dev: "next dev" }
 *   },
 *   ["next.config.js", "tailwind.config.ts", "tsconfig.json"]
 * );
 * // stack.framework === "nextjs"
 * // stack.features.auth === "clerk"
 * // stack.features.styling === "tailwind"
 * // stack.confidence > 0.8
 * ```
 */
export function inferStack(
  packageScan: PackageScanResult,
  configFiles: string[]
): DetectedStack {
  // Detect framework
  const framework = detectFramework(packageScan, configFiles);

  // Detect features
  const features: DetectedFeatures = {
    auth: detectAuth(packageScan),
    database: detectDatabase(packageScan, configFiles),
    styling: detectStyling(packageScan, configFiles),
    testing: detectTesting(packageScan, configFiles),
    typescript: configFiles.some((f) => f === "tsconfig.json"),
    docker: configFiles.some(
      (f) => f === "Dockerfile" || f.includes("docker-compose")
    ),
  };

  // Calculate confidence
  const confidence = calculateConfidence(
    framework,
    packageScan,
    configFiles,
    features
  );

  return {
    framework,
    features,
    confidence,
  };
}
