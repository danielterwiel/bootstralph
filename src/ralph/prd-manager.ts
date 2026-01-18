/**
 * PRD Manager for CRUD Operations
 *
 * This module provides a class to manage PRD (Product Requirements Document) files
 * with CRUD operations, auto-save with debounce, and integration with the TUI store.
 *
 * Supports both standard UserStory format and extended implementation_tasks format.
 */

import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import type { Prd, UserStory, ReviewTask, PrdStatus } from "./prd-schema.js";
import {
  isPrdComplete,
  getNextStory,
  getPrdProgress,
  generatePrdFilename,
} from "./prd-schema.js";
import { getPrdLock, type PrdLock } from "./prd-lock.js";

/**
 * Extended task interface for implementation_tasks format
 * Used by bootstralph and ralph-cc-loop PRD files
 */
export interface ImplementationTask {
  id: string;
  phase: number;
  task: string;
  files?: string[];
  status: "pending" | "in_progress" | "completed" | "failed" | "blocked";
  passes?: boolean;
  description?: string;
  notes?: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Extended PRD interface that supports implementation_tasks
 */
export interface ExtendedPrd extends Omit<Prd, "userStories"> {
  userStories?: UserStory[];
  implementation_tasks?: ImplementationTask[];
  review_tasks?: ReviewTask[];
  workflow?: {
    instructions?: string[];
    status_values?: string[];
    example_completed_review?: Record<string, unknown>;
    example_failed_review?: Record<string, unknown>;
  };
  specs?: Record<string, unknown>;
}

/**
 * Options for creating a new issue/task
 */
export interface AddIssueOptions {
  title: string;
  description?: string;
  phase?: number;
  files?: string[];
  priority?: number;
}

/**
 * Options for updating a task note
 */
export interface UpdateNoteOptions {
  taskId: string;
  note: string;
  append?: boolean;
}

/**
 * Options for updating task priority
 */
export interface UpdatePriorityOptions {
  taskId: string;
  priority: number;
}

/**
 * Result of a PRD operation
 */
export interface PrdOperationResult {
  success: boolean;
  message: string;
  taskId?: string;
  error?: string;
}

/**
 * PRD Manager class for CRUD operations with auto-save
 */
export class PrdManager {
  private prd: ExtendedPrd | null = null;
  private filePath: string | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private saveDebounceMs: number;
  private dirty = false;
  private onUpdate: ((prd: ExtendedPrd) => void) | null = null;
  private lockingEnabled = false;
  private prdLock: PrdLock | null = null;

  /**
   * Create a new PRD Manager instance
   * @param options Configuration options
   */
  constructor(options: {
    saveDebounceMs?: number;
    onUpdate?: (prd: ExtendedPrd) => void;
    /** Enable file locking for concurrent access (Pair Vibe Mode) */
    enableLocking?: boolean;
  } = {}) {
    this.saveDebounceMs = options.saveDebounceMs ?? 500;
    if (options.onUpdate) {
      this.onUpdate = options.onUpdate;
    }
    this.lockingEnabled = options.enableLocking ?? false;
  }

  /**
   * Enable file locking for concurrent access.
   * Call this when entering Pair Vibe Mode.
   */
  enableLocking(): void {
    this.lockingEnabled = true;
    if (this.filePath) {
      this.prdLock = getPrdLock(this.filePath);
    }
  }

  /**
   * Disable file locking.
   * Call this when exiting Pair Vibe Mode.
   */
  disableLocking(): void {
    this.lockingEnabled = false;
    this.prdLock = null;
  }

  /**
   * Check if locking is enabled
   */
  isLockingEnabled(): boolean {
    return this.lockingEnabled;
  }

  /**
   * Load a PRD from a file
   */
  async load(filePath: string): Promise<ExtendedPrd> {
    const content = await readFile(filePath, "utf-8");
    const prd = JSON.parse(content) as ExtendedPrd;

    this.prd = prd;
    this.filePath = filePath;
    this.dirty = false;

    // Initialize lock if locking is enabled
    if (this.lockingEnabled) {
      this.prdLock = getPrdLock(filePath);
    }

    return prd;
  }

  /**
   * Save the PRD to its file
   */
  async save(): Promise<void> {
    if (!this.prd || !this.filePath) {
      throw new Error("No PRD loaded");
    }

    // Update metadata timestamp
    if (this.prd.metadata) {
      this.prd.metadata.updatedAt = new Date().toISOString();
    }

    // Ensure directory exists
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    const content = JSON.stringify(this.prd, null, 2) + "\n";

    // Use locked write if locking is enabled (Pair Vibe Mode)
    if (this.lockingEnabled && this.prdLock) {
      const result = await this.prdLock.writeWithLock(this.filePath, content);
      if (!result.success) {
        throw result.error ?? new Error("Failed to write PRD with lock");
      }
    } else {
      // Standard write without locking
      await writeFile(this.filePath, content);
    }

    this.dirty = false;
  }

  /**
   * Schedule an auto-save with debounce
   */
  private scheduleSave(): void {
    this.dirty = true;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      await this.save();
      this.saveTimeout = null;
    }, this.saveDebounceMs);
  }

  /**
   * Trigger the update callback if set
   */
  private triggerUpdate(): void {
    if (this.onUpdate && this.prd) {
      this.onUpdate(this.prd);
    }
  }

  /**
   * Check if changes are pending save
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Force an immediate save
   */
  async flush(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    if (this.dirty) {
      await this.save();
    }
  }

  /**
   * Get the current PRD
   */
  getPrd(): ExtendedPrd | null {
    return this.prd;
  }

  /**
   * Get the current file path
   */
  getFilePath(): string | null {
    return this.filePath;
  }

  /**
   * Get filename only (without path)
   */
  getFilename(): string | null {
    return this.filePath ? basename(this.filePath) : null;
  }

  // ============================================================================
  // Task Retrieval
  // ============================================================================

  /**
   * Get all tasks (implementation_tasks or userStories)
   */
  getAllTasks(): (ImplementationTask | UserStory)[] {
    if (!this.prd) return [];

    if (this.prd.implementation_tasks) {
      return this.prd.implementation_tasks;
    }

    if (this.prd.userStories) {
      return this.prd.userStories;
    }

    return [];
  }

  /**
   * Get a task by ID
   */
  getTask(taskId: string): ImplementationTask | UserStory | undefined {
    return this.getAllTasks().find((t) => t.id === taskId);
  }

  /**
   * Get the next pending task with highest priority
   */
  getNextTask(): ImplementationTask | UserStory | undefined {
    if (!this.prd) return undefined;

    // Handle implementation_tasks format
    if (this.prd.implementation_tasks) {
      const pending = this.prd.implementation_tasks
        .filter((t) => t.status === "pending" || t.status === "in_progress")
        .sort((a, b) => {
          // Sort by phase first, then by ID order
          if (a.phase !== b.phase) return a.phase - b.phase;
          return a.id.localeCompare(b.id);
        });

      return pending[0];
    }

    // Handle userStories format (use existing helper)
    if (this.prd.userStories) {
      return getNextStory(this.prd as Prd);
    }

    return undefined;
  }

  /**
   * Get all pending tasks
   */
  getPendingTasks(): (ImplementationTask | UserStory)[] {
    if (!this.prd) return [];

    if (this.prd.implementation_tasks) {
      return this.prd.implementation_tasks.filter(
        (t) => t.status === "pending" || t.status === "in_progress"
      );
    }

    if (this.prd.userStories) {
      return this.prd.userStories.filter((s) => !s.passes);
    }

    return [];
  }

  /**
   * Get all completed tasks
   */
  getCompletedTasks(): (ImplementationTask | UserStory)[] {
    if (!this.prd) return [];

    if (this.prd.implementation_tasks) {
      return this.prd.implementation_tasks.filter((t) => t.status === "completed");
    }

    if (this.prd.userStories) {
      return this.prd.userStories.filter((s) => s.passes);
    }

    return [];
  }

  // ============================================================================
  // Progress
  // ============================================================================

  /**
   * Get progress statistics
   */
  getProgress(): { total: number; completed: number; remaining: number; percentage: number } {
    if (!this.prd) {
      return { total: 0, completed: 0, remaining: 0, percentage: 0 };
    }

    if (this.prd.implementation_tasks) {
      const total = this.prd.implementation_tasks.length;
      const completed = this.prd.implementation_tasks.filter(
        (t) => t.status === "completed"
      ).length;
      const remaining = total - completed;
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
      return { total, completed, remaining, percentage };
    }

    if (this.prd.userStories) {
      return getPrdProgress(this.prd as Prd);
    }

    return { total: 0, completed: 0, remaining: 0, percentage: 0 };
  }

  /**
   * Check if the PRD is complete
   */
  isComplete(): boolean {
    if (!this.prd) return false;

    if (this.prd.implementation_tasks) {
      return this.prd.implementation_tasks.every((t) => t.status === "completed");
    }

    if (this.prd.userStories) {
      return isPrdComplete(this.prd as Prd);
    }

    return false;
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  /**
   * Add a new issue/task to the PRD
   */
  addIssue(options: AddIssueOptions): PrdOperationResult {
    if (!this.prd) {
      return { success: false, message: "No PRD loaded", error: "NO_PRD" };
    }

    // Generate next ID
    const nextId = this.generateNextId();

    if (this.prd.implementation_tasks) {
      // Get max phase or use provided phase
      const maxPhase = Math.max(...this.prd.implementation_tasks.map((t) => t.phase), 0);
      const phase = options.phase ?? maxPhase;

      const newTask: ImplementationTask = {
        id: nextId,
        phase,
        task: options.title,
        status: "pending",
        ...(options.files && { files: options.files }),
        ...(options.description && { description: options.description }),
      };

      this.prd.implementation_tasks.push(newTask);
      this.scheduleSave();
      this.triggerUpdate();

      return {
        success: true,
        message: `Created task ${nextId}: ${options.title}`,
        taskId: nextId,
      };
    }

    if (this.prd.userStories) {
      // Get max priority or use provided priority
      const maxPriority = Math.max(...this.prd.userStories.map((s) => s.priority), 0);
      const priority = options.priority ?? maxPriority + 1;

      const newStory: UserStory = {
        id: nextId,
        title: options.title,
        description: options.description ?? options.title,
        acceptanceCriteria: [],
        priority,
        passes: false,
      };

      this.prd.userStories.push(newStory);
      this.scheduleSave();
      this.triggerUpdate();

      return {
        success: true,
        message: `Created story ${nextId}: ${options.title}`,
        taskId: nextId,
      };
    }

    return { success: false, message: "PRD has no tasks or stories", error: "NO_TASKS" };
  }

  /**
   * Generate the next task/story ID
   */
  private generateNextId(): string {
    const tasks = this.getAllTasks();
    if (tasks.length === 0) {
      return "impl-001";
    }

    // Extract numeric suffix from IDs
    const ids = tasks
      .map((t) => {
        const match = t.id.match(/(\d+)$/);
        return match?.[1] ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));

    const maxId = Math.max(...ids, 0);
    const nextNum = (maxId + 1).toString().padStart(3, "0");

    // Use same prefix as existing tasks
    const firstTask = tasks[0];
    if (firstTask) {
      const prefix = firstTask.id.replace(/\d+$/, "");
      return `${prefix}${nextNum}`;
    }

    return `impl-${nextNum}`;
  }

  /**
   * Update a task's note
   */
  updateNote(options: UpdateNoteOptions): PrdOperationResult {
    if (!this.prd) {
      return { success: false, message: "No PRD loaded", error: "NO_PRD" };
    }

    const task = this.getTask(options.taskId);
    if (!task) {
      return {
        success: false,
        message: `Task not found: ${options.taskId}`,
        error: "TASK_NOT_FOUND",
      };
    }

    // Add timestamp to note
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const newNote = `[${timestamp}] ${options.note}`;

    if (options.append && task.notes) {
      task.notes = `${task.notes}\n${newNote}`;
    } else {
      task.notes = newNote;
    }

    this.scheduleSave();
    this.triggerUpdate();

    return {
      success: true,
      message: `Updated note for ${options.taskId}`,
      taskId: options.taskId,
    };
  }

  /**
   * Update a task's priority (for userStories) or phase (for implementation_tasks)
   */
  updatePriority(options: UpdatePriorityOptions): PrdOperationResult {
    if (!this.prd) {
      return { success: false, message: "No PRD loaded", error: "NO_PRD" };
    }

    const task = this.getTask(options.taskId);
    if (!task) {
      return {
        success: false,
        message: `Task not found: ${options.taskId}`,
        error: "TASK_NOT_FOUND",
      };
    }

    // Handle implementation_tasks (update phase)
    if ("phase" in task) {
      (task as ImplementationTask).phase = options.priority;
    }

    // Handle userStories (update priority)
    if ("priority" in task) {
      (task as UserStory).priority = options.priority;
    }

    this.scheduleSave();
    this.triggerUpdate();

    return {
      success: true,
      message: `Updated priority for ${options.taskId} to ${options.priority}`,
      taskId: options.taskId,
    };
  }

  /**
   * Mark a task as completed
   */
  markComplete(taskId: string): PrdOperationResult {
    if (!this.prd) {
      return { success: false, message: "No PRD loaded", error: "NO_PRD" };
    }

    const task = this.getTask(taskId);
    if (!task) {
      return {
        success: false,
        message: `Task not found: ${taskId}`,
        error: "TASK_NOT_FOUND",
      };
    }

    const timestamp = new Date().toISOString();

    // Handle implementation_tasks
    if ("status" in task && "phase" in task) {
      (task as ImplementationTask).status = "completed";
      (task as ImplementationTask).passes = true;
      (task as ImplementationTask).completedAt = timestamp;
    }

    // Handle userStories
    if ("passes" in task && "priority" in task) {
      (task as UserStory).passes = true;
      (task as UserStory).completedAt = timestamp;
    }

    this.scheduleSave();
    this.triggerUpdate();

    return {
      success: true,
      message: `Marked ${taskId} as completed`,
      taskId,
    };
  }

  /**
   * Mark a task as skipped (completed with a skip note)
   */
  markSkipped(taskId: string, reason?: string): PrdOperationResult {
    if (!this.prd) {
      return { success: false, message: "No PRD loaded", error: "NO_PRD" };
    }

    const task = this.getTask(taskId);
    if (!task) {
      return {
        success: false,
        message: `Task not found: ${taskId}`,
        error: "TASK_NOT_FOUND",
      };
    }

    const timestamp = new Date().toISOString();
    const skipNote = `[${timestamp.slice(0, 19).replace("T", " ")}] Skipped by user${reason ? `: ${reason}` : ""}`;

    // Add skip note
    if (task.notes) {
      task.notes = `${task.notes}\n${skipNote}`;
    } else {
      task.notes = skipNote;
    }

    // Handle implementation_tasks
    if ("status" in task && "phase" in task) {
      (task as ImplementationTask).status = "completed";
      (task as ImplementationTask).passes = true;
      (task as ImplementationTask).completedAt = timestamp;
    }

    // Handle userStories
    if ("passes" in task && "priority" in task) {
      (task as UserStory).passes = true;
      (task as UserStory).completedAt = timestamp;
    }

    this.scheduleSave();
    this.triggerUpdate();

    return {
      success: true,
      message: `Skipped ${taskId}${reason ? `: ${reason}` : ""}`,
      taskId,
    };
  }

  /**
   * Start working on a task (mark as in_progress)
   */
  startTask(taskId: string): PrdOperationResult {
    if (!this.prd) {
      return { success: false, message: "No PRD loaded", error: "NO_PRD" };
    }

    const task = this.getTask(taskId);
    if (!task) {
      return {
        success: false,
        message: `Task not found: ${taskId}`,
        error: "TASK_NOT_FOUND",
      };
    }

    const timestamp = new Date().toISOString();

    // Handle implementation_tasks
    if ("status" in task && "phase" in task) {
      (task as ImplementationTask).status = "in_progress";
      (task as ImplementationTask).startedAt = timestamp;
    }

    // Handle userStories
    if ("passes" in task && "priority" in task) {
      (task as UserStory).startedAt = timestamp;
    }

    this.scheduleSave();
    this.triggerUpdate();

    return {
      success: true,
      message: `Started task ${taskId}`,
      taskId,
    };
  }

  /**
   * Update the PRD status
   */
  updateStatus(status: PrdStatus): PrdOperationResult {
    if (!this.prd) {
      return { success: false, message: "No PRD loaded", error: "NO_PRD" };
    }

    this.prd.status = status;
    this.scheduleSave();
    this.triggerUpdate();

    return {
      success: true,
      message: `PRD status updated to ${status}`,
    };
  }

  // ============================================================================
  // Review Tasks
  // ============================================================================

  /**
   * Get all review tasks
   */
  getReviewTasks(): ReviewTask[] {
    if (!this.prd) return [];
    return this.prd.review_tasks ?? this.prd.reviewTasks ?? [];
  }

  /**
   * Get pending review tasks
   */
  getPendingReviewTasks(): ReviewTask[] {
    return this.getReviewTasks().filter(
      (t) => t.status === "pending" || t.status === "in_progress"
    );
  }

  /**
   * Update a review task finding
   */
  updateReviewFinding(
    reviewId: string,
    finding: string,
    actionRequired?: string | null
  ): PrdOperationResult {
    if (!this.prd) {
      return { success: false, message: "No PRD loaded", error: "NO_PRD" };
    }

    const reviews = this.prd.review_tasks ?? this.prd.reviewTasks ?? [];
    const review = reviews.find((r) => r.id === reviewId);

    if (!review) {
      return {
        success: false,
        message: `Review task not found: ${reviewId}`,
        error: "REVIEW_NOT_FOUND",
      };
    }

    review.finding = finding;
    review.status = "completed";
    if (actionRequired !== undefined) {
      review.actionRequired = actionRequired;
    }

    this.scheduleSave();
    this.triggerUpdate();

    return {
      success: true,
      message: `Updated review ${reviewId}`,
      taskId: reviewId,
    };
  }

  // ============================================================================
  // Static Helpers
  // ============================================================================

  /**
   * Check if a file exists
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find PRD files in a directory
   */
  static async findPrdFiles(directory: string): Promise<string[]> {
    const { readdir } = await import("node:fs/promises");

    try {
      const files = await readdir(directory);
      return files
        .filter((f) => f.startsWith("prd-") && f.endsWith(".json"))
        .map((f) => join(directory, f));
    } catch {
      return [];
    }
  }

  /**
   * Create a new PRD file
   */
  static async create(
    name: string,
    description: string,
    directory: string = ".agents/tasks"
  ): Promise<{ filePath: string; prd: ExtendedPrd }> {
    const filename = generatePrdFilename(name);
    const filePath = join(directory, filename);

    const prd: ExtendedPrd = {
      name,
      version: "0.1.0",
      description,
      status: "planning",
      implementation_tasks: [],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    // Ensure directory exists
    await mkdir(directory, { recursive: true });

    // Write file
    await writeFile(filePath, JSON.stringify(prd, null, 2) + "\n");

    return { filePath, prd };
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    await this.flush();
    this.prd = null;
    this.filePath = null;
    this.onUpdate = null;
  }
}

/**
 * Create a singleton PRD manager instance
 */
let defaultManager: PrdManager | null = null;

/**
 * Get the default PRD manager instance
 */
export function getDefaultPrdManager(): PrdManager {
  if (!defaultManager) {
    defaultManager = new PrdManager();
  }
  return defaultManager;
}

/**
 * Reset the default PRD manager (for testing)
 */
export function resetDefaultPrdManager(): void {
  if (defaultManager) {
    void defaultManager.destroy();
    defaultManager = null;
  }
}
