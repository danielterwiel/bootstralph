/**
 * Tests for detection module
 * Tests stack detection, package scanning, config file detection, and inference logic
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Import detection functions and types
import {
  scanPackageJson,
  resolveWorkspaces,
  type PackageScanResult,
} from "../src/detection/package-scanner.js";
import {
  scanConfigFiles,
  CONFIG_PATTERNS,
} from "../src/detection/config-scanner.js";
import { inferStack } from "../src/detection/stack-inferrer.js";
import { detectStack } from "../src/detection/index.js";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a temporary directory for testing
 */
async function createTempDir(): Promise<string> {
  const prefix = join(tmpdir(), "bootstralph-test-");
  return await mkdtemp(prefix);
}

/**
 * Write package.json to a directory
 */
async function writePackageJson(
  dir: string,
  content: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  },
): Promise<void> {
  const packageJsonPath = join(dir, "package.json");
  await writeFile(packageJsonPath, JSON.stringify(content, null, 2));
}

/**
 * Create config files in a directory
 */
async function createConfigFiles(dir: string, files: string[]): Promise<void> {
  for (const file of files) {
    const filePath = join(dir, file);

    // Create parent directory if needed (e.g., for prisma/schema.prisma)
    const parentDir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (parentDir !== dir) {
      await mkdir(parentDir, { recursive: true });
    }

    await writeFile(filePath, "// Config file");
  }
}

// ============================================================================
// Package Scanner Tests
// ============================================================================

describe("scanPackageJson", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should return empty result when package.json does not exist", async () => {
    const result = await scanPackageJson(tempDir);

    expect(result.dependencies).toEqual([]);
    expect(result.devDependencies).toEqual([]);
    expect(result.scripts).toEqual({});
  });

  it("should extract dependencies from package.json", async () => {
    await writePackageJson(tempDir, {
      dependencies: {
        next: "^14.0.0",
        react: "^18.0.0",
      },
    });

    const result = await scanPackageJson(tempDir);

    expect(result.dependencies).toContain("next");
    expect(result.dependencies).toContain("react");
    expect(result.dependencies).toHaveLength(2);
  });

  it("should extract devDependencies from package.json", async () => {
    await writePackageJson(tempDir, {
      devDependencies: {
        typescript: "^5.0.0",
        vitest: "^4.0.0",
      },
    });

    const result = await scanPackageJson(tempDir);

    expect(result.devDependencies).toContain("typescript");
    expect(result.devDependencies).toContain("vitest");
    expect(result.devDependencies).toHaveLength(2);
  });

  it("should extract scripts from package.json", async () => {
    await writePackageJson(tempDir, {
      scripts: {
        dev: "next dev",
        build: "next build",
        test: "vitest",
      },
    });

    const result = await scanPackageJson(tempDir);

    expect(result.scripts).toHaveProperty("dev", "next dev");
    expect(result.scripts).toHaveProperty("build", "next build");
    expect(result.scripts).toHaveProperty("test", "vitest");
  });

  it("should handle package.json with all sections", async () => {
    await writePackageJson(tempDir, {
      dependencies: {
        next: "^14.0.0",
      },
      devDependencies: {
        typescript: "^5.0.0",
      },
      scripts: {
        dev: "next dev",
      },
    });

    const result = await scanPackageJson(tempDir);

    expect(result.dependencies).toContain("next");
    expect(result.devDependencies).toContain("typescript");
    expect(result.scripts).toHaveProperty("dev");
  });

  it("should handle empty dependencies sections", async () => {
    await writePackageJson(tempDir, {
      dependencies: {},
      devDependencies: {},
      scripts: {},
    });

    const result = await scanPackageJson(tempDir);

    expect(result.dependencies).toEqual([]);
    expect(result.devDependencies).toEqual([]);
    expect(result.scripts).toEqual({});
  });
});

// ============================================================================
// Workspace Resolution Tests
// ============================================================================

describe("resolveWorkspaces", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should return empty array when no workspaces field", async () => {
    await writePackageJson(tempDir, {
      dependencies: { next: "^14.0.0" },
    });

    const result = await resolveWorkspaces(tempDir);

    expect(result).toEqual([]);
  });

  it("should return empty array when package.json does not exist", async () => {
    const result = await resolveWorkspaces(tempDir);

    expect(result).toEqual([]);
  });

  it("should resolve direct workspace paths", async () => {
    // Create root package.json with workspaces
    const pkgJson = {
      workspaces: ["packages/ui"],
    };
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(pkgJson, null, 2),
    );

    // Create workspace package
    await mkdir(join(tempDir, "packages", "ui"), { recursive: true });
    await writeFile(
      join(tempDir, "packages", "ui", "package.json"),
      JSON.stringify({ name: "@monorepo/ui" }, null, 2),
    );

    const result = await resolveWorkspaces(tempDir);

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("packages/ui");
  });

  it("should resolve glob pattern workspaces", async () => {
    // Create root package.json with glob workspaces
    const pkgJson = {
      workspaces: ["packages/*"],
    };
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(pkgJson, null, 2),
    );

    // Create multiple workspace packages
    await mkdir(join(tempDir, "packages", "ui"), { recursive: true });
    await writeFile(
      join(tempDir, "packages", "ui", "package.json"),
      JSON.stringify({ name: "@monorepo/ui" }, null, 2),
    );

    await mkdir(join(tempDir, "packages", "utils"), { recursive: true });
    await writeFile(
      join(tempDir, "packages", "utils", "package.json"),
      JSON.stringify({ name: "@monorepo/utils" }, null, 2),
    );

    const result = await resolveWorkspaces(tempDir);

    expect(result).toHaveLength(2);
  });

  it("should handle object-style workspaces field", async () => {
    // Create root package.json with object workspaces
    const pkgJson = {
      workspaces: { packages: ["apps/web"] },
    };
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(pkgJson, null, 2),
    );

    // Create workspace
    await mkdir(join(tempDir, "apps", "web"), { recursive: true });
    await writeFile(
      join(tempDir, "apps", "web", "package.json"),
      JSON.stringify({ name: "web" }, null, 2),
    );

    const result = await resolveWorkspaces(tempDir);

    expect(result).toHaveLength(1);
  });

  it("should skip directories without package.json", async () => {
    // Create root package.json with glob workspaces
    const pkgJson = {
      workspaces: ["packages/*"],
    };
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(pkgJson, null, 2),
    );

    // Create one valid workspace
    await mkdir(join(tempDir, "packages", "ui"), { recursive: true });
    await writeFile(
      join(tempDir, "packages", "ui", "package.json"),
      JSON.stringify({ name: "@monorepo/ui" }, null, 2),
    );

    // Create one directory without package.json
    await mkdir(join(tempDir, "packages", "docs"), { recursive: true });
    await writeFile(join(tempDir, "packages", "docs", "README.md"), "# Docs");

    const result = await resolveWorkspaces(tempDir);

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("packages/ui");
  });
});

// ============================================================================
// Workspace Integration with Package Scanning
// ============================================================================

describe("scanPackageJson with workspaces", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should aggregate dependencies from workspace packages", async () => {
    // Create root package.json with workspaces
    const rootPkg = {
      name: "monorepo",
      workspaces: ["packages/*"],
      dependencies: {
        typescript: "^5.0.0",
      },
    };
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(rootPkg, null, 2),
    );

    // Create workspace with react
    await mkdir(join(tempDir, "packages", "web"), { recursive: true });
    await writeFile(
      join(tempDir, "packages", "web", "package.json"),
      JSON.stringify(
        {
          name: "web",
          dependencies: { next: "^14.0.0", react: "^18.0.0" },
        },
        null,
        2,
      ),
    );

    // Create workspace with hono
    await mkdir(join(tempDir, "packages", "api"), { recursive: true });
    await writeFile(
      join(tempDir, "packages", "api", "package.json"),
      JSON.stringify(
        {
          name: "api",
          dependencies: { hono: "^4.0.0" },
        },
        null,
        2,
      ),
    );

    const result = await scanPackageJson(tempDir);

    // Should have root + all workspace dependencies
    expect(result.dependencies).toContain("typescript");
    expect(result.dependencies).toContain("next");
    expect(result.dependencies).toContain("react");
    expect(result.dependencies).toContain("hono");
  });

  it("should aggregate devDependencies from workspace packages", async () => {
    // Create root package.json with workspaces
    const rootPkg = {
      name: "monorepo",
      workspaces: ["packages/*"],
      devDependencies: {
        vitest: "^1.0.0",
      },
    };
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(rootPkg, null, 2),
    );

    // Create workspace with tailwind
    await mkdir(join(tempDir, "packages", "web"), { recursive: true });
    await writeFile(
      join(tempDir, "packages", "web", "package.json"),
      JSON.stringify(
        {
          name: "web",
          devDependencies: { tailwindcss: "^3.0.0" },
        },
        null,
        2,
      ),
    );

    const result = await scanPackageJson(tempDir);

    expect(result.devDependencies).toContain("vitest");
    expect(result.devDependencies).toContain("tailwindcss");
  });

  it("should deduplicate dependencies from multiple workspaces", async () => {
    // Create root package.json with workspaces
    const rootPkg = {
      name: "monorepo",
      workspaces: ["packages/*"],
      dependencies: { react: "^18.0.0" },
    };
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(rootPkg, null, 2),
    );

    // Both workspaces have react
    await mkdir(join(tempDir, "packages", "web"), { recursive: true });
    await writeFile(
      join(tempDir, "packages", "web", "package.json"),
      JSON.stringify(
        {
          name: "web",
          dependencies: { react: "^18.0.0" },
        },
        null,
        2,
      ),
    );

    await mkdir(join(tempDir, "packages", "mobile"), { recursive: true });
    await writeFile(
      join(tempDir, "packages", "mobile", "package.json"),
      JSON.stringify(
        {
          name: "mobile",
          dependencies: { react: "^18.0.0" },
        },
        null,
        2,
      ),
    );

    const result = await scanPackageJson(tempDir);

    // Should only have react once
    const reactCount = result.dependencies.filter((d) => d === "react").length;
    expect(reactCount).toBe(1);
  });

  it("should still return root scripts (not workspace scripts)", async () => {
    // Create root package.json with workspaces
    const rootPkg = {
      name: "monorepo",
      workspaces: ["packages/*"],
      scripts: { dev: "turbo dev", build: "turbo build" },
    };
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(rootPkg, null, 2),
    );

    // Workspace with its own scripts
    await mkdir(join(tempDir, "packages", "web"), { recursive: true });
    await writeFile(
      join(tempDir, "packages", "web", "package.json"),
      JSON.stringify(
        {
          name: "web",
          scripts: { dev: "next dev" },
        },
        null,
        2,
      ),
    );

    const result = await scanPackageJson(tempDir);

    // Should only have root scripts
    expect(result.scripts).toHaveProperty("dev", "turbo dev");
    expect(result.scripts).toHaveProperty("build", "turbo build");
  });
});

// ============================================================================
// Config Scanner Tests
// ============================================================================

describe("scanConfigFiles", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should return empty array when no config files exist", async () => {
    const result = await scanConfigFiles(tempDir);
    expect(result).toEqual([]);
  });

  it("should detect Next.js config files", async () => {
    await createConfigFiles(tempDir, ["next.config.js"]);

    const result = await scanConfigFiles(tempDir);

    expect(result).toContain("next.config.js");
  });

  it("should detect TypeScript config", async () => {
    await createConfigFiles(tempDir, ["tsconfig.json"]);

    const result = await scanConfigFiles(tempDir);

    expect(result).toContain("tsconfig.json");
  });

  it("should detect Tailwind config", async () => {
    await createConfigFiles(tempDir, ["tailwind.config.ts"]);

    const result = await scanConfigFiles(tempDir);

    expect(result).toContain("tailwind.config.ts");
  });

  it("should detect Prisma schema file", async () => {
    await createConfigFiles(tempDir, ["prisma/schema.prisma"]);

    const result = await scanConfigFiles(tempDir);

    expect(result).toContain("prisma/schema.prisma");
  });

  it("should detect Drizzle config", async () => {
    await createConfigFiles(tempDir, ["drizzle.config.ts"]);

    const result = await scanConfigFiles(tempDir);

    expect(result).toContain("drizzle.config.ts");
  });

  it("should detect Docker files", async () => {
    await createConfigFiles(tempDir, ["Dockerfile", "docker-compose.yml"]);

    const result = await scanConfigFiles(tempDir);

    expect(result).toContain("Dockerfile");
    expect(result).toContain("docker-compose.yml");
  });

  it("should detect dotfiles like .eslintrc", async () => {
    await createConfigFiles(tempDir, [".eslintrc.json"]);

    const result = await scanConfigFiles(tempDir);

    expect(result).toContain(".eslintrc.json");
  });

  it("should detect multiple config files", async () => {
    await createConfigFiles(tempDir, [
      "next.config.js",
      "tsconfig.json",
      "tailwind.config.ts",
      ".eslintrc.json",
    ]);

    const result = await scanConfigFiles(tempDir);

    expect(result).toHaveLength(4);
    expect(result).toContain("next.config.js");
    expect(result).toContain("tsconfig.json");
    expect(result).toContain("tailwind.config.ts");
    expect(result).toContain(".eslintrc.json");
  });

  it("should detect testing framework configs", async () => {
    await createConfigFiles(tempDir, [
      "vitest.config.ts",
      "playwright.config.ts",
    ]);

    const result = await scanConfigFiles(tempDir);

    expect(result).toContain("vitest.config.ts");
    expect(result).toContain("playwright.config.ts");
  });

  it("should detect Expo config files", async () => {
    await createConfigFiles(tempDir, ["expo.config.js", "app.json"]);

    const result = await scanConfigFiles(tempDir);

    expect(result).toContain("expo.config.js");
    expect(result).toContain("app.json");
  });

  it("should detect Astro config", async () => {
    await createConfigFiles(tempDir, ["astro.config.mjs"]);

    const result = await scanConfigFiles(tempDir);

    expect(result).toContain("astro.config.mjs");
  });
});

// ============================================================================
// CONFIG_PATTERNS Constants Tests
// ============================================================================

describe("CONFIG_PATTERNS", () => {
  it("should have expected framework patterns", () => {
    expect(CONFIG_PATTERNS["next.config.*"]).toBe("nextjs");
    expect(CONFIG_PATTERNS["expo.config.*"]).toBe("expo");
    expect(CONFIG_PATTERNS["astro.config.*"]).toBe("astro");
  });

  it("should have expected tooling patterns", () => {
    expect(CONFIG_PATTERNS["tailwind.config.*"]).toBe("tailwind");
    expect(CONFIG_PATTERNS["tsconfig.json"]).toBe("typescript");
    expect(CONFIG_PATTERNS["vite.config.*"]).toBe("vite");
  });

  it("should have expected ORM patterns", () => {
    expect(CONFIG_PATTERNS["drizzle.config.*"]).toBe("drizzle");
    expect(CONFIG_PATTERNS["prisma/schema.prisma"]).toBe("prisma");
  });

  it("should have expected testing patterns", () => {
    expect(CONFIG_PATTERNS["vitest.config.*"]).toBe("vitest");
    expect(CONFIG_PATTERNS["jest.config.*"]).toBe("jest");
    expect(CONFIG_PATTERNS["playwright.config.*"]).toBe("playwright");
  });

  it("should have expected Docker patterns", () => {
    expect(CONFIG_PATTERNS["Dockerfile"]).toBe("docker");
    expect(CONFIG_PATTERNS["docker-compose.yml"]).toBe("docker");
  });
});

// ============================================================================
// Stack Inferrer Tests
// ============================================================================

describe("inferStack", () => {
  describe("Framework Detection", () => {
    it("should detect Next.js from dependencies", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["next", "react"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.framework).toBe("nextjs");
    });

    it("should detect Next.js with higher confidence when config exists", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["next", "react"],
        devDependencies: [],
        scripts: {},
      };

      const stackWithoutConfig = inferStack(packageScan, []);
      const stackWithConfig = inferStack(packageScan, ["next.config.js"]);

      expect(stackWithConfig.confidence).toBeGreaterThan(
        stackWithoutConfig.confidence,
      );
    });

    it("should detect Expo from dependencies", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["expo", "react-native"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.framework).toBe("expo");
    });

    it("should detect TanStack Start from @tanstack/start", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["@tanstack/start"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.framework).toBe("tanstack-start");
    });

    it("should detect TanStack Start from @tanstack/react-start", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["@tanstack/react-start"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.framework).toBe("tanstack-start");
    });

    it("should detect Astro from dependencies", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["astro"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.framework).toBe("astro");
    });

    it("should detect Hono from dependencies", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["hono"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.framework).toBe("hono");
    });

    it("should detect Elysia from dependencies", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["elysia"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.framework).toBe("elysia");
    });

    it("should return null framework when none detected", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["react", "react-dom"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.framework).toBeNull();
    });

    it("should detect framework from devDependencies", () => {
      const packageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: ["astro"],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.framework).toBe("astro");
    });
  });

  describe("Authentication Detection", () => {
    it("should detect Clerk auth", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["@clerk/nextjs", "next"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.auth).toBe("clerk");
    });

    it("should detect Auth0", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["auth0"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.auth).toBe("auth0");
    });

    it("should detect NextAuth", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["next-auth"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.auth).toBe("nextauth");
    });

    it("should detect Supabase auth", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["@supabase/auth-helpers"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.auth).toBe("supabase-auth");
    });

    it("should detect Firebase auth", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["firebase"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.auth).toBe("firebase-auth");
    });

    it("should return null when no auth detected", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["next"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.auth).toBeNull();
    });
  });

  describe("Database Detection", () => {
    it("should detect Postgres from pg package", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["pg"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.database).toBe("postgres");
    });

    it("should detect Postgres from @vercel/postgres", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["@vercel/postgres"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.database).toBe("postgres");
    });

    it("should detect MySQL", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["mysql2"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.database).toBe("mysql");
    });

    it("should detect SQLite", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["better-sqlite3"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.database).toBe("sqlite");
    });

    it("should detect MongoDB", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["mongodb"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.database).toBe("mongodb");
    });

    it("should detect Supabase", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["@supabase/supabase-js"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.database).toBe("supabase");
    });

    it("should detect Firebase", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["firebase"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.database).toBe("firebase");
    });

    it("should infer Postgres from Prisma config", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["@prisma/client"],
        devDependencies: ["prisma"],
        scripts: {},
      };

      const stack = inferStack(packageScan, ["prisma/schema.prisma"]);

      expect(stack.features.database).toBe("postgres");
    });

    it("should infer Postgres from Drizzle config", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["drizzle-orm"],
        devDependencies: ["drizzle-kit"],
        scripts: {},
      };

      const stack = inferStack(packageScan, ["drizzle.config.ts"]);

      expect(stack.features.database).toBe("postgres");
    });
  });

  describe("Styling Detection", () => {
    it("should detect Tailwind from config file", () => {
      const packageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: ["tailwindcss"],
        scripts: {},
      };

      const stack = inferStack(packageScan, ["tailwind.config.js"]);

      expect(stack.features.styling).toBe("tailwind");
    });

    it("should detect styled-components", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["styled-components"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.styling).toBe("styled-components");
    });

    it("should detect Emotion", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["@emotion/react"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.styling).toBe("emotion");
    });

    it("should detect Sass", () => {
      const packageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: ["sass"],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.styling).toBe("sass");
    });

    it("should detect CSS modules from scripts", () => {
      const packageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: [],
        scripts: {
          "build-css": "process styles.module.css",
        },
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.styling).toBe("css-modules");
    });
  });

  describe("Testing Detection", () => {
    it("should detect Vitest from config", () => {
      const packageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: ["vitest"],
        scripts: {},
      };

      const stack = inferStack(packageScan, ["vitest.config.ts"]);

      expect(stack.features.testing).toBe("vitest");
    });

    it("should detect Vitest from package only", () => {
      const packageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: ["vitest"],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.testing).toBe("vitest");
    });

    it("should detect Jest from config", () => {
      const packageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: ["jest"],
        scripts: {},
      };

      const stack = inferStack(packageScan, ["jest.config.js"]);

      expect(stack.features.testing).toBe("jest");
    });

    it("should detect Playwright", () => {
      const packageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: ["@playwright/test"],
        scripts: {},
      };

      const stack = inferStack(packageScan, ["playwright.config.ts"]);

      expect(stack.features.testing).toBe("playwright");
    });

    it("should detect Cypress", () => {
      const packageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: ["cypress"],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.testing).toBe("cypress");
    });
  });

  describe("TypeScript Detection", () => {
    it("should detect TypeScript from tsconfig.json", () => {
      const packageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, ["tsconfig.json"]);

      expect(stack.features.typescript).toBe(true);
    });

    it("should return false when no tsconfig.json", () => {
      const packageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: ["typescript"],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.features.typescript).toBe(false);
    });
  });

  describe("Docker Detection", () => {
    it("should detect Docker from Dockerfile", () => {
      const packageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, ["Dockerfile"]);

      expect(stack.features.docker).toBe(true);
    });

    it("should detect Docker from docker-compose.yml", () => {
      const packageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, ["docker-compose.yml"]);

      expect(stack.features.docker).toBe(true);
    });

    it("should detect Docker from docker-compose.yaml", () => {
      const packageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, ["docker-compose.yaml"]);

      expect(stack.features.docker).toBe(true);
    });
  });

  describe("Confidence Scoring", () => {
    it("should have higher confidence with framework and config", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["next", "react"],
        devDependencies: [],
        scripts: {},
      };

      const stackWithConfig = inferStack(packageScan, ["next.config.js"]);

      expect(stackWithConfig.confidence).toBeGreaterThan(0.5);
    });

    it("should have medium confidence with framework but no config", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["hono"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      // Hono has no config files, so confidence is based on package only
      expect(stack.confidence).toBeGreaterThan(0.3);
      expect(stack.confidence).toBeLessThan(0.7);
    });

    it("should have low confidence with no framework", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["react"],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.confidence).toBeLessThan(0.5);
    });

    it("should increase confidence with more features detected", () => {
      const minimalPackageScan: PackageScanResult = {
        dependencies: ["next"],
        devDependencies: [],
        scripts: {},
      };

      const richPackageScan: PackageScanResult = {
        dependencies: ["next", "@clerk/nextjs", "@supabase/supabase-js"],
        devDependencies: ["tailwindcss", "vitest"],
        scripts: {},
      };

      const minimalStack = inferStack(minimalPackageScan, ["next.config.js"]);
      const richStack = inferStack(richPackageScan, [
        "next.config.js",
        "tsconfig.json",
        "tailwind.config.js",
        "vitest.config.ts",
      ]);

      expect(richStack.confidence).toBeGreaterThan(minimalStack.confidence);
    });

    it("should return 0 confidence for empty project", () => {
      const packageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: [],
        scripts: {},
      };

      const stack = inferStack(packageScan, []);

      expect(stack.confidence).toBe(0);
    });

    it("should have higher confidence with package.json dependencies", () => {
      const emptyPackageScan: PackageScanResult = {
        dependencies: [],
        devDependencies: [],
        scripts: {},
      };

      const withDepsPackageScan: PackageScanResult = {
        dependencies: ["react"],
        devDependencies: ["typescript"],
        scripts: {},
      };

      const emptyStack = inferStack(emptyPackageScan, ["tsconfig.json"]);
      const withDepsStack = inferStack(withDepsPackageScan, ["tsconfig.json"]);

      expect(withDepsStack.confidence).toBeGreaterThan(emptyStack.confidence);
    });
  });

  describe("Full Stack Detection", () => {
    it("should detect complete Next.js stack", () => {
      const packageScan: PackageScanResult = {
        dependencies: [
          "next",
          "react",
          "@clerk/nextjs",
          "@supabase/supabase-js",
        ],
        devDependencies: ["typescript", "tailwindcss", "vitest"],
        scripts: {
          dev: "next dev",
          test: "vitest",
        },
      };

      const configFiles = [
        "next.config.js",
        "tsconfig.json",
        "tailwind.config.ts",
        "vitest.config.ts",
      ];

      const stack = inferStack(packageScan, configFiles);

      expect(stack.framework).toBe("nextjs");
      expect(stack.features.auth).toBe("clerk");
      expect(stack.features.database).toBe("supabase");
      expect(stack.features.styling).toBe("tailwind");
      expect(stack.features.testing).toBe("vitest");
      expect(stack.features.typescript).toBe(true);
      expect(stack.features.docker).toBe(false);
      expect(stack.confidence).toBeGreaterThan(0.8);
    });

    it("should detect complete Expo stack", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["expo", "react-native", "@clerk/clerk-expo", "firebase"],
        devDependencies: ["@testing-library/react-native"],
        scripts: {},
      };

      const configFiles = ["expo.config.js", "app.json"];

      const stack = inferStack(packageScan, configFiles);

      expect(stack.framework).toBe("expo");
      expect(stack.features.auth).toBe("clerk");
      expect(stack.features.database).toBe("firebase");
      expect(stack.confidence).toBeGreaterThan(0.7);
    });

    it("should detect complete API stack", () => {
      const packageScan: PackageScanResult = {
        dependencies: ["hono", "drizzle-orm", "better-sqlite3"],
        devDependencies: ["drizzle-kit", "vitest", "wrangler"],
        scripts: {
          dev: "wrangler dev",
        },
      };

      const configFiles = [
        "drizzle.config.ts",
        "vitest.config.ts",
        "tsconfig.json",
      ];

      const stack = inferStack(packageScan, configFiles);

      expect(stack.framework).toBe("hono");
      expect(stack.features.database).toBe("sqlite");
      expect(stack.features.testing).toBe("vitest");
      expect(stack.features.typescript).toBe(true);
      expect(stack.confidence).toBeGreaterThan(0.6);
    });
  });
});

// ============================================================================
// Full Detection Integration Tests
// ============================================================================

describe("detectStack (Full Integration)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should detect Next.js project with full stack", async () => {
    await writePackageJson(tempDir, {
      dependencies: {
        next: "^14.0.0",
        react: "^18.0.0",
        "@clerk/nextjs": "^4.0.0",
      },
      devDependencies: {
        typescript: "^5.0.0",
        tailwindcss: "^3.0.0",
      },
    });

    await createConfigFiles(tempDir, [
      "next.config.js",
      "tsconfig.json",
      "tailwind.config.ts",
    ]);

    const stack = await detectStack(tempDir);

    expect(stack.framework).toBe("nextjs");
    expect(stack.features.auth).toBe("clerk");
    expect(stack.features.styling).toBe("tailwind");
    expect(stack.features.typescript).toBe(true);
    expect(stack.confidence).toBeGreaterThan(0.7);
  });

  it("should detect Astro project", async () => {
    await writePackageJson(tempDir, {
      dependencies: {
        astro: "^4.0.0",
      },
      devDependencies: {
        typescript: "^5.0.0",
      },
    });

    await createConfigFiles(tempDir, ["astro.config.mjs", "tsconfig.json"]);

    const stack = await detectStack(tempDir);

    expect(stack.framework).toBe("astro");
    expect(stack.features.typescript).toBe(true);
    expect(stack.confidence).toBeGreaterThan(0.6);
  });

  it("should handle empty directory gracefully", async () => {
    const stack = await detectStack(tempDir);

    expect(stack.framework).toBeNull();
    expect(stack.features.auth).toBeNull();
    expect(stack.features.database).toBeNull();
    expect(stack.features.styling).toBeNull();
    expect(stack.features.testing).toBeNull();
    expect(stack.features.typescript).toBe(false);
    expect(stack.features.docker).toBe(false);
    expect(stack.confidence).toBe(0);
  });

  it("should detect project with Docker setup", async () => {
    await writePackageJson(tempDir, {
      dependencies: {
        next: "^14.0.0",
      },
    });

    await createConfigFiles(tempDir, [
      "next.config.js",
      "Dockerfile",
      "docker-compose.yml",
    ]);

    const stack = await detectStack(tempDir);

    expect(stack.framework).toBe("nextjs");
    expect(stack.features.docker).toBe(true);
  });

  it("should detect monorepo project structure", async () => {
    // Create a typical monorepo with workspace package.json
    await writePackageJson(tempDir, {
      dependencies: {
        next: "^14.0.0",
        hono: "^4.0.0",
      },
    });

    await createConfigFiles(tempDir, ["next.config.js"]);

    const stack = await detectStack(tempDir);

    // Should detect Next.js (first in framework rules)
    expect(stack.framework).toBe("nextjs");
  });
});
