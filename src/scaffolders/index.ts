/**
 * Scaffolders module
 * Framework CLI wrappers for project scaffolding
 */

// ============================================================================
// Base types and utilities
// ============================================================================

export * from "./base.js";

// ============================================================================
// Framework scaffolders
// ============================================================================

export { scaffoldNextjs, type NextjsScaffoldOptions } from "./nextjs.js";
export { scaffoldTanStack, type TanStackScaffoldOptions } from "./tanstack.js";
export { scaffoldExpo, type ExpoScaffoldOptions } from "./expo.js";
export { scaffoldRNCli, type RNCliScaffoldOptions } from "./rn-cli.js";
export { scaffoldReactRouter, type ReactRouterScaffoldOptions } from "./react-router.js";
export { scaffoldAstro, type AstroScaffoldOptions } from "./astro.js";
export { scaffoldApi, type ApiScaffoldOptions, type ApiFramework } from "./api.js";
