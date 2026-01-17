/**
 * Combination validators for the wizard
 * Validates complex compatibility scenarios that require checking multiple selections together
 */

import {
  type Platform,
  type Framework,
  type ORM,
  type DeploymentTarget,
  type Linter,
  type Formatter,
  type AuthProvider,
  type Backend,
  EDGE_COMPATIBILITY,
  FRAMEWORKS,
  INCOMPATIBILITY_RULES,
} from './matrix.js';
import type { WizardSelections } from './filters.js';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
  errors: ValidationError[];
}

export interface ValidationWarning {
  code: string;
  message: string;
  suggestion?: string;
  affectedFields: string[];
}

export interface ValidationError {
  code: string;
  message: string;
  affectedFields: string[];
}

// ============================================================================
// Edge Runtime Validators
// ============================================================================

/**
 * Edge runtime deployment targets that require special ORM handling
 */
const EDGE_DEPLOYMENTS: DeploymentTarget[] = ['cloudflare', 'vercel', 'netlify'];

/**
 * Check if deployment target uses edge runtime
 */
export function isEdgeDeployment(deployment: DeploymentTarget): boolean {
  return EDGE_DEPLOYMENTS.includes(deployment);
}

/**
 * Validate ORM + Edge deployment compatibility
 * Returns warnings/suggestions if Prisma is used with edge runtime
 */
export function validateEdgeORMCompatibility(
  orm: ORM | undefined,
  deployment: DeploymentTarget | undefined
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    warnings: [],
    errors: [],
  };

  if (!orm || !deployment || orm === 'none') {
    return result;
  }

  // Check if this is an edge deployment
  if (!isEdgeDeployment(deployment)) {
    return result;
  }

  const edgeConfig = EDGE_COMPATIBILITY.find((e) => e.platform === deployment);
  if (!edgeConfig) {
    return result;
  }

  // Check Prisma edge compatibility
  if (orm === 'prisma') {
    const prismaConfig = edgeConfig.ormSupport.prisma;
    if (prismaConfig.requirements.length > 0) {
      result.warnings.push({
        code: 'EDGE_PRISMA_REQUIREMENTS',
        message: `Prisma requires additional setup for ${getDeploymentName(deployment)} edge runtime`,
        suggestion: `Required: ${prismaConfig.requirements.join(' or ')}. Consider using Drizzle for simpler edge deployment.`,
        affectedFields: ['orm', 'deployment'],
      });
    }
    if (!prismaConfig.supported) {
      result.errors.push({
        code: 'EDGE_PRISMA_UNSUPPORTED',
        message: `Prisma is not fully supported on ${getDeploymentName(deployment)}`,
        affectedFields: ['orm', 'deployment'],
      });
      result.valid = false;
    }
  }

  // Check Drizzle edge driver requirements (informational)
  if (orm === 'drizzle') {
    const drizzleConfig = edgeConfig.ormSupport.drizzle;
    if (drizzleConfig.drivers.length > 0 && drizzleConfig.drivers[0] !== 'All drivers') {
      result.warnings.push({
        code: 'EDGE_DRIZZLE_DRIVERS',
        message: `For ${getDeploymentName(deployment)} edge runtime, use compatible database drivers`,
        suggestion: `Compatible drivers: ${drizzleConfig.drivers.join(', ')}`,
        affectedFields: ['orm', 'deployment'],
      });
    }
  }

  return result;
}

function getDeploymentName(deployment: DeploymentTarget): string {
  switch (deployment) {
    case 'cloudflare':
      return 'Cloudflare Workers';
    case 'vercel':
      return 'Vercel Edge';
    case 'netlify':
      return 'Netlify Edge';
    default:
      return deployment;
  }
}

// ============================================================================
// Linter + Formatter Validators
// ============================================================================

/**
 * Validate linter and formatter combination
 * Ensures Biome users don't also select a separate formatter
 */
export function validateLinterFormatterCombination(
  linter: Linter | undefined,
  formatter: Formatter | undefined
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    warnings: [],
    errors: [],
  };

  if (!linter || !formatter) {
    return result;
  }

  // Biome includes its own formatter
  if (linter === 'biome' && formatter !== 'biome') {
    result.warnings.push({
      code: 'BIOME_INCLUDES_FORMATTER',
      message: 'Biome already includes formatting capabilities',
      suggestion: 'Using Biome for both linting and formatting is recommended',
      affectedFields: ['linter', 'formatter'],
    });
  }

  // Check for redundant oxlint + oxfmt combination (both from Oxc)
  if (linter === 'oxlint' && formatter === 'oxfmt') {
    // This is actually a valid and recommended combination
  }

  return result;
}

// ============================================================================
// Auth + Backend Validators
// ============================================================================

/**
 * Validate auth provider + backend compatibility
 * Warns when using Supabase Auth without Supabase backend (suboptimal)
 */
export function validateAuthBackendCombination(
  auth: AuthProvider | undefined,
  backend: Backend | undefined
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    warnings: [],
    errors: [],
  };

  if (!auth || !backend) {
    return result;
  }

  // Supabase Auth works best with Supabase backend
  if (auth === 'supabase-auth' && backend !== 'supabase') {
    result.warnings.push({
      code: 'SUPABASE_AUTH_WITHOUT_BACKEND',
      message: 'Supabase Auth works best when paired with Supabase backend',
      suggestion: 'Consider using better-auth or Clerk for non-Supabase backends',
      affectedFields: ['auth', 'backend'],
    });
  }

  // When using Supabase backend, Supabase Auth provides best integration
  if (backend === 'supabase' && auth !== 'supabase-auth') {
    result.warnings.push({
      code: 'SUPABASE_BACKEND_WITHOUT_AUTH',
      message: 'Using Supabase backend without Supabase Auth',
      suggestion:
        'Supabase Auth provides tight integration with RLS (Row Level Security) for database-level authorization',
      affectedFields: ['auth', 'backend'],
    });
  }

  return result;
}

// ============================================================================
// Framework + Platform Validators
// ============================================================================

/**
 * Validate that framework is appropriate for selected platform
 */
export function validateFrameworkPlatform(
  framework: Framework | undefined,
  platform: Platform | undefined
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    warnings: [],
    errors: [],
  };

  if (!framework || !platform) {
    return result;
  }

  const frameworkConfig = FRAMEWORKS[framework];

  if (!frameworkConfig.platform.includes(platform)) {
    result.errors.push({
      code: 'FRAMEWORK_PLATFORM_MISMATCH',
      message: `${frameworkConfig.name} is not compatible with ${platform} platform`,
      affectedFields: ['framework', 'platform'],
    });
    result.valid = false;
  }

  return result;
}

// ============================================================================
// Mobile E2E Testing Validators
// ============================================================================

/**
 * Validate that mobile frameworks don't use web E2E testing tools
 */
export function validateMobileE2ETesting(
  framework: Framework | undefined,
  e2eTesting: string | undefined
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    warnings: [],
    errors: [],
  };

  if (!framework || !e2eTesting) {
    return result;
  }

  const mobileFrameworks: Framework[] = ['expo', 'react-native-cli'];
  const webE2ETools = ['playwright', 'cypress'];

  if (mobileFrameworks.includes(framework) && webE2ETools.includes(e2eTesting)) {
    result.errors.push({
      code: 'MOBILE_WEB_E2E',
      message: `${e2eTesting} cannot be used for mobile E2E testing`,
      affectedFields: ['framework', 'e2eTesting'],
    });
    result.valid = false;
  }

  return result;
}

// ============================================================================
// React Native Prerequisites
// ============================================================================

export interface PrerequisiteCheck {
  name: string;
  available: boolean;
  required: boolean;
  instructions?: string;
}

/**
 * Check if React Native CLI prerequisites are met
 * Returns information about Xcode and Android Studio availability
 */
export function checkReactNativePrerequisites(): {
  ready: boolean;
  checks: PrerequisiteCheck[];
} {
  // These checks would be run at runtime using process.env and execa
  // For now, return a template structure
  return {
    ready: false, // Will be updated at runtime
    checks: [
      {
        name: 'Xcode',
        available: false, // Check via: xcode-select -p
        required: true,
        instructions: 'Install Xcode from the Mac App Store',
      },
      {
        name: 'Android SDK',
        available: false, // Check via: $ANDROID_HOME
        required: true,
        instructions: 'Install Android Studio and set ANDROID_HOME environment variable',
      },
      {
        name: 'CocoaPods',
        available: false, // Check via: which pod
        required: true,
        instructions: 'Run: sudo gem install cocoapods',
      },
    ],
  };
}

// ============================================================================
// Complete Validation
// ============================================================================

/**
 * Run all validators on complete wizard selections
 * Returns combined validation result
 */
export function validateAllSelections(selections: WizardSelections): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    warnings: [],
    errors: [],
  };

  // Run individual validators
  const validators = [
    () =>
      validateEdgeORMCompatibility(selections.orm, selections.deployment),
    () =>
      validateLinterFormatterCombination(selections.linter, selections.formatter),
    () =>
      validateAuthBackendCombination(selections.auth, selections.backend),
    () => validateFrameworkPlatform(selections.framework, selections.platform),
    () => validateMobileE2ETesting(selections.framework, selections.e2eTesting),
  ];

  for (const validator of validators) {
    const validatorResult = validator();
    result.warnings.push(...validatorResult.warnings);
    result.errors.push(...validatorResult.errors);
    if (!validatorResult.valid) {
      result.valid = false;
    }
  }

  // Also check incompatibility rules
  const incompatibilityResult = validateIncompatibilityRules(selections);
  result.warnings.push(...incompatibilityResult.warnings);
  result.errors.push(...incompatibilityResult.errors);
  if (!incompatibilityResult.valid) {
    result.valid = false;
  }

  return result;
}

/**
 * Check all incompatibility rules against selections
 */
function validateIncompatibilityRules(selections: WizardSelections): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    warnings: [],
    errors: [],
  };

  const selectionEntries = Object.entries(selections).filter(
    ([, value]) => value !== undefined
  ) as [string, string][];

  for (const rule of INCOMPATIBILITY_RULES) {
    // Find if both parts of the rule are in selections
    const ifMatch = selectionEntries.find(
      ([key, value]) => key === rule.if.key && value === rule.if.value
    );
    const cannotUseMatch = selectionEntries.find(
      ([key, value]) => key === rule.cannotUse.key && value === rule.cannotUse.value
    );

    if (ifMatch && cannotUseMatch) {
      result.errors.push({
        code: `INCOMPATIBLE_${rule.id.toUpperCase().replace(/-/g, '_')}`,
        message: `${rule.if.value} and ${rule.cannotUse.value} cannot be used together: ${rule.reason}`,
        affectedFields: [rule.if.key, rule.cannotUse.key],
      });
      result.valid = false;
    }
  }

  return result;
}

// ============================================================================
// Post-Selection Warnings
// ============================================================================

/**
 * Generate post-selection warnings for display to user
 * These are informational messages that don't block the wizard
 */
export function generatePostSelectionWarnings(selections: WizardSelections): string[] {
  const warnings: string[] = [];

  // Warn about alpha tools
  if (selections.formatter === 'oxfmt') {
    warnings.push(
      '⚠️  oxfmt is in alpha (95%+ Prettier compatible). Consider Prettier for 100% stability.'
    );
  }

  // Warn about RSC not being supported
  if (selections.framework === 'tanstack-start') {
    warnings.push(
      '📝 TanStack Start does not yet support React Server Components. RSC is coming in a future release.'
    );
  }

  // Warn about React Native CLI prerequisites
  if (selections.framework === 'react-native-cli') {
    warnings.push(
      '⚠️  React Native CLI requires Xcode (iOS) and Android Studio (Android). Estimated setup: ~1 hour.'
    );
  }

  // Inform about EAS build alternatives
  if (
    selections.deployment === 'eas' &&
    (selections.framework === 'expo' || selections.framework === 'react-native-cli')
  ) {
    warnings.push(
      '💡 Tip: Use `eas build --local` for unlimited free builds on your own hardware.'
    );
  }

  // Prisma + edge deployment warning
  if (
    selections.orm === 'prisma' &&
    selections.deployment &&
    isEdgeDeployment(selections.deployment)
  ) {
    warnings.push(
      '⚠️  Prisma on edge requires Prisma Accelerate. Consider Drizzle for simpler edge deployment.'
    );
  }

  return warnings;
}

// ============================================================================
// Skill Validation
// ============================================================================

/**
 * Validate that required skills exist for the selected stack
 * Returns warnings if any recommended skills are missing from installation
 */
export function validateSkillAvailability(
  selectedSkills: string[],
  recommendedSkills: string[]
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    warnings: [],
    errors: [],
  };

  const missingSkills = recommendedSkills.filter(
    (skill) => !selectedSkills.includes(skill)
  );

  if (missingSkills.length > 0) {
    result.warnings.push({
      code: 'MISSING_RECOMMENDED_SKILLS',
      message: `Some recommended skills are not being installed: ${missingSkills.join(', ')}`,
      suggestion: 'These skills can improve Claude Code performance for your stack',
      affectedFields: ['skills'],
    });
  }

  return result;
}

// ============================================================================
// Exports for external use
// ============================================================================

export {
  isEdgeDeployment as checkIsEdgeDeployment,
  EDGE_DEPLOYMENTS,
};
