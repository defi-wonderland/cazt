import {
  encodeArguments,
  decodeFromAbi,
  decodeFunctionSignature,
  bufferAsFields,
  isAddressStruct,
  isEthAddressStruct,
  isAztecAddressStruct,
  isFunctionSelectorStruct,
  isWrappedFieldStruct,
  isBoundedVecStruct,
  loadContractArtifact,
  loadContractArtifactForPublic,
  contractArtifactToBuffer,
  contractArtifactFromBuffer,
} from '@aztec/stdlib/abi';
import { Fr } from '@aztec/foundation/fields';
import { Helpers } from './helpers.js';

/**
 * ABI utility functions
 */
export class AbiUtils {
  static abiEncode(params: string): any {
    const p = JSON.parse(params);
    return encodeArguments(p.abi, p.args);
  }

  static abiDecode(params: string): any {
    const p = JSON.parse(params);
    const fields = p.fields.map((f: string) => Helpers.stringToFr(f));
    return decodeFromAbi(p.types, fields);
  }

  static decodeFunctionSignature(params: string): string {
    const p = JSON.parse(params);
    return decodeFunctionSignature(p.name, p.parameters);
  }

  static bufferAsFields(params: string): string[] {
    const p = JSON.parse(params);
    const buffer = Buffer.from(p.buffer, 'hex');
    return bufferAsFields(buffer, p.targetLength).map((f: Fr) => f.toString());
  }

  static isAddressStruct(abiType: string): boolean {
    try {
      const type = JSON.parse(abiType);
      return isAddressStruct(type);
    } catch {
      return false;
    }
  }

  static isEthAddressStruct(abiType: string): boolean {
    try {
      const type = JSON.parse(abiType);
      return isEthAddressStruct(type);
    } catch {
      return false;
    }
  }

  static isAztecAddressStruct(abiType: string): boolean {
    try {
      const type = JSON.parse(abiType);
      return isAztecAddressStruct(type);
    } catch {
      return false;
    }
  }

  static isFunctionSelectorStruct(abiType: string): boolean {
    try {
      const type = JSON.parse(abiType);
      return isFunctionSelectorStruct(type);
    } catch {
      return false;
    }
  }

  static isWrappedFieldStruct(abiType: string): boolean {
    try {
      const type = JSON.parse(abiType);
      return isWrappedFieldStruct(type);
    } catch {
      return false;
    }
  }

  static isBoundedVecStruct(abiType: string): boolean {
    try {
      const type = JSON.parse(abiType);
      return isBoundedVecStruct(type);
    } catch {
      return false;
    }
  }

  static loadContractArtifact(noirContract: string): any {
    const art = JSON.parse(noirContract);
    return loadContractArtifact(art);
  }

  static loadContractArtifactForPublic(noirContract: string): any {
    const art = JSON.parse(noirContract);
    return loadContractArtifactForPublic(art);
  }

  static contractArtifactToBuffer(artifact: string): string {
    const art = JSON.parse(artifact);
    return contractArtifactToBuffer(art).toString('hex');
  }

  static contractArtifactFromBuffer(buffer: string): any {
    const buf = Buffer.from(buffer, 'hex');
    return contractArtifactFromBuffer(buf);
  }
}

