/**
 * Wallet utility functions for key management
 */

import { Fr } from '@aztec/foundation/fields';
import { deriveKeys } from '@aztec/stdlib/keys';
import { randomBytes } from '@aztec/foundation/crypto';
import { getSchnorrAccountContractAddress } from '@aztec/accounts/schnorr';

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
   * Derive account address from a secret key
   * @param secretKeyStr - Secret key as a string (hex or decimal)
   * @param saltStr - Optional salt for address derivation (defaults to 0)
   * @returns The computed Aztec account address
   */
  static async deriveAddress(secretKeyStr: string, saltStr?: string): Promise<{ address: string }> {
    const secretKey = Fr.fromString(secretKeyStr);
    const salt = saltStr ? Fr.fromString(saltStr) : Fr.ZERO;

    // Compute the Schnorr account contract address
    const address = await getSchnorrAccountContractAddress(secretKey, salt);

    return {
      address: address.toString(),
    };
  }
}
