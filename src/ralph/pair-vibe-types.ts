/**
 * Pair Vibe Mode Configuration Types
 *
 * Defines interfaces for Pair Vibe Mode configuration and state management.
 * Multi-model Ralph'ing with concurrent review and consensus resolution.
 *
 * Based on PRD specifications:
 * - PairVibeConfig: Mode configuration with provider/model assignment
 * - PairVibeState: Runtime state tracking phases and progress
 * - ConsensusResult: Result of a consensus resolution round
 */

import type { ApiProvider } from "./api-keys";
import type { ConsensusRecord } from "./prd-schema";

/**
 * Model identifiers for each provider.
 * Extended thinking models for consensus mode.
 */
export type ClaudeModel =
  | "claude-sonnet-4-20250514"
  | "claude-opus-4-20250514"
  | "claude-sonnet-4-5-20250514";

export type OpenAIModel =
  | "gpt-4o"
  | "gpt-4.1"
  | "o1"
  | "o3"
  | "o3-mini";

export type ModelIdentifier = ClaudeModel | OpenAIModel;

/**
 * Configuration for Pair Vibe Mode
 */
export interface PairVibeConfig {
  /** Whether Pair Vibe Mode is enabled */
  enabled: boolean;

  /** Provider for the Executor model (runs the standard Ralph loop) */
  executorProvider: ApiProvider;

  /** Provider for the Reviewer model (works ahead, validates steps) */
  reviewerProvider: ApiProvider;

  /** Specific model for the Executor */
  executorModel: ModelIdentifier;

  /** Specific model for the Reviewer */
  reviewerModel: ModelIdentifier;

  /**
   * Maximum steps the Reviewer can be ahead of Executor.
   * Default: 3 steps
   */
  maxLookAhead?: number;

  /**
   * Maximum wait time (ms) for Reviewer before Executor proceeds without review.
   * Default: 120000 (2 minutes) per review-007 findings
   */
  reviewTimeout?: number;

  /**
   * Maximum time (ms) for a consensus round.
   * Default: 300000 (5 minutes)
   */
  consensusTimeout?: number;

  /**
   * Maximum consensus rounds before Executor wins by default.
   * Default: 2 (per edge-003)
   */
  maxConsensusRounds?: number;

  /**
   * Whether to enable web search for Reviewer.
   * Default: true
   */
  webSearchEnabled?: boolean;

  /**
   * Whether to show cost warnings to user.
   * Default: true
   */
  showCostWarnings?: boolean;
}

/**
 * Default configuration values for Pair Vibe Mode
 */
export const DEFAULT_PAIR_VIBE_CONFIG: Partial<PairVibeConfig> = {
  maxLookAhead: 3,
  reviewTimeout: 120000, // 2 minutes per review-007
  consensusTimeout: 300000, // 5 minutes
  maxConsensusRounds: 2, // per edge-003
  webSearchEnabled: true,
  showCostWarnings: true,
};

/**
 * Phase of Pair Vibe Mode execution
 */
export type PairVibePhase =
  | "initializing"
  | "review"
  | "execute"
  | "consensus"
  | "paused"
  | "completed"
  | "error";

/**
 * Progress tracking for a single step
 */
export interface StepProgress {
  /** Step/story ID */
  stepId: string;

  /** Current status of this step */
  status: "pending" | "reviewing" | "reviewed" | "executing" | "completed" | "failed";

  /** Whether the review found issues (null = not reviewed yet) */
  hasFindings: boolean | null;

  /** Whether consensus was required */
  consensusRequired: boolean;

  /** Whether consensus was reached (if required) */
  consensusReached: boolean | null;

  /** Timestamp when review started */
  reviewStartedAt?: string;

  /** Timestamp when review completed */
  reviewCompletedAt?: string;

  /** Timestamp when execution started */
  executionStartedAt?: string;

  /** Timestamp when execution completed */
  executionCompletedAt?: string;
}

/**
 * Runtime state of Pair Vibe Mode
 */
export interface PairVibeState {
  /** Current execution phase */
  currentPhase: PairVibePhase;

  /** Step ID the Reviewer is currently working on (or last completed) */
  reviewerCurrentStep: string | null;

  /** Number of steps the Reviewer is ahead of Executor */
  reviewerAheadBy: number;

  /** Step ID the Executor is currently working on (or last completed) */
  executorCurrentStep: string | null;

  /** Progress tracking per step */
  stepProgress: Map<string, StepProgress>;

  /** Current consensus session (if in consensus phase) */
  activeConsensus: ConsensusSession | null;

  /** Whether Pair Vibe Mode is paused */
  isPaused: boolean;

  /** Error message if in error state */
  errorMessage?: string;

  /** Timestamp when Pair Vibe Mode started */
  startedAt: string;

  /** Timestamp of last state update */
  lastUpdatedAt: string;
}

/**
 * Active consensus session state
 */
export interface ConsensusSession {
  /** Step ID being resolved */
  stepId: string;

  /** Current round number (1-based) */
  currentRound: number;

  /** Proposals collected so far */
  proposals: ConsensusProposal[];

  /** Whether ultrathink mode was triggered */
  ultrathinkTriggered: boolean;

  /** Whether web search was used in this session */
  webSearchUsed: boolean;

  /** Timestamp when consensus started */
  startedAt: string;

  /** Time remaining before timeout (ms) */
  timeoutRemaining: number;
}

/**
 * A single proposal during consensus
 */
export interface ConsensusProposal {
  /** Which round this proposal was made in */
  round: number;

  /** Anonymized label (Proposal A, Proposal B) - per edge-006 */
  label: "A" | "B";

  /** The actual proposal content */
  content: string;

  /** Reasoning provided with the proposal */
  reasoning: string;

  /** Whether this used extended thinking / reasoning effort */
  usedUltrathink: boolean;

  /** Source of the proposal (hidden during consensus, revealed after) */
  source: "executor" | "reviewer";

  /** Timestamp when proposal was submitted */
  submittedAt: string;
}

/**
 * Result of a consensus resolution attempt
 */
export interface ConsensusResult {
  /** Step ID that was resolved */
  stepId: string;

  /** Whether alignment was achieved */
  aligned: boolean;

  /** The winning proposal content */
  finalDecision: string;

  /**
   * Who made the final decision:
   * - 'consensus': Both models agreed
   * - 'executor': Executor won after max rounds (they're most invested)
   * - 'reviewer': Reviewer's proposal was adopted
   * - 'user': User intervened to decide
   */
  decidedBy: ConsensusRecord["decidedBy"];

  /** Number of rounds it took */
  rounds: number;

  /** All proposals from the session */
  proposals: ConsensusProposal[];

  /** Whether ultrathink was used */
  usedUltrathink: boolean;

  /** Timestamp when consensus was reached */
  timestamp: string;

  /**
   * Similarity score between final proposals (0-1).
   * High similarity (>0.8) with different content may indicate sycophancy.
   */
  proposalSimilarity?: number;

  /** Duration of the consensus process in milliseconds */
  durationMs: number;
}

/**
 * Events emitted by Pair Vibe Mode engine
 */
export type PairVibeEvent =
  | { type: "phase-change"; phase: PairVibePhase; previousPhase: PairVibePhase }
  | { type: "reviewer-started"; stepId: string }
  | { type: "reviewer-completed"; stepId: string; hasFindings: boolean }
  | { type: "reviewer-timeout"; stepId: string }
  | { type: "executor-started"; stepId: string }
  | { type: "executor-completed"; stepId: string; success: boolean }
  | { type: "consensus-started"; stepId: string; findings: string[] }
  | { type: "consensus-round"; stepId: string; round: number }
  | { type: "consensus-completed"; result: ConsensusResult }
  | { type: "consensus-timeout"; stepId: string }
  | { type: "web-search-started"; stepId: string; query: string }
  | { type: "web-search-completed"; stepId: string; resultCount: number }
  | { type: "web-search-failed"; stepId: string; error: string }
  | { type: "rate-limit-hit"; provider: ApiProvider; retryAfterMs: number }
  | { type: "rate-limit-recovered"; provider: ApiProvider }
  | { type: "circuit-open"; provider: ApiProvider }
  | { type: "circuit-half-open"; provider: ApiProvider }
  | { type: "circuit-closed"; provider: ApiProvider }
  | { type: "degraded-mode"; reason: string }
  | { type: "paused"; reason: string }
  | { type: "resumed" }
  | { type: "error"; error: string }
  | { type: "cost-update"; totalCost: number; breakdown: CostBreakdown };

/**
 * Cost breakdown by model and phase
 */
export interface CostBreakdown {
  /** Cost from Executor model */
  executor: number;

  /** Cost from Reviewer model */
  reviewer: number;

  /** Cost from consensus rounds (both models) */
  consensus: number;

  /** Cost from web search API calls */
  webSearch: number;

  /** Total cost */
  total: number;

  /** Currency (always USD) */
  currency: "USD";
}

/**
 * Metrics collected during a Pair Vibe Mode session
 */
export interface PairVibeMetrics {
  /** Session start timestamp */
  sessionStartedAt: string;

  /** Session end timestamp (if completed) */
  sessionEndedAt?: string;

  /** Total steps processed */
  totalSteps: number;

  /** Steps that triggered consensus */
  consensusTriggeredCount: number;

  /** Average consensus rounds when triggered */
  averageConsensusRounds: number;

  /** Steps where Executor proceeded without review (timeout) */
  reviewTimeoutCount: number;

  /** Average distance Reviewer was ahead */
  averageReviewerAhead: number;

  /** Total cost breakdown */
  costBreakdown: CostBreakdown;

  /** Rate limit events count */
  rateLimitEvents: number;

  /** Circuit breaker trips count */
  circuitBreakerTrips: number;

  /** Per-step metrics */
  stepMetrics: StepMetrics[];
}

/**
 * Metrics for a single step
 */
export interface StepMetrics {
  /** Step ID */
  stepId: string;

  /** Time spent reviewing (ms) */
  reviewDurationMs: number;

  /** Time spent executing (ms) */
  executionDurationMs: number;

  /** Time spent in consensus (ms), 0 if no consensus */
  consensusDurationMs: number;

  /** Number of consensus rounds, 0 if no consensus */
  consensusRounds: number;

  /** Whether findings were found */
  hadFindings: boolean;

  /** Whether consensus was required */
  consensusRequired: boolean;

  /** Cost for this step */
  stepCost: number;
}

/**
 * Event handler type for Pair Vibe Mode events
 */
export type PairVibeEventHandler = (event: PairVibeEvent) => void;

/**
 * Create initial Pair Vibe Mode state
 */
export function createInitialPairVibeState(): PairVibeState {
  const now = new Date().toISOString();
  return {
    currentPhase: "initializing",
    reviewerCurrentStep: null,
    reviewerAheadBy: 0,
    executorCurrentStep: null,
    stepProgress: new Map(),
    activeConsensus: null,
    isPaused: false,
    startedAt: now,
    lastUpdatedAt: now,
  };
}

/**
 * Create initial step progress
 */
export function createStepProgress(stepId: string): StepProgress {
  return {
    stepId,
    status: "pending",
    hasFindings: null,
    consensusRequired: false,
    consensusReached: null,
  };
}

/**
 * Create default Pair Vibe config from detected providers
 */
export function createDefaultPairVibeConfig(
  executorProvider: ApiProvider,
  reviewerProvider: ApiProvider
): PairVibeConfig {
  // Default models based on provider
  const executorModel: ModelIdentifier =
    executorProvider === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o";
  const reviewerModel: ModelIdentifier =
    reviewerProvider === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o";

  return {
    enabled: true,
    executorProvider,
    reviewerProvider,
    executorModel,
    reviewerModel,
    ...DEFAULT_PAIR_VIBE_CONFIG,
  };
}

/**
 * Check if a consensus result indicates potential sycophancy.
 * Based on edge-006: flag suspiciously short consensus rounds.
 */
export function checkSycophancyRisk(result: ConsensusResult): {
  isRisky: boolean;
  reason?: string;
} {
  // Flag if aligned in round 1 with high similarity but different reasoning
  if (result.aligned && result.rounds === 1) {
    // Check if consensus was reached suspiciously fast (< 30 seconds)
    if (result.durationMs < 30000) {
      return {
        isRisky: true,
        reason: "Consensus reached in < 30 seconds (round 1)",
      };
    }
  }

  // Check for high similarity score if available
  if (result.proposalSimilarity !== undefined && result.proposalSimilarity > 0.95) {
    return {
      isRisky: true,
      reason: `Very high proposal similarity (${(result.proposalSimilarity * 100).toFixed(1)}%)`,
    };
  }

  return { isRisky: false };
}
