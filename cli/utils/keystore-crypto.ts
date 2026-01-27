/**
 * Keystore Cryptography Utilities
 *
 * Shared encryption/decryption logic for GETH keystore format.
 * Used by both EncryptedKeystore and TxMetadataStore.
 *
 * Format follows Ethereum's Web3 Secret Storage Definition:
 * - scrypt for key derivation (N=262144, r=8, p=1)
 * - AES-128-CTR for encryption
 * - keccak256 for MAC
 */

import * as crypto from 'crypto';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { keccak256 } from '@aztec/foundation/crypto/keccak';
import { scrypt } from '@noble/hashes/scrypt';

/**
 * Keystore crypto section structure
 */
export interface KeystoreCrypto {
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
 * Keystore blob structure (without id field for embedded use)
 */
export interface KeystoreBlob {
  crypto: KeystoreCrypto;
  version: 3;
}

/**
 * Default scrypt parameters (same as GETH keystore standard)
 */
export const DEFAULT_SCRYPT_PARAMS = {
  N: 262144, // Cost parameter (2^18)
  r: 8,      // Block size
  p: 1,      // Parallelization
  dkLen: 32, // Derived key length
};

/**
 * Encrypts data using GETH keystore format (scrypt + AES-128-CTR)
 *
 * @param data - Data to encrypt
 * @param password - Password for encryption
 * @param scryptParams - Optional custom scrypt parameters
 * @returns Encrypted keystore blob as Buffer (JSON)
 */
export function encryptKeystoreBlob(
  data: Buffer,
  password: string,
  scryptParams?: Partial<typeof DEFAULT_SCRYPT_PARAMS>
): Buffer {
  const params = { ...DEFAULT_SCRYPT_PARAMS, ...scryptParams };

  // Generate random salt and IV
  const salt = randomBytes(32);
  const iv = randomBytes(16);

  // Derive key using scrypt
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

  // Encrypt using AES-128-CTR
  const cipher = crypto.createCipheriv('aes-128-ctr', encryptionKey, Buffer.from(iv));
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);

  // Calculate MAC: keccak256(macKey + ciphertext)
  const macData = Buffer.concat([Buffer.from(macKey), ciphertext]);
  const mac = keccak256(macData);

  // Create keystore structure
  const keystoreBlob: KeystoreBlob = {
    crypto: {
      cipher: 'aes-128-ctr',
      cipherparams: { iv: Buffer.from(iv).toString('hex') },
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
    version: 3,
  };

  return Buffer.from(JSON.stringify(keystoreBlob), 'utf-8');
}

/**
 * Decrypts data from GETH keystore format
 *
 * @param encryptedBlob - Encrypted keystore blob (JSON Buffer)
 * @param password - Password for decryption
 * @returns Decrypted data
 * @throws Error if password is invalid or format is wrong
 */
export function decryptKeystoreBlob(encryptedBlob: Buffer, password: string): Buffer {
  // Parse keystore JSON
  let keystore: KeystoreBlob;
  try {
    keystore = JSON.parse(encryptedBlob.toString('utf-8'));
  } catch {
    throw new Error('Invalid keystore data: not valid JSON');
  }

  if (keystore.version !== 3) {
    throw new Error(`Unsupported keystore version: ${keystore.version}`);
  }

  if (keystore.crypto.cipher !== 'aes-128-ctr') {
    throw new Error(`Unsupported cipher: ${keystore.crypto.cipher}`);
  }

  if (keystore.crypto.kdf !== 'scrypt') {
    throw new Error(`Unsupported KDF: ${keystore.crypto.kdf}`);
  }

  const { kdfparams, cipherparams, ciphertext: ciphertextHex, mac: storedMacHex } = keystore.crypto;
  const salt = Buffer.from(kdfparams.salt, 'hex');
  const iv = Buffer.from(cipherparams.iv, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const storedMac = Buffer.from(storedMacHex, 'hex');

  // Derive key using scrypt
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
  const decipher = crypto.createDecipheriv('aes-128-ctr', encryptionKey, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * AES-128-CTR encryption (for use by EncryptedKeystore with separate key derivation)
 */
export function aesCtrEncrypt(data: Buffer, key: Buffer, iv: Buffer): Buffer {
  const cipher = crypto.createCipheriv('aes-128-ctr', key, iv);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/**
 * AES-128-CTR decryption (for use by EncryptedKeystore with separate key derivation)
 */
export function aesCtrDecrypt(data: Buffer, key: Buffer, iv: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-128-ctr', key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}
