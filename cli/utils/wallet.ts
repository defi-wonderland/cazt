/**
 * Wallet utility functions for key management
 */

import { Fr } from '@aztec/foundation/fields';
import { randomBytes } from '@aztec/foundation/crypto';

/**
 * Result type for key generation
 */
export interface GeneratedKey {
  secretKey: string;
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
}
