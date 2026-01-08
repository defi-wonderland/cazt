/**
 * Account utility functions for Aztec accounts
 */

import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { TestWallet } from '@aztec/test-wallet/server';
import { getSchnorrAccountContractAddress } from '@aztec/accounts/schnorr';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { getDefaultNodeUrl } from '../config/index.js';
import { registerSponsoredFPC, getSponsoredPaymentMethod } from './fpc.js';
import { createPersistentPXE } from './pxe.js';

/**
 * Supported account types
 */
export type AccountType = 'schnorr';

/**
 * Check if a string looks like a hex field value or numeric string
 */
function isHexOrNumericString(str: string): boolean {
  return /^0x[0-9a-fA-F]+$/.test(str) || /^[0-9]+$/.test(str);
}

/**
 * Convert a string passphrase to a secret key
 * Pads the string to 32 characters with '#' and hashes with Poseidon2
 */
async function passphraseToSecretKey(passphrase: string): Promise<Fr> {
  // Pad with '#' to 32 characters (right-pad)
  const padded = passphrase.padEnd(32, '#');
  const buffer = Buffer.from(padded, 'utf-8');
  const fieldElement = Fr.fromBufferReduce(buffer);
  // Hash with Poseidon2 for proper key derivation
  return await poseidon2Hash([fieldElement]);
}

/**
 * Convert a string to Fr field element
 * - If it's a hex string (starts with 0x), parse as hex
 * - If it's all digits, parse as decimal number
 * - Otherwise, treat as passphrase and derive key via Poseidon2
 *
 * @returns { secretKey: Fr, derivedFromPassphrase: boolean }
 */
async function stringToFr(value: string): Promise<{ secretKey: Fr; derivedFromPassphrase: boolean }> {
  // If it's a hex string (starts with 0x), parse as hex
  if (value.startsWith('0x')) {
    // Pad to even length if odd number of hex digits
    let hexPart = value.slice(2);
    if (hexPart.length % 2 !== 0) {
      hexPart = '0' + hexPart;
    }
    // Pad to 32 bytes for Fr
    hexPart = hexPart.padStart(64, '0');
    const buffer = Buffer.from(hexPart, 'hex');
    return { secretKey: Fr.fromBufferReduce(buffer), derivedFromPassphrase: false };
  }

  // If it's all digits, treat as decimal number
  if (/^\d+$/.test(value)) {
    return { secretKey: new Fr(BigInt(value)), derivedFromPassphrase: false };
  }

  // Otherwise, treat as passphrase and derive via Poseidon2
  const secretKey = await passphraseToSecretKey(value);
  return { secretKey, derivedFromPassphrase: true };
}

/**
 * Result type for account deployment
 */
export interface AccountDeployResult {
  address: string;
  txHash: string;
  blockNumber?: number;
  status: string;
  secretKey?: string; // Included when derived from passphrase
}

/**
 * Result type for computing address
 */
export interface ComputedAddress {
  address: string;
  salt: string;
  type: string;
  secretKey?: string; // Included when derived from passphrase
}

/**
 * Account utility functions
 */
export class AccountUtils {
  /**
   * Deploy an existing account (when secret is known but not deployed)
   * @param secretKey - Secret key as string (hex, decimal, or passphrase)
   * @param options - Deployment options
   * @returns Deployment result with address, txHash, blockNumber, status
   */
  static async deployAccount(
    secretKey: string,
    options: {
      salt?: string;
      type?: AccountType;
      nodeUrl?: string;
    } = {}
  ): Promise<AccountDeployResult> {
    const { salt: saltInput, type = 'schnorr', nodeUrl = getDefaultNodeUrl() } = options;

    // Validate account type
    if (type !== 'schnorr') {
      throw new Error(`Account type '${type}' is not supported. Use 'schnorr'.`);
    }

    const { secretKey: secretKeyFr, derivedFromPassphrase } = await stringToFr(secretKey);

    // Parse salt - salt should not be treated as passphrase, only hex/decimal
    let salt: Fr;
    if (saltInput) {
      if (saltInput.startsWith('0x')) {
        let hexPart = saltInput.slice(2);
        if (hexPart.length % 2 !== 0) {
          hexPart = '0' + hexPart;
        }
        hexPart = hexPart.padStart(64, '0');
        salt = Fr.fromBufferReduce(Buffer.from(hexPart, 'hex'));
      } else if (/^\d+$/.test(saltInput)) {
        salt = new Fr(BigInt(saltInput));
      } else {
        throw new Error(`Invalid salt format. Use hex (0x...) or decimal number.`);
      }
    } else {
      salt = Fr.ZERO;
    }

    // Compute expected address
    const address = await getSchnorrAccountContractAddress(secretKeyFr, salt);

    // Create persistent PXE with LMDB storage (persists per network)
    const { pxe, store, node } = await createPersistentPXE(nodeUrl);

    // Create wallet with the persistent store
    const wallet = await TestWallet.create(node, { proverEnabled: false }, { store });

    // Register the SponsoredFPC for fee payments
    await registerSponsoredFPC(wallet);
    const paymentMethod = await getSponsoredPaymentMethod(wallet);

    const accountManager = await wallet.createSchnorrAccount(secretKeyFr, salt);

    // Deploy the account using getDeployMethod with sponsored fees
    const deployMethod = await accountManager.getDeployMethod();
    const deployTx = deployMethod.send({
      from: AztecAddress.ZERO,
      fee: { paymentMethod },
    });

    const receipt = await deployTx.wait();

    return {
      address: address.toString(),
      txHash: receipt.txHash.toString(),
      blockNumber: receipt.blockNumber,
      status: receipt.status,
      ...(derivedFromPassphrase && { secretKey: secretKeyFr.toString() }),
    };
  }

  /**
   * Compute address from secret key without deploying
   * @param secretKey - Secret key as string (hex, decimal, or passphrase)
   * @param options - Options including salt and type
   * @returns Computed address, salt, and type
   */
  static async computeAddress(
    secretKey: string,
    options: {
      salt?: string;
      type?: AccountType;
    } = {}
  ): Promise<ComputedAddress> {
    const { salt: saltInput, type = 'schnorr' } = options;

    // Validate account type
    if (type !== 'schnorr') {
      throw new Error(`Account type '${type}' is not supported. Use 'schnorr'.`);
    }

    const { secretKey: secretKeyFr, derivedFromPassphrase } = await stringToFr(secretKey);

    // Parse salt - salt should not be treated as passphrase, only hex/decimal
    let salt: Fr;
    if (saltInput) {
      if (saltInput.startsWith('0x')) {
        let hexPart = saltInput.slice(2);
        if (hexPart.length % 2 !== 0) {
          hexPart = '0' + hexPart;
        }
        hexPart = hexPart.padStart(64, '0');
        salt = Fr.fromBufferReduce(Buffer.from(hexPart, 'hex'));
      } else if (/^\d+$/.test(saltInput)) {
        salt = new Fr(BigInt(saltInput));
      } else {
        throw new Error(`Invalid salt format. Use hex (0x...) or decimal number.`);
      }
    } else {
      salt = Fr.ZERO;
    }

    const address = await getSchnorrAccountContractAddress(secretKeyFr, salt);

    return {
      address: address.toString(),
      salt: salt.toString(),
      type,
      ...(derivedFromPassphrase && { secretKey: secretKeyFr.toString() }),
    };
  }

  /**
   * Format deploy result for human-readable display
   */
  static formatDeployHumanReadable(result: AccountDeployResult): string {
    const lines: string[] = [];
    lines.push('Account Deployed');
    lines.push('='.repeat(50));
    lines.push('');
    lines.push(`Address:     ${result.address}`);
    lines.push(`Tx Hash:     ${result.txHash}`);
    lines.push(`Status:      ${result.status}`);
    if (result.blockNumber !== undefined) {
      lines.push(`Block:       ${result.blockNumber}`);
    }
    if (result.secretKey) {
      lines.push('');
      lines.push(`Secret Key (derived from passphrase): ${result.secretKey}`);
    }
    return lines.join('\n');
  }
}
