/**
 * Rate Limiter with Exponential Backoff and Circuit Breaker
 *
 * Implements per-provider rate limiting with:
 * - Full Jitter exponential backoff (AWS best practice)
 * - Retry-After header respect
 * - Token bucket algorithm for proactive limiting
 * - Circuit breaker pattern for repeated failures
 * - Graceful degradation to single-model mode
 *
 * Based on PRD review-005 findings:
 * - Claude Tier 1-4: RPM 50-4000, ITPM 30K-2M, OTPM 8K-400K
 * - OpenAI Tier 1: ~500 RPM, 30K TPM for GPT-4o
 * - Full Jitter backoff: sleep = random(0, min(cap, base * 2^attempt))
 * - Circuit breaker: 5 consecutive 429s within 60s = 2 min circuit open
 */

import type { ApiProvider } from "./api-keys.js";
import type { PairVibeEvent } from "./pair-vibe-types.js";

/**
 * Rate limit information from provider headers
 */
export interface RateLimitInfo {
  /** Provider this info is for */
  provider: ApiProvider;

  /** Requests per minute limit */
  requestsLimit: number;

  /** Requests remaining in current window */
  requestsRemaining: number;

  /** When the request limit resets (Unix timestamp ms) */
  requestsReset: number;

  /** Tokens per minute limit (input + output or combined) */
  tokensLimit: number;

  /** Tokens remaining in current window */
  tokensRemaining: number;

  /** When the token limit resets (Unix timestamp ms) */
  tokensReset: number;

  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Backoff configuration
 */
export interface BackoffConfig {
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs: number;

  /** Maximum delay cap in milliseconds (default: 60000) */
  maxDelayMs: number;

  /** Maximum number of retry attempts (default: 6) */
  maxAttempts: number;

  /** Whether to use jitter (default: true) */
  useJitter: boolean;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold: number;

  /** Time window for counting failures in ms (default: 60000) */
  failureWindowMs: number;

  /** How long circuit stays open in ms (default: 120000 / 2 minutes) */
  resetTimeoutMs: number;

  /** Number of test requests in half-open state (default: 1) */
  halfOpenRequests: number;
}

/**
 * Circuit breaker state
 */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * Internal circuit breaker state tracking
 */
interface CircuitBreakerState {
  state: CircuitState;
  failures: number[];  // Timestamps of recent failures
  lastStateChange: number;
  halfOpenAttempts: number;
}

/**
 * Token bucket for proactive rate limiting
 */
interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;  // tokens per second
}

/**
 * Rate limit result from a wrapped call
 */
export interface RateLimitResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  totalDelayMs: number;
  hitRateLimit: boolean;
  circuitOpen: boolean;
}

/**
 * Default backoff configuration
 */
export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  maxAttempts: 6,
  useJitter: true,
};

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  failureWindowMs: 60000,
  resetTimeoutMs: 120000,  // 2 minutes per review-005
  halfOpenRequests: 1,
};

/**
 * Rate Limiter class with exponential backoff and circuit breaker
 */
export class RateLimiter {
  private readonly backoffConfig: BackoffConfig;
  private readonly circuitConfig: CircuitBreakerConfig;

  // Per-provider state
  private rateLimits: Map<ApiProvider, RateLimitInfo> = new Map();
  private circuits: Map<ApiProvider, CircuitBreakerState> = new Map();
  private tokenBuckets: Map<ApiProvider, TokenBucket> = new Map();

  // Event emission callback
  private eventHandler: ((event: PairVibeEvent) => void) | null = null;

  // Degraded mode tracking
  private degradedProviders: Set<ApiProvider> = new Set();

  constructor(
    backoffConfig: Partial<BackoffConfig> = {},
    circuitConfig: Partial<CircuitBreakerConfig> = {}
  ) {
    this.backoffConfig = { ...DEFAULT_BACKOFF_CONFIG, ...backoffConfig };
    this.circuitConfig = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...circuitConfig };
  }

  /**
   * Set event handler for rate limit events
   */
  setEventHandler(handler: (event: PairVibeEvent) => void): void {
    this.eventHandler = handler;
  }

  /**
   * Emit a rate limit event
   */
  private emit(event: PairVibeEvent): void {
    if (this.eventHandler) {
      this.eventHandler(event);
    }
  }

  /**
   * Initialize rate limiting for a provider with default limits
   */
  initProvider(provider: ApiProvider): void {
    // Initialize circuit breaker
    this.circuits.set(provider, {
      state: "closed",
      failures: [],
      lastStateChange: Date.now(),
      halfOpenAttempts: 0,
    });

    // Initialize token bucket with conservative defaults
    // (Will be updated with actual limits from response headers)
    const defaultRpm = provider === "anthropic" ? 50 : 500;
    this.tokenBuckets.set(provider, {
      tokens: defaultRpm,
      lastRefill: Date.now(),
      capacity: defaultRpm,
      refillRate: defaultRpm / 60,  // tokens per second
    });
  }

  /**
   * Update rate limit info from response headers
   *
   * Anthropic headers: anthropic-ratelimit-{requests,tokens,input-tokens,output-tokens}-{limit,remaining,reset}
   * OpenAI headers: x-ratelimit-{limit,remaining,reset}-{requests,tokens}
   */
  updateFromHeaders(provider: ApiProvider, headers: Record<string, string>): void {
    const now = Date.now();
    const info: RateLimitInfo = {
      provider,
      requestsLimit: 0,
      requestsRemaining: 0,
      requestsReset: now,
      tokensLimit: 0,
      tokensRemaining: 0,
      tokensReset: now,
      lastUpdated: now,
    };

    if (provider === "anthropic") {
      info.requestsLimit = parseInt(headers["anthropic-ratelimit-requests-limit"] || "0", 10);
      info.requestsRemaining = parseInt(headers["anthropic-ratelimit-requests-remaining"] || "0", 10);
      info.requestsReset = this.parseResetTime(headers["anthropic-ratelimit-requests-reset"]);
      info.tokensLimit = parseInt(headers["anthropic-ratelimit-tokens-limit"] || "0", 10);
      info.tokensRemaining = parseInt(headers["anthropic-ratelimit-tokens-remaining"] || "0", 10);
      info.tokensReset = this.parseResetTime(headers["anthropic-ratelimit-tokens-reset"]);
    } else {
      // OpenAI format
      info.requestsLimit = parseInt(headers["x-ratelimit-limit-requests"] || "0", 10);
      info.requestsRemaining = parseInt(headers["x-ratelimit-remaining-requests"] || "0", 10);
      info.requestsReset = this.parseResetTime(headers["x-ratelimit-reset-requests"]);
      info.tokensLimit = parseInt(headers["x-ratelimit-limit-tokens"] || "0", 10);
      info.tokensRemaining = parseInt(headers["x-ratelimit-remaining-tokens"] || "0", 10);
      info.tokensReset = this.parseResetTime(headers["x-ratelimit-reset-tokens"]);
    }

    this.rateLimits.set(provider, info);

    // Update token bucket with actual limits
    if (info.requestsLimit > 0) {
      const bucket = this.tokenBuckets.get(provider);
      if (bucket) {
        bucket.capacity = info.requestsLimit;
        bucket.refillRate = info.requestsLimit / 60;
        bucket.tokens = Math.min(bucket.tokens, info.requestsRemaining);
      }
    }
  }

  /**
   * Parse reset time from header (ISO 8601 or relative seconds)
   */
  private parseResetTime(value: string | undefined): number {
    if (!value) return Date.now();

    // Try parsing as ISO 8601
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }

    // Try parsing as relative seconds (e.g., "1.5s")
    const match = value.match(/^([\d.]+)s?$/);
    if (match && match[1]) {
      return Date.now() + parseFloat(match[1]) * 1000;
    }

    return Date.now();
  }

  /**
   * Check if we should proactively wait before making a request
   * Uses token bucket algorithm
   */
  shouldWait(provider: ApiProvider): { shouldWait: boolean; waitMs: number } {
    const bucket = this.tokenBuckets.get(provider);
    if (!bucket) {
      return { shouldWait: false, waitMs: 0 };
    }

    // Refill tokens based on time elapsed
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillRate);
    bucket.lastRefill = now;

    // Check if we have tokens
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { shouldWait: false, waitMs: 0 };
    }

    // Calculate wait time to get 1 token
    const waitMs = Math.ceil((1 - bucket.tokens) / bucket.refillRate * 1000);
    return { shouldWait: true, waitMs };
  }

  /**
   * Get the current circuit state for a provider
   */
  getCircuitState(provider: ApiProvider): CircuitState {
    const circuit = this.circuits.get(provider);
    if (!circuit) {
      this.initProvider(provider);
      return "closed";
    }

    const now = Date.now();

    // Check if circuit should transition from open to half-open
    if (circuit.state === "open") {
      if (now - circuit.lastStateChange >= this.circuitConfig.resetTimeoutMs) {
        circuit.state = "half-open";
        circuit.lastStateChange = now;
        circuit.halfOpenAttempts = 0;
        this.emit({ type: "circuit-half-open", provider });
      }
    }

    return circuit.state;
  }

  /**
   * Record a failure for circuit breaker
   */
  recordFailure(provider: ApiProvider, is429: boolean = false): void {
    let circuit = this.circuits.get(provider);
    if (!circuit) {
      this.initProvider(provider);
      circuit = this.circuits.get(provider)!;
    }

    const now = Date.now();

    // Add failure timestamp
    circuit.failures.push(now);

    // Remove failures outside the window
    circuit.failures = circuit.failures.filter(
      t => now - t < this.circuitConfig.failureWindowMs
    );

    // Check if we should open the circuit
    if (is429 && circuit.failures.length >= this.circuitConfig.failureThreshold) {
      if (circuit.state !== "open") {
        circuit.state = "open";
        circuit.lastStateChange = now;
        this.emit({ type: "circuit-open", provider });
      }
    }

    // If in half-open and we got a failure, go back to open
    if (circuit.state === "half-open") {
      circuit.state = "open";
      circuit.lastStateChange = now;
      this.emit({ type: "circuit-open", provider });
    }
  }

  /**
   * Record a success for circuit breaker
   */
  recordSuccess(provider: ApiProvider): void {
    const circuit = this.circuits.get(provider);
    if (!circuit) return;

    // If in half-open, check if we can close
    if (circuit.state === "half-open") {
      circuit.halfOpenAttempts++;
      if (circuit.halfOpenAttempts >= this.circuitConfig.halfOpenRequests) {
        circuit.state = "closed";
        circuit.lastStateChange = Date.now();
        circuit.failures = [];
        this.emit({ type: "circuit-closed", provider });
      }
    }
  }

  /**
   * Calculate delay using Full Jitter exponential backoff
   * Formula: sleep = random(0, min(cap, base * 2^attempt))
   */
  calculateBackoffDelay(attempt: number, retryAfterMs?: number): number {
    // If we have a Retry-After header, respect it
    if (retryAfterMs && retryAfterMs > 0) {
      return retryAfterMs;
    }

    // Full Jitter exponential backoff (AWS best practice)
    const exponentialDelay = this.backoffConfig.baseDelayMs * Math.pow(2, attempt);
    const cappedDelay = Math.min(this.backoffConfig.maxDelayMs, exponentialDelay);

    if (this.backoffConfig.useJitter) {
      // Full jitter: random between 0 and capped delay
      return Math.random() * cappedDelay;
    }

    return cappedDelay;
  }

  /**
   * Parse Retry-After header value
   * Can be either seconds or HTTP-date
   */
  parseRetryAfter(value: string | undefined): number | undefined {
    if (!value) return undefined;

    // Try parsing as number of seconds
    const seconds = parseFloat(value);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    // Try parsing as HTTP-date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return Math.max(0, date.getTime() - Date.now());
    }

    return undefined;
  }

  /**
   * Execute a function with rate limiting, retries, and circuit breaker
   */
  async execute<T>(
    provider: ApiProvider,
    fn: () => Promise<T>,
    options: {
      extractHeaders?: (response: T) => Record<string, string>;
      is429Error?: (error: unknown) => boolean;
      getRetryAfter?: (error: unknown) => string | undefined;
    } = {}
  ): Promise<RateLimitResult<T>> {
    const result: RateLimitResult<T> = {
      success: false,
      attempts: 0,
      totalDelayMs: 0,
      hitRateLimit: false,
      circuitOpen: false,
    };

    // Check circuit breaker
    const circuitState = this.getCircuitState(provider);
    if (circuitState === "open") {
      result.circuitOpen = true;
      result.error = `Circuit breaker open for ${provider}`;
      return result;
    }

    // Check if we should proactively wait
    const { shouldWait, waitMs } = this.shouldWait(provider);
    if (shouldWait && waitMs > 0) {
      await this.sleep(waitMs);
      result.totalDelayMs += waitMs;
    }

    // Retry loop
    for (let attempt = 0; attempt < this.backoffConfig.maxAttempts; attempt++) {
      result.attempts = attempt + 1;

      try {
        const response = await fn();

        // Update rate limits from headers if available
        if (options.extractHeaders) {
          const headers = options.extractHeaders(response);
          this.updateFromHeaders(provider, headers);
        }

        // Success!
        this.recordSuccess(provider);
        result.success = true;
        result.data = response;
        return result;
      } catch (error) {
        // Check if it's a rate limit error
        const is429 = options.is429Error?.(error) ?? this.isDefaultRateLimitError(error);

        if (is429) {
          result.hitRateLimit = true;
          this.recordFailure(provider, true);

          // Get retry-after if available
          const retryAfter = options.getRetryAfter?.(error);
          const retryAfterMs = this.parseRetryAfter(retryAfter);

          this.emit({
            type: "rate-limit-hit",
            provider,
            retryAfterMs: retryAfterMs ?? this.calculateBackoffDelay(attempt),
          });

          // Check if circuit is now open
          if (this.getCircuitState(provider) === "open") {
            result.circuitOpen = true;
            result.error = `Circuit breaker opened for ${provider} after repeated 429s`;
            return result;
          }

          // Calculate backoff delay
          const delay = this.calculateBackoffDelay(attempt, retryAfterMs);
          await this.sleep(delay);
          result.totalDelayMs += delay;

          continue;  // Retry
        }

        // Non-rate-limit error
        this.recordFailure(provider, false);
        result.error = error instanceof Error ? error.message : String(error);
        return result;
      }
    }

    // Exhausted retries
    result.error = `Exhausted ${this.backoffConfig.maxAttempts} retries for ${provider}`;
    return result;
  }

  /**
   * Default check for rate limit errors
   */
  private isDefaultRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes("429") ||
        message.includes("rate limit") ||
        message.includes("too many requests");
    }
    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if a provider is in degraded mode
   */
  isDegraded(provider: ApiProvider): boolean {
    return this.degradedProviders.has(provider);
  }

  /**
   * Mark a provider as degraded (after repeated failures)
   */
  markDegraded(provider: ApiProvider, reason: string): void {
    this.degradedProviders.add(provider);
    this.emit({ type: "degraded-mode", reason: `${provider}: ${reason}` });
  }

  /**
   * Clear degraded status for a provider
   */
  clearDegraded(provider: ApiProvider): void {
    if (this.degradedProviders.delete(provider)) {
      this.emit({ type: "rate-limit-recovered", provider });
    }
  }

  /**
   * Get current rate limit info for a provider
   */
  getRateLimitInfo(provider: ApiProvider): RateLimitInfo | undefined {
    return this.rateLimits.get(provider);
  }

  /**
   * Get all providers that are currently available (not degraded, circuit closed)
   */
  getAvailableProviders(): ApiProvider[] {
    const available: ApiProvider[] = [];

    for (const provider of ["anthropic", "openai"] as ApiProvider[]) {
      if (!this.isDegraded(provider) && this.getCircuitState(provider) !== "open") {
        available.push(provider);
      }
    }

    return available;
  }

  /**
   * Reset all rate limiting state
   */
  reset(): void {
    this.rateLimits.clear();
    this.circuits.clear();
    this.tokenBuckets.clear();
    this.degradedProviders.clear();
  }
}

/**
 * Create a rate limiter with default configuration
 */
export function createRateLimiter(
  backoffConfig?: Partial<BackoffConfig>,
  circuitConfig?: Partial<CircuitBreakerConfig>
): RateLimiter {
  return new RateLimiter(backoffConfig, circuitConfig);
}

/**
 * Singleton rate limiter instance for global use
 */
let globalRateLimiter: RateLimiter | null = null;

/**
 * Get the global rate limiter instance
 */
export function getGlobalRateLimiter(): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = createRateLimiter();
  }
  return globalRateLimiter;
}

/**
 * Reset the global rate limiter (useful for testing)
 */
export function resetGlobalRateLimiter(): void {
  globalRateLimiter?.reset();
  globalRateLimiter = null;
}
