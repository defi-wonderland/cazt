/**
 * Encrypted Keystore Implementation
 *
 * Creates password-encrypted keystore files following Ethereum's
 * Web3 Secret Storage Definition (used by Geth/Foundry/etc).
 *
 * Uses:
 * - AES-128-CTR for encryption (standard Ethereum cipher)
 * - scrypt for key derivation (from @noble/hashes/scrypt)
 * - keccak256 for MAC calculation
 *
 * File format is JSON with the structure:
 * {
 *   "crypto": {
 *     "cipher": "aes-128-ctr",
 *     "cipherparams": { "iv": "hex" },
 *     "ciphertext": "hex",
 *     "kdf": "scrypt",
 *     "kdfparams": { "dklen": 32, "n": 262144, "r": 8, "p": 1, "salt": "hex" },
 *     "mac": "hex"
 *   },
 *   "id": "uuid",
 *   "version": 3
 * }
 *
 * This format is compatible with go-ethereum, Foundry, and other Ethereum tools.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { keccak256 } from '@aztec/foundation/crypto/keccak';
import { scrypt } from '@noble/hashes/scrypt';
import { getKeystoresDir } from './paths.js';
import { aesCtrEncrypt, aesCtrDecrypt, DEFAULT_SCRYPT_PARAMS as SHARED_SCRYPT_PARAMS } from './keystore-crypto.js';

/**
 * Interface for the crypto section of a keystore file
 */
interface KeystoreCrypto {
  cipher: 'aes-128-ctr';
  cipherparams: {
    iv: string;
  };
  ciphertext: string;
  kdf: 'scrypt';
  kdfparams: {
    dklen: number;
    n: number;
    r: number;
    p: number;
    salt: string;
  };
  mac: string;
}

/**
 * Interface for a complete keystore file
 */
export interface KeystoreFile {
  crypto: KeystoreCrypto;
  id: string;
  version: 3;
}

/**
 * Result of creating a keystore file
 */
export interface CreateKeystoreResult {
  path: string;
  id: string;
}

/**
 * Result of decrypting a keystore file
 */
export interface DecryptKeystoreResult {
  secret: string;
  id: string;
}

/**
 * Default scrypt parameters (re-exported from shared module)
 */
const DEFAULT_SCRYPT_PARAMS = SHARED_SCRYPT_PARAMS;

/**
 * Default keystore directory (uses centralized paths)
 */
const DEFAULT_KEYSTORE_DIR = getKeystoresDir();

/**
 * Get the default keystore directory
 */
export function getDefaultKeystoreDir(): string {
  return DEFAULT_KEYSTORE_DIR;
}

/**
 * Resolve a keystore name to a full file path
 * @param name - Keystore name (or full path if contains path separators)
 * @param keystoreDir - Optional custom keystore directory
 * @returns Full path to the keystore file
 */
export function resolveKeystorePath(name: string, keystoreDir?: string): string {
  // If name contains path separators or is an absolute path, use it as-is
  if (name.includes(path.sep) || path.isAbsolute(name)) {
    return path.resolve(name);
  }
  // Otherwise, treat as a name in the keystore directory
  const dir = keystoreDir || DEFAULT_KEYSTORE_DIR;
  return path.join(dir, name);
}

/**
 * Generate a UUID v4
 */
function generateUuid(): string {
  return crypto.randomUUID();
}

// aesCtrEncrypt and aesCtrDecrypt are imported from keystore-crypto.js

/**
 * Encrypted Keystore Utilities
 *
 * Creates and manages password-encrypted keystore files.
 * Compatible with Ethereum's Web3 Secret Storage Definition.
 */
export class EncryptedKeystore {
  private static readonly FILE_MODE = 0o600; // Read/write for owner only

  /**
   * Create an encrypted keystore file
   *
   * @param secret - The secret key to encrypt (hex string with 0x prefix)
   * @param password - The password to encrypt with
   * @param filePath - Path to write the keystore file
   * @param scryptParams - Optional custom scrypt parameters
   * @returns Information about the created keystore
   */
  static async create(
    secret: string,
    password: string,
    filePath: string,
    scryptParams?: Partial<typeof DEFAULT_SCRYPT_PARAMS>
  ): Promise<CreateKeystoreResult> {
    // Normalize secret key - remove 0x prefix if present
    const cleanSecret = secret.startsWith('0x') ? secret.slice(2) : secret;
    const secretBuffer = Buffer.from(cleanSecret, 'hex');

    // Validate hex string was properly parsed
    if (secretBuffer.length === 0) {
      throw new Error('Invalid secret: empty or invalid hex string');
    }

    // Warn if secret key length is not 32 bytes (standard Aztec Fr size)
    if (secretBuffer.length !== 32) {
      console.warn(`Warning: Secret key is ${secretBuffer.length} bytes (expected 32 bytes for Aztec Fr)`);
    }

    // Generate random salt and IV
    const salt = randomBytes(32);
    const iv = randomBytes(16);

    // Derive key from password using scrypt
    const params = { ...DEFAULT_SCRYPT_PARAMS, ...scryptParams };
    const passwordBuffer = Buffer.from(password, 'utf-8');

    const derivedKey = scrypt(passwordBuffer, salt, {
      N: params.N,
      r: params.r,
      p: params.p,
      dkLen: params.dkLen,
    });

    // Split derived key: first 16 bytes for AES, last 16 bytes for MAC
    const encryptionKey = Buffer.from(derivedKey.slice(0, 16));
    const macKey = derivedKey.slice(16, 32);

    // Encrypt using AES-128-CTR (no padding needed - it's a stream cipher)
    const ciphertext = aesCtrEncrypt(secretBuffer, encryptionKey, Buffer.from(iv));

    // Calculate MAC: keccak256(macKey + ciphertext)
    const macData = Buffer.concat([Buffer.from(macKey), ciphertext]);
    const mac = keccak256(macData);

    // Generate UUID
    const id = generateUuid();

    // Create keystore structure
    const keystore: KeystoreFile = {
      crypto: {
        cipher: 'aes-128-ctr',
        cipherparams: {
          iv: Buffer.from(iv).toString('hex'),
        },
        ciphertext: ciphertext.toString('hex'),
        kdf: 'scrypt',
        kdfparams: {
          dklen: params.dkLen,
          n: params.N,
          r: params.r,
          p: params.p,
          salt: Buffer.from(salt).toString('hex'),
        },
        mac: mac.toString('hex'),
      },
      id,
      version: 3,
    };

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });

    // Write keystore file with restricted permissions
    await fs.writeFile(filePath, JSON.stringify(keystore, null, 2), {
      mode: EncryptedKeystore.FILE_MODE,
    });

    return {
      path: filePath,
      id,
    };
  }

  /**
   * Decrypt an encrypted keystore file
   *
   * @param filePath - Path to the keystore file
   * @param password - The password to decrypt with
   * @returns The decrypted secret key
   */
  static async decrypt(filePath: string, password: string): Promise<DecryptKeystoreResult> {
    // Read and parse keystore file
    const content = await fs.readFile(filePath, 'utf-8');
    let keystore: KeystoreFile;

    try {
      keystore = JSON.parse(content);
    } catch {
      throw new Error('Invalid keystore file: not valid JSON');
    }

    // Validate keystore structure
    if (keystore.version !== 3) {
      throw new Error(`Unsupported keystore version: ${keystore.version}`);
    }

    if (keystore.crypto.cipher !== 'aes-128-ctr') {
      throw new Error(`Unsupported cipher: ${keystore.crypto.cipher}`);
    }

    if (keystore.crypto.kdf !== 'scrypt') {
      throw new Error(`Unsupported KDF: ${keystore.crypto.kdf}`);
    }

    // Extract parameters
    const { kdfparams, cipherparams, ciphertext: ciphertextHex, mac: storedMacHex } = keystore.crypto;
    const salt = Buffer.from(kdfparams.salt, 'hex');
    const iv = Buffer.from(cipherparams.iv, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const storedMac = Buffer.from(storedMacHex, 'hex');

    // Derive key from password using scrypt
    const passwordBuffer = Buffer.from(password, 'utf-8');
    const derivedKey = scrypt(passwordBuffer, salt, {
      N: kdfparams.n,
      r: kdfparams.r,
      p: kdfparams.p,
      dkLen: kdfparams.dklen,
    });

    // Split derived key
    const encryptionKey = Buffer.from(derivedKey.slice(0, 16));
    const macKey = derivedKey.slice(16, 32);

    // Verify MAC
    const macData = Buffer.concat([Buffer.from(macKey), ciphertext]);
    const computedMac = keccak256(macData);

    if (!storedMac.equals(computedMac)) {
      throw new Error('Invalid password: MAC verification failed');
    }

    // Decrypt using AES-128-CTR
    const decrypted = aesCtrDecrypt(ciphertext, encryptionKey, iv);

    // Return as hex string with 0x prefix
    return {
      secret: '0x' + decrypted.toString('hex'),
      id: keystore.id,
    };
  }

  /**
   * Read keystore file metadata without decrypting
   *
   * @param filePath - Path to the keystore file
   * @returns The keystore metadata (without the secret)
   */
  static async readMetadata(filePath: string): Promise<{ id: string; cipher: string; kdf: string }> {
    const content = await fs.readFile(filePath, 'utf-8');
    let keystore: KeystoreFile;

    try {
      keystore = JSON.parse(content);
    } catch {
      throw new Error('Invalid keystore file: not valid JSON');
    }

    return {
      id: keystore.id,
      cipher: keystore.crypto.cipher,
      kdf: keystore.crypto.kdf,
    };
  }

  /**
   * Validate keystore file format
   *
   * @param filePath - Path to the keystore file
   * @returns True if the file is a valid keystore format
   */
  static async isValidKeystore(filePath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const keystore = JSON.parse(content);

      return (
        keystore.version === 3 &&
        keystore.crypto?.cipher === 'aes-128-ctr' &&
        keystore.crypto?.kdf === 'scrypt' &&
        typeof keystore.crypto?.ciphertext === 'string' &&
        typeof keystore.crypto?.mac === 'string' &&
        typeof keystore.crypto?.kdfparams?.salt === 'string' &&
        typeof keystore.crypto?.cipherparams?.iv === 'string' &&
        typeof keystore.id === 'string'
      );
    } catch {
      return false;
    }
  }

  /**
   * List all keystores in a directory
   *
   * @param keystoreDir - Directory to list keystores from (defaults to ~/.cazt/keystores)
   * @returns Object with directory and array of keystores
   */
  static async list(keystoreDir?: string): Promise<{ directory: string; keystores: Array<{ name: string; id: string; path: string }> }> {
    const dir = keystoreDir || DEFAULT_KEYSTORE_DIR;
    const keystores: Array<{ name: string; id: string; path: string }> = [];

    try {
      await fs.access(dir);
    } catch {
      // Directory doesn't exist, return empty list
      return { directory: dir, keystores };
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(dir, entry.name);
        try {
          if (await EncryptedKeystore.isValidKeystore(filePath)) {
            const metadata = await EncryptedKeystore.readMetadata(filePath);
            keystores.push({
              name: entry.name,
              id: metadata.id,
              path: filePath,
            });
          }
        } catch {
          // Skip files that can't be read
        }
      }
    }

    return { directory: dir, keystores };
  }

  // =========================================================================
  // CLI-friendly wrapper methods
  // =========================================================================

  /**
   * Create an encrypted keystore (CLI wrapper)
   * Prompts for password if not provided
   */
  static async createKeystore(
    secret: string,
    name: string,
    options: { password?: string; keystoreDir?: string } = {}
  ): Promise<{
    name: string;
    path: string;
    id: string;
    cipher: string;
    kdf: string;
    warning: string;
  }> {
    const { promptPasswordWithConfirm, promptConfirm } = await import('./password.js');

    // Get password - if not provided, prompt for it
    let password: string;
    const passwordWasProvided = options.password !== undefined;

    if (passwordWasProvided) {
      password = options.password!;
    } else {
      password = await promptPasswordWithConfirm(
        'Enter password to encrypt keystore: ',
        'Confirm password: '
      );

      // Confirm if user entered empty password interactively
      if (password.length === 0) {
        const confirmed = await promptConfirm('Warning: Empty password provides no security. Continue? (y/N): ');
        if (!confirmed) {
          throw new Error('Keystore creation cancelled');
        }
      }
    }

    // Resolve path
    const filePath = resolveKeystorePath(name, options.keystoreDir);

    // Check if file already exists
    try {
      await fs.access(filePath);
      throw new Error(`Keystore '${name}' already exists at ${filePath}`);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }

    // Create the keystore
    const result = await EncryptedKeystore.create(secret, password, filePath);

    return {
      name,
      path: filePath,
      id: result.id,
      cipher: 'aes-128-ctr',
      kdf: 'scrypt',
      warning: 'Remember your password - it cannot be recovered. The keystore file is the only backup of your encrypted secret.',
    };
  }

  /**
   * Unlock (decrypt) a keystore (CLI wrapper)
   * Prompts for password if not provided
   */
  static async unlock(
    name: string,
    options: { password?: string; keystoreDir?: string } = {}
  ): Promise<{
    name: string;
    id: string;
    secret: string;
    warning: string;
  }> {
    const { promptPassword } = await import('./password.js');

    // Resolve path
    const filePath = resolveKeystorePath(name, options.keystoreDir);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`Keystore '${name}' not found at ${filePath}`);
    }

    // Prompt for password if not provided
    const password = options.password || await promptPassword('Enter password to decrypt keystore: ');

    // Decrypt
    const result = await EncryptedKeystore.decrypt(filePath, password);

    return {
      name,
      id: result.id,
      secret: result.secret,
      warning: 'SECURITY WARNING: Handle this secret key carefully. Anyone with access can control associated accounts.',
    };
  }

  /**
   * Inspect keystore metadata (CLI wrapper)
   */
  static async inspect(
    name: string,
    keystoreDir?: string
  ): Promise<{
    name: string;
    path: string;
    id: string;
    version: number;
    cipher: string;
    kdf: string;
  }> {
    const filePath = resolveKeystorePath(name, keystoreDir);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`Keystore '${name}' not found at ${filePath}`);
    }

    // Read file
    const content = await fs.readFile(filePath, 'utf-8');
    let keystore: KeystoreFile;

    try {
      keystore = JSON.parse(content);
    } catch {
      throw new Error('Invalid keystore file: not valid JSON');
    }

    return {
      name,
      path: filePath,
      id: keystore.id,
      version: keystore.version,
      cipher: keystore.crypto.cipher,
      kdf: keystore.crypto.kdf,
    };
  }

  /**
   * Delete a keystore file (CLI wrapper)
   */
  static async delete(
    name: string,
    keystoreDir?: string
  ): Promise<{
    name: string;
    path: string;
  }> {
    const filePath = resolveKeystorePath(name, keystoreDir);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`Keystore '${name}' not found at ${filePath}`);
    }

    // Verify it's a valid keystore before deleting
    if (!await EncryptedKeystore.isValidKeystore(filePath)) {
      throw new Error(`File '${name}' is not a valid keystore`);
    }

    // Delete the file
    await fs.unlink(filePath);

    return {
      name,
      path: filePath,
    };
  }
}
