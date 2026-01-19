/**
 * Tests for lefthook merge module
 * Tests progressive enhancement of lefthook configurations
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  parseExistingLefthook,
  detectConfiguredCategories,
  getCategoryForCommand,
  mergeHookCommands,
  mergeLefthookConfigs,
  serializeLefthookConfig,
  generateOrMergeLefthook,
  detectExistingHookSystem,
  type LefthookConfig,
  type LefthookHook,
  type LefthookCommand,
} from "../src/generators/lefthook-merge.js";

// ============================================================================
// Test Utilities
// ============================================================================

async function createTempDir(): Promise<string> {
  const prefix = join(tmpdir(), "bootstralph-lefthook-test-");
  return await mkdtemp(prefix);
}

async function writeLefthookYml(dir: string, content: string): Promise<void> {
  const lefthookPath = join(dir, "lefthook.yml");
  await writeFile(lefthookPath, content);
}

// ============================================================================
// parseExistingLefthook Tests
// ============================================================================

describe("parseExistingLefthook", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should return null when no lefthook.yml exists", async () => {
    const result = await parseExistingLefthook(tempDir);
    expect(result).toBeNull();
  });

  it("should parse valid lefthook.yml", async () => {
    await writeLefthookYml(
      tempDir,
      `
pre-commit:
  parallel: true
  commands:
    lint:
      glob: "*.ts"
      run: npm run lint
`,
    );

    const result = await parseExistingLefthook(tempDir);

    expect(result).not.toBeNull();
    expect(result!["pre-commit"]).toBeDefined();
    expect(result!["pre-commit"]!.parallel).toBe(true);
    expect(result!["pre-commit"]!.commands!["lint"]).toBeDefined();
  });

  it("should return null for invalid YAML", async () => {
    await writeLefthookYml(
      tempDir,
      `
this is not: valid: yaml: content
  - with weird indentation
`,
    );

    const result = await parseExistingLefthook(tempDir);
    expect(result).toBeNull();
  });
});

// ============================================================================
// detectConfiguredCategories Tests
// ============================================================================

describe("detectConfiguredCategories", () => {
  it("should detect formatting by command name", () => {
    const hook: LefthookHook = {
      commands: {
        format: { run: "npm run format" },
      },
    };

    const categories = detectConfiguredCategories(hook);
    expect(categories.has("formatting")).toBe(true);
  });

  it("should detect formatting by prettier in run command", () => {
    const hook: LefthookHook = {
      commands: {
        "code-style": { run: "npx prettier --write {staged_files}" },
      },
    };

    const categories = detectConfiguredCategories(hook);
    expect(categories.has("formatting")).toBe(true);
  });

  it("should detect linting by command name", () => {
    const hook: LefthookHook = {
      commands: {
        lint: { run: "npm run lint" },
      },
    };

    const categories = detectConfiguredCategories(hook);
    expect(categories.has("linting")).toBe(true);
  });

  it("should detect linting by eslint in run command", () => {
    const hook: LefthookHook = {
      commands: {
        "check-code": { run: "npx eslint --fix {staged_files}" },
      },
    };

    const categories = detectConfiguredCategories(hook);
    expect(categories.has("linting")).toBe(true);
  });

  it("should detect biome as both linting and formatting", () => {
    const hook: LefthookHook = {
      commands: {
        biome: { run: "npx biome check --write {staged_files}" },
      },
    };

    const categories = detectConfiguredCategories(hook);
    expect(categories.has("linting")).toBe(true);
    expect(categories.has("formatting")).toBe(true);
  });

  it("should detect typecheck by command name", () => {
    const hook: LefthookHook = {
      commands: {
        typecheck: { run: "tsc --noEmit" },
      },
    };

    const categories = detectConfiguredCategories(hook);
    expect(categories.has("typecheck")).toBe(true);
  });

  it("should detect testing by command name", () => {
    const hook: LefthookHook = {
      commands: {
        test: { run: "npm test" },
      },
    };

    const categories = detectConfiguredCategories(hook);
    expect(categories.has("testing")).toBe(true);
  });

  it("should detect testing by vitest in run command", () => {
    const hook: LefthookHook = {
      commands: {
        "run-tests": { run: "bunx vitest run" },
      },
    };

    const categories = detectConfiguredCategories(hook);
    expect(categories.has("testing")).toBe(true);
  });

  it("should detect lockfile by command name", () => {
    const hook: LefthookHook = {
      commands: {
        lockfile: { run: "bun install --lockfile-only" },
      },
    };

    const categories = detectConfiguredCategories(hook);
    expect(categories.has("lockfile")).toBe(true);
  });

  it("should detect gitleaks by command name", () => {
    const hook: LefthookHook = {
      commands: {
        gitleaks: { run: "gitleaks detect" },
      },
    };

    const categories = detectConfiguredCategories(hook);
    expect(categories.has("secrets")).toBe(true);
  });

  it("should detect multiple categories", () => {
    const hook: LefthookHook = {
      commands: {
        format: { run: "prettier --write" },
        lint: { run: "eslint --fix" },
        typecheck: { run: "tsc --noEmit" },
        test: { run: "vitest run" },
      },
    };

    const categories = detectConfiguredCategories(hook);
    expect(categories.has("formatting")).toBe(true);
    expect(categories.has("linting")).toBe(true);
    expect(categories.has("typecheck")).toBe(true);
    expect(categories.has("testing")).toBe(true);
  });

  it("should return empty set for empty hook", () => {
    const hook: LefthookHook = {};
    const categories = detectConfiguredCategories(hook);
    expect(categories.size).toBe(0);
  });

  it("should return empty set for hook with empty commands", () => {
    const hook: LefthookHook = { commands: {} };
    const categories = detectConfiguredCategories(hook);
    expect(categories.size).toBe(0);
  });
});

// ============================================================================
// getCategoryForCommand Tests
// ============================================================================

describe("getCategoryForCommand", () => {
  it("should return formatting for format command", () => {
    const command: LefthookCommand = { run: "npm run format" };
    expect(getCategoryForCommand("format", command)).toBe("formatting");
  });

  it("should return linting for lint command", () => {
    const command: LefthookCommand = { run: "npm run lint" };
    expect(getCategoryForCommand("lint", command)).toBe("linting");
  });

  it("should return typecheck for typecheck command", () => {
    const command: LefthookCommand = { run: "tsc --noEmit" };
    expect(getCategoryForCommand("typecheck", command)).toBe("typecheck");
  });

  it("should return testing for test command", () => {
    const command: LefthookCommand = { run: "npm test" };
    expect(getCategoryForCommand("test", command)).toBe("testing");
  });

  it("should return formatting for prettier in run command", () => {
    const command: LefthookCommand = { run: "npx prettier --write" };
    expect(getCategoryForCommand("code-style", command)).toBe("formatting");
  });

  it("should return null for unrecognized command", () => {
    const command: LefthookCommand = { run: "echo hello" };
    expect(getCategoryForCommand("custom-hook", command)).toBeNull();
  });
});

// ============================================================================
// mergeHookCommands Tests
// ============================================================================

describe("mergeHookCommands", () => {
  it("should create new hook when existing is undefined", () => {
    const newCommands: Record<string, LefthookCommand> = {
      format: { run: "npm run format" },
    };

    const result = mergeHookCommands(undefined, newCommands);

    expect(result.commands).toEqual(newCommands);
    expect(result.parallel).toBe(true);
  });

  it("should preserve existing commands", () => {
    const existing: LefthookHook = {
      parallel: false,
      commands: {
        "custom-hook": { run: "custom script" },
      },
    };

    const newCommands: Record<string, LefthookCommand> = {
      format: { run: "npm run format" },
    };

    const result = mergeHookCommands(existing, newCommands);

    expect(result.commands!["custom-hook"]).toBeDefined();
    expect(result.parallel).toBe(false);
  });

  it("should not add new command if same name exists", () => {
    const existing: LefthookHook = {
      commands: {
        format: { run: "custom format command" },
      },
    };

    const newCommands: Record<string, LefthookCommand> = {
      format: { run: "npm run format" },
    };

    const result = mergeHookCommands(existing, newCommands);

    expect(result.commands!["format"].run).toBe("custom format command");
  });

  it("should not add format command if prettier already configured", () => {
    const existing: LefthookHook = {
      commands: {
        prettier: { run: "npx prettier --write {staged_files}" },
      },
    };

    const newCommands: Record<string, LefthookCommand> = {
      format: { run: "npm run format" },
    };

    const result = mergeHookCommands(existing, newCommands);

    // Should only have prettier, not format
    expect(Object.keys(result.commands!)).toEqual(["prettier"]);
  });

  it("should not add lint command if eslint already configured", () => {
    const existing: LefthookHook = {
      commands: {
        "code-quality": { run: "npx eslint --fix {staged_files}" },
      },
    };

    const newCommands: Record<string, LefthookCommand> = {
      lint: { run: "npm run lint" },
    };

    const result = mergeHookCommands(existing, newCommands);

    // Should only have code-quality, not lint
    expect(Object.keys(result.commands!)).toEqual(["code-quality"]);
  });

  it("should not add lint or format if biome is configured", () => {
    const existing: LefthookHook = {
      commands: {
        biome: { run: "npx biome check --write {staged_files}" },
      },
    };

    const newCommands: Record<string, LefthookCommand> = {
      lint: { run: "npm run lint" },
      format: { run: "npm run format" },
    };

    const result = mergeHookCommands(existing, newCommands);

    // Should only have biome
    expect(Object.keys(result.commands!)).toEqual(["biome"]);
  });

  it("should add unrelated commands", () => {
    const existing: LefthookHook = {
      commands: {
        format: { run: "prettier --write" },
      },
    };

    const newCommands: Record<string, LefthookCommand> = {
      "skills-sync": { run: "bunx bootstralph sync --quiet" },
    };

    const result = mergeHookCommands(existing, newCommands);

    expect(result.commands!["format"]).toBeDefined();
    expect(result.commands!["skills-sync"]).toBeDefined();
  });
});

// ============================================================================
// mergeLefthookConfigs Tests
// ============================================================================

describe("mergeLefthookConfigs", () => {
  it("should return additions when existing is null", () => {
    const additions: LefthookConfig = {
      "pre-commit": {
        parallel: true,
        commands: {
          format: { run: "npm run format" },
        },
      },
    };

    const result = mergeLefthookConfigs(null, additions);

    expect(result).toEqual(additions);
  });

  it("should merge pre-commit commands", () => {
    const existing: LefthookConfig = {
      "pre-commit": {
        parallel: false,
        commands: {
          "custom-hook": { run: "custom script" },
        },
      },
    };

    const additions: LefthookConfig = {
      "pre-commit": {
        parallel: true,
        commands: {
          format: { run: "npm run format" },
        },
      },
    };

    const result = mergeLefthookConfigs(existing, additions);

    expect(result["pre-commit"]!.commands!["custom-hook"]).toBeDefined();
    expect(result["pre-commit"]!.commands!["format"]).toBeDefined();
  });

  it("should preserve pre-push commands", () => {
    const existing: LefthookConfig = {
      "pre-commit": {
        commands: { lint: { run: "npm run lint" } },
      },
      "pre-push": {
        commands: { test: { run: "npm test" } },
      },
    };

    const additions: LefthookConfig = {
      "pre-commit": {
        commands: { format: { run: "npm run format" } },
      },
    };

    const result = mergeLefthookConfigs(existing, additions);

    expect(result["pre-push"]!.commands!["test"]).toBeDefined();
  });

  it("should preserve commit-msg hooks", () => {
    const existing: LefthookConfig = {
      "commit-msg": {
        commands: {
          "lint-message": { run: "commitlint --edit {1}" },
        },
      },
    };

    const additions: LefthookConfig = {
      "pre-commit": {
        commands: { format: { run: "npm run format" } },
      },
    };

    const result = mergeLefthookConfigs(existing, additions);

    expect(result["commit-msg"]!.commands!["lint-message"]).toBeDefined();
  });

  it("should preserve prepare-commit-msg hooks", () => {
    const existing: LefthookConfig = {
      "prepare-commit-msg": {
        commands: {
          "generate-message": { run: "custom script" },
        },
      },
    };

    const additions: LefthookConfig = {
      "pre-commit": {
        commands: { format: { run: "npm run format" } },
      },
    };

    const result = mergeLefthookConfigs(existing, additions);

    expect(
      result["prepare-commit-msg"]!.commands!["generate-message"],
    ).toBeDefined();
  });
});

// ============================================================================
// serializeLefthookConfig Tests
// ============================================================================

describe("serializeLefthookConfig", () => {
  it("should serialize config to YAML with header", () => {
    const config: LefthookConfig = {
      "pre-commit": {
        parallel: true,
        commands: {
          format: { run: "npm run format" },
        },
      },
    };

    const yaml = serializeLefthookConfig(config);

    expect(yaml).toContain("# Generated by bootstralph");
    expect(yaml).toContain("pre-commit:");
    expect(yaml).toContain("parallel: true");
    expect(yaml).toContain("format:");
    expect(yaml).toContain("run: npm run format");
  });
});

// ============================================================================
// generateOrMergeLefthook Tests
// ============================================================================

describe("generateOrMergeLefthook", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should create new config when none exists", async () => {
    const result = await generateOrMergeLefthook({
      projectRoot: tempDir,
      preCommitCommands: {
        format: { run: "npm run format" },
      },
    });

    expect(result.config!["pre-commit"]!.commands!["format"]).toBeDefined();
  });

  it("should merge with existing config", async () => {
    await writeLefthookYml(
      tempDir,
      `
pre-commit:
  parallel: false
  commands:
    custom-hook:
      run: custom script
`,
    );

    const result = await generateOrMergeLefthook({
      projectRoot: tempDir,
      preCommitCommands: {
        format: { run: "npm run format" },
      },
    });

    expect(
      result.config!["pre-commit"]!.commands!["custom-hook"],
    ).toBeDefined();
    expect(result.config!["pre-commit"]!.commands!["format"]).toBeDefined();
  });

  it("should respect force option", async () => {
    await writeLefthookYml(
      tempDir,
      `
pre-commit:
  commands:
    custom-hook:
      run: custom script
`,
    );

    const result = await generateOrMergeLefthook({
      projectRoot: tempDir,
      preCommitCommands: {
        format: { run: "npm run format" },
      },
      force: true,
    });

    // Force mode should not include existing commands
    expect(
      result.config!["pre-commit"]!.commands!["custom-hook"],
    ).toBeUndefined();
    expect(result.config!["pre-commit"]!.commands!["format"]).toBeDefined();
  });

  it("should not add duplicate categories", async () => {
    await writeLefthookYml(
      tempDir,
      `
pre-commit:
  commands:
    prettier:
      run: npx prettier --write {staged_files}
    eslint:
      run: npx eslint --fix {staged_files}
`,
    );

    const result = await generateOrMergeLefthook({
      projectRoot: tempDir,
      preCommitCommands: {
        format: { run: "npm run format" },
        lint: { run: "npm run lint" },
        "skills-sync": { run: "bunx bootstralph sync" },
      },
    });

    // Should not add format (prettier exists) or lint (eslint exists)
    // But should add skills-sync
    expect(result.config!["pre-commit"]!.commands!["prettier"]).toBeDefined();
    expect(result.config!["pre-commit"]!.commands!["eslint"]).toBeDefined();
    expect(result.config!["pre-commit"]!.commands!["format"]).toBeUndefined();
    expect(result.config!["pre-commit"]!.commands!["lint"]).toBeUndefined();
    expect(
      result.config!["pre-commit"]!.commands!["skills-sync"],
    ).toBeDefined();
  });
});

// ============================================================================
// detectExistingHookSystem Tests
// ============================================================================

describe("detectExistingHookSystem", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should return null when no hook system is detected", async () => {
    const result = await detectExistingHookSystem(tempDir);
    expect(result).toBeNull();
  });

  it("should detect husky directory", async () => {
    const huskyDir = join(tempDir, ".husky");
    await mkdir(huskyDir);

    const result = await detectExistingHookSystem(tempDir);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("husky");
    expect(result!.indicator).toBe(".husky/ directory");
  });

  it("should detect pre-commit config yaml", async () => {
    const configPath = join(tempDir, ".pre-commit-config.yaml");
    await writeFile(configPath, "repos: []");

    const result = await detectExistingHookSystem(tempDir);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("pre-commit");
    expect(result!.indicator).toBe(".pre-commit-config.yaml");
  });

  it("should detect pre-commit config yml", async () => {
    const configPath = join(tempDir, ".pre-commit-config.yml");
    await writeFile(configPath, "repos: []");

    const result = await detectExistingHookSystem(tempDir);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("pre-commit");
    expect(result!.indicator).toBe(".pre-commit-config.yml");
  });

  it("should detect simple-git-hooks in package.json", async () => {
    const packageJson = {
      name: "test-project",
      "simple-git-hooks": {
        "pre-commit": "npm test",
      },
    };
    await writeFile(join(tempDir, "package.json"), JSON.stringify(packageJson));

    const result = await detectExistingHookSystem(tempDir);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("simple-git-hooks");
    expect(result!.indicator).toBe("simple-git-hooks in package.json");
  });

  it("should detect yorkie in devDependencies", async () => {
    const packageJson = {
      name: "test-project",
      devDependencies: {
        yorkie: "^2.0.0",
      },
    };
    await writeFile(join(tempDir, "package.json"), JSON.stringify(packageJson));

    const result = await detectExistingHookSystem(tempDir);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("yorkie");
    expect(result!.indicator).toBe("yorkie in package.json dependencies");
  });

  it("should not detect husky from package.json alone (only directory)", async () => {
    // Note: We only detect husky via .husky/ directory, not package.json
    // This is intentional to avoid false positives
    const packageJson = {
      name: "test-project",
      devDependencies: {
        husky: "^8.0.0",
      },
    };
    await writeFile(join(tempDir, "package.json"), JSON.stringify(packageJson));

    const result = await detectExistingHookSystem(tempDir);
    expect(result).toBeNull();
  });

  it("should prioritize husky over other detections", async () => {
    // If multiple hook systems are present, husky is detected first
    const huskyDir = join(tempDir, ".husky");
    await mkdir(huskyDir);
    await writeFile(join(tempDir, ".pre-commit-config.yaml"), "repos: []");

    const result = await detectExistingHookSystem(tempDir);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("husky");
  });
});

// ============================================================================
// generateOrMergeLefthook with hook system detection Tests
// ============================================================================

describe("generateOrMergeLefthook with hook system detection", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should skip generation when husky is present", async () => {
    const huskyDir = join(tempDir, ".husky");
    await mkdir(huskyDir);

    const result = await generateOrMergeLefthook({
      projectRoot: tempDir,
      preCommitCommands: {
        format: { run: "npm run format" },
      },
    });

    expect(result.config).toBeNull();
    expect(result.skipped).toBeDefined();
    expect(result.skipped!.hookSystem.name).toBe("husky");
  });

  it("should skip generation when pre-commit is present", async () => {
    await writeFile(join(tempDir, ".pre-commit-config.yaml"), "repos: []");

    const result = await generateOrMergeLefthook({
      projectRoot: tempDir,
      preCommitCommands: {
        format: { run: "npm run format" },
      },
    });

    expect(result.config).toBeNull();
    expect(result.skipped).toBeDefined();
    expect(result.skipped!.hookSystem.name).toBe("pre-commit");
  });

  it("should generate config when force is true even with husky", async () => {
    const huskyDir = join(tempDir, ".husky");
    await mkdir(huskyDir);

    const result = await generateOrMergeLefthook({
      projectRoot: tempDir,
      preCommitCommands: {
        format: { run: "npm run format" },
      },
      force: true,
    });

    expect(result.config).not.toBeNull();
    expect(result.skipped).toBeUndefined();
    expect(result.config!["pre-commit"]!.commands!["format"]).toBeDefined();
  });

  it("should generate config when skipIfOtherHookSystem is false", async () => {
    const huskyDir = join(tempDir, ".husky");
    await mkdir(huskyDir);

    const result = await generateOrMergeLefthook({
      projectRoot: tempDir,
      preCommitCommands: {
        format: { run: "npm run format" },
      },
      skipIfOtherHookSystem: false,
    });

    expect(result.config).not.toBeNull();
    expect(result.skipped).toBeUndefined();
  });

  it("should generate config normally when no other hook system is present", async () => {
    const result = await generateOrMergeLefthook({
      projectRoot: tempDir,
      preCommitCommands: {
        format: { run: "npm run format" },
      },
    });

    expect(result.config).not.toBeNull();
    expect(result.skipped).toBeUndefined();
    expect(result.config!["pre-commit"]!.commands!["format"]).toBeDefined();
  });
});

// ============================================================================
// Integration Test: Real-world scenario
// ============================================================================

describe("Integration: Real-world lefthook merge scenario", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should preserve complex existing config", async () => {
    // This is similar to the user's original config
    const existingConfig = `
pre-commit:
  parallel: false
  commands:
    lockfile:
      run: bun install --lockfile-only --no-save 2>/dev/null && git diff --quiet bun.lock || (echo "Lockfile was out of sync, auto-fixing..." && git add bun.lock)
      skip:
        - merge
        - rebase

    gitleaks:
      glob: '*.{ts,tsx,js,json,env,yaml,yml,toml,nix}'
      run: command -v gitleaks &>/dev/null && bun run security:secrets:staged || echo "gitleaks not found (run inside devenv shell)"
      skip:
        - merge
        - rebase

    format:
      glob: '*.{ts,tsx,js,jsx,json,md,yaml,yml}'
      run: bun run format -- --no-error-on-unmatched-pattern {staged_files}
      stage_fixed: true

    lint:
      only:
        - glob: '**/*.{ts,tsx,js,jsx}'
      run: bun run lint:check --force

    knip:
      only:
        - glob: '**/*.{ts,tsx,js,jsx}'
        - glob: 'package.json'
      run: bun run knip
      stage_fixed: true

    typecheck:
      only:
        - glob: '**/*.{ts,tsx}'
      run: bun run typecheck

    test:
      only:
        - glob: '**/*.{ts,tsx}'
      run: bun run test

pre-push:
  parallel: true
  commands:
    trivy-iac:
      only:
        - glob: 'infra/**/*'
      run: command -v trivy &>/dev/null && bun run security:iac || echo "trivy not found"

commit-msg:
  commands:
    lint-message:
      run: bunx commitlint --edit {1}
`;

    await writeLefthookYml(tempDir, existingConfig);

    const result = await generateOrMergeLefthook({
      projectRoot: tempDir,
      preCommitCommands: {
        lockfile: { run: "bun install --frozen-lockfile" },
        format: { run: "bun run format" },
        lint: { run: "bun run lint" },
        typecheck: { run: "bun run typecheck" },
        test: { run: "bun run test" },
        "skills-sync": { run: "bunx bootstralph sync --quiet" },
      },
    });

    // All existing commands should be preserved
    expect(result.config!["pre-commit"]!.commands!["lockfile"]).toBeDefined();
    expect(result.config!["pre-commit"]!.commands!["gitleaks"]).toBeDefined();
    expect(result.config!["pre-commit"]!.commands!["format"]).toBeDefined();
    expect(result.config!["pre-commit"]!.commands!["lint"]).toBeDefined();
    expect(result.config!["pre-commit"]!.commands!["knip"]).toBeDefined();
    expect(result.config!["pre-commit"]!.commands!["typecheck"]).toBeDefined();
    expect(result.config!["pre-commit"]!.commands!["test"]).toBeDefined();

    // skills-sync should be added (new category)
    expect(
      result.config!["pre-commit"]!.commands!["skills-sync"],
    ).toBeDefined();

    // pre-push should be preserved
    expect(result.config!["pre-push"]!.commands!["trivy-iac"]).toBeDefined();

    // commit-msg should be preserved
    expect(
      result.config!["commit-msg"]!.commands!["lint-message"],
    ).toBeDefined();

    // Original commands should keep their original run scripts
    expect(result.config!["pre-commit"]!.commands!["lockfile"].run).toContain(
      "git diff --quiet bun.lock",
    );
    expect(result.config!["pre-commit"]!.commands!["gitleaks"].run).toContain(
      "gitleaks",
    );
  });
});
