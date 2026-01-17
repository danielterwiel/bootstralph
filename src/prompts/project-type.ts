/**
 * Project type selection prompt
 * First step in the wizard - select platform type (Web, Mobile, Universal, API)
 */

import * as p from "@clack/prompts";
import {
  type Platform,
  PLATFORMS,
} from "../compatibility/matrix.js";

// ============================================================================
// Types
// ============================================================================

export interface ProjectTypeResult {
  platform: Platform;
}

// ============================================================================
// Platform Display Configuration
// ============================================================================

interface PlatformDisplayConfig {
  label: string;
  hint?: string;
}

const PLATFORM_DISPLAY: Record<Platform, PlatformDisplayConfig> = {
  web: {
    label: "Web",
    hint: "SSR, SSG, or SPA applications",
  },
  mobile: {
    label: "Mobile",
    hint: "iOS and Android apps",
  },
  universal: {
    label: "Universal",
    hint: "Web + Mobile with shared code",
  },
  api: {
    label: "API Only",
    hint: "Backend without UI",
  },
};

// ============================================================================
// Main Prompt Function
// ============================================================================

/**
 * Prompt user to select the project type/platform
 * Returns the selected platform or undefined if cancelled
 */
export async function promptProjectType(): Promise<ProjectTypeResult | undefined> {
  const platformOptions = (Object.keys(PLATFORMS) as Platform[]).map(
    (platform) => {
      const config = PLATFORMS[platform];
      const display = PLATFORM_DISPLAY[platform];
      return {
        value: platform,
        label: display.label,
        hint: display.hint || config.description,
      };
    }
  );

  const result = await p.select<Platform>({
    message: "What type of project are you building?",
    options: platformOptions,
    initialValue: "web" as Platform,
  });

  if (p.isCancel(result)) {
    return undefined;
  }

  return { platform: result as Platform };
}

/**
 * Get platform info for display
 */
export function getPlatformInfo(platform: Platform): {
  name: string;
  description: string;
  frameworks: string[];
} {
  const config = PLATFORMS[platform];
  const display = PLATFORM_DISPLAY[platform];
  return {
    name: display.label,
    description: config.description,
    frameworks: config.frameworks,
  };
}

/**
 * Validate platform selection
 */
export function isValidPlatform(value: string): value is Platform {
  return Object.keys(PLATFORMS).includes(value);
}
