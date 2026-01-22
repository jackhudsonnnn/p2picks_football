/**
 * File storage utilities for NBA data.
 * Handles atomic JSON read/write operations and directory management.
 */

import { promises as fs } from 'fs';
import path from 'path';

const DATA_ROOT = path.resolve(__dirname, '..', '..', 'data');

// New layout nests NBA under data/nba_data
export const NBA_RAW_DIR = path.join(DATA_ROOT, 'nba_data', 'nba_raw_live_stats');
export const NBA_REFINED_DIR = path.join(DATA_ROOT, 'nba_data', 'nba_refined_live_stats');
export const NBA_TEST_DATA_DIR = path.join(DATA_ROOT, 'test_nba_data');

/**
 * Ensure all NBA data directories exist.
 */
export async function ensureNbaDirectories(): Promise<void> {
  await Promise.all([
    fs.mkdir(NBA_RAW_DIR, { recursive: true }),
    fs.mkdir(NBA_REFINED_DIR, { recursive: true }),
  ]);
}

/**
 * Atomically write JSON to a file using temp file + rename.
 */
export async function writeJsonAtomic(
  data: unknown,
  dir: string,
  file: string,
): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, file);
  const tmpPath = `${filePath}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, filePath);
}

/**
 * Read and parse a JSON file.
 */
export async function readJson<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (err) {
    return null;
  }
}

/**
 * List JSON files in a directory (returns filenames).
 */
export async function safeListFiles(dir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dir);
    return files.filter((file) => file.toLowerCase().endsWith('.json'));
  } catch (err) {
    return [];
  }
}

/**
 * List JSON file IDs (filenames without extension) in a directory.
 */
export async function listJsonIds(dir: string): Promise<string[]> {
  const files = await safeListFiles(dir);
  return files.map((file) => path.parse(file).name);
}

/**
 * Get file modification time.
 */
export async function getFileMtime(filePath: string): Promise<number | null> {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtimeMs;
  } catch (err) {
    return null;
  }
}

/**
 * Delete a file if it exists.
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err) {
    return false;
  }
}
