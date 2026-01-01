import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/aztec.js/addresses';

/**
 * Helper utilities used across multiple utility modules
 */
export class Helpers {
  /**
   * Validate hex string has even number of digits (byte-aligned)
   * Throws error if odd number of digits, matching keccak behavior
   */
  static validateHexString(value: string): void {
    if (value.startsWith('0x')) {
      const hexPart = value.slice(2);
      if (hexPart.length % 2 !== 0) {
        throw new Error('odd number of digits');
      }
    }
  }

  /**
   * Convert string to Fr field
   * - If it's a hex string (starts with 0x), validate it has even number of digits and parse as hex
   * - Otherwise, treat as UTF-8 string
   */
  static stringToFr(value: string): Fr {
    // If it's a hex string (starts with 0x), validate it has even number of digits and parse as hex
    if (value.startsWith('0x')) {
      this.validateHexString(value);
      return new Fr(BigInt(value));
    }
    // Otherwise, treat as UTF-8 string
    const buffer = Buffer.from(value, 'utf8');
    const padded = Buffer.alloc(32);
    buffer.copy(padded, 0, 0, Math.min(buffer.length, 32));
    return Fr.fromBuffer(padded);
  }

  /**
   * Normalize address (pad to 32 bytes if needed)
   */
  static normalizeAddress(address: string): string {
    if (address.startsWith('0x')) {
      const hex = address.slice(2);
      // Pad to 64 hex chars (32 bytes)
      return `0x${hex.padStart(64, '0')}`;
    }
    // If no 0x prefix, assume it's already hex and pad
    return `0x${address.padStart(64, '0')}`;
  }
}

