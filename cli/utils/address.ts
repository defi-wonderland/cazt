import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Helpers } from './helpers.js';

/**
 * AztecAddress utility functions
 */
export class AddressUtils {
  static addressZero(): string {
    return AztecAddress.ZERO.toString();
  }

  static addressValidate(address: string): { valid: boolean; address?: string; error?: string } {
    try {
      const addr = AztecAddress.fromString(address);
      return { valid: true, address: addr.toString() };
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }

  static async addressRandom(): Promise<string> {
    return (await AztecAddress.random()).toString();
  }

  static async addressIsValid(address: string): Promise<boolean> {
    const addr = AztecAddress.fromString(address);
    return await addr.isValid();
  }

  static async addressToPoint(address: string): Promise<{ x: string; y: string }> {
    const addr = AztecAddress.fromString(address);
    const point = await addr.toAddressPoint();
    return { x: point.x.toString(), y: point.y.toString() };
  }

  static addressFromField(field: string): string {
    const fr = Helpers.stringToFr(field);
    return AztecAddress.fromField(fr).toString();
  }

  static addressFromBigInt(value: string): string {
    return AztecAddress.fromBigInt(BigInt(value)).toString();
  }

  static addressFromNumber(value: number): string {
    return AztecAddress.fromNumber(value).toString();
  }
}

