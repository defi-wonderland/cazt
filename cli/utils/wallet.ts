/**
 * Wallet utility functions for key management
 */

import { Fr, Fq, Point } from '@aztec/foundation/fields';
import { deriveKeys } from '@aztec/stdlib/keys';
import { randomBytes, Schnorr, SchnorrSignature } from '@aztec/foundation/crypto';
import { poseidon2Hash } from '@aztec/foundation/crypto/sync';
import { getSchnorrAccountContractAddress } from '@aztec/accounts/schnorr';
import { KeyStore } from './keystore.js';
import { WARNINGS } from '../constants.js';

/**
 * Check if a string looks like a hex field value or numeric string
 */
function isHexOrNumericString(str: string): boolean {
  return /^0x[0-9a-fA-F]+$/.test(str) || /^[0-9]+$/.test(str);
}

/**
 * Convert a message string to a Buffer
 * If message starts with 0x and is valid hex, treat as hex-encoded bytes
 * Otherwise, treat as a UTF-8 string (including strings like "0xhello")
 */
function messageToBuffer(message: string): Buffer {
  if (message.startsWith('0x')) {
    const hexStr = message.slice(2);
    // Check if it's valid hex - if so, treat as bytes; otherwise treat as UTF-8 string
    if (/^[0-9a-fA-F]*$/.test(hexStr) && hexStr.length > 0) {
      return Buffer.from(hexStr, 'hex');
    }
  }
  // Treat as UTF-8 string
  return Buffer.from(message, 'utf8');
}

/**
 * Convert a string passphrase to a secret key
 * Pads the string to 32 characters with '#' and hashes with Poseidon2
 */
function passphraseToSecretKey(passphrase: string): Fr {
  // Pad with '#' to 32 characters (right-pad)
  const padded = passphrase.padEnd(32, '#');
  const buffer = Buffer.from(padded, 'utf-8');
  const fieldElement = Fr.fromBufferReduce(buffer);
  // Hash with Poseidon2 for proper key derivation
  return poseidon2Hash([fieldElement]);
}

/**
 * Resolve a secret key from either a direct input or an alias
 * @param secret - Direct secret key (optional)
 * @param alias - Alias to load from keystore (optional)
 * @returns The resolved secret key string
 * @throws Error if neither or both are provided
 */
export async function resolveSecret(secret?: string, alias?: string): Promise<string> {
  if (secret && alias) {
    throw new Error('Cannot specify both <secret> and --alias. Use one or the other.');
  }
  if (!secret && !alias) {
    throw new Error('Must specify either <secret> or --alias <name>.');
  }

  if (alias) {
    const storedKey = await KeyStore.load(alias);
    return storedKey.secret;
  }

  return secret!;
}

/**
 * Result type for key generation
 */
export interface GeneratedKey {
  secretKey: string;
  warning: string;
}

/**
 * Result type for derived keys
 */
export interface DerivedKeys {
  secretKeys: {
    masterNullifierSecretKey: string;
    masterIncomingViewingSecretKey: string;
    masterOutgoingViewingSecretKey: string;
    masterTaggingSecretKey: string;
  };
  publicKeys?: {
    masterNullifierPublicKey: string;
    masterIncomingViewingPublicKey: string;
    masterOutgoingViewingPublicKey: string;
    masterTaggingPublicKey: string;
  };
}

/**
 * Result type for key import
 */
export interface ImportedKey {
  alias: string;
  secret: string;
  stored: boolean;
  keystorePath: string;
  warning: string;
}

/**
 * Result type for key export
 */
export interface ExportedKey {
  alias: string;
  secret: string;
  createdAt: string;
  updatedAt: string;
  warning: string;
}

/**
 * Result type for listing keys
 */
export interface ListedKeys {
  aliases: string[];
}

/**
 * Result type for signing a message
 */
export interface SignedMessage {
  message: string;
  signature: string;
  publicKey: string;
}

/**
 * Result type for verifying a signature
 */
export interface VerifiedSignature {
  message: string;
  signature: string;
  publicKey: string;
  valid: boolean;
}

/**
 * Wallet utilities for key operations
 */
export class WalletUtils {
  /**
   * Generate a new random secret key
   */
  static async generateKey(_params: string): Promise<GeneratedKey> {
    const secretKeyBuffer = randomBytes(32);
    const secretKey = Fr.fromBuffer(secretKeyBuffer);

    return {
      secretKey: secretKey.toString(),
      warning: WARNINGS.KEY_GENERATE,
    };
  }

  /**
   * Derive keys from a secret key
   * @param secretKeyStr - Secret key as a string (hex or decimal)
   * @param includePublic - Whether to include public keys in the output
   * @returns The derived secret keys and optionally public keys
   */
  static async deriveKeysFromSecret(secretKeyStr: string, includePublic: boolean = false): Promise<DerivedKeys> {
    const secretKey = Fr.fromString(secretKeyStr);

    // Derive all keys from secret
    const keys = await deriveKeys(secretKey);

    const result: DerivedKeys = {
      secretKeys: {
        masterNullifierSecretKey: keys.masterNullifierSecretKey.toString(),
        masterIncomingViewingSecretKey: keys.masterIncomingViewingSecretKey.toString(),
        masterOutgoingViewingSecretKey: keys.masterOutgoingViewingSecretKey.toString(),
        masterTaggingSecretKey: keys.masterTaggingSecretKey.toString(),
      },
    };

    if (includePublic) {
      result.publicKeys = {
        masterNullifierPublicKey: keys.publicKeys.masterNullifierPublicKey.toString(),
        masterIncomingViewingPublicKey: keys.publicKeys.masterIncomingViewingPublicKey.toString(),
        masterOutgoingViewingPublicKey: keys.publicKeys.masterOutgoingViewingPublicKey.toString(),
        masterTaggingPublicKey: keys.publicKeys.masterTaggingPublicKey.toString(),
      };
    }

    return result;
  }

  /**
   * Derive account address from a secret key or passphrase
   * @param secretKeyStr - Secret key (hex/decimal) or passphrase string
   * @param saltStr - Optional salt for address derivation (defaults to 0)
   * @returns The computed Aztec account address and optionally the derived secret key
   */
  static async deriveAddress(secretKeyStr: string, saltStr?: string): Promise<{ address: string; secretKey?: string }> {
    let secretKey: Fr;
    let derivedSecretKey: string | undefined;

    // If it's not a hex/numeric string, treat it as a passphrase
    if (!isHexOrNumericString(secretKeyStr)) {
      secretKey = passphraseToSecretKey(secretKeyStr);
      derivedSecretKey = secretKey.toString();
    } else {
      secretKey = Fr.fromString(secretKeyStr);
    }

    const salt = saltStr ? Fr.fromString(saltStr) : Fr.ZERO;

    // Compute the Schnorr account contract address
    const address = await getSchnorrAccountContractAddress(secretKey, salt);

    return {
      address: address.toString(),
      ...(derivedSecretKey && { secretKey: derivedSecretKey }),
    };
  }

  /**
   * Import a secret key with an alias for local storage
   * @param secretKeyStr - Secret key as a string (hex or decimal)
   * @param alias - Alias to store the key under
   * @param force - Whether to overwrite existing alias
   * @returns Information about the imported key
   */
  static async importKey(secretKeyStr: string, alias: string, force: boolean = false): Promise<ImportedKey> {
    // Validate that the secret key is a valid field element
    let secretKey: Fr;
    try {
      secretKey = Fr.fromString(secretKeyStr);
    } catch (error: any) {
      throw new Error(`Invalid secret key: ${error.message}`);
    }

    // Normalize the secret key to hex format
    const normalizedSecret = secretKey.toString();

    // Validate alias format
    if (!KeyStore.isValidAlias(alias)) {
      throw new Error(
        `Invalid alias '${alias}'. Must start with letter/underscore, contain only alphanumeric/underscore/dash, and be 1-64 characters.`
      );
    }

    // Store the key in the keystore
    await KeyStore.save(alias, normalizedSecret, force);

    return {
      alias,
      secret: normalizedSecret,
      stored: true,
      keystorePath: KeyStore.getKeysFilePath(),
      warning: WARNINGS.KEY_IMPORT,
    };
  }

  /**
   * Export a secret key by its alias from local storage
   * @param alias - Alias of the key to export
   * @returns Information about the exported key including timestamps
   */
  static async exportKey(alias: string): Promise<ExportedKey> {
    // Load the key from keystore
    const storedKey = await KeyStore.load(alias);

    return {
      alias: storedKey.alias,
      secret: storedKey.secret,
      createdAt: storedKey.createdAt,
      updatedAt: storedKey.updatedAt,
      warning: WARNINGS.KEY_EXPORT,
    };
  }

  /**
   * List all stored key aliases
   * @returns Array of all stored key aliases
   */
  static async listKeys(): Promise<ListedKeys> {
    // Get all stored keys from keystore
    const storedKeys = await KeyStore.list();

    // Extract just the aliases and return
    return {
      aliases: storedKeys.map(k => k.alias),
    };
  }

  /**
   * Sign a message using Schnorr signature
   * @param message - The message to sign (string or hex-encoded bytes with 0x prefix)
   * @param secretKeyStr - Secret key as a string (hex or decimal) or passphrase
   * @returns The signed message with signature, public key, and optionally the derived secret key
   */
  static async signMessage(message: string, secretKeyStr: string): Promise<SignedMessage & { derivedSecretKey?: string }> {
    // Validate and convert the secret key to Fr first
    let secretKeyFr: Fr;
    let derivedSecretKey: string | undefined;
    
    // If it's not a hex/numeric string, treat it as a passphrase
    if (!isHexOrNumericString(secretKeyStr)) {
      secretKeyFr = passphraseToSecretKey(secretKeyStr);
      derivedSecretKey = secretKeyFr.toString();
    } else {
      try {
        secretKeyFr = Fr.fromString(secretKeyStr);
      } catch (error: any) {
        throw new Error(`Invalid secret key: ${error.message}`);
      }
    }

    // Convert Fr to Fq (GrumpkinScalar) for Schnorr operations
    // We do this by converting to buffer and back
    const secretKey = Fq.fromBuffer(secretKeyFr.toBuffer());

    // Convert the message to a buffer
    const messageBuffer = messageToBuffer(message);

    // Create a Schnorr signer instance
    const schnorr = new Schnorr();

    // Compute the public key from the private key
    const publicKey = await schnorr.computePublicKey(secretKey);

    // Sign the message
    const signature = await schnorr.constructSignature(messageBuffer, secretKey);

    return {
      message,
      signature: signature.toString(),
      publicKey: publicKey.toString(),
      ...(derivedSecretKey && { derivedSecretKey }),
    };
  }

  /**
   * Verify a Schnorr signature
   * @param message - The message that was signed (string or hex-encoded bytes with 0x prefix)
   * @param signatureStr - The signature to verify (hex string)
   * @param publicKeyStr - The public key to verify against (hex string)
   * @returns The verification result with message, signature, public key, and validity
   */
  static async verifySignature(
    message: string,
    signatureStr: string,
    publicKeyStr: string
  ): Promise<VerifiedSignature> {
    // Validate and parse the signature
    let signature: SchnorrSignature;
    try {
      signature = SchnorrSignature.fromString(signatureStr);
    } catch (error: any) {
      throw new Error(`Invalid signature: ${error.message}`);
    }

    // Validate and parse the public key
    let publicKey: Point;
    try {
      publicKey = Point.fromString(publicKeyStr);
    } catch (error: any) {
      throw new Error(`Invalid public key: ${error.message}`);
    }

    // Convert the message to a buffer
    const messageBuffer = messageToBuffer(message);

    // Create a Schnorr verifier instance
    const schnorr = new Schnorr();

    // Verify the signature
    const valid = await schnorr.verifySignature(messageBuffer, publicKey, signature);

    return {
      message,
      signature: signatureStr,
      publicKey: publicKeyStr,
      valid,
    };
  }
}
