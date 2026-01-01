import { AztecAddress } from '@aztec/aztec.js/addresses';
import { EthAddress } from '@aztec/foundation/eth-address';
import { keccak256, sha256ToField, poseidon2Hash, poseidon2HashWithSeparator, pedersenHash } from '@aztec/foundation/crypto';
import { GeneratorIndex } from '@aztec/constants';
import {
  hashVK,
  computeNoteHashNonce,
  siloNoteHash,
  computeUniqueNoteHash,
  siloPrivateLog,
  computeVarArgsHash,
  computeCalldataHash,
  computeSecretHash,
  siloNullifier,
  computePublicDataTreeLeafSlot,
  computeL1ToL2MessageNullifier,
  computeL2ToL1MessageHash,
} from '@aztec/stdlib/hash';
import { Helpers } from './helpers.js';

/**
 * Hash utility functions
 */
export class HashUtils {
  static async keccak(data: string): Promise<string> {
    let bytes: Buffer;
    
    if (data.startsWith('0x')) {
      // Hex input: check for odd number of digits
      const hexPart = data.slice(2);
      if (hexPart.length % 2 !== 0) {
        throw new Error('odd number of digits');
      }
      bytes = Buffer.from(hexPart, 'hex');
    } else {
      // Non-hex input: treat as UTF-8 string (can contain letters, etc.)
      bytes = Buffer.from(data, 'utf8');
    }
    
    const result = keccak256(bytes);
    return result.toString('hex');
  }

  static async sha256(data: string): Promise<string> {
    let bytes: Buffer;
    if (data.startsWith('0x')) {
      bytes = Buffer.from(data.slice(2), 'hex');
    } else {
      bytes = Buffer.from(data, 'utf8');
    }
    // sha256ToField expects an array of Bufferable, so wrap in array
    const field = await sha256ToField([bytes]);
    return field.toString();
  }

  static async poseidon2(fields: string): Promise<string> {
    const fieldsArray = JSON.parse(fields);
    const frFields = fieldsArray.map((f: string) => Helpers.stringToFr(f));
    const result = await poseidon2Hash(frFields);
    return result.toString();
  }

  static async computePedersenHash(params: string): Promise<string> {
    const p = JSON.parse(params);
    const inputs = p.inputs;
    const index = p.index || 0; // Optional hash index (default 0)

    if (!inputs || !Array.isArray(inputs)) {
      throw new Error('inputs must be a JSON array');
    }

    // Convert inputs to Fieldable[] (can be Fr, Buffer, string, etc.)
    // Use stringToFr which treats 0x-prefixed as hex, everything else as UTF-8
    const inputFields = inputs.map((item: string) => {
      return Helpers.stringToFr(item);
    });

    // Compute Pedersen hash
    const hash = await pedersenHash(inputFields, index);
    
    return hash.toString();
  }

  static async secretHash(secret: string): Promise<string> {
    const fr = Helpers.stringToFr(secret);
    const result = await computeSecretHash(fr);
    return result.toString();
  }

  static async siloNullifier(contract: string, nullifier: string): Promise<string> {
    const normalizedContract = Helpers.normalizeAddress(contract);
    const contractAddr = AztecAddress.fromString(normalizedContract);
    const nullifierFr = Helpers.stringToFr(nullifier);
    const result = await siloNullifier(contractAddr, nullifierFr);
    return result.toString();
  }

  static async publicDataSlot(contract: string, slot: string): Promise<string> {
    const normalizedContract = Helpers.normalizeAddress(contract);
    const contractAddr = AztecAddress.fromString(normalizedContract);
    const slotFr = Helpers.stringToFr(slot);
    const result = await computePublicDataTreeLeafSlot(contractAddr, slotFr);
    return result.toString();
  }

  static async hashVK(fields: string): Promise<string> {
    const fieldsArray = JSON.parse(fields);
    const frFields = fieldsArray.map((f: string) => Helpers.stringToFr(f));
    const result = await hashVK(frFields);
    return result.toString();
  }

  static async noteHashNonce(nullifierZero: string, index: number): Promise<string> {
    const nullifierFr = Helpers.stringToFr(nullifierZero);
    const result = await computeNoteHashNonce(nullifierFr, index);
    return result.toString();
  }

  static async siloNoteHash(contract: string, noteHash: string): Promise<string> {
    const normalizedContract = Helpers.normalizeAddress(contract);
    const contractAddr = AztecAddress.fromString(normalizedContract);
    const noteHashFr = Helpers.stringToFr(noteHash);
    const result = await siloNoteHash(contractAddr, noteHashFr);
    return result.toString();
  }

  static async uniqueNoteHash(nonce: string, siloedNoteHash: string): Promise<string> {
    const nonceFr = Helpers.stringToFr(nonce);
    const siloedFr = Helpers.stringToFr(siloedNoteHash);
    const result = await computeUniqueNoteHash(nonceFr, siloedFr);
    return result.toString();
  }

  static async siloPrivateLog(contract: string, tag: string): Promise<string> {
    const contractAddr = AztecAddress.fromString(contract);
    const tagFr = Helpers.stringToFr(tag);
    const result = await siloPrivateLog(contractAddr, tagFr);
    return result.toString();
  }

  static async varArgsHash(fields: string): Promise<string> {
    const fieldsArray = JSON.parse(fields);
    const frFields = fieldsArray.map((f: string) => Helpers.stringToFr(f));
    const result = await computeVarArgsHash(frFields);
    return result.toString();
  }

  static async calldataHash(calldata: string): Promise<string> {
    const calldataArray = JSON.parse(calldata);
    const frFields = calldataArray.map((f: string) => Helpers.stringToFr(f));
    const result = await computeCalldataHash(frFields);
    return result.toString();
  }

  static async l1ToL2MessageNullifier(contract: string, messageHash: string, secret: string): Promise<string> {
    const contractAddr = AztecAddress.fromString(contract);
    const messageHashFr = Helpers.stringToFr(messageHash);
    const secretFr = Helpers.stringToFr(secret);
    const result = await computeL1ToL2MessageNullifier(contractAddr, messageHashFr, secretFr);
    return result.toString();
  }

  static async l2ToL1MessageHash(params: string): Promise<string> {
    const p = JSON.parse(params);
    const result = await computeL2ToL1MessageHash({
      l2Sender: AztecAddress.fromString(p.l2Sender),
      l1Recipient: EthAddress.fromString(p.l1Recipient),
      content: Helpers.stringToFr(p.content),
      rollupVersion: Helpers.stringToFr(p.rollupVersion),
      chainId: Helpers.stringToFr(p.chainId),
    });
    return result.toString();
  }
}

