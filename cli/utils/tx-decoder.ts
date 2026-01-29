/**
 * TX Decoder Service
 *
 * Decodes transactions and attempts to decrypt private logs using viewing keys.
 * Enables users to discover what data a transaction contains for them without full chain sync.
 */

import { Fr, Point } from '@aztec/aztec.js/fields';
import type { GrumpkinScalar } from '@aztec/aztec.js/fields';
import { createAztecNodeClient, type AztecNode } from '@aztec/aztec.js/node';
import { CompleteAddress } from '@aztec/aztec.js/addresses';
import { Aes128 } from '@aztec/foundation/crypto/aes128';
import { deriveEcdhSharedSecret } from '@aztec/stdlib/logs';
import { deriveMasterIncomingViewingSecretKey, computeAddressSecret, deriveKeys } from '@aztec/stdlib/keys';
import { PRIVATE_LOG_CIPHERTEXT_LEN, GeneratorIndex } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { EventSelector, decodeFromAbi, type EventMetadataDefinition } from '@aztec/stdlib/abi';

// ============================================================================
// Types
// ============================================================================

export interface DecodedTx {
  /** Transaction hash */
  txHash: string;
  /** Block number where tx was included */
  blockNumber: number | null;
  /** Block hash */
  blockHash: string | null;
  /** Transaction status */
  status: string;
  /** Revert reason if failed */
  revertReason?: string;
  /** Transaction fee */
  transactionFee: string | null;

  /** Public summary of tx effects */
  publicSummary: {
    noteHashCount: number;
    nullifierCount: number;
    l2ToL1MessageCount: number;
    privateLogCount: number;
    publicLogCount: number;
    publicDataWriteCount: number;
  };

  /** Raw data (optional, for --raw flag) */
  raw?: {
    noteHashes: string[];
    nullifiers: string[];
    l2ToL1Msgs: string[];
    publicDataWrites: { slot: string; value: string }[];
    privateLogs: string[];
    publicLogs: string[];
  };

  /** Decrypted data for user (if keys provided) */
  yourData?: DecryptedUserData;
}

export interface DecryptedUserData {
  /** Whether any data was found for the user */
  found: boolean;
  /** Decryption attempts made */
  decryptionAttempts: number;
  /** Successful decryptions */
  successfulDecryptions: number;
  /** Incoming notes/events (decrypted with ivsk) */
  incoming: DecryptedLog[];
}

export interface DecryptedLog {
  /** Index of the log in the transaction */
  logIndex: number;
  /** Raw decrypted fields */
  fields: string[];
  /** Number of fields */
  fieldCount: number;
  /** Decoded event (if artifact provided and event matched) */
  event?: DecodedEvent;
}

export interface DecodedEvent {
  /** Event name (e.g., "Transfer") */
  name: string;
  /** Event selector (hex) */
  selector: string;
  /** Decoded fields with names and values */
  decodedFields: { name: string; value: string }[];
}

export interface DecodeOptions {
  /** Include raw tx data */
  includeRaw?: boolean;
  /** Secret key for decryption (hex string) */
  secretKey?: string;
  /** Complete address for decryption */
  completeAddress?: CompleteAddress;
  /**
   * Event definitions for decoding. Pass the contract's `.events` object.
   * Example: `TokenContract.events` or `{ Transfer: TokenContract.events.Transfer }`
   */
  events?: Record<string, EventMetadataDefinition>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Derives a CompleteAddress from a secret key using the Schnorr account pattern.
 * This is used for log decryption and assumes a standard Schnorr account with the given salt.
 *
 * @param secretKey - The secret key (hex string)
 * @param salt - The contract salt (default: 0)
 * @returns The CompleteAddress for decryption
 */
export async function deriveCompleteAddressFromSecret(
  secretKey: string,
  salt: Fr = Fr.ZERO,
): Promise<CompleteAddress> {
  const secretKeyFr = Fr.fromHexString(secretKey);
  const { publicKeys } = await deriveKeys(secretKeyFr);

  // Import necessary utilities
  const { SchnorrAccountContractArtifact, SchnorrAccountContract } = await import('@aztec/accounts/schnorr');
  const { deriveSigningKey } = await import('@aztec/stdlib/keys');
  const { getContractInstanceFromInstantiationParams } = await import('@aztec/stdlib/contract');

  const signingKey = deriveSigningKey(secretKeyFr);
  const accountContract = new SchnorrAccountContract(signingKey);

  // Get initialization params from account contract
  const { constructorName, constructorArgs } = await accountContract.getInitializationFunctionAndArgs();

  // Create the contract instance (same as AccountManager does)
  const instance = await getContractInstanceFromInstantiationParams(SchnorrAccountContractArtifact, {
    constructorArtifact: constructorName,
    constructorArgs,
    salt,
    publicKeys,
  });

  // Use the same method as AccountManager
  return CompleteAddress.fromSecretKeyAndInstance(secretKeyFr, instance);
}

// ============================================================================
// Constants
// ============================================================================

const EPH_PK_X_SIZE_IN_FIELDS = 1;
const EPH_PK_SIGN_BYTE_SIZE_IN_BYTES = 1;
const HEADER_CIPHERTEXT_SIZE_IN_BYTES = 16;
const MESSAGE_CIPHERTEXT_LEN = PRIVATE_LOG_CIPHERTEXT_LEN; // 17

// ============================================================================
// Event Decoding Utilities
// ============================================================================

/**
 * Extracts event definitions from a raw contract artifact JSON.
 * Use this when loading artifacts from file (CLI use).
 * For programmatic use with TypeScript contracts, use `Contract.events` directly.
 *
 * @param artifact - Raw contract artifact JSON (from compiled contract)
 * @returns Record of event name to EventMetadataDefinition
 */
export async function extractEventsFromArtifact(
  artifact: any,
): Promise<Record<string, EventMetadataDefinition>> {
  const events = artifact?.outputs?.structs?.events;
  if (!events || !Array.isArray(events)) {
    return {};
  }

  const result: Record<string, EventMetadataDefinition> = {};

  for (const event of events) {
    // Extract event name from path (e.g., "token::Transfer" -> "Transfer")
    const name = event.path?.split('::').pop() || 'Unknown';

    // Build event signature for selector computation
    const fieldTypes = event.fields?.map((f: any) => abiTypeToSignature(f.type)) || [];
    const signature = `${name}(${fieldTypes.join(',')})`;

    // Compute event selector
    const eventSelector = await EventSelector.fromSignature(signature);

    result[name] = {
      eventSelector,
      abiType: event,
      fieldNames: event.fields?.map((f: any) => f.name) || [],
    };
  }

  return result;
}

/**
 * Converts an ABI type to its signature string representation.
 * Used for computing event selectors from raw artifacts.
 */
function abiTypeToSignature(abiType: any): string {
  switch (abiType.kind) {
    case 'field':
      return 'Field';
    case 'integer':
      return `u${abiType.width}`;
    case 'boolean':
      return 'bool';
    case 'string':
      return `str<${abiType.length}>`;
    case 'array':
      return `[${abiTypeToSignature(abiType.type)};${abiType.length}]`;
    case 'struct':
      const structFields = abiType.fields?.map((f: any) => abiTypeToSignature(f.type)) || [];
      return `(${structFields.join(',')})`;
    default:
      return 'Field';
  }
}

/**
 * Tries to match decrypted fields to an event definition.
 * The event selector is in the last field (per aztec.nr convention).
 *
 * @param fields - Decrypted log fields
 * @param events - Event definitions from contract (e.g., `Contract.events`)
 * @returns Matched event name and definition, or null if no match
 */
export function matchEventFromFields(
  fields: Fr[],
  events: Record<string, EventMetadataDefinition>,
): { name: string; definition: EventMetadataDefinition } | null {
  if (fields.length === 0) {
    return null;
  }

  // Event selector is in the last field (per aztec.nr convention)
  const lastField = fields[fields.length - 1];
  const logSelector = EventSelector.fromField(lastField);

  for (const [name, definition] of Object.entries(events)) {
    if (logSelector.equals(definition.eventSelector)) {
      return { name, definition };
    }
  }

  return null;
}

/**
 * Decodes event fields using the event's ABI type.
 * Returns named fields with their decoded values.
 *
 * @param fields - Decrypted log fields
 * @param definition - Event metadata definition
 * @returns Decoded fields with names and values
 */
export function decodeEventFields(
  fields: Fr[],
  definition: EventMetadataDefinition,
): { name: string; value: string }[] {
  try {
    // Decode using the event's ABI type
    const decoded = decodeFromAbi([definition.abiType], fields);

    // Map decoded values to field names
    const result: { name: string; value: string }[] = [];

    if (typeof decoded === 'object' && decoded !== null) {
      for (const fieldName of definition.fieldNames) {
        const value = (decoded as any)[fieldName];
        result.push({
          name: fieldName,
          value: formatDecodedValue(value),
        });
      }
    }

    return result;
  } catch {
    // If decoding fails, return raw fields with indices
    return fields.map((f, i) => ({
      name: definition.fieldNames[i] || `field[${i}]`,
      value: f.toString(),
    }));
  }
}

/**
 * Formats a decoded value for display.
 */
function formatDecodedValue(value: any): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'object') {
    if (value.toString && typeof value.toString === 'function') {
      return value.toString();
    }
    return JSON.stringify(value);
  }
  return String(value);
}

// ============================================================================
// Private Log Decryption Utilities
// ============================================================================

/**
 * Converts fields to bytes (31 bytes per field for ciphertext encoding)
 */
function fieldsToBytes(fields: Fr[]): Buffer {
  const bytes: number[] = [];
  for (const field of fields) {
    const fieldBytes = field.toBuffer();
    // Each field stores 31 bytes (not 32) in ciphertext encoding
    // We need to extract the last 31 bytes (big-endian, so skip the first byte)
    for (let i = 1; i < 32; i++) {
      bytes.push(fieldBytes[i]);
    }
  }
  return Buffer.from(bytes);
}

/**
 * Converts bytes to fields (32 bytes per field for plaintext)
 */
function bytesToFields(bytes: Buffer): Fr[] {
  const fields: Fr[] = [];
  // Each field is 32 bytes
  for (let i = 0; i < bytes.length; i += 32) {
    const fieldBytes = bytes.slice(i, i + 32);
    fields.push(Fr.fromBuffer(fieldBytes));
  }
  return fields;
}

/**
 * Derives AES symmetric key and IV from ECDH shared secret using Poseidon2
 */
async function deriveAesSymmetricKeyAndIv(
  sharedSecret: Point,
  index: number,
): Promise<{ key: Uint8Array; iv: Uint8Array }> {
  // Generate two random 256-bit values using Poseidon2 with different separators
  const kShift = index << 8;
  const separator1 = kShift + GeneratorIndex.SYMMETRIC_KEY;
  const separator2 = kShift + GeneratorIndex.SYMMETRIC_KEY_2;

  const rand1 = await poseidon2HashWithSeparator([sharedSecret.x, sharedSecret.y], separator1);
  const rand2 = await poseidon2HashWithSeparator([sharedSecret.x, sharedSecret.y], separator2);

  const rand1Bytes = rand1.toBuffer();
  const rand2Bytes = rand2.toBuffer();

  // Extract the last 16 bytes from each (little end of big-endian representation)
  const key = new Uint8Array(16);
  const iv = new Uint8Array(16);

  for (let i = 0; i < 16; i++) {
    // Take bytes from the "little end" of the be-bytes arrays
    key[i] = rand1Bytes[31 - i];
    iv[i] = rand2Bytes[31 - i];
  }

  return { key, iv };
}

/**
 * Decrypts a raw private log ciphertext.
 *
 * This function decrypts an encrypted message using AES-128-CBC, following the same
 * algorithm as the Noir `decrypt_raw_log` function.
 *
 * @param ciphertext - Array of 17 fields representing the encrypted message
 * @param recipientCompleteAddress - Complete address of the recipient
 * @param recipientIvskM - The incoming viewing secret key of the recipient
 * @returns Array of decrypted fields, or null if decryption fails
 */
async function decryptRawPrivateLog(
  ciphertext: Fr[],
  recipientCompleteAddress: CompleteAddress,
  recipientIvskM: GrumpkinScalar,
): Promise<Fr[] | null> {
  try {
    if (ciphertext.length !== MESSAGE_CIPHERTEXT_LEN) {
      return null;
    }

    // Extract ephemeral public key x-coordinate (first field)
    const ephPkX = ciphertext[0];

    // Get ciphertext without ephemeral public key x-coordinate
    const ciphertextWithoutEphPkX = ciphertext.slice(EPH_PK_X_SIZE_IN_FIELDS);

    // Convert fields to bytes (31 bytes per field)
    const ciphertextBytes = fieldsToBytes(ciphertextWithoutEphPkX);

    // Extract ephemeral public key sign (first byte)
    const ephPkSignByte = ciphertextBytes[0];
    const ephPkSign = ephPkSignByte !== 0;

    // Reconstruct ephemeral public key from x-coordinate and sign
    const ephPk = await Point.fromXAndSign(ephPkX, ephPkSign);

    // Derive shared secret
    const preaddress = await recipientCompleteAddress.getPreaddress();
    const addressSecret = await computeAddressSecret(preaddress, recipientIvskM);
    const sharedSecret = await deriveEcdhSharedSecret(addressSecret, ephPk);

    // Derive symmetric keys for header and body
    const headerKeyIv = await deriveAesSymmetricKeyAndIv(sharedSecret, 1);
    const bodyKeyIv = await deriveAesSymmetricKeyAndIv(sharedSecret, 0);

    // Extract and decrypt header ciphertext
    const headerStart = EPH_PK_SIGN_BYTE_SIZE_IN_BYTES;
    const headerCiphertext = new Uint8Array(
      ciphertextBytes.slice(headerStart, headerStart + HEADER_CIPHERTEXT_SIZE_IN_BYTES),
    );

    const aes128 = new Aes128();
    const headerPlaintext = await aes128.decryptBufferCBC(headerCiphertext, headerKeyIv.iv, headerKeyIv.key);

    // Extract ciphertext length from header (2 bytes, big-endian)
    const ciphertextLength = (headerPlaintext[0] << 8) | headerPlaintext[1];

    // Validate ciphertext length
    if (ciphertextLength <= 0 || ciphertextLength > ciphertextBytes.length) {
      return null;
    }

    // Extract and decrypt main ciphertext
    const ciphertextStart = headerStart + HEADER_CIPHERTEXT_SIZE_IN_BYTES;
    const ciphertextWithPadding = new Uint8Array(ciphertextBytes.slice(ciphertextStart));
    const actualCiphertext = ciphertextWithPadding.slice(0, ciphertextLength);

    const plaintextBytes = await aes128.decryptBufferCBC(actualCiphertext, bodyKeyIv.iv, bodyKeyIv.key);

    // Convert plaintext bytes back to fields (32 bytes per field)
    const plaintextFields = bytesToFields(plaintextBytes);

    return plaintextFields;
  } catch {
    // Decryption failed - this log isn't for us
    return null;
  }
}

// ============================================================================
// TX Decoder Service
// ============================================================================

export class TxDecoderService {
  private node: AztecNode;

  private constructor(node: AztecNode) {
    this.node = node;
  }

  /**
   * Create a TxDecoderService connected to an Aztec node
   */
  static async connect(nodeUrl: string): Promise<TxDecoderService> {
    const node = createAztecNodeClient(nodeUrl);
    return new TxDecoderService(node);
  }

  /**
   * Decode a transaction by hash
   */
  async decodeTx(txHashStr: string, options: DecodeOptions = {}): Promise<DecodedTx> {
    // Import TxHash dynamically
    const { TxHash } = await import('@aztec/aztec.js/tx');
    const txHash = TxHash.fromString(txHashStr);

    // Fetch transaction data from node
    const [receipt, effectsInBlock] = await Promise.all([
      this.node.getTxReceipt(txHash),
      this.node.getTxEffect(txHash),
    ]);

    if (!effectsInBlock) {
      throw new Error(`Transaction ${txHashStr} not found`);
    }

    const effects = effectsInBlock.data;

    // Build public summary
    const publicSummary = {
      noteHashCount: effects.noteHashes.length,
      nullifierCount: effects.nullifiers.length,
      l2ToL1MessageCount: effects.l2ToL1Msgs.length,
      privateLogCount: effects.privateLogs.length,
      publicLogCount: effects.publicLogs.length,
      publicDataWriteCount: effects.publicDataWrites.length,
    };

    // Build base result
    const result: DecodedTx = {
      txHash: txHashStr,
      blockNumber: receipt?.blockNumber ?? null,
      blockHash: receipt?.blockHash?.toString() ?? null,
      status: receipt?.status ?? 'unknown',
      revertReason: effects.revertCode.getDescription(),
      transactionFee: receipt?.transactionFee?.toString() ?? null,
      publicSummary,
    };

    // Include raw data if requested
    if (options.includeRaw) {
      result.raw = {
        noteHashes: effects.noteHashes.map((h: Fr) => h.toString()),
        nullifiers: effects.nullifiers.map((h: Fr) => h.toString()),
        l2ToL1Msgs: effects.l2ToL1Msgs.map((m: Fr) => m.toString()),
        publicDataWrites: effects.publicDataWrites.map((w: any) => ({
          slot: w.leafSlot.toString(),
          value: w.value.toString(),
        })),
        privateLogs: effects.privateLogs.map((l: any) => l.toBuffer().toString('hex')),
        publicLogs: effects.publicLogs.map((l: any) => l.toHumanReadable()),
      };
    }

    // Attempt decryption if keys provided
    if (options.secretKey && options.completeAddress) {
      result.yourData = await this.tryDecryptLogs(
        effects.privateLogs,
        options.secretKey,
        options.completeAddress,
        options.events,
      );
    }

    return result;
  }

  /**
   * Try to decrypt private logs with the given viewing key
   */
  private async tryDecryptLogs(
    privateLogs: any[],
    secretKey: string,
    completeAddress: CompleteAddress,
    events?: Record<string, EventMetadataDefinition>,
  ): Promise<DecryptedUserData> {
    const ivskM = deriveMasterIncomingViewingSecretKey(Fr.fromHexString(secretKey));

    const incoming: DecryptedLog[] = [];
    let decryptionAttempts = 0;
    let successfulDecryptions = 0;

    for (let i = 0; i < privateLogs.length; i++) {
      const log = privateLogs[i];
      decryptionAttempts++;

      // Get the fields from the log (skip the first field which is the tag)
      const fields = log.fields.slice(1) as Fr[];

      if (fields.length !== MESSAGE_CIPHERTEXT_LEN) {
        continue;
      }

      const decrypted = await decryptRawPrivateLog(fields, completeAddress, ivskM);

      if (decrypted) {
        successfulDecryptions++;

        const decryptedLog: DecryptedLog = {
          logIndex: i,
          fields: decrypted.map((f: Fr) => f.toString()),
          fieldCount: decrypted.length,
        };

        // Try to match and decode as event if events provided
        if (events && Object.keys(events).length > 0) {
          const matched = matchEventFromFields(decrypted, events);
          if (matched) {
            const decodedFields = decodeEventFields(decrypted, matched.definition);
            decryptedLog.event = {
              name: matched.name,
              selector: matched.definition.eventSelector.toString(),
              decodedFields,
            };
          }
        }

        incoming.push(decryptedLog);
      }
    }

    return {
      found: incoming.length > 0,
      decryptionAttempts,
      successfulDecryptions,
      incoming,
    };
  }
}
