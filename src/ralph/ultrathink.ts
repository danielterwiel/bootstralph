/**
 * Ultrathink Prompting Module
 *
 * Provides extended thinking / deep reasoning capabilities for consensus mode.
 * Abstracts provider-specific implementations behind a unified interface.
 *
 * Based on PRD spec impl-007 and review-003 findings:
 * - CLAUDE: Use extended thinking mode with 'thinking' object and beta header
 * - OPENAI O-SERIES (o1, o3, o3-mini): Use 'reasoning_effort' parameter
 * - GPT-4 FALLBACK: Multi-turn reflection pattern (generate → critique → refine)
 *
 * Returns normalized responses with reasoning_summary and final_proposal fields.
 */

import type { WebSearchResponse } from "./web-search.js";
import type { UserStory } from "./prd-schema.js";
import type { ModelIdentifier, ClaudeModel } from "./pair-vibe-types.js";

/**
 * Provider-specific metadata for ultrathink
 */
export interface UltrathinkMetadata {
  /** For Claude: thinking block content (if exposed) */
  thinkingContent?: string;
  /** For OpenAI: reasoning effort level used */
  reasoningEffort?: "low" | "medium" | "high";
  /** For GPT-4 fallback: number of reflection turns */
  reflectionTurns?: number;
}

/**
 * Token usage information
 */
export interface UltrathinkTokenUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
}

/**
 * Result of ultrathink processing
 */
export interface UltrathinkResult {
  /** The final proposal after deep reasoning */
  finalProposal: string;

  /** Summary of reasoning chain (visible thinking/summary) */
  reasoningSummary: string;

  /** Whether extended thinking was used (vs fallback) */
  usedExtendedThinking: boolean;

  /** Model that generated this result */
  model: ModelIdentifier;

  /** Provider-specific metadata */
  metadata?: UltrathinkMetadata | undefined;

  /** Token usage if available */
  tokenUsage?: UltrathinkTokenUsage | undefined;

  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Parameters for ultrathink request
 */
export interface UltrathinkParams {
  /** The step being deliberated */
  step: UserStory;

  /** Findings that triggered consensus */
  findings: string[];

  /** Web search results for grounding (optional) */
  searchResults?: WebSearchResponse[];

  /** Model to use */
  model: ModelIdentifier;

  /** Timeout in milliseconds */
  timeout: number;

  /** Budget tokens for thinking (Claude only, default: 10000) */
  thinkingBudget?: number;

  /** Reasoning effort level (OpenAI o-series only, default: 'high') */
  reasoningEffort?: "low" | "medium" | "high";
}

/**
 * Interface for provider-specific ultrathink implementations
 */
export interface UltrathinkProvider {
  /**
   * Generate an ultrathink proposal
   */
  generateProposal(params: UltrathinkParams): Promise<UltrathinkResult>;

  /**
   * Check if this provider supports the given model
   */
  supportsModel(model: ModelIdentifier): boolean;
}

/**
 * Check if a model is a Claude model
 */
export function isClaudeModel(model: ModelIdentifier): model is ClaudeModel {
  return model.startsWith("claude-");
}

/**
 * Check if a model is an OpenAI o-series model (has native reasoning)
 */
export function isOpenAIOSeriesModel(model: ModelIdentifier): boolean {
  return model === "o1" || model === "o3" || model === "o3-mini";
}

/**
 * Check if a model is a GPT model (requires multi-turn fallback)
 */
export function isGPTModel(model: ModelIdentifier): boolean {
  return model === "gpt-4o" || model === "gpt-4.1";
}

/**
 * Claude Ultrathink Provider
 *
 * Uses Claude's extended thinking mode with the 'thinking' object.
 * Requires claude-sonnet-4, claude-opus-4, or claude-sonnet-4-5.
 */
export class ClaudeUltrathinkProvider implements UltrathinkProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = "https://api.anthropic.com") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  supportsModel(model: ModelIdentifier): boolean {
    return isClaudeModel(model);
  }

  async generateProposal(params: UltrathinkParams): Promise<UltrathinkResult> {
    const startTime = Date.now();
    const { step, findings, searchResults, model, timeout, thinkingBudget = 10000 } = params;

    // Build the prompt with context
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(step, findings, searchResults);

    // Ensure minimum budget (1024 tokens per review-003)
    const budgetTokens = Math.max(1024, thinkingBudget);

    // Build request body with extended thinking
    const requestBody = {
      model: this.mapModelId(model as ClaudeModel),
      max_tokens: 16000, // Must be > budget_tokens for non-interleaved
      thinking: {
        type: "enabled",
        budget_tokens: budgetTokens,
      },
      messages: [
        { role: "user", content: userPrompt },
      ],
      system: systemPrompt,
    };

    try {
      const response = await this.makeRequest(requestBody, timeout);
      const durationMs = Date.now() - startTime;

      return this.parseResponse(response, model, durationMs);
    } catch (error) {
      // On error, return a fallback result
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        finalProposal: `Unable to generate deep reasoning proposal: ${errorMessage}. Proceeding with standard approach for "${step.title}".`,
        reasoningSummary: `Extended thinking failed: ${errorMessage}`,
        usedExtendedThinking: false,
        model,
        durationMs,
      };
    }
  }

  private buildSystemPrompt(): string {
    return `You are an expert software architect participating in a consensus-building process.
Your role is to deeply analyze the proposed implementation step and the concerns raised.
Think through multiple approaches, consider trade-offs, and propose a well-reasoned solution.

When generating your proposal:
1. Consider all findings/concerns raised
2. Research best practices from the provided search results
3. Think through potential edge cases and failure modes
4. Propose a concrete, actionable solution
5. Explain your reasoning clearly

Your response should be a detailed proposal that addresses all concerns while maintaining code quality.`;
  }

  private buildUserPrompt(
    step: UserStory,
    findings: string[],
    searchResults?: WebSearchResponse[]
  ): string {
    let prompt = `## Implementation Step
**Title:** ${step.title}
**Description:** ${step.description || "No description provided"}

## Concerns/Findings Raised
${findings.map((f, i) => `${i + 1}. ${f}`).join("\n")}

`;

    if (searchResults && searchResults.length > 0) {
      prompt += `## Relevant Search Results
${this.formatSearchResults(searchResults)}

`;
    }

    prompt += `## Your Task
Analyze these concerns deeply and propose a solution that:
- Addresses each finding
- Follows best practices
- Maintains code quality and security
- Is practical to implement

Provide your proposal with clear reasoning.`;

    return prompt;
  }

  private formatSearchResults(results: WebSearchResponse[]): string {
    return results
      .filter((r) => !r.error && r.results.length > 0)
      .map((r) => {
        const topResults = r.results.slice(0, 3);
        return topResults
          .map((item) => `- **${item.title}** (${item.url})\n  ${item.snippet}`)
          .join("\n");
      })
      .join("\n\n");
  }

  private mapModelId(model: ClaudeModel): string {
    // Map to API model identifiers
    const modelMap: Record<ClaudeModel, string> = {
      "claude-sonnet-4-20250514": "claude-sonnet-4-20250514",
      "claude-opus-4-20250514": "claude-opus-4-20250514",
      "claude-sonnet-4-5-20250514": "claude-sonnet-4-5-20250514",
    };
    return modelMap[model] || model;
  }

  private async makeRequest(body: unknown, timeout: number): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2024-06-01",
          // Beta header for extended thinking (per review-003)
          "anthropic-beta": "interleaved-thinking-2025-05-14",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseResponse(
    response: unknown,
    model: ModelIdentifier,
    durationMs: number
  ): UltrathinkResult {
    const data = response as {
      content?: Array<{
        type: string;
        text?: string;
        thinking?: string;
      }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
    };

    // Extract thinking and text blocks
    let thinkingContent = "";
    let textContent = "";

    if (data.content) {
      for (const block of data.content) {
        if (block.type === "thinking" && block.thinking) {
          thinkingContent += block.thinking + "\n";
        } else if (block.type === "text" && block.text) {
          textContent += block.text + "\n";
        }
      }
    }

    // Generate reasoning summary from thinking content
    const reasoningSummary = thinkingContent
      ? this.summarizeThinking(thinkingContent)
      : "Extended thinking was used but content not exposed.";

    return {
      finalProposal: textContent.trim() || "No proposal generated.",
      reasoningSummary,
      usedExtendedThinking: true,
      model,
      metadata: thinkingContent
        ? { thinkingContent }
        : undefined,
      tokenUsage: data.usage
        ? {
            inputTokens: data.usage.input_tokens || 0,
            outputTokens: data.usage.output_tokens || 0,
          }
        : undefined,
      durationMs,
    };
  }

  private summarizeThinking(thinking: string): string {
    // Take first ~500 chars as summary
    const maxLength = 500;
    if (thinking.length <= maxLength) {
      return thinking;
    }
    return thinking.substring(0, maxLength) + "...";
  }
}

/**
 * OpenAI O-Series Ultrathink Provider
 *
 * Uses 'reasoning_effort' parameter for o1, o3, o3-mini models.
 */
export class OpenAIOSeriesUltrathinkProvider implements UltrathinkProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = "https://api.openai.com") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  supportsModel(model: ModelIdentifier): boolean {
    return isOpenAIOSeriesModel(model);
  }

  async generateProposal(params: UltrathinkParams): Promise<UltrathinkResult> {
    const startTime = Date.now();
    const { step, findings, searchResults, model, timeout, reasoningEffort = "high" } = params;

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(step, findings, searchResults);

    // Build request body with reasoning_effort
    const requestBody = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      reasoning_effort: reasoningEffort,
      max_completion_tokens: 16000,
    };

    try {
      const response = await this.makeRequest(requestBody, timeout);
      const durationMs = Date.now() - startTime;

      return this.parseResponse(response, model, reasoningEffort, durationMs);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        finalProposal: `Unable to generate reasoning proposal: ${errorMessage}. Proceeding with standard approach for "${step.title}".`,
        reasoningSummary: `O-series reasoning failed: ${errorMessage}`,
        usedExtendedThinking: false,
        model,
        durationMs,
      };
    }
  }

  private buildSystemPrompt(): string {
    return `You are an expert software architect participating in a consensus-building process.
Analyze the implementation step and concerns raised, then propose a well-reasoned solution.
Consider multiple approaches, trade-offs, edge cases, and security implications.
Provide a concrete, actionable proposal with clear reasoning.`;
  }

  private buildUserPrompt(
    step: UserStory,
    findings: string[],
    searchResults?: WebSearchResponse[]
  ): string {
    let prompt = `Implementation Step: "${step.title}"
Description: ${step.description || "No description"}

Concerns Raised:
${findings.map((f, i) => `${i + 1}. ${f}`).join("\n")}

`;

    if (searchResults && searchResults.length > 0) {
      prompt += `Relevant Research:
${this.formatSearchResults(searchResults)}

`;
    }

    prompt += `Propose a solution that addresses all concerns while maintaining code quality.`;

    return prompt;
  }

  private formatSearchResults(results: WebSearchResponse[]): string {
    return results
      .filter((r) => !r.error && r.results.length > 0)
      .flatMap((r) => r.results.slice(0, 2))
      .map((item) => `- ${item.title}: ${item.snippet}`)
      .join("\n");
  }

  private async makeRequest(body: unknown, timeout: number): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseResponse(
    response: unknown,
    model: ModelIdentifier,
    reasoningEffort: "low" | "medium" | "high",
    durationMs: number
  ): UltrathinkResult {
    const data = response as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        completion_tokens_details?: {
          reasoning_tokens?: number;
        };
      };
    };

    const content = data.choices?.[0]?.message?.content || "";
    const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens;

    // O-series models have hidden chain of thought, provide summary
    const reasoningSummary = reasoningTokens
      ? `Deep reasoning performed with ${reasoningTokens} reasoning tokens (effort: ${reasoningEffort}).`
      : `Reasoning at ${reasoningEffort} effort level (chain of thought hidden).`;

    return {
      finalProposal: content.trim() || "No proposal generated.",
      reasoningSummary,
      usedExtendedThinking: true,
      model,
      metadata: {
        reasoningEffort,
      },
      tokenUsage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens || 0,
            outputTokens: data.usage.completion_tokens || 0,
            ...(reasoningTokens !== undefined ? { thinkingTokens: reasoningTokens } : {}),
          }
        : undefined,
      durationMs,
    };
  }
}

/**
 * GPT-4 Multi-Turn Reflection Provider (Fallback)
 *
 * Uses multi-turn reflection pattern for models without native extended thinking:
 * Turn 1: Generate initial proposal
 * Turn 2: Critique own proposal
 * Turn 3: Refine based on critique
 */
export class GPT4ReflectionProvider implements UltrathinkProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = "https://api.openai.com") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  supportsModel(model: ModelIdentifier): boolean {
    return isGPTModel(model);
  }

  async generateProposal(params: UltrathinkParams): Promise<UltrathinkResult> {
    const startTime = Date.now();
    const { step, findings, searchResults, model, timeout } = params;

    // Divide timeout across turns (with buffer for API overhead)
    const turnTimeout = Math.floor(timeout * 0.3);

    try {
      // Turn 1: Generate initial proposal
      const initialPrompt = this.buildInitialPrompt(step, findings, searchResults);
      const initialProposal = await this.callGPT(model, initialPrompt, turnTimeout);

      // Turn 2: Critique the proposal
      const critiquePrompt = this.buildCritiquePrompt(initialProposal);
      const critique = await this.callGPT(model, critiquePrompt, turnTimeout);

      // Turn 3: Refine based on critique
      const refinePrompt = this.buildRefinePrompt(initialProposal, critique);
      const refinedProposal = await this.callGPT(model, refinePrompt, turnTimeout);

      const durationMs = Date.now() - startTime;

      return {
        finalProposal: refinedProposal,
        reasoningSummary: `Multi-turn reflection: Initial proposal → Self-critique → Refined solution.\n\nCritique summary: ${this.summarize(critique)}`,
        usedExtendedThinking: false, // Using reflection fallback
        model,
        metadata: {
          reflectionTurns: 3,
        },
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        finalProposal: `Unable to generate proposal via reflection: ${errorMessage}. Proceeding with standard approach for "${step.title}".`,
        reasoningSummary: `Multi-turn reflection failed: ${errorMessage}`,
        usedExtendedThinking: false,
        model,
        durationMs,
      };
    }
  }

  private buildInitialPrompt(
    step: UserStory,
    findings: string[],
    searchResults?: WebSearchResponse[]
  ): string {
    let prompt = `You are an expert software architect. Analyze this implementation step and propose a solution.

## Implementation Step
**Title:** ${step.title}
**Description:** ${step.description || "No description"}

## Concerns Raised
${findings.map((f, i) => `${i + 1}. ${f}`).join("\n")}

`;

    if (searchResults && searchResults.length > 0) {
      prompt += `## Research
${this.formatSearchResults(searchResults)}

`;
    }

    prompt += `Provide a detailed proposal that addresses all concerns.`;

    return prompt;
  }

  private buildCritiquePrompt(proposal: string): string {
    return `Review the following proposal for flaws, edge cases, and improvements.
Be thorough and critical - identify any weaknesses, missing considerations, or potential issues.

## Proposal to Review
${proposal}

## Your Task
Provide a detailed critique covering:
1. Potential edge cases not addressed
2. Security considerations
3. Performance implications
4. Maintainability concerns
5. Alternative approaches that might be better
6. Any flaws in the reasoning`;
  }

  private buildRefinePrompt(originalProposal: string, critique: string): string {
    return `Refine your proposal based on the critique provided.

## Original Proposal
${originalProposal}

## Critique
${critique}

## Your Task
Provide an improved proposal that:
1. Addresses all valid points from the critique
2. Maintains the strengths of the original
3. Adds any missing considerations
4. Results in a more robust solution

Provide your refined proposal.`;
  }

  private formatSearchResults(results: WebSearchResponse[]): string {
    return results
      .filter((r) => !r.error && r.results.length > 0)
      .flatMap((r) => r.results.slice(0, 2))
      .map((item) => `- ${item.title}: ${item.snippet}`)
      .join("\n");
  }

  private async callGPT(model: string, prompt: string, timeout: number): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 4000,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      return data.choices?.[0]?.message?.content || "";
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private summarize(text: string, maxLength = 200): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  }
}

/**
 * Factory to create the appropriate ultrathink provider for a model
 */
export function createUltrathinkProvider(
  model: ModelIdentifier,
  config: {
    anthropicApiKey?: string;
    openaiApiKey?: string;
    anthropicBaseUrl?: string;
    openaiBaseUrl?: string;
  }
): UltrathinkProvider | null {
  if (isClaudeModel(model)) {
    if (!config.anthropicApiKey) {
      return null;
    }
    return new ClaudeUltrathinkProvider(config.anthropicApiKey, config.anthropicBaseUrl);
  }

  if (isOpenAIOSeriesModel(model)) {
    if (!config.openaiApiKey) {
      return null;
    }
    return new OpenAIOSeriesUltrathinkProvider(config.openaiApiKey, config.openaiBaseUrl);
  }

  if (isGPTModel(model)) {
    if (!config.openaiApiKey) {
      return null;
    }
    return new GPT4ReflectionProvider(config.openaiApiKey, config.openaiBaseUrl);
  }

  return null;
}

/**
 * Generate an ultrathink proposal with automatic provider selection
 */
export async function generateUltrathinkProposal(
  params: UltrathinkParams,
  config: {
    anthropicApiKey?: string;
    openaiApiKey?: string;
    anthropicBaseUrl?: string;
    openaiBaseUrl?: string;
  }
): Promise<UltrathinkResult> {
  const startTime = Date.now();
  const provider = createUltrathinkProvider(params.model, config);

  if (!provider) {
    return {
      finalProposal: `No ultrathink provider available for model ${params.model}. Using standard approach for "${params.step.title}".`,
      reasoningSummary: "No provider configured for extended thinking.",
      usedExtendedThinking: false,
      model: params.model,
      durationMs: Date.now() - startTime,
    };
  }

  return provider.generateProposal(params);
}

/**
 * Check if a model supports native extended thinking
 */
export function supportsExtendedThinking(model: ModelIdentifier): boolean {
  return isClaudeModel(model) || isOpenAIOSeriesModel(model);
}

/**
 * Get recommended thinking budget for a model
 */
export function getRecommendedThinkingBudget(model: ModelIdentifier): number {
  if (isClaudeModel(model)) {
    // Claude extended thinking: 10000 tokens recommended, minimum 1024
    return 10000;
  }
  // OpenAI o-series doesn't use budget_tokens
  return 0;
}

/**
 * Get recommended reasoning effort for OpenAI o-series
 */
export function getRecommendedReasoningEffort(
  model: ModelIdentifier
): "low" | "medium" | "high" | null {
  if (isOpenAIOSeriesModel(model)) {
    // Per review-003: 'high' improves accuracy 10-30% but costs more
    return "high";
  }
  return null;
}
