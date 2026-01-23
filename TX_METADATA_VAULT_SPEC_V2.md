# Transaction Metadata Vault V2 - Technical Specification

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
  txHash: TxHash;                    // Primary key (or composite with userAddress)
  userAddress?: AztecAddress;        // Optional: for multi-user support
  createdAt: number;                 // Unix timestamp
  updatedAt: number;                 // Last modification
  label?: string;                    // Short human-readable label
  description?: string;              // Longer description/context
  tags?: string[];                   // Categorization tags
  custom?: Record<string, unknown>;  // Arbitrary JSON data

  // Auto-captured (optional)
  contractAddress?: AztecAddress;    // If known
  functionName?: string;             // If known
  simulationResult?: {
    gasUsed: bigint;
    revertReason?: string;
  };
}
```

---

## Storage Location

### Default: `.cazt/tx_metadata/`

Unlike PXE data (which lives in PXE's LMDB), transaction metadata is stored in a **separate LMDB** inside the `.cazt` folder:

```
~/.cazt/
├── tx_metadata/
│   ├── data.mdb          # LMDB data file
│   └── lock.mdb          # LMDB lock file
├── config.json           # cazt configuration
└── secrets/              # Stored secrets with aliases
    └── default.enc       # Default encryption secret
```

**Why separate from PXE?**
- Metadata is user-facing, not protocol data
- Can be backed up/exported independently
- Doesn't affect PXE sync or state
- Different lifecycle than notes/nullifiers

### Storage Structure (LMDB)

```
AztecLMDBStoreV2 @ ~/.cazt/tx_metadata/
├── map:tx_metadata                    (key -> encrypted/plaintext blob)
│     key = txHash OR txHash:userAddress (multi-user)
├── multimap:tx_metadata_by_tag        (tag -> key[])
├── multimap:tx_metadata_by_contract   (contract -> key[])
└── multimap:tx_metadata_by_user       (userAddress -> key[])
```

---

## Encryption

### Primary Method: Keystore-Compatible Encryption (GETH/Cast)

The default encryption method matches the standard used by:
- Ethereum keystores (Web3 Secret Storage)
- GETH nodes
- Foundry's `cast wallet`

This ensures compatibility and uses a well-audited, battle-tested approach.

**Standard:** [Web3 Secret Storage Definition](https://ethereum.org/en/developers/docs/data-structures-and-encoding/web3-secret-storage/)

```typescript
// Keystore format (simplified)
interface KeystoreEncryption {
  crypto: {
    cipher: 'aes-128-ctr';
    cipherparams: { iv: string };      // 16 bytes, hex
    ciphertext: string;                 // Encrypted data, hex
    kdf: 'scrypt' | 'pbkdf2';
    kdfparams: {
      // For scrypt:
      n: number;      // CPU/memory cost (262144 recommended)
      r: number;      // Block size (8)
      p: number;      // Parallelization (1)
      dklen: number;  // Derived key length (32)
      salt: string;   // Random salt, hex
    };
    mac: string;      // SHA3-256(derived_key[16:32] + ciphertext)
  };
  version: 3;
}
```

**Implementation Note:** Do not reimplement - use existing libraries:
- `@ethereumjs/wallet`
- `ethers.Wallet.encrypt()`
- Or the Aztec equivalent if available

### Encryption Key Sources

Three options for providing the encryption key:

#### Option 1: Stored Secret with Alias (Default)

```bash
# First time: create and store a secret
cazt secrets create --alias default
# Prompts for password, derives key, stores encrypted in ~/.cazt/secrets/

# Use stored secret (default behavior)
cazt tx metadata add <tx-hash> --label "My tx"
# Uses ~/.cazt/secrets/default.enc automatically

# Use specific alias
cazt tx metadata add <tx-hash> --label "My tx" --secret my-work-wallet
```

#### Option 2: Password Prompt

```bash
# Prompt for password each time
cazt tx metadata add <tx-hash> --label "My tx" --password
# Enter password: ********
```

#### Option 3: No Encryption (Plaintext)

```bash
# Store in plaintext (for debugging/testing)
cazt tx metadata add <tx-hash> --label "My tx" --no-encrypt
```

### Key Derivation Options & Security Analysis

When deriving an encryption key from an Aztec account, there are several approaches:

#### Option A: Use Account Secret Directly

```typescript
// Simple: just use the secret key bytes
const encryptionKey = masterSecretKey.toBuffer().subarray(0, 32);
```

**Security Analysis:**
- ⚠️ **Risk:** If metadata is compromised, attacker has the actual secret key
- ⚠️ **Risk:** Same key used for multiple purposes (signing, encryption)
- ✅ **Benefit:** Simple, no additional derivation
- ❌ **Not Recommended** for production

#### Option B: Derive with Domain Separator (Recommended for Account-Based)

```typescript
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { GeneratorIndex } from '@aztec/constants';

// Derive a purpose-specific key
const encryptionKey = await poseidon2Hash([
  masterSecretKey.hi,
  masterSecretKey.lo,
  GeneratorIndex.SYMMETRIC_KEY,  // Or new: GeneratorIndex.METADATA_ENCRYPTION
]);
```

**Security Analysis:**
- ✅ **Benefit:** Compromised metadata key doesn't reveal master key
- ✅ **Benefit:** Domain separation (different keys for different purposes)
- ✅ **Benefit:** Standard cryptographic practice
- ⚠️ **Consideration:** Requires access to master key at encryption time

#### Option C: Password-Based (Independent of Account)

```typescript
// Using scrypt (GETH keystore standard)
const derivedKey = scrypt(password, salt, { N: 262144, r: 8, p: 1, dkLen: 32 });
```

**Security Analysis:**
- ✅ **Benefit:** Completely independent of Aztec keys
- ✅ **Benefit:** Portable - works without wallet
- ✅ **Benefit:** Can use different passwords for different security levels
- ⚠️ **Consideration:** Password strength is user's responsibility
- ⚠️ **Consideration:** Lost password = lost metadata

#### Recommendation

| Use Case | Recommended Option |
|----------|-------------------|
| **Default (stored secret)** | Option C (password-based, stored encrypted) |
| **Quick testing** | `--no-encrypt` |
| **Account-linked** | Option B (derived with domain separator) |
| **Never** | Option A (raw secret key) |

The default should be **Option C with stored secrets** because:
1. Independent of Aztec account lifecycle
2. Can be backed up separately
3. User controls the password
4. Compatible with keystore standard

---

## CLI Interface

All commands use the `cazt` CLI:

```bash
# ─────────────────────────────────────────────────────────────
# Secret Management
# ─────────────────────────────────────────────────────────────

# Create a new secret (will prompt for password)
cazt secrets create --alias <name>
cazt secrets create --alias default

# List stored secrets
cazt secrets list

# Delete a secret
cazt secrets delete --alias <name>

# ─────────────────────────────────────────────────────────────
# Add Metadata
# ─────────────────────────────────────────────────────────────

# Basic - uses default secret
cazt tx metadata add <tx-hash> --label "Swap ETH for DAI"

# With more fields
cazt tx metadata add <tx-hash> \
  --label "DEX Swap" \
  --description "Swapped 1 ETH for DAI on Uniswap" \
  --tags "defi,swap,uniswap"

# With custom JSON data
cazt tx metadata add <tx-hash> \
  --label "Transfer" \
  --json '{"recipient": "alice.eth", "amount": "100", "token": "DAI"}'

# Using specific secret
cazt tx metadata add <tx-hash> --label "Work tx" --secret work-wallet

# With password prompt
cazt tx metadata add <tx-hash> --label "My tx" --password

# Plaintext (no encryption)
cazt tx metadata add <tx-hash> --label "Test tx" --no-encrypt

# ─────────────────────────────────────────────────────────────
# Query Metadata
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
# Update & Delete
# ─────────────────────────────────────────────────────────────

# Update existing metadata
cazt tx metadata update <tx-hash> --label "New label" --tags "updated,tags"

# Delete metadata
cazt tx metadata delete <tx-hash>

# Delete with user (multi-user mode)
cazt tx metadata delete <tx-hash> --user <user-address>

# ─────────────────────────────────────────────────────────────
# Export & Import
# ─────────────────────────────────────────────────────────────

# Export all metadata (encrypted with current secret)
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

### 1. TxMetadataDataProvider

```typescript
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import { TxHash } from '@aztec/stdlib/tx';

export interface StoredTxMetadata {
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
  encrypted: boolean;  // Flag to indicate if this entry is encrypted
}

export interface TxMetadataDataProviderOptions {
  multiUserMode?: boolean;
  defaultUserAddress?: string;
}

export class TxMetadataDataProvider {
  #store: AztecAsyncKVStore;
  #metadata: AztecAsyncMap<string, Buffer>;
  #metadataByTag: AztecAsyncMultiMap<string, string>;
  #metadataByContract: AztecAsyncMultiMap<string, string>;
  #metadataByUser: AztecAsyncMultiMap<string, string>;
  #options: TxMetadataDataProviderOptions;

  constructor(
    store: AztecAsyncKVStore,
    options: TxMetadataDataProviderOptions = {}
  ) {
    this.#store = store;
    this.#options = options;
    this.#metadata = store.openMap('tx_metadata');
    this.#metadataByTag = store.openMultiMap('tx_metadata_by_tag');
    this.#metadataByContract = store.openMultiMap('tx_metadata_by_contract');
    this.#metadataByUser = store.openMultiMap('tx_metadata_by_user');
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
    metadata: Omit<StoredTxMetadata, 'txHash' | 'encrypted'>,
    encryptor?: MetadataEncryptor,  // undefined = plaintext
    userAddress?: AztecAddress
  ): Promise<void> {
    const key = this.#getKey(txHash, userAddress);
    const fullMetadata: StoredTxMetadata = {
      ...metadata,
      txHash: txHash.toString(),
      userAddress: userAddress?.toString() ?? this.#options.defaultUserAddress,
      createdAt: metadata.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      encrypted: !!encryptor,
    };

    const plaintext = Buffer.from(JSON.stringify(fullMetadata), 'utf-8');
    const stored = encryptor ? await encryptor.encrypt(plaintext) : plaintext;

    return this.#store.transactionAsync(async () => {
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
    decryptor?: MetadataEncryptor,
    userAddress?: AztecAddress
  ): Promise<StoredTxMetadata | undefined> {
    const key = this.#getKey(txHash, userAddress);
    const stored = await this.#metadata.getAsync(key);
    if (!stored) return undefined;

    // Try to parse as JSON first (plaintext)
    try {
      const parsed = JSON.parse(stored.toString('utf-8'));
      if (!parsed.encrypted) return parsed;
    } catch {
      // Not plaintext JSON, must be encrypted
    }

    // Decrypt
    if (!decryptor) {
      throw new Error('Metadata is encrypted but no decryptor provided');
    }
    const decrypted = await decryptor.decrypt(stored);
    return JSON.parse(decrypted.toString('utf-8'));
  }

  // ... other methods similar to V1
}
```

### 2. MetadataEncryptor Interface

```typescript
/**
 * Interface for metadata encryption/decryption.
 * Primary implementation uses GETH keystore-compatible encryption.
 */
export interface MetadataEncryptor {
  encrypt(plaintext: Buffer): Promise<Buffer>;
  decrypt(ciphertext: Buffer): Promise<Buffer>;
}

/**
 * GETH Keystore-compatible encryption.
 * Uses scrypt for key derivation and AES-128-CTR for encryption.
 */
export class KeystoreEncryptor implements MetadataEncryptor {
  constructor(private password: string) {}

  async encrypt(plaintext: Buffer): Promise<Buffer> {
    // Use ethers.js or @ethereumjs/wallet implementation
    // This is the Web3 Secret Storage standard
    const keystore = await encryptKeystore(plaintext, this.password, {
      scrypt: { N: 262144, r: 8, p: 1 }
    });
    return Buffer.from(JSON.stringify(keystore));
  }

  async decrypt(ciphertext: Buffer): Promise<Buffer> {
    const keystore = JSON.parse(ciphertext.toString());
    return decryptKeystore(keystore, this.password);
  }
}

/**
 * No encryption - stores plaintext.
 * Use with --no-encrypt flag.
 */
export class PlaintextEncryptor implements MetadataEncryptor {
  async encrypt(plaintext: Buffer): Promise<Buffer> {
    return plaintext;
  }
  async decrypt(ciphertext: Buffer): Promise<Buffer> {
    return ciphertext;
  }
}
```

### 3. Secret Storage

```typescript
/**
 * Manages stored secrets with aliases.
 * Secrets are stored encrypted using GETH keystore format.
 */
export class SecretStore {
  private secretsDir: string;

  constructor(caztDir: string = '~/.cazt') {
    this.secretsDir = path.join(caztDir, 'secrets');
  }

  async createSecret(alias: string, password: string): Promise<void> {
    // Generate random 32-byte secret
    const secret = crypto.randomBytes(32);

    // Encrypt with keystore format
    const encryptor = new KeystoreEncryptor(password);
    const encrypted = await encryptor.encrypt(secret);

    // Store
    const filePath = path.join(this.secretsDir, `${alias}.enc`);
    await fs.writeFile(filePath, encrypted);
  }

  async getSecret(alias: string, password: string): Promise<Buffer> {
    const filePath = path.join(this.secretsDir, `${alias}.enc`);
    const encrypted = await fs.readFile(filePath);

    const encryptor = new KeystoreEncryptor(password);
    return encryptor.decrypt(encrypted);
  }

  async listSecrets(): Promise<string[]> {
    const files = await fs.readdir(this.secretsDir);
    return files
      .filter(f => f.endsWith('.enc'))
      .map(f => f.replace('.enc', ''));
  }

  async deleteSecret(alias: string): Promise<void> {
    const filePath = path.join(this.secretsDir, `${alias}.enc`);
    await fs.unlink(filePath);
  }
}
```

### 4. Transaction Wrapper (Auto-Capture)

```typescript
/**
 * Extended SentTx that automatically captures metadata.
 *
 * Usage:
 *   const tx = await contract.methods.transfer(to, amount)
 *     .send()
 *     .withMetadata({
 *       label: 'Transfer to Alice',
 *       tags: ['transfer', 'token'],
 *     });
 *   await tx.wait();
 */
export class SentTxWithMetadata extends SentTx {
  private metadataProvider?: TxMetadataDataProvider;
  private encryptor?: MetadataEncryptor;
  private pendingMetadata?: Partial<StoredTxMetadata>;

  static wrap(
    sentTx: SentTx,
    metadataProvider: TxMetadataDataProvider,
    encryptor?: MetadataEncryptor
  ): SentTxWithMetadata {
    const wrapped = new SentTxWithMetadata(sentTx.wallet, sentTx.getTxHash());
    wrapped.metadataProvider = metadataProvider;
    wrapped.encryptor = encryptor;
    return wrapped;
  }

  withMetadata(metadata: Partial<StoredTxMetadata>): this {
    this.pendingMetadata = metadata;
    return this;
  }

  async wait(opts?: WaitOpts): Promise<TxReceipt> {
    const receipt = await super.wait(opts);

    if (this.pendingMetadata && this.metadataProvider) {
      const txHash = await this.getTxHash();
      await this.metadataProvider.addMetadata(
        txHash,
        {
          ...this.pendingMetadata,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          // Auto-capture from receipt
          simulationResult: {
            gasUsed: receipt.transactionFee,
            revertReason: receipt.error,
          },
        },
        this.encryptor
      );
    }

    return receipt;
  }
}
```

---

## Directory Structure

```
~/.cazt/
├── config.json                    # Global cazt configuration
│   {
│     "defaultSecret": "default",
│     "dataDir": "~/.cazt",
│     "multiUserMode": false
│   }
│
├── secrets/                       # Encrypted secrets with aliases
│   ├── default.enc               # Default secret (keystore format)
│   ├── work.enc                  # Work wallet secret
│   └── personal.enc              # Personal wallet secret
│
└── tx_metadata/                   # LMDB database for metadata
    ├── data.mdb
    └── lock.mdb
```

---

## Future: Cloud Sync API (Not Implemented)

> **Note:** This section documents the planned cloud sync feature for future implementation.
> Current focus is on local storage with encryption/decryption.

### API Design

```typescript
interface CloudSyncAPI {
  // Upload encrypted metadata blob
  POST /api/v1/metadata
  Body: {
    accountId: string;           // Derived from public key or user ID
    encryptedBlob: string;       // Base64 encoded keystore
    checksum: string;            // SHA256 of blob
    timestamp: number;           // For conflict resolution
  }

  // List user's metadata
  GET /api/v1/metadata?accountId=<id>&since=<timestamp>
  Response: {
    blobs: Array<{ checksum: string; timestamp: number; blob: string }>
  }

  // Delete specific metadata
  DELETE /api/v1/metadata/<checksum>?accountId=<id>

  // Sync status
  GET /api/v1/metadata/status?accountId=<id>
  Response: {
    count: number;
    lastSync: number;
    storageUsed: number;
  }
}
```

### Sync Commands (Future)

```bash
# Push local metadata to cloud
cazt tx metadata sync push

# Pull cloud metadata to local
cazt tx metadata sync pull

# Full sync (bidirectional)
cazt tx metadata sync

# Check sync status
cazt tx metadata sync status
```

### Security Model (Future)
- Server only stores encrypted blobs
- Server never has access to plaintext or encryption keys
- Client encrypts before upload, decrypts after download
- Checksum verification prevents tampering

---

## Security Considerations

### Encryption
- **Primary:** GETH keystore-compatible (scrypt + AES-128-CTR)
- **Key derivation:** scrypt with N=262144, r=8, p=1 (same as GETH default)
- **MAC:** SHA3-256 for integrity verification
- **Compatibility:** Can be decrypted by any Web3 keystore tool

### Local Storage
- Secrets stored encrypted, never plaintext
- LMDB provides atomic transactions
- File permissions should restrict access

### Key Management
- Default secret stored encrypted with user password
- Multiple secrets supported via aliases
- `--no-encrypt` available for testing but discouraged for real data

---

## File Locations

| Component | Location |
|-----------|----------|
| Data Provider | `packages/cazt/src/storage/tx_metadata_data_provider.ts` |
| Encryptor | `packages/cazt/src/crypto/metadata_encryptor.ts` |
| Secret Store | `packages/cazt/src/storage/secret_store.ts` |
| CLI Commands | `packages/cazt/src/commands/tx/metadata.ts` |
| Tx Wrapper | `packages/cazt/src/tx/sent_tx_with_metadata.ts` |
| Config | `packages/cazt/src/config/index.ts` |

---

## Implementation Phases

### Phase 1: Core Local Storage (MVP)
1. Create LMDB store in `~/.cazt/tx_metadata/`
2. Implement `TxMetadataDataProvider`
3. Implement `KeystoreEncryptor` (use existing library)
4. Implement `SecretStore` for alias management
5. CLI commands: `add`, `get`, `list`, `delete`
6. Unit tests

### Phase 2: Enhanced Features
1. CLI commands: `update`, `export`, `import`
2. `SentTxWithMetadata` wrapper
3. Multi-user mode support
4. Integration tests

### Phase 3: Cloud Sync (Future)
1. Design cloud API
2. Implement sync client
3. CLI commands: `sync push`, `sync pull`, `sync status`
4. Conflict resolution

---

## Open Questions

1. **Secret caching:** Should we cache decrypted secrets in memory during a session?
2. **Multi-device:** How to handle same user on multiple devices before cloud sync?
3. **Migration:** How to migrate from V1 storage format (if any)?
4. **Backup reminders:** Should CLI remind users to backup their secrets?
5. **Password requirements:** Should we enforce minimum password strength?
6. **Timeout:** Should decrypted secrets timeout after inactivity?
