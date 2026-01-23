# Transaction Metadata Vault - Technical Specification

A CLI tool (`cazt`) to attach, store, and retrieve encrypted human-readable metadata for transactions.

## Overview

Users can attach arbitrary metadata (strings, JSON, notes) to transactions, stored locally in an encrypted LMDB database. This enables transaction history, context tracking, and debugging workflows.

---

## Feature Requirements

### Core Functionality
1. **Add metadata to existing transaction** - Given a TxHash, attach metadata after the fact
2. **Add metadata when sending transaction** - Attach metadata during tx submission
3. **Retrieve metadata** - Query metadata by TxHash
4. **List all metadata** - Browse transaction history with context
5. **Export metadata** - Export encrypted or plaintext for backup
6. **Future: Cloud sync** - Optional encrypted backup service (documented, not implemented)

### Metadata Schema

```typescript
interface TransactionMetadata {
  version: 1;                          // Schema version for migrations
  txHash: TxHash;                      // Primary key (or composite with userAddress)
  userAddress?: AztecAddress;          // Optional: for multi-user support
  createdAt: number;                   // Unix timestamp
  updatedAt: number;                   // Last modification
  label?: string;                      // Short human-readable label
  description?: string;                // Longer description/context
  tags?: string[];                     // Categorization tags
  custom?: Record<string, unknown>;    // Arbitrary JSON data

  // Auto-captured (optional)
  contractAddress?: AztecAddress;      // If known
  functionName?: string;               // If known
  simulationResult?: {
    gasUsed: bigint;
    revertReason?: string;
  };
}
```

---

## Storage Location

### Default: `.cazt/tx-metadata/`

Unlike PXE data (which lives in PXE's LMDB), transaction metadata is stored in a **separate LMDB** inside the `.cazt` folder:

```
~/.cazt/
├── tx-metadata/
│   ├── data.mdb          # LMDB data file
│   └── lock.mdb          # LMDB lock file
├── keystores/            # Existing: stored secrets with aliases
│   ├── default           # Default encryption keystore (GETH format)
│   ├── work              # Named keystore
│   └── keys.json         # Plaintext keys (when --no-encrypt used)
└── config.json           # cazt configuration (if needed)
```

**Why separate from PXE?**
- Metadata is user-facing, not protocol data
- Can be backed up/exported independently
- Doesn't affect PXE sync or state
- Different lifecycle than notes/nullifiers

### Storage Structure (LMDB)

```
AztecLMDBStoreV2 @ ~/.cazt/tx-metadata/
├── singleton:encryption_check         (magic bytes to verify correct key)
├── map:tx_metadata                    (key -> encrypted blob)
│     key = txHash OR txHash:userAddress (multi-user)
├── multimap:tx_metadata_by_tag        (tag -> key[])
├── multimap:tx_metadata_by_contract   (contract -> key[])
└── multimap:tx_metadata_by_user       (userAddress -> key[])
```

---

## Encryption

### Two-Tier Encryption Architecture

To avoid the performance penalty of scrypt on every operation, we use a two-tier approach:

```
┌─────────────────────────────────────────────────────────────────┐
│  Tier 1: Master Key Storage (GETH Keystore - slow, secure)      │
│  ─────────────────────────────────────────────────────────────  │
│  - Stored in ~/.cazt/keystores/<alias>                          │
│  - Scrypt KDF (N=262144, r=8, p=1) - ~200ms per derivation      │
│  - Only decrypted ONCE per session                              │
│  - Reuses existing SecretManager/EncryptedKeystore classes      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Tier 2: Metadata Encryption (AES-256-GCM - fast)               │
│  ─────────────────────────────────────────────────────────────  │
│  - Uses master key from Tier 1 directly                         │
│  - AES-256-GCM with random 12-byte nonce per entry              │
│  - ~0.1ms per encrypt/decrypt operation                         │
│  - Authenticated encryption (integrity + confidentiality)       │
└─────────────────────────────────────────────────────────────────┘
```

**Why this matters:**
- Listing 1000 transactions with GETH keystore per entry: ~200 seconds
- Listing 1000 transactions with AES-GCM: ~100 milliseconds

### Encrypted Blob Format

Each metadata entry is stored as:

```
┌──────────┬───────────┬────────────────┬──────────────┐
│  Magic   │   Nonce   │   Ciphertext   │   Auth Tag   │
│ (3 bytes)│ (12 bytes)│   (variable)   │  (16 bytes)  │
└──────────┴───────────┴────────────────┴──────────────┘

Magic: 0x43 0x5A 0x54 ("CZT" - identifies encrypted cazt data)
```

```typescript
const ENCRYPTED_MAGIC = Buffer.from([0x43, 0x5A, 0x54]); // "CZT"

interface EncryptedBlob {
  magic: Buffer;      // 3 bytes: 0x43 0x5A 0x54
  nonce: Buffer;      // 12 bytes: random IV for AES-GCM
  ciphertext: Buffer; // variable: encrypted JSON
  authTag: Buffer;    // 16 bytes: GCM authentication tag
}
```

### Encryption Key Sources

Uses the **existing** `cazt key` infrastructure for key management:

#### Option 1: Stored Keystore (Default)

```bash
# First time: create and store a secret (EXISTING COMMAND)
cazt key import $(cazt key generate) --alias default
# Prompts for password, stores encrypted in ~/.cazt/keystores/default

# Or create a keystore file directly (EXISTING COMMAND)
cazt key keystore create --alias default
# Prompts for password, generates random secret, stores encrypted

# Use stored secret (default behavior for tx metadata commands)
cazt tx metadata add <tx-hash> --label "My tx"
# Uses ~/.cazt/keystores/default automatically

# Use specific alias
cazt tx metadata add <tx-hash> --label "My tx" --keystore work
```

#### Option 2: Password Prompt (Session Key)

```bash
# Prompt for password, derive session key
cazt tx metadata add <tx-hash> --label "My tx" --password
# Enter password: ********
# Derives key using scrypt, uses for this session
```

#### Option 3: No Encryption (Plaintext)

```bash
# Store in plaintext (for debugging/testing only)
cazt tx metadata add <tx-hash> --label "My tx" --no-encrypt
```

### Key Derivation for Account-Linked Encryption

When deriving from an Aztec account (optional alternative to password-based):

```typescript
import { poseidon2HashBytes } from '@aztec/foundation/crypto';

// Domain-separated key derivation (matches existing pattern in encrypted-keystore.ts)
const METADATA_DOMAIN = Buffer.from('cazt:metadata:v1');

function deriveMetadataKey(masterSecret: Fr): Buffer {
  const input = Buffer.concat([
    masterSecret.toBuffer(),
    METADATA_DOMAIN,
  ]);
  // Returns 32 bytes suitable for AES-256
  return poseidon2HashBytes(input).subarray(0, 32);
}
```

**Security:** Compromised metadata key cannot be reversed to obtain the master secret due to Poseidon2's one-way property.

---

## CLI Interface

All commands use the existing `cazt` CLI structure:

```bash
# ─────────────────────────────────────────────────────────────
# Key Management (EXISTING - no changes needed)
# ─────────────────────────────────────────────────────────────

# Generate a random secret
cazt key generate

# Import and store (encrypted by default)
cazt key import <secret> --alias <name>

# Create keystore directly
cazt key keystore create --alias <name>

# List stored keys
cazt key list

# Export a key (prompts for password if encrypted)
cazt key export <alias>

# Delete a key
cazt key delete <alias>

# ─────────────────────────────────────────────────────────────
# Add Metadata (NEW)
# ─────────────────────────────────────────────────────────────

# Basic - uses default keystore
cazt tx metadata add <tx-hash> --label "Swap ETH for DAI"

# With more fields
cazt tx metadata add <tx-hash> \
  --label "DEX Swap" \
  --description "Swapped 1 ETH for DAI on Uniswap" \
  --tags "defi,swap,uniswap"

# With custom JSON data
cazt tx metadata add <tx-hash> \
  --label "Transfer" \
  --custom '{"recipient": "alice.eth", "amount": "100", "token": "DAI"}'

# Using specific keystore
cazt tx metadata add <tx-hash> --label "Work tx" --keystore work

# With password prompt (no stored keystore)
cazt tx metadata add <tx-hash> --label "My tx" --password

# Plaintext (no encryption)
cazt tx metadata add <tx-hash> --label "Test tx" --no-encrypt

# ─────────────────────────────────────────────────────────────
# Query Metadata (NEW)
# ─────────────────────────────────────────────────────────────

# Get metadata for a transaction
cazt tx metadata get <tx-hash>

# List all metadata
cazt tx metadata list

# Filter by tag
cazt tx metadata list --tag defi

# Filter by contract
cazt tx metadata list --contract <contract-address>

# Filter by user (multi-user mode)
cazt tx metadata list --user <user-address>

# Limit results
cazt tx metadata list --limit 20

# Output as JSON
cazt tx metadata list --json

# ─────────────────────────────────────────────────────────────
# Update & Delete (NEW)
# ─────────────────────────────────────────────────────────────

# Update existing metadata
cazt tx metadata update <tx-hash> --label "New label" --tags "updated,tags"

# Delete metadata
cazt tx metadata delete <tx-hash>

# Delete with user (multi-user mode)
cazt tx metadata delete <tx-hash> --user <user-address>

# ─────────────────────────────────────────────────────────────
# Export & Import (NEW)
# ─────────────────────────────────────────────────────────────

# Export all metadata (encrypted with specified key)
cazt tx metadata export --output backup.enc

# Export as plaintext JSON (for migration/debugging)
cazt tx metadata export --output backup.json --no-encrypt

# Import from backup
cazt tx metadata import --input backup.enc

# Import with password prompt
cazt tx metadata import --input backup.enc --password
```

---

## Implementation Details

### 1. MetadataCipher (Fast Symmetric Encryption)

```typescript
// File: cli/utils/metadata-cipher.ts

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTED_MAGIC = Buffer.from([0x43, 0x5A, 0x54]); // "CZT"
const ALGORITHM = 'aes-256-gcm';
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Fast symmetric encryption for metadata entries.
 * Uses AES-256-GCM for authenticated encryption.
 *
 * NOT for key storage - use EncryptedKeystore for that.
 */
export class MetadataCipher {
  constructor(private key: Buffer) {
    if (key.length !== 32) {
      throw new Error('Key must be 32 bytes for AES-256');
    }
  }

  encrypt(plaintext: Buffer): Buffer {
    const nonce = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, nonce);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([
      ENCRYPTED_MAGIC,
      nonce,
      ciphertext,
      authTag,
    ]);
  }

  decrypt(blob: Buffer): Buffer {
    // Verify magic
    const magic = blob.subarray(0, 3);
    if (!magic.equals(ENCRYPTED_MAGIC)) {
      throw new Error('Invalid encrypted blob: missing magic header');
    }

    const nonce = blob.subarray(3, 3 + NONCE_LENGTH);
    const authTag = blob.subarray(blob.length - AUTH_TAG_LENGTH);
    const ciphertext = blob.subarray(3 + NONCE_LENGTH, blob.length - AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.key, nonce);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
  }

  /**
   * Check if a buffer appears to be encrypted (has magic header)
   */
  static isEncrypted(blob: Buffer): boolean {
    return blob.length >= 3 && blob.subarray(0, 3).equals(ENCRYPTED_MAGIC);
  }
}
```

### 2. TxMetadataStore

```typescript
// File: cli/storage/tx-metadata-store.ts

import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import { AztecLmdbStore } from '@aztec/kv-store/lmdb';
import { TxHash } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/aztec.js';
import { MetadataCipher } from '../utils/metadata-cipher.js';

export interface StoredTxMetadata {
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
  simulationResult?: {
    gasUsed: string; // bigint as string for JSON
    revertReason?: string;
  };
}

export interface TxMetadataStoreOptions {
  dataDir: string;
  multiUserMode?: boolean;
  defaultUserAddress?: string;
}

// Magic value stored to verify correct decryption key
const ENCRYPTION_CHECK_VALUE = 'cazt-metadata-v1';

export class TxMetadataStore {
  #store: AztecAsyncKVStore;
  #metadata: AztecAsyncMap<string, Buffer>;
  #metadataByTag: AztecAsyncMultiMap<string, string>;
  #metadataByContract: AztecAsyncMultiMap<string, string>;
  #metadataByUser: AztecAsyncMultiMap<string, string>;
  #encryptionCheck: AztecAsyncMap<string, Buffer>;
  #cipher?: MetadataCipher;
  #options: TxMetadataStoreOptions;

  private constructor(
    store: AztecAsyncKVStore,
    options: TxMetadataStoreOptions,
    cipher?: MetadataCipher,
  ) {
    this.#store = store;
    this.#options = options;
    this.#cipher = cipher;
    this.#metadata = store.openMap('tx_metadata');
    this.#metadataByTag = store.openMultiMap('tx_metadata_by_tag');
    this.#metadataByContract = store.openMultiMap('tx_metadata_by_contract');
    this.#metadataByUser = store.openMultiMap('tx_metadata_by_user');
    this.#encryptionCheck = store.openMap('encryption_check');
  }

  /**
   * Open or create a metadata store.
   * If encryptionKey is provided, verifies it matches any existing encrypted data.
   */
  static async open(
    options: TxMetadataStoreOptions,
    encryptionKey?: Buffer,
  ): Promise<TxMetadataStore> {
    const store = await AztecLmdbStore.open(options.dataDir);
    const cipher = encryptionKey ? new MetadataCipher(encryptionKey) : undefined;

    const instance = new TxMetadataStore(store, options, cipher);

    // Verify encryption key if store has existing encrypted data
    if (cipher) {
      await instance.#verifyEncryptionKey();
    }

    return instance;
  }

  async #verifyEncryptionKey(): Promise<void> {
    const checkMap = this.#encryptionCheck;
    const existing = await checkMap.getAsync('check');

    if (existing) {
      // Verify we can decrypt the check value
      if (!this.#cipher) {
        throw new Error('Store contains encrypted data but no encryption key provided');
      }
      try {
        const decrypted = this.#cipher.decrypt(existing);
        if (decrypted.toString() !== ENCRYPTION_CHECK_VALUE) {
          throw new Error('Encryption key verification failed');
        }
      } catch (error) {
        throw new Error('Invalid encryption key: cannot decrypt existing data');
      }
    } else if (this.#cipher) {
      // First time with encryption - store check value
      const encrypted = this.#cipher.encrypt(Buffer.from(ENCRYPTION_CHECK_VALUE));
      await checkMap.set('check', encrypted);
    }
  }

  #getKey(txHash: TxHash, userAddress?: AztecAddress): string {
    if (this.#options.multiUserMode) {
      const user = userAddress?.toString() ?? this.#options.defaultUserAddress;
      if (!user) throw new Error('User address required in multi-user mode');
      return `${txHash.toString()}:${user}`;
    }
    return txHash.toString();
  }

  async addMetadata(
    txHash: TxHash,
    metadata: Omit<StoredTxMetadata, 'version' | 'txHash' | 'createdAt' | 'updatedAt'>,
    userAddress?: AztecAddress,
  ): Promise<void> {
    const key = this.#getKey(txHash, userAddress);
    const now = Date.now();

    const fullMetadata: StoredTxMetadata = {
      version: 1,
      txHash: txHash.toString(),
      userAddress: userAddress?.toString() ?? this.#options.defaultUserAddress,
      createdAt: now,
      updatedAt: now,
      ...metadata,
    };

    const plaintext = Buffer.from(JSON.stringify(fullMetadata), 'utf-8');
    const stored = this.#cipher ? this.#cipher.encrypt(plaintext) : plaintext;

    await this.#store.transactionAsync(async () => {
      await this.#metadata.set(key, stored);

      if (metadata.tags) {
        for (const tag of metadata.tags) {
          await this.#metadataByTag.set(tag.toLowerCase(), key);
        }
      }
      if (metadata.contractAddress) {
        await this.#metadataByContract.set(metadata.contractAddress, key);
      }
      if (fullMetadata.userAddress) {
        await this.#metadataByUser.set(fullMetadata.userAddress, key);
      }
    });
  }

  async getMetadata(
    txHash: TxHash,
    userAddress?: AztecAddress,
  ): Promise<StoredTxMetadata | undefined> {
    const key = this.#getKey(txHash, userAddress);
    const stored = await this.#metadata.getAsync(key);
    if (!stored) return undefined;

    return this.#decodeEntry(stored);
  }

  async listMetadata(options?: {
    tag?: string;
    contractAddress?: string;
    userAddress?: string;
    limit?: number;
  }): Promise<StoredTxMetadata[]> {
    let keys: string[];

    if (options?.tag) {
      keys = await this.#metadataByTag.getValuesAsync(options.tag.toLowerCase());
    } else if (options?.contractAddress) {
      keys = await this.#metadataByContract.getValuesAsync(options.contractAddress);
    } else if (options?.userAddress) {
      keys = await this.#metadataByUser.getValuesAsync(options.userAddress);
    } else {
      keys = await this.#metadata.keysAsync();
    }

    const results: StoredTxMetadata[] = [];
    const limit = options?.limit ?? Infinity;

    for (const key of keys) {
      if (results.length >= limit) break;
      const stored = await this.#metadata.getAsync(key);
      if (stored) {
        const decoded = await this.#decodeEntry(stored);
        if (decoded) results.push(decoded);
      }
    }

    // Sort by updatedAt descending (most recent first)
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async updateMetadata(
    txHash: TxHash,
    updates: Partial<Omit<StoredTxMetadata, 'version' | 'txHash' | 'createdAt'>>,
    userAddress?: AztecAddress,
  ): Promise<void> {
    const existing = await this.getMetadata(txHash, userAddress);
    if (!existing) {
      throw new Error(`No metadata found for tx ${txHash.toString()}`);
    }

    const updated: StoredTxMetadata = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    const key = this.#getKey(txHash, userAddress);
    const plaintext = Buffer.from(JSON.stringify(updated), 'utf-8');
    const stored = this.#cipher ? this.#cipher.encrypt(plaintext) : plaintext;

    await this.#metadata.set(key, stored);
  }

  async deleteMetadata(txHash: TxHash, userAddress?: AztecAddress): Promise<boolean> {
    const key = this.#getKey(txHash, userAddress);
    const existing = await this.#metadata.getAsync(key);
    if (!existing) return false;

    // Decode to get tags/contract for index cleanup
    const metadata = await this.#decodeEntry(existing);

    await this.#store.transactionAsync(async () => {
      await this.#metadata.delete(key);

      if (metadata?.tags) {
        for (const tag of metadata.tags) {
          await this.#metadataByTag.deleteValue(tag.toLowerCase(), key);
        }
      }
      if (metadata?.contractAddress) {
        await this.#metadataByContract.deleteValue(metadata.contractAddress, key);
      }
      if (metadata?.userAddress) {
        await this.#metadataByUser.deleteValue(metadata.userAddress, key);
      }
    });

    return true;
  }

  async exportAll(): Promise<StoredTxMetadata[]> {
    return this.listMetadata();
  }

  async importAll(entries: StoredTxMetadata[]): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;

    for (const entry of entries) {
      const txHash = TxHash.fromString(entry.txHash);
      const userAddress = entry.userAddress ? AztecAddress.fromString(entry.userAddress) : undefined;

      const existing = await this.getMetadata(txHash, userAddress);
      if (existing) {
        skipped++;
        continue;
      }

      await this.addMetadata(txHash, entry, userAddress);
      imported++;
    }

    return { imported, skipped };
  }

  async close(): Promise<void> {
    await this.#store.close();
  }

  #decodeEntry(stored: Buffer): StoredTxMetadata {
    let plaintext: Buffer;

    if (MetadataCipher.isEncrypted(stored)) {
      if (!this.#cipher) {
        throw new Error('Entry is encrypted but no decryption key available');
      }
      plaintext = this.#cipher.decrypt(stored);
    } else {
      plaintext = stored;
    }

    return JSON.parse(plaintext.toString('utf-8'));
  }
}
```

### 3. Integration with Existing SecretManager

```typescript
// File: cli/utils/metadata-key-resolver.ts

import { SecretManager } from './secret-manager.js';
import { promptPassword } from './password.js';
import { poseidon2HashBytes } from '@aztec/foundation/crypto';

const METADATA_DOMAIN = Buffer.from('cazt:metadata:v1');

export interface MetadataKeyOptions {
  keystore?: string;    // Alias of keystore to use
  password?: boolean;   // Prompt for password
  noEncrypt?: boolean;  // No encryption
}

/**
 * Resolves the encryption key for metadata operations.
 * Reuses existing SecretManager infrastructure.
 */
export async function resolveMetadataKey(
  options: MetadataKeyOptions,
  secretManager: SecretManager,
): Promise<Buffer | undefined> {
  if (options.noEncrypt) {
    return undefined;
  }

  if (options.password) {
    // Derive key from password using Poseidon2 (fast, deterministic)
    const password = await promptPassword('Enter encryption password: ');
    return deriveKeyFromPassword(password);
  }

  // Use stored keystore (default: 'default')
  const alias = options.keystore ?? 'default';
  const secret = await secretManager.resolve(alias);

  if (!secret) {
    throw new Error(
      `No keystore found with alias '${alias}'. ` +
      `Create one with: cazt key keystore create --alias ${alias}`
    );
  }

  // Derive metadata-specific key from stored secret
  return deriveMetadataKey(secret);
}

/**
 * Derive a 32-byte key from a password using Poseidon2.
 * Note: This is fast and deterministic - same password = same key.
 */
function deriveKeyFromPassword(password: string): Buffer {
  const input = Buffer.concat([
    Buffer.from(password, 'utf-8'),
    METADATA_DOMAIN,
  ]);
  return Buffer.from(poseidon2HashBytes(input).subarray(0, 32));
}

/**
 * Derive a metadata-specific key from a master secret.
 * Uses domain separation to prevent key reuse across different purposes.
 */
function deriveMetadataKey(masterSecret: Buffer): Buffer {
  const input = Buffer.concat([masterSecret, METADATA_DOMAIN]);
  return Buffer.from(poseidon2HashBytes(input).subarray(0, 32));
}
```

### 4. CLI Command Implementation

```typescript
// File: cli/cmds/tx/metadata.ts

import { Command } from 'commander';
import { TxHash } from '@aztec/circuits.js';
import { TxMetadataStore } from '../../storage/tx-metadata-store.js';
import { resolveMetadataKey } from '../../utils/metadata-key-resolver.js';
import { SecretManager } from '../../utils/secret-manager.js';
import { getCaztDir } from '../../utils/paths.js';
import path from 'path';

export function createMetadataCommand(): Command {
  const cmd = new Command('metadata')
    .description('Manage transaction metadata');

  cmd
    .command('add <tx-hash>')
    .description('Add metadata to a transaction')
    .option('-l, --label <label>', 'Short label for the transaction')
    .option('-d, --description <desc>', 'Longer description')
    .option('-t, --tags <tags>', 'Comma-separated tags')
    .option('-c, --custom <json>', 'Custom JSON data')
    .option('-k, --keystore <alias>', 'Keystore alias to use (default: "default")')
    .option('-p, --password', 'Prompt for password instead of using keystore')
    .option('--no-encrypt', 'Store without encryption')
    .action(async (txHashStr, options) => {
      const caztDir = getCaztDir();
      const secretManager = new SecretManager(path.join(caztDir, 'keystores'));

      const encryptionKey = await resolveMetadataKey({
        keystore: options.keystore,
        password: options.password,
        noEncrypt: !options.encrypt,
      }, secretManager);

      const store = await TxMetadataStore.open(
        { dataDir: path.join(caztDir, 'tx-metadata') },
        encryptionKey,
      );

      try {
        const txHash = TxHash.fromString(txHashStr);

        await store.addMetadata(txHash, {
          label: options.label,
          description: options.description,
          tags: options.tags?.split(',').map((t: string) => t.trim()),
          custom: options.custom ? JSON.parse(options.custom) : undefined,
        });

        console.log(`Metadata added for ${txHashStr}`);
      } finally {
        await store.close();
      }
    });

  cmd
    .command('get <tx-hash>')
    .description('Get metadata for a transaction')
    .option('-k, --keystore <alias>', 'Keystore alias to use')
    .option('-p, --password', 'Prompt for password')
    .option('--json', 'Output as JSON')
    .action(async (txHashStr, options) => {
      const caztDir = getCaztDir();
      const secretManager = new SecretManager(path.join(caztDir, 'keystores'));

      const encryptionKey = await resolveMetadataKey({
        keystore: options.keystore,
        password: options.password,
      }, secretManager);

      const store = await TxMetadataStore.open(
        { dataDir: path.join(caztDir, 'tx-metadata') },
        encryptionKey,
      );

      try {
        const txHash = TxHash.fromString(txHashStr);
        const metadata = await store.getMetadata(txHash);

        if (!metadata) {
          console.log(`No metadata found for ${txHashStr}`);
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(metadata, null, 2));
        } else {
          console.log(`Transaction: ${metadata.txHash}`);
          if (metadata.label) console.log(`Label: ${metadata.label}`);
          if (metadata.description) console.log(`Description: ${metadata.description}`);
          if (metadata.tags?.length) console.log(`Tags: ${metadata.tags.join(', ')}`);
          if (metadata.contractAddress) console.log(`Contract: ${metadata.contractAddress}`);
          if (metadata.functionName) console.log(`Function: ${metadata.functionName}`);
          console.log(`Created: ${new Date(metadata.createdAt).toISOString()}`);
          console.log(`Updated: ${new Date(metadata.updatedAt).toISOString()}`);
          if (metadata.custom) {
            console.log(`Custom: ${JSON.stringify(metadata.custom)}`);
          }
        }
      } finally {
        await store.close();
      }
    });

  cmd
    .command('list')
    .description('List all transaction metadata')
    .option('--tag <tag>', 'Filter by tag')
    .option('--contract <address>', 'Filter by contract address')
    .option('--user <address>', 'Filter by user address')
    .option('--limit <n>', 'Limit results', parseInt)
    .option('-k, --keystore <alias>', 'Keystore alias to use')
    .option('-p, --password', 'Prompt for password')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const caztDir = getCaztDir();
      const secretManager = new SecretManager(path.join(caztDir, 'keystores'));

      const encryptionKey = await resolveMetadataKey({
        keystore: options.keystore,
        password: options.password,
      }, secretManager);

      const store = await TxMetadataStore.open(
        { dataDir: path.join(caztDir, 'tx-metadata') },
        encryptionKey,
      );

      try {
        const entries = await store.listMetadata({
          tag: options.tag,
          contractAddress: options.contract,
          userAddress: options.user,
          limit: options.limit,
        });

        if (options.json) {
          console.log(JSON.stringify(entries, null, 2));
        } else if (entries.length === 0) {
          console.log('No metadata entries found');
        } else {
          for (const entry of entries) {
            const label = entry.label ?? '(no label)';
            const tags = entry.tags?.length ? ` [${entry.tags.join(', ')}]` : '';
            console.log(`${entry.txHash.slice(0, 18)}... - ${label}${tags}`);
          }
          console.log(`\nTotal: ${entries.length} entries`);
        }
      } finally {
        await store.close();
      }
    });

  cmd
    .command('delete <tx-hash>')
    .description('Delete metadata for a transaction')
    .option('-k, --keystore <alias>', 'Keystore alias to use')
    .option('-p, --password', 'Prompt for password')
    .action(async (txHashStr, options) => {
      const caztDir = getCaztDir();
      const secretManager = new SecretManager(path.join(caztDir, 'keystores'));

      const encryptionKey = await resolveMetadataKey({
        keystore: options.keystore,
        password: options.password,
      }, secretManager);

      const store = await TxMetadataStore.open(
        { dataDir: path.join(caztDir, 'tx-metadata') },
        encryptionKey,
      );

      try {
        const txHash = TxHash.fromString(txHashStr);
        const deleted = await store.deleteMetadata(txHash);

        if (deleted) {
          console.log(`Metadata deleted for ${txHashStr}`);
        } else {
          console.log(`No metadata found for ${txHashStr}`);
        }
      } finally {
        await store.close();
      }
    });

  // Export and import commands...
  // (similar pattern)

  return cmd;
}
```

---

## Directory Structure

```
~/.cazt/
├── config.json                    # Global cazt configuration (optional)
│   {
│     "defaultKeystore": "default",
│     "dataDir": "~/.cazt",
│     "multiUserMode": false
│   }
│
├── keystores/                     # EXISTING: Encrypted secrets
│   ├── default                    # Default keystore (GETH format)
│   ├── work                       # Work wallet keystore
│   ├── personal                   # Personal wallet keystore
│   └── keys.json                  # Plaintext keys (--no-encrypt)
│
└── tx-metadata/                   # NEW: LMDB database for metadata
    ├── data.mdb
    └── lock.mdb
```

---

## File Locations

| Component | Location |
|-----------|----------|
| MetadataCipher | `cli/utils/metadata-cipher.ts` |
| TxMetadataStore | `cli/storage/tx-metadata-store.ts` |
| Key Resolver | `cli/utils/metadata-key-resolver.ts` |
| CLI Commands | `cli/cmds/tx/metadata.ts` |
| SecretManager | `cli/utils/secret-manager.ts` (EXISTING) |
| EncryptedKeystore | `cli/utils/encrypted-keystore.ts` (EXISTING) |
| Password Utils | `cli/utils/password.ts` (EXISTING) |

---

## Implementation Phases

### Phase 1: Core Local Storage (MVP)
1. ~~Implement secret management~~ (ALREADY EXISTS)
2. Implement `MetadataCipher` (AES-256-GCM)
3. Implement `TxMetadataStore` with LMDB
4. Implement `resolveMetadataKey` integration
5. CLI commands: `add`, `get`, `list`, `delete`
6. Unit tests

### Phase 2: Enhanced Features
1. CLI commands: `update`, `export`, `import`
2. Multi-user mode support
3. Integration tests
4. `SentTxWithMetadata` wrapper (optional)

### Phase 3: Cloud Sync (Future)
1. Design cloud API
2. Implement sync client
3. CLI commands: `sync push`, `sync pull`, `sync status`
4. Conflict resolution

---

## Security Considerations

### Encryption
- **Tier 1 (Key Storage):** GETH keystore-compatible (scrypt + AES-128-CTR)
- **Tier 2 (Metadata):** AES-256-GCM with random nonce per entry
- **Key derivation:** Poseidon2 with domain separation
- **Integrity:** GCM authentication tag prevents tampering

### Local Storage
- Reuses existing `SecretManager` security model
- LMDB provides atomic transactions
- File permissions inherited from existing implementation

### Key Management
- Default keystore stored encrypted with user password
- Multiple keystores supported via aliases
- Domain-separated key derivation prevents cross-purpose key reuse
- `--no-encrypt` available for testing but discouraged for real data

---

## Migration from V2 Spec

If implementing from the V2 spec, the following changes are needed:

| V2 | V3 | Reason |
|----|----|----|
| `~/.cazt/secrets/` | `~/.cazt/keystores/` | Align with existing |
| `SecretStore` class | Use `SecretManager` | Already implemented |
| `KeystoreEncryptor` | Use `EncryptedKeystore` | Already implemented |
| `cazt secrets *` | `cazt key *` | Already implemented |
| Scrypt per entry | AES-GCM per entry | Performance |
| `encrypted` field in metadata | Magic header detection | Can't read field if encrypted |

---

## Open Questions

1. **Session key caching:** Should we cache the decrypted key in memory during a CLI session? (Reduces password prompts for batch operations)
2. **Multi-device:** How to handle same user on multiple devices before cloud sync?
3. **Backup reminders:** Should CLI remind users to backup their keystores?
4. **Compression:** Should large custom JSON be compressed before encryption?
5. **Index encryption:** Should tag/contract indices also be encrypted? (Currently plaintext for queryability)
