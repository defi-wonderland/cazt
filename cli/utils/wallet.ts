/**
 * Wallet utility functions for key management
 */

import { Fr } from '@aztec/foundation/fields';
import { deriveKeys } from '@aztec/stdlib/keys';
import { randomBytes } from '@aztec/foundation/crypto';
import { getSchnorrAccountContractAddress } from '@aztec/accounts/schnorr';
import { KeyStore } from './keystore.js';

/**
 * Check if a string looks like a hex field value or numeric string
 */
function isHexOrNumericString(str: string): boolean {
  return /^0x[0-9a-fA-F]+$/.test(str) || /^[0-9]+$/.test(str);
}

/**
 * Convert a string passphrase to a secret key
 * Pads the string to 32 characters with '#' and converts to field element
 */
function passphraseToSecretKey(passphrase: string): Fr {
  // Pad with '#' to 32 characters (right-pad)
  const padded = passphrase.padEnd(32, '#');
  const buffer = Buffer.from(padded, 'utf-8');
  return Fr.fromBufferReduce(buffer);
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
  address: string;
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
  address: string;
  createdAt: string;
  updatedAt: string;
  warning: string;
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
      warning: 'SECURITY WARNING: Store this secret key securely. Anyone with access can control associated accounts.',
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

    // Derive the address for this key
    const { address } = await this.deriveAddress(normalizedSecret);

    // Store the key in the keystore
    await KeyStore.save(alias, normalizedSecret, force);

    return {
      alias,
      secret: normalizedSecret,
      address,
      stored: true,
      keystorePath: KeyStore.getKeysFilePath(),
      warning: 'SECURITY WARNING: Your secret key is stored locally. Ensure proper file permissions and backup.',
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

    // Derive the address for verification
    const { address } = await this.deriveAddress(storedKey.secret);

    return {
      alias: storedKey.alias,
      secret: storedKey.secret,
      address,
      createdAt: storedKey.createdAt,
      updatedAt: storedKey.updatedAt,
      warning: 'SECURITY WARNING: Handle this secret key carefully. Anyone with access can control associated accounts.',
    };
  }
}
