/**
 * Framework selection prompt
 * Second step in the wizard - select framework based on platform
 * Uses filtering logic to show only compatible frameworks
 */

import * as p from "@clack/prompts";
import {
  type Platform,
  type Framework,
  FRAMEWORKS,
} from "../compatibility/matrix.js";
import {
  getAvailableFrameworks,
  type FilteredOption,
} from "../compatibility/filters.js";

// ============================================================================
// Types
// ============================================================================

export interface FrameworkResult {
  framework: Framework;
}

// ============================================================================
// Main Prompt Function
// ============================================================================

/**
 * Prompt user to select a framework based on their platform choice
 * Returns the selected framework or undefined if cancelled
 */
export async function promptFramework(
  platform: Platform
): Promise<FrameworkResult | undefined> {
  const availableFrameworks = getAvailableFrameworks(platform);

  if (availableFrameworks.length === 0) {
    p.log.error(`No frameworks available for platform: ${platform}`);
    return undefined;
  }

  // If only one framework available, auto-select it
  if (availableFrameworks.length === 1) {
    const framework = availableFrameworks[0]!;
    p.log.info(`Auto-selected framework: ${framework.label}`);
    return { framework: framework.value };
  }

  const options = availableFrameworks.map((fw) => {
    const option: { value: typeof fw.value; label: string; hint?: string } = {
      value: fw.value,
      label: fw.recommended ? `${fw.label} (Recommended)` : fw.label,
    };
    if (fw.description) {
      option.hint = fw.description;
    }
    return option;
  });

  // Find the recommended framework for initial value
  const recommended = availableFrameworks.find((fw) => fw.recommended);
  const initialValue = recommended?.value ?? availableFrameworks[0]!.value;

  const result = await p.select<Framework>({
    message: "Which framework would you like to use?",
    options,
    initialValue,
  });

  if (p.isCancel(result)) {
    return undefined;
  }

  return { framework: result as Framework };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get framework info for display
 */
export function getFrameworkInfo(framework: Framework): {
  name: string;
  description: string;
  scaffoldCommand: string;
  notes?: string;
} {
  const config = FRAMEWORKS[framework];
  const info: {
    name: string;
    description: string;
    scaffoldCommand: string;
    notes?: string;
  } = {
    name: config.name,
    description: config.description,
    scaffoldCommand: config.scaffoldCommand,
  };
  if (config.notes) {
    info.notes = config.notes;
  }
  return info;
}

/**
 * Get framework display name
 */
export function getFrameworkDisplayName(framework: Framework): string {
  return FRAMEWORKS[framework].name;
}

/**
 * Validate framework selection for a platform
 */
export function isValidFrameworkForPlatform(
  framework: string,
  platform: Platform
): framework is Framework {
  const available = getAvailableFrameworks(platform);
  return available.some((fw) => fw.value === framework);
}

/**
 * Get the recommended framework for a platform
 */
export function getRecommendedFramework(
  platform: Platform
): Framework | undefined {
  const available = getAvailableFrameworks(platform);
  const recommended = available.find((fw) => fw.recommended);
  return recommended?.value;
}

/**
 * Get framework options with full metadata for custom UI rendering
 */
export function getFrameworkOptions(
  platform: Platform
): FilteredOption<Framework>[] {
  return getAvailableFrameworks(platform);
}
