import { Fr } from '@aztec/foundation/fields';
import { Point } from '@aztec/aztec.js/fields';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { GeneratorIndex, PRIVATE_LOG_CIPHERTEXT_LEN } from '@aztec/constants';
import { Aes128 } from '@aztec/foundation/crypto';
import { CompleteAddress } from '@aztec/stdlib/contract';
import { deriveMasterIncomingViewingSecretKey, computeAddressSecret } from '@aztec/stdlib/keys';
import { deriveEcdhSharedSecret } from '@aztec/stdlib/logs';
import { Helpers } from './helpers.js';

/**
 * Private log decryption utility functions
 */
export class LogUtils {
  /**
   * Converts fields to bytes (31 bytes per field for ciphertext encoding)
   */
  private static fieldsToBytes(fields: Fr[]): Buffer {
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
  private static bytesToFields(bytes: Buffer): Fr[] {
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
  private static async deriveAesSymmetricKeyAndIv(
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
   */
  static async decryptRawPrivateLog(params: string): Promise<string[]> {
    const p = JSON.parse(params);
    const ciphertextFields = p.ciphertext;
    const recipientAddress = p.recipientAddress;
    const recipientSecretKey = p.recipientSecretKey;

    if (!ciphertextFields || !Array.isArray(ciphertextFields)) {
      throw new Error('ciphertext must be a JSON array');
    }
    if (ciphertextFields.length !== PRIVATE_LOG_CIPHERTEXT_LEN) {
      throw new Error(`Ciphertext must be ${PRIVATE_LOG_CIPHERTEXT_LEN} fields, got ${ciphertextFields.length}`);
    }
    if (!recipientAddress) {
      throw new Error('recipientAddress is required');
    }
    if (!recipientSecretKey) {
      throw new Error('recipientSecretKey is required');
    }

    // Convert hex strings to Fr fields
    const ciphertext = ciphertextFields.map((f: string) => Helpers.stringToFr(f));

    // Constants from Noir code
    const EPH_PK_X_SIZE_IN_FIELDS = 1;
    const EPH_PK_SIGN_BYTE_SIZE_IN_BYTES = 1;
    const HEADER_CIPHERTEXT_SIZE_IN_BYTES = 16;
    const MESSAGE_CIPHERTEXT_LEN = PRIVATE_LOG_CIPHERTEXT_LEN;

    // Extract ephemeral public key x-coordinate (first field)
    const ephPkX = ciphertext[0];

    // Get ciphertext without ephemeral public key x-coordinate
    const ciphertextWithoutEphPkX = ciphertext.slice(EPH_PK_X_SIZE_IN_FIELDS);

    // Convert fields to bytes (31 bytes per field)
    const ciphertextBytes = this.fieldsToBytes(ciphertextWithoutEphPkX);

    // Extract ephemeral public key sign (first byte)
    const ephPkSignByte = ciphertextBytes[0];
    const ephPkSign = ephPkSignByte !== 0;

    // Reconstruct ephemeral public key from x-coordinate and sign
    const ephPk = await Point.fromXAndSign(ephPkX, ephPkSign);

    // Derive shared secret
    // The shared secret is computed as: addressSecret * ephPk
    // where addressSecret = preaddress + ivskM (with proper sign handling)
    const recipientCompleteAddress = await CompleteAddress.fromString(recipientAddress);
    const preaddress = await recipientCompleteAddress.getPreaddress();
    const recipientIvskM = deriveMasterIncomingViewingSecretKey(Helpers.stringToFr(recipientSecretKey));
    const addressSecret = await computeAddressSecret(preaddress, recipientIvskM);
    const sharedSecret = await deriveEcdhSharedSecret(addressSecret, ephPk);

    // Derive symmetric keys for header and body
    const headerKeyIv = await this.deriveAesSymmetricKeyAndIv(sharedSecret, 1);
    const bodyKeyIv = await this.deriveAesSymmetricKeyAndIv(sharedSecret, 0);

    // Extract and decrypt header ciphertext
    const headerStart = EPH_PK_SIGN_BYTE_SIZE_IN_BYTES;
    const headerCiphertext = new Uint8Array(
      ciphertextBytes.slice(headerStart, headerStart + HEADER_CIPHERTEXT_SIZE_IN_BYTES),
    );

    const aes128 = new Aes128();
    const headerPlaintext = await aes128.decryptBufferCBC(headerCiphertext, headerKeyIv.iv, headerKeyIv.key);

    // Extract ciphertext length from header (2 bytes, big-endian)
    const ciphertextLength = (headerPlaintext[0] << 8) | headerPlaintext[1];

    // Extract and decrypt main ciphertext
    const ciphertextStart = headerStart + HEADER_CIPHERTEXT_SIZE_IN_BYTES;
    const ciphertextWithPadding = new Uint8Array(ciphertextBytes.slice(ciphertextStart));
    const actualCiphertext = ciphertextWithPadding.slice(0, ciphertextLength);

    const plaintextBytes = await aes128.decryptBufferCBC(actualCiphertext, bodyKeyIv.iv, bodyKeyIv.key);

    // Convert plaintext bytes back to fields (32 bytes per field)
    const plaintextFields = this.bytesToFields(plaintextBytes);

    // Convert Fr fields back to hex strings
    return plaintextFields.map((f: Fr) => f.toString());
  }
}

