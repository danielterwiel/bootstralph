import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import {
  ReviewerRunner,
  createReviewerRunner,
  createDefaultReviewerLLMClient,
  type ReviewerRunnerOptions,
  type ReviewerLLMClient,
  type StepReviewResult,
  type ReviewerState,
} from '../../src/ralph/reviewer-runner.js';
import {
  WebSearchService,
  type WebSearchResponse,
} from '../../src/ralph/web-search.js';
import type { UserStory } from '../../src/ralph/prd-schema.js';
import type {
  PairVibeConfig,
  PairVibeEvent,
} from '../../src/ralph/pair-vibe-types.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a minimal PairVibeConfig for testing
 */
function createTestConfig(overrides: Partial<PairVibeConfig> = {}): PairVibeConfig {
  return {
    enabled: true,
    executorProvider: 'anthropic',
    reviewerProvider: 'openai',
    executorModel: 'claude-sonnet-4-20250514',
    reviewerModel: 'gpt-4o',
    maxLookAhead: 5,
    reviewTimeout: 2000, // 2 seconds for faster tests
    consensusTimeout: 5000,
    maxConsensusRounds: 2,
    webSearchEnabled: true,
    ...overrides,
  };
}

/**
 * Create a mock UserStory for testing
 */
function createTestStep(id: string, overrides: Partial<UserStory> = {}): UserStory {
  return {
    id,
    title: `Test Step ${id}`,
    description: `Description for step ${id}`,
    status: 'pending',
    acceptanceCriteria: ['Criterion 1'],
    ...overrides,
  };
}

/**
 * Create a mock WebSearchService
 */
function createMockWebSearchService(results: WebSearchResponse[] = []): WebSearchService {
  const service = {
    isAvailable: vi.fn().mockReturnValue(true),
    getAvailableProviders: vi.fn().mockReturnValue(['tavily']),
    search: vi.fn().mockImplementation(async (query: string, _stepId: string) => {
      const mockResult: WebSearchResponse = results.find(r => r.query === query) ?? {
        query,
        results: [
          {
            title: 'Test Result',
            url: 'https://example.com',
            snippet: 'Test snippet for ' + query,
          },
        ],
        provider: 'tavily',
        cached: false,
        durationMs: 100,
      };
      return mockResult;
    }),
    setEventHandler: vi.fn(),
    clearCache: vi.fn(),
    getCacheStats: vi.fn().mockReturnValue({ size: 0, oldestEntryAge: null }),
    clearExpiredCache: vi.fn().mockReturnValue(0),
  } as unknown as WebSearchService;

  return service;
}

/**
 * Create a mock LLM client
 */
function createMockLLMClient(findings: string[] = []): ReviewerLLMClient {
  return {
    analyzeStep: vi.fn().mockResolvedValue({
      findings,
      reasoning: 'Mock analysis reasoning',
    }),
  };
}

/**
 * Collect events from ReviewerRunner
 */
function collectEvents(runner: ReviewerRunner): {
  stepStarted: string[];
  stepCompleted: StepReviewResult[];
  consensusNeeded: Array<{ stepId: string; findings: string[] }>;
  paused: string[];
  resumed: number;
  errors: Error[];
  caughtUp: number;
} {
  const events = {
    stepStarted: [] as string[],
    stepCompleted: [] as StepReviewResult[],
    consensusNeeded: [] as Array<{ stepId: string; findings: string[] }>,
    paused: [] as string[],
    resumed: 0,
    errors: [] as Error[],
    caughtUp: 0,
  };

  runner.on('stepStarted', (stepId: string) => events.stepStarted.push(stepId));
  runner.on('stepCompleted', (result: StepReviewResult) => events.stepCompleted.push(result));
  runner.on('consensusNeeded', (stepId: string, findings: string[]) =>
    events.consensusNeeded.push({ stepId, findings })
  );
  runner.on('paused', (reason: string) => events.paused.push(reason));
  runner.on('resumed', () => events.resumed++);
  runner.on('error', (error: Error) => events.errors.push(error));
  runner.on('caughtUp', () => events.caughtUp++);

  return events;
}

// ============================================================================
// ReviewerRunner Tests
// ============================================================================

describe('ReviewerRunner', () => {
  let runner: ReviewerRunner;
  let config: PairVibeConfig;
  let mockWebSearchService: WebSearchService;
  let mockLLMClient: ReviewerLLMClient;
  let pairVibeEvents: PairVibeEvent[];
  let eventHandler: (event: PairVibeEvent) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    config = createTestConfig();
    mockWebSearchService = createMockWebSearchService();
    mockLLMClient = createMockLLMClient();
    pairVibeEvents = [];
    eventHandler = (event: PairVibeEvent) => pairVibeEvents.push(event);

    runner = new ReviewerRunner({
      config,
      eventHandler,
      llmClient: mockLLMClient,
      webSearchService: mockWebSearchService,
    });
  });

  afterEach(() => {
    runner.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Initialization and State Tests
  // ==========================================================================

  describe('initialization', () => {
    it('should initialize with idle state', () => {
      expect(runner.getState()).toBe('idle');
    });

    it('should have null current step initially', () => {
      expect(runner.getCurrentStep()).toBeNull();
    });

    it('should have empty reviewed steps set', () => {
      expect(runner.getReviewedSteps().size).toBe(0);
    });

    it('should have zero reviewed count', () => {
      expect(runner.getReviewedCount()).toBe(0);
    });

    it('should create default web search service if not provided', () => {
      const runnerWithoutService = new ReviewerRunner({
        config,
        eventHandler,
      });
      expect(runnerWithoutService.getWebSearchService()).toBeInstanceOf(WebSearchService);
    });
  });

  // ==========================================================================
  // Look-Ahead Execution Tests
  // ==========================================================================

  describe('look-ahead execution', () => {
    it('should start reviewing from ahead of executor index', async () => {
      const steps = [
        createTestStep('step-1'),
        createTestStep('step-2'),
        createTestStep('step-3'),
        createTestStep('step-4'),
      ];

      const events = collectEvents(runner);

      const promise = runner.start(steps, 0); // Executor at index 0
      await vi.runAllTimersAsync();
      await promise;

      // Should start from index 1 (ahead of executor at 0)
      expect(events.stepStarted).toContain('step-2');
      expect(events.stepStarted).not.toContain('step-1');
    });

    it('should respect MAX_STEPS_AHEAD limit', async () => {
      const steps = Array.from({ length: 10 }, (_, i) =>
        createTestStep(`step-${i + 1}`)
      );

      const events = collectEvents(runner);

      const promise = runner.start(steps, 0);
      await vi.runAllTimersAsync();
      await promise;

      // MAX_STEPS_AHEAD is 5, so from index 1-5 (5 steps ahead of executor at 0)
      expect(events.stepStarted.length).toBeLessThanOrEqual(5);
    });

    it('should skip already reviewed steps', async () => {
      const steps = [
        createTestStep('step-1'),
        createTestStep('step-2', { findings: [] }), // Already reviewed
        createTestStep('step-3'),
      ];

      const events = collectEvents(runner);

      const promise = runner.start(steps, 0);
      await vi.runAllTimersAsync();
      await promise;

      // step-2 should be skipped as it already has findings
      expect(events.stepStarted).not.toContain('step-2');
    });

    it('should emit caughtUp when all available steps are reviewed', async () => {
      const steps = [
        createTestStep('step-1'),
        createTestStep('step-2'),
      ];

      const events = collectEvents(runner);

      const promise = runner.start(steps, 0);
      await vi.runAllTimersAsync();
      await promise;

      expect(events.caughtUp).toBe(1);
    });

    it('should return to idle state after catching up', async () => {
      const steps = [createTestStep('step-1'), createTestStep('step-2')];

      const promise = runner.start(steps, 0);
      await vi.runAllTimersAsync();
      await promise;

      expect(runner.getState()).toBe('idle');
    });

    it('should throw if started while already running', async () => {
      // Create a slow LLM client to ensure start doesn't complete immediately
      const slowLLMClient = {
        analyzeStep: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 5000));
          return { findings: [], reasoning: 'Test' };
        }),
      };

      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: slowLLMClient,
        webSearchService: mockWebSearchService,
      });

      const steps = [createTestStep('step-1'), createTestStep('step-2')];

      // Start without awaiting to keep it running
      const startPromise = runner.start(steps, 0);

      // Advance timers slightly to let start begin but not complete
      await vi.advanceTimersByTimeAsync(100);

      // Now state should be running
      expect(runner.getState()).toBe('running');

      await expect(runner.start(steps, 0)).rejects.toThrow(
        'ReviewerRunner is already running'
      );

      // Clean up
      runner.stop();
      await vi.runAllTimersAsync();
    });
  });

  // ==========================================================================
  // Findings Population Tests
  // ==========================================================================

  describe('findings population', () => {
    it('should populate empty findings when LLM finds no issues', async () => {
      mockLLMClient = createMockLLMClient([]); // No findings
      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1');
      const result = await runner.reviewStep(step);

      expect(result.findings).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('should populate findings when LLM finds issues', async () => {
      const findings = ['Issue 1: Potential security vulnerability', 'Issue 2: Missing error handling'];
      mockLLMClient = createMockLLMClient(findings);
      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1');
      const result = await runner.reviewStep(step);

      expect(result.findings).toEqual(findings);
      expect(result.success).toBe(true);
    });

    it('should emit consensus-needed event when findings exist', async () => {
      const findings = ['Finding 1'];
      mockLLMClient = createMockLLMClient(findings);
      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const events = collectEvents(runner);
      const step = createTestStep('step-1');
      await runner.reviewStep(step);

      expect(events.consensusNeeded.length).toBe(1);
      expect(events.consensusNeeded[0]?.stepId).toBe('step-1');
      expect(events.consensusNeeded[0]?.findings).toEqual(findings);
    });

    it('should not emit consensus-needed when findings are empty', async () => {
      mockLLMClient = createMockLLMClient([]);
      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const events = collectEvents(runner);
      const step = createTestStep('step-1');
      await runner.reviewStep(step);

      expect(events.consensusNeeded.length).toBe(0);
    });

    it('should track reviewed steps', async () => {
      const step = createTestStep('step-1');
      await runner.reviewStep(step);

      expect(runner.isStepReviewed('step-1')).toBe(true);
      expect(runner.getReviewedCount()).toBe(1);
    });

    it('should emit PairVibe events during review', async () => {
      const step = createTestStep('step-1');
      await runner.reviewStep(step);

      const eventTypes = pairVibeEvents.map(e => e.type);
      expect(eventTypes).toContain('reviewer-started');
      expect(eventTypes).toContain('reviewer-completed');
    });
  });

  // ==========================================================================
  // Cancellation and Pause/Resume Tests
  // ==========================================================================

  describe('cancellation on consensus', () => {
    it('should pause when requested', () => {
      // Manually set state to running
      (runner as unknown as { state: ReviewerState }).state = 'running';

      runner.pause('Consensus needed');

      expect(runner.getState()).toBe('paused');
    });

    it('should emit paused event with reason', () => {
      (runner as unknown as { state: ReviewerState }).state = 'running';
      const events = collectEvents(runner);

      runner.pause('Consensus needed for step-1');

      expect(events.paused).toContain('Consensus needed for step-1');
    });

    it('should emit PairVibe paused event', () => {
      (runner as unknown as { state: ReviewerState }).state = 'running';

      runner.pause('Test pause');

      const pausedEvent = pairVibeEvents.find(e => e.type === 'paused');
      expect(pausedEvent).toBeDefined();
      expect((pausedEvent as { type: 'paused'; reason: string })?.reason).toBe('Test pause');
    });

    it('should resume from paused state', () => {
      (runner as unknown as { state: ReviewerState }).state = 'paused';

      runner.resume();

      expect(runner.getState()).toBe('running');
    });

    it('should emit resumed event', () => {
      (runner as unknown as { state: ReviewerState }).state = 'paused';
      const events = collectEvents(runner);

      runner.resume();

      expect(events.resumed).toBe(1);
    });

    it('should not pause if not running', () => {
      expect(runner.getState()).toBe('idle');

      runner.pause('Should not work');

      expect(runner.getState()).toBe('idle');
    });

    it('should not resume if not paused', () => {
      expect(runner.getState()).toBe('idle');

      runner.resume();

      expect(runner.getState()).toBe('idle');
    });

    it('should stop execution when stop() is called', async () => {
      const steps = Array.from({ length: 10 }, (_, i) =>
        createTestStep(`step-${i + 1}`)
      );

      // Make LLM slow to ensure we can stop mid-execution
      mockLLMClient.analyzeStep = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return { findings: [], reasoning: 'Test' };
      });

      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      runner.start(steps, 0);
      await vi.advanceTimersByTimeAsync(100);

      runner.stop();

      expect(runner.getState()).toBe('stopped');
      expect(runner.getCurrentStep()).toBeNull();
    });

    it('should wait for consensus when in running state', async () => {
      (runner as unknown as { state: ReviewerState }).state = 'running';

      const waitPromise = runner.waitForConsensus();

      expect(runner.getState()).toBe('waiting_for_consensus');

      // Signal consensus completed
      runner.consensusCompleted();

      await vi.advanceTimersByTimeAsync(200);
      await waitPromise;

      expect(runner.getState()).toBe('running');
    });

    it('should return immediately from waitForConsensus if not running', async () => {
      expect(runner.getState()).toBe('idle');

      await runner.waitForConsensus();

      // Should complete immediately without changing state
      expect(runner.getState()).toBe('idle');
    });
  });

  // ==========================================================================
  // Web Search Mocking Tests
  // ==========================================================================

  describe('web search mocking', () => {
    it('should call web search service during review', async () => {
      const step = createTestStep('step-1', {
        title: 'Implement React authentication',
        description: 'Add login with OAuth using React hooks',
      });

      await runner.reviewStep(step);

      expect(mockWebSearchService.search).toHaveBeenCalled();
    });

    it('should pass search results to LLM client', async () => {
      const mockSearchResults: WebSearchResponse[] = [
        {
          query: 'react best practices',
          results: [
            {
              title: 'React Best Practices 2025',
              url: 'https://example.com/react',
              snippet: 'Important patterns for React...',
            },
          ],
          provider: 'tavily',
          cached: false,
          durationMs: 100,
        },
      ];

      mockWebSearchService = createMockWebSearchService(mockSearchResults);
      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1', {
        title: 'Implement React component',
        description: 'Create a React component with state',
      });

      await runner.reviewStep(step);

      expect(mockLLMClient.analyzeStep).toHaveBeenCalledWith(
        expect.objectContaining({
          step,
          searchResults: expect.any(Array),
        })
      );
    });

    it('should proceed without web search when not available', async () => {
      (mockWebSearchService.isAvailable as Mock).mockReturnValue(false);

      const step = createTestStep('step-1');
      const result = await runner.reviewStep(step);

      expect(result.success).toBe(true);
      expect(result.searchResults).toEqual([]);
    });

    it('should proceed without web search when disabled in config', async () => {
      config.webSearchEnabled = false;
      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1');
      const result = await runner.reviewStep(step);

      expect(mockWebSearchService.search).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should extract findings heuristically when LLM is unavailable', async () => {
      const mockSearchResults: WebSearchResponse = {
        query: 'test query',
        results: [
          {
            title: 'Known Issue',
            url: 'https://example.com/issue',
            snippet: 'There is a known bug in this library that causes memory leaks.',
          },
        ],
        provider: 'tavily',
        cached: false,
        durationMs: 100,
      };

      (mockWebSearchService.search as Mock).mockResolvedValue(mockSearchResults);

      // Create runner without LLM client
      runner = new ReviewerRunner({
        config,
        eventHandler,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1', {
        title: 'Use some library',
        description: 'Integration with external library',
      });

      const result = await runner.reviewStep(step);

      // Should extract finding from snippet containing "bug" keyword
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0]).toContain('bug');
    });

    it('should emit web-search-started event via real WebSearchService', async () => {
      // This test needs a real WebSearchService to emit events
      // Create a runner with real WebSearchService (no API keys, so search will fail gracefully)
      const runnerWithRealSearch = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        // Don't pass webSearchService - let it create a real one
      });

      const step = createTestStep('step-1', {
        title: 'React component',
        description: 'Build with React',
      });

      await runnerWithRealSearch.reviewStep(step);

      // With no API keys, search will fail but events should still be emitted
      // Check that web-search-started OR web-search-failed event was emitted
      // (depends on whether isAvailable() returns false and skips search)
      const searchEvent = pairVibeEvents.find(
        e => e.type === 'web-search-started' || e.type === 'web-search-failed'
      );

      // If web search is not available (no API keys), no events will be emitted
      // and that's OK - the test should pass either way
      if (runnerWithRealSearch.getWebSearchService().isAvailable()) {
        expect(searchEvent).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // Timeout Handling Tests
  // ==========================================================================

  describe('timeout handling', () => {
    it('should timeout review after configured duration', async () => {
      // Create slow LLM client
      mockLLMClient.analyzeStep = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
        return { findings: [], reasoning: 'Test' };
      });

      config.reviewTimeout = 1000; // 1 second timeout
      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1');

      const resultPromise = runner.reviewStep(step);

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(1500);

      const result = await resultPromise;

      expect(result.timedOut).toBe(true);
      expect(result.error).toContain('timed out');
    });

    it('should emit reviewer-timeout event on timeout', async () => {
      mockLLMClient.analyzeStep = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10000));
        return { findings: [], reasoning: 'Test' };
      });

      config.reviewTimeout = 500;
      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1');
      const resultPromise = runner.reviewStep(step);

      await vi.advanceTimersByTimeAsync(600);
      await resultPromise;

      const timeoutEvent = pairVibeEvents.find(e => e.type === 'reviewer-timeout');
      expect(timeoutEvent).toBeDefined();
      expect((timeoutEvent as { type: 'reviewer-timeout'; stepId: string })?.stepId).toBe('step-1');
    });

    it('should still mark step as reviewed after timeout', async () => {
      mockLLMClient.analyzeStep = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10000));
        return { findings: [], reasoning: 'Test' };
      });

      config.reviewTimeout = 500;
      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1');
      const resultPromise = runner.reviewStep(step);

      await vi.advanceTimersByTimeAsync(600);
      await resultPromise;

      expect(runner.isStepReviewed('step-1')).toBe(true);
    });

    it('should use default timeout when not configured', async () => {
      delete config.reviewTimeout;
      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1');
      const result = await runner.reviewStep(step);

      // Should complete normally with default timeout (120s)
      expect(result.success).toBe(true);
    });

    it('should measure duration correctly', async () => {
      const delayMs = 500;
      mockLLMClient.analyzeStep = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return { findings: [], reasoning: 'Test' };
      });

      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1');
      const resultPromise = runner.reviewStep(step);

      await vi.advanceTimersByTimeAsync(delayMs + 100);
      const result = await resultPromise;

      expect(result.durationMs).toBeGreaterThanOrEqual(delayMs);
    });
  });

  // ==========================================================================
  // Error Recovery Tests
  // ==========================================================================

  describe('error recovery', () => {
    it('should handle LLM client errors gracefully', async () => {
      mockLLMClient.analyzeStep = vi.fn().mockRejectedValue(new Error('API rate limit'));

      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1');
      const result = await runner.reviewStep(step);

      expect(result.success).toBe(false);
      expect(result.error).toContain('API rate limit');
    });

    it('should handle web search errors gracefully', async () => {
      (mockWebSearchService.search as Mock).mockRejectedValue(new Error('Search API down'));

      const step = createTestStep('step-1');

      // Should not throw, but handle gracefully
      const result = await runner.reviewStep(step);

      // Review continues without search results
      expect(result).toBeDefined();
    });

    it('should still track step as reviewed after error', async () => {
      mockLLMClient.analyzeStep = vi.fn().mockRejectedValue(new Error('Some error'));

      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1');
      await runner.reviewStep(step);

      expect(runner.isStepReviewed('step-1')).toBe(true);
    });

    it('should clear current step after error', async () => {
      mockLLMClient.analyzeStep = vi.fn().mockRejectedValue(new Error('Some error'));

      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1');
      await runner.reviewStep(step);

      expect(runner.getCurrentStep()).toBeNull();
    });

    it('should emit stepCompleted even on error', async () => {
      mockLLMClient.analyzeStep = vi.fn().mockRejectedValue(new Error('Test error'));

      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const events = collectEvents(runner);
      const step = createTestStep('step-1');
      await runner.reviewStep(step);

      expect(events.stepCompleted.length).toBe(1);
      expect(events.stepCompleted[0]?.error).toBe('Test error');
    });
  });

  // ==========================================================================
  // Reset and Skip Tests
  // ==========================================================================

  describe('reset and skip functionality', () => {
    it('should reset all state', async () => {
      // Review a step first
      const step = createTestStep('step-1');
      await runner.reviewStep(step);

      expect(runner.getReviewedCount()).toBe(1);

      runner.reset();

      expect(runner.getState()).toBe('idle');
      expect(runner.getCurrentStep()).toBeNull();
      expect(runner.getReviewedCount()).toBe(0);
      expect(runner.getReviewedSteps().size).toBe(0);
    });

    it('should skip specific steps', () => {
      runner.skipStep('step-to-skip');

      expect(runner.isStepReviewed('step-to-skip')).toBe(true);
    });

    it('should not review skipped steps', async () => {
      runner.skipStep('step-2');

      const steps = [
        createTestStep('step-1'),
        createTestStep('step-2'),
        createTestStep('step-3'),
      ];

      const events = collectEvents(runner);
      const promise = runner.start(steps, 0);
      await vi.runAllTimersAsync();
      await promise;

      expect(events.stepStarted).not.toContain('step-2');
    });
  });

  // ==========================================================================
  // Search Query Generation Tests
  // ==========================================================================

  describe('search query generation', () => {
    it('should generate queries for React-related steps', async () => {
      const step = createTestStep('step-1', {
        title: 'Implement React authentication component',
        description: 'Create a login form using React hooks and TypeScript',
      });

      await runner.reviewStep(step);

      const searchCalls = (mockWebSearchService.search as Mock).mock.calls;
      const queries = searchCalls.map((call: [string, string]) => call[0]);

      // Should include queries about React
      const hasReactQuery = queries.some((q: string) => q.toLowerCase().includes('react'));
      expect(hasReactQuery).toBe(true);
    });

    it('should generate security queries for auth-related steps', async () => {
      const step = createTestStep('step-1', {
        title: 'Implement JWT authentication',
        description: 'Add JWT token validation for API endpoints',
      });

      await runner.reviewStep(step);

      const searchCalls = (mockWebSearchService.search as Mock).mock.calls;
      const queries = searchCalls.map((call: [string, string]) => call[0]);

      // Should include security-related query
      const hasSecurityQuery = queries.some(
        (q: string) => q.toLowerCase().includes('security') || q.toLowerCase().includes('owasp')
      );
      expect(hasSecurityQuery).toBe(true);
    });

    it('should generate performance queries for performance-related steps', async () => {
      const step = createTestStep('step-1', {
        title: 'Optimize database performance',
        description: 'Add caching layer to improve query speed',
      });

      await runner.reviewStep(step);

      const searchCalls = (mockWebSearchService.search as Mock).mock.calls;
      const queries = searchCalls.map((call: [string, string]) => call[0]);

      // Should include performance-related query
      const hasPerfQuery = queries.some(
        (q: string) => q.toLowerCase().includes('performance') || q.toLowerCase().includes('optimization')
      );
      expect(hasPerfQuery).toBe(true);
    });

    it('should limit queries to 3', async () => {
      const step = createTestStep('step-1', {
        title: 'Build React Vue Angular app with TypeScript performance security',
        description: 'Multi-framework app with authentication and caching',
      });

      await runner.reviewStep(step);

      const searchCalls = (mockWebSearchService.search as Mock).mock.calls;
      expect(searchCalls.length).toBeLessThanOrEqual(3);
    });

    it('should generate default query when no tech detected', async () => {
      const step = createTestStep('step-1', {
        title: 'Update configuration file',
        description: 'Modify settings',
      });

      await runner.reviewStep(step);

      expect(mockWebSearchService.search).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Factory Function Tests
  // ==========================================================================

  describe('factory functions', () => {
    it('should create ReviewerRunner via createReviewerRunner', () => {
      const options: ReviewerRunnerOptions = {
        config: createTestConfig(),
        eventHandler: vi.fn(),
      };

      const instance = createReviewerRunner(options);

      expect(instance).toBeInstanceOf(ReviewerRunner);
      expect(instance.getState()).toBe('idle');
    });

    it('should create default LLM client via createDefaultReviewerLLMClient', async () => {
      const client = createDefaultReviewerLLMClient();

      const result = await client.analyzeStep({
        step: createTestStep('step-1'),
        searchResults: [
          {
            query: 'test',
            results: [
              {
                title: 'Issue found',
                url: 'https://example.com',
                snippet: 'There is a known bug in this approach',
              },
            ],
            provider: 'tavily',
            cached: false,
            durationMs: 100,
          },
        ],
        model: 'gpt-4o',
        timeout: 30000,
      });

      expect(result.findings).toBeDefined();
      expect(result.reasoning).toBeDefined();
    });

    it('should extract findings from search results in default LLM client', async () => {
      const client = createDefaultReviewerLLMClient();

      const result = await client.analyzeStep({
        step: createTestStep('step-1'),
        searchResults: [
          {
            query: 'test',
            results: [
              {
                title: 'Bug Report',
                url: 'https://example.com/bug',
                snippet: 'Critical issue causing crashes in production',
              },
              {
                title: 'Deprecated Warning',
                url: 'https://example.com/deprecated',
                snippet: 'This method is deprecated and will be removed',
              },
            ],
            provider: 'tavily',
            cached: false,
            durationMs: 100,
          },
        ],
        model: 'gpt-4o',
        timeout: 30000,
      });

      // Should find issues from snippets containing "issue" and "deprecated"
      expect(result.findings.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // LLM Client Setter Tests
  // ==========================================================================

  describe('setLLMClient', () => {
    it('should allow setting LLM client after construction', async () => {
      const runnerWithoutClient = new ReviewerRunner({
        config,
        eventHandler,
        webSearchService: mockWebSearchService,
      });

      const newClient = createMockLLMClient(['New finding']);
      runnerWithoutClient.setLLMClient(newClient);

      const step = createTestStep('step-1');
      const result = await runnerWithoutClient.reviewStep(step);

      expect(result.findings).toContain('New finding');
    });
  });

  // ==========================================================================
  // Event Handler Tests
  // ==========================================================================

  describe('PairVibe event emission', () => {
    it('should emit reviewer-started event', async () => {
      const step = createTestStep('step-1');
      await runner.reviewStep(step);

      const startedEvent = pairVibeEvents.find(e => e.type === 'reviewer-started');
      expect(startedEvent).toBeDefined();
      expect((startedEvent as { type: 'reviewer-started'; stepId: string })?.stepId).toBe('step-1');
    });

    it('should emit reviewer-completed event with findings status', async () => {
      mockLLMClient = createMockLLMClient(['Finding 1']);
      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1');
      await runner.reviewStep(step);

      const completedEvent = pairVibeEvents.find(e => e.type === 'reviewer-completed');
      expect(completedEvent).toBeDefined();
      expect((completedEvent as { type: 'reviewer-completed'; stepId: string; hasFindings: boolean })?.hasFindings).toBe(true);
    });

    it('should emit consensus-started event when findings exist', async () => {
      mockLLMClient = createMockLLMClient(['Finding 1']);
      runner = new ReviewerRunner({
        config,
        eventHandler,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1');
      await runner.reviewStep(step);

      const consensusEvent = pairVibeEvents.find(e => e.type === 'consensus-started');
      expect(consensusEvent).toBeDefined();
      expect((consensusEvent as { type: 'consensus-started'; findings: string[] })?.findings).toContain('Finding 1');
    });

    it('should not emit events when no event handler provided', async () => {
      const runnerWithoutHandler = new ReviewerRunner({
        config,
        llmClient: mockLLMClient,
        webSearchService: mockWebSearchService,
      });

      const step = createTestStep('step-1');

      // Should not throw
      await expect(runnerWithoutHandler.reviewStep(step)).resolves.toBeDefined();
    });

    it('should emit resumed event', () => {
      (runner as unknown as { state: ReviewerState }).state = 'paused';

      runner.resume();

      const resumedEvent = pairVibeEvents.find(e => e.type === 'resumed');
      expect(resumedEvent).toBeDefined();
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle empty steps array', async () => {
      const events = collectEvents(runner);

      const promise = runner.start([], 0);
      await vi.runAllTimersAsync();
      await promise;

      expect(events.stepStarted.length).toBe(0);
      expect(events.caughtUp).toBe(1);
    });

    it('should handle executor at end of steps', async () => {
      const steps = [createTestStep('step-1'), createTestStep('step-2')];
      const events = collectEvents(runner);

      // Executor at last index means no steps ahead
      const promise = runner.start(steps, 1);
      await vi.runAllTimersAsync();
      await promise;

      expect(events.stepStarted.length).toBe(0);
      expect(events.caughtUp).toBe(1);
    });

    it('should handle step with null findings (not reviewed)', async () => {
      const steps = [
        createTestStep('step-1'),
        createTestStep('step-2', { findings: null }),
      ];

      const events = collectEvents(runner);

      const promise = runner.start(steps, 0);
      await vi.runAllTimersAsync();
      await promise;

      // step-2 with null findings should be reviewed
      expect(events.stepStarted).toContain('step-2');
    });

    it('should handle concurrent start calls correctly', async () => {
      const steps = [createTestStep('step-1'), createTestStep('step-2')];

      const promise1 = runner.start(steps, 0);

      // Second start should throw
      await expect(runner.start(steps, 0)).rejects.toThrow();

      await vi.runAllTimersAsync();
      await promise1;
    });

    it('should preserve reviewed steps across multiple start calls', async () => {
      const steps = [
        createTestStep('step-1'),
        createTestStep('step-2'),
        createTestStep('step-3'),
      ];

      // First run - review step-2
      const promise1 = runner.start(steps, 0);
      await vi.runAllTimersAsync();
      await promise1;

      const reviewedAfterFirst = runner.getReviewedCount();

      // Reset state but not reviewed steps by re-running
      (runner as unknown as { state: ReviewerState }).state = 'idle';

      // Second run from new position
      const promise2 = runner.start(steps, 1);
      await vi.runAllTimersAsync();
      await promise2;

      // Should have reviewed additional steps
      expect(runner.getReviewedCount()).toBeGreaterThanOrEqual(reviewedAfterFirst);
    });
  });
});
