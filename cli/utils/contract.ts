import { AztecAddress } from '@aztec/aztec.js/addresses';
import {
  computeArtifactHash,
  computeArtifactHashPreimage,
  computeArtifactMetadataHash,
  computeFunctionArtifactHash,
  computeFunctionMetadataHash,
  computeContractAddressFromInstance,
  computePartialAddress,
  computeSaltedInitializationHash,
  computeInitializationHash,
} from '@aztec/stdlib/contract';
import { computePreaddress, computeAddress } from '@aztec/stdlib/keys';
import { Helpers } from './helpers.js';

/**
 * Contract and artifact utility functions
 */
export class ContractUtils {
  static async artifactHash(artifact: string): Promise<string> {
    const art = JSON.parse(artifact);
    const result = await computeArtifactHash(art);
    return result.toString();
  }

  static async artifactHashPreimage(artifact: string): Promise<any> {
    const art = JSON.parse(artifact);
    const preimage = await computeArtifactHashPreimage(art);
    return {
      privateFunctionRoot: preimage.privateFunctionRoot.toString(),
      utilityFunctionRoot: preimage.utilityFunctionRoot.toString(),
      metadataHash: preimage.metadataHash.toString(),
    };
  }

  static artifactMetadataHash(artifact: string): string {
    const art = JSON.parse(artifact);
    return computeArtifactMetadataHash(art).toString();
  }

  static async functionArtifactHash(function_: string): Promise<string> {
    const fn = JSON.parse(function_);
    const result = await computeFunctionArtifactHash(fn);
    return result.toString();
  }

  static functionMetadataHash(function_: string): string {
    const fn = JSON.parse(function_);
    return computeFunctionMetadataHash(fn).toString();
  }

  static async computeContractAddress(instance: string): Promise<string> {
    const inst = JSON.parse(instance);
    // Convert string fields to Fr/AztecAddress as needed
    const convertedInstance = {
      ...inst,
      originalContractClassId: inst.originalContractClassId ? Helpers.stringToFr(inst.originalContractClassId) : undefined,
      saltedInitializationHash: inst.saltedInitializationHash ? Helpers.stringToFr(inst.saltedInitializationHash) : undefined,
      initializationHash: inst.initializationHash ? Helpers.stringToFr(inst.initializationHash) : undefined,
      salt: inst.salt ? Helpers.stringToFr(inst.salt) : undefined,
      deployer: inst.deployer ? AztecAddress.fromString(inst.deployer) : undefined,
      publicKeys: inst.publicKeys ? {
        ...inst.publicKeys,
        // Convert public key fields if needed
      } : undefined,
    };
    const result = await computeContractAddressFromInstance(convertedInstance as any);
    return result.toString();
  }

  static async computePartialAddress(instance: string): Promise<string> {
    const inst = JSON.parse(instance);
    const convertedInstance = {
      ...inst,
      originalContractClassId: inst.originalContractClassId ? Helpers.stringToFr(inst.originalContractClassId) : undefined,
      saltedInitializationHash: inst.saltedInitializationHash ? Helpers.stringToFr(inst.saltedInitializationHash) : undefined,
      initializationHash: inst.initializationHash ? Helpers.stringToFr(inst.initializationHash) : undefined,
      salt: inst.salt ? Helpers.stringToFr(inst.salt) : undefined,
      deployer: inst.deployer ? AztecAddress.fromString(inst.deployer) : undefined,
    };
    const result = await computePartialAddress(convertedInstance as any);
    return result.toString();
  }

  static async computePreaddress(params: string): Promise<string> {
    const p = JSON.parse(params);
    const publicKeysHash = Helpers.stringToFr(p.publicKeysHash);
    const partialAddress = Helpers.stringToFr(p.partialAddress);
    const result = await computePreaddress(publicKeysHash, partialAddress);
    return result.toString();
  }

  static async computeAddressFromKeys(params: string): Promise<string> {
    const p = JSON.parse(params);
    // This requires PublicKeys object which is complex, so we'll need the full object
    // For now, we'll require it to be passed as JSON
    const result = await computeAddress(p.publicKeys as any, Helpers.stringToFr(p.partialAddress));
    return result.toString();
  }

  static async computeSaltedInitializationHash(params: string): Promise<string> {
    const p = JSON.parse(params);
    const converted = {
      initializationHash: Helpers.stringToFr(p.initializationHash),
      salt: Helpers.stringToFr(p.salt),
      deployer: AztecAddress.fromString(p.deployer),
    };
    const result = await computeSaltedInitializationHash(converted);
    return result.toString();
  }

  static async computeInitializationHash(params: string): Promise<string> {
    const p = JSON.parse(params);
    // initFn can be undefined, FunctionAbi, or we can pass it as JSON
    const initFn = p.initFn || undefined;
    const args = p.args || [];
    const result = await computeInitializationHash(initFn, args);
    return result.toString();
  }
}

