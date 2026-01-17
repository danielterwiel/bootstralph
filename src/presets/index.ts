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

// Re-export Mobile preset
export {
  MOBILE_PRESET,
  MOBILE_BETTER_AUTH_PRESET,
  MOBILE_NATIVEWIND_PRESET,
  MOBILE_TAMAGUI_PRESET,
  MOBILE_CONVEX_PRESET,
  MOBILE_FIREBASE_PRESET,
  MOBILE_DETOX_PRESET,
  getMobilePreset,
  getMobileVariant,
  getAllMobileVariants,
} from "./mobile.js";

// Re-export API preset
export {
  API_PRESET,
  API_ELYSIA_PRESET,
  API_PRISMA_PRESET,
  API_VERCEL_PRESET,
  API_NODE_PRESET,
  API_SUPABASE_PRESET,
  API_FLY_PRESET,
  getAPIPreset,
  getAPIVariant,
  getAllAPIVariants,
} from "./api.js";

// ============================================================================
// Preset Registry
// ============================================================================

import { SAAS_PRESET, type PresetConfig } from "./saas.js";
import { MOBILE_PRESET } from "./mobile.js";
import { API_PRESET } from "./api.js";

/**
 * All available presets by ID
 */
export const PRESETS: Record<string, PresetConfig> = {
  saas: SAAS_PRESET,
  mobile: MOBILE_PRESET,
  api: API_PRESET,
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
