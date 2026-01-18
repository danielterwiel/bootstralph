import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  PrdManager,
  getDefaultPrdManager,
  resetDefaultPrdManager,
  type ExtendedPrd,
  type ImplementationTask,
  type AddIssueOptions,
} from "../../src/ralph/prd-manager.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const createTestPrd = (): ExtendedPrd => ({
  name: "test-project",
  version: "0.1.0",
  description: "Test PRD for unit tests",
  status: "planning",
  implementation_tasks: [
    {
      id: "impl-001",
      phase: 1,
      task: "First task",
      status: "completed",
      passes: true,
      files: ["src/index.ts"],
    },
    {
      id: "impl-002",
      phase: 1,
      task: "Second task",
      status: "in_progress",
      files: ["src/utils.ts"],
    },
    {
      id: "impl-003",
      phase: 2,
      task: "Third task",
      status: "pending",
      files: ["src/components.ts"],
    },
    {
      id: "impl-004",
      phase: 2,
      task: "Fourth task",
      status: "pending",
    },
  ],
  metadata: {
    createdAt: "2026-01-17T10:00:00Z",
    updatedAt: "2026-01-17T10:00:00Z",
  },
});

const createUserStoriesPrd = (): ExtendedPrd => ({
  name: "user-stories-project",
  version: "0.1.0",
  description: "Test PRD with user stories",
  status: "in_progress",
  userStories: [
    {
      id: "US-001",
      title: "First story",
      description: "First user story description",
      acceptanceCriteria: ["AC1", "AC2"],
      priority: 1,
      passes: true,
    },
    {
      id: "US-002",
      title: "Second story",
      description: "Second user story description",
      acceptanceCriteria: ["AC1"],
      priority: 2,
      passes: false,
    },
    {
      id: "US-003",
      title: "Third story",
      description: "Third user story description",
      acceptanceCriteria: ["AC1"],
      priority: 3,
      passes: false,
    },
  ],
});

const createPrdWithReviewTasks = (): ExtendedPrd => ({
  name: "review-project",
  version: "0.1.0",
  description: "Test PRD with review tasks",
  status: "planning",
  implementation_tasks: [],
  review_tasks: [
    {
      id: "review-001",
      category: "compatibility",
      task: "Verify library compatibility",
      check: "Does library X work with Y?",
      status: "pending",
    },
    {
      id: "review-002",
      category: "security",
      task: "Check security vulnerabilities",
      check: "Are there known CVEs?",
      status: "completed",
      finding: "No known vulnerabilities",
      actionRequired: null,
    },
  ],
});

// ============================================================================
// Test Setup
// ============================================================================

let testDir: string;
let prdManager: PrdManager;

beforeEach(async () => {
  // Create unique test directory
  testDir = join(tmpdir(), `prd-manager-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });

  // Create fresh manager instance
  prdManager = new PrdManager({ saveDebounceMs: 10 }); // Short debounce for tests
});

afterEach(async () => {
  // Cleanup
  await prdManager.destroy();
  resetDefaultPrdManager();

  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// Helper to write test PRD file
async function writePrdFile(prd: ExtendedPrd, filename = "prd-test.json"): Promise<string> {
  const filePath = join(testDir, filename);
  await writeFile(filePath, JSON.stringify(prd, null, 2));
  return filePath;
}

// Helper to wait for debounced save
async function waitForSave(ms = 50): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Constructor Tests
// ============================================================================

describe("PrdManager constructor", () => {
  it("should create instance with default options", () => {
    const manager = new PrdManager();
    expect(manager.getPrd()).toBeNull();
    expect(manager.getFilePath()).toBeNull();
    expect(manager.isDirty()).toBe(false);
  });

  it("should accept custom saveDebounceMs", () => {
    const manager = new PrdManager({ saveDebounceMs: 1000 });
    expect(manager).toBeInstanceOf(PrdManager);
  });

  it("should accept onUpdate callback", () => {
    const onUpdate = vi.fn();
    const manager = new PrdManager({ onUpdate });
    expect(manager).toBeInstanceOf(PrdManager);
  });
});

// ============================================================================
// Load/Save Tests
// ============================================================================

describe("PrdManager.load", () => {
  it("should load PRD from file", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);

    const loaded = await prdManager.load(filePath);

    expect(loaded.name).toBe("test-project");
    expect(loaded.implementation_tasks).toHaveLength(4);
    expect(prdManager.getFilePath()).toBe(filePath);
    expect(prdManager.isDirty()).toBe(false);
  });

  it("should load PRD with user stories", async () => {
    const testPrd = createUserStoriesPrd();
    const filePath = await writePrdFile(testPrd);

    const loaded = await prdManager.load(filePath);

    expect(loaded.name).toBe("user-stories-project");
    expect(loaded.userStories).toHaveLength(3);
  });

  it("should throw error for non-existent file", async () => {
    await expect(prdManager.load("/nonexistent/path.json")).rejects.toThrow();
  });

  it("should throw error for invalid JSON", async () => {
    const filePath = join(testDir, "invalid.json");
    await writeFile(filePath, "not valid json");

    await expect(prdManager.load(filePath)).rejects.toThrow();
  });
});

describe("PrdManager.save", () => {
  it("should save PRD to file", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    // Modify PRD
    const prd = prdManager.getPrd()!;
    prd.description = "Modified description";

    await prdManager.save();

    // Read back and verify
    const content = await readFile(filePath, "utf-8");
    const saved = JSON.parse(content);
    expect(saved.description).toBe("Modified description");
  });

  it("should update metadata.updatedAt on save", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const originalUpdatedAt = prdManager.getPrd()!.metadata?.updatedAt;

    // Wait a bit to ensure timestamp differs
    await new Promise((resolve) => setTimeout(resolve, 10));

    await prdManager.save();

    const content = await readFile(filePath, "utf-8");
    const saved = JSON.parse(content);
    expect(saved.metadata.updatedAt).not.toBe(originalUpdatedAt);
  });

  it("should throw error when no PRD loaded", async () => {
    await expect(prdManager.save()).rejects.toThrow("No PRD loaded");
  });

  it("should create parent directory if it doesn't exist", async () => {
    const testPrd = createTestPrd();
    const nestedPath = join(testDir, "nested", "deep", "prd.json");

    // Load from existing file first
    const existingPath = await writePrdFile(testPrd);
    await prdManager.load(existingPath);

    // Change file path by loading a new manager
    const manager2 = new PrdManager();
    await manager2.load(existingPath);

    // We can't change filePath directly, but the save function creates directories
    // Let's test through the static create method instead
  });
});

describe("PrdManager auto-save", () => {
  it("should schedule save on modification", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    prdManager.addIssue({ title: "New task" });

    expect(prdManager.isDirty()).toBe(true);

    // Wait for debounced save
    await waitForSave();

    expect(prdManager.isDirty()).toBe(false);

    // Verify file was updated
    const content = await readFile(filePath, "utf-8");
    const saved = JSON.parse(content);
    expect(saved.implementation_tasks).toHaveLength(5);
  });

  it("should call onUpdate callback on modification", async () => {
    const onUpdate = vi.fn();
    const manager = new PrdManager({ onUpdate, saveDebounceMs: 10 });

    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await manager.load(filePath);

    manager.addIssue({ title: "New task" });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      name: "test-project",
    }));

    await manager.destroy();
  });

  it("should flush pending saves immediately", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    prdManager.addIssue({ title: "New task" });
    expect(prdManager.isDirty()).toBe(true);

    await prdManager.flush();

    expect(prdManager.isDirty()).toBe(false);
  });
});

// ============================================================================
// Task Retrieval Tests
// ============================================================================

describe("PrdManager.getAllTasks", () => {
  it("should return implementation_tasks when present", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const tasks = prdManager.getAllTasks();

    expect(tasks).toHaveLength(4);
    expect(tasks[0].id).toBe("impl-001");
  });

  it("should return userStories when no implementation_tasks", async () => {
    const testPrd = createUserStoriesPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const tasks = prdManager.getAllTasks();

    expect(tasks).toHaveLength(3);
    expect(tasks[0].id).toBe("US-001");
  });

  it("should return empty array when no PRD loaded", () => {
    const tasks = prdManager.getAllTasks();
    expect(tasks).toEqual([]);
  });
});

describe("PrdManager.getTask", () => {
  it("should find task by ID", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const task = prdManager.getTask("impl-002");

    expect(task).toBeDefined();
    expect((task as ImplementationTask).task).toBe("Second task");
  });

  it("should return undefined for non-existent ID", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const task = prdManager.getTask("impl-999");

    expect(task).toBeUndefined();
  });
});

describe("PrdManager.getNextTask", () => {
  it("should return next pending task sorted by phase then ID", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const next = prdManager.getNextTask();

    // impl-002 is in_progress (phase 1), should come before impl-003 (phase 2 pending)
    expect(next?.id).toBe("impl-002");
  });

  it("should return next pending user story by priority", async () => {
    const testPrd = createUserStoriesPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const next = prdManager.getNextTask();

    // US-002 has priority 2, US-003 has priority 3
    expect(next?.id).toBe("US-002");
  });

  it("should return undefined when all tasks complete", async () => {
    const testPrd = createTestPrd();
    testPrd.implementation_tasks!.forEach((t) => {
      t.status = "completed";
    });
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const next = prdManager.getNextTask();

    expect(next).toBeUndefined();
  });

  it("should return undefined when no PRD loaded", () => {
    const next = prdManager.getNextTask();
    expect(next).toBeUndefined();
  });
});

describe("PrdManager.getPendingTasks", () => {
  it("should return pending and in_progress tasks", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const pending = prdManager.getPendingTasks();

    expect(pending).toHaveLength(3); // impl-002 (in_progress), impl-003 (pending), impl-004 (pending)
    expect(pending.map((t) => t.id)).toContain("impl-002");
    expect(pending.map((t) => t.id)).toContain("impl-003");
    expect(pending.map((t) => t.id)).toContain("impl-004");
  });

  it("should return incomplete user stories", async () => {
    const testPrd = createUserStoriesPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const pending = prdManager.getPendingTasks();

    expect(pending).toHaveLength(2); // US-002, US-003
  });
});

describe("PrdManager.getCompletedTasks", () => {
  it("should return completed implementation tasks", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const completed = prdManager.getCompletedTasks();

    expect(completed).toHaveLength(1);
    expect(completed[0].id).toBe("impl-001");
  });

  it("should return passing user stories", async () => {
    const testPrd = createUserStoriesPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const completed = prdManager.getCompletedTasks();

    expect(completed).toHaveLength(1);
    expect(completed[0].id).toBe("US-001");
  });
});

// ============================================================================
// Progress Tests
// ============================================================================

describe("PrdManager.getProgress", () => {
  it("should calculate progress for implementation tasks", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const progress = prdManager.getProgress();

    expect(progress.total).toBe(4);
    expect(progress.completed).toBe(1);
    expect(progress.remaining).toBe(3);
    expect(progress.percentage).toBe(25);
  });

  it("should calculate progress for user stories", async () => {
    const testPrd = createUserStoriesPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const progress = prdManager.getProgress();

    expect(progress.total).toBe(3);
    expect(progress.completed).toBe(1);
    expect(progress.remaining).toBe(2);
    expect(progress.percentage).toBe(33);
  });

  it("should return zeros when no PRD loaded", () => {
    const progress = prdManager.getProgress();

    expect(progress.total).toBe(0);
    expect(progress.completed).toBe(0);
    expect(progress.remaining).toBe(0);
    expect(progress.percentage).toBe(0);
  });
});

describe("PrdManager.isComplete", () => {
  it("should return false when tasks remain", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    expect(prdManager.isComplete()).toBe(false);
  });

  it("should return true when all tasks complete", async () => {
    const testPrd = createTestPrd();
    testPrd.implementation_tasks!.forEach((t) => {
      t.status = "completed";
    });
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    expect(prdManager.isComplete()).toBe(true);
  });

  it("should return true when all user stories pass", async () => {
    const testPrd = createUserStoriesPrd();
    testPrd.userStories!.forEach((s) => {
      s.passes = true;
    });
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    expect(prdManager.isComplete()).toBe(true);
  });

  it("should return false when no PRD loaded", () => {
    expect(prdManager.isComplete()).toBe(false);
  });
});

// ============================================================================
// CRUD Operations Tests
// ============================================================================

describe("PrdManager.addIssue", () => {
  it("should add new implementation task", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.addIssue({
      title: "New task",
      description: "Task description",
      files: ["src/new.ts"],
    });

    expect(result.success).toBe(true);
    expect(result.taskId).toBe("impl-005");
    expect(result.message).toContain("New task");

    const task = prdManager.getTask("impl-005") as ImplementationTask;
    expect(task.task).toBe("New task");
    expect(task.description).toBe("Task description");
    expect(task.files).toEqual(["src/new.ts"]);
    expect(task.status).toBe("pending");
    expect(task.phase).toBe(2); // Max existing phase
  });

  it("should add new user story", async () => {
    const testPrd = createUserStoriesPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.addIssue({
      title: "New story",
      description: "Story description",
    });

    expect(result.success).toBe(true);
    expect(result.taskId).toBe("US-004");

    const prd = prdManager.getPrd()!;
    const story = prd.userStories!.find((s) => s.id === "US-004");
    expect(story?.title).toBe("New story");
    expect(story?.priority).toBe(4); // Max existing + 1
    expect(story?.passes).toBe(false);
  });

  it("should use specified phase", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.addIssue({
      title: "Phase 5 task",
      phase: 5,
    });

    expect(result.success).toBe(true);
    const task = prdManager.getTask(result.taskId!) as ImplementationTask;
    expect(task.phase).toBe(5);
  });

  it("should use specified priority for user stories", async () => {
    const testPrd = createUserStoriesPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.addIssue({
      title: "High priority story",
      priority: 0, // Highest priority
    });

    expect(result.success).toBe(true);
    const prd = prdManager.getPrd()!;
    const story = prd.userStories!.find((s) => s.id === result.taskId);
    expect(story?.priority).toBe(0);
  });

  it("should fail when no PRD loaded", () => {
    const result = prdManager.addIssue({ title: "Test" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("NO_PRD");
  });

  it("should trigger auto-save", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    prdManager.addIssue({ title: "New task" });

    expect(prdManager.isDirty()).toBe(true);

    await waitForSave();

    const content = await readFile(filePath, "utf-8");
    const saved = JSON.parse(content);
    expect(saved.implementation_tasks).toHaveLength(5);
  });
});

describe("PrdManager ID generation", () => {
  it("should generate impl-001 for empty PRD", async () => {
    const testPrd: ExtendedPrd = {
      name: "empty",
      version: "0.1.0",
      description: "Empty PRD",
      status: "planning",
      implementation_tasks: [],
    };
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.addIssue({ title: "First task" });

    expect(result.taskId).toBe("impl-001");
  });

  it("should preserve prefix from existing tasks", async () => {
    const testPrd: ExtendedPrd = {
      name: "custom-prefix",
      version: "0.1.0",
      description: "Custom prefix PRD",
      status: "planning",
      implementation_tasks: [
        { id: "task-001", phase: 1, task: "Existing", status: "completed" },
        { id: "task-002", phase: 1, task: "Existing 2", status: "pending" },
      ],
    };
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.addIssue({ title: "New task" });

    expect(result.taskId).toBe("task-003");
  });

  it("should handle gaps in ID sequence", async () => {
    const testPrd: ExtendedPrd = {
      name: "gaps",
      version: "0.1.0",
      description: "PRD with gaps",
      status: "planning",
      implementation_tasks: [
        { id: "impl-001", phase: 1, task: "First", status: "completed" },
        { id: "impl-005", phase: 1, task: "Fifth", status: "pending" },
        { id: "impl-010", phase: 1, task: "Tenth", status: "pending" },
      ],
    };
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.addIssue({ title: "New task" });

    expect(result.taskId).toBe("impl-011"); // Max + 1
  });
});

describe("PrdManager.updateNote", () => {
  it("should add note to task", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.updateNote({
      taskId: "impl-002",
      note: "This is a test note",
    });

    expect(result.success).toBe(true);

    const task = prdManager.getTask("impl-002");
    expect(task?.notes).toContain("This is a test note");
    expect(task?.notes).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/); // Timestamp format
  });

  it("should append note when append=true", async () => {
    const testPrd = createTestPrd();
    testPrd.implementation_tasks![1].notes = "Existing note";
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.updateNote({
      taskId: "impl-002",
      note: "New note",
      append: true,
    });

    expect(result.success).toBe(true);

    const task = prdManager.getTask("impl-002");
    expect(task?.notes).toContain("Existing note");
    expect(task?.notes).toContain("New note");
  });

  it("should replace note when append=false", async () => {
    const testPrd = createTestPrd();
    testPrd.implementation_tasks![1].notes = "Existing note";
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.updateNote({
      taskId: "impl-002",
      note: "Replacement note",
      append: false,
    });

    expect(result.success).toBe(true);

    const task = prdManager.getTask("impl-002");
    expect(task?.notes).not.toContain("Existing note");
    expect(task?.notes).toContain("Replacement note");
  });

  it("should fail for non-existent task", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.updateNote({
      taskId: "impl-999",
      note: "Test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("TASK_NOT_FOUND");
  });

  it("should fail when no PRD loaded", () => {
    const result = prdManager.updateNote({
      taskId: "impl-001",
      note: "Test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("NO_PRD");
  });
});

describe("PrdManager.updatePriority", () => {
  it("should update phase for implementation task", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.updatePriority({
      taskId: "impl-003",
      priority: 1, // Move to phase 1
    });

    expect(result.success).toBe(true);

    const task = prdManager.getTask("impl-003") as ImplementationTask;
    expect(task.phase).toBe(1);
  });

  it("should update priority for user story", async () => {
    const testPrd = createUserStoriesPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.updatePriority({
      taskId: "US-003",
      priority: 1, // Make highest priority
    });

    expect(result.success).toBe(true);

    const prd = prdManager.getPrd()!;
    const story = prd.userStories!.find((s) => s.id === "US-003");
    expect(story?.priority).toBe(1);
  });

  it("should fail for non-existent task", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.updatePriority({
      taskId: "impl-999",
      priority: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("TASK_NOT_FOUND");
  });
});

describe("PrdManager.markComplete", () => {
  it("should mark implementation task as completed", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.markComplete("impl-002");

    expect(result.success).toBe(true);

    const task = prdManager.getTask("impl-002") as ImplementationTask;
    expect(task.status).toBe("completed");
    expect(task.passes).toBe(true);
    expect(task.completedAt).toBeDefined();
  });

  it("should mark user story as passing", async () => {
    const testPrd = createUserStoriesPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.markComplete("US-002");

    expect(result.success).toBe(true);

    const prd = prdManager.getPrd()!;
    const story = prd.userStories!.find((s) => s.id === "US-002");
    expect(story?.passes).toBe(true);
    expect(story?.completedAt).toBeDefined();
  });

  it("should fail for non-existent task", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.markComplete("impl-999");

    expect(result.success).toBe(false);
    expect(result.error).toBe("TASK_NOT_FOUND");
  });
});

describe("PrdManager.markSkipped", () => {
  it("should mark task as skipped with note", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.markSkipped("impl-002", "Not needed anymore");

    expect(result.success).toBe(true);
    expect(result.message).toContain("Skipped");

    const task = prdManager.getTask("impl-002") as ImplementationTask;
    expect(task.status).toBe("completed");
    expect(task.passes).toBe(true);
    expect(task.notes).toContain("Skipped by user");
    expect(task.notes).toContain("Not needed anymore");
  });

  it("should mark task as skipped without reason", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.markSkipped("impl-002");

    expect(result.success).toBe(true);

    const task = prdManager.getTask("impl-002") as ImplementationTask;
    expect(task.notes).toContain("Skipped by user");
    // No reason colon (the timestamp has colons, so we check for ": " after "user")
    expect(task.notes).not.toMatch(/Skipped by user:/);
  });

  it("should append skip note to existing notes", async () => {
    const testPrd = createTestPrd();
    testPrd.implementation_tasks![1].notes = "Existing note";
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    prdManager.markSkipped("impl-002", "Skip reason");

    const task = prdManager.getTask("impl-002");
    expect(task?.notes).toContain("Existing note");
    expect(task?.notes).toContain("Skipped by user");
  });
});

describe("PrdManager.startTask", () => {
  it("should mark implementation task as in_progress", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.startTask("impl-003");

    expect(result.success).toBe(true);

    const task = prdManager.getTask("impl-003") as ImplementationTask;
    expect(task.status).toBe("in_progress");
    expect(task.startedAt).toBeDefined();
  });

  it("should set startedAt for user story", async () => {
    const testPrd = createUserStoriesPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.startTask("US-002");

    expect(result.success).toBe(true);

    const prd = prdManager.getPrd()!;
    const story = prd.userStories!.find((s) => s.id === "US-002");
    expect(story?.startedAt).toBeDefined();
  });
});

describe("PrdManager.updateStatus", () => {
  it("should update PRD status", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.updateStatus("in_progress");

    expect(result.success).toBe(true);
    expect(prdManager.getPrd()!.status).toBe("in_progress");
  });

  it("should fail when no PRD loaded", () => {
    const result = prdManager.updateStatus("completed");

    expect(result.success).toBe(false);
    expect(result.error).toBe("NO_PRD");
  });
});

// ============================================================================
// Review Tasks Tests
// ============================================================================

describe("PrdManager.getReviewTasks", () => {
  it("should return review_tasks array", async () => {
    const testPrd = createPrdWithReviewTasks();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const reviews = prdManager.getReviewTasks();

    expect(reviews).toHaveLength(2);
    expect(reviews[0].id).toBe("review-001");
  });

  it("should return empty array when no review tasks", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const reviews = prdManager.getReviewTasks();

    expect(reviews).toEqual([]);
  });

  it("should return empty array when no PRD loaded", () => {
    const reviews = prdManager.getReviewTasks();
    expect(reviews).toEqual([]);
  });
});

describe("PrdManager.getPendingReviewTasks", () => {
  it("should return pending and in_progress review tasks", async () => {
    const testPrd = createPrdWithReviewTasks();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const pending = prdManager.getPendingReviewTasks();

    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("review-001");
  });
});

describe("PrdManager.updateReviewFinding", () => {
  it("should update review task finding", async () => {
    const testPrd = createPrdWithReviewTasks();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.updateReviewFinding(
      "review-001",
      "Library X works with Y",
      null
    );

    expect(result.success).toBe(true);

    const reviews = prdManager.getReviewTasks();
    const review = reviews.find((r) => r.id === "review-001");
    expect(review?.finding).toBe("Library X works with Y");
    expect(review?.status).toBe("completed");
    expect(review?.actionRequired).toBeNull();
  });

  it("should update review with action required", async () => {
    const testPrd = createPrdWithReviewTasks();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.updateReviewFinding(
      "review-001",
      "Library X is deprecated",
      "Update to Library Z"
    );

    expect(result.success).toBe(true);

    const reviews = prdManager.getReviewTasks();
    const review = reviews.find((r) => r.id === "review-001");
    expect(review?.actionRequired).toBe("Update to Library Z");
  });

  it("should fail for non-existent review", async () => {
    const testPrd = createPrdWithReviewTasks();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    const result = prdManager.updateReviewFinding(
      "review-999",
      "Finding",
      null
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("REVIEW_NOT_FOUND");
  });
});

// ============================================================================
// Static Methods Tests
// ============================================================================

describe("PrdManager.fileExists", () => {
  it("should return true for existing file", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);

    const exists = await PrdManager.fileExists(filePath);

    expect(exists).toBe(true);
  });

  it("should return false for non-existent file", async () => {
    const exists = await PrdManager.fileExists("/nonexistent/path.json");

    expect(exists).toBe(false);
  });
});

describe("PrdManager.findPrdFiles", () => {
  it("should find PRD files in directory", async () => {
    await writePrdFile(createTestPrd(), "prd-test1.json");
    await writePrdFile(createTestPrd(), "prd-test2.json");
    await writePrdFile(createTestPrd(), "other-file.json"); // Should be ignored

    const files = await PrdManager.findPrdFiles(testDir);

    expect(files).toHaveLength(2);
    expect(files.some((f) => f.includes("prd-test1.json"))).toBe(true);
    expect(files.some((f) => f.includes("prd-test2.json"))).toBe(true);
  });

  it("should return empty array for non-existent directory", async () => {
    const files = await PrdManager.findPrdFiles("/nonexistent/directory");

    expect(files).toEqual([]);
  });
});

describe("PrdManager.create", () => {
  it("should create new PRD file", async () => {
    const { filePath, prd } = await PrdManager.create(
      "My New Project",
      "A test project",
      testDir
    );

    expect(filePath).toContain("prd-my-new-project.json");
    expect(prd.name).toBe("My New Project");
    expect(prd.description).toBe("A test project");
    expect(prd.status).toBe("planning");
    expect(prd.implementation_tasks).toEqual([]);
    expect(prd.metadata?.createdAt).toBeDefined();

    // Verify file was written
    const content = await readFile(filePath, "utf-8");
    const saved = JSON.parse(content);
    expect(saved.name).toBe("My New Project");
  });

  it("should create nested directories", async () => {
    const nestedDir = join(testDir, "nested", "deep");

    const { filePath } = await PrdManager.create(
      "Nested Project",
      "Test",
      nestedDir
    );

    const exists = await PrdManager.fileExists(filePath);
    expect(exists).toBe(true);
  });
});

// ============================================================================
// Singleton Tests
// ============================================================================

describe("getDefaultPrdManager", () => {
  it("should return singleton instance", () => {
    const manager1 = getDefaultPrdManager();
    const manager2 = getDefaultPrdManager();

    expect(manager1).toBe(manager2);
  });

  it("should reset singleton on resetDefaultPrdManager", async () => {
    const manager1 = getDefaultPrdManager();

    // Load a PRD
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await manager1.load(filePath);

    // Reset
    resetDefaultPrdManager();

    const manager2 = getDefaultPrdManager();
    expect(manager2).not.toBe(manager1);
    expect(manager2.getPrd()).toBeNull();
  });
});

// ============================================================================
// Utility Methods Tests
// ============================================================================

describe("PrdManager utility methods", () => {
  it("getFilename should return just the filename", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd, "my-prd-file.json");
    await prdManager.load(filePath);

    expect(prdManager.getFilename()).toBe("my-prd-file.json");
  });

  it("getFilename should return null when no PRD loaded", () => {
    expect(prdManager.getFilename()).toBeNull();
  });
});

describe("PrdManager.destroy", () => {
  it("should flush pending saves and clear state", async () => {
    const testPrd = createTestPrd();
    const filePath = await writePrdFile(testPrd);
    await prdManager.load(filePath);

    prdManager.addIssue({ title: "New task" });
    expect(prdManager.isDirty()).toBe(true);

    await prdManager.destroy();

    expect(prdManager.getPrd()).toBeNull();
    expect(prdManager.getFilePath()).toBeNull();

    // Verify save was flushed
    const content = await readFile(filePath, "utf-8");
    const saved = JSON.parse(content);
    expect(saved.implementation_tasks).toHaveLength(5);
  });
});
