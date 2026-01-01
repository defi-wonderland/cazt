import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/foundation/fields';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { GeneratorIndex } from '@aztec/constants';
import { getDefaultNodeUrl } from '../config/index.js';
import {
  computeNoteHashNonce,
  siloNoteHash,
  computeUniqueNoteHash,
} from '@aztec/stdlib/hash';
import { encodeArguments } from '@aztec/stdlib/abi';
import { createAztecNodeClient, waitForNode } from '@aztec/aztec.js/node';
import { TestWallet } from '@aztec/test-wallet/server';
import { NoteStatus } from '@aztec/stdlib/note';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import { deriveStorageSlotInMap } from '@aztec/stdlib/hash';
import { Helpers } from './helpers.js';

/**
 * Note utility functions
 */
export class NoteUtils {
  /**
   * Fetch notes from a wallet for a given storage slot
   */
  static async fetchNotes(params: string): Promise<any> {
    const p = JSON.parse(params);
    const debug = p.debug || false;
    
    // Helper function for conditional debug logging
    const debugLog = (...args: any[]) => {
      if (debug) {
        console.log(...args);
      }
    };
    
    debugLog(`[DEBUG] Starting fetchNotes with params:`, {
      nodeUrl: p.nodeUrl || getDefaultNodeUrl(),
      hasSender: !!p.sender,
      hasContractAddress: !!p.contractAddress,
      hasArtifact: !!p.artifact,
      storageSlot: p.storageSlot,
      storageSlotName: p.storageSlotName,
      storageSlotKey: p.storageSlotKey,
      secretKeysCount: p.secretKeys?.length || (p.secretKey ? 1 : 0),
      saltsCount: p.salts?.length || (p.salt ? 1 : 0),
    });
    
    const nodeUrl = p.nodeUrl || getDefaultNodeUrl();
    const senderAddress = p.sender ? AztecAddress.fromString(p.sender) : undefined;
    const contractAddress = p.contractAddress ? AztecAddress.fromString(p.contractAddress) : undefined;
    const artifactJson = p.artifact;
    const contractSecretKey = p.contractSecretKey ? Helpers.stringToFr(p.contractSecretKey) : undefined;
    
    // Support both single and multiple secret keys
    const secretKeys: Fr[] = [];
    if (p.secretKeys && Array.isArray(p.secretKeys)) {
      secretKeys.push(...p.secretKeys.map((sk: string) => Helpers.stringToFr(sk)));
      debugLog(`[DEBUG] Loaded ${secretKeys.length} secret keys from array`);
    } else if (p.secretKey) {
      // Backward compatibility: single secret key
      secretKeys.push(Helpers.stringToFr(p.secretKey));
      debugLog(`[DEBUG] Loaded single secret key`);
    }
    
    // Support both single and multiple salts
    const salts: Fr[] = [];
    if (p.salts && Array.isArray(p.salts)) {
      salts.push(...p.salts.map((s: string) => Helpers.stringToFr(s)));
      debugLog(`[DEBUG] Loaded ${salts.length} salts from array`);
    } else if (p.salt) {
      // Backward compatibility: single salt
      salts.push(Helpers.stringToFr(p.salt));
      debugLog(`[DEBUG] Loaded single salt`);
    }
    
    const status = p.status || 'ACTIVE';
    const siloedNullifier = p.siloedNullifier ? Helpers.stringToFr(p.siloedNullifier) : undefined;
    const scopes = p.scopes ? p.scopes.map((addr: string) => AztecAddress.fromString(addr)) : undefined;
    const storageSlotName = p.storageSlotName;
    const storageSlotKey = p.storageSlotKey;

    // Contract address is required for NotesFilter
    if (!contractAddress) {
      throw new Error('contractAddress is required');
    }
    debugLog(`[DEBUG] Contract address: ${contractAddress.toString()}`);

    // Artifact is required
    if (!artifactJson) {
      throw new Error('artifact is required (provide the Noir compiled contract JSON)');
    }
    debugLog(`[DEBUG] Artifact provided:`, typeof artifactJson === 'object' ? artifactJson.name || 'unnamed' : 'string/json');

    // Load the contract artifact from the JSON (NoirCompiledContract -> ContractArtifact)
    let contractArtifact;
    try {
      debugLog(`[DEBUG] Loading contract artifact...`);
      contractArtifact = loadContractArtifact(artifactJson as any);
      debugLog(`[DEBUG] Contract artifact loaded:`, {
        name: contractArtifact.name,
        hasStorageLayout: !!contractArtifact.storageLayout,
        storageLayoutKeys: contractArtifact.storageLayout ? Object.keys(contractArtifact.storageLayout) : [],
        functionsCount: contractArtifact.functions?.length || 0,
      });
    } catch (error: any) {
      throw new Error(`Failed to load contract artifact: ${error.message}`);
    }

    // Determine storage slot - either from direct value or from artifact name
    let storageSlot: Fr | undefined;
    
    if (p.storageSlot) {
      // Direct storage slot provided
      storageSlot = Helpers.stringToFr(p.storageSlot);
      debugLog(`[DEBUG] Using direct storage slot: ${storageSlot.toString()}`);
    } else if (storageSlotName) {
      // Storage slot name provided - look it up in artifact
      debugLog(`[DEBUG] Looking up storage slot name: "${storageSlotName}"`);
      if (!contractArtifact.storageLayout) {
        throw new Error('Contract artifact does not have storageLayout');
      }
      
      const baseSlotInfo = contractArtifact.storageLayout[storageSlotName];
      if (!baseSlotInfo) {
        throw new Error(`Storage slot "${storageSlotName}" not found in contract artifact. Available slots: ${Object.keys(contractArtifact.storageLayout).join(', ')}`);
      }
      
      const baseSlot = baseSlotInfo.slot;
      debugLog(`[DEBUG] Found base slot for "${storageSlotName}": ${baseSlot.toString()}`);
      
      if (storageSlotKey) {
        // Derive slot for map with key using the utility function
        debugLog(`[DEBUG] Deriving slot with key: ${storageSlotKey}`);
        const keyFr = Helpers.stringToFr(storageSlotKey);
        // Try as AztecAddress first, then as field
        let keyForDerivation: { toField: () => Fr };
        try {
          const keyAddress = AztecAddress.fromString(storageSlotKey);
          keyForDerivation = { toField: () => keyAddress.toField() };
          debugLog(`[DEBUG] Key interpreted as AztecAddress: ${keyAddress.toString()}`);
        } catch {
          keyForDerivation = { toField: () => keyFr };
          debugLog(`[DEBUG] Key interpreted as Field: ${keyFr.toString()}`);
        }
        
        storageSlot = await deriveStorageSlotInMap(baseSlot, keyForDerivation);
        debugLog(`[DEBUG] Derived storage slot: ${storageSlot.toString()}`);
      } else {
        // Use base slot directly
        storageSlot = baseSlot;
        debugLog(`[DEBUG] Using base slot directly: ${storageSlot.toString()}`);
      }
    } else {
      debugLog(`[DEBUG] No storage slot specified`);
    }

    // Create node client and wait for it to be ready
    debugLog(`[DEBUG] Creating node client for: ${nodeUrl}`);
    const node = createAztecNodeClient(nodeUrl);
    await waitForNode(node);
    debugLog(`[DEBUG] Node is ready`);

    // Create wallet using TestWallet
    debugLog(`[DEBUG] Creating TestWallet...`);
    const wallet = await TestWallet.create(node, {
      proverEnabled: false,
    });
    debugLog(`[DEBUG] Wallet created`);

    // Get PXE from wallet - TestWallet should have a pxe property
    const pxe = (wallet as any).pxe || (wallet as any).getPXE?.();
    if (!pxe) {
      throw new Error('Unable to access PXE from wallet');
    }
    debugLog(`[DEBUG] PXE accessed from wallet`);

    let contractInstance = await node.getContract(contractAddress);
    debugLog(`[DEBUG] Got contract instance from node:`, {
      address: contractInstance?.address.toString(),
    });
    await pxe.registerContract({ instance: contractInstance, artifact: contractArtifact });
    debugLog(`[DEBUG] Contract registered in PXE`);

    let accountManagers: any[] = [];
    
    // Register sender address if provided
    if (senderAddress) {
      debugLog(`[DEBUG] Registering sender address: ${senderAddress.toString()}`);
      await wallet.registerSender(senderAddress);
      debugLog(`[DEBUG] Sender address registered`);
    } else {
      debugLog(`[DEBUG] No sender address provided`);
    }

    // Create multiple accounts if secret keys are provided
    if (secretKeys.length > 0) {
      debugLog(`[DEBUG] Creating ${secretKeys.length} account(s)...`);
      
      for (let i = 0; i < secretKeys.length; i++) {
        const secretKey = secretKeys[i];
        // Use corresponding salt, or Fr.ZERO if not provided
        const saltToUse = i < salts.length ? salts[i] : Fr.ZERO;
        
        debugLog(`[DEBUG] Creating account ${i + 1}/${secretKeys.length}:`, {
          secretKey: secretKey.toString().substring(0, 20) + '...',
          salt: saltToUse.toString(),
        });
        const accountManager = await wallet.createSchnorrAccount(secretKey, saltToUse);
        accountManagers.push(accountManager);
        debugLog(`[DEBUG] Account ${i + 1} created:`, {
          address: accountManager.address.toString(),
        });
      }
    } else {
      debugLog(`[DEBUG] No secret keys provided for account creation`);
    }

    // Register the contract with the loaded artifact
    // contractSecretKey is optional - if not provided, contract will be registered without decryption key
    debugLog(`[DEBUG] Registering contract in wallet:`, {
      address: contractAddress.toString(),
      artifactName: contractArtifact.name || 'unknown',
      hasSecretKey: !!contractSecretKey,
    });

    try {
      // Get contract metadata to verify it exists
      debugLog(`[DEBUG] Checking contract metadata...`);
      const contractMetadata = await pxe.getContractMetadata(contractAddress);
      if (!contractMetadata) {
        throw new Error(`Contract not found at address ${contractAddress}`);
      }
      debugLog(`[DEBUG] Contract metadata:`, {
        isContractPublished: contractMetadata.isContractPublished,
        contractClassId: contractMetadata.contractClassId?.toString(),
      });

      // Register the contract with the loaded artifact and optional secret key
      await wallet.registerContract(
        contractAddress,
        contractArtifact,
        contractSecretKey || undefined
      );
      debugLog(`[DEBUG] Contract registered successfully in wallet`);
    } catch (error: any) {
      debugLog(`[DEBUG] Registration error:`, error.message);
      debugLog(`[DEBUG] Error stack:`, error.stack);
      // If registration fails, it might already be registered, so continue
      // Only throw if it's a critical error
      if (!error.message?.includes('already registered') && 
          !error.message?.includes('already exists') &&
          !error.message?.includes('has not been registered')) {
        throw new Error(`Failed to register contract: ${error.message}`);
      } else {
        debugLog(`[DEBUG] Contract may already be registered, continuing...`);
      }
    }

    // Determine scopes - combine provided scopes with all account manager addresses
    debugLog(`[DEBUG] Determining scopes...`);
    let finalScopes: AztecAddress[] = [];
    
    // Add provided scopes
    if (scopes && scopes.length > 0) {
      finalScopes.push(...scopes);
      debugLog(`[DEBUG] Added ${scopes.length} provided scope(s):`, scopes.map((a: AztecAddress) => a.toString()));
    }
    
    // Add all account manager addresses to scopes
    if (accountManagers.length > 0) {
      const accountAddresses = accountManagers.map(am => am.address);
      finalScopes.push(...accountAddresses);
      debugLog(`[DEBUG] Added ${accountManagers.length} account manager address(es) to scopes:`, accountAddresses.map((a: AztecAddress) => a.toString()));
    }
    
    // Remove duplicates
    const uniqueScopes = Array.from(new Set(finalScopes.map(addr => addr.toString())))
      .map(addrStr => AztecAddress.fromString(addrStr));
    
    if (uniqueScopes.length === 0) {
      debugLog(`[DEBUG] No scopes specified`);
    } else {
      debugLog(`[DEBUG] Final scopes (${uniqueScopes.length}):`, uniqueScopes.map(a => a.toString()));
    }

    // Build NotesFilter according to the type definition
    debugLog(`[DEBUG] Building notes filter...`);
    const notesFilter: any = {
      contractAddress: contractAddress,
    };

    // Add optional fields
    if (storageSlot) {
      notesFilter.storageSlot = storageSlot;
      debugLog(`[DEBUG] Storage slot in filter: ${storageSlot.toString()}`);
    }

    if (status) {
      notesFilter.status = NoteStatus[status as keyof typeof NoteStatus] || NoteStatus.ACTIVE;
      debugLog(`[DEBUG] Status in filter: ${status}`);
    }

    if (siloedNullifier) {
      notesFilter.siloedNullifier = siloedNullifier;
      debugLog(`[DEBUG] Siloed nullifier in filter: ${siloedNullifier.toString()}`);
    }

    if (uniqueScopes.length > 0) {
      notesFilter.scopes = uniqueScopes;
      debugLog(`[DEBUG] Scopes in filter (${uniqueScopes.length}):`, uniqueScopes.map(a => a.toString()));
    }

    // Get notes from PXE
    debugLog(`[DEBUG] Fetching notes with filter:`, JSON.stringify(notesFilter, (key, value) => {
      if (value && typeof value === 'object' && 'toField' in value) {
        return value.toString();
      }
      if (value && typeof value === 'object' && Array.isArray(value)) {
        return value.map(v => v.toString ? v.toString() : v);
      }
      return value;
    }, 2));
    
    const notes = await pxe.getNotes(notesFilter);

    debugLog(`[DEBUG] Found ${notes.length} note(s)`);

    // Deserialize notes - replace the "note" buffer with deserialized fields
    if (notes.length > 0) {
      debugLog(`[DEBUG] Deserializing ${notes.length} note(s)...`);
    
      const deserializedNotes = notes.map((note: any, index: number) => {
        try {
          debugLog(`[DEBUG] Processing note ${index + 1}/${notes.length}...`);
    
          const items = note.note?.items ?? [];
    
          debugLog(
            `[DEBUG] Note ${index + 1} deserialized, fields count: ${items.length}`,
          );
          debugLog(
            `[DEBUG] Note ${index + 1} fields:`,
            items.map((f: any) => f.toString()),
          );
    
          return {
            ...note,
            // replace the "note" property with plain strings
            note: items.map((f: any) => f.toString()),
          };
        } catch (error: any) {
          debugLog(
            `[DEBUG] Failed to deserialize note ${index + 1}:`,
            error.message,
          );
          debugLog(`[DEBUG] Error stack:`, error.stack);
          return {
            ...note,
            deserializeError: error.message,
          };
        }
      });
    
      debugLog(
        `[DEBUG] Successfully deserialized ${deserializedNotes.length} note(s)`,
      );
      return {
        notes: deserializedNotes,
      };
    } else {
      return {
        notes: [],
      };
    }
  }

  /**
   * Compute note hash(es) from note items and storage slot, or from existing hashes
   */
  static async computeNoteHash(params: string): Promise<string | any> {
    const p = JSON.parse(params);
    const rawNoteHashInput = p.rawNoteHash;
    const siloedNoteHashInput = p.siloedNoteHash;
    const noteItems = p.noteItems;
    const storageSlot = p.storageSlot;
    const partial = p.partial || false;
    const contractAddress = p.contractAddress;
    const noteNonce = p.noteNonce;

    let rawNoteHash: Fr | undefined;
    let rawNoteHashStr: string | undefined;
    let siloedNoteHash: Fr | undefined;
    let siloedNoteHashStr: string | undefined;

    // Determine starting point
    if (siloedNoteHashInput) {
      // Start from siloed hash
      if (!contractAddress) {
        throw new Error('contractAddress is required when using siloedNoteHash');
      }
      siloedNoteHash = Helpers.stringToFr(siloedNoteHashInput);
      siloedNoteHashStr = siloedNoteHashInput;
    } else if (rawNoteHashInput) {
      // Start from raw hash
      rawNoteHash = Helpers.stringToFr(rawNoteHashInput);
      rawNoteHashStr = rawNoteHashInput;
    } else {
      // Compute from items
      if (!noteItems || !Array.isArray(noteItems)) {
        throw new Error('noteItems must be a JSON array when not using rawNoteHash or siloedNoteHash');
      }
      if (storageSlot === undefined || storageSlot === null) {
        throw new Error('storageSlot is required when computing from note items');
      }

      // Convert storage slot to Fr
      const storageSlotFr = Helpers.stringToFr(storageSlot);

      if (partial) {
      // For partial notes, compute hash in 2 steps:
      // Step 1: commitment = hash([privateFields..., storageSlot], NOTE_HASH)
      // Step 2: final = hash([commitment, lastItem], NOTE_HASH)
      // The last item in noteItems is used for the second hash
      
      if (noteItems.length < 2) {
        throw new Error('partial note requires at least 2 note items (last item is used for the second hash)');
      }

      // Split: private items (all except last) and public value (last item)
      const privateItems = noteItems.slice(0, -1); // All except last
      const value = noteItems[noteItems.length - 1]; // Last item is used for the second hash

      // Convert to Fr[]
      const privateItemsFr = privateItems.map((item: string) => Helpers.stringToFr(item));
      const valueFr = Helpers.stringToFr(value);

      // Step 1: Compute partial commitment from private content + storage slot
      const commitmentInputs = [...privateItemsFr, storageSlotFr];
      const commitment = await poseidon2HashWithSeparator(
        commitmentInputs,
        GeneratorIndex.NOTE_HASH
      );

      // Step 2: Compute final note hash from commitment + value
      const finalInputs = [commitment, valueFr];
      rawNoteHash = await poseidon2HashWithSeparator(
        finalInputs,
        GeneratorIndex.NOTE_HASH
      );
      rawNoteHashStr = rawNoteHash.toString();
    } else {
      // Regular note: single step hash
      // Convert note items to Fr[]
      const noteItemsFr = noteItems.map((item: string) => Helpers.stringToFr(item));
      
      // 1. Compute raw note hash: poseidon2HashWithSeparator([...note.items, storageSlot], GeneratorIndex.NOTE_HASH)
      const rawNoteHashInputs = [...noteItemsFr, storageSlotFr];
      rawNoteHash = await poseidon2HashWithSeparator(
        rawNoteHashInputs,
        GeneratorIndex.NOTE_HASH
      );
      rawNoteHashStr = rawNoteHash.toString();
      }
    }

    // 2. Compute siloed note hash if not already provided and contract is available
    if (!siloedNoteHash && contractAddress && rawNoteHash) {
      // Convert contract address string to Fr
      const normalizedContract = Helpers.normalizeAddress(contractAddress);
      const contractAddr = AztecAddress.fromString(normalizedContract);
      const contractAddrFr = contractAddr.toField();
      
      const siloedInputs = [contractAddrFr, rawNoteHash];
      siloedNoteHash = await poseidon2HashWithSeparator(
        siloedInputs,
        GeneratorIndex.SILOED_NOTE_HASH
      );
      siloedNoteHashStr = siloedNoteHash.toString();
    }

    // If only raw hash and no contract/nonce, return just the raw hash
    if (rawNoteHashStr && !siloedNoteHashStr && !noteNonce) {
      return rawNoteHashStr;
    }

    // 3. Compute unique note hash: poseidon2HashWithSeparator([noteNonce, siloedNoteHash], GeneratorIndex.UNIQUE_NOTE_HASH)
    let uniqueNoteHash: Fr | undefined;
    let uniqueNoteHashStr: string | undefined;

    if (noteNonce) {
      if (!siloedNoteHash) {
        throw new Error('siloedNoteHash is required when computing unique hash (provide --contract to compute siloed hash, or --siloed-note-hash)');
      }
      const noteNonceFr = Helpers.stringToFr(noteNonce);
      
      const uniqueInputs = [noteNonceFr, siloedNoteHash];
      uniqueNoteHash = await poseidon2HashWithSeparator(
        uniqueInputs,
        GeneratorIndex.UNIQUE_NOTE_HASH
      );
      uniqueNoteHashStr = uniqueNoteHash.toString();
    }

    // Return object with all computed hashes
    const result: any = {};

    if (rawNoteHashStr) {
      result.rawNoteHash = rawNoteHashStr;
    }

    if (siloedNoteHashStr) {
      result.siloedNoteHash = siloedNoteHashStr;
    }

    if (uniqueNoteHashStr) {
      result.uniqueNoteHash = uniqueNoteHashStr;
    }

    return result;
  }

  /**
   * Compute note hash from note content (legacy method, kept for verify command fallback)
   */
  static async computeNoteHashFromContent(params: string): Promise<string> {
    const p = JSON.parse(params);
    const artifact = p.artifact;
    const noteContent = p.noteContent;
    const storageSlot = p.storageSlot;
    const noteTypeName = p.noteTypeName;

    if (!artifact) {
      throw new Error('artifact is required');
    }
    if (!noteContent) {
      throw new Error('noteContent is required');
    }
    if (storageSlot === undefined || storageSlot === null) {
      throw new Error('storageSlot is required');
    }

    // Find the note type definition in the artifact
    let noteAbi: any = null;
    
    // If noteTypeName is provided, try to find it in artifact.types
    if (noteTypeName && artifact.types && artifact.types[noteTypeName]) {
      noteAbi = artifact.types[noteTypeName];
    }
    
    // Try to find note type in artifact.notes
    if (!noteAbi && artifact.notes && Array.isArray(artifact.notes)) {
      // If storage slot is provided, try to match by storage slot
      const storageSlotFr = Helpers.stringToFr(storageSlot);
      const matchingNote = artifact.notes.find((note: any) => {
        if (note.storageSlot !== undefined) {
          return Helpers.stringToFr(note.storageSlot).equals(storageSlotFr);
        }
        return false;
      });
      if (matchingNote && matchingNote.type) {
        noteAbi = matchingNote.type;
      } else if (artifact.notes.length > 0 && artifact.notes[0].type) {
        // Fallback to first note type
        noteAbi = artifact.notes[0].type;
      }
    }

    // If not found in notes, try artifact.types
    if (!noteAbi && artifact.types) {
      // Look for struct types that might be notes
      const structTypes = Object.values(artifact.types).filter((t: any) => t.kind === 'struct');
      if (structTypes.length > 0) {
        // Use the first struct type as a fallback
        noteAbi = structTypes[0];
      }
    }

    if (!noteAbi) {
      throw new Error('Could not find note type definition in artifact. Please ensure the artifact contains note type definitions, or specify --note-type-name.');
    }

    // Encode the note content using the ABI encoder
    const noteFields = encodeArguments(noteAbi, [noteContent]);

    // Add storage slot
    const storageSlotFr = Helpers.stringToFr(storageSlot);
    const inputs = [...noteFields, storageSlotFr];

    // Hash with the NOTE_HASH generator index
    const noteHash = await poseidon2HashWithSeparator(
      inputs,
      GeneratorIndex.NOTE_HASH
    );

    return noteHash.toString();
  }

  /**
   * Verify if a note exists in a transaction
   */
  static async verifyNoteInTransaction(params: string): Promise<any> {
    const p = JSON.parse(params);
    const txHash = p.txHash;
    const noteHash = p.noteHash;
    const contractAddress = p.contractAddress;
    const artifact = p.artifact;
    const noteContent = p.noteContent;
    const storageSlot = p.storageSlot;
    const nodeUrl = p.nodeUrl || getDefaultNodeUrl();
    const firstNullifier = p.firstNullifier;
    const noteIndex = p.noteIndex;

    if (!txHash) {
      throw new Error('txHash is required');
    }

    // 1. Get base note hash - either provided directly or compute from content
    let baseNoteHashStr: string;
    let baseNoteHash: Fr;
    
    if (noteHash) {
      // Use provided note hash directly
      baseNoteHashStr = noteHash;
      baseNoteHash = Helpers.stringToFr(noteHash);
    } else {
      // Compute from note content
      if (!contractAddress) {
        throw new Error('contractAddress is required when computing hash from note content');
      }
      if (!artifact) {
        throw new Error('artifact is required when computing hash from note content');
      }
      if (!noteContent) {
        throw new Error('noteContent is required when computing hash from note content');
      }
      if (storageSlot === undefined || storageSlot === null) {
        throw new Error('storageSlot is required when computing hash from note content');
      }

      const computeHashParams: any = {
        artifact,
        noteContent,
        storageSlot,
      };
      if (p.noteTypeName) {
        computeHashParams.noteTypeName = p.noteTypeName;
      }
      baseNoteHashStr = await this.computeNoteHashFromContent(JSON.stringify(computeHashParams));
      baseNoteHash = Helpers.stringToFr(baseNoteHashStr);
    }

    // 2. Silo it (if contract address is provided)
    let siloedHash: Fr;
    let siloedHashStr: string;
    
    if (contractAddress) {
      const normalizedContract = Helpers.normalizeAddress(contractAddress);
      const contractAddr = AztecAddress.fromString(normalizedContract);
      siloedHash = await siloNoteHash(contractAddr, baseNoteHash);
      siloedHashStr = siloedHash.toString();
    } else {
      // If no contract address, use base hash as siloed hash (for comparison purposes)
      siloedHash = baseNoteHash;
      siloedHashStr = baseNoteHashStr;
    }

    // 3. Get transaction effects
    const aztecNode = createAztecNodeClient(nodeUrl);
    await waitForNode(aztecNode);
    const txEffect = await aztecNode.getTxEffect(txHash);
    
    if (!txEffect) {
      throw new Error(`Transaction ${txHash} not found`);
    }

    const noteHashes = txEffect.data.noteHashes || [];
    const noteHashesStr = noteHashes.map((h: Fr) => h.toString());

    // 4. If firstNullifier and noteIndex are provided, compute unique hash
    let uniqueHash: string | undefined;
    let exists = false;

    if (firstNullifier !== undefined && noteIndex !== undefined) {
      // Compute note hash nonce
      const firstNullifierFr = Helpers.stringToFr(firstNullifier);
      const noteNonce = await computeNoteHashNonce(firstNullifierFr, parseInt(noteIndex));
      
      // Compute unique hash
      const uniqueHashFr = await computeUniqueNoteHash(noteNonce, siloedHash);
      uniqueHash = uniqueHashFr.toString();

      // Check if it exists
      exists = noteHashes.some((h: Fr) => h.equals(uniqueHashFr));
    } else {
      // Without unique hash, we can only check if the siloed hash matches any note hash
      // This is less precise but still useful
      exists = noteHashes.some((h: Fr) => h.equals(siloedHash));
    }

    // Try to get firstNullifier from txEffect if available
    let firstNullifierFromTx: string | undefined;
    if ('firstNullifier' in txEffect && txEffect.firstNullifier) {
      firstNullifierFromTx = (txEffect.firstNullifier as Fr).toString();
    } else if ('data' in txEffect && txEffect.data && 'firstNullifier' in txEffect.data) {
      firstNullifierFromTx = (txEffect.data as any).firstNullifier?.toString();
    }

    return {
      exists,
      baseNoteHash: baseNoteHashStr,
      siloedHash: siloedHashStr,
      uniqueHash,
      noteHashes: noteHashesStr,
      firstNullifier: firstNullifierFromTx,
      noteCount: noteHashes.length,
    };
  }
}

