/**
 * Compatibility module exports
 *
 * This module provides framework/feature compatibility rules, option filtering,
 * and validation logic for stack configurations.
 *
 * @module compatibility
 */

// ============================================================================
// Matrix exports
// ============================================================================

export type {
  Target,
  Platform,
  Framework,
  Styling,
  StateManagement,
  ORM,
  Backend,
  AuthProvider,
  Linter,
  Formatter,
  UnitTestFramework,
  E2ETestFramework,
  DeploymentTarget,
  PreCommitTool,
  Bundler,
  Routing,
  PlatformConfig,
  FrameworkConfig,
  IncompatibilityRule,
  EdgeCompatibility,
  StylingCompatibility,
  TestingCompatibility,
  LinterConfig,
  FormatterConfig,
  DefaultRecommendations,
  SkillDefinition,
  SkillsByStack,
} from './matrix.js';

export {
  PLATFORMS,
  FRAMEWORKS,
  INCOMPATIBILITY_RULES,
  EDGE_COMPATIBILITY,
  STYLING_COMPATIBILITY,
  TESTING_COMPATIBILITY,
  LINTERS,
  FORMATTERS,
  DEFAULTS,
  SKILLS_MATRIX,
  derivePlatformFromTargets,
  hasMobileTargets,
  hasWebTarget,
  getMobileTargets,
  validateTargetSelection,
  getFrameworksForPlatform,
  getFrameworksForTargets,
  getFrameworkConfig,
  areSelectionsCompatible,
  getIncompatibleOptions,
  getStylingForPlatform,
  getRecommendedStyling,
  checkEdgeORMCompatibility,
  getSkillsForConfig,
} from './matrix.js';

// ============================================================================
// Filter exports
// ============================================================================

export type {
  WizardSelections,
  FilteredOption,
} from './filters.js';

export {
  getAvailableFrameworks,
  getAvailableFrameworksForTargets,
  getAvailableStyling,
  getAvailableStateManagement,
  getAvailableORM,
  getAvailableBackend,
  getAvailableAuth,
  getAvailableLinters,
  shouldShowFormatterQuestion,
  getAvailableFormatters,
  getAvailableUnitTesting,
  getAvailableE2ETesting,
  getAvailableDeployment,
  filterOptions,
  validateSelections,
} from './filters.js';

// ============================================================================
// Validator exports
// ============================================================================

export type {
  ValidationResult,
  ValidationWarning,
  ValidationError,
  PrerequisiteCheck,
} from './validators.js';

export {
  isEdgeDeployment,
  validateEdgeORMCompatibility,
  validateLinterFormatterCombination,
  validateAuthBackendCombination,
  validateFrameworkPlatform,
  validateMobileE2ETesting,
  checkReactNativePrerequisites,
  validateAllSelections,
  generatePostSelectionWarnings,
  validateSkillAvailability,
  checkIsEdgeDeployment,
  EDGE_DEPLOYMENTS,
} from './validators.js';
