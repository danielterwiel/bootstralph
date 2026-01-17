/**
 * Features selection prompt
 * Third step in the wizard - select features based on platform and framework
 * Uses filtering logic to show only compatible options
 */

import * as p from "@clack/prompts";
import {
  type Platform,
  type Framework,
  type Styling,
  type StateManagement,
  type ORM,
  type Backend,
  type AuthProvider,
  FRAMEWORKS,
} from "../compatibility/matrix.js";
import {
  getAvailableStyling,
  getAvailableStateManagement,
  getAvailableORM,
  getAvailableBackend,
  getAvailableAuth,
  type FilteredOption,
} from "../compatibility/filters.js";

// ============================================================================
// Types
// ============================================================================

export interface FeaturesResult {
  styling?: Styling;
  state?: StateManagement[];
  orm?: ORM;
  backend?: Backend;
  auth?: AuthProvider;
}

export interface FeaturesPromptContext {
  platform: Platform;
  framework: Framework;
}

// ============================================================================
// Main Prompt Function
// ============================================================================

/**
 * Prompt user to select features for their project
 * Shows only compatible options based on platform and framework
 * Returns the selected features or undefined if cancelled
 */
export async function promptFeatures(
  context: FeaturesPromptContext
): Promise<FeaturesResult | undefined> {
  const { platform, framework } = context;
  const result: FeaturesResult = {};

  // 1. Styling selection (if applicable)
  const stylingResult = await promptStyling({ platform, framework });
  if (stylingResult === null) return undefined; // cancelled
  if (stylingResult) result.styling = stylingResult;

  // 2. State management selection (if applicable)
  const stateResult = await promptStateManagement({ framework });
  if (stateResult === null) return undefined; // cancelled
  if (stateResult && stateResult.length > 0) result.state = stateResult;

  // 3. ORM selection (if applicable, skip for mobile-only frameworks)
  const ormResult = await promptORM({ framework });
  if (ormResult === null) return undefined; // cancelled
  if (ormResult) result.orm = ormResult;

  // 4. Backend selection (if applicable)
  const backendResult = await promptBackend({ framework });
  if (backendResult === null) return undefined; // cancelled
  if (backendResult) result.backend = backendResult;

  // 5. Auth selection (if applicable)
  const authContext: { framework: Framework; backend?: Backend } = { framework };
  if (result.backend) {
    authContext.backend = result.backend;
  }
  const authResult = await promptAuth(authContext);
  if (authResult === null) return undefined; // cancelled
  if (authResult) result.auth = authResult;

  return result;
}

// ============================================================================
// Individual Feature Prompts
// ============================================================================

/**
 * Prompt for styling selection
 * Returns undefined if no styling options available, null if cancelled
 */
async function promptStyling(
  context: Pick<FeaturesPromptContext, "platform" | "framework">
): Promise<Styling | undefined | null> {
  const { platform, framework } = context;

  // Skip styling for API-only frameworks
  if (platform === "api") {
    return undefined;
  }

  const availableOptions = getAvailableStyling({ platform, framework });

  if (availableOptions.length === 0) {
    return undefined;
  }

  // Auto-select if only one option
  if (availableOptions.length === 1) {
    const styling = availableOptions[0]!;
    p.log.info(`Auto-selected styling: ${styling.label}`);
    return styling.value;
  }

  const options = buildSelectOptions(availableOptions);
  const recommended = availableOptions.find((o) => o.recommended);
  const initialValue = recommended?.value ?? availableOptions[0]!.value;

  const result = await p.select<Styling>({
    message: "Which styling approach would you like to use?",
    options,
    initialValue,
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result as Styling;
}

/**
 * Prompt for state management selection (multi-select)
 * Returns undefined if no options available, null if cancelled
 */
async function promptStateManagement(
  context: Pick<FeaturesPromptContext, "framework">
): Promise<StateManagement[] | undefined | null> {
  const { framework } = context;
  const frameworkConfig = FRAMEWORKS[framework];

  // Skip state management for API-only and content-focused frameworks
  if (frameworkConfig.state.length === 0) {
    return undefined;
  }

  const availableOptions = getAvailableStateManagement({ framework });

  if (availableOptions.length === 0) {
    return undefined;
  }

  const options = availableOptions.map((opt) => {
    const option: { value: StateManagement; label: string; hint?: string } = {
      value: opt.value,
      label: opt.recommended ? `${opt.label} (Recommended)` : opt.label,
    };
    if (opt.description) {
      option.hint = opt.description;
    }
    return option;
  });

  // TanStack Query is almost always useful, pre-select it along with zustand
  const initialValues: StateManagement[] = [];
  if (availableOptions.some((o) => o.value === "zustand")) {
    initialValues.push("zustand");
  }
  if (availableOptions.some((o) => o.value === "tanstack-query")) {
    initialValues.push("tanstack-query");
  }

  const result = await p.multiselect({
    message: "Which state management libraries would you like? (Space to select)",
    options,
    initialValues,
    required: false,
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result as StateManagement[];
}

/**
 * Prompt for ORM selection
 * Returns undefined if no options available, null if cancelled
 */
async function promptORM(
  context: Pick<FeaturesPromptContext, "framework">
): Promise<ORM | undefined | null> {
  const { framework } = context;
  const availableOptions = getAvailableORM({ framework });

  // Skip ORM for mobile frameworks that use backend services
  if (availableOptions.length === 0) {
    return undefined;
  }

  // If only "none" is available, skip the question
  if (availableOptions.length === 1 && availableOptions[0]!.value === "none") {
    return undefined;
  }

  const options = buildSelectOptions(availableOptions);
  const recommended = availableOptions.find((o) => o.recommended);
  const initialValue = recommended?.value ?? availableOptions[0]!.value;

  const result = await p.select<ORM>({
    message: "Which ORM would you like to use?",
    options,
    initialValue,
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result as ORM;
}

/**
 * Prompt for backend selection
 * Returns undefined if no options available, null if cancelled
 */
async function promptBackend(
  context: Pick<FeaturesPromptContext, "framework">
): Promise<Backend | undefined | null> {
  const { framework } = context;
  const availableOptions = getAvailableBackend({ framework });

  if (availableOptions.length === 0) {
    return undefined;
  }

  // If only "custom" is available (for API frameworks), skip
  if (availableOptions.length === 1 && availableOptions[0]!.value === "custom") {
    return undefined;
  }

  const options = buildSelectOptions(availableOptions);
  const recommended = availableOptions.find((o) => o.recommended);
  const initialValue = recommended?.value ?? availableOptions[0]!.value;

  const result = await p.select<Backend>({
    message: "Which backend service would you like to use?",
    options,
    initialValue,
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result as Backend;
}

/**
 * Prompt for auth provider selection
 * Returns undefined if no options available, null if cancelled
 */
async function promptAuth(
  context: Pick<FeaturesPromptContext, "framework"> & { backend?: Backend }
): Promise<AuthProvider | undefined | null> {
  const { framework, backend } = context;
  // Build the selections object properly for exactOptionalPropertyTypes
  const selections: { framework: Framework; backend?: Backend } = { framework };
  if (backend) {
    selections.backend = backend;
  }
  const availableOptions = getAvailableAuth(selections);

  if (availableOptions.length === 0) {
    return undefined;
  }

  const options = buildSelectOptions(availableOptions);
  const recommended = availableOptions.find((o) => o.recommended);
  const initialValue = recommended?.value ?? availableOptions[0]!.value;

  const result = await p.select<AuthProvider>({
    message: "Which authentication provider would you like to use?",
    options,
    initialValue,
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result as AuthProvider;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build select options with proper typing for @clack/prompts
 */
function buildSelectOptions<T extends string>(
  options: FilteredOption<T>[]
): Array<{ value: T; label: string; hint?: string }> {
  return options.map((opt) => {
    const option: { value: T; label: string; hint?: string } = {
      value: opt.value,
      label: opt.recommended ? `${opt.label} (Recommended)` : opt.label,
    };
    if (opt.description) {
      option.hint = opt.description;
    }
    return option;
  });
}

/**
 * Get a summary of selected features for display
 */
export function getFeaturessSummary(features: FeaturesResult): string[] {
  const summary: string[] = [];

  if (features.styling) {
    summary.push(`Styling: ${getStylingDisplayName(features.styling)}`);
  }
  if (features.state && features.state.length > 0) {
    summary.push(`State: ${features.state.map(getStateDisplayName).join(", ")}`);
  }
  if (features.orm && features.orm !== "none") {
    summary.push(`ORM: ${getORMDisplayName(features.orm)}`);
  }
  if (features.backend) {
    summary.push(`Backend: ${getBackendDisplayName(features.backend)}`);
  }
  if (features.auth) {
    summary.push(`Auth: ${getAuthDisplayName(features.auth)}`);
  }

  return summary;
}

function getStylingDisplayName(styling: Styling): string {
  const names: Record<Styling, string> = {
    "tailwind-shadcn": "Tailwind CSS + shadcn/ui",
    tailwind: "Tailwind CSS",
    nativewind: "NativeWind",
    uniwind: "Uniwind",
    tamagui: "Tamagui",
    unistyles: "Unistyles",
    stylesheets: "StyleSheets",
    vanilla: "Vanilla CSS",
  };
  return names[styling];
}

function getStateDisplayName(state: StateManagement): string {
  const names: Record<StateManagement, string> = {
    zustand: "Zustand",
    jotai: "Jotai",
    "tanstack-query": "TanStack Query",
  };
  return names[state];
}

function getORMDisplayName(orm: ORM): string {
  const names: Record<ORM, string> = {
    drizzle: "Drizzle",
    prisma: "Prisma",
    none: "None",
  };
  return names[orm];
}

function getBackendDisplayName(backend: Backend): string {
  const names: Record<Backend, string> = {
    supabase: "Supabase",
    firebase: "Firebase",
    convex: "Convex",
    custom: "Custom Backend",
  };
  return names[backend];
}

function getAuthDisplayName(auth: AuthProvider): string {
  const names: Record<AuthProvider, string> = {
    "better-auth": "better-auth",
    clerk: "Clerk",
    "supabase-auth": "Supabase Auth",
  };
  return names[auth];
}

/**
 * Check if a feature was selected
 */
export function hasFeature(
  features: FeaturesResult,
  feature: keyof FeaturesResult
): boolean {
  const value = features[feature];
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (value === "none") return false;
  return true;
}

/**
 * Get features that require additional configuration
 */
export function getFeaturesRequiringSetup(features: FeaturesResult): string[] {
  const requiring: string[] = [];

  if (features.backend === "supabase") {
    requiring.push("Supabase project setup (SUPABASE_URL, SUPABASE_ANON_KEY)");
  }
  if (features.backend === "firebase") {
    requiring.push("Firebase project setup (firebaseConfig)");
  }
  if (features.backend === "convex") {
    requiring.push("Convex project setup (npx convex dev)");
  }
  if (features.auth === "clerk") {
    requiring.push("Clerk application setup (CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY)");
  }
  if (features.orm === "drizzle" || features.orm === "prisma") {
    requiring.push("Database connection setup (DATABASE_URL)");
  }

  return requiring;
}
