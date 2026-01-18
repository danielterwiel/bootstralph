/**
 * API Key Detector Utility
 *
 * Detects available API keys from environment variables for Pair Vibe Mode.
 * Validates key format without making API calls.
 *
 * Based on review-001 findings:
 * - Environment variables only (no config files for security)
 * - Anthropic keys: sk-ant-* prefix
 * - OpenAI keys: sk-* prefix (but not sk-ant-*)
 * - This matches standard patterns used by both Anthropic and OpenAI SDKs
 */

/**
 * Supported API providers for Pair Vibe Mode
 */
export type ApiProvider = "anthropic" | "openai";

/**
 * Result of validating a single API key
 */
export interface ApiKeyValidation {
  /** Whether the key exists in the environment */
  exists: boolean;
  /** Whether the key format is valid (if it exists) */
  validFormat: boolean;
  /** The environment variable name */
  envVar: string;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Result of detecting all available API keys
 */
export interface ApiKeyDetectionResult {
  /** Available providers with valid API keys */
  availableProviders: ApiProvider[];
  /** Validation results per provider */
  validations: Record<ApiProvider, ApiKeyValidation>;
  /** Whether Pair Vibe Mode can be enabled (2+ providers available) */
  canEnablePairVibe: boolean;
  /** Summary message for user display */
  summary: string;
}

/**
 * Environment variable names for each provider
 */
const API_KEY_ENV_VARS: Record<ApiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

/**
 * Validate Anthropic API key format
 * Keys should start with sk-ant-
 */
function validateAnthropicKeyFormat(key: string): boolean {
  // Anthropic keys start with sk-ant-api03- or similar sk-ant- prefix
  return key.startsWith("sk-ant-") && key.length > 20;
}

/**
 * Validate OpenAI API key format
 * Keys should start with sk- but NOT sk-ant- (which would be Anthropic)
 */
function validateOpenAIKeyFormat(key: string): boolean {
  // OpenAI keys start with sk- but not sk-ant- (which is Anthropic)
  // They can also start with sk-proj- for project keys
  return key.startsWith("sk-") && !key.startsWith("sk-ant-") && key.length > 20;
}

/**
 * Validate API key format for a given provider
 */
function validateKeyFormat(provider: ApiProvider, key: string): boolean {
  switch (provider) {
    case "anthropic":
      return validateAnthropicKeyFormat(key);
    case "openai":
      return validateOpenAIKeyFormat(key);
    default:
      return false;
  }
}

/**
 * Validate a single API key from the environment
 */
export function validateApiKey(provider: ApiProvider): ApiKeyValidation {
  const envVar = API_KEY_ENV_VARS[provider];
  const key = process.env[envVar];

  if (!key) {
    return {
      exists: false,
      validFormat: false,
      envVar,
      error: `${envVar} not set`,
    };
  }

  if (key.trim() === "") {
    return {
      exists: true,
      validFormat: false,
      envVar,
      error: `${envVar} is empty`,
    };
  }

  const validFormat = validateKeyFormat(provider, key);

  if (!validFormat) {
    return {
      exists: true,
      validFormat: false,
      envVar,
      error: `${envVar} has invalid format`,
    };
  }

  return {
    exists: true,
    validFormat: true,
    envVar,
  };
}

/**
 * Detect all available API keys from the environment
 *
 * @returns Detection result with available providers and validation details
 */
export function detectApiKeys(): ApiKeyDetectionResult {
  const providers: ApiProvider[] = ["anthropic", "openai"];
  const validations: Record<ApiProvider, ApiKeyValidation> = {} as Record<
    ApiProvider,
    ApiKeyValidation
  >;
  const availableProviders: ApiProvider[] = [];

  for (const provider of providers) {
    const validation = validateApiKey(provider);
    validations[provider] = validation;

    if (validation.exists && validation.validFormat) {
      availableProviders.push(provider);
    }
  }

  const canEnablePairVibe = availableProviders.length >= 2;

  // Build summary message
  let summary: string;
  if (availableProviders.length === 0) {
    summary = "No valid API keys detected. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.";
  } else if (availableProviders.length === 1) {
    summary = `Only ${availableProviders[0]} API key detected. Add another provider for Pair Vibe Mode.`;
  } else {
    summary = `${availableProviders.length} providers available: ${availableProviders.join(", ")}. Pair Vibe Mode ready.`;
  }

  return {
    availableProviders,
    validations,
    canEnablePairVibe,
    summary,
  };
}

/**
 * Check if a specific provider's API key is available and valid
 */
export function hasValidApiKey(provider: ApiProvider): boolean {
  const validation = validateApiKey(provider);
  return validation.exists && validation.validFormat;
}

/**
 * Get all providers with valid API keys
 */
export function getAvailableProviders(): ApiProvider[] {
  return detectApiKeys().availableProviders;
}

/**
 * Check if Pair Vibe Mode can be enabled (requires 2+ providers)
 */
export function canEnablePairVibeMode(): boolean {
  return detectApiKeys().canEnablePairVibe;
}

/**
 * Get the environment variable name for a provider
 */
export function getEnvVarName(provider: ApiProvider): string {
  return API_KEY_ENV_VARS[provider];
}
