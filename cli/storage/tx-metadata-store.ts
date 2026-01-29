/**
 * Transaction Metadata Store
 *
 * LMDB-backed storage for transaction metadata with GETH keystore-compatible encryption.
 *
 * Storage structure:
 * - tx_metadata: txHash → encrypted keystore blob
 * - tx_metadata_index: txHash → plaintext index entry (for fast listing)
 * - encryption_check: "check" → encrypted verification value (to detect wrong password)
 * - by_tag: tag → txHash[] (multimap)
 * - by_contract: contractAddress → txHash[] (multimap)
 *
 * Encryption uses the same format as Ethereum's Web3 Secret Storage (GETH keystore):
 * - scrypt for key derivation (N=262144, r=8, p=1)
 * - AES-128-CTR for encryption
 * - keccak256 for MAC
 */

import { AztecLmdbStore } from '@aztec/kv-store/lmdb';
import type { AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import { getTxMetadataDir, ensureTxMetadataDir } from '../utils/paths.js';
import { encryptKeystoreBlob, decryptKeystoreBlob } from '../utils/keystore-crypto.js';

/**
 * Stored transaction metadata (encrypted content)
 */
export interface TxMetadata {
  version: 1;
  txHash: string;
  userAddress?: string;
  createdAt: number;
  updatedAt: number;
  label?: string;
  description?: string;
  tags?: string[];
  custom?: Record<string, unknown>;
  contractAddress?: string;
  functionName?: string;
}

/**
 * Index entry stored in plaintext for fast listing
 */
export interface TxMetadataIndexEntry {
  txHash: string;
  label?: string;
  tags: string[];
  contractAddress?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Options for opening the metadata store
 */
export interface TxMetadataStoreOptions {
  dataDir?: string;
}

/**
 * Magic value for encryption verification
 */
const ENCRYPTION_CHECK_VALUE = 'cazt-tx-metadata-v1';

/**
 * Transaction Metadata Store
 *
 * Provides encrypted storage for transaction metadata using LMDB.
 */
export class TxMetadataStore {
  #store: AztecLmdbStore;
  #metadata: AztecAsyncMap<string, Buffer>;
  #index: AztecAsyncMap<string, string>;
  #encryptionCheck: AztecAsyncMap<string, Buffer>;
  #byTag: AztecAsyncMultiMap<string, string>;
  #byContract: AztecAsyncMultiMap<string, string>;

  private constructor(store: AztecLmdbStore) {
    this.#store = store;
    this.#metadata = store.openMap('tx_metadata');
    this.#index = store.openMap('tx_metadata_index');
    this.#encryptionCheck = store.openMap('encryption_check');
    this.#byTag = store.openMultiMap('tx_metadata_by_tag');
    this.#byContract = store.openMultiMap('tx_metadata_by_contract');
  }

  /**
   * Open or create a metadata store
   */
  static async open(options: TxMetadataStoreOptions = {}): Promise<TxMetadataStore> {
    const dataDir = options.dataDir ?? getTxMetadataDir();
    await ensureTxMetadataDir();

    const store = AztecLmdbStore.open(dataDir);
    return new TxMetadataStore(store);
  }

  /**
   * Close the store
   */
  async close(): Promise<void> {
    await this.#store.close();
  }

  /**
   * Verify the encryption password matches existing data.
   * Call this before performing operations to detect wrong passwords early.
   */
  async verifyPassword(password: string): Promise<boolean> {
    const existing = await this.#encryptionCheck.getAsync('check');

    if (!existing) {
      // No existing data, password is valid (will be set on first write)
      return true;
    }

    try {
      const decrypted = decryptKeystoreBlob(existing, password);
      return decrypted.toString('utf-8') === ENCRYPTION_CHECK_VALUE;
    } catch {
      return false;
    }
  }

  /**
   * Initialize encryption check value (called on first encrypted write)
   */
  async #ensureEncryptionCheck(password: string): Promise<void> {
    const existing = await this.#encryptionCheck.getAsync('check');
    if (!existing) {
      const encrypted = encryptKeystoreBlob(Buffer.from(ENCRYPTION_CHECK_VALUE, 'utf-8'), password);
      await this.#encryptionCheck.set('check', encrypted);
    }
  }

  /**
   * Add metadata for a transaction (encrypted)
   */
  async add(
    txHash: string,
    metadata: Omit<TxMetadata, 'version' | 'txHash' | 'createdAt' | 'updatedAt'>,
    password: string
  ): Promise<void> {
    // Verify password if there's existing data
    if (!(await this.verifyPassword(password))) {
      throw new Error('Invalid password: does not match existing encrypted data');
    }

    // Check if already exists
    if (await this.exists(txHash)) {
      throw new Error(`Metadata already exists for transaction ${txHash}`);
    }

    const now = Date.now();
    const fullMetadata: TxMetadata = {
      version: 1,
      txHash,
      createdAt: now,
      updatedAt: now,
      ...metadata,
    };

    // Encrypt metadata
    const plaintext = Buffer.from(JSON.stringify(fullMetadata), 'utf-8');
    const encrypted = encryptKeystoreBlob(plaintext, password);

    // Create index entry
    const indexEntry: TxMetadataIndexEntry = {
      txHash,
      label: metadata.label,
      tags: metadata.tags ?? [],
      contractAddress: metadata.contractAddress,
      createdAt: now,
      updatedAt: now,
    };

    // Store atomically
    await this.#store.transactionAsync(async () => {
      await this.#ensureEncryptionCheck(password);
      await this.#metadata.set(txHash, encrypted);
      await this.#index.set(txHash, JSON.stringify(indexEntry));

      // Update indices
      if (metadata.tags) {
        for (const tag of metadata.tags) {
          await this.#byTag.set(tag.toLowerCase(), txHash);
        }
      }
      if (metadata.contractAddress) {
        await this.#byContract.set(metadata.contractAddress, txHash);
      }
    });
  }

  /**
   * Add metadata without encryption (for testing/debugging)
   */
  async addPlaintext(
    txHash: string,
    metadata: Omit<TxMetadata, 'version' | 'txHash' | 'createdAt' | 'updatedAt'>
  ): Promise<void> {
    if (await this.exists(txHash)) {
      throw new Error(`Metadata already exists for transaction ${txHash}`);
    }

    const now = Date.now();
    const fullMetadata: TxMetadata = {
      version: 1,
      txHash,
      createdAt: now,
      updatedAt: now,
      ...metadata,
    };

    const indexEntry: TxMetadataIndexEntry = {
      txHash,
      label: metadata.label,
      tags: metadata.tags ?? [],
      contractAddress: metadata.contractAddress,
      createdAt: now,
      updatedAt: now,
    };

    // Store as plaintext JSON (not keystore format)
    const plaintext = Buffer.from(JSON.stringify(fullMetadata), 'utf-8');

    await this.#store.transactionAsync(async () => {
      await this.#metadata.set(txHash, plaintext);
      await this.#index.set(txHash, JSON.stringify(indexEntry));

      if (metadata.tags) {
        for (const tag of metadata.tags) {
          await this.#byTag.set(tag.toLowerCase(), txHash);
        }
      }
      if (metadata.contractAddress) {
        await this.#byContract.set(metadata.contractAddress, txHash);
      }
    });
  }

  /**
   * Get metadata for a transaction (decrypts with password)
   */
  async get(txHash: string, password: string): Promise<TxMetadata | undefined> {
    const encrypted = await this.#metadata.getAsync(txHash);
    if (!encrypted) {
      return undefined;
    }

    const decrypted = decryptKeystoreBlob(encrypted, password);
    return JSON.parse(decrypted.toString('utf-8'));
  }

  /**
   * Get metadata without decryption (for plaintext entries)
   */
  async getPlaintext(txHash: string): Promise<TxMetadata | undefined> {
    const data = await this.#metadata.getAsync(txHash);
    if (!data) {
      return undefined;
    }

    try {
      return JSON.parse(data.toString('utf-8'));
    } catch {
      throw new Error('Entry is encrypted, use get() with password');
    }
  }

  /**
   * Update metadata for a transaction
   */
  async update(
    txHash: string,
    updates: Partial<Omit<TxMetadata, 'version' | 'txHash' | 'createdAt'>>,
    password: string
  ): Promise<void> {
    const existing = await this.get(txHash, password);
    if (!existing) {
      throw new Error(`No metadata found for transaction ${txHash}`);
    }

    // Get old values for index cleanup
    const oldTags = existing.tags ?? [];
    const oldContract = existing.contractAddress;

    // Merge updates
    const updated: TxMetadata = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    // Encrypt
    const plaintext = Buffer.from(JSON.stringify(updated), 'utf-8');
    const encrypted = encryptKeystoreBlob(plaintext, password);

    // Update index entry
    const indexEntry: TxMetadataIndexEntry = {
      txHash,
      label: updated.label,
      tags: updated.tags ?? [],
      contractAddress: updated.contractAddress,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    await this.#store.transactionAsync(async () => {
      await this.#metadata.set(txHash, encrypted);
      await this.#index.set(txHash, JSON.stringify(indexEntry));

      // Update tag index (remove old, add new)
      for (const tag of oldTags) {
        await this.#byTag.deleteValue(tag.toLowerCase(), txHash);
      }
      for (const tag of updated.tags ?? []) {
        await this.#byTag.set(tag.toLowerCase(), txHash);
      }

      // Update contract index
      if (oldContract && oldContract !== updated.contractAddress) {
        await this.#byContract.deleteValue(oldContract, txHash);
      }
      if (updated.contractAddress) {
        await this.#byContract.set(updated.contractAddress, txHash);
      }
    });
  }

  /**
   * Delete metadata for a transaction
   */
  async delete(txHash: string): Promise<boolean> {
    const indexData = await this.#index.getAsync(txHash);
    if (!indexData) {
      return false;
    }

    const indexEntry: TxMetadataIndexEntry = JSON.parse(indexData);

    await this.#store.transactionAsync(async () => {
      await this.#metadata.delete(txHash);
      await this.#index.delete(txHash);

      // Clean up indices
      for (const tag of indexEntry.tags) {
        await this.#byTag.deleteValue(tag.toLowerCase(), txHash);
      }
      if (indexEntry.contractAddress) {
        await this.#byContract.deleteValue(indexEntry.contractAddress, txHash);
      }
    });

    return true;
  }

  /**
   * Check if metadata exists for a transaction
   */
  async exists(txHash: string): Promise<boolean> {
    const data = await this.#index.getAsync(txHash);
    return data !== undefined;
  }

  /**
   * List metadata entries (from plaintext index, no decryption needed)
   */
  async list(options?: {
    tag?: string;
    contract?: string;
    limit?: number;
  }): Promise<TxMetadataIndexEntry[]> {
    let txHashes: string[];

    if (options?.tag) {
      // Filter by tag
      txHashes = [];
      for await (const hash of this.#byTag.getValuesAsync(options.tag.toLowerCase())) {
        txHashes.push(hash);
      }
    } else if (options?.contract) {
      // Filter by contract
      txHashes = [];
      for await (const hash of this.#byContract.getValuesAsync(options.contract)) {
        txHashes.push(hash);
      }
    } else {
      // Get all
      txHashes = [];
      for await (const hash of this.#index.keysAsync()) {
        txHashes.push(hash);
      }
    }

    // Fetch index entries
    const entries: TxMetadataIndexEntry[] = [];
    const limit = options?.limit ?? Infinity;

    for (const txHash of txHashes) {
      if (entries.length >= limit) break;

      const data = await this.#index.getAsync(txHash);
      if (data) {
        entries.push(JSON.parse(data));
      }
    }

    // Sort by updatedAt descending
    entries.sort((a, b) => b.updatedAt - a.updatedAt);

    return entries;
  }

  /**
   * Export all metadata (decrypted)
   */
  async exportAll(password: string): Promise<TxMetadata[]> {
    // Verify password first
    if (!(await this.verifyPassword(password))) {
      throw new Error('Invalid password');
    }

    const entries: TxMetadata[] = [];

    for await (const txHash of this.#metadata.keysAsync()) {
      const encrypted = await this.#metadata.getAsync(txHash);
      if (encrypted) {
        try {
          const decrypted = decryptKeystoreBlob(encrypted, password);
          entries.push(JSON.parse(decrypted.toString('utf-8')));
        } catch {
          // Skip entries that fail to decrypt (might be plaintext)
          try {
            entries.push(JSON.parse(encrypted.toString('utf-8')));
          } catch {
            // Skip invalid entries
          }
        }
      }
    }

    // Sort by updatedAt descending
    entries.sort((a, b) => b.updatedAt - a.updatedAt);

    return entries;
  }

  /**
   * Import metadata entries
   */
  async importAll(
    entries: TxMetadata[],
    password: string
  ): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;

    for (const entry of entries) {
      if (await this.exists(entry.txHash)) {
        skipped++;
        continue;
      }

      await this.add(
        entry.txHash,
        {
          label: entry.label,
          description: entry.description,
          tags: entry.tags,
          custom: entry.custom,
          contractAddress: entry.contractAddress,
          functionName: entry.functionName,
          userAddress: entry.userAddress,
        },
        password
      );
      imported++;
    }

    return { imported, skipped };
  }

  /**
   * Rebuild the index from encrypted metadata (requires password)
   */
  async rebuildIndex(password: string): Promise<number> {
    // Verify password
    if (!(await this.verifyPassword(password))) {
      throw new Error('Invalid password');
    }

    let count = 0;

    // Clear existing indices
    for await (const key of this.#index.keysAsync()) {
      await this.#index.delete(key);
    }
    for await (const key of this.#byTag.keysAsync()) {
      await this.#byTag.delete(key);
    }
    for await (const key of this.#byContract.keysAsync()) {
      await this.#byContract.delete(key);
    }

    // Rebuild from metadata
    for await (const txHash of this.#metadata.keysAsync()) {
      const encrypted = await this.#metadata.getAsync(txHash);
      if (!encrypted) continue;

      try {
        let metadata: TxMetadata;
        try {
          const decrypted = decryptKeystoreBlob(encrypted, password);
          metadata = JSON.parse(decrypted.toString('utf-8'));
        } catch {
          // Try as plaintext
          metadata = JSON.parse(encrypted.toString('utf-8'));
        }

        const indexEntry: TxMetadataIndexEntry = {
          txHash: metadata.txHash,
          label: metadata.label,
          tags: metadata.tags ?? [],
          contractAddress: metadata.contractAddress,
          createdAt: metadata.createdAt,
          updatedAt: metadata.updatedAt,
        };

        await this.#index.set(txHash, JSON.stringify(indexEntry));

        for (const tag of indexEntry.tags) {
          await this.#byTag.set(tag.toLowerCase(), txHash);
        }
        if (indexEntry.contractAddress) {
          await this.#byContract.set(indexEntry.contractAddress, txHash);
        }

        count++;
      } catch {
        // Skip invalid entries
      }
    }

    return count;
  }

  /**
   * Clear all data (for testing)
   */
  async clear(): Promise<void> {
    for await (const key of this.#metadata.keysAsync()) {
      await this.#metadata.delete(key);
    }
    for await (const key of this.#index.keysAsync()) {
      await this.#index.delete(key);
    }
    for await (const key of this.#encryptionCheck.keysAsync()) {
      await this.#encryptionCheck.delete(key);
    }
    // Multimaps don't have a clear method, they'll be rebuilt
  }
}
