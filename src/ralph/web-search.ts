/**
 * Web Search Service for Pair Vibe Mode Reviewer
 *
 * Provides web search capabilities for the Reviewer to validate implementation steps.
 * Uses Tavily API (primary) with Brave Search API fallback.
 *
 * Based on review-002 findings:
 * - Tavily: $0.008/credit, 1-2 credits/search, designed for AI agents
 * - Brave: $5/1000 requests, 2000 free/month, privacy-focused
 * - Cache results by query hash for 15 minutes
 *
 * Environment variables:
 * - TAVILY_API_KEY: Primary search provider
 * - BRAVE_SEARCH_API_KEY: Fallback search provider
 */

import type { PairVibeEvent } from "./pair-vibe-types";

/**
 * Search result from any provider
 */
export interface WebSearchResult {
  /** Title of the result */
  title: string;
  /** URL of the result */
  url: string;
  /** Snippet/description of the result */
  snippet: string;
  /** Relevance score (0-1, if available) */
  score?: number;
  /** Published date (if available) */
  publishedDate?: string;
}

/**
 * Response from web search
 */
export interface WebSearchResponse {
  /** Query that was searched */
  query: string;
  /** Search results */
  results: WebSearchResult[];
  /** Which provider was used */
  provider: "tavily" | "brave" | "none";
  /** Whether this was a cached response */
  cached: boolean;
  /** Time taken in milliseconds */
  durationMs: number;
  /** Error message if search failed */
  error?: string;
}

/**
 * Search query options
 */
export interface WebSearchOptions {
  /** Maximum number of results to return */
  maxResults?: number;
  /** Search depth for Tavily: 'basic' (1 credit) or 'advanced' (2 credits) */
  searchDepth?: "basic" | "advanced";
  /** Include domains (for Tavily) */
  includeDomains?: string[];
  /** Exclude domains (for Tavily) */
  excludeDomains?: string[];
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Cache entry for search results
 */
interface CacheEntry {
  response: WebSearchResponse;
  expiresAt: number;
}

/**
 * Default options for web search
 */
const DEFAULT_SEARCH_OPTIONS: Required<WebSearchOptions> = {
  maxResults: 5,
  searchDepth: "basic",
  includeDomains: [],
  excludeDomains: [],
  timeout: 30000, // 30 seconds per review-007
};

/**
 * Cache TTL in milliseconds (15 minutes)
 */
const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Tavily API response structure
 */
interface TavilyResponse {
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    published_date?: string;
  }>;
  query: string;
  response_time: number;
}

/**
 * Brave Search API response structure
 */
interface BraveResponse {
  web?: {
    results: Array<{
      title: string;
      url: string;
      description: string;
      page_age?: string;
    }>;
  };
  query?: {
    original: string;
  };
}

/**
 * Web Search Service
 *
 * Provides search capabilities for the Reviewer model to validate
 * implementation approaches against best practices and known issues.
 */
export class WebSearchService {
  private cache: Map<string, CacheEntry> = new Map();
  private tavilyApiKey: string | null;
  private braveApiKey: string | null;
  private eventHandler: ((event: PairVibeEvent) => void) | null;

  constructor(eventHandler?: (event: PairVibeEvent) => void) {
    this.tavilyApiKey = process.env.TAVILY_API_KEY || null;
    this.braveApiKey = process.env.BRAVE_SEARCH_API_KEY || null;
    this.eventHandler = eventHandler ?? null;
  }

  /**
   * Check if any search provider is available
   */
  isAvailable(): boolean {
    return this.tavilyApiKey !== null || this.braveApiKey !== null;
  }

  /**
   * Get which providers are available
   */
  getAvailableProviders(): ("tavily" | "brave")[] {
    const providers: ("tavily" | "brave")[] = [];
    if (this.tavilyApiKey) providers.push("tavily");
    if (this.braveApiKey) providers.push("brave");
    return providers;
  }

  /**
   * Search the web for information relevant to a step
   */
  async search(
    query: string,
    stepId: string,
    options: WebSearchOptions = {}
  ): Promise<WebSearchResponse> {
    const opts = { ...DEFAULT_SEARCH_OPTIONS, ...options };
    const startTime = Date.now();

    // Check cache first
    const cacheKey = this.getCacheKey(query, opts);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return {
        ...cached,
        cached: true,
        durationMs: Date.now() - startTime,
      };
    }

    // Emit search started event
    this.emitEvent({
      type: "web-search-started",
      stepId,
      query,
    });

    // Try Tavily first, then Brave
    let response: WebSearchResponse;
    if (this.tavilyApiKey) {
      response = await this.searchTavily(query, opts);
      if (!response.error) {
        this.addToCache(cacheKey, response);
        this.emitEvent({
          type: "web-search-completed",
          stepId,
          resultCount: response.results.length,
        });
        return response;
      }
    }

    // Fallback to Brave
    if (this.braveApiKey) {
      response = await this.searchBrave(query, opts);
      if (!response.error) {
        this.addToCache(cacheKey, response);
        this.emitEvent({
          type: "web-search-completed",
          stepId,
          resultCount: response.results.length,
        });
        return response;
      }
    }

    // No provider available or all failed
    const errorResponse: WebSearchResponse = {
      query,
      results: [],
      provider: "none",
      cached: false,
      durationMs: Date.now() - startTime,
      error: this.isAvailable()
        ? "All search providers failed"
        : "No search provider configured (set TAVILY_API_KEY or BRAVE_SEARCH_API_KEY)",
    };

    this.emitEvent({
      type: "web-search-failed",
      stepId,
      error: errorResponse.error!,
    });

    return errorResponse;
  }

  /**
   * Search using Tavily API
   */
  private async searchTavily(
    query: string,
    options: Required<WebSearchOptions>
  ): Promise<WebSearchResponse> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout);

      const requestBody: Record<string, unknown> = {
        api_key: this.tavilyApiKey,
        query,
        search_depth: options.searchDepth,
        max_results: options.maxResults,
      };

      if (options.includeDomains.length > 0) {
        requestBody.include_domains = options.includeDomains;
      }
      if (options.excludeDomains.length > 0) {
        requestBody.exclude_domains = options.excludeDomains;
      }

      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          query,
          results: [],
          provider: "tavily",
          cached: false,
          durationMs: Date.now() - startTime,
          error: `Tavily API error (${response.status}): ${errorText}`,
        };
      }

      const data = (await response.json()) as TavilyResponse;

      return {
        query,
        results: data.results.map((r) => {
          const result: WebSearchResult = {
            title: r.title,
            url: r.url,
            snippet: r.content,
            score: r.score,
          };
          if (r.published_date) {
            result.publishedDate = r.published_date;
          }
          return result;
        }),
        provider: "tavily",
        cached: false,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.name === "AbortError"
            ? "Request timed out"
            : error.message
          : "Unknown error";

      return {
        query,
        results: [],
        provider: "tavily",
        cached: false,
        durationMs: Date.now() - startTime,
        error: `Tavily search failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Search using Brave Search API
   */
  private async searchBrave(
    query: string,
    options: Required<WebSearchOptions>
  ): Promise<WebSearchResponse> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout);

      const params = new URLSearchParams({
        q: query,
        count: String(options.maxResults),
      });

      const response = await fetch(
        `https://api.search.brave.com/res/v1/web/search?${params}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": this.braveApiKey!,
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          query,
          results: [],
          provider: "brave",
          cached: false,
          durationMs: Date.now() - startTime,
          error: `Brave API error (${response.status}): ${errorText}`,
        };
      }

      const data = (await response.json()) as BraveResponse;

      return {
        query,
        results: (data.web?.results || []).map((r) => {
          const result: WebSearchResult = {
            title: r.title,
            url: r.url,
            snippet: r.description,
          };
          if (r.page_age) {
            result.publishedDate = r.page_age;
          }
          return result;
        }),
        provider: "brave",
        cached: false,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.name === "AbortError"
            ? "Request timed out"
            : error.message
          : "Unknown error";

      return {
        query,
        results: [],
        provider: "brave",
        cached: false,
        durationMs: Date.now() - startTime,
        error: `Brave search failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Generate a cache key for a query and options
   */
  private getCacheKey(query: string, options: Required<WebSearchOptions>): string {
    const normalized = query.toLowerCase().trim();
    const optString = JSON.stringify({
      maxResults: options.maxResults,
      searchDepth: options.searchDepth,
      includeDomains: options.includeDomains.sort(),
      excludeDomains: options.excludeDomains.sort(),
    });
    return `${normalized}::${optString}`;
  }

  /**
   * Get a response from cache if not expired
   */
  private getFromCache(key: string): WebSearchResponse | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.response;
  }

  /**
   * Add a response to cache
   */
  private addToCache(key: string, response: WebSearchResponse): void {
    this.cache.set(key, {
      response,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): number {
    const now = Date.now();
    let cleared = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; oldestEntryAge: number | null } {
    if (this.cache.size === 0) {
      return { size: 0, oldestEntryAge: null };
    }

    const now = Date.now();
    let oldestAge = 0;

    for (const entry of this.cache.values()) {
      const age = now - (entry.expiresAt - CACHE_TTL_MS);
      if (age > oldestAge) oldestAge = age;
    }

    return { size: this.cache.size, oldestEntryAge: oldestAge };
  }

  /**
   * Emit a PairVibe event
   */
  private emitEvent(event: PairVibeEvent): void {
    if (this.eventHandler) {
      this.eventHandler(event);
    }
  }

  /**
   * Set the event handler
   */
  setEventHandler(handler: (event: PairVibeEvent) => void): void {
    this.eventHandler = handler;
  }
}

/**
 * Search query builders for common Reviewer use cases
 */
export const searchQueries = {
  /**
   * Build a query for best practices search
   */
  bestPractices(technology: string, context: string): string {
    return `${technology} best practices ${context} 2025`;
  },

  /**
   * Build a query for known issues search
   */
  knownIssues(technology: string, version?: string): string {
    return version
      ? `${technology} ${version} known issues bugs problems`
      : `${technology} known issues bugs problems 2025`;
  },

  /**
   * Build a query for alternative approaches
   */
  alternatives(approach: string, goal: string): string {
    return `alternatives to ${approach} for ${goal} comparison`;
  },

  /**
   * Build a query for security considerations
   */
  security(technology: string, operation: string): string {
    return `${technology} ${operation} security vulnerabilities OWASP`;
  },

  /**
   * Build a query for performance implications
   */
  performance(technology: string, operation: string): string {
    return `${technology} ${operation} performance optimization benchmarks`;
  },
};

/**
 * Create a WebSearchService instance
 */
export function createWebSearchService(
  eventHandler?: (event: PairVibeEvent) => void
): WebSearchService {
  return new WebSearchService(eventHandler);
}

/**
 * Check if web search is available (any provider configured)
 */
export function isWebSearchAvailable(): boolean {
  return !!(process.env.TAVILY_API_KEY || process.env.BRAVE_SEARCH_API_KEY);
}
