/**
 * Ralph Command - Execute Ralph Loop with PRD selection
 *
 * Usage:
 *   bootstralph ralph                    # Select from incomplete PRDs (TUI mode)
 *   bootstralph ralph --prd <file>       # Use specific PRD
 *   bootstralph ralph --iterations 10    # Set max iterations
 *   bootstralph ralph --afk              # Run in AFK mode (unattended)
 *   bootstralph ralph --no-tui           # Disable TUI (use simple spinner mode)
 *   bootstralph ralph --tui              # Enable TUI (default)
 *
 * Pair Vibe Mode (requires ANTHROPIC_API_KEY and OPENAI_API_KEY):
 *   bootstralph ralph --pair-vibe        # Enable Pair Vibe Mode
 *   bootstralph ralph --no-pair-vibe     # Disable Pair Vibe Mode
 *   bootstralph ralph --pair-vibe --executor claude --reviewer openai
 *                                        # Specify model assignment
 */

import * as p from "@clack/prompts";
import * as fs from "fs-extra";
import * as path from "path";
import { execa } from "execa";
import {
  type Prd,
  isPrdComplete,
  getPrdProgress,
  getNextStory,
  DEFAULT_COMPLETION_PROMISE,
} from "../ralph/prd-schema.js";
import { getIncompletePrds, loadPrd, listPrdFiles } from "./prd.js";
import {
  startTui,
  stopTui,
  tuiLog,
} from "../tui/index.js";
import {
  startRalphEngine,
  abortRalphEngine,
  pauseRalphEngine,
  resumeRalphEngine,
  type RalphEngineOptions,
} from "../ralph/engine.js";
import {
  parseCommand,
  handleIssueCommand,
  handlePauseCommand,
  handleResumeCommand,
  handleSkipCommand,
  handleStatusCommand,
  handleNoteCommand,
  handlePriorityCommand,
  handleConsensusCommand,
  handleReviewerCommand,
  getHelpText,
} from "../tui/commands/index.js";
import { store } from "../tui/state/store.js";
import {
  detectApiKeys,
  type ApiProvider,
} from "../ralph/api-keys.js";
import {
  type PairVibeConfig,
  type ModelIdentifier,
  createDefaultPairVibeConfig,
} from "../ralph/pair-vibe-types.js";
import {
  PairVibeEngine,
  type PairVibeEngineOptions,
} from "../ralph/pair-vibe-engine.js";

/** Default max iterations for AFK mode */
const DEFAULT_MAX_ITERATIONS = 10;

/** Directory where PRDs are stored */
const AGENTS_TASKS_DIR = ".agents/tasks";

interface RalphOptions {
  prdFile?: string;
  iterations: number;
  afk: boolean;
  verbose: boolean;
  /** Enable TUI mode (default: true) */
  tui: boolean;
  /** Enable Pair Vibe Mode (requires 2 API keys) */
  pairVibe?: boolean;
  /** Provider for Executor in Pair Vibe Mode */
  executorProvider?: ApiProvider;
  /** Provider for Reviewer in Pair Vibe Mode */
  reviewerProvider?: ApiProvider;
}

/**
 * Parse ralph command arguments
 */
function parseRalphArgs(args: string[]): RalphOptions {
  const options: RalphOptions = {
    iterations: DEFAULT_MAX_ITERATIONS,
    afk: false,
    verbose: false,
    tui: true, // TUI enabled by default
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--prd" || arg === "-p") {
      const nextArg = args[i + 1];
      if (nextArg) {
        options.prdFile = nextArg;
        i++;
      }
    } else if (arg === "--iterations" || arg === "-i") {
      const nextArg = args[i + 1];
      if (nextArg) {
        options.iterations = parseInt(nextArg, 10) || DEFAULT_MAX_ITERATIONS;
        i++;
      }
    } else if (arg === "--afk" || arg === "-a") {
      options.afk = true;
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg === "--tui") {
      options.tui = true;
    } else if (arg === "--no-tui") {
      options.tui = false;
    } else if (arg === "--pair-vibe") {
      options.pairVibe = true;
    } else if (arg === "--no-pair-vibe") {
      options.pairVibe = false;
    } else if (arg === "--executor") {
      const nextArg = args[i + 1];
      if (nextArg === "claude" || nextArg === "anthropic") {
        options.executorProvider = "anthropic";
        i++;
      } else if (nextArg === "openai" || nextArg === "gpt") {
        options.executorProvider = "openai";
        i++;
      }
    } else if (arg === "--reviewer") {
      const nextArg = args[i + 1];
      if (nextArg === "claude" || nextArg === "anthropic") {
        options.reviewerProvider = "anthropic";
        i++;
      } else if (nextArg === "openai" || nextArg === "gpt") {
        options.reviewerProvider = "openai";
        i++;
      }
    } else if (!arg.startsWith("-")) {
      // Treat as PRD file if it looks like one
      if (arg.includes("prd-") || arg.endsWith(".json")) {
        options.prdFile = arg;
      }
    }
  }

  return options;
}

/**
 * Select a PRD from incomplete PRDs
 */
async function selectPrd(): Promise<{ filename: string; prd: Prd } | null> {
  const incompletePrds = await getIncompletePrds();

  if (incompletePrds.length === 0) {
    p.log.warn("No incomplete PRDs found in .agents/tasks/");
    p.log.info('Create one with: bootstralph prd "your feature description"');
    return null;
  }

  if (incompletePrds.length === 1) {
    const first = incompletePrds[0];
    if (first) {
      const progress = getPrdProgress(first.prd);
      p.log.info(
        `Found 1 incomplete PRD: ${first.prd.name} (${progress.completed}/${progress.total} complete)`
      );
      return first;
    }
    return null;
  }

  // Multiple incomplete PRDs - let user choose
  p.log.info(`Found ${incompletePrds.length} incomplete PRDs:`);

  const options = incompletePrds.map(({ filename, prd }) => {
    const progress = getPrdProgress(prd);
    return {
      value: filename,
      label: `${prd.name}`,
      hint: `${progress.completed}/${progress.total} stories (${progress.percentage}%)`,
    };
  });

  const selected = await p.select({
    message: "Which PRD would you like to work on?",
    options,
  });

  if (p.isCancel(selected)) {
    return null;
  }

  const match = incompletePrds.find((item) => item.filename === selected);
  return match ?? null;
}

/**
 * Prompt user to enable Pair Vibe Mode when 2+ API keys are detected
 * @returns PairVibeConfig if enabled, null if disabled
 */
async function promptPairVibeMode(
  options: RalphOptions
): Promise<PairVibeConfig | null> {
  // Detect available API keys
  const detection = detectApiKeys();

  // If explicitly disabled via CLI, skip
  if (options.pairVibe === false) {
    return null;
  }

  // If only one or no providers available, can't enable Pair Vibe
  if (!detection.canEnablePairVibe) {
    if (options.pairVibe === true) {
      // User explicitly requested Pair Vibe but it's not available
      p.log.warn("Pair Vibe Mode requires 2 API providers (Anthropic + OpenAI)");
      p.log.info(detection.summary);
    }
    return null;
  }

  // 2+ providers detected - check if we should prompt
  p.log.info(`${detection.summary}`);

  // If explicitly enabled via CLI with provider assignments, use those
  if (options.pairVibe === true && options.executorProvider && options.reviewerProvider) {
    // Validate that both providers are available
    if (!detection.availableProviders.includes(options.executorProvider)) {
      p.log.error(`Executor provider "${options.executorProvider}" not available`);
      return null;
    }
    if (!detection.availableProviders.includes(options.reviewerProvider)) {
      p.log.error(`Reviewer provider "${options.reviewerProvider}" not available`);
      return null;
    }
    if (options.executorProvider === options.reviewerProvider) {
      p.log.warn("Executor and Reviewer should use different providers for best results");
    }

    // Show cost warning
    await showCostWarning();

    return createDefaultPairVibeConfig(options.executorProvider, options.reviewerProvider);
  }

  // Prompt user to enable Pair Vibe Mode
  const enablePairVibe = await p.confirm({
    message: "Enable Pair Vibe Mode? (Two models work concurrently for better results)",
    initialValue: false,
  });

  if (p.isCancel(enablePairVibe) || !enablePairVibe) {
    return null;
  }

  // Prompt for Executor assignment
  const executorChoice = await p.select({
    message: "Which provider should be the Executor? (Runs the main Ralph loop)",
    options: [
      {
        value: "anthropic" as const,
        label: "Claude (Anthropic)",
        hint: "Recommended - more capable for complex implementations",
      },
      {
        value: "openai" as const,
        label: "GPT (OpenAI)",
        hint: "Faster, good for simpler tasks",
      },
    ],
  });

  if (p.isCancel(executorChoice)) {
    return null;
  }

  // Reviewer is the other provider
  const executorProvider = executorChoice as ApiProvider;
  const reviewerProvider: ApiProvider = executorProvider === "anthropic" ? "openai" : "anthropic";

  p.log.info(`Executor: ${executorProvider === "anthropic" ? "Claude" : "GPT"}`);
  p.log.info(`Reviewer: ${reviewerProvider === "anthropic" ? "Claude" : "GPT"}`);

  // Show cost warning
  const proceed = await showCostWarning();
  if (!proceed) {
    return null;
  }

  return createDefaultPairVibeConfig(executorProvider, reviewerProvider);
}

/**
 * Show cost warning for Pair Vibe Mode
 * Per review-008: Expected cost 2-4x single model
 */
async function showCostWarning(): Promise<boolean> {
  p.log.warn("⚠ Pair Vibe Mode Cost Warning");
  p.note(
    `Pair Vibe Mode runs two models concurrently with independent review.

Expected cost: 2-4x single model
- Low friction (10% consensus): ~2.2x
- Medium friction (25% consensus): ~2.8x
- High friction (40% consensus): ~3.5x

Actual cost depends on how often consensus is needed.`,
    "Cost Estimate"
  );

  const proceed = await p.confirm({
    message: "Continue with Pair Vibe Mode?",
    initialValue: true,
  });

  return !p.isCancel(proceed) && proceed;
}

/**
 * Get display name for a model
 */
function getModelDisplayName(model: ModelIdentifier): string {
  switch (model) {
    case "claude-sonnet-4-20250514":
      return "Claude Sonnet 4";
    case "claude-opus-4-20250514":
      return "Claude Opus 4";
    case "claude-sonnet-4-5-20250514":
      return "Claude Sonnet 4.5";
    case "gpt-4o":
      return "GPT-4o";
    case "gpt-4.1":
      return "GPT-4.1";
    case "o1":
      return "o1";
    case "o3":
      return "o3";
    case "o3-mini":
      return "o3-mini";
    default:
      return model;
  }
}

/**
 * Build the prompt for Claude Code
 */
function buildRalphPrompt(prd: Prd, prdFile: string): string {
  const nextStory = getNextStory(prd);
  const progress = getPrdProgress(prd);

  return `@${prdFile} @progress.txt

You are working on: ${prd.name}
Progress: ${progress.completed}/${progress.total} stories complete

INSTRUCTIONS:
1. Find the highest-priority incomplete task in the PRD and implement it
2. Run tests and type checks to verify your implementation
3. Update the PRD: set passes: true for completed stories
4. Append your progress to progress.txt with timestamp and summary
5. Commit your changes with a descriptive message

IMPORTANT:
- ONLY work on ONE task per iteration
- Do NOT move to the next task after completing one
- If all tasks pass, output: ${DEFAULT_COMPLETION_PROMISE}

${nextStory ? `SUGGESTED NEXT TASK: ${nextStory.id} - ${nextStory.title}` : ""}`;
}

/**
 * Run a single Ralph iteration
 */
async function runIteration(
  prdFile: string,
  prd: Prd,
  iteration: number,
  verbose: boolean
): Promise<{ complete: boolean; output: string }> {
  const prompt = buildRalphPrompt(prd, prdFile);

  if (verbose) {
    p.log.info(`Iteration ${iteration} prompt:\n${prompt}`);
  }

  try {
    const result = await execa(
      "docker",
      [
        "sandbox",
        "run",
        "claude",
        "--permission-mode",
        "acceptEdits",
        "-p",
        prompt,
      ],
      {
        cwd: process.cwd(),
        timeout: 10 * 60 * 1000, // 10 minute timeout per iteration
      }
    );

    const output = result.stdout;
    const complete = output.includes(DEFAULT_COMPLETION_PROMISE);

    return { complete, output };
  } catch (error) {
    if (error instanceof Error) {
      return { complete: false, output: `Error: ${error.message}` };
    }
    return { complete: false, output: "Unknown error occurred" };
  }
}

/**
 * Run Ralph in AFK mode (unattended loop)
 */
async function runAfkMode(
  prdFile: string,
  prd: Prd,
  maxIterations: number,
  verbose: boolean
): Promise<void> {
  p.log.info(`Starting AFK Ralph loop (max ${maxIterations} iterations)`);
  p.log.info(`PRD: ${prd.name}`);
  p.log.info("Press Ctrl+C to stop\n");

  const tasksDir = path.resolve(process.cwd(), AGENTS_TASKS_DIR);
  const progressFile = path.join(tasksDir, "progress.txt");

  // Ensure progress.txt exists
  if (!(await fs.pathExists(progressFile))) {
    await fs.writeFile(
      progressFile,
      `# Progress Log for ${prd.name}\n# Started: ${new Date().toISOString()}\n\n`
    );
  }

  for (let i = 1; i <= maxIterations; i++) {
    const s = p.spinner();
    s.start(`Iteration ${i}/${maxIterations}`);

    const { complete, output } = await runIteration(prdFile, prd, i, verbose);

    if (complete) {
      s.stop(`Iteration ${i}: PRD COMPLETE!`);
      p.log.success(`PRD completed after ${i} iterations`);

      // Append completion to progress
      await fs.appendFile(
        progressFile,
        `\n## ${new Date().toISOString()}\nPRD COMPLETED after ${i} iterations\n`
      );
      return;
    }

    s.stop(`Iteration ${i}: completed`);

    if (verbose) {
      p.log.message(output.slice(0, 500) + (output.length > 500 ? "..." : ""));
    }

    // Reload PRD to check progress
    const updatedPrd = await loadPrd(prdFile);
    if (updatedPrd) {
      const progress = getPrdProgress(updatedPrd);
      p.log.info(
        `Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)`
      );
    }
  }

  p.log.warn(`Max iterations (${maxIterations}) reached without completion`);
  await fs.appendFile(
    progressFile,
    `\n## ${new Date().toISOString()}\nMax iterations reached (${maxIterations})\n`
  );
}

/**
 * Run Ralph in interactive mode (single iteration)
 */
async function runInteractiveMode(
  prdFile: string,
  prd: Prd,
  verbose: boolean
): Promise<void> {
  const progress = getPrdProgress(prd);
  const nextStory = getNextStory(prd);

  p.log.info(`PRD: ${prd.name}`);
  p.log.info(
    `Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)`
  );

  if (!nextStory) {
    if (isPrdComplete(prd)) {
      p.log.success("PRD is already complete!");
    } else {
      p.log.warn("No stories available (check dependencies)");
    }
    return;
  }

  p.log.info(`Next story: ${nextStory.id} - ${nextStory.title}`);

  const shouldRun = await p.confirm({
    message: "Start Ralph iteration?",
    initialValue: true,
  });

  if (p.isCancel(shouldRun) || !shouldRun) {
    p.cancel("Operation cancelled");
    return;
  }

  const s = p.spinner();
  s.start("Running Ralph iteration...");

  const { complete, output } = await runIteration(prdFile, prd, 1, verbose);

  if (complete) {
    s.stop("PRD COMPLETE!");
    p.log.success("All stories pass!");
  } else {
    s.stop("Iteration complete");

    if (verbose) {
      p.note(output.slice(0, 1000), "Output");
    }

    // Reload and show progress
    const updatedPrd = await loadPrd(prdFile);
    if (updatedPrd) {
      const newProgress = getPrdProgress(updatedPrd);
      p.log.info(
        `Progress: ${newProgress.completed}/${newProgress.total} (${newProgress.percentage}%)`
      );
    }
  }
}

/**
 * Handle TUI slash commands
 */
async function handleTuiCommand(input: string): Promise<void> {
  const parsed = parseCommand(input);

  if (!parsed.isCommand) {
    // Not a slash command - just log the input
    tuiLog(`> ${input}`, "info", "user");
    return;
  }

  if (!parsed.isValid) {
    tuiLog(`Unknown command: ${parsed.name}`, "error", "system");
    tuiLog('Type /help for available commands', "info", "system");
    return;
  }

  // Route to appropriate handler
  switch (parsed.name) {
    case "issue":
      await handleIssueCommand(input);
      break;

    case "pause":
      await handlePauseCommand(input);
      pauseRalphEngine();
      break;

    case "resume":
      await handleResumeCommand(input);
      resumeRalphEngine();
      break;

    case "skip":
      await handleSkipCommand(input);
      break;

    case "status":
      await handleStatusCommand(input);
      break;

    case "note":
      await handleNoteCommand(input);
      break;

    case "priority":
      await handlePriorityCommand(input);
      break;

    case "abort":
      tuiLog("Aborting Ralph engine...", "warn", "system");
      abortRalphEngine();
      break;

    case "help":
      const helpText = getHelpText();
      tuiLog(helpText, "info", "system");
      break;

    case "clear":
      store.clearLogs();
      break;

    case "consensus":
      await handleConsensusCommand(input);
      break;

    case "reviewer":
      await handleReviewerCommand(input);
      break;

    default:
      tuiLog(`Command not implemented: ${parsed.name}`, "warn", "system");
  }
}

/**
 * Run Ralph in TUI mode with full interactive interface
 */
async function runTuiMode(
  prdFile: string,
  prd: Prd,
  maxIterations: number,
  verbose: boolean
): Promise<void> {
  // Resolve the full PRD path
  const tasksDir = path.resolve(process.cwd(), AGENTS_TASKS_DIR);
  const fullPrdPath = prdFile.startsWith("/")
    ? prdFile
    : path.join(tasksDir, prdFile);

  // Start the TUI
  // Note: startTui returns a TuiInstance but we control it via store/engine
  startTui({
    prd,
    prdFile,
    maxIterations,
    onCommand: handleTuiCommand,
    showPrdInfo: true,
    showSuggestions: true,
    title: `Ralph: ${prd.name}`,
    debug: verbose,
  });

  // Log startup message
  tuiLog(`Starting Ralph loop for: ${prd.name}`, "info", "system");
  tuiLog(`Max iterations: ${maxIterations}`, "info", "system");
  tuiLog('Type /help for available commands', "info", "system");

  // Build engine options
  const engineOptions: RalphEngineOptions = {
    prdFile: fullPrdPath,
    maxIterations,
    logToStore: true,
    verbose,
    onIterationComplete: (result) => {
      if (verbose) {
        tuiLog(
          `Iteration ${result.iteration} completed in ${result.durationMs}ms`,
          result.success ? "success" : "warn",
          "engine"
        );
      }
    },
    onTaskStart: (task) => {
      const title = "task" in task ? task.task : task.title;
      tuiLog(`Starting task: ${task.id} - ${title}`, "info", "engine");
    },
    onTaskComplete: (task) => {
      const title = "task" in task ? task.task : task.title;
      tuiLog(`Completed task: ${task.id} - ${title}`, "success", "engine");
    },
    onPrdComplete: () => {
      tuiLog("PRD COMPLETE! All tasks have passed.", "success", "engine");
    },
    onStop: (reason) => {
      tuiLog(`Ralph engine stopped: ${reason}`, "info", "engine");
    },
  };

  // Handle Ctrl+C gracefully
  const handleSignal = () => {
    tuiLog("Received interrupt signal, shutting down...", "warn", "system");
    abortRalphEngine();
    stopTui();
    process.exit(0);
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  try {
    // Run the Ralph engine
    const result = await startRalphEngine(engineOptions);

    // Log final result
    if (result.prdComplete) {
      tuiLog(
        `PRD completed after ${result.iterationsRun} iterations!`,
        "success",
        "system"
      );
    } else {
      tuiLog(
        `Ralph stopped: ${result.stopReason} after ${result.iterationsRun} iterations`,
        "warn",
        "system"
      );
    }

    // Wait a bit for user to see the result before exiting
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    tuiLog(`Engine error: ${errorMessage}`, "error", "system");
  } finally {
    // Cleanup
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
    stopTui();
  }
}

/**
 * Run Ralph in Pair Vibe TUI mode with two models
 */
async function runPairVibeTuiMode(
  prdFile: string,
  prd: Prd,
  config: PairVibeConfig,
  maxIterations: number,
  verbose: boolean
): Promise<void> {
  // Resolve the tasks directory for PRD operations
  const tasksDir = path.resolve(process.cwd(), AGENTS_TASKS_DIR);

  // Start the TUI
  startTui({
    prd,
    prdFile,
    maxIterations,
    onCommand: handleTuiCommand,
    showPrdInfo: true,
    showSuggestions: true,
    title: `Ralph [PAIR VIBE]: ${prd.name}`,
    debug: verbose,
  });

  // Log startup message with Pair Vibe info
  tuiLog(`Starting Pair Vibe Mode for: ${prd.name}`, "info", "system");
  tuiLog(
    `Executor: ${getModelDisplayName(config.executorModel)} (${config.executorProvider})`,
    "info",
    "system"
  );
  tuiLog(
    `Reviewer: ${getModelDisplayName(config.reviewerModel)} (${config.reviewerProvider})`,
    "info",
    "system"
  );
  tuiLog(`Max iterations: ${maxIterations}`, "info", "system");
  tuiLog('Type /help for available commands', "info", "system");

  // Build Pair Vibe Engine options
  const engineOptions: PairVibeEngineOptions = {
    config,
    eventHandler: (event) => {
      // Forward events to TUI
      switch (event.type) {
        case "phase-change":
          tuiLog(`Phase: ${event.phase}`, "info", "engine");
          break;
        case "reviewer-started":
          tuiLog(`Reviewer started: ${event.stepId}`, "info", "reviewer");
          break;
        case "reviewer-completed":
          tuiLog(
            `Reviewer completed: ${event.stepId} (${event.hasFindings ? "findings" : "clean"})`,
            event.hasFindings ? "warn" : "success",
            "reviewer"
          );
          break;
        case "reviewer-timeout":
          tuiLog(`Reviewer timeout: ${event.stepId}`, "warn", "reviewer");
          break;
        case "executor-started":
          tuiLog(`Executor started: ${event.stepId}`, "info", "executor");
          break;
        case "executor-completed":
          tuiLog(
            `Executor completed: ${event.stepId} (${event.success ? "success" : "failed"})`,
            event.success ? "success" : "error",
            "executor"
          );
          break;
        case "consensus-started":
          tuiLog(
            `Consensus needed for ${event.stepId}: ${event.findings.length} findings`,
            "warn",
            "consensus"
          );
          break;
        case "consensus-round":
          tuiLog(`Consensus round ${event.round} for ${event.stepId}`, "info", "consensus");
          break;
        case "consensus-completed":
          tuiLog(
            `Consensus reached for ${event.result.stepId} (${event.result.decidedBy}) in ${event.result.rounds} rounds`,
            "success",
            "consensus"
          );
          break;
        case "consensus-timeout":
          tuiLog(`Consensus timeout: ${event.stepId}`, "warn", "consensus");
          break;
        case "web-search-started":
          if (verbose) {
            tuiLog(`Web search: ${event.query}`, "info", "search");
          }
          break;
        case "web-search-completed":
          if (verbose) {
            tuiLog(`Search found ${event.resultCount} results`, "success", "search");
          }
          break;
        case "web-search-failed":
          tuiLog(`Search failed: ${event.error}`, "warn", "search");
          break;
        case "rate-limit-hit":
          tuiLog(
            `Rate limit hit (${event.provider}), retry in ${Math.round(event.retryAfterMs / 1000)}s`,
            "warn",
            "system"
          );
          break;
        case "degraded-mode":
          tuiLog(`Degraded mode: ${event.reason}`, "warn", "system");
          break;
        case "paused":
          tuiLog(`Paused: ${event.reason}`, "info", "system");
          break;
        case "resumed":
          tuiLog("Resumed", "info", "system");
          break;
        case "error":
          tuiLog(`Error: ${event.error}`, "error", "system");
          break;
        case "cost-update":
          if (verbose) {
            tuiLog(`Cost: $${event.totalCost.toFixed(4)}`, "info", "cost");
          }
          break;
      }
    },
    savePrd: async (updatedPrd: Prd) => {
      // Save PRD to file
      const prdPath = path.join(tasksDir, prdFile);
      await fs.writeJson(prdPath, updatedPrd, { spaces: 2 });
    },
    reloadPrd: async () => {
      // Reload PRD from file
      const loaded = await loadPrd(prdFile);
      if (!loaded) {
        throw new Error(`Failed to reload PRD: ${prdFile}`);
      }
      return loaded;
    },
  };

  // Create the Pair Vibe Engine
  const engine = new PairVibeEngine(engineOptions);

  // Register engine with store for manual consensus triggering via /consensus command
  store.registerPairVibeEngine(engine);

  // Handle Ctrl+C gracefully
  const handleSignal = () => {
    tuiLog("Received interrupt signal, shutting down...", "warn", "system");
    engine.stop("User interrupt");
    stopTui();
    process.exit(0);
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  try {
    // Run the Pair Vibe Engine
    const result = await engine.run(prd);

    // Log final result
    if (result.prdComplete) {
      tuiLog(
        `PRD completed! ${result.stepsCompleted}/${result.stepsTotal} steps`,
        "success",
        "system"
      );
      tuiLog(
        `Consensus triggered ${result.consensusRounds} times, ${result.reviewTimeouts} review timeouts`,
        "info",
        "system"
      );
    } else {
      tuiLog(
        `Ralph stopped: ${result.stopReason} (${result.stepsCompleted}/${result.stepsTotal} steps)`,
        "warn",
        "system"
      );
      if (result.error) {
        tuiLog(`Error: ${result.error}`, "error", "system");
      }
    }

    // Wait a bit for user to see the result before exiting
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    tuiLog(`Engine error: ${errorMessage}`, "error", "system");
  } finally {
    // Cleanup - unregister engine first
    store.registerPairVibeEngine(null);
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
    stopTui();
  }
}

/**
 * Handle the 'ralph' command
 */
export async function handleRalph(args: string[]): Promise<void> {
  const options = parseRalphArgs(args);

  // Only show intro banner for non-TUI modes
  if (!options.tui || options.afk) {
    p.intro("bootstralph ralph - Execute Ralph Loop");
  }

  // Get the PRD to work on
  let prdFile: string;
  let prd: Prd;

  if (options.prdFile) {
    // Specific PRD file provided
    const filename = options.prdFile.endsWith(".json")
      ? options.prdFile
      : `${options.prdFile}.json`;

    const loadedPrd = await loadPrd(filename);
    if (!loadedPrd) {
      p.log.error(`PRD file not found: ${filename}`);
      const files = await listPrdFiles();
      if (files.length > 0) {
        p.log.info("Available PRDs:");
        files.forEach((f) => p.log.message(`  - ${f}`));
      }
      return;
    }
    prdFile = filename;
    prd = loadedPrd;
  } else {
    // Select from incomplete PRDs
    const selected = await selectPrd();
    if (!selected) {
      p.cancel("No PRD selected");
      return;
    }
    prdFile = selected.filename;
    prd = selected.prd;
  }

  // Check if PRD is already complete
  if (isPrdComplete(prd)) {
    p.log.success(`PRD "${prd.name}" is already complete!`);
    return;
  }

  // Check for Pair Vibe Mode (only in interactive TUI mode, not AFK)
  let pairVibeConfig: PairVibeConfig | null = null;
  if (!options.afk && options.tui) {
    pairVibeConfig = await promptPairVibeMode(options);
  }

  // Run in appropriate mode
  if (options.afk) {
    // AFK mode always uses simple spinner mode (no TUI)
    await runAfkMode(prdFile, prd, options.iterations, options.verbose);
  } else if (pairVibeConfig) {
    // Pair Vibe TUI mode with two models
    await runPairVibeTuiMode(prdFile, prd, pairVibeConfig, options.iterations, options.verbose);
  } else if (options.tui) {
    // Standard TUI mode with single model
    await runTuiMode(prdFile, prd, options.iterations, options.verbose);
  } else {
    // Simple interactive mode (legacy behavior)
    await runInteractiveMode(prdFile, prd, options.verbose);
  }

  // Only show outro for non-TUI modes
  if (!options.tui || options.afk) {
    p.outro("Ralph session ended");
  }
}
