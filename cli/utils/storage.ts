import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/foundation/fields';
import { deriveStorageSlotInMap } from '@aztec/stdlib/hash';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import { Helpers } from './helpers.js';

/**
 * Storage utility functions
 */
export class StorageUtils {
  /**
   * Derive storage slot in a map
   * @param params - JSON string with:
   *   - baseSlot: string - Base storage slot (Fr)
   *   - key: string - Key for the map (can be AztecAddress or Fr)
   * @returns Derived storage slot
   */
  static async deriveNoteSlot(params: string): Promise<string> {
    const p = JSON.parse(params);
    const baseSlot = Helpers.stringToFr(p.baseSlot);
    
    // Key can be an AztecAddress or a field
    let keyFr: Fr;
    try {
      // Try as AztecAddress first
      const keyAddress = AztecAddress.fromString(p.key);
      keyFr = keyAddress.toField();
    } catch {
      // If not an address, treat as field
      keyFr = Helpers.stringToFr(p.key);
    }
    
    const result = await deriveStorageSlotInMap(baseSlot, { toField: () => keyFr });
    return result.toString();
  }

  /**
   * Get storage layout from contract artifact
   * @param params - JSON string with:
   *   - artifact: any - Contract artifact JSON (NoirCompiledContract)
   * @returns Storage layout information
   */
  static getStorageLayout(params: string): any {
    const p = JSON.parse(params);
    const artifactJson = p.artifact;
    
    if (!artifactJson) {
      throw new Error('artifact is required');
    }
    
    // Load the contract artifact
    let contractArtifact;
    try {
      contractArtifact = loadContractArtifact(artifactJson as any);
    } catch (error: any) {
      throw new Error(`Failed to load contract artifact: ${error.message}`);
    }
    
    if (!contractArtifact.storageLayout) {
      return {
        error: 'Contract artifact does not have storageLayout',
        artifactName: contractArtifact.name,
      };
    }
    
    // Format storage layout for output
    const layout: any = {};
    for (const [name, slotInfo] of Object.entries(contractArtifact.storageLayout)) {
      layout[name] = {
        slot: (slotInfo as any).slot?.toString(),
        typ: (slotInfo as any).typ,
      };
    }
    
    return {
      artifactName: contractArtifact.name,
      storageLayout: layout,
    };
  }
}

