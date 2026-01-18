/**
 * ConsensusRunner - Orchestrates consensus resolution for Pair Vibe Mode
 *
 * When the Reviewer identifies findings on a step, ConsensusRunner facilitates
 * alignment between Executor and Reviewer models.
 *
 * Based on PRD spec impl-006:
 * - Round 1: Both models present proposals (anonymized as Proposal A/B per edge-006)
 * - Check alignment between proposals
 * - Round 2 (if needed): Ultrathink mode with web search grounding
 * - Round 3 (if still misaligned): Executor wins (per core_philosophy)
 * - Record decision in step.consensus field
 * - Max timeout: 5 minutes
 *
 * Addresses failure modes:
 * - FM-2.5 Ignored other agent's input: Both models must engage
 * - edge-006 Sycophancy: Anonymized review prevents identity bias
 * - edge-003 Consensus not reached: Executor wins after max rounds
 * - edge-007 User cancels: Save partial state with status 'cancelled'
 */

import { EventEmitter } from "node:events";
import type { UserStory, ConsensusRecord } from "./prd-schema.js";
import type { WebSearchResponse } from "./web-search.js";
import { WebSearchService, searchQueries } from "./web-search.js";
import type {
  PairVibeConfig,
  PairVibeEvent,
  PairVibeEventHandler,
  ConsensusSession,
  ConsensusProposal,
  ConsensusResult,
  ModelIdentifier,
} from "./pair-vibe-types.js";
import { checkSycophancyRisk } from "./pair-vibe-types.js";

/**
 * LLM client interface for consensus operations
 */
export interface ConsensusLLMClient {
  /**
   * Generate a proposal for a step given findings
   * @param params Parameters for proposal generation
   * @returns The proposal content and reasoning
   */
  generateProposal(params: {
    step: UserStory;
    findings: string[];
    searchResults?: WebSearchResponse[];
    model: ModelIdentifier;
    useUltrathink: boolean;
    timeout: number;
  }): Promise<{
    proposal: string;
    reasoning: string;
  }>;

  /**
   * Check if two proposals are aligned (substantially agree)
   * @param params Parameters for alignment check
   * @returns Whether aligned and similarity score
   */
  checkAlignment(params: {
    proposalA: string;
    proposalB: string;
    model: ModelIdentifier;
    timeout: number;
  }): Promise<{
    aligned: boolean;
    similarity: number;
    reasoning: string;
  }>;
}

/**
 * Options for ConsensusRunner
 */
export interface ConsensusRunnerOptions {
  /** Pair Vibe configuration */
  config: PairVibeConfig;
  /** Event handler for Pair Vibe events */
  eventHandler?: PairVibeEventHandler;
  /** LLM client for the Executor model */
  executorClient?: ConsensusLLMClient;
  /** LLM client for the Reviewer model */
  reviewerClient?: ConsensusLLMClient;
  /** Web search service for grounding */
  webSearchService?: WebSearchService;
}

/**
 * State of the ConsensusRunner
 */
export type ConsensusState =
  | "idle"
  | "collecting_proposals"
  | "checking_alignment"
  | "ultrathink"
  | "resolved"
  | "timeout"
  | "cancelled"
  | "error";

/**
 * Events emitted by ConsensusRunner
 */
export interface ConsensusRunnerEvents {
  /** Emitted when consensus starts */
  started: (stepId: string, findings: string[]) => void;
  /** Emitted when a round begins */
  roundStarted: (stepId: string, round: number) => void;
  /** Emitted when a proposal is received */
  proposalReceived: (stepId: string, label: "A" | "B", round: number) => void;
  /** Emitted when alignment is checked */
  alignmentChecked: (stepId: string, aligned: boolean, similarity: number) => void;
  /** Emitted when ultrathink mode is triggered */
  ultrathinkTriggered: (stepId: string) => void;
  /** Emitted when consensus completes */
  completed: (result: ConsensusResult) => void;
  /** Emitted on timeout */
  timeout: (stepId: string, partialResult: Partial<ConsensusResult>) => void;
  /** Emitted on cancellation */
  cancelled: (stepId: string, partialResult: Partial<ConsensusResult>) => void;
  /** Emitted on error */
  error: (error: Error) => void;
}

/**
 * Default consensus timeout (5 minutes) per impl-006
 */
const DEFAULT_CONSENSUS_TIMEOUT_MS = 300000;

/**
 * Default max consensus rounds (2 before executor wins) per edge-003
 */
const DEFAULT_MAX_ROUNDS = 2;


/**
 * ConsensusRunner class
 *
 * Orchestrates consensus resolution between Executor and Reviewer models
 * when the Reviewer has identified findings that need discussion.
 */
export class ConsensusRunner extends EventEmitter {
  private readonly config: PairVibeConfig;
  private readonly webSearchService: WebSearchService;
  private readonly executorClient: ConsensusLLMClient | null;
  private readonly reviewerClient: ConsensusLLMClient | null;
  private readonly pairVibeEventHandler: PairVibeEventHandler | null;

  private state: ConsensusState = "idle";
  private currentSession: ConsensusSession | null = null;
  private abortController: AbortController | null = null;
  private timeoutId: NodeJS.Timeout | null = null;

  constructor(options: ConsensusRunnerOptions) {
    super();
    this.config = options.config;
    this.pairVibeEventHandler = options.eventHandler ?? null;
    this.executorClient = options.executorClient ?? null;
    this.reviewerClient = options.reviewerClient ?? null;

    // Initialize web search service with event forwarding
    this.webSearchService =
      options.webSearchService ??
      new WebSearchService((event) => this.emitPairVibeEvent(event));
  }

  /**
   * Get current state
   */
  getState(): ConsensusState {
    return this.state;
  }

  /**
   * Get current consensus session
   */
  getCurrentSession(): ConsensusSession | null {
    return this.currentSession;
  }

  /**
   * Run consensus resolution for a step with findings
   *
   * @param step The step requiring consensus
   * @param findings Findings identified by the Reviewer
   * @returns ConsensusResult with the resolution details
   */
  async resolve(step: UserStory, findings: string[]): Promise<ConsensusResult> {
    if (this.state !== "idle") {
      throw new Error(`ConsensusRunner is not idle (current state: ${this.state})`);
    }

    const startTime = Date.now();
    const maxTimeout = this.config.consensusTimeout ?? DEFAULT_CONSENSUS_TIMEOUT_MS;
    const maxRounds = this.config.maxConsensusRounds ?? DEFAULT_MAX_ROUNDS;

    // Initialize session
    this.currentSession = {
      stepId: step.id,
      currentRound: 0,
      proposals: [],
      ultrathinkTriggered: false,
      webSearchUsed: false,
      startedAt: new Date().toISOString(),
      timeoutRemaining: maxTimeout,
    };

    this.state = "collecting_proposals";
    this.abortController = new AbortController();

    // Set up timeout
    this.timeoutId = setTimeout(() => {
      this.handleTimeout(step, findings, startTime);
    }, maxTimeout);

    this.emit("started", step.id, findings);
    this.emitPairVibeEvent({
      type: "consensus-started",
      stepId: step.id,
      findings,
    });

    try {
      // Run consensus rounds
      for (let round = 1; round <= maxRounds + 1; round++) {
        // Check for cancellation or timeout (state can be changed by handlers)
        if (
          this.state === ("cancelled" as ConsensusState) ||
          this.state === ("timeout" as ConsensusState)
        ) {
          break;
        }

        this.currentSession.currentRound = round;
        this.currentSession.timeoutRemaining = maxTimeout - (Date.now() - startTime);

        this.emit("roundStarted", step.id, round);
        this.emitPairVibeEvent({
          type: "consensus-round",
          stepId: step.id,
          round,
        });

        // On round 2+, trigger ultrathink mode
        const useUltrathink = round > 1;
        if (useUltrathink && !this.currentSession.ultrathinkTriggered) {
          this.currentSession.ultrathinkTriggered = true;
          this.state = "ultrathink";
          this.emit("ultrathinkTriggered", step.id);
        }

        // Collect web search results if in ultrathink mode
        let searchResults: WebSearchResponse[] = [];
        if (useUltrathink && this.config.webSearchEnabled !== false) {
          searchResults = await this.performConsensusSearch(step, findings);
          this.currentSession.webSearchUsed = true;
        }

        // Collect proposals from both models (in parallel for efficiency)
        const proposalsResult = await this.collectProposals(
          step,
          findings,
          searchResults,
          round,
          useUltrathink
        );

        if (!proposalsResult.success) {
          // Failed to get proposals, continue to next round or fail
          continue;
        }

        const { executorProposal, reviewerProposal } = proposalsResult;

        // Check alignment
        this.state = "checking_alignment";
        const alignment = await this.checkProposalAlignment(
          executorProposal.content,
          reviewerProposal.content
        );

        this.emit("alignmentChecked", step.id, alignment.aligned, alignment.similarity);

        if (alignment.aligned) {
          // Consensus reached!
          return this.createSuccessResult(
            step,
            executorProposal,
            reviewerProposal,
            alignment,
            round,
            startTime
          );
        }

        // If we've exhausted rounds, executor wins (per core_philosophy)
        if (round > maxRounds) {
          return this.createExecutorWinsResult(
            step,
            executorProposal,
            reviewerProposal,
            alignment,
            round,
            startTime
          );
        }
      }

      // Should not reach here normally, but handle gracefully
      throw new Error("Consensus loop exited unexpectedly");
    } catch (error) {
      // Check if cancelled or timed out during processing
      if (this.state === ("cancelled" as ConsensusState)) {
        return this.createCancelledResult(step, startTime);
      }
      if (this.state === ("timeout" as ConsensusState)) {
        return this.createTimeoutResult(step, startTime);
      }

      this.state = "error";
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      this.emit("error", errorInstance);

      throw errorInstance;
    } finally {
      this.cleanup();
    }
  }

  /**
   * Collect proposals from both models
   */
  private async collectProposals(
    step: UserStory,
    findings: string[],
    searchResults: WebSearchResponse[],
    round: number,
    useUltrathink: boolean
  ): Promise<
    | {
        success: true;
        executorProposal: ConsensusProposal;
        reviewerProposal: ConsensusProposal;
      }
    | { success: false; reason: string }
  > {
    const proposalTimeout =
      ((this.config.consensusTimeout ?? DEFAULT_CONSENSUS_TIMEOUT_MS) / 3) | 0;

    // Randomize which model is A vs B (for anonymization per edge-006)
    const executorIsA = Math.random() < 0.5;

    // Generate proposals in parallel
    const [executorResult, reviewerResult] = await Promise.allSettled([
      this.generateProposal(
        "executor",
        step,
        findings,
        searchResults,
        useUltrathink,
        proposalTimeout
      ),
      this.generateProposal(
        "reviewer",
        step,
        findings,
        searchResults,
        useUltrathink,
        proposalTimeout
      ),
    ]);

    // Handle failures
    if (executorResult.status === "rejected") {
      return {
        success: false,
        reason: `Executor failed to generate proposal: ${executorResult.reason}`,
      };
    }
    if (reviewerResult.status === "rejected") {
      return {
        success: false,
        reason: `Reviewer failed to generate proposal: ${reviewerResult.reason}`,
      };
    }

    const now = new Date().toISOString();
    const executorValue = executorResult.value;
    const reviewerValue = reviewerResult.value;

    // Create proposals with anonymized labels
    const executorProposal: ConsensusProposal = {
      round,
      label: executorIsA ? "A" : "B",
      content: executorValue.proposal,
      reasoning: executorValue.reasoning,
      usedUltrathink: useUltrathink,
      source: "executor",
      submittedAt: now,
    };

    const reviewerProposal: ConsensusProposal = {
      round,
      label: executorIsA ? "B" : "A",
      content: reviewerValue.proposal,
      reasoning: reviewerValue.reasoning,
      usedUltrathink: useUltrathink,
      source: "reviewer",
      submittedAt: now,
    };

    // Add to session
    this.currentSession?.proposals.push(executorProposal, reviewerProposal);

    // Emit events (using anonymized labels)
    this.emit("proposalReceived", step.id, executorProposal.label, round);
    this.emit("proposalReceived", step.id, reviewerProposal.label, round);

    return { success: true, executorProposal, reviewerProposal };
  }

  /**
   * Generate a proposal from a model
   */
  private async generateProposal(
    source: "executor" | "reviewer",
    step: UserStory,
    findings: string[],
    searchResults: WebSearchResponse[],
    useUltrathink: boolean,
    timeout: number
  ): Promise<{ proposal: string; reasoning: string }> {
    const client = source === "executor" ? this.executorClient : this.reviewerClient;
    const model =
      source === "executor" ? this.config.executorModel : this.config.reviewerModel;

    if (client) {
      return client.generateProposal({
        step,
        findings,
        searchResults,
        model,
        useUltrathink,
        timeout,
      });
    }

    // Fallback: Generate a placeholder proposal
    return this.generateFallbackProposal(step, findings, searchResults, source);
  }

  /**
   * Generate a fallback proposal when no LLM client is available
   */
  private generateFallbackProposal(
    step: UserStory,
    findings: string[],
    _searchResults: WebSearchResponse[],
    source: "executor" | "reviewer"
  ): { proposal: string; reasoning: string } {
    const findingsSummary = findings.slice(0, 3).join("; ");

    if (source === "executor") {
      return {
        proposal: `Proceed with implementation of "${step.title}" while addressing the identified concerns: ${findingsSummary}. Apply standard best practices and include appropriate error handling.`,
        reasoning: `As the Executor, I propose to move forward with implementation while being mindful of the findings. The step "${step.title}" appears to be a reasonable approach, and I will incorporate feedback during implementation.`,
      };
    }

    return {
      proposal: `Review suggests modifications to "${step.title}": ${findingsSummary}. Consider alternative approaches or additional safeguards before proceeding.`,
      reasoning: `As the Reviewer, I've identified potential concerns that should be addressed. The findings suggest careful consideration is needed before implementation.`,
    };
  }

  /**
   * Check if two proposals are aligned
   */
  private async checkProposalAlignment(
    proposalA: string,
    proposalB: string
  ): Promise<{ aligned: boolean; similarity: number; reasoning: string }> {
    const timeout =
      ((this.config.consensusTimeout ?? DEFAULT_CONSENSUS_TIMEOUT_MS) / 6) | 0;

    // Use executor client to check alignment (could use either)
    if (this.executorClient) {
      return this.executorClient.checkAlignment({
        proposalA,
        proposalB,
        model: this.config.executorModel,
        timeout,
      });
    }

    // Fallback: Simple text similarity check
    return this.simpleSimilarityCheck(proposalA, proposalB);
  }

  /**
   * Simple text similarity check when no LLM is available
   */
  private simpleSimilarityCheck(
    proposalA: string,
    proposalB: string
  ): { aligned: boolean; similarity: number; reasoning: string } {
    // Normalize and tokenize
    const tokensA = new Set(
      proposalA
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length > 2)
    );
    const tokensB = new Set(
      proposalB
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length > 2)
    );

    // Calculate Jaccard similarity
    const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
    const union = new Set([...tokensA, ...tokensB]);
    const similarity = union.size > 0 ? intersection.size / union.size : 0;

    // Consider aligned if similarity > 0.7 (70% overlap)
    const aligned = similarity > 0.7;

    return {
      aligned,
      similarity,
      reasoning: `Token overlap similarity: ${(similarity * 100).toFixed(1)}%. ${
        aligned ? "Proposals are substantially similar." : "Proposals differ significantly."
      }`,
    };
  }

  /**
   * Perform web search to ground consensus discussion
   */
  private async performConsensusSearch(
    step: UserStory,
    findings: string[]
  ): Promise<WebSearchResponse[]> {
    const results: WebSearchResponse[] = [];

    // Generate queries based on step and findings
    const queries = this.generateConsensusSearchQueries(step, findings);

    // Run searches (limit to 2 for time)
    const searchPromises = queries.slice(0, 2).map((query) =>
      this.webSearchService.search(query, step.id, { timeout: 20000 })
    );

    const searchResults = await Promise.allSettled(searchPromises);

    for (const result of searchResults) {
      if (result.status === "fulfilled" && !result.value.error) {
        results.push(result.value);
      }
    }

    return results;
  }

  /**
   * Generate search queries for consensus grounding
   */
  private generateConsensusSearchQueries(step: UserStory, findings: string[]): string[] {
    const queries: string[] = [];
    const title = step.title.toLowerCase();

    // Search based on step title
    queries.push(searchQueries.bestPractices("software development", step.title));

    // Search based on findings (extract key terms)
    if (findings.length > 0) {
      const firstFinding = findings[0];
      if (firstFinding) {
        const keyTerms = firstFinding
          .toLowerCase()
          .split(/\W+/)
          .filter((t) => t.length > 4)
          .slice(0, 3)
          .join(" ");
        if (keyTerms) {
          queries.push(`${keyTerms} best practices solutions 2025`);
        }
      }
    }

    // Security-related if applicable
    const securityTerms = ["auth", "login", "password", "token", "security"];
    if (securityTerms.some((term) => title.includes(term))) {
      queries.push(searchQueries.security("web application", step.title));
    }

    return queries;
  }

  /**
   * Create a successful consensus result
   */
  private createSuccessResult(
    step: UserStory,
    executorProposal: ConsensusProposal,
    _reviewerProposal: ConsensusProposal,
    alignment: { similarity: number },
    round: number,
    startTime: number
  ): ConsensusResult {
    const timestamp = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    const result: ConsensusResult = {
      stepId: step.id,
      aligned: true,
      finalDecision: executorProposal.content, // Either would work since aligned
      decidedBy: "consensus",
      rounds: round,
      proposals: this.currentSession?.proposals ?? [],
      usedUltrathink: this.currentSession?.ultrathinkTriggered ?? false,
      timestamp,
      proposalSimilarity: alignment.similarity,
      durationMs,
    };

    // Check for sycophancy risk
    const sycophancyCheck = checkSycophancyRisk(result);
    if (sycophancyCheck.isRisky) {
      // Log warning but don't fail - just note it
      console.warn(
        `[ConsensusRunner] Potential sycophancy detected for step ${step.id}: ${sycophancyCheck.reason}`
      );
    }

    this.state = "resolved";
    this.emit("completed", result);
    this.emitPairVibeEvent({
      type: "consensus-completed",
      result,
    });

    return result;
  }

  /**
   * Create result when executor wins after max rounds
   */
  private createExecutorWinsResult(
    step: UserStory,
    executorProposal: ConsensusProposal,
    _reviewerProposal: ConsensusProposal,
    alignment: { similarity: number },
    round: number,
    startTime: number
  ): ConsensusResult {
    const timestamp = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    const result: ConsensusResult = {
      stepId: step.id,
      aligned: false,
      finalDecision: executorProposal.content,
      decidedBy: "executor",
      rounds: round,
      proposals: this.currentSession?.proposals ?? [],
      usedUltrathink: this.currentSession?.ultrathinkTriggered ?? false,
      timestamp,
      proposalSimilarity: alignment.similarity,
      durationMs,
    };

    this.state = "resolved";
    this.emit("completed", result);
    this.emitPairVibeEvent({
      type: "consensus-completed",
      result,
    });

    return result;
  }

  /**
   * Create result when consensus was cancelled
   */
  private createCancelledResult(step: UserStory, startTime: number): ConsensusResult {
    const timestamp = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    // Get partial proposals if any
    const proposals = this.currentSession?.proposals ?? [];
    const lastExecutorProposal = proposals
      .filter((p) => p.source === "executor")
      .pop();

    const result: ConsensusResult = {
      stepId: step.id,
      aligned: false,
      finalDecision: lastExecutorProposal?.content ?? "Consensus was cancelled",
      decidedBy: "user",
      rounds: this.currentSession?.currentRound ?? 0,
      proposals,
      usedUltrathink: this.currentSession?.ultrathinkTriggered ?? false,
      timestamp,
      durationMs,
    };

    this.emit("cancelled", step.id, result);
    this.emitPairVibeEvent({
      type: "consensus-completed",
      result,
    });

    return result;
  }

  /**
   * Create result when consensus timed out
   */
  private createTimeoutResult(step: UserStory, startTime: number): ConsensusResult {
    const timestamp = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    // Get partial proposals if any
    const proposals = this.currentSession?.proposals ?? [];
    const lastExecutorProposal = proposals
      .filter((p) => p.source === "executor")
      .pop();

    const result: ConsensusResult = {
      stepId: step.id,
      aligned: false,
      finalDecision:
        lastExecutorProposal?.content ?? "Consensus timed out - proceeding with executor approach",
      decidedBy: "executor", // Executor wins on timeout
      rounds: this.currentSession?.currentRound ?? 0,
      proposals,
      usedUltrathink: this.currentSession?.ultrathinkTriggered ?? false,
      timestamp,
      durationMs,
    };

    this.emitPairVibeEvent({
      type: "consensus-timeout",
      stepId: step.id,
    });

    return result;
  }

  /**
   * Handle timeout
   */
  private handleTimeout(step: UserStory, _findings: string[], startTime: number): void {
    this.state = "timeout";
    this.abortController?.abort();

    const partialResult = this.createTimeoutResult(step, startTime);
    this.emit("timeout", step.id, partialResult);
  }

  /**
   * Cancel the current consensus process
   * Per edge-007: Save partial state with status 'cancelled'
   */
  cancel(): void {
    if (this.state !== "idle" && this.state !== "resolved") {
      this.state = "cancelled";
      this.abortController?.abort();
    }
  }

  /**
   * Convert ConsensusResult to ConsensusRecord for storage in PRD
   */
  toConsensusRecord(result: ConsensusResult): ConsensusRecord {
    // Find the executor and reviewer proposals from the last round
    const lastRound = result.rounds;
    const executorProposal = result.proposals.find(
      (p) => p.source === "executor" && p.round === lastRound
    );
    const reviewerProposal = result.proposals.find(
      (p) => p.source === "reviewer" && p.round === lastRound
    );

    // Determine status
    let status: ConsensusRecord["status"];
    if (result.decidedBy === "user") {
      status = "cancelled";
    } else if (result.durationMs >= (this.config.consensusTimeout ?? DEFAULT_CONSENSUS_TIMEOUT_MS)) {
      status = "timeout";
    } else {
      status = "completed";
    }

    const record: ConsensusRecord = {
      executorProposal: executorProposal?.content ?? "No proposal recorded",
      reviewerProposal: reviewerProposal?.content ?? "No proposal recorded",
      aligned: result.aligned,
      finalDecision: result.finalDecision,
      decidedBy: result.decidedBy,
      rounds: result.rounds,
      timestamp: result.timestamp,
      status,
    };

    // Only add notes if ultrathink was used
    if (result.usedUltrathink) {
      record.notes = "Ultrathink mode was used";
    }

    return record;
  }

  /**
   * Reset the runner for a new consensus session
   */
  reset(): void {
    this.cleanup();
    this.state = "idle";
    this.currentSession = null;
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.abortController = null;
  }

  /**
   * Emit a PairVibe event
   */
  private emitPairVibeEvent(event: PairVibeEvent): void {
    if (this.pairVibeEventHandler) {
      this.pairVibeEventHandler(event);
    }
  }

  /**
   * Set the executor LLM client
   */
  setExecutorClient(client: ConsensusLLMClient): void {
    (this as unknown as { executorClient: ConsensusLLMClient }).executorClient = client;
  }

  /**
   * Set the reviewer LLM client
   */
  setReviewerClient(client: ConsensusLLMClient): void {
    (this as unknown as { reviewerClient: ConsensusLLMClient }).reviewerClient = client;
  }

  /**
   * Get the web search service
   */
  getWebSearchService(): WebSearchService {
    return this.webSearchService;
  }
}

/**
 * Create a ConsensusRunner instance
 */
export function createConsensusRunner(options: ConsensusRunnerOptions): ConsensusRunner {
  return new ConsensusRunner(options);
}

/**
 * Create default LLM client implementations (placeholders)
 * Real implementations will use provider-specific APIs
 */
export function createDefaultConsensusLLMClients(): {
  executor: ConsensusLLMClient;
  reviewer: ConsensusLLMClient;
} {
  const createClient = (): ConsensusLLMClient => ({
    async generateProposal({ step, findings }) {
      // Placeholder implementation
      return {
        proposal: `Proceed with "${step.title}" while addressing: ${findings.slice(0, 2).join("; ")}`,
        reasoning: "Default proposal generation - real implementation would use LLM API",
      };
    },
    async checkAlignment({ proposalA, proposalB }) {
      // Simple word overlap check
      const wordsA = new Set(proposalA.toLowerCase().split(/\W+/).filter(w => w.length > 3));
      const wordsB = new Set(proposalB.toLowerCase().split(/\W+/).filter(w => w.length > 3));
      const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
      const union = new Set([...wordsA, ...wordsB]).size;
      const similarity = union > 0 ? intersection / union : 0;

      return {
        aligned: similarity > 0.6,
        similarity,
        reasoning: `Word overlap: ${(similarity * 100).toFixed(1)}%`,
      };
    },
  });

  return {
    executor: createClient(),
    reviewer: createClient(),
  };
}

/**
 * Check if consensus is needed for a step
 */
export function needsConsensus(step: UserStory): boolean {
  // Consensus needed if findings exist and are non-empty
  return Array.isArray(step.findings) && step.findings.length > 0;
}

/**
 * Check if a step has already been through consensus
 */
export function hasConsensusRecord(step: UserStory): boolean {
  return step.consensus !== null && step.consensus !== undefined;
}
