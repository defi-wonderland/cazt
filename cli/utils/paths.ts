import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Centralized path utilities for cazt.
 *
 * All cazt data is stored in ~/.cazt/:
 * - ~/.cazt/keystores/       - Encrypted keystores (GETH format)
 * - ~/.cazt/keystores/keys.json - Unencrypted keys
 * - ~/.cazt/tx-metadata/     - Transaction metadata LMDB database
 *
 * In test mode (NODE_ENV=test or CAZT_TEST_MODE=true), paths use _test suffix
 * to prevent accidentally affecting real data during tests.
 */

const DIR_MODE = 0o700; // Read/write/execute for owner only

/**
 * Determines if we're in test mode.
 * Test mode uses separate directories to avoid affecting real data.
 */
export function isTestMode(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.CAZT_TEST_MODE === 'true';
}

/**
 * Gets the root cazt directory (~/.cazt)
 */
export function getCaztDir(): string {
  return path.join(os.homedir(), '.cazt');
}

/**
 * Gets the keystores directory.
 * In test mode: ~/.cazt/keystores_test
 * In normal mode: ~/.cazt/keystores
 */
export function getKeystoresDir(): string {
  const suffix = isTestMode() ? '_test' : '';
  return path.join(getCaztDir(), `keystores${suffix}`);
}

/**
 * Gets the transaction metadata directory (LMDB database location).
 * In test mode: ~/.cazt/tx-metadata_test
 * In normal mode: ~/.cazt/tx-metadata
 */
export function getTxMetadataDir(): string {
  const suffix = isTestMode() ? '_test' : '';
  return path.join(getCaztDir(), `tx-metadata${suffix}`);
}

/**
 * Ensures a directory exists with proper permissions (0o700).
 * Creates parent directories recursively if needed.
 *
 * @param dir - Directory path to create
 * @throws Error if directory cannot be created
 */
export async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { mode: DIR_MODE, recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw new Error(`Failed to create directory ${dir}: ${error.message}`);
    }
  }
}

/**
 * Ensures the root cazt directory exists.
 */
export async function ensureCaztDir(): Promise<void> {
  await ensureDir(getCaztDir());
}

/**
 * Ensures the keystores directory exists.
 */
export async function ensureKeystoresDir(): Promise<void> {
  await ensureDir(getKeystoresDir());
}

/**
 * Ensures the transaction metadata directory exists.
 */
export async function ensureTxMetadataDir(): Promise<void> {
  await ensureDir(getTxMetadataDir());
}
