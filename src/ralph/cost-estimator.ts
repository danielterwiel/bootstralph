/**
 * Cost Estimator for Pair Vibe Mode
 *
 * Provides pre-session cost estimation based on:
 * - Number of tasks/steps in the PRD
 * - Expected consensus rate
 * - Model pricing
 * - Web search costs
 *
 * Per review-008: Expected cost 2-4x single model depending on consensus frequency
 */

import type { Prd, UserStory, ReviewTask } from "./prd-schema.js";
import type { ExtendedPrd, ImplementationTask } from "./prd-manager.js";
import type { PairVibeConfig, ModelIdentifier } from "./pair-vibe-types.js";
import { MODEL_PRICING, WEB_SEARCH_COST_PER_QUERY } from "./pair-vibe-metrics.js";

/**
 * Union type for PRDs - supports both standard and extended formats
 */
type AnyPrd = Prd | ExtendedPrd;

/**
 * Consensus rate category for estimation
 */
export type ConsensusRateCategory = "low" | "medium" | "high";

/**
 * Estimated cost breakdown
 */
export interface CostEstimate {
  /** Estimated executor cost in USD */
  executorCost: number;

  /** Estimated reviewer cost in USD */
  reviewerCost: number;

  /** Estimated consensus cost in USD */
  consensusCost: number;

  /** Estimated web search cost in USD */
  webSearchCost: number;

  /** Total estimated cost in USD */
  totalCost: number;

  /** Cost multiplier vs single-model execution */
  multiplier: number;

  /** Consensus rate category used for estimation */
  consensusRateCategory: ConsensusRateCategory;

  /** Number of steps used in estimation */
  stepCount: number;

  /** Number of consensus rounds expected */
  expectedConsensusRounds: number;

  /** Estimated web searches */
  estimatedWebSearches: number;

  /** Cost range (min-max) */
  range: {
    min: number;
    max: number;
  };
}

/**
 * Cost estimation options
 */
export interface CostEstimatorOptions {
  /** Override the consensus rate category */
  consensusRateCategory?: ConsensusRateCategory;

  /** Average tokens per step for executor */
  averageExecutorTokensPerStep?: number;

  /** Average tokens per step for reviewer */
  averageReviewerTokensPerStep?: number;

  /** Average tokens per consensus round */
  averageConsensusTokensPerRound?: number;

  /** Web searches per step (for reviewer) */
  webSearchesPerStep?: number;
}

/**
 * Default token estimates per step (based on typical Claude Code usage)
 */
const DEFAULT_EXECUTOR_TOKENS_PER_STEP = {
  input: 8000,  // Context, PRD, instructions
  output: 2000, // Code, explanations
};

const DEFAULT_REVIEWER_TOKENS_PER_STEP = {
  input: 4000,  // Step + search results
  output: 500,  // Brief analysis
};

const DEFAULT_CONSENSUS_TOKENS_PER_ROUND = {
  input: 6000,  // Both proposals + context
  output: 1500, // Proposals and alignment
};

/**
 * Consensus rate percentages by category
 * Based on review-008 findings
 */
const CONSENSUS_RATES: Record<ConsensusRateCategory, number> = {
  low: 0.10,    // 10% of steps trigger consensus
  medium: 0.25, // 25% of steps trigger consensus
  high: 0.40,   // 40% of steps trigger consensus
};

/**
 * Average consensus rounds when triggered
 */
const AVG_CONSENSUS_ROUNDS = 1.5;

/**
 * Get model pricing, with fallback for unknown models
 */
function getModelPricing(model: ModelIdentifier): { inputPerM: number; outputPerM: number } {
  if (model in MODEL_PRICING) {
    return MODEL_PRICING[model];
  }
  // Fallback to GPT-4o pricing for unknown models
  return { inputPerM: 2.5, outputPerM: 10.0 };
}

/**
 * Count the number of pending steps in a PRD
 */
export function countPendingSteps(prd: AnyPrd): number {
  let count = 0;

  // Count review tasks (ExtendedPrd format)
  const extPrd = prd as ExtendedPrd;
  if (extPrd.review_tasks) {
    for (const task of extPrd.review_tasks) {
      if (task.status !== "completed") {
        count++;
      }
    }
  }

  // Count implementation tasks (ExtendedPrd format)
  if (extPrd.implementation_tasks) {
    for (const task of extPrd.implementation_tasks) {
      if (task.status !== "completed") {
        count++;
      }
    }
  }

  // Count user stories (standard Prd format)
  const stdPrd = prd as Prd;
  if (stdPrd.userStories) {
    for (const story of stdPrd.userStories) {
      if (!story.passes) {
        count++;
      }
    }
  }

  // Count review tasks (standard Prd format - camelCase)
  if (stdPrd.reviewTasks) {
    for (const task of stdPrd.reviewTasks) {
      if (task.status !== "completed") {
        count++;
      }
    }
  }

  return count;
}

/**
 * Estimate task complexity based on description
 * Returns a multiplier (1.0 = average, >1.0 = more complex)
 */
function estimateTaskComplexity(task: UserStory | ReviewTask | ImplementationTask | { description?: string; task?: string }): number {
  let description = "";

  if ("description" in task && task.description) {
    description = task.description;
  } else if ("task" in task && task.task) {
    description = task.task;
  } else if ("title" in task) {
    description = (task as UserStory).title;
  }

  const lowerDesc = description.toLowerCase();
  let complexity = 1.0;

  // Indicators of higher complexity
  if (lowerDesc.includes("refactor")) complexity += 0.3;
  if (lowerDesc.includes("integration")) complexity += 0.3;
  if (lowerDesc.includes("test")) complexity += 0.2;
  if (lowerDesc.includes("authentication") || lowerDesc.includes("auth")) complexity += 0.3;
  if (lowerDesc.includes("database") || lowerDesc.includes("migration")) complexity += 0.3;
  if (lowerDesc.includes("api")) complexity += 0.2;
  if (lowerDesc.includes("multiple") || lowerDesc.includes("several")) complexity += 0.2;

  // Indicators of lower complexity
  if (lowerDesc.includes("simple")) complexity -= 0.2;
  if (lowerDesc.includes("fix typo") || lowerDesc.includes("typo")) complexity -= 0.3;
  if (lowerDesc.includes("comment") || lowerDesc.includes("documentation")) complexity -= 0.2;
  if (lowerDesc.includes("rename")) complexity -= 0.2;

  // Clamp to reasonable range
  return Math.max(0.5, Math.min(2.0, complexity));
}

/**
 * Suggest a consensus rate category based on PRD analysis
 */
export function suggestConsensusRate(prd: AnyPrd): ConsensusRateCategory {
  let totalComplexity = 0;
  let taskCount = 0;

  const extPrd = prd as ExtendedPrd;
  const stdPrd = prd as Prd;

  // Analyze review tasks (ExtendedPrd format)
  if (extPrd.review_tasks) {
    for (const task of extPrd.review_tasks) {
      if (task.status !== "completed") {
        totalComplexity += estimateTaskComplexity(task);
        taskCount++;
      }
    }
  }

  // Analyze implementation tasks (ExtendedPrd format)
  if (extPrd.implementation_tasks) {
    for (const task of extPrd.implementation_tasks) {
      if (task.status !== "completed") {
        totalComplexity += estimateTaskComplexity(task);
        taskCount++;
      }
    }
  }

  // Analyze user stories (standard Prd format)
  if (stdPrd.userStories) {
    for (const story of stdPrd.userStories) {
      if (!story.passes) {
        totalComplexity += estimateTaskComplexity(story);
        taskCount++;
      }
    }
  }

  // Analyze review tasks (standard Prd format - camelCase)
  if (stdPrd.reviewTasks) {
    for (const task of stdPrd.reviewTasks) {
      if (task.status !== "completed") {
        totalComplexity += estimateTaskComplexity(task);
        taskCount++;
      }
    }
  }

  if (taskCount === 0) {
    return "low";
  }

  const avgComplexity = totalComplexity / taskCount;

  if (avgComplexity > 1.3) {
    return "high";
  } else if (avgComplexity > 1.0) {
    return "medium";
  }
  return "low";
}

/**
 * Calculate cost for token usage
 */
function calculateTokenCost(
  inputTokens: number,
  outputTokens: number,
  model: ModelIdentifier,
  cacheRate: number = 0
): number {
  const pricing = getModelPricing(model);

  // Apply cache discount (90% for cached input tokens)
  const effectiveInputTokens = inputTokens * (1 - cacheRate * 0.9);

  const inputCost = (effectiveInputTokens / 1_000_000) * pricing.inputPerM;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerM;

  return inputCost + outputCost;
}

/**
 * Estimate the cost of running Pair Vibe Mode on a PRD
 */
export function estimatePairVibeCost(
  prd: AnyPrd,
  config: PairVibeConfig,
  options: CostEstimatorOptions = {}
): CostEstimate {
  const stepCount = countPendingSteps(prd);

  if (stepCount === 0) {
    return {
      executorCost: 0,
      reviewerCost: 0,
      consensusCost: 0,
      webSearchCost: 0,
      totalCost: 0,
      multiplier: 1.0,
      consensusRateCategory: "low",
      stepCount: 0,
      expectedConsensusRounds: 0,
      estimatedWebSearches: 0,
      range: { min: 0, max: 0 },
    };
  }

  // Determine consensus rate
  const consensusRateCategory = options.consensusRateCategory ?? suggestConsensusRate(prd);
  const consensusRate = CONSENSUS_RATES[consensusRateCategory];

  // Token estimates
  const executorTokens = options.averageExecutorTokensPerStep ?? DEFAULT_EXECUTOR_TOKENS_PER_STEP;
  const reviewerTokens = options.averageReviewerTokensPerStep ?? DEFAULT_REVIEWER_TOKENS_PER_STEP;
  const consensusTokens = options.averageConsensusTokensPerRound ?? DEFAULT_CONSENSUS_TOKENS_PER_ROUND;
  const webSearchesPerStep = options.webSearchesPerStep ?? 1.5;

  // Calculate expected consensus rounds
  const stepsWithConsensus = Math.ceil(stepCount * consensusRate);
  const expectedConsensusRounds = stepsWithConsensus * AVG_CONSENSUS_ROUNDS;

  // Calculate executor cost (all steps)
  const executorInputTokens = typeof executorTokens === "number"
    ? executorTokens : executorTokens.input;
  const executorOutputTokens = typeof executorTokens === "number"
    ? executorTokens * 0.25 : executorTokens.output;
  const executorCost = stepCount * calculateTokenCost(
    executorInputTokens,
    executorOutputTokens,
    config.executorModel,
    0.3 // Assume 30% cache hit rate for repeated context
  );

  // Calculate reviewer cost (all steps)
  const reviewerInputTokens = typeof reviewerTokens === "number"
    ? reviewerTokens : reviewerTokens.input;
  const reviewerOutputTokens = typeof reviewerTokens === "number"
    ? reviewerTokens * 0.125 : reviewerTokens.output;
  const reviewerCost = stepCount * calculateTokenCost(
    reviewerInputTokens,
    reviewerOutputTokens,
    config.reviewerModel,
    0.2 // Assume 20% cache hit rate
  );

  // Calculate consensus cost (steps with findings only)
  const consensusInputTokens = typeof consensusTokens === "number"
    ? consensusTokens : consensusTokens.input;
  const consensusOutputTokens = typeof consensusTokens === "number"
    ? consensusTokens * 0.25 : consensusTokens.output;
  const perRoundCost = calculateTokenCost(
    consensusInputTokens,
    consensusOutputTokens,
    config.executorModel, // Consensus uses both, but attribute to executor for simplicity
    0
  );
  const consensusCost = expectedConsensusRounds * perRoundCost;

  // Calculate web search cost
  const estimatedWebSearches = Math.ceil(stepCount * webSearchesPerStep);
  const webSearchCost = estimatedWebSearches * WEB_SEARCH_COST_PER_QUERY;

  // Total cost
  const totalCost = executorCost + reviewerCost + consensusCost + webSearchCost;

  // Calculate multiplier (compared to executor-only baseline)
  const baselineCost = executorCost;
  const multiplier = baselineCost > 0 ? totalCost / baselineCost : 1.0;

  // Calculate range based on consensus rate variance
  const lowConsensusTotal = executorCost + reviewerCost +
    (Math.ceil(stepCount * CONSENSUS_RATES.low) * AVG_CONSENSUS_ROUNDS * perRoundCost) +
    webSearchCost;
  const highConsensusTotal = executorCost + reviewerCost +
    (Math.ceil(stepCount * CONSENSUS_RATES.high) * AVG_CONSENSUS_ROUNDS * perRoundCost) +
    webSearchCost;

  return {
    executorCost,
    reviewerCost,
    consensusCost,
    webSearchCost,
    totalCost,
    multiplier: Math.round(multiplier * 10) / 10,
    consensusRateCategory,
    stepCount,
    expectedConsensusRounds: Math.round(expectedConsensusRounds * 10) / 10,
    estimatedWebSearches,
    range: {
      min: Math.round(lowConsensusTotal * 100) / 100,
      max: Math.round(highConsensusTotal * 100) / 100,
    },
  };
}

/**
 * Format a cost estimate for display
 */
export function formatCostEstimate(estimate: CostEstimate): string {
  const lines: string[] = [];

  lines.push("┌─────────────────────────────────────────────────────┐");
  lines.push("│           PAIR VIBE MODE COST ESTIMATE              │");
  lines.push("├─────────────────────────────────────────────────────┤");
  lines.push(`│  Steps to process: ${estimate.stepCount.toString().padStart(28)} │`);
  lines.push(`│  Expected consensus rate: ${estimate.consensusRateCategory.padStart(22)} │`);
  lines.push(`│  Expected consensus rounds: ${estimate.expectedConsensusRounds.toString().padStart(20)} │`);
  lines.push("├─────────────────────────────────────────────────────┤");
  lines.push("│  COST BREAKDOWN:                                    │");
  lines.push(`│    Executor:   $${estimate.executorCost.toFixed(4).padStart(32)} │`);
  lines.push(`│    Reviewer:   $${estimate.reviewerCost.toFixed(4).padStart(32)} │`);
  lines.push(`│    Consensus:  $${estimate.consensusCost.toFixed(4).padStart(32)} │`);
  lines.push(`│    Web Search: $${estimate.webSearchCost.toFixed(4).padStart(32)} │`);
  lines.push("├─────────────────────────────────────────────────────┤");
  lines.push(`│    ESTIMATED TOTAL: $${estimate.totalCost.toFixed(4).padStart(28)} │`);
  lines.push(`│    Range: $${estimate.range.min.toFixed(2)} - $${estimate.range.max.toFixed(2)}`.padEnd(52) + "│");
  lines.push(`│    Multiplier: ${estimate.multiplier.toFixed(1)}x vs single-model`.padEnd(52) + "│");
  lines.push("└─────────────────────────────────────────────────────┘");

  return lines.join("\n");
}

/**
 * Format a cost estimate as a short warning message
 */
export function formatCostWarning(estimate: CostEstimate): string {
  return `Pair Vibe Mode will process ${estimate.stepCount} steps.
Estimated cost: $${estimate.totalCost.toFixed(2)} (range: $${estimate.range.min.toFixed(2)} - $${estimate.range.max.toFixed(2)})
Cost multiplier: ${estimate.multiplier.toFixed(1)}x vs single-model execution`;
}

/**
 * Check if cost exceeds a threshold and return a warning message
 */
export function getCostWarningLevel(estimate: CostEstimate): "none" | "info" | "warn" | "danger" {
  if (estimate.totalCost > 10.0) {
    return "danger";
  } else if (estimate.totalCost > 5.0) {
    return "warn";
  } else if (estimate.totalCost > 1.0) {
    return "info";
  }
  return "none";
}

/**
 * Get a recommendation message based on cost estimate
 */
export function getCostRecommendation(estimate: CostEstimate): string | null {
  const level = getCostWarningLevel(estimate);

  if (level === "danger") {
    return `⚠️  High cost alert: Estimated $${estimate.totalCost.toFixed(2)}. Consider breaking the PRD into smaller batches.`;
  } else if (level === "warn") {
    return `⚡ Moderate cost: Estimated $${estimate.totalCost.toFixed(2)}. Monitor usage during execution.`;
  } else if (estimate.consensusRateCategory === "high") {
    return "💡 High consensus rate expected. Consider clarifying ambiguous task descriptions to reduce friction.";
  }

  return null;
}

/**
 * Estimate single-model cost for comparison
 */
export function estimateSingleModelCost(
  prd: AnyPrd,
  model: ModelIdentifier,
  options: Pick<CostEstimatorOptions, "averageExecutorTokensPerStep"> = {}
): number {
  const stepCount = countPendingSteps(prd);

  if (stepCount === 0) {
    return 0;
  }

  const executorTokens = options.averageExecutorTokensPerStep ?? DEFAULT_EXECUTOR_TOKENS_PER_STEP;
  const inputTokens = typeof executorTokens === "number"
    ? executorTokens : executorTokens.input;
  const outputTokens = typeof executorTokens === "number"
    ? executorTokens * 0.25 : executorTokens.output;

  return stepCount * calculateTokenCost(inputTokens, outputTokens, model, 0.3);
}

/**
 * Compare Pair Vibe cost to single-model cost
 */
export function compareCosts(
  prd: AnyPrd,
  config: PairVibeConfig
): {
  singleModel: number;
  pairVibe: number;
  savings: number;
  multiplier: number;
  recommendation: string;
} {
  const singleModelCost = estimateSingleModelCost(prd, config.executorModel);
  const pairVibeEstimate = estimatePairVibeCost(prd, config);

  const multiplier = singleModelCost > 0
    ? pairVibeEstimate.totalCost / singleModelCost
    : 1.0;

  let recommendation: string;
  if (multiplier < 1.5) {
    recommendation = "Pair Vibe Mode cost overhead is minimal. Recommended for improved quality.";
  } else if (multiplier < 2.5) {
    recommendation = "Pair Vibe Mode provides good cost-benefit for complex tasks.";
  } else if (multiplier < 3.5) {
    recommendation = "Consider Pair Vibe Mode for critical or high-stakes implementations.";
  } else {
    recommendation = "High cost multiplier. Use Pair Vibe Mode only for the most critical tasks.";
  }

  return {
    singleModel: Math.round(singleModelCost * 100) / 100,
    pairVibe: Math.round(pairVibeEstimate.totalCost * 100) / 100,
    savings: Math.round((pairVibeEstimate.totalCost - singleModelCost) * 100) / 100,
    multiplier: Math.round(multiplier * 10) / 10,
    recommendation,
  };
}
