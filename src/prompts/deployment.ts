/**
 * Deployment selection prompt
 * Fourth step in the wizard - select deployment target based on framework
 * Uses filtering logic to show only compatible options
 * Includes edge runtime validation for ORM compatibility
 * Supports multi-select for universal apps (web + mobile)
 */

import * as p from "@clack/prompts";
import {
  type Target,
  type Framework,
  type DeploymentTarget,
  type ORM,
  FRAMEWORKS,
  checkEdgeORMCompatibility,
} from "../compatibility/matrix.js";
import {
  getAvailableDeployment,
  type FilteredOption,
} from "../compatibility/filters.js";

// ============================================================================
// Types
// ============================================================================

export interface DeploymentResult {
  deployment: DeploymentTarget;
  deployments?: DeploymentTarget[]; // For multi-platform projects
  edgeWarning?: string;
}

export interface DeploymentPromptContext {
  framework: Framework;
  orm?: ORM;
  targets?: Target[]; // For multi-platform deployment selection
}

// ============================================================================
// Main Prompt Function
// ============================================================================

/**
 * Prompt user to select deployment target(s) for their project
 * Shows only compatible options based on framework
 * For universal apps (web + mobile), allows multi-select
 * Validates edge runtime ORM compatibility after selection
 * Returns the selected deployment(s) or undefined if cancelled
 */
export async function promptDeployment(
  context: DeploymentPromptContext
): Promise<DeploymentResult | undefined> {
  const { framework, orm, targets } = context;

  const availableOptions = getAvailableDeployment({ framework });

  if (availableOptions.length === 0) {
    return undefined;
  }

  // Check if this is a universal app that needs multiple deployment targets
  const isUniversal = targets && targets.includes('web') &&
    (targets.includes('ios') || targets.includes('android'));

  // For universal apps, use multi-select to allow both web and mobile deployments
  if (isUniversal) {
    return promptMultiDeployment(context, availableOptions);
  }

  // Auto-select if only one option
  if (availableOptions.length === 1) {
    const deployment = availableOptions[0]!;
    p.log.info(`Auto-selected deployment: ${deployment.label}`);
    return { deployment: deployment.value };
  }

  const options = buildSelectOptions(availableOptions);
  const recommended = availableOptions.find((o) => o.recommended);
  const initialValue = recommended?.value ?? availableOptions[0]!.value;

  const result = await p.select<DeploymentTarget>({
    message: "Where would you like to deploy?",
    options,
    initialValue,
  });

  if (p.isCancel(result)) {
    return undefined;
  }

  const deployment = result as DeploymentTarget;

  // Check edge runtime compatibility if ORM is selected
  if (orm && orm !== "none") {
    const edgeWarning = validateEdgeCompatibility(deployment, orm);
    if (edgeWarning) {
      p.log.warn(edgeWarning);
      return { deployment, edgeWarning };
    }
  }

  return { deployment };
}

/**
 * Prompt for multiple deployment targets (for universal apps)
 */
async function promptMultiDeployment(
  context: DeploymentPromptContext,
  availableOptions: FilteredOption<DeploymentTarget>[]
): Promise<DeploymentResult | undefined> {
  const { orm } = context;

  // Categorize deployment options
  const webDeployments: DeploymentTarget[] = ['vercel', 'netlify', 'cloudflare', 'fly-io', 'railway', 'render'];
  const mobileDeployments: DeploymentTarget[] = ['eas', 'local-builds', 'fastlane', 'codemagic'];

  const webOptions = availableOptions.filter(o => webDeployments.includes(o.value));
  const mobileOptions = availableOptions.filter(o => mobileDeployments.includes(o.value));

  // Build combined options with category hints
  const options = availableOptions.map((opt) => {
    const isWeb = webDeployments.includes(opt.value);
    const isMobile = mobileDeployments.includes(opt.value);
    const category = isWeb ? '(Web)' : isMobile ? '(Mobile)' : '';

    const option: { value: DeploymentTarget; label: string; hint?: string } = {
      value: opt.value,
      label: opt.recommended ? `${opt.label} ${category} (Recommended)` : `${opt.label} ${category}`,
    };
    if (opt.description) {
      option.hint = opt.description;
    }
    return option;
  });

  // Pre-select recommended web + mobile deployment
  const initialValues: DeploymentTarget[] = [];
  const recommendedWeb = webOptions.find(o => o.recommended)?.value ?? webOptions[0]?.value;
  const recommendedMobile = mobileOptions.find(o => o.recommended)?.value ?? mobileOptions[0]?.value;
  if (recommendedWeb) initialValues.push(recommendedWeb);
  if (recommendedMobile) initialValues.push(recommendedMobile);

  p.log.info('Universal apps can deploy to both web and mobile platforms');

  const result = await p.multiselect({
    message: "Select deployment targets (Space to select, Enter to confirm)",
    options,
    initialValues,
    required: true,
  });

  if (p.isCancel(result)) {
    return undefined;
  }

  const deployments = result as DeploymentTarget[];

  // Use the first deployment as primary, store all in deployments array
  const primaryDeployment = deployments[0]!;

  // Check edge runtime compatibility for web deployments
  let edgeWarning: string | undefined;
  if (orm && orm !== "none") {
    for (const deployment of deployments) {
      if (webDeployments.includes(deployment)) {
        const warning = validateEdgeCompatibility(deployment, orm);
        if (warning) {
          edgeWarning = warning;
          p.log.warn(warning);
          break;
        }
      }
    }
  }

  const deploymentResult: DeploymentResult = {
    deployment: primaryDeployment,
    deployments,
  };

  if (edgeWarning) {
    deploymentResult.edgeWarning = edgeWarning;
  }

  return deploymentResult;
}

// ============================================================================
// Edge Runtime Validation
// ============================================================================

/**
 * Check if ORM is compatible with edge deployment target
 * Returns warning message if there are compatibility issues
 */
function validateEdgeCompatibility(
  deployment: DeploymentTarget,
  orm: ORM
): string | undefined {
  // Only check edge platforms
  const edgePlatforms: DeploymentTarget[] = ["cloudflare", "vercel", "netlify"];

  if (!edgePlatforms.includes(deployment)) {
    return undefined;
  }

  const compatibility = checkEdgeORMCompatibility(orm, deployment);

  if (!compatibility.compatible) {
    return getEdgeIncompatibilityMessage(deployment, orm);
  }

  if (compatibility.requirements && compatibility.requirements.length > 0) {
    return getEdgeRequirementsMessage(deployment, orm, compatibility.requirements);
  }

  return undefined;
}

/**
 * Get warning message for edge ORM incompatibility
 */
function getEdgeIncompatibilityMessage(
  deployment: DeploymentTarget,
  orm: ORM
): string {
  const platformName = getDeploymentDisplayName(deployment);
  const ormName = orm === "prisma" ? "Prisma" : "Drizzle";

  return `${ormName} has limited support on ${platformName} Edge. Consider using Drizzle with edge-compatible drivers instead.`;
}

/**
 * Get warning message for edge ORM requirements
 */
function getEdgeRequirementsMessage(
  deployment: DeploymentTarget,
  orm: ORM,
  requirements: string[]
): string {
  const platformName = getDeploymentDisplayName(deployment);
  const ormName = orm === "prisma" ? "Prisma" : "Drizzle";
  const reqList = requirements.join(" or ");

  if (orm === "prisma") {
    return `${ormName} on ${platformName} Edge requires ${reqList}. Alternatively, consider using Drizzle with edge-compatible drivers.`;
  }

  return `${ormName} on ${platformName} works best with: ${reqList}`;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build select options with proper typing for @clack/prompts
 */
function buildSelectOptions(
  options: FilteredOption<DeploymentTarget>[]
): Array<{ value: DeploymentTarget; label: string; hint?: string }> {
  return options.map((opt) => {
    const option: { value: DeploymentTarget; label: string; hint?: string } = {
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
 * Get display name for deployment target
 */
function getDeploymentDisplayName(deployment: DeploymentTarget): string {
  const names: Record<DeploymentTarget, string> = {
    vercel: "Vercel",
    netlify: "Netlify",
    cloudflare: "Cloudflare",
    "fly-io": "Fly.io",
    railway: "Railway",
    render: "Render",
    eas: "EAS Build",
    "local-builds": "Local Builds",
    fastlane: "Fastlane",
    codemagic: "Codemagic",
  };
  return names[deployment];
}

/**
 * Get a summary of deployment selection for display
 */
export function getDeploymentSummary(result: DeploymentResult): string[] {
  const summary: string[] = [];
  summary.push(`Deploy: ${getDeploymentDisplayName(result.deployment)}`);

  if (result.edgeWarning) {
    summary.push(`Note: ${result.edgeWarning}`);
  }

  return summary;
}

/**
 * Check if deployment target is an edge platform
 */
export function isEdgePlatform(deployment: DeploymentTarget): boolean {
  return ["cloudflare", "vercel", "netlify"].includes(deployment);
}

/**
 * Check if deployment target is for mobile apps
 */
export function isMobileDeployment(deployment: DeploymentTarget): boolean {
  return ["eas", "local-builds", "fastlane", "codemagic"].includes(deployment);
}

/**
 * Get additional configuration requirements for a deployment target
 */
export function getDeploymentRequirements(deployment: DeploymentTarget): string[] {
  const requirements: string[] = [];

  switch (deployment) {
    case "vercel":
      requirements.push("Vercel account (vercel.com)");
      requirements.push("Optional: VERCEL_TOKEN for CI/CD");
      break;
    case "netlify":
      requirements.push("Netlify account (netlify.com)");
      requirements.push("Optional: NETLIFY_AUTH_TOKEN for CI/CD");
      break;
    case "cloudflare":
      requirements.push("Cloudflare account (cloudflare.com)");
      requirements.push("Wrangler CLI (npm i -g wrangler)");
      requirements.push("Optional: CLOUDFLARE_API_TOKEN for CI/CD");
      break;
    case "fly-io":
      requirements.push("Fly.io account (fly.io)");
      requirements.push("Fly CLI (flyctl)");
      requirements.push("fly.toml configuration");
      break;
    case "railway":
      requirements.push("Railway account (railway.app)");
      requirements.push("Optional: RAILWAY_TOKEN for CI/CD");
      break;
    case "render":
      requirements.push("Render account (render.com)");
      requirements.push("render.yaml configuration");
      break;
    case "eas":
      requirements.push("Expo account (expo.dev)");
      requirements.push("EAS CLI (npm i -g eas-cli)");
      requirements.push("eas.json configuration");
      requirements.push("Apple Developer / Google Play accounts for production");
      break;
    case "local-builds":
      requirements.push("Xcode (for iOS) - Mac only");
      requirements.push("Android Studio + SDK (for Android)");
      requirements.push("EAS CLI for eas build --local");
      break;
    case "fastlane":
      requirements.push("Ruby 2.5+ installed");
      requirements.push("Fastlane gem (gem install fastlane)");
      requirements.push("Xcode (iOS) / Android Studio (Android)");
      requirements.push("App Store Connect / Google Play credentials");
      break;
    case "codemagic":
      requirements.push("Codemagic account (codemagic.io)");
      requirements.push("codemagic.yaml configuration");
      requirements.push("Apple Developer / Google Play accounts for production");
      break;
  }

  return requirements;
}

/**
 * Get the scaffold command additions needed for a deployment target
 */
export function getDeploymentScaffoldAdditions(
  framework: Framework,
  deployment: DeploymentTarget
): string[] {
  const additions: string[] = [];
  const frameworkConfig = FRAMEWORKS[framework];

  // Cloudflare specific
  if (deployment === "cloudflare") {
    if (framework === "hono") {
      additions.push("wrangler.toml");
    }
    if (framework === "astro") {
      additions.push("@astrojs/cloudflare adapter");
    }
    if (framework === "react-router") {
      additions.push("@react-router/cloudflare adapter");
    }
  }

  // Vercel specific
  if (deployment === "vercel") {
    if (framework === "tanstack-start") {
      additions.push("vercel.json (optional)");
    }
  }

  // Fly.io specific
  if (deployment === "fly-io") {
    additions.push("Dockerfile");
    additions.push("fly.toml");
  }

  // Railway specific
  if (deployment === "railway") {
    if (!frameworkConfig.bundler.includes("vite")) {
      additions.push("Dockerfile (optional)");
    }
  }

  // EAS specific
  if (deployment === "eas") {
    additions.push("eas.json");
    additions.push("app.json updates for EAS");
  }

  // Local builds specific
  if (deployment === "local-builds") {
    additions.push("eas.json with build profiles");
  }

  // Fastlane specific
  if (deployment === "fastlane") {
    additions.push("fastlane/Fastfile");
    additions.push("fastlane/Appfile");
    additions.push("fastlane/Matchfile (for iOS code signing)");
  }

  // Codemagic specific
  if (deployment === "codemagic") {
    additions.push("codemagic.yaml");
  }

  return additions;
}
