/**
 * Mobile Preset Configuration
 * Optimized for building mobile applications with Expo
 */

import type { PresetConfig } from "./saas.js";

// ============================================================================
// Mobile Preset Configuration
// ============================================================================

/**
 * Mobile preset optimized for building production-ready mobile applications
 *
 * Stack:
 * - Expo (managed workflow) for cross-platform mobile development
 * - Uniwind for Tailwind-style styling (2.5x faster than NativeWind)
 * - Expo Router for file-based navigation
 * - Clerk for native mobile authentication
 * - Supabase for backend services
 * - EAS Build for cloud builds and deployment
 *
 * Features included:
 * - Cross-platform iOS and Android support
 * - Native authentication with Clerk SDK
 * - Real-time database with Supabase
 * - Over-the-air updates with EAS Update
 * - Modern testing with Jest and Maestro
 * - Pre-commit hooks with prek for fast checks
 */
export const MOBILE_PRESET: PresetConfig = {
  id: "mobile",
  name: "Mobile Application",
  description: "Cross-platform mobile app with Expo, auth, and backend",
  platform: "mobile",
  framework: "expo",
  styling: "uniwind",
  state: ["zustand", "tanstack-query"],
  orm: "none",
  backend: "supabase",
  auth: "clerk",
  deployment: "eas",
  linter: "oxlint",
  formatter: "oxfmt",
  unitTesting: "jest",
  e2eTesting: "maestro",
  preCommit: "prek",
  packageManager: "bun",
  features: [
    "Expo managed workflow",
    "Expo Router (file-based navigation)",
    "Uniwind styling (Tailwind for React Native)",
    "Clerk authentication (native SDK)",
    "Supabase backend (database, storage, realtime)",
    "EAS Build (cloud builds)",
    "EAS Update (OTA updates)",
    "Jest unit testing",
    "Maestro E2E testing",
    "iOS and Android support",
  ],
  skills: [
    "planning-with-files",
    "test-driven-development",
    "systematic-debugging",
    "verification-before-completion",
    "expo-app-design",
    "expo-deployment",
    "upgrading-expo",
    "supabase-operations",
    "clerk-pack",
  ],
};

// ============================================================================
// Preset Variants
// ============================================================================

/**
 * Mobile preset with better-auth
 * Use this when you prefer a more flexible, self-hosted auth solution
 */
export const MOBILE_BETTER_AUTH_PRESET: PresetConfig = {
  ...MOBILE_PRESET,
  id: "mobile-better-auth",
  name: "Mobile with better-auth",
  description: "Cross-platform mobile app with better-auth",
  auth: "better-auth",
  features: [
    ...MOBILE_PRESET.features.filter((f) => !f.includes("Clerk")),
    "better-auth authentication (native SDK via @better-auth/expo)",
  ],
  skills: [
    ...MOBILE_PRESET.skills.filter((s) => s !== "clerk-pack"),
    "better-auth",
  ],
};

/**
 * Mobile preset with NativeWind
 * Use this when you prefer the established NativeWind ecosystem
 */
export const MOBILE_NATIVEWIND_PRESET: PresetConfig = {
  ...MOBILE_PRESET,
  id: "mobile-nativewind",
  name: "Mobile with NativeWind",
  description: "Cross-platform mobile app with NativeWind styling",
  styling: "nativewind",
  features: [
    ...MOBILE_PRESET.features.filter((f) => !f.includes("Uniwind")),
    "NativeWind styling (Tailwind for React Native)",
  ],
};

/**
 * Mobile preset with Tamagui
 * Use this for maximum performance with an optimizing compiler
 */
export const MOBILE_TAMAGUI_PRESET: PresetConfig = {
  ...MOBILE_PRESET,
  id: "mobile-tamagui",
  name: "Mobile with Tamagui",
  description: "Cross-platform mobile app with Tamagui design system",
  styling: "tamagui",
  features: [
    ...MOBILE_PRESET.features.filter((f) => !f.includes("Uniwind")),
    "Tamagui design system (optimizing compiler)",
  ],
};

/**
 * Mobile preset with Convex backend
 * Use this for real-time applications with built-in state sync
 */
export const MOBILE_CONVEX_PRESET: PresetConfig = {
  ...MOBILE_PRESET,
  id: "mobile-convex",
  name: "Mobile with Convex",
  description: "Cross-platform mobile app with Convex real-time backend",
  backend: "convex",
  features: [
    ...MOBILE_PRESET.features.filter((f) => !f.includes("Supabase")),
    "Convex backend (real-time database, functions, file storage)",
  ],
  skills: [
    ...MOBILE_PRESET.skills.filter((s) => s !== "supabase-operations"),
    "convex",
  ],
};

/**
 * Mobile preset with Firebase
 * Use this when you need Firebase's comprehensive mobile services
 */
export const MOBILE_FIREBASE_PRESET: PresetConfig = {
  ...MOBILE_PRESET,
  id: "mobile-firebase",
  name: "Mobile with Firebase",
  description: "Cross-platform mobile app with Firebase services",
  backend: "firebase",
  auth: "supabase-auth", // Firebase has its own auth, but we can use Supabase Auth or Firebase Auth
  features: [
    ...MOBILE_PRESET.features.filter(
      (f) => !f.includes("Supabase") && !f.includes("Clerk")
    ),
    "Firebase backend (Firestore, Storage, Cloud Functions)",
    "Firebase Authentication",
  ],
  skills: [
    ...MOBILE_PRESET.skills.filter(
      (s) => s !== "supabase-operations" && s !== "clerk-pack"
    ),
    "firebase-functions-templates",
  ],
};

/**
 * Mobile preset with Detox E2E testing
 * Use this when you need deterministic, reliable E2E tests
 */
export const MOBILE_DETOX_PRESET: PresetConfig = {
  ...MOBILE_PRESET,
  id: "mobile-detox",
  name: "Mobile with Detox",
  description: "Cross-platform mobile app with Detox E2E testing",
  e2eTesting: "detox",
  features: [
    ...MOBILE_PRESET.features.filter((f) => !f.includes("Maestro")),
    "Detox E2E testing (deterministic, fast)",
  ],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the Mobile preset configuration
 */
export function getMobilePreset(): PresetConfig {
  return MOBILE_PRESET;
}

/**
 * Get a Mobile variant by ID
 */
export function getMobileVariant(
  variant:
    | "default"
    | "better-auth"
    | "nativewind"
    | "tamagui"
    | "convex"
    | "firebase"
    | "detox"
): PresetConfig {
  switch (variant) {
    case "better-auth":
      return MOBILE_BETTER_AUTH_PRESET;
    case "nativewind":
      return MOBILE_NATIVEWIND_PRESET;
    case "tamagui":
      return MOBILE_TAMAGUI_PRESET;
    case "convex":
      return MOBILE_CONVEX_PRESET;
    case "firebase":
      return MOBILE_FIREBASE_PRESET;
    case "detox":
      return MOBILE_DETOX_PRESET;
    case "default":
    default:
      return MOBILE_PRESET;
  }
}

/**
 * Get all Mobile preset variants
 */
export function getAllMobileVariants(): PresetConfig[] {
  return [
    MOBILE_PRESET,
    MOBILE_BETTER_AUTH_PRESET,
    MOBILE_NATIVEWIND_PRESET,
    MOBILE_TAMAGUI_PRESET,
    MOBILE_CONVEX_PRESET,
    MOBILE_FIREBASE_PRESET,
    MOBILE_DETOX_PRESET,
  ];
}

// ============================================================================
// Exports
// ============================================================================

export default MOBILE_PRESET;
