/**
 * PRD File Locking for Pair Vibe Mode
 *
 * Prevents race conditions when Reviewer and Executor both update PRD concurrently.
 * Uses async-lock for in-process serialization per review-004 findings.
 *
 * Strategy (from review-004):
 * 1. IN-PROCESS: async-lock for within-process serialization
 * 2. ATOMIC WRITES: write-file-atomic pattern (temp file then rename)
 * 3. Timeout: 5 seconds, Retries: 3 with exponential backoff (100ms, 200ms, 400ms)
 */

import AsyncLock from "async-lock";
import { writeFile, rename, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import type { PairVibeEvent } from "./pair-vibe-types.js";

/**
 * Lock acquisition options
 */
export interface LockOptions {
  /** Lock timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 100) */
  baseDelay?: number;
}

/**
 * Result of a locked write operation
 */
export interface LockWriteResult {
  success: boolean;
  error?: Error;
  retriesUsed: number;
  lockAcquiredAt?: number;
  writeCompletedAt?: number;
}

/**
 * Lock status information
 */
export interface LockStatus {
  isLocked: boolean;
  queueLength: number;
  path: string;
}

/**
 * Event emitter type for lock events
 */
export type LockEventEmitter = (event: PairVibeEvent) => void;

/**
 * Default lock configuration
 */
const DEFAULT_OPTIONS: Required<LockOptions> = {
  timeout: 5000, // 5 seconds per review-004
  maxRetries: 3, // 3 retries per review-004
  baseDelay: 100, // 100ms base for exponential backoff
};

/**
 * PrdLock - In-process file locking for PRD concurrent access
 *
 * Implements the locking strategy from review-004:
 * - Uses async-lock for in-process serialization
 * - Timeout: 5 seconds
 * - Retries: 3 with exponential backoff (100ms, 200ms, 400ms)
 */
export class PrdLock {
  private lock: AsyncLock;
  private options: Required<LockOptions>;
  private eventEmitter: LockEventEmitter | null = null;

  constructor(options: LockOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.lock = new AsyncLock({
      timeout: this.options.timeout,
      maxPending: 1000, // Allow queueing up to 1000 pending operations
    });
  }

  /**
   * Set event emitter for lock-related events
   */
  setEventEmitter(emitter: LockEventEmitter): void {
    this.eventEmitter = emitter;
  }

  /**
   * Emit a lock event
   */
  private emit(event: PairVibeEvent): void {
    if (this.eventEmitter) {
      this.eventEmitter(event);
    }
  }

  /**
   * Acquire lock and execute a function with exclusive access
   *
   * @param path - The PRD file path (used as lock key)
   * @param fn - The function to execute while holding the lock
   * @returns The result of the function
   */
  async withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
    const lockKey = this.getLockKey(path);
    let lastError: Error | null = null;
    let retriesUsed = 0;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 100ms, 200ms, 400ms
          const delay = this.options.baseDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
          retriesUsed = attempt;
        }

        return await this.lock.acquire(lockKey, fn);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // If it's not a timeout error, don't retry
        if (!this.isTimeoutError(lastError)) {
          throw lastError;
        }

        // Emit retry event
        if (attempt < this.options.maxRetries) {
          this.emit({
            type: "lock-retry",
            path,
            attempt: attempt + 1,
            maxRetries: this.options.maxRetries,
            timestamp: Date.now(),
          } as PairVibeEvent);
        }
      }
    }

    // All retries exhausted
    this.emit({
      type: "lock-failed",
      path,
      error: lastError?.message ?? "Lock acquisition failed",
      retriesUsed,
      timestamp: Date.now(),
    } as PairVibeEvent);

    throw lastError ?? new Error("Lock acquisition failed after retries");
  }

  /**
   * Write content to a file with lock and atomic write pattern
   *
   * Implements atomic write: write to temp file, then rename.
   * This ensures partial writes don't corrupt the PRD.
   *
   * @param path - The PRD file path
   * @param content - The content to write
   * @returns Result of the write operation
   */
  async writeWithLock(path: string, content: string): Promise<LockWriteResult> {
    let retriesUsed = 0;
    const lockAcquiredAt = Date.now();

    try {
      await this.withLock(path, async () => {
        await this.atomicWrite(path, content);
      });

      return {
        success: true,
        retriesUsed,
        lockAcquiredAt,
        writeCompletedAt: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        retriesUsed,
        lockAcquiredAt,
      };
    }
  }

  /**
   * Perform an atomic write using temp file + rename pattern
   *
   * Per review-004: Use write-file-atomic pattern to ensure
   * partial writes don't corrupt the PRD.
   */
  private async atomicWrite(path: string, content: string): Promise<void> {
    const dir = dirname(path);
    const tempPath = join(dir, `.prd-${randomBytes(8).toString("hex")}.tmp`);

    try {
      // Write to temp file
      await writeFile(tempPath, content, "utf-8");

      // Atomic rename
      await rename(tempPath, path);
    } catch (error) {
      // Clean up temp file on failure
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Get the lock key for a given path
   */
  private getLockKey(path: string): string {
    return `prd:${path}`;
  }

  /**
   * Check if an error is a timeout error
   */
  private isTimeoutError(error: Error): boolean {
    return (
      error.message.includes("async-lock timed out") ||
      error.message.includes("Timeout")
    );
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get lock status for a path
   */
  getStatus(path: string): LockStatus {
    const lockKey = this.getLockKey(path);
    return {
      isLocked: this.lock.isBusy(lockKey),
      queueLength: this.lock.isBusy(lockKey)
        ? (this.lock as unknown as { queues: Record<string, unknown[]> }).queues?.[lockKey]?.length ?? 0
        : 0,
      path,
    };
  }

  /**
   * Check if any lock is currently held for a path
   */
  isLocked(path: string): boolean {
    return this.lock.isBusy(this.getLockKey(path));
  }
}

/**
 * Global singleton lock instance per PRD path
 */
const globalLocks = new Map<string, PrdLock>();

/**
 * Get or create a PrdLock instance for a specific path
 *
 * Per review-004: Create src/ralph/prd-lock.ts with a singleton lock per PRD path.
 */
export function getPrdLock(path: string, options?: LockOptions): PrdLock {
  let lock = globalLocks.get(path);
  if (!lock) {
    lock = new PrdLock(options);
    globalLocks.set(path, lock);
  }
  return lock;
}

/**
 * Get the global lock for any path (shared lock)
 */
let globalSharedLock: PrdLock | null = null;

export function getGlobalPrdLock(options?: LockOptions): PrdLock {
  if (!globalSharedLock) {
    globalSharedLock = new PrdLock(options);
  }
  return globalSharedLock;
}

/**
 * Clear all global locks (for testing)
 */
export function clearGlobalLocks(): void {
  globalLocks.clear();
  globalSharedLock = null;
}

/**
 * Wrap a PrdManager save function with locking
 *
 * This is a helper to integrate locking with existing PrdManager.save() calls.
 *
 * @param path - The PRD file path
 * @param saveFn - The original save function
 * @param options - Lock options
 * @returns A wrapped save function that acquires lock before saving
 */
export function withPrdLocking<T>(
  path: string,
  saveFn: () => Promise<T>,
  options?: LockOptions
): () => Promise<T> {
  const lock = getPrdLock(path, options);
  return () => lock.withLock(path, saveFn);
}
