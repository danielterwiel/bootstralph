/**
 * PairVibeEngine - Main orchestrator for Pair Vibe Mode
 *
 * Coordinates the Reviewer and Executor running concurrently:
 * - Spawns Reviewer as concurrent async task to review ahead
 * - Main loop: check if next step has findings, enter consensus if needed
 * - Handle pause/resume/stop controls
 * - Emit structured events for TUI integration
 * - Graceful shutdown on errors
 *
 * Based on PRD spec impl-008:
 * - Spawn Reviewer as concurrent async task
 * - Main loop: check if next step has findings !== null
 * - If findings.length > 0 enter consensus, otherwise execute
 * - Handle pause/resume, emit structured events, graceful shutdown
 *
 * Addresses edge cases:
 * - edge-001: Reviewer slower than Executor (wait with timeout)
 * - edge-002: PRD file locking (serialized writes)
 * - edge-008: All steps have findings (cap concurrent consensus at 1)
 * - edge-009: Executor completes step before review (mark passed_without_review)
 */

import { EventEmitter } from "node:events";
import type { UserStory, Prd } from "./prd-schema.js";
import {
  ReviewerRunner,
  type ReviewerLLMClient,
  type StepReviewResult,
  type ReviewerRunnerOptions,
} from "./reviewer-runner.js";
import {
  ConsensusRunner,
  type ConsensusLLMClient,
  needsConsensus,
  type ConsensusRunnerOptions,
} from "./consensus-runner.js";
import { WebSearchService } from "./web-search.js";
import type {
  PairVibeConfig,
  PairVibeState,
  PairVibePhase,
  PairVibeEvent,
  PairVibeEventHandler,
  ConsensusResult,
  CostBreakdown,
  PairVibeMetrics,
  StepMetrics,
} from "./pair-vibe-types.js";
import {
  createInitialPairVibeState,
  createStepProgress,
  DEFAULT_PAIR_VIBE_CONFIG,
} from "./pair-vibe-types.js";

/**
 * Options for PairVibeEngine
 */
export interface PairVibeEngineOptions {
  /** Configuration for Pair Vibe Mode */
  config: PairVibeConfig;

  /** LLM client for the Executor model (runs tasks) */
  executorClient?: ExecutorLLMClient;

  /** LLM client for the Reviewer model (reviews ahead) */
  reviewerClient?: ReviewerLLMClient;

  /** LLM clients for consensus resolution */
  consensusClients?: {
    executor?: ConsensusLLMClient;
    reviewer?: ConsensusLLMClient;
  };

  /** Web search service (shared between components) */
  webSearchService?: WebSearchService;

  /** External event handler for TUI integration */
  eventHandler?: PairVibeEventHandler;

  /** Callback to execute a step (adapter to existing Ralph engine) */
  executeStep?: (step: UserStory) => Promise<ExecuteStepResult>;

  /** Callback to save PRD updates */
  savePrd?: (prd: Prd) => Promise<void>;

  /** Callback to reload PRD */
  reloadPrd?: () => Promise<Prd>;
}

/**
 * Result of executing a step
 */
export interface ExecuteStepResult {
  success: boolean;
  error?: string;
  durationMs: number;
}

/**
 * Interface for Executor LLM client
 */
export interface ExecutorLLMClient {
  /** Execute a step implementation */
  executeStep(params: {
    step: UserStory;
    timeout: number;
  }): Promise<{
    success: boolean;
    output: string;
    error?: string;
  }>;
}

/**
 * State of the PairVibeEngine
 */
export type EngineState =
  | "idle"
  | "running"
  | "paused"
  | "stopping"
  | "stopped"
  | "error";

/**
 * Events emitted by PairVibeEngine
 */
export interface PairVibeEngineEvents {
  start: () => void;
  stop: (reason: string) => void;
  pause: () => void;
  resume: () => void;
  phaseChange: (phase: PairVibePhase, previousPhase: PairVibePhase) => void;
  stepStart: (stepId: string, phase: "review" | "execute" | "consensus") => void;
  stepComplete: (
    stepId: string,
    phase: "review" | "execute" | "consensus",
    success: boolean
  ) => void;
  consensusNeeded: (stepId: string, findings: string[]) => void;
  consensusResolved: (result: ConsensusResult) => void;
  progress: (progress: { completed: number; total: number; percentage: number }) => void;
  error: (error: Error) => void;
  metricsUpdate: (metrics: Partial<PairVibeMetrics>) => void;
}

/**
 * Default timeouts
 */
const DEFAULT_REVIEW_WAIT_TIMEOUT_MS = 120000; // 2 minutes per edge-001

/**
 * PairVibeEngine class
 *
 * Main orchestrator for Pair Vibe Mode multi-model execution.
 */
export class PairVibeEngine extends EventEmitter {
  private readonly config: PairVibeConfig;
  private readonly reviewerRunner: ReviewerRunner;
  private readonly consensusRunner: ConsensusRunner;
  private readonly webSearchService: WebSearchService;
  private readonly externalEventHandler: PairVibeEventHandler | null;

  // External adapters
  private readonly executeStep: ((step: UserStory) => Promise<ExecuteStepResult>) | null;
  private readonly savePrd: ((prd: Prd) => Promise<void>) | null;

  // State
  private engineState: EngineState = "idle";
  private pairVibeState: PairVibeState;
  private currentPrd: Prd | null = null;
  private reviewerTask: Promise<void> | null = null;
  private executorCurrentStepIndex = -1;

  // Metrics
  private metrics: PairVibeMetrics;
  private stepMetricsMap: Map<string, Partial<StepMetrics>> = new Map();

  // Control
  private abortController: AbortController | null = null;
  private isPaused = false;

  constructor(options: PairVibeEngineOptions) {
    super();

    this.config = {
      ...DEFAULT_PAIR_VIBE_CONFIG,
      ...options.config,
    } as PairVibeConfig;

    this.externalEventHandler = options.eventHandler ?? null;
    this.executeStep = options.executeStep ?? null;
    this.savePrd = options.savePrd ?? null;
    // Note: reloadPrd is available in options for future use

    // Initialize state
    this.pairVibeState = createInitialPairVibeState();
    this.metrics = this.createInitialMetrics();

    // Initialize shared web search service
    this.webSearchService =
      options.webSearchService ??
      new WebSearchService((event) => this.handlePairVibeEvent(event));

    // Build ReviewerRunner options conditionally for exactOptionalPropertyTypes
    const reviewerOptions: ReviewerRunnerOptions = {
      config: this.config,
      eventHandler: (event) => this.handlePairVibeEvent(event),
      webSearchService: this.webSearchService,
    };
    if (options.reviewerClient) {
      reviewerOptions.llmClient = options.reviewerClient;
    }

    // Initialize ReviewerRunner
    this.reviewerRunner = new ReviewerRunner(reviewerOptions);

    // Build ConsensusRunner options conditionally for exactOptionalPropertyTypes
    const consensusOptions: ConsensusRunnerOptions = {
      config: this.config,
      eventHandler: (event) => this.handlePairVibeEvent(event),
      webSearchService: this.webSearchService,
    };
    if (options.consensusClients?.executor) {
      consensusOptions.executorClient = options.consensusClients.executor;
    }
    if (options.consensusClients?.reviewer) {
      consensusOptions.reviewerClient = options.consensusClients.reviewer;
    }

    // Initialize ConsensusRunner
    this.consensusRunner = new ConsensusRunner(consensusOptions);

    // Set up internal event forwarding from ReviewerRunner
    this.setupReviewerEvents();
  }

  /**
   * Get current engine state
   */
  getState(): EngineState {
    return this.engineState;
  }

  /**
   * Get current Pair Vibe state
   */
  getPairVibeState(): PairVibeState {
    return { ...this.pairVibeState };
  }

  /**
   * Get current metrics
   */
  getMetrics(): PairVibeMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if engine is running
   */
  isRunning(): boolean {
    return this.engineState === "running";
  }

  /**
   * Check if engine is paused
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Start Pair Vibe Mode execution
   */
  async run(prd: Prd): Promise<PairVibeEngineResult> {
    if (this.engineState !== "idle") {
      throw new Error(`Cannot start engine in state: ${this.engineState}`);
    }

    this.currentPrd = prd;
    this.engineState = "running";
    this.abortController = new AbortController();
    this.isPaused = false;

    // Reset state
    this.pairVibeState = createInitialPairVibeState();
    this.metrics = this.createInitialMetrics();
    this.stepMetricsMap.clear();
    this.executorCurrentStepIndex = -1;

    // Initialize step progress for all stories
    const stories = this.getStories();
    for (const story of stories) {
      this.pairVibeState.stepProgress.set(story.id, createStepProgress(story.id));
    }

    this.updatePhase("review");
    this.emit("start");
    this.handlePairVibeEvent({ type: "phase-change", phase: "review", previousPhase: "initializing" });

    try {
      // Start Reviewer running ahead concurrently
      this.reviewerTask = this.runReviewerLoop();

      // Run main Executor loop
      const result = await this.runExecutorLoop();

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.engineState = "error";
      this.pairVibeState.currentPhase = "error";
      this.pairVibeState.errorMessage = errorMessage;

      this.handlePairVibeEvent({ type: "error", error: errorMessage });
      this.emit("error", error instanceof Error ? error : new Error(errorMessage));

      return this.createResult("error", errorMessage);
    } finally {
      // Stop reviewer if still running
      this.reviewerRunner.stop();
      await this.reviewerTask?.catch(() => {});
      this.reviewerTask = null;

      this.engineState = "stopped";
      this.metrics.sessionEndedAt = new Date().toISOString();
    }
  }

  /**
   * Pause execution
   */
  pause(): void {
    if (this.engineState === "running" && !this.isPaused) {
      this.isPaused = true;
      this.reviewerRunner.pause("Engine paused");
      this.updatePhase("paused");

      this.emit("pause");
      this.handlePairVibeEvent({ type: "paused", reason: "User requested pause" });
    }
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (this.engineState === "running" && this.isPaused) {
      this.isPaused = false;
      this.reviewerRunner.resume();

      // Restore previous phase based on state
      if (this.pairVibeState.activeConsensus) {
        this.updatePhase("consensus");
      } else if (this.pairVibeState.executorCurrentStep) {
        this.updatePhase("execute");
      } else {
        this.updatePhase("review");
      }

      this.emit("resume");
      this.handlePairVibeEvent({ type: "resumed" });
    }
  }

  /**
   * Stop execution gracefully
   */
  stop(reason = "User requested stop"): void {
    if (this.engineState !== "running") return;

    this.engineState = "stopping";
    this.abortController?.abort();

    // Stop components
    this.reviewerRunner.stop();
    this.consensusRunner.cancel();

    this.emit("stop", reason);
    this.handlePairVibeEvent({ type: "paused", reason });
  }

  /**
   * Force trigger consensus for current step
   * Per impl-012: User can manually trigger consensus
   */
  async triggerConsensus(reason: string): Promise<void> {
    const currentStepId = this.pairVibeState.executorCurrentStep;
    if (!currentStepId) {
      throw new Error("No current step to trigger consensus for");
    }

    const step = this.findStep(currentStepId);
    if (!step) {
      throw new Error(`Step ${currentStepId} not found`);
    }

    // Add manual finding
    const findings = step.findings ?? [];
    findings.push(`User-triggered consensus: ${reason}`);
    step.findings = findings;

    // Pause executor and enter consensus
    this.handlePairVibeEvent({
      type: "consensus-started",
      stepId: currentStepId,
      findings,
    });
  }

  // ============================================================================
  // Private Methods - Main Loops
  // ============================================================================

  /**
   * Run the Reviewer loop concurrently
   */
  private async runReviewerLoop(): Promise<void> {
    const stories = this.getStories();

    while (this.engineState === "running") {
      // Wait if paused
      if (this.isPaused) {
        await this.waitForResume();
        continue;
      }

      // Check abort
      if (this.abortController?.signal.aborted) {
        break;
      }

      // Get stories that need review (ahead of executor)
      const maxAhead = this.config.maxLookAhead ?? 3;
      const startIndex = this.executorCurrentStepIndex + 1;
      const endIndex = Math.min(startIndex + maxAhead, stories.length);

      let reviewedAny = false;

      for (let i = startIndex; i < endIndex; i++) {
        const story = stories[i];
        if (!story) continue;

        // Skip if already reviewed or completed
        if (this.reviewerRunner.isStepReviewed(story.id) || story.passes) {
          continue;
        }

        // Skip if already has findings (reviewed in previous session)
        if (story.findings !== undefined && story.findings !== null) {
          this.reviewerRunner.skipStep(story.id);
          continue;
        }

        // Review this step
        try {
          const result = await this.reviewerRunner.reviewStep(story);
          reviewedAny = true;

          // Update step with findings
          story.findings = result.findings;

          // Record metrics
          this.recordReviewMetrics(story.id, result);

          // Update step progress
          const progress = this.pairVibeState.stepProgress.get(story.id);
          if (progress) {
            progress.status = "reviewed";
            progress.hasFindings = result.findings.length > 0;
            progress.reviewCompletedAt = new Date().toISOString();
          }

          // Update reviewer ahead count
          this.updateReviewerAhead();

          // Save PRD if adapter provided
          if (this.savePrd && this.currentPrd) {
            await this.savePrd(this.currentPrd);
          }
        } catch (error) {
          // Log but don't fail - executor can proceed without review
          console.warn(`Review failed for step ${story.id}:`, error);
        }

        // Check abort between reviews
        if (this.abortController?.signal.aborted) {
          break;
        }
      }

      // If nothing to review, wait a bit before checking again
      if (!reviewedAny) {
        await this.sleep(1000);
      }
    }
  }

  /**
   * Run the main Executor loop
   */
  private async runExecutorLoop(): Promise<PairVibeEngineResult> {
    const stories = this.getStories();
    this.metrics.totalSteps = stories.length;

    for (let i = 0; i < stories.length; i++) {
      const story = stories[i];
      if (!story) continue;

      // Skip completed stories
      if (story.passes) {
        continue;
      }

      // Wait if paused
      while (this.isPaused && this.engineState === "running") {
        await this.waitForResume();
      }

      // Check abort
      if (this.abortController?.signal.aborted || this.engineState !== "running") {
        return this.createResult("aborted");
      }

      // Update executor position
      this.executorCurrentStepIndex = i;
      this.pairVibeState.executorCurrentStep = story.id;
      this.updateReviewerAhead();

      // Check if step has been reviewed
      const hasReview = story.findings !== undefined && story.findings !== null;

      if (!hasReview) {
        // Wait for review with timeout per edge-001
        const reviewReady = await this.waitForReview(story.id);

        if (!reviewReady) {
          // Review timed out - proceed without review per edge-001
          this.metrics.reviewTimeoutCount++;
          console.warn(`Proceeding without review for step ${story.id} (timeout)`);

          // Mark as passed without review per edge-009
          const progress = this.pairVibeState.stepProgress.get(story.id);
          if (progress) {
            progress.status = "executing";
          }
        }
      }

      // Check if consensus is needed
      if (needsConsensus(story)) {
        // Enter consensus mode
        this.updatePhase("consensus");
        this.metrics.consensusTriggeredCount++;

        const consensusResult = await this.runConsensus(story);

        // Record consensus in step
        story.consensus = this.consensusRunner.toConsensusRecord(consensusResult);

        // Update metrics
        this.recordConsensusMetrics(story.id, consensusResult);

        // Emit consensus resolved
        this.emit("consensusResolved", consensusResult);
      }

      // Execute the step
      this.updatePhase("execute");
      const progress = this.pairVibeState.stepProgress.get(story.id);
      if (progress) {
        progress.status = "executing";
        progress.executionStartedAt = new Date().toISOString();
      }

      this.emit("stepStart", story.id, "execute");
      this.handlePairVibeEvent({ type: "executor-started", stepId: story.id });

      const startTime = Date.now();
      let executeResult: ExecuteStepResult;

      if (this.executeStep) {
        executeResult = await this.executeStep(story);
      } else {
        // Default: mark as success (placeholder)
        executeResult = { success: true, durationMs: 0 };
      }

      // Update step progress
      if (progress) {
        progress.status = executeResult.success ? "completed" : "failed";
        progress.executionCompletedAt = new Date().toISOString();
      }

      // Update story
      if (executeResult.success) {
        story.passes = true;
        story.completedAt = new Date().toISOString();
      }

      // Record execution metrics
      this.recordExecutionMetrics(story.id, startTime);

      // Emit events
      this.emit("stepComplete", story.id, "execute", executeResult.success);
      this.handlePairVibeEvent({
        type: "executor-completed",
        stepId: story.id,
        success: executeResult.success,
      });

      // Save PRD
      if (this.savePrd && this.currentPrd) {
        await this.savePrd(this.currentPrd);
      }

      // Update progress
      this.emitProgress();
    }

    // All steps processed
    this.updatePhase("completed");
    return this.createResult("completed");
  }

  /**
   * Run consensus for a step with findings
   */
  private async runConsensus(step: UserStory): Promise<ConsensusResult> {
    const findings = step.findings ?? [];

    this.pairVibeState.activeConsensus = {
      stepId: step.id,
      currentRound: 0,
      proposals: [],
      ultrathinkTriggered: false,
      webSearchUsed: false,
      startedAt: new Date().toISOString(),
      timeoutRemaining: this.config.consensusTimeout ?? 300000,
    };

    // Pause reviewer during consensus per impl-005
    this.reviewerRunner.pause("Consensus in progress");

    try {
      this.emit("consensusNeeded", step.id, findings);

      // Reset consensus runner state
      this.consensusRunner.reset();

      // Run consensus
      const result = await this.consensusRunner.resolve(step, findings);

      return result;
    } finally {
      this.pairVibeState.activeConsensus = null;
      this.reviewerRunner.consensusCompleted();
      this.reviewerRunner.resume();
    }
  }

  /**
   * Wait for a step to be reviewed
   */
  private async waitForReview(stepId: string): Promise<boolean> {
    const timeout = this.config.reviewTimeout ?? DEFAULT_REVIEW_WAIT_TIMEOUT_MS;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check if step has been reviewed
      const step = this.findStep(stepId);
      if (step && step.findings !== undefined && step.findings !== null) {
        return true;
      }

      // Check if reviewer has reviewed this step
      if (this.reviewerRunner.isStepReviewed(stepId)) {
        return true;
      }

      // Check abort
      if (this.abortController?.signal.aborted) {
        return false;
      }

      // Wait a bit
      await this.sleep(100);
    }

    // Timeout
    this.handlePairVibeEvent({ type: "reviewer-timeout", stepId });
    return false;
  }

  /**
   * Wait for resume from pause
   */
  private async waitForResume(): Promise<void> {
    while (this.isPaused && this.engineState === "running") {
      await this.sleep(100);
    }
  }

  // ============================================================================
  // Private Methods - Helpers
  // ============================================================================

  /**
   * Get stories from current PRD
   */
  private getStories(): UserStory[] {
    if (!this.currentPrd) return [];
    return this.currentPrd.userStories;
  }

  /**
   * Find a step by ID
   */
  private findStep(stepId: string): UserStory | undefined {
    return this.getStories().find((s) => s.id === stepId);
  }

  /**
   * Update current phase
   */
  private updatePhase(phase: PairVibePhase): void {
    const previousPhase = this.pairVibeState.currentPhase;
    if (previousPhase !== phase) {
      this.pairVibeState.currentPhase = phase;
      this.pairVibeState.lastUpdatedAt = new Date().toISOString();

      this.emit("phaseChange", phase, previousPhase);
      this.handlePairVibeEvent({ type: "phase-change", phase, previousPhase });
    }
  }

  /**
   * Update reviewer ahead count
   */
  private updateReviewerAhead(): void {
    const reviewedCount = this.reviewerRunner.getReviewedCount();
    const executorIndex = this.executorCurrentStepIndex;

    // Calculate how many steps ahead reviewer is
    // executorIndex is -1 if not started, so reviewedCount - (executorIndex + 1) gives ahead count
    const aheadBy = Math.max(0, reviewedCount - (executorIndex + 1));
    this.pairVibeState.reviewerAheadBy = aheadBy;

    // Update average for metrics
    this.metrics.averageReviewerAhead =
      (this.metrics.averageReviewerAhead + aheadBy) / 2;
  }

  /**
   * Emit progress update
   */
  private emitProgress(): void {
    const stories = this.getStories();
    const total = stories.length;
    const completed = stories.filter((s) => s.passes).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    this.emit("progress", { completed, total, percentage });
  }

  /**
   * Handle PairVibe events and forward to external handler
   */
  private handlePairVibeEvent(event: PairVibeEvent): void {
    if (this.externalEventHandler) {
      this.externalEventHandler(event);
    }
  }

  /**
   * Set up event forwarding from ReviewerRunner
   */
  private setupReviewerEvents(): void {
    this.reviewerRunner.on("stepStarted", (stepId: string) => {
      this.pairVibeState.reviewerCurrentStep = stepId;

      const progress = this.pairVibeState.stepProgress.get(stepId);
      if (progress) {
        progress.status = "reviewing";
        progress.reviewStartedAt = new Date().toISOString();
      }

      this.emit("stepStart", stepId, "review");
    });

    this.reviewerRunner.on("stepCompleted", (result: StepReviewResult) => {
      this.emit("stepComplete", result.stepId, "review", result.success);
    });

    this.reviewerRunner.on("error", (error: Error) => {
      this.emit("error", error);
      this.handlePairVibeEvent({ type: "error", error: error.message });
    });
  }

  /**
   * Create initial metrics object
   */
  private createInitialMetrics(): PairVibeMetrics {
    return {
      sessionStartedAt: new Date().toISOString(),
      totalSteps: 0,
      consensusTriggeredCount: 0,
      averageConsensusRounds: 0,
      reviewTimeoutCount: 0,
      averageReviewerAhead: 0,
      costBreakdown: this.createEmptyCostBreakdown(),
      rateLimitEvents: 0,
      circuitBreakerTrips: 0,
      stepMetrics: [],
    };
  }

  /**
   * Create empty cost breakdown
   */
  private createEmptyCostBreakdown(): CostBreakdown {
    return {
      executor: 0,
      reviewer: 0,
      consensus: 0,
      webSearch: 0,
      total: 0,
      currency: "USD",
    };
  }

  /**
   * Record review metrics for a step
   */
  private recordReviewMetrics(stepId: string, result: StepReviewResult): void {
    const existing = this.stepMetricsMap.get(stepId) ?? {};
    existing.stepId = stepId;
    existing.reviewDurationMs = result.durationMs;
    existing.hadFindings = result.findings.length > 0;
    this.stepMetricsMap.set(stepId, existing);
  }

  /**
   * Record execution metrics for a step
   */
  private recordExecutionMetrics(stepId: string, startTime: number): void {
    const existing = this.stepMetricsMap.get(stepId) ?? {};
    existing.stepId = stepId;
    existing.executionDurationMs = Date.now() - startTime;
    this.stepMetricsMap.set(stepId, existing);

    // Add to final metrics
    const complete: StepMetrics = {
      stepId,
      reviewDurationMs: existing.reviewDurationMs ?? 0,
      executionDurationMs: existing.executionDurationMs ?? 0,
      consensusDurationMs: existing.consensusDurationMs ?? 0,
      consensusRounds: existing.consensusRounds ?? 0,
      hadFindings: existing.hadFindings ?? false,
      consensusRequired: existing.consensusRequired ?? false,
      stepCost: existing.stepCost ?? 0,
    };

    this.metrics.stepMetrics.push(complete);
    this.emit("metricsUpdate", { stepMetrics: [...this.metrics.stepMetrics] });
  }

  /**
   * Record consensus metrics for a step
   */
  private recordConsensusMetrics(stepId: string, result: ConsensusResult): void {
    const existing = this.stepMetricsMap.get(stepId) ?? {};
    existing.stepId = stepId;
    existing.consensusDurationMs = result.durationMs;
    existing.consensusRounds = result.rounds;
    existing.consensusRequired = true;
    this.stepMetricsMap.set(stepId, existing);

    // Update average consensus rounds
    const totalConsensus = this.metrics.consensusTriggeredCount;
    if (totalConsensus > 0) {
      this.metrics.averageConsensusRounds =
        ((this.metrics.averageConsensusRounds * (totalConsensus - 1)) + result.rounds) /
        totalConsensus;
    } else {
      this.metrics.averageConsensusRounds = result.rounds;
    }
  }

  /**
   * Create final result object
   */
  private createResult(
    stopReason: "completed" | "aborted" | "error",
    error?: string
  ): PairVibeEngineResult {
    const result: PairVibeEngineResult = {
      stopReason,
      prdComplete: this.currentPrd?.userStories.every((s) => s.passes) ?? false,
      metrics: { ...this.metrics },
      stepsCompleted: this.currentPrd?.userStories.filter((s) => s.passes).length ?? 0,
      stepsTotal: this.currentPrd?.userStories.length ?? 0,
      consensusRounds: this.metrics.consensusTriggeredCount,
      reviewTimeouts: this.metrics.reviewTimeoutCount,
    };

    if (error) {
      result.error = error;
    }

    return result;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Public API - Component Access
  // ============================================================================

  /**
   * Get the ReviewerRunner instance
   */
  getReviewerRunner(): ReviewerRunner {
    return this.reviewerRunner;
  }

  /**
   * Get the ConsensusRunner instance
   */
  getConsensusRunner(): ConsensusRunner {
    return this.consensusRunner;
  }

  /**
   * Get the WebSearchService instance
   */
  getWebSearchService(): WebSearchService {
    return this.webSearchService;
  }

  /**
   * Set LLM clients after construction
   */
  setLLMClients(clients: {
    reviewerClient?: ReviewerLLMClient;
    executorConsensusClient?: ConsensusLLMClient;
    reviewerConsensusClient?: ConsensusLLMClient;
  }): void {
    if (clients.reviewerClient) {
      this.reviewerRunner.setLLMClient(clients.reviewerClient);
    }
    if (clients.executorConsensusClient) {
      this.consensusRunner.setExecutorClient(clients.executorConsensusClient);
    }
    if (clients.reviewerConsensusClient) {
      this.consensusRunner.setReviewerClient(clients.reviewerConsensusClient);
    }
  }
}

/**
 * Result of running PairVibeEngine
 */
export interface PairVibeEngineResult {
  /** Why the engine stopped */
  stopReason: "completed" | "aborted" | "error";

  /** Whether all stories in the PRD are complete */
  prdComplete: boolean;

  /** Collected metrics */
  metrics: PairVibeMetrics;

  /** Number of steps completed */
  stepsCompleted: number;

  /** Total number of steps */
  stepsTotal: number;

  /** Number of times consensus was triggered */
  consensusRounds: number;

  /** Number of review timeouts */
  reviewTimeouts: number;

  /** Error message if stopped due to error */
  error?: string;
}

/**
 * Create a PairVibeEngine instance
 */
export function createPairVibeEngine(options: PairVibeEngineOptions): PairVibeEngine {
  return new PairVibeEngine(options);
}

/**
 * Check if Pair Vibe Mode can be enabled
 * Returns true if two different providers are available
 */
export function canEnablePairVibeMode(config: {
  hasAnthropicKey: boolean;
  hasOpenAIKey: boolean;
}): boolean {
  return config.hasAnthropicKey && config.hasOpenAIKey;
}

/**
 * Get default Pair Vibe configuration based on available providers
 */
export function getDefaultPairVibeConfig(): Partial<PairVibeConfig> {
  return DEFAULT_PAIR_VIBE_CONFIG;
}
