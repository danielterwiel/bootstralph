/**
 * Ralph Command - Execute Ralph Loop with PRD selection
 *
 * Usage:
 *   bootstralph ralph                    # Select from incomplete PRDs
 *   bootstralph ralph --prd <file>       # Use specific PRD
 *   bootstralph ralph --iterations 10    # Set max iterations
 *   bootstralph ralph --afk              # Run in AFK mode (unattended)
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

/** Default max iterations for AFK mode */
const DEFAULT_MAX_ITERATIONS = 10;

/** Directory where PRDs are stored */
const AGENTS_TASKS_DIR = ".agents/tasks";

interface RalphOptions {
  prdFile?: string;
  iterations: number;
  afk: boolean;
  verbose: boolean;
}

/**
 * Parse ralph command arguments
 */
function parseRalphArgs(args: string[]): RalphOptions {
  const options: RalphOptions = {
    iterations: DEFAULT_MAX_ITERATIONS,
    afk: false,
    verbose: false,
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
 * Handle the 'ralph' command
 */
export async function handleRalph(args: string[]): Promise<void> {
  p.intro("bootstralph ralph - Execute Ralph Loop");

  const options = parseRalphArgs(args);

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

  // Run in appropriate mode
  if (options.afk) {
    await runAfkMode(prdFile, prd, options.iterations, options.verbose);
  } else {
    await runInteractiveMode(prdFile, prd, options.verbose);
  }

  p.outro("Ralph session ended");
}
