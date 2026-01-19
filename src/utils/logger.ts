/**
 * Logger utilities wrapping @clack/prompts for consistent CLI output
 *
 * Provides a clean API for common CLI interactions:
 * - intro/outro: Start and end CLI sections
 * - spinner: Show loading state with start/stop/message methods
 * - log: Info, success, warning, and error messages
 * - confirm: Yes/no prompts
 * - select: Single-choice selection
 * - multiselect: Multi-choice selection
 */

import * as p from "@clack/prompts";

// ============================================================================
// Re-exports for intro/outro
// ============================================================================

/**
 * Display an intro message at the start of a CLI operation
 * @param message - The message to display
 */
export const intro = p.intro;

/**
 * Display an outro message at the end of a CLI operation
 * @param message - The message to display
 */
export const outro = p.outro;

/**
 * Display a cancel message when operation is cancelled
 * @param message - The message to display
 */
export const cancel = p.cancel;

/**
 * Display a note with a title and body
 * @param message - The body of the note
 * @param title - The title of the note
 */
export const note = p.note;

// ============================================================================
// Spinner
// ============================================================================

/**
 * Create a spinner for showing loading state
 * @returns Spinner with start/stop/message methods
 */
export const spinner = p.spinner;

/**
 * Shorthand function to run an async operation with a spinner
 * @param message - The message to display while loading
 * @param fn - The async function to run
 * @returns The result of the async function
 */
export async function spin<T>(
  message: string,
  fn: () => Promise<T>
): Promise<T> {
  const s = p.spinner();
  s.start(message);
  try {
    const result = await fn();
    s.stop(message);
    return result;
  } catch (error) {
    s.stop(message);
    throw error;
  }
}

// ============================================================================
// Logging
// ============================================================================

/**
 * Log messages with different severity levels
 */
export const log = {
  /**
   * Log an informational message
   * @param message - The message to display
   */
  info: (message: string): void => {
    p.log.info(message);
  },

  /**
   * Log a success message
   * @param message - The message to display
   */
  success: (message: string): void => {
    p.log.success(message);
  },

  /**
   * Log a warning message
   * @param message - The message to display
   */
  warn: (message: string): void => {
    p.log.warn(message);
  },

  /**
   * Log an error message
   * @param message - The message to display
   */
  error: (message: string): void => {
    p.log.error(message);
  },

  /**
   * Log a message without any special formatting
   * @param message - The message to display
   */
  message: (message: string): void => {
    p.log.message(message);
  },
};

// ============================================================================
// Prompts
// ============================================================================

/**
 * Options for confirm prompt
 */
export interface ConfirmOptions {
  message: string;
  initialValue?: boolean;
  active?: string;
  inactive?: string;
}

/**
 * Prompt user for yes/no confirmation
 * @param options - Confirm prompt options
 * @returns boolean if confirmed, symbol if cancelled
 */
export const confirm = p.confirm;

/**
 * Check if a prompt result was cancelled
 * @param value - The value to check
 * @returns true if the value is a cancel symbol
 */
export const isCancel = p.isCancel;

/**
 * Options for select prompt
 */
export interface SelectOptions<T extends string | number | symbol> {
  message: string;
  options: Array<{
    value: T;
    label: string;
    hint?: string;
  }>;
  initialValue?: T;
  maxItems?: number;
}

/**
 * Prompt user to select a single option
 * @param options - Select prompt options
 * @returns The selected value or cancel symbol
 */
export const select = p.select;

/**
 * Options for multiselect prompt
 */
export interface MultiSelectOptions<T extends string | number | symbol> {
  message: string;
  options: Array<{
    value: T;
    label: string;
    hint?: string;
  }>;
  initialValues?: T[];
  required?: boolean;
  cursorAt?: T;
}

/**
 * Prompt user to select multiple options
 * @param options - Multi-select prompt options
 * @returns Array of selected values or cancel symbol
 */
export const multiselect = p.multiselect;

/**
 * Prompt user for text input
 * @param options - Text input options
 * @returns The entered text or cancel symbol
 */
export const text = p.text;

/**
 * Prompt user for password input (hidden)
 * @param options - Password input options
 * @returns The entered password or cancel symbol
 */
export const password = p.password;
