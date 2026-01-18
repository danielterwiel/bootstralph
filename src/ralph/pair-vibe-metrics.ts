/**
 * Pair Vibe Mode Metrics Service
 *
 * Tracks metrics during Pair Vibe Mode sessions:
 * - Consensus rounds per step
 * - Reviewer ahead distance over time
 * - Findings per step
 * - Time in each phase
 * - Cost per model
 *
 * Based on PRD spec impl-018:
 * - Write to .agents/metrics/pair-vibe-{timestamp}.json
 * - Display summary at end of ralph session
 */

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type {
  PairVibeEvent,
  PairVibeMetrics,
  StepMetrics,
  PairVibePhase,
  ConsensusResult,
  PairVibeConfig,
  ModelIdentifier,
} from "./pair-vibe-types.js";
import type { ApiProvider } from "./api-keys.js";

/**
 * Model pricing per 1M tokens (USD)
 * Based on review-008 findings
 */
export const MODEL_PRICING: Record<
  ModelIdentifier,
  { inputPerM: number; outputPerM: number }
> = {
  // Claude models
  "claude-sonnet-4-20250514": { inputPerM: 3.0, outputPerM: 15.0 },
  "claude-opus-4-20250514": { inputPerM: 15.0, outputPerM: 75.0 },
  "claude-sonnet-4-5-20250514": { inputPerM: 3.0, outputPerM: 15.0 },
  // OpenAI models
  "gpt-4o": { inputPerM: 2.5, outputPerM: 10.0 },
  "gpt-4.1": { inputPerM: 2.0, outputPerM: 8.0 },
  o1: { inputPerM: 15.0, outputPerM: 60.0 },
  o3: { inputPerM: 2.0, outputPerM: 8.0 },
  "o3-mini": { inputPerM: 1.1, outputPerM: 4.4 },
};

/**
 * Web search pricing
 * Based on review-002 findings: Tavily $0.008/credit
 */
export const WEB_SEARCH_COST_PER_QUERY = 0.008;

/**
 * Token usage for a single operation
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

/**
 * Phase timing entry
 */
export interface PhaseTiming {
  phase: PairVibePhase;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
}

/**
 * Per-step detailed metrics
 */
export interface DetailedStepMetrics extends StepMetrics {
  /** Web searches performed for this step */
  webSearchCount: number;

  /** Token usage for review */
  reviewTokens?: TokenUsage | undefined;

  /** Token usage for execution */
  executionTokens?: TokenUsage | undefined;

  /** Token usage for consensus (if applicable) */
  consensusTokens?: TokenUsage | undefined;

  /** Model used for review */
  reviewModel?: ModelIdentifier | undefined;

  /** Model used for execution */
  executionModel?: ModelIdentifier | undefined;

  /** Whether this step passed without review (timeout) */
  passedWithoutReview: boolean;

  /** Findings text (if any) */
  findings?: string[] | undefined;

  /** Consensus decision (if applicable) */
  consensusDecision?: string | undefined;
}

/**
 * Internal tracking for step metrics (includes timestamps)
 */
interface InternalStepMetrics extends Partial<DetailedStepMetrics> {
  executionStartedAt?: string;
  executionSuccess?: boolean;
  consensusStartedAt?: string;
}

/**
 * Extended metrics with detailed tracking
 */
export interface DetailedPairVibeMetrics extends PairVibeMetrics {
  /** Configuration used for this session */
  config: {
    executorProvider: ApiProvider;
    reviewerProvider: ApiProvider;
    executorModel: ModelIdentifier;
    reviewerModel: ModelIdentifier;
    maxLookAhead: number;
    reviewTimeout: number;
    consensusTimeout: number;
    maxConsensusRounds: number;
  };

  /** Phase timings throughout the session */
  phaseTimings: PhaseTiming[];

  /** Reviewer ahead distance samples over time */
  reviewerAheadSamples: Array<{
    timestamp: string;
    aheadBy: number;
  }>;

  /** Detailed per-step metrics */
  detailedStepMetrics: DetailedStepMetrics[];

  /** Token usage totals by role */
  tokenUsage: {
    executor: TokenUsage;
    reviewer: TokenUsage;
    consensus: TokenUsage;
    total: TokenUsage;
  };

  /** Web search statistics */
  webSearchStats: {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    totalCost: number;
  };

  /** Sycophancy risk flags detected */
  sycophancyRiskCount: number;

  /** Circuit breaker state changes */
  circuitBreakerEvents: Array<{
    timestamp: string;
    provider: ApiProvider;
    state: "open" | "half-open" | "closed";
  }>;

  /** Session outcome */
  outcome: "completed" | "aborted" | "error";

  /** Error message if outcome is error */
  errorMessage?: string;
}

/**
 * Summary for display at end of session
 */
export interface PairVibeSessionSummary {
  /** Total duration in human-readable format */
  duration: string;

  /** Total steps completed */
  stepsCompleted: number;

  /** Total steps */
  totalSteps: number;

  /** Completion percentage */
  completionPercentage: number;

  /** Total cost */
  totalCost: string;

  /** Cost breakdown by component */
  costBreakdown: {
    executor: string;
    reviewer: string;
    consensus: string;
    webSearch: string;
  };

  /** Consensus statistics */
  consensus: {
    triggered: number;
    averageRounds: number;
    executorWins: number;
    reviewerWins: number;
    alignedCount: number;
  };

  /** Review statistics */
  review: {
    completed: number;
    timeouts: number;
    stepsWithFindings: number;
    averageAheadDistance: number;
  };

  /** Rate limit and degradation info */
  reliability: {
    rateLimitEvents: number;
    circuitBreakerTrips: number;
    degradedModeTime: string;
  };

  /** Performance hints based on metrics */
  hints: string[];
}

/**
 * Options for PairVibeMetricsService
 */
export interface PairVibeMetricsServiceOptions {
  /** Base directory for metrics files (default: .agents/metrics) */
  metricsDir?: string;

  /** Configuration for Pair Vibe Mode */
  config: PairVibeConfig;

  /** Whether to auto-save on events */
  autoSave?: boolean;

  /** Auto-save interval in ms (default: 30000) */
  autoSaveInterval?: number;
}

/**
 * PairVibeMetricsService - Collects and persists metrics for Pair Vibe Mode
 */
export class PairVibeMetricsService {
  private readonly metricsDir: string;
  private readonly config: PairVibeConfig;
  private readonly autoSave: boolean;
  private readonly autoSaveInterval: number;

  private sessionId: string;
  private metrics: DetailedPairVibeMetrics;
  private stepMetricsMap: Map<string, InternalStepMetrics> = new Map();
  private currentPhaseStart: { phase: PairVibePhase; startedAt: string } | null = null;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private degradedModeStartedAt: string | null = null;
  private totalDegradedMs = 0;

  constructor(options: PairVibeMetricsServiceOptions) {
    this.metricsDir = options.metricsDir ?? ".agents/metrics";
    this.config = options.config;
    this.autoSave = options.autoSave ?? true;
    this.autoSaveInterval = options.autoSaveInterval ?? 30000;

    this.sessionId = this.generateSessionId();
    this.metrics = this.createInitialMetrics();
  }

  /**
   * Start metrics collection
   */
  start(): void {
    this.metrics.sessionStartedAt = new Date().toISOString();
    this.currentPhaseStart = {
      phase: "initializing",
      startedAt: this.metrics.sessionStartedAt,
    };

    if (this.autoSave) {
      this.autoSaveTimer = setInterval(() => {
        void this.save();
      }, this.autoSaveInterval);
    }
  }

  /**
   * Stop metrics collection and finalize
   */
  async stop(outcome: "completed" | "aborted" | "error", errorMessage?: string): Promise<void> {
    // Stop auto-save
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    // Finalize current phase
    if (this.currentPhaseStart) {
      this.recordPhaseTiming(this.currentPhaseStart.phase);
    }

    // Finalize degraded mode time
    if (this.degradedModeStartedAt) {
      this.totalDegradedMs += Date.now() - new Date(this.degradedModeStartedAt).getTime();
    }

    // Set final values
    this.metrics.sessionEndedAt = new Date().toISOString();
    this.metrics.outcome = outcome;
    if (errorMessage) {
      this.metrics.errorMessage = errorMessage;
    }

    // Finalize step metrics
    this.finalizeStepMetrics();

    // Calculate final cost breakdown
    this.calculateFinalCosts();

    // Save final metrics
    await this.save();
  }

  /**
   * Handle a PairVibeEvent and update metrics
   */
  handleEvent(event: PairVibeEvent): void {
    const timestamp = new Date().toISOString();

    switch (event.type) {
      case "phase-change":
        this.handlePhaseChange(event.phase, event.previousPhase, timestamp);
        break;

      case "reviewer-started":
        this.initStepMetrics(event.stepId);
        break;

      case "reviewer-completed":
        this.recordReviewCompletion(event.stepId, event.hasFindings);
        break;

      case "reviewer-timeout":
        this.recordReviewTimeout(event.stepId);
        break;

      case "executor-started":
        this.recordExecutorStart(event.stepId, timestamp);
        break;

      case "executor-completed":
        this.recordExecutorCompletion(event.stepId, event.success);
        break;

      case "consensus-started":
        this.recordConsensusStart(event.stepId, event.findings);
        break;

      case "consensus-round":
        // Track round counts in step metrics
        this.incrementConsensusRound(event.stepId, event.round);
        break;

      case "consensus-completed":
        this.recordConsensusCompletion(event.result);
        break;

      case "consensus-timeout":
        this.metrics.reviewTimeoutCount++;
        break;

      case "web-search-started":
        this.incrementWebSearchCount(event.stepId);
        break;

      case "web-search-completed":
        this.metrics.webSearchStats.successfulQueries++;
        break;

      case "web-search-failed":
        this.metrics.webSearchStats.failedQueries++;
        break;

      case "rate-limit-hit":
        this.metrics.rateLimitEvents++;
        break;

      case "circuit-open":
        this.recordCircuitBreakerEvent(event.provider, "open", timestamp);
        this.metrics.circuitBreakerTrips++;
        break;

      case "circuit-half-open":
        this.recordCircuitBreakerEvent(event.provider, "half-open", timestamp);
        break;

      case "circuit-closed":
        this.recordCircuitBreakerEvent(event.provider, "closed", timestamp);
        break;

      case "degraded-mode":
        this.degradedModeStartedAt = timestamp;
        break;

      case "resumed":
        if (this.degradedModeStartedAt) {
          this.totalDegradedMs += Date.now() - new Date(this.degradedModeStartedAt).getTime();
          this.degradedModeStartedAt = null;
        }
        break;

      case "cost-update":
        this.metrics.costBreakdown = event.breakdown;
        break;

      default:
        // Other events don't affect metrics
        break;
    }

    // Sample reviewer ahead distance
    if (event.type === "reviewer-completed" || event.type === "executor-completed") {
      this.sampleReviewerAhead();
    }
  }

  /**
   * Record token usage for an operation
   */
  recordTokenUsage(
    stepId: string | null,
    role: "executor" | "reviewer" | "consensus",
    usage: TokenUsage
  ): void {
    // Update total token usage
    const totals = this.metrics.tokenUsage;
    totals[role].inputTokens += usage.inputTokens;
    totals[role].outputTokens += usage.outputTokens;
    if (usage.cachedInputTokens) {
      totals[role].cachedInputTokens =
        (totals[role].cachedInputTokens ?? 0) + usage.cachedInputTokens;
    }

    // Update total
    totals.total.inputTokens += usage.inputTokens;
    totals.total.outputTokens += usage.outputTokens;
    if (usage.cachedInputTokens) {
      totals.total.cachedInputTokens =
        (totals.total.cachedInputTokens ?? 0) + usage.cachedInputTokens;
    }

    // Update step metrics if applicable
    if (stepId) {
      const step = this.stepMetricsMap.get(stepId) ?? {};
      if (role === "executor") {
        step.executionTokens = usage;
      } else if (role === "reviewer") {
        step.reviewTokens = usage;
      } else if (role === "consensus") {
        step.consensusTokens = usage;
      }
      this.stepMetricsMap.set(stepId, step);
    }

    // Calculate costs
    this.updateCostFromTokens(role, usage);
  }

  /**
   * Record reviewer's current ahead distance
   */
  recordReviewerAhead(aheadBy: number): void {
    this.metrics.reviewerAheadSamples.push({
      timestamp: new Date().toISOString(),
      aheadBy,
    });

    // Update running average
    const samples = this.metrics.reviewerAheadSamples;
    const sum = samples.reduce((acc, s) => acc + s.aheadBy, 0);
    this.metrics.averageReviewerAhead = sum / samples.length;
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): DetailedPairVibeMetrics {
    return { ...this.metrics };
  }

  /**
   * Generate a session summary for display
   */
  generateSummary(): PairVibeSessionSummary {
    const startTime = new Date(this.metrics.sessionStartedAt).getTime();
    const endTime = this.metrics.sessionEndedAt
      ? new Date(this.metrics.sessionEndedAt).getTime()
      : Date.now();
    const durationMs = endTime - startTime;

    const stepsCompleted = this.metrics.stepMetrics.filter(
      (s) => s.executionDurationMs > 0
    ).length;
    const stepsWithFindings = this.metrics.detailedStepMetrics.filter(
      (s) => s.hadFindings
    ).length;

    // Count consensus outcomes
    let executorWins = 0;
    let reviewerWins = 0;
    let alignedCount = 0;
    for (const step of this.metrics.detailedStepMetrics) {
      if (step.consensusRequired) {
        if (step.consensusDecision?.includes("executor")) {
          executorWins++;
        } else if (step.consensusDecision?.includes("reviewer")) {
          reviewerWins++;
        } else if (step.consensusDecision?.includes("consensus")) {
          alignedCount++;
        }
      }
    }

    // Performance hints
    const hints: string[] = [];
    if (this.metrics.reviewTimeoutCount > 0) {
      hints.push(
        `${this.metrics.reviewTimeoutCount} steps proceeded without review due to timeouts. Consider increasing review timeout or using a faster reviewer model.`
      );
    }
    if (this.metrics.averageConsensusRounds > 1.5) {
      hints.push(
        `Average consensus took ${this.metrics.averageConsensusRounds.toFixed(1)} rounds. High consensus friction may indicate task ambiguity.`
      );
    }
    if (this.metrics.circuitBreakerTrips > 0) {
      hints.push(
        `Circuit breaker tripped ${this.metrics.circuitBreakerTrips} times. Consider rate limit headroom or provider diversity.`
      );
    }
    if (this.metrics.sycophancyRiskCount > 0) {
      hints.push(
        `${this.metrics.sycophancyRiskCount} consensus rounds flagged for potential sycophancy. Review aligned proposals carefully.`
      );
    }

    return {
      duration: this.formatDuration(durationMs),
      stepsCompleted,
      totalSteps: this.metrics.totalSteps,
      completionPercentage:
        this.metrics.totalSteps > 0
          ? Math.round((stepsCompleted / this.metrics.totalSteps) * 100)
          : 0,
      totalCost: this.formatCost(this.metrics.costBreakdown.total),
      costBreakdown: {
        executor: this.formatCost(this.metrics.costBreakdown.executor),
        reviewer: this.formatCost(this.metrics.costBreakdown.reviewer),
        consensus: this.formatCost(this.metrics.costBreakdown.consensus),
        webSearch: this.formatCost(this.metrics.costBreakdown.webSearch),
      },
      consensus: {
        triggered: this.metrics.consensusTriggeredCount,
        averageRounds: Math.round(this.metrics.averageConsensusRounds * 10) / 10,
        executorWins,
        reviewerWins,
        alignedCount,
      },
      review: {
        completed: this.metrics.stepMetrics.filter((s) => s.reviewDurationMs > 0).length,
        timeouts: this.metrics.reviewTimeoutCount,
        stepsWithFindings,
        averageAheadDistance: Math.round(this.metrics.averageReviewerAhead * 10) / 10,
      },
      reliability: {
        rateLimitEvents: this.metrics.rateLimitEvents,
        circuitBreakerTrips: this.metrics.circuitBreakerTrips,
        degradedModeTime: this.formatDuration(this.totalDegradedMs),
      },
      hints,
    };
  }

  /**
   * Format summary for console display
   */
  formatSummaryForConsole(summary: PairVibeSessionSummary): string {
    const lines: string[] = [];

    lines.push("");
    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push("                    PAIR VIBE MODE SUMMARY                      ");
    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push("");

    // Progress
    lines.push(`  Duration:    ${summary.duration}`);
    lines.push(
      `  Progress:    ${summary.stepsCompleted}/${summary.totalSteps} steps (${summary.completionPercentage}%)`
    );
    lines.push("");

    // Cost
    lines.push("  Cost Breakdown:");
    lines.push(`    Executor:   ${summary.costBreakdown.executor}`);
    lines.push(`    Reviewer:   ${summary.costBreakdown.reviewer}`);
    lines.push(`    Consensus:  ${summary.costBreakdown.consensus}`);
    lines.push(`    Web Search: ${summary.costBreakdown.webSearch}`);
    lines.push(`    ─────────────────────`);
    lines.push(`    Total:      ${summary.totalCost}`);
    lines.push("");

    // Consensus
    if (summary.consensus.triggered > 0) {
      lines.push("  Consensus:");
      lines.push(`    Triggered:       ${summary.consensus.triggered} times`);
      lines.push(`    Avg Rounds:      ${summary.consensus.averageRounds}`);
      lines.push(
        `    Outcomes:        ${summary.consensus.alignedCount} aligned, ${summary.consensus.executorWins} executor wins, ${summary.consensus.reviewerWins} reviewer wins`
      );
      lines.push("");
    }

    // Review
    lines.push("  Review:");
    lines.push(`    Completed:       ${summary.review.completed} steps`);
    lines.push(`    With Findings:   ${summary.review.stepsWithFindings} steps`);
    lines.push(`    Timeouts:        ${summary.review.timeouts}`);
    lines.push(`    Avg Ahead:       ${summary.review.averageAheadDistance} steps`);
    lines.push("");

    // Reliability
    if (
      summary.reliability.rateLimitEvents > 0 ||
      summary.reliability.circuitBreakerTrips > 0
    ) {
      lines.push("  Reliability:");
      lines.push(`    Rate Limits:     ${summary.reliability.rateLimitEvents} events`);
      lines.push(`    Circuit Trips:   ${summary.reliability.circuitBreakerTrips}`);
      if (summary.reliability.degradedModeTime !== "0s") {
        lines.push(`    Degraded Time:   ${summary.reliability.degradedModeTime}`);
      }
      lines.push("");
    }

    // Hints
    if (summary.hints.length > 0) {
      lines.push("  Performance Hints:");
      for (const hint of summary.hints) {
        lines.push(`    • ${hint}`);
      }
      lines.push("");
    }

    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Save metrics to file
   */
  async save(): Promise<string> {
    const filePath = this.getMetricsFilePath();

    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Write metrics
    await writeFile(filePath, JSON.stringify(this.metrics, null, 2), "utf-8");

    return filePath;
  }

  /**
   * Get the metrics file path
   */
  getMetricsFilePath(): string {
    return join(this.metricsDir, `pair-vibe-${this.sessionId}.json`);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generateSessionId(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, "");
    const time = now.toISOString().slice(11, 19).replace(/:/g, "");
    return `${date}-${time}`;
  }

  private createInitialMetrics(): DetailedPairVibeMetrics {
    return {
      sessionStartedAt: new Date().toISOString(),
      totalSteps: 0,
      consensusTriggeredCount: 0,
      averageConsensusRounds: 0,
      reviewTimeoutCount: 0,
      averageReviewerAhead: 0,
      costBreakdown: {
        executor: 0,
        reviewer: 0,
        consensus: 0,
        webSearch: 0,
        total: 0,
        currency: "USD",
      },
      rateLimitEvents: 0,
      circuitBreakerTrips: 0,
      stepMetrics: [],
      config: {
        executorProvider: this.config.executorProvider,
        reviewerProvider: this.config.reviewerProvider,
        executorModel: this.config.executorModel,
        reviewerModel: this.config.reviewerModel,
        maxLookAhead: this.config.maxLookAhead ?? 3,
        reviewTimeout: this.config.reviewTimeout ?? 120000,
        consensusTimeout: this.config.consensusTimeout ?? 300000,
        maxConsensusRounds: this.config.maxConsensusRounds ?? 2,
      },
      phaseTimings: [],
      reviewerAheadSamples: [],
      detailedStepMetrics: [],
      tokenUsage: {
        executor: { inputTokens: 0, outputTokens: 0 },
        reviewer: { inputTokens: 0, outputTokens: 0 },
        consensus: { inputTokens: 0, outputTokens: 0 },
        total: { inputTokens: 0, outputTokens: 0 },
      },
      webSearchStats: {
        totalQueries: 0,
        successfulQueries: 0,
        failedQueries: 0,
        totalCost: 0,
      },
      sycophancyRiskCount: 0,
      circuitBreakerEvents: [],
      outcome: "completed",
    };
  }

  private handlePhaseChange(
    phase: PairVibePhase,
    previousPhase: PairVibePhase,
    timestamp: string
  ): void {
    // Record timing for previous phase
    if (this.currentPhaseStart) {
      this.recordPhaseTiming(previousPhase);
    }

    // Start timing for new phase
    this.currentPhaseStart = { phase, startedAt: timestamp };
  }

  private recordPhaseTiming(phase: PairVibePhase): void {
    if (!this.currentPhaseStart) return;

    const endedAt = new Date().toISOString();
    const durationMs =
      new Date(endedAt).getTime() - new Date(this.currentPhaseStart.startedAt).getTime();

    this.metrics.phaseTimings.push({
      phase,
      startedAt: this.currentPhaseStart.startedAt,
      endedAt,
      durationMs,
    });
  }

  private initStepMetrics(stepId: string): void {
    if (!this.stepMetricsMap.has(stepId)) {
      this.stepMetricsMap.set(stepId, {
        stepId,
        reviewDurationMs: 0,
        executionDurationMs: 0,
        consensusDurationMs: 0,
        consensusRounds: 0,
        hadFindings: false,
        consensusRequired: false,
        stepCost: 0,
        webSearchCount: 0,
        passedWithoutReview: false,
        reviewModel: this.config.reviewerModel,
        executionModel: this.config.executorModel,
      });
    }
  }

  private recordReviewCompletion(stepId: string, hasFindings: boolean): void {
    const step = this.stepMetricsMap.get(stepId) ?? {};
    step.hadFindings = hasFindings;
    this.stepMetricsMap.set(stepId, step);
  }

  private recordReviewTimeout(stepId: string): void {
    const step = this.stepMetricsMap.get(stepId) ?? {};
    step.passedWithoutReview = true;
    this.stepMetricsMap.set(stepId, step);
    this.metrics.reviewTimeoutCount++;
  }

  private recordExecutorStart(stepId: string, timestamp: string): void {
    this.initStepMetrics(stepId);
    const step = this.stepMetricsMap.get(stepId)!;
    step.executionStartedAt = timestamp;
  }

  private recordExecutorCompletion(stepId: string, success: boolean): void {
    const step = this.stepMetricsMap.get(stepId) ?? {};
    if (step.executionStartedAt) {
      step.executionDurationMs =
        Date.now() - new Date(step.executionStartedAt).getTime();
    }
    step.executionSuccess = success;
    this.stepMetricsMap.set(stepId, step);
  }

  private recordConsensusStart(stepId: string, findings: string[]): void {
    const step = this.stepMetricsMap.get(stepId) ?? {};
    step.consensusRequired = true;
    step.findings = findings;
    step.consensusStartedAt = new Date().toISOString();
    this.stepMetricsMap.set(stepId, step);
    this.metrics.consensusTriggeredCount++;
  }

  private incrementConsensusRound(stepId: string, round: number): void {
    const step = this.stepMetricsMap.get(stepId) ?? {};
    step.consensusRounds = round;
    this.stepMetricsMap.set(stepId, step);
  }

  private recordConsensusCompletion(result: ConsensusResult): void {
    const step = this.stepMetricsMap.get(result.stepId) ?? {};
    step.consensusDurationMs = result.durationMs;
    step.consensusRounds = result.rounds;
    step.consensusDecision = result.decidedBy;
    this.stepMetricsMap.set(result.stepId, step);

    // Update average consensus rounds
    this.updateAverageConsensusRounds(result.rounds);

    // Check for sycophancy risk
    if (result.proposalSimilarity !== undefined && result.proposalSimilarity > 0.95) {
      this.metrics.sycophancyRiskCount++;
    }
    if (result.aligned && result.rounds === 1 && result.durationMs < 30000) {
      this.metrics.sycophancyRiskCount++;
    }
  }

  private incrementWebSearchCount(stepId: string): void {
    const step = this.stepMetricsMap.get(stepId) ?? {};
    step.webSearchCount = (step.webSearchCount ?? 0) + 1;
    this.stepMetricsMap.set(stepId, step);

    this.metrics.webSearchStats.totalQueries++;
    this.metrics.webSearchStats.totalCost += WEB_SEARCH_COST_PER_QUERY;
    this.metrics.costBreakdown.webSearch += WEB_SEARCH_COST_PER_QUERY;
    this.metrics.costBreakdown.total += WEB_SEARCH_COST_PER_QUERY;
  }

  private recordCircuitBreakerEvent(
    provider: ApiProvider,
    state: "open" | "half-open" | "closed",
    timestamp: string
  ): void {
    this.metrics.circuitBreakerEvents.push({ timestamp, provider, state });
  }

  private sampleReviewerAhead(): void {
    // This is called from engine, which provides the actual ahead count
    // For now, we'll just note that a sample should be taken
    // The engine calls recordReviewerAhead() with the actual value
  }

  private updateAverageConsensusRounds(rounds: number): void {
    const count = this.metrics.consensusTriggeredCount;
    if (count === 1) {
      this.metrics.averageConsensusRounds = rounds;
    } else {
      this.metrics.averageConsensusRounds =
        (this.metrics.averageConsensusRounds * (count - 1) + rounds) / count;
    }
  }

  private updateCostFromTokens(role: "executor" | "reviewer" | "consensus", usage: TokenUsage): void {
    let model: ModelIdentifier;

    if (role === "executor") {
      model = this.config.executorModel;
    } else if (role === "reviewer") {
      model = this.config.reviewerModel;
    } else {
      // Consensus uses both models, but we'll attribute to executor for simplicity
      model = this.config.executorModel;
    }

    const pricing = MODEL_PRICING[model];
    if (!pricing) return;

    // Calculate cost (account for caching - 90% discount per review-005)
    const effectiveInputTokens =
      usage.inputTokens - (usage.cachedInputTokens ?? 0) * 0.9;
    const inputCost = (effectiveInputTokens / 1_000_000) * pricing.inputPerM;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPerM;
    const totalCost = inputCost + outputCost;

    // Update cost breakdown
    if (role === "executor") {
      this.metrics.costBreakdown.executor += totalCost;
    } else if (role === "reviewer") {
      this.metrics.costBreakdown.reviewer += totalCost;
    } else {
      this.metrics.costBreakdown.consensus += totalCost;
    }
    this.metrics.costBreakdown.total += totalCost;
  }

  private finalizeStepMetrics(): void {
    // Convert map to array
    this.metrics.detailedStepMetrics = Array.from(this.stepMetricsMap.values()).map(
      (partial) => ({
        stepId: partial.stepId ?? "",
        reviewDurationMs: partial.reviewDurationMs ?? 0,
        executionDurationMs: partial.executionDurationMs ?? 0,
        consensusDurationMs: partial.consensusDurationMs ?? 0,
        consensusRounds: partial.consensusRounds ?? 0,
        hadFindings: partial.hadFindings ?? false,
        consensusRequired: partial.consensusRequired ?? false,
        stepCost: partial.stepCost ?? 0,
        webSearchCount: partial.webSearchCount ?? 0,
        passedWithoutReview: partial.passedWithoutReview ?? false,
        reviewTokens: partial.reviewTokens,
        executionTokens: partial.executionTokens,
        consensusTokens: partial.consensusTokens,
        reviewModel: partial.reviewModel,
        executionModel: partial.executionModel,
        findings: partial.findings,
        consensusDecision: partial.consensusDecision,
      })
    );

    // Also populate the base stepMetrics array for compatibility
    this.metrics.stepMetrics = this.metrics.detailedStepMetrics.map((d) => ({
      stepId: d.stepId,
      reviewDurationMs: d.reviewDurationMs,
      executionDurationMs: d.executionDurationMs,
      consensusDurationMs: d.consensusDurationMs,
      consensusRounds: d.consensusRounds,
      hadFindings: d.hadFindings,
      consensusRequired: d.consensusRequired,
      stepCost: d.stepCost,
    }));
  }

  private calculateFinalCosts(): void {
    // Recalculate total to ensure accuracy
    this.metrics.costBreakdown.total =
      this.metrics.costBreakdown.executor +
      this.metrics.costBreakdown.reviewer +
      this.metrics.costBreakdown.consensus +
      this.metrics.costBreakdown.webSearch;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) {
      const mins = Math.floor(ms / 60000);
      const secs = Math.round((ms % 60000) / 1000);
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    const hours = Math.floor(ms / 3600000);
    const mins = Math.round((ms % 3600000) / 60000);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  private formatCost(cost: number): string {
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    if (cost < 1) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(2)}`;
  }
}

/**
 * Create a PairVibeMetricsService instance
 */
export function createPairVibeMetricsService(
  options: PairVibeMetricsServiceOptions
): PairVibeMetricsService {
  return new PairVibeMetricsService(options);
}

/**
 * Calculate estimated cost multiplier for Pair Vibe Mode
 * Based on review-008 findings: 2.2-3.5x depending on consensus frequency
 */
export function estimateCostMultiplier(expectedConsensusRate: number): {
  multiplier: number;
  breakdown: string;
} {
  // Base: Executor (1.0x) + Reviewer (0.6x) = 1.6x
  const base = 1.6;

  // Consensus overhead: each consensus adds ~0.5x, ultrathink adds +1.5x
  // Average 1.5 rounds per consensus
  const consensusOverhead = expectedConsensusRate * (0.5 + 0.75);

  const multiplier = base + consensusOverhead;

  let breakdown: string;
  if (expectedConsensusRate < 0.15) {
    breakdown = "Low friction (< 15% consensus rate)";
  } else if (expectedConsensusRate < 0.30) {
    breakdown = "Medium friction (15-30% consensus rate)";
  } else {
    breakdown = "High friction (> 30% consensus rate)";
  }

  return {
    multiplier: Math.round(multiplier * 10) / 10,
    breakdown,
  };
}
