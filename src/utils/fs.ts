/**
 * File system utilities wrapping fs-extra for consistent file operations
 *
 * Provides a clean API for common file operations:
 * - readJson/writeJson: Type-safe JSON file operations
 * - exists: Check if file/directory exists
 * - ensureDir: Ensure directory exists (create if needed)
 * - readFile/writeFile: Read and write text files
 */

import {
  readJson as fsReadJson,
  writeJson as fsWriteJson,
  pathExists,
  ensureDir as fsEnsureDir,
  readFile as fsReadFile,
  writeFile as fsWriteFile,
} from "fs-extra";

// ============================================================================
// JSON Operations
// ============================================================================

/**
 * Read and parse a JSON file with type safety
 *
 * @param filePath - Path to JSON file
 * @returns Promise resolving to parsed JSON data
 * @throws Error if file doesn't exist or JSON is invalid
 *
 * @example
 * ```typescript
 * interface PackageJson {
 *   name: string;
 *   version: string;
 * }
 *
 * const pkg = await readJson<PackageJson>("./package.json");
 * console.log(pkg.name);
 * ```
 */
export async function readJson<T = unknown>(filePath: string): Promise<T> {
  return fsReadJson(filePath) as Promise<T>;
}

/**
 * Write data to a JSON file with formatting
 *
 * @param filePath - Path to JSON file
 * @param data - Data to write
 * @param options - Write options (spaces for indentation)
 * @throws Error if write fails
 *
 * @example
 * ```typescript
 * await writeJson("./config.json", { debug: true }, { spaces: 2 });
 * ```
 */
export async function writeJson<T = unknown>(
  filePath: string,
  data: T,
  options: { spaces?: number } = { spaces: 2 }
): Promise<void> {
  return fsWriteJson(filePath, data, options);
}

// ============================================================================
// File/Directory Operations
// ============================================================================

/**
 * Check if a file or directory exists
 *
 * @param filePath - Path to check
 * @returns Promise resolving to true if exists, false otherwise
 *
 * @example
 * ```typescript
 * if (await exists("./config.json")) {
 *   console.log("Config file exists");
 * }
 * ```
 */
export async function exists(filePath: string): Promise<boolean> {
  return pathExists(filePath);
}

/**
 * Ensure a directory exists, creating it if necessary
 *
 * @param dirPath - Path to directory
 * @returns Promise resolving when directory exists
 * @throws Error if creation fails
 *
 * @example
 * ```typescript
 * await ensureDir("./dist/components");
 * // Directory now exists, safe to write files
 * ```
 */
export async function ensureDir(dirPath: string): Promise<void> {
  return fsEnsureDir(dirPath);
}

// ============================================================================
// Text File Operations
// ============================================================================

/**
 * Read text file contents
 *
 * @param filePath - Path to file
 * @param encoding - Text encoding (default: "utf-8")
 * @returns Promise resolving to file contents
 * @throws Error if file doesn't exist or read fails
 *
 * @example
 * ```typescript
 * const contents = await readFile("./README.md");
 * console.log(contents);
 * ```
 */
export async function readFile(
  filePath: string,
  encoding: BufferEncoding = "utf-8"
): Promise<string> {
  return fsReadFile(filePath, { encoding });
}

/**
 * Write text to a file
 *
 * @param filePath - Path to file
 * @param data - Text data to write
 * @param encoding - Text encoding (default: "utf-8")
 * @returns Promise resolving when write completes
 * @throws Error if write fails
 *
 * @example
 * ```typescript
 * await writeFile("./output.txt", "Hello, world!");
 * ```
 */
export async function writeFile(
  filePath: string,
  data: string,
  encoding: BufferEncoding = "utf-8"
): Promise<void> {
  return fsWriteFile(filePath, data, { encoding });
}

/**
 * Re-export fs-extra for advanced use cases
 */
export * from "fs-extra";
