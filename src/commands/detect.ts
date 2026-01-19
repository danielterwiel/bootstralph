/**
 * Detect command - Print detected stack
 *
 * Runs detectStack and prints results using logger utilities.
 * Shows: framework, features, confidence score, detected packages.
 */

import * as p from "@clack/prompts";
import { detectStack } from "../detection/index.js";

/**
 * Options for detect command
 */
export interface DetectOptions {
  /**
   * Directory to analyze (default: process.cwd())
   */
  cwd?: string;
}

/**
 * Handle the detect command
 *
 * Analyzes the project and displays detected stack information including:
 * - Framework
 * - Features (auth, database, styling, testing, etc.)
 * - Confidence score
 *
 * @param options - Detect command options
 *
 * @example
 * ```typescript
 * // Detect current directory
 * await detect();
 *
 * // Detect specific directory
 * await detect({ cwd: '/path/to/project' });
 * ```
 */
export async function detect(options: DetectOptions = {}): Promise<void> {
  p.intro("bootsralph detect");

  const cwd = options.cwd ?? process.cwd();

  // Detect stack
  const spinner = p.spinner();
  spinner.start("Analyzing project...");

  const stack = await detectStack(cwd);

  spinner.stop("Project analyzed");

  // Build output lines
  const lines: string[] = [];

  // Framework
  lines.push(`Framework: ${stack.framework ?? "Not detected"}`);

  // Features
  if (stack.features.auth) {
    lines.push(`Auth: ${stack.features.auth}`);
  }
  if (stack.features.database) {
    lines.push(`Database: ${stack.features.database}`);
  }
  if (stack.features.styling) {
    lines.push(`Styling: ${stack.features.styling}`);
  }
  if (stack.features.testing) {
    lines.push(`Testing: ${stack.features.testing}`);
  }
  if (stack.features.typescript) {
    lines.push(`TypeScript: Yes`);
  }
  if (stack.features.docker) {
    lines.push(`Docker: Yes`);
  }

  // Confidence
  const confidencePercent = (stack.confidence * 100).toFixed(1);
  lines.push(`Confidence: ${confidencePercent}%`);

  // Display results
  p.note(lines.join("\n"), "Detected Stack");

  // Show confidence warning
  if (stack.confidence < 0.4) {
    p.log.warn("Low confidence in detection. Results may be inaccurate.");
  } else if (stack.confidence < 0.7) {
    p.log.info("Medium confidence in detection. Some details may need verification.");
  } else {
    p.log.success("High confidence in detection.");
  }

  p.outro("Done");
}
