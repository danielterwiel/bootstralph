/**
 * ReviewerRunner - Concurrent step reviewer for Pair Vibe Mode
 *
 * Runs ahead of the Executor, reviewing future steps by:
 * 1. Web searching for potential issues
 * 2. Analyzing steps against search results
 * 3. Populating step.findings = [] (clean) or [...] (issues)
 *
 * Based on PRD spec impl-005:
 * - Works ahead concurrently, pre-populating findings on future steps
 * - Emits events for UI updates
 * - Handles cancellation when consensus is needed
 *
 * Timeout strategy per review-007:
 * - Web search: 30s per call
 * - Review step: 2min total
 * - Reviewer lag: pause Executor if 5+ steps ahead
 */

import { EventEmitter } from "node:events";
import type { UserStory } from "./prd-schema.js";
import {
  WebSearchService,
  searchQueries,
  type WebSearchResponse,
} from "./web-search.js";
import type {
  PairVibeConfig,
  PairVibeEvent,
  PairVibeEventHandler,
  StepProgress,
  ModelIdentifier,
} from "./pair-vibe-types.js";

/**
 * Review result for a single step
 */
export interface StepReviewResult {
  /** Step ID that was reviewed */
  stepId: string;
  /** Whether the review completed successfully */
  success: boolean;
  /** Findings discovered during review (empty = clean) */
  findings: string[];
  /** Web search results used in the review */
  searchResults: WebSearchResponse[];
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether review timed out */
  timedOut: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Options for ReviewerRunner
 */
export interface ReviewerRunnerOptions {
  /** Pair Vibe configuration */
  config: PairVibeConfig;
  /** Event handler for Pair Vibe events */
  eventHandler?: PairVibeEventHandler;
  /** LLM client for the reviewer model */
  llmClient?: ReviewerLLMClient;
  /** Web search service instance */
  webSearchService?: WebSearchService;
}

/**
 * Interface for LLM client that ReviewerRunner uses
 * This abstraction allows for different providers (Claude, OpenAI)
 */
export interface ReviewerLLMClient {
  /** Analyze a step with search context and return findings */
  analyzeStep(params: {
    step: UserStory;
    searchResults: WebSearchResponse[];
    model: ModelIdentifier;
    timeout: number;
  }): Promise<{
    findings: string[];
    reasoning: string;
  }>;
}

/**
 * State of the ReviewerRunner
 */
export type ReviewerState =
  | "idle"
  | "running"
  | "paused"
  | "waiting_for_consensus"
  | "stopped"
  | "error";

/**
 * Events emitted by ReviewerRunner
 */
export interface ReviewerRunnerEvents {
  /** Emitted when starting to review a step */
  stepStarted: (stepId: string) => void;
  /** Emitted when a step review completes */
  stepCompleted: (result: StepReviewResult) => void;
  /** Emitted when a step has findings that need consensus */
  consensusNeeded: (stepId: string, findings: string[]) => void;
  /** Emitted when reviewer is paused */
  paused: (reason: string) => void;
  /** Emitted when reviewer is resumed */
  resumed: () => void;
  /** Emitted on error */
  error: (error: Error) => void;
  /** Emitted when all available steps are reviewed */
  caughtUp: () => void;
}

/**
 * Default review timeout (2 minutes) per review-007
 */
const DEFAULT_REVIEW_TIMEOUT_MS = 120000;

/**
 * Default web search timeout (30 seconds) per review-007
 */
const DEFAULT_SEARCH_TIMEOUT_MS = 30000;

/**
 * Maximum steps ahead before suggesting Executor pause
 */
const MAX_STEPS_AHEAD = 5;

/**
 * ReviewerRunner class
 *
 * Runs ahead of Executor to review future steps, identifying potential
 * issues before execution. Uses web search to validate approaches.
 */
export class ReviewerRunner extends EventEmitter {
  private readonly config: PairVibeConfig;
  private readonly webSearchService: WebSearchService;
  private readonly llmClient: ReviewerLLMClient | null;
  private readonly pairVibeEventHandler: PairVibeEventHandler | null;

  private state: ReviewerState = "idle";
  private currentStepId: string | null = null;
  private reviewedSteps: Set<string> = new Set();
  private stepProgress: Map<string, StepProgress> = new Map();
  private abortController: AbortController | null = null;

  constructor(options: ReviewerRunnerOptions) {
    super();
    this.config = options.config;
    this.pairVibeEventHandler = options.eventHandler ?? null;
    this.llmClient = options.llmClient ?? null;

    // Initialize web search service with event forwarding
    this.webSearchService =
      options.webSearchService ??
      new WebSearchService((event) => this.emitPairVibeEvent(event));
  }

  /**
   * Get current state
   */
  getState(): ReviewerState {
    return this.state;
  }

  /**
   * Get current step being reviewed
   */
  getCurrentStep(): string | null {
    return this.currentStepId;
  }

  /**
   * Get set of reviewed step IDs
   */
  getReviewedSteps(): Set<string> {
    return new Set(this.reviewedSteps);
  }

  /**
   * Check if a step has been reviewed
   */
  isStepReviewed(stepId: string): boolean {
    return this.reviewedSteps.has(stepId);
  }

  /**
   * Get number of steps reviewed
   */
  getReviewedCount(): number {
    return this.reviewedSteps.size;
  }

  /**
   * Start reviewing steps ahead of the Executor
   */
  async start(steps: UserStory[], executorCurrentIndex: number): Promise<void> {
    if (this.state === "running") {
      throw new Error("ReviewerRunner is already running");
    }

    this.state = "running";
    this.abortController = new AbortController();

    // Start reviewing from ahead of executor
    const startIndex = executorCurrentIndex + 1;

    for (let i = startIndex; i < steps.length && i < startIndex + MAX_STEPS_AHEAD; i++) {
      if (this.state !== "running") {
        break;
      }

      const step = steps[i];
      if (!step || this.reviewedSteps.has(step.id)) {
        continue;
      }

      // Check if step already has findings (reviewed in previous session)
      if (step.findings !== undefined && step.findings !== null) {
        this.reviewedSteps.add(step.id);
        continue;
      }

      await this.reviewStep(step);
    }

    if (this.state === "running") {
      this.emit("caughtUp");
      this.state = "idle";
    }
  }

  /**
   * Review a single step
   */
  async reviewStep(step: UserStory): Promise<StepReviewResult> {
    const startTime = Date.now();
    this.currentStepId = step.id;

    this.emit("stepStarted", step.id);
    this.emitPairVibeEvent({
      type: "reviewer-started",
      stepId: step.id,
    });

    const result: StepReviewResult = {
      stepId: step.id,
      success: false,
      findings: [],
      searchResults: [],
      durationMs: 0,
      timedOut: false,
    };

    try {
      // Create a timeout for the entire review
      const reviewTimeout = this.config.reviewTimeout ?? DEFAULT_REVIEW_TIMEOUT_MS;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Review timeout")), reviewTimeout);
      });

      // Run the review with timeout
      const reviewPromise = this.performReview(step);

      const reviewResult = await Promise.race([reviewPromise, timeoutPromise]);
      result.findings = reviewResult.findings;
      result.searchResults = reviewResult.searchResults;
      result.success = true;
    } catch (error) {
      if (error instanceof Error && error.message === "Review timeout") {
        result.timedOut = true;
        result.error = "Review timed out after " +
          ((this.config.reviewTimeout ?? DEFAULT_REVIEW_TIMEOUT_MS) / 1000) + "s";

        this.emitPairVibeEvent({
          type: "reviewer-timeout",
          stepId: step.id,
        });
      } else {
        result.error = error instanceof Error ? error.message : String(error);
      }
    }

    result.durationMs = Date.now() - startTime;
    this.currentStepId = null;
    this.reviewedSteps.add(step.id);

    this.emit("stepCompleted", result);
    this.emitPairVibeEvent({
      type: "reviewer-completed",
      stepId: step.id,
      hasFindings: result.findings.length > 0,
    });

    // If findings exist, emit consensus needed event
    if (result.findings.length > 0) {
      this.emit("consensusNeeded", step.id, result.findings);
      this.emitPairVibeEvent({
        type: "consensus-started",
        stepId: step.id,
        findings: result.findings,
      });
    }

    return result;
  }

  /**
   * Perform the actual review (web search + LLM analysis)
   */
  private async performReview(step: UserStory): Promise<{
    findings: string[];
    searchResults: WebSearchResponse[];
  }> {
    const searchResults: WebSearchResponse[] = [];
    let findings: string[] = [];

    // Skip web search if disabled
    if (this.config.webSearchEnabled === false) {
      // Still run LLM analysis without search context
      if (this.llmClient) {
        const analysis = await this.llmClient.analyzeStep({
          step,
          searchResults: [],
          model: this.config.reviewerModel,
          timeout: this.config.reviewTimeout ?? DEFAULT_REVIEW_TIMEOUT_MS,
        });
        findings = analysis.findings;
      }
      return { findings, searchResults };
    }

    // Check if web search is available
    if (!this.webSearchService.isAvailable()) {
      // No search available, use LLM analysis only
      if (this.llmClient) {
        const analysis = await this.llmClient.analyzeStep({
          step,
          searchResults: [],
          model: this.config.reviewerModel,
          timeout: this.config.reviewTimeout ?? DEFAULT_REVIEW_TIMEOUT_MS,
        });
        findings = analysis.findings;
      }
      return { findings, searchResults };
    }

    // Perform web searches based on step content
    const queries = this.generateSearchQueries(step);
    const searchTimeout = DEFAULT_SEARCH_TIMEOUT_MS;

    // Run searches in parallel (max 3 concurrent)
    const searchPromises = queries.slice(0, 3).map((query) =>
      this.webSearchService.search(query, step.id, { timeout: searchTimeout })
    );

    const searchResponses = await Promise.allSettled(searchPromises);

    for (const response of searchResponses) {
      if (response.status === "fulfilled" && !response.value.error) {
        searchResults.push(response.value);
      }
    }

    // Analyze step with LLM using search results
    if (this.llmClient) {
      const analysis = await this.llmClient.analyzeStep({
        step,
        searchResults,
        model: this.config.reviewerModel,
        timeout: this.config.reviewTimeout ?? DEFAULT_REVIEW_TIMEOUT_MS,
      });
      findings = analysis.findings;
    } else {
      // No LLM client, extract findings from search results heuristically
      findings = this.extractFindingsFromSearch(step, searchResults);
    }

    return { findings, searchResults };
  }

  /**
   * Generate search queries based on step content
   */
  private generateSearchQueries(step: UserStory): string[] {
    const queries: string[] = [];
    const title = step.title.toLowerCase();
    const description = step.description.toLowerCase();
    const combined = `${title} ${description}`;

    // Extract technologies/frameworks mentioned
    const techPatterns = [
      /\b(react|vue|angular|svelte|next\.?js|nuxt|astro)\b/gi,
      /\b(typescript|javascript|node\.?js|deno|bun)\b/gi,
      /\b(tailwind|css|sass|styled-components)\b/gi,
      /\b(postgresql|mysql|mongodb|redis|sqlite)\b/gi,
      /\b(aws|gcp|azure|vercel|netlify|cloudflare)\b/gi,
      /\b(docker|kubernetes|terraform)\b/gi,
      /\b(jest|vitest|playwright|cypress)\b/gi,
      /\b(graphql|rest|grpc|websocket)\b/gi,
    ];

    const technologies = new Set<string>();
    for (const pattern of techPatterns) {
      const matches = combined.match(pattern);
      if (matches) {
        for (const match of matches) {
          technologies.add(match.toLowerCase());
        }
      }
    }

    // Generate queries for detected technologies
    for (const tech of technologies) {
      // Best practices query
      queries.push(searchQueries.bestPractices(tech, step.title));

      // Known issues query
      queries.push(searchQueries.knownIssues(tech));
    }

    // Security query if step involves auth/security
    const securityKeywords = ["auth", "login", "password", "token", "jwt", "oauth", "security", "encrypt"];
    for (const keyword of securityKeywords) {
      if (combined.includes(keyword)) {
        queries.push(searchQueries.security("web application", step.title));
        break;
      }
    }

    // Performance query if step mentions performance
    const perfKeywords = ["performance", "optimize", "fast", "speed", "cache", "lazy"];
    for (const keyword of perfKeywords) {
      if (combined.includes(keyword)) {
        const techArray = Array.from(technologies);
        const tech = techArray.length > 0 && techArray[0] ? techArray[0] : "application";
        queries.push(searchQueries.performance(tech, step.title));
        break;
      }
    }

    // Default to a general query if no specific ones generated
    if (queries.length === 0) {
      queries.push(`best practices ${step.title} implementation 2025`);
    }

    // Limit to 3 queries to avoid excessive API usage
    return queries.slice(0, 3);
  }

  /**
   * Extract potential findings from search results heuristically
   * Used when no LLM client is available
   */
  private extractFindingsFromSearch(
    _step: UserStory,
    searchResults: WebSearchResponse[]
  ): string[] {
    const findings: string[] = [];
    const keywords = ["issue", "bug", "problem", "error", "warning", "deprecated", "vulnerability", "breaking"];

    for (const search of searchResults) {
      for (const result of search.results) {
        const snippetLower = result.snippet.toLowerCase();
        for (const keyword of keywords) {
          if (snippetLower.includes(keyword)) {
            // Add a finding with context
            const finding = `Potential ${keyword} found: ${result.snippet.slice(0, 200)}... (Source: ${result.url})`;
            if (!findings.includes(finding)) {
              findings.push(finding);
            }
            break;
          }
        }
      }
    }

    // Limit findings to avoid overwhelming consensus mode
    return findings.slice(0, 5);
  }

  /**
   * Pause the reviewer (e.g., when consensus is needed)
   */
  pause(reason: string): void {
    if (this.state === "running") {
      this.state = "paused";
      this.emit("paused", reason);
      this.emitPairVibeEvent({
        type: "paused",
        reason,
      });
    }
  }

  /**
   * Resume the reviewer after pause
   */
  resume(): void {
    if (this.state === "paused") {
      this.state = "running";
      this.emit("resumed");
      this.emitPairVibeEvent({
        type: "resumed",
      });
    }
  }

  /**
   * Wait for consensus to complete before continuing
   */
  async waitForConsensus(): Promise<void> {
    if (this.state !== "running") {
      return;
    }

    this.state = "waiting_for_consensus";

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.state !== "waiting_for_consensus") {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Signal that consensus has completed and reviewer can continue
   */
  consensusCompleted(): void {
    if (this.state === "waiting_for_consensus") {
      this.state = "running";
    }
  }

  /**
   * Stop the reviewer
   */
  stop(): void {
    this.state = "stopped";
    this.abortController?.abort();
    this.currentStepId = null;
  }

  /**
   * Reset the reviewer state for a new session
   */
  reset(): void {
    this.state = "idle";
    this.currentStepId = null;
    this.reviewedSteps.clear();
    this.stepProgress.clear();
    this.abortController = null;
  }

  /**
   * Skip reviewing a specific step
   */
  skipStep(stepId: string): void {
    this.reviewedSteps.add(stepId);
  }

  /**
   * Set the LLM client for analysis
   */
  setLLMClient(client: ReviewerLLMClient): void {
    (this as unknown as { llmClient: ReviewerLLMClient }).llmClient = client;
  }

  /**
   * Get the web search service
   */
  getWebSearchService(): WebSearchService {
    return this.webSearchService;
  }

  /**
   * Emit a PairVibe event
   */
  private emitPairVibeEvent(event: PairVibeEvent): void {
    if (this.pairVibeEventHandler) {
      this.pairVibeEventHandler(event);
    }
  }
}

/**
 * Create a ReviewerRunner instance
 */
export function createReviewerRunner(options: ReviewerRunnerOptions): ReviewerRunner {
  return new ReviewerRunner(options);
}

/**
 * Default LLM client implementation (placeholder)
 * Real implementation will use provider-specific APIs
 */
export function createDefaultReviewerLLMClient(): ReviewerLLMClient {
  return {
    async analyzeStep({ searchResults }) {
      // Placeholder implementation
      // Real implementation would call Claude/OpenAI API
      const findings: string[] = [];

      // Extract findings from search results as a baseline
      for (const search of searchResults) {
        for (const result of search.results) {
          const snippetLower = result.snippet.toLowerCase();
          if (
            snippetLower.includes("issue") ||
            snippetLower.includes("bug") ||
            snippetLower.includes("deprecated")
          ) {
            findings.push(
              `${result.title}: ${result.snippet.slice(0, 150)}...`
            );
          }
        }
      }

      return {
        findings: findings.slice(0, 3),
        reasoning: "Analysis based on web search results",
      };
    },
  };
}
