/**
 * Preset configurations for quick project setup
 * Presets provide optimized configurations for common use cases
 */

// Re-export all preset types and functions
export type { PresetConfig } from "./saas.js";

// Re-export SaaS preset
export {
  SAAS_PRESET,
  SAAS_CLERK_PRESET,
  SAAS_PRISMA_PRESET,
  SAAS_TANSTACK_PRESET,
  SAAS_CONVEX_PRESET,
  getSaaSPreset,
  getSaaSVariant,
  getAllSaaSVariants,
  presetToProjectConfig,
  formatPresetInfo,
} from "./saas.js";

// ============================================================================
// Preset Registry
// ============================================================================

import { SAAS_PRESET, type PresetConfig } from "./saas.js";

/**
 * All available presets by ID
 */
export const PRESETS: Record<string, PresetConfig> = {
  saas: SAAS_PRESET,
};

/**
 * Get a preset by ID
 */
export function getPreset(id: string): PresetConfig | undefined {
  return PRESETS[id];
}

/**
 * Get all available presets
 */
export function getAllPresets(): PresetConfig[] {
  return Object.values(PRESETS);
}

/**
 * Check if a preset ID exists
 */
export function isValidPreset(id: string): boolean {
  return id in PRESETS;
}
