/**
 * File storage utilities for NFL data.
 * Handles atomic JSON read/write operations and directory management.
 */

import { promises as fs } from 'fs';
import path from 'path';

// Align NFL data paths with actual project data location (src/data/...)
const DATA_ROOT = path.resolve(__dirname, '..', '..', 'data');

// New layout nests NFL under data/nfl_data
export const RAW_DIR = path.join(DATA_ROOT, 'nfl_data', 'nfl_raw_live_stats');
export const REFINED_DIR = path.join(DATA_ROOT, 'nfl_data', 'nfl_refined_live_stats');
export const ROSTERS_DIR = path.join(DATA_ROOT, 'nfl_data', 'nfl_rosters');
export const TEST_DATA_DIR = path.join(DATA_ROOT, 'test_nfl_data');

/**
 * Ensure all data directories exist.
 */
export async function ensureDirectories(): Promise<void> {
  await Promise.all([
    fs.mkdir(RAW_DIR, { recursive: true }),
    fs.mkdir(REFINED_DIR, { recursive: true }),
    fs.mkdir(ROSTERS_DIR, { recursive: true }),
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
export async function readJson(filePath: string): Promise<unknown | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
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
