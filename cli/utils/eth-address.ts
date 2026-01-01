import { EthAddress } from '@aztec/foundation/eth-address';
import { Helpers } from './helpers.js';

/**
 * EthAddress utility functions
 */
export class EthAddressUtils {
  static ethAddressZero(): string {
    return EthAddress.ZERO.toString();
  }

  static async ethAddressRandom(): Promise<string> {
    return EthAddress.random().toString();
  }

  static ethAddressValidate(address: string): { valid: boolean; address?: string; error?: string } {
    try {
      const addr = EthAddress.fromString(address);
      return { valid: true, address: addr.toString() };
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }

  static ethAddressFromField(field: string): string {
    const fr = Helpers.stringToFr(field);
    return EthAddress.fromField(fr).toString();
  }

  static ethAddressToField(address: string): string {
    const addr = EthAddress.fromString(address);
    return addr.toField().toString();
  }

  static ethAddressIsZero(address: string): boolean {
    const addr = EthAddress.fromString(address);
    return addr.isZero();
  }
}

