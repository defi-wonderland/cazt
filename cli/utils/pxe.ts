/**
 * PXE (Private eXecution Environment) utility functions
 * Provides persistent database storage per network (identified by rollup address)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createAztecNodeClient, waitForNode } from '@aztec/aztec.js/node';
import { createStore, type AztecLMDBStoreV2 } from '@aztec/kv-store/lmdb-v2';
import { createPXE, getPXEConfig, type PXE } from '@aztec/pxe/server';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

/**
 * PXE version for database schema versioning
 */
const PXE_VERSION = 2;

/**
 * Default LMDB map size in KB (1GB)
 */
const DEFAULT_MAP_SIZE_KB = 1_000_000;

/**
 * Get the base data directory for cazt
 * @returns Path to ~/.cazt/data/
 */
export function getBaseDataDirectory(): string {
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.cazt', 'data');
}

/**
 * Get the data directory for a specific network
 * Uses the first 16 hex characters of the rollup address for uniqueness
 * @param rollupAddress - The rollup contract address (with or without 0x prefix)
 * @returns Path to ~/.cazt/data/{rollupAddressPrefix}/
 */
export function getNetworkDataDirectory(rollupAddress: string): string {
  // Remove 0x prefix if present and take first 16 chars
  const addressPrefix = rollupAddress.replace(/^0x/i, '').slice(0, 16).toLowerCase();
  return path.join(getBaseDataDirectory(), addressPrefix);
}

/**
 * Ensure a directory exists, creating it if necessary
 * @param dirPath - Directory path to ensure exists
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }
}

/**
 * Result of creating a persistent PXE
 */
export interface PersistentPXEResult {
  pxe: PXE;
  store: AztecLMDBStoreV2;
  node: AztecNode;
  rollupAddress: string;
  dataDirectory: string;
}

/**
 * Options for creating a persistent PXE
 */
export interface PersistentPXEOptions {
  /** Override the data directory (default: auto-generated from rollup address) */
  dataDirectory?: string;
  /** LMDB map size in KB (default: 1GB) */
  mapSizeKb?: number;
  /** Enable prover (default: false for CLI operations) */
  proverEnabled?: boolean;
}

/**
 * Create a persistent PXE with LMDB storage for a specific network
 * The database is stored in ~/.cazt/data/{rollupAddressPrefix}/pxe/
 *
 * @param nodeUrl - URL of the Aztec node to connect to
 * @param options - Optional configuration
 * @returns PXE instance with persistent storage, the store, node, and metadata
 *
 * @example
 * ```typescript
 * const { pxe, store, node, rollupAddress } = await createPersistentPXE('http://localhost:8080');
 * // Use pxe for operations...
 * // Data will persist across CLI invocations for this network
 * ```
 */
export async function createPersistentPXE(
  nodeUrl: string,
  options: PersistentPXEOptions = {}
): Promise<PersistentPXEResult> {
  const {
    mapSizeKb = DEFAULT_MAP_SIZE_KB,
    proverEnabled = false,
  } = options;

  // Connect to the Aztec node
  const node = createAztecNodeClient(nodeUrl);
  await waitForNode(node);

  // Get the rollup address to identify this network
  const l1Contracts = await node.getL1ContractAddresses();
  const rollupAddress = l1Contracts.rollupAddress.toString();

  // Determine data directory
  const dataDirectory = options.dataDirectory || getNetworkDataDirectory(rollupAddress);
  const pxeDataDir = path.join(dataDirectory, 'pxe');

  // Ensure the directory exists
  ensureDirectoryExists(pxeDataDir);

  // Create the LMDB store
  const store = await createStore('pxe', PXE_VERSION, {
    dataDirectory: pxeDataDir,
    dataStoreMapSizeKb: mapSizeKb,
    l1Contracts: { rollupAddress: l1Contracts.rollupAddress },
  });

  // Get PXE config and create PXE
  const config = getPXEConfig();
  const pxe = await createPXE(node, { ...config, proverEnabled }, { store });

  return {
    pxe,
    store,
    node,
    rollupAddress,
    dataDirectory,
  };
}

/**
 * List all network databases
 * @returns Array of network info objects with rollup address prefix and path
 */
export function listNetworkDatabases(): Array<{ addressPrefix: string; path: string }> {
  const baseDir = getBaseDataDirectory();

  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      addressPrefix: entry.name,
      path: path.join(baseDir, entry.name),
    }));
}

/**
 * Get the size of a network database in bytes
 * @param rollupAddressOrPrefix - Full rollup address or 16-char prefix
 * @returns Size in bytes, or 0 if not found
 */
export function getNetworkDatabaseSize(rollupAddressOrPrefix: string): number {
  const prefix = rollupAddressOrPrefix.replace(/^0x/i, '').slice(0, 16).toLowerCase();
  const networkDir = path.join(getBaseDataDirectory(), prefix, 'pxe');

  if (!fs.existsSync(networkDir)) {
    return 0;
  }

  let totalSize = 0;
  const files = fs.readdirSync(networkDir);
  for (const file of files) {
    const filePath = path.join(networkDir, file);
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      totalSize += stats.size;
    }
  }

  return totalSize;
}

/**
 * Delete a network database
 * @param rollupAddressOrPrefix - Full rollup address or 16-char prefix
 * @returns true if deleted, false if not found
 */
export function deleteNetworkDatabase(rollupAddressOrPrefix: string): boolean {
  const prefix = rollupAddressOrPrefix.replace(/^0x/i, '').slice(0, 16).toLowerCase();
  const networkDir = path.join(getBaseDataDirectory(), prefix);

  if (!fs.existsSync(networkDir)) {
    return false;
  }

  fs.rmSync(networkDir, { recursive: true, force: true });
  return true;
}
