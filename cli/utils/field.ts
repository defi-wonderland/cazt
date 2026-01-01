import { Fr } from '@aztec/foundation/fields';
import { Helpers } from './helpers.js';

/**
 * Field utility functions
 */
export class FieldUtils {
  static fieldFromString(value: string): string {
    return Helpers.stringToFr(value).toString();
  }

  static fieldToString(field: string): string {
    return Helpers.stringToFr(field).toString();
  }

  static fieldRandom(): string {
    return Fr.random().toString();
  }

  static fieldFromBuffer(buffer: string): string {
    const buf = Buffer.from(buffer, 'hex');
    return Fr.fromBuffer(buf).toString();
  }

  static fieldToBuffer(field: string): string {
    const fr = Helpers.stringToFr(field);
    return fr.toBuffer().toString('hex');
  }

  static fieldFromBigInt(value: string): string {
    return new Fr(BigInt(value)).toString();
  }

  static fieldToBigInt(field: string): string {
    const fr = Helpers.stringToFr(field);
    return fr.toBigInt().toString();
  }

  static fieldIsZero(field: string): boolean {
    return Helpers.stringToFr(field).isZero();
  }

  static fieldEquals(field1: string, field2: string): boolean {
    return Helpers.stringToFr(field1).equals(Helpers.stringToFr(field2));
  }
}

