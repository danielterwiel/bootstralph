/**
 * Project type selection prompt
 * First step in the wizard - select target platforms (Web, iOS, Android, API)
 * Users can select multiple targets to build for multiple platforms
 */

import * as p from "@clack/prompts";
import {
  type Target,
  type Platform,
  derivePlatformFromTargets,
  validateTargetSelection,
} from "../compatibility/matrix.js";

// ============================================================================
// Types
// ============================================================================

export interface ProjectTypeResult {
  targets: Target[];
  platform: Platform; // Derived from targets for backward compatibility
}

// ============================================================================
// Target Display Configuration
// ============================================================================

interface TargetDisplayConfig {
  label: string;
  hint?: string;
}

const TARGET_DISPLAY: Record<Target, TargetDisplayConfig> = {
  web: {
    label: "Web",
    hint: "SSR, SSG, or SPA applications",
  },
  ios: {
    label: "iOS",
    hint: "iPhone and iPad apps",
  },
  android: {
    label: "Android",
    hint: "Android phones and tablets",
  },
  api: {
    label: "API Only",
    hint: "Backend without UI",
  },
};

// Order of targets in the prompt
const TARGET_ORDER: Target[] = ["web", "ios", "android", "api"];

// ============================================================================
// Main Prompt Function
// ============================================================================

/**
 * Prompt user to select target platforms
 * Users can select multiple targets (e.g., Web + iOS + Android)
 * Returns the selected targets and derived platform, or undefined if cancelled
 */
export async function promptProjectType(): Promise<ProjectTypeResult | undefined> {
  const targetOptions = TARGET_ORDER.map((target) => {
    const display = TARGET_DISPLAY[target];
    const option: { value: typeof target; label: string; hint?: string } = {
      value: target,
      label: display.label,
    };
    if (display.hint) {
      option.hint = display.hint;
    }
    return option;
  });

  const result = await p.multiselect({
    message: "What platforms are you building for? (Space to select, Enter to confirm)",
    options: targetOptions,
    initialValues: ["web"] as Target[],
    required: true,
  });

  if (p.isCancel(result)) {
    return undefined;
  }

  const targets = result as Target[];

  // Validate target selection
  const validation = validateTargetSelection(targets);
  if (!validation.valid) {
    p.log.error(validation.reason ?? "Invalid target selection");
    return undefined;
  }

  // Derive platform from targets
  const platform = derivePlatformFromTargets(targets);

  // Show info about derived platform for complex selections
  if (targets.length > 1) {
    const hasWeb = targets.includes("web");
    const hasMobile = targets.includes("ios") || targets.includes("android");

    if (hasWeb && hasMobile) {
      p.log.info("Building a Universal app (Web + Mobile with shared code)");
    } else if (targets.includes("ios") && targets.includes("android")) {
      p.log.info("Building for both iOS and Android");
    }
  }

  return { targets, platform };
}

/**
 * Get target info for display
 */
export function getTargetInfo(target: Target): {
  name: string;
  description: string;
} {
  const display = TARGET_DISPLAY[target];
  return {
    name: display.label,
    description: display.hint ?? "",
  };
}

/**
 * Validate target selection
 */
export function isValidTarget(value: string): value is Target {
  return TARGET_ORDER.includes(value as Target);
}

/**
 * Get a human-readable description of the selected targets
 */
export function getTargetsDescription(targets: Target[]): string {
  if (targets.length === 1) {
    return TARGET_DISPLAY[targets[0]!].label;
  }

  const hasWeb = targets.includes("web");
  const hasIos = targets.includes("ios");
  const hasAndroid = targets.includes("android");

  if (hasWeb && hasIos && hasAndroid) {
    return "Universal (Web + iOS + Android)";
  }
  if (hasIos && hasAndroid && !hasWeb) {
    return "Mobile (iOS + Android)";
  }

  // Generic list
  return targets.map((t) => TARGET_DISPLAY[t].label).join(" + ");
}
