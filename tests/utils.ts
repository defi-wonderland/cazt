import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { program } from '../cli/cli.js';

/**
 * Test utilities and test vectors for CLI tests
 */

import { Point } from '@aztec/foundation/curves/grumpkin';
import { Schnorr, SchnorrSignature } from '@aztec/foundation/crypto/schnorr';
import { WARNINGS } from '../cli/constants.js';

// ============================================================================
// Shared Test Infrastructure
// ============================================================================

/**
 * Console output capture for tests
 */
let consoleOutput: string[] = [];
let originalLog: typeof console.log;
let originalError: typeof console.error;
let originalStderrWrite: typeof process.stderr.write;

/**
 * Setup console mocking - call in beforeEach
 */
export function setupConsoleMock(): void {
  consoleOutput = [];
  originalLog = console.log;
  originalError = console.error;
  originalStderrWrite = process.stderr.write;

  console.log = ((...args: any[]) => {
    consoleOutput.push(args.map(String).join(' '));
  }) as typeof console.log;

  console.error = ((...args: any[]) => {
    consoleOutput.push(args.map(String).join(' '));
  }) as typeof console.error;

  process.stderr.write = ((chunk: any) => {
    consoleOutput.push(String(chunk).trim());
    return true;
  }) as typeof process.stderr.write;
}

/**
 * Teardown console mocking - call in afterEach
 */
export function teardownConsoleMock(): void {
  console.log = originalLog;
  console.error = originalError;
  process.stderr.write = originalStderrWrite;
}

/**
 * Helper function to execute a CLI command and capture output
 */
export async function executeCommand(args: string[], expectError = false): Promise<string> {
  consoleOutput = [];
  const originalArgv = process.argv;
  const originalExit = process.exit;
  let exitCalled = false;

  process.exit = ((code?: number) => {
    exitCalled = true;
    throw new Error(`Process exited with code ${code || 0}`);
  }) as typeof process.exit;

  process.argv = ['node', 'cli.js', ...args];

  try {
    // Reset all option values including negated boolean options
    function resetCommandOptions(cmd: any): void {
      cmd._optionValues = {};
      // Reset options to their default values
      if (cmd.options) {
        for (const option of cmd.options) {
          if (option.negate) {
            // For --no-* options, the positive version defaults to true
            cmd._optionValues[option.attributeName()] = true;
          }
        }
      }
      cmd.commands.forEach((subcmd: any) => resetCommandOptions(subcmd));
    }
    resetCommandOptions(program);

    await program.parseAsync(process.argv);
    if (expectError && !exitCalled) {
      throw new Error('Expected command to fail but it succeeded');
    }
    return consoleOutput.join('\n');
  } catch (error: any) {
    if (expectError) {
      const output = consoleOutput.join('\n');
      return output || error.message;
    }
    throw error;
  } finally {
    process.argv = originalArgv;
    process.exit = originalExit;
  }
}

/**
 * Validates that a string is a valid hexadecimal secret key
 * @param key - The key string to validate
 * @returns true if valid, false otherwise
 */
export function isValidSecretKey(key: string): boolean {
  // Secret keys should be hex strings (with or without 0x prefix)
  const hexPattern = /^(0x)?[0-9a-fA-F]+$/;
  if (!hexPattern.test(key)) {
    return false;
  }

  // Remove 0x prefix if present
  const cleanKey = key.startsWith('0x') ? key.slice(2) : key;

  // Should be a valid length (typically 64 characters for 32 bytes)
  // But we allow flexibility for field elements which may have different representations
  return cleanKey.length > 0 && cleanKey.length <= 78; // Fr.toString() max length
}

/**
 * Validates that a key is in valid field element range
 * Field elements in Aztec are < BN254 curve order
 * @param key - The key string (hex) to validate
 * @returns true if within valid range
 */
export function isValidFieldElement(value: string): boolean {
  try {
    Fr.fromHexString(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Test vectors for key generation
 */
export const KEY_TEST_VECTORS = {
  // Expected output patterns
  patterns: {
    humanReadable: {
      header: /Generated Secret Key/,
      separator: /={50}/,
      secretKeyLabel: /Secret Key:/,
      seedLabel: /Seed:/,
      warningLabel: /WARNING:/,
      secretKeyValue: /0x[0-9a-f]+/i,
      securityWarning: /Store this secret key securely/,
    },
    json: {
      hasSecretKey: /"secretKey"\s*:/,
      hasWarning: /"warning"\s*:/,
      validJson: /^\{[\s\S]*\}$/,
    },
  },

  // Expected field properties
  fieldProperties: {
    minLength: 1,
    maxLength: 78, // Maximum length for Fr.toString() representation
    prefix: '0x',
  },

  // Security warning text
  expectedWarning: WARNINGS.KEY_GENERATE,

  // Seed test cases
  seedTests: [
    {
      seed: 'hello',
      description: 'simple word',
    },
    {
      seed: 'test123',
      description: 'alphanumeric string',
    },
    {
      seed: 'Hello World!',
      description: 'string with spaces and punctuation',
    },
    {
      seed: 'a',
      description: 'single character',
    },
    {
      seed: '12345678901234567890123456789012',
      description: 'exactly 32 characters',
    },
    {
      seed: '123456789012345678901234567890123456789012345678901234567890',
      description: 'string longer than 32 characters',
    },
    {
      seed: '',
      description: 'empty string',
    },
    {
      seed: '###',
      description: 'string with padding characters',
    },
  ],
};

/**
 * Extracts the secret key from human-readable CLI output
 * @param output - The CLI output string
 * @returns The extracted secret key or null if not found
 */
export function extractSecretKey(output: string): string | null {
  const match = output.match(/Secret Key:\s*(0x[0-9a-f]+)/i);
  return match ? match[1] : null;
}

/**
 * Extracts the warning message from CLI output
 * @param output - The CLI output string
 * @returns The extracted warning or null if not found
 */
export function extractWarning(output: string): string | null {
  const match = output.match(/WARNING:\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : null;
}

/**
 * Parses JSON output from CLI
 * @param output - The CLI output string
 * @returns Parsed JSON object or null if invalid
 */
export function parseJsonOutput(output: string): any {
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

/**
 * Validates the structure of a GeneratedKey JSON response
 * @param obj - The object to validate
 * @returns true if valid structure
 */
export function isValidGeneratedKeyJson(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.secretKey === 'string' &&
    typeof obj.warning === 'string' &&
    isValidFieldElement(obj.secretKey)
  );
}

/**
 * Test helper to verify two keys are different
 * @param key1 - First key
 * @param key2 - Second key
 * @returns true if keys are different
 */
export function areKeysDifferent(key1: string, key2: string): boolean {
  return key1 !== key2 && key1.length > 0 && key2.length > 0;
}

/**
 * Test vectors for key derivation
 */
export const DERIVE_KEYS_TEST_VECTORS = {
  // Expected output patterns for human-readable format
  patterns: {
    humanReadable: {
      header: /Derived Keys/,
      separator: /={50}/,
      secretKeysHeader: /Secret Keys:/,
      publicKeysHeader: /Public Keys:/,
      masterNullifierSecretKey: /Master Nullifier Secret Key:/,
      masterIncomingViewingSecretKey: /Master Incoming Viewing Secret Key:/,
      masterOutgoingViewingSecretKey: /Master Outgoing Viewing Secret Key:/,
      masterTaggingSecretKey: /Master Tagging Secret Key:/,
      masterNullifierPublicKey: /Master Nullifier Public Key:/,
      masterIncomingViewingPublicKey: /Master Incoming Viewing Public Key:/,
      masterOutgoingViewingPublicKey: /Master Outgoing Viewing Public Key:/,
      masterTaggingPublicKey: /Master Tagging Public Key:/,
      keyValue: /0x[0-9a-f]+/i,
    },
  },

  // Test secret keys for determinism testing
  testSecrets: [
    {
      secret: '0x0000000000000000000000000000000000000000000000000000000000000001',
      description: 'secret key 1',
    },
    {
      secret: '0x0000000000000000000000000000000000000000000000000000000000000002',
      description: 'secret key 2',
    },
    {
      secret: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      description: 'typical hex secret',
    },
  ],
};

/**
 * Validates the structure of a DerivedKeys JSON response
 * @param obj - The object to validate
 * @param includePublic - Whether public keys should be included
 * @returns true if valid structure
 */
export function isValidDerivedKeysJson(obj: any, includePublic: boolean = false): boolean {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  // Check secret keys structure
  if (!obj.secretKeys || typeof obj.secretKeys !== 'object') {
    return false;
  }

  const requiredSecretKeys = [
    'masterNullifierSecretKey',
    'masterIncomingViewingSecretKey',
    'masterOutgoingViewingSecretKey',
    'masterTaggingSecretKey',
  ];

  for (const key of requiredSecretKeys) {
    if (typeof obj.secretKeys[key] !== 'string' || !isValidFieldElement(obj.secretKeys[key])) {
      return false;
    }
  }

  // Check public keys structure if required
  if (includePublic) {
    if (!obj.publicKeys || typeof obj.publicKeys !== 'object') {
      return false;
    }

    const requiredPublicKeys = [
      'masterNullifierPublicKey',
      'masterIncomingViewingPublicKey',
      'masterOutgoingViewingPublicKey',
      'masterTaggingPublicKey',
    ];

    for (const key of requiredPublicKeys) {
      if (typeof obj.publicKeys[key] !== 'string' || !obj.publicKeys[key].startsWith('0x')) {
        return false;
      }
    }
  } else {
    // Public keys should not be present if not requested
    if (obj.publicKeys !== undefined) {
      return false;
    }
  }

  return true;
}

/**
 * Extracts derived secret keys from human-readable CLI output
 * @param output - The CLI output string
 * @returns Object with all four secret keys or null if not found
 */
export function extractDerivedSecretKeys(output: string): {
  masterNullifierSecretKey: string;
  masterIncomingViewingSecretKey: string;
  masterOutgoingViewingSecretKey: string;
  masterTaggingSecretKey: string;
} | null {
  const nullifierMatch = output.match(/Master Nullifier Secret Key:\s*(0x[0-9a-f]+)/i);
  const incomingMatch = output.match(/Master Incoming Viewing Secret Key:\s*(0x[0-9a-f]+)/i);
  const outgoingMatch = output.match(/Master Outgoing Viewing Secret Key:\s*(0x[0-9a-f]+)/i);
  const taggingMatch = output.match(/Master Tagging Secret Key:\s*(0x[0-9a-f]+)/i);

  if (!nullifierMatch || !incomingMatch || !outgoingMatch || !taggingMatch) {
    return null;
  }

  return {
    masterNullifierSecretKey: nullifierMatch[1],
    masterIncomingViewingSecretKey: incomingMatch[1],
    masterOutgoingViewingSecretKey: outgoingMatch[1],
    masterTaggingSecretKey: taggingMatch[1],
  };
}

/**
 * Extracts derived public keys from human-readable CLI output
 * @param output - The CLI output string
 * @returns Object with all four public keys or null if not found
 */
export function extractDerivedPublicKeys(output: string): {
  masterNullifierPublicKey: string;
  masterIncomingViewingPublicKey: string;
  masterOutgoingViewingPublicKey: string;
  masterTaggingPublicKey: string;
} | null {
  const nullifierMatch = output.match(/Master Nullifier Public Key:\s*(0x[0-9a-f]+)/i);
  const incomingMatch = output.match(/Master Incoming Viewing Public Key:\s*(0x[0-9a-f]+)/i);
  const outgoingMatch = output.match(/Master Outgoing Viewing Public Key:\s*(0x[0-9a-f]+)/i);
  const taggingMatch = output.match(/Master Tagging Public Key:\s*(0x[0-9a-f]+)/i);

  if (!nullifierMatch || !incomingMatch || !outgoingMatch || !taggingMatch) {
    return null;
  }

  return {
    masterNullifierPublicKey: nullifierMatch[1],
    masterIncomingViewingPublicKey: incomingMatch[1],
    masterOutgoingViewingPublicKey: outgoingMatch[1],
    masterTaggingPublicKey: taggingMatch[1],
  };
}

/**
 * Validates that a string is a valid Aztec address
 * @param address - The address string to validate
 * @returns true if valid Aztec address format
 */
export async function isValidAztecAddress(address: string): Promise<boolean> {
  try {
    const aztecAddress = AztecAddress.fromString(address);
    return await aztecAddress.isValid();
  } catch {
    return false;
  }
}

/**
 * Extracts the account address from human-readable CLI output
 * @param output - The CLI output string
 * @returns The extracted address or null if not found
 */
export function extractAddress(output: string): string | null {
  const match = output.match(/Address:\s*(0x[0-9a-f]+)/i);
  return match ? match[1] : null;
}

/**
 * Validates the structure of a derive-address JSON response
 * @param obj - The object to validate
 * @returns true if valid structure
 */
export async function isValidDerivedAddressJson(obj: any): Promise<boolean> {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.address === 'string' &&
    await isValidAztecAddress(obj.address)
  );
}

/**
 * Test vectors for address derivation
 */
export const DERIVE_ADDRESS_TEST_VECTORS = {
  // Expected output patterns for human-readable format
  patterns: {
    humanReadable: {
      header: /Derived Account Address/,
      separator: /={50}/,
      addressLabel: /Address:/,
      saltLabel: /Salt:/,
      addressValue: /0x[0-9a-f]{64}/i,
    },
    json: {
      hasAddress: /"address"\s*:/,
      validJson: /^\{[\s\S]*\}$/,
    },
  },

  // Test cases with known secret keys and expected addresses
  knownAddresses: [
    {
      secretKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
      salt: undefined,
      expectedAddress: '0x2bfc1d99a997932e54c0f65519f4084e29d4044596200aa8edaf82ebb41cefd9',
      description: 'secret key = 1, no salt (defaults to 0)',
    },
    {
      secretKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
      salt: '0',
      expectedAddress: '0x2bfc1d99a997932e54c0f65519f4084e29d4044596200aa8edaf82ebb41cefd9',
      description: 'secret key = 1, salt = 0',
    },
    {
      secretKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
      salt: '1',
      expectedAddress: '0x29eb3276bb9ff2f0316e7626eaf60c087e7ccb66bf172de2eed1bb1258747dc9',
      description: 'secret key = 1, salt = 1',
    },
    {
      secretKey: '0x0000000000000000000000000000000000000000000000000000000000000042',
      salt: undefined,
      expectedAddress: '0x213fea9e5fdaa7ef9a74e58b6916ae34def4a69c464ed0e48c26d6ae33c41920',
      description: 'secret key = 0x42, no salt',
    },
  ],

  // Test cases for random secret keys (just check address format, not specific value)
  randomSecretTests: [
    {
      secretKey: '0x0000000000000000000000000000000000000000000000000000000000000002',
      description: 'secret key = 2',
    },
    {
      secretKey: '0x000000000000000000000000000000000000000000000000000000000000ffff',
      description: 'secret key = 0xffff',
    },
  ],

  // Test cases with different salt formats
  saltTests: [
    {
      salt: '0',
      description: 'salt = 0',
    },
    {
      salt: '1',
      description: 'salt = 1',
    },
    {
      salt: '0x1234567890abcdef',
      description: 'salt = hex value',
    },
  ],
};

/**
 * Test vectors for key import
 */
export const IMPORT_KEY_TEST_VECTORS = {
  // Expected output patterns for human-readable format
  patterns: {
    humanReadable: {
      header: /Imported Secret Key/,
      separator: /={50}/,
      aliasLabel: /Alias:/,
      encryptedLabel: /Encrypted:/,
      storedLabel: /Stored in:/,
      warningLabel: /WARNING:/,
      keyValue: /0x[0-9a-f]+/i,
    },
    json: {
      hasAlias: /"alias"\s*:/,
      hasSecret: /"secret"\s*:/,
      hasEncrypted: /"encrypted"\s*:/,
      hasStoragePath: /"storagePath"\s*:/,
      hasWarning: /"warning"\s*:/,
      validJson: /^\{[\s\S]*\}$/,
    },
  },

  // Expected warning texts
  encryptedWarning: WARNINGS.KEY_ENCRYPTED,
  plainWarning: WARNINGS.KEY_UNENCRYPTED,

  // Valid alias test cases
  validAliases: [
    { alias: 'mykey', description: 'simple lowercase' },
    { alias: 'MyKey', description: 'mixed case' },
    { alias: '_private', description: 'starts with underscore' },
    { alias: 'test_key', description: 'with underscore' },
    { alias: 'test-key', description: 'with dash' },
    { alias: 'key123', description: 'with numbers' },
    { alias: 'KEY_123', description: 'uppercase with underscore and numbers' },
    { alias: 'a', description: 'single character' },
    { alias: 'a'.repeat(64), description: '64 characters (max length)' },
  ],

  // Invalid alias test cases
  invalidAliases: [
    { alias: '1key', description: 'starts with number' },
    { alias: '-key', description: 'starts with dash' },
    { alias: 'my key', description: 'contains space' },
    { alias: 'my@key', description: 'contains special character' },
    { alias: 'key!', description: 'ends with special character' },
    { alias: 'a'.repeat(65), description: 'exceeds 64 characters' },
    { alias: '', description: 'empty string' },
  ],

  // Test secret keys
  testSecrets: [
    {
      secret: '0x0000000000000000000000000000000000000000000000000000000000000001',
      description: 'secret key = 1',
    },
    {
      secret: '0x0000000000000000000000000000000000000000000000000000000000000042',
      description: 'secret key = 0x42',
    },
    {
      secret: '1',
      description: 'decimal format',
    },
  ],

  // Invalid secret keys
  invalidSecrets: [
    { secret: 'not-a-key', description: 'invalid hex' },
    { secret: '0xZZZ', description: 'invalid hex characters' },
    { secret: '', description: 'empty string' },
  ],
};

/**
 * Extracts the alias from human-readable import CLI output
 * @param output - The CLI output string
 * @returns The extracted alias or null if not found
 */
export function extractAlias(output: string): string | null {
  const match = output.match(/Alias:\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : null;
}

/**
 * Extracts the keystore path from human-readable import CLI output
 * @param output - The CLI output string
 * @returns The extracted path or null if not found
 */
export function extractKeystorePath(output: string): string | null {
  const match = output.match(/Stored in:\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : null;
}

/**
 * Validates the structure of an ImportedKey JSON response
 * @param obj - The object to validate
 * @returns true if valid structure
 */
export function isValidImportedKeyJson(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.alias === 'string' &&
    typeof obj.secret === 'string' &&
    typeof obj.encrypted === 'boolean' &&
    typeof obj.storagePath === 'string' &&
    typeof obj.warning === 'string' &&
    isValidFieldElement(obj.secret)
  );
}

/**
 * Test vectors for key export
 */
export const EXPORT_KEY_TEST_VECTORS = {
  // Expected output patterns for human-readable format
  patterns: {
    humanReadable: {
      header: /Exported Secret Key/,
      separator: /={50}/,
      aliasLabel: /Alias:/,
      encryptedLabel: /Encrypted:/,
      secretLabel: /Secret:/,
      warningLabel: /WARNING:/,
      keyValue: /0x[0-9a-f]+/i,
      securityWarning: /Handle this secret key carefully/,
    },
    json: {
      hasAlias: /"alias"\s*:/,
      hasSecret: /"secret"\s*:/,
      hasEncrypted: /"encrypted"\s*:/,
      hasWarning: /"warning"\s*:/,
      validJson: /^\{[\s\S]*\}$/,
    },
  },

  // Expected warning text
  expectedWarning: WARNINGS.KEY_EXPORT,
};

/**
 * Test vectors for key list
 */
export const LIST_KEYS_TEST_VECTORS = {
  // Expected output patterns for human-readable format
  patterns: {
    humanReadable: {
      header: /Stored Secrets/,
      separator: /={50}/,
      storageLabel: /Storage:/,
      encryptedStatus: /\(encrypted\)/,
      plainStatus: /\(plain\)/,
      noSecrets: /No secrets stored/,
    },
    json: {
      hasSecrets: /"secrets"\s*:/,
      hasStoragePath: /"storagePath"\s*:/,
      validJson: /^\{[\s\S]*\}$/,
    },
  },
};

/**
 * Test vectors for key delete
 */
export const DELETE_KEY_TEST_VECTORS = {
  // Expected output patterns for human-readable format
  patterns: {
    humanReadable: {
      header: /Deleted Secret/,
      separator: /={50}/,
      aliasLabel: /Alias:/,
      wasEncryptedLabel: /Was encrypted:/,
    },
    json: {
      hasDeleted: /"deleted"\s*:/,
      hasAlias: /"alias"\s*:/,
      hasEncrypted: /"encrypted"\s*:/,
      validJson: /^\{[\s\S]*\}$/,
    },
  },
};

/**
 * Validates the structure of an ExportedKey JSON response
 * @param obj - The object to validate
 * @returns true if valid structure
 */
export function isValidExportedKeyJson(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.alias === 'string' &&
    typeof obj.secret === 'string' &&
    typeof obj.encrypted === 'boolean' &&
    typeof obj.warning === 'string' &&
    isValidFieldElement(obj.secret)
  );
}


/**
 * Validates the structure of a ListedKeys JSON response
 * @param obj - The object to validate
 * @returns true if valid structure
 */
export function isValidListedKeysJson(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    Array.isArray(obj.secrets) &&
    typeof obj.storagePath === 'string' &&
    obj.secrets.every((s: any) =>
      typeof s.alias === 'string' &&
      typeof s.encrypted === 'boolean'
    )
  );
}

/**
 * Validates the structure of a DeletedKey JSON response
 * @param obj - The object to validate
 * @returns true if valid structure
 */
export function isValidDeletedKeyJson(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    obj.deleted === true &&
    typeof obj.alias === 'string' &&
    typeof obj.encrypted === 'boolean'
  );
}

/**
 * Convert a message string to a Buffer (same logic as in wallet.ts)
 * If message starts with 0x and is valid hex, treat as hex-encoded bytes
 * Otherwise, treat as a UTF-8 string
 */
function messageToBuffer(message: string): Buffer {
  if (message.startsWith('0x')) {
    const hexStr = message.slice(2);
    if (/^[0-9a-fA-F]*$/.test(hexStr) && hexStr.length > 0) {
      return Buffer.from(hexStr, 'hex');
    }
  }
  return Buffer.from(message, 'utf8');
}

/**
 * Cryptographically verifies a Schnorr signature using the Aztec library
 * @param message - The message that was signed
 * @param signature - The signature string (hex)
 * @param publicKey - The public key string (hex)
 * @returns true if the signature is cryptographically valid
 */
export async function verifySchnorrSignature(
  message: string,
  signature: string,
  publicKey: string
): Promise<boolean> {
  try {
    const sig = SchnorrSignature.fromString(signature);
    const pubKey = Point.fromString(publicKey);
    const messageBuffer = messageToBuffer(message);
    const schnorr = new Schnorr();
    return await schnorr.verifySignature(messageBuffer, pubKey, sig);
  } catch {
    return false;
  }
}


/**
 * Extracts the signature from human-readable CLI output
 * @param output - The CLI output string
 * @returns The extracted signature or null if not found
 */
export function extractSignature(output: string): string | null {
  const match = output.match(/Signature:\s*(0x[0-9a-f]{128})/i);
  return match ? match[1] : null;
}

/**
 * Extracts the public key from human-readable CLI output
 * @param output - The CLI output string
 * @returns The extracted public key or null if not found
 */
export function extractPublicKey(output: string): string | null {
  const match = output.match(/Public Key:\s*(0x[0-9a-f]{128})/i);
  return match ? match[1] : null;
}

/**
 * Extracts the message from human-readable sign CLI output
 * @param output - The CLI output string
 * @returns The extracted message or null if not found (empty string is valid)
 */
export function extractMessage(output: string): string | null {
  // Match "Message: " followed by content up to double newline before "Signature:"
  // Format is: "Message: <content>\n\nSignature:"
  const match = output.match(/Message:\s*(.*?)\n\nSignature:/s);
  if (match) {
    // Return the captured content, trimmed (will be empty string for empty messages)
    return match[1].trim();
  }
  return null;
}

/**
 * Validates the structure of a SignedMessage JSON response
 * @param obj - The object to validate
 * @returns true if valid structure
 */
export function isValidSignedMessageJson(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.message === 'string' &&
    typeof obj.signature === 'string' &&
    typeof obj.publicKey === 'string'
  );
}

/**
 * Test vectors for message signing
 */
export const SIGN_MESSAGE_TEST_VECTORS = {
  // Expected output patterns for human-readable format
  patterns: {
    humanReadable: {
      header: /Schnorr Signature/,
      separator: /={50}/,
      messageLabel: /Message:/,
      signatureLabel: /Signature:/,
      publicKeyLabel: /Public Key:/,
      signatureValue: /0x[0-9a-f]{128}/i,
      publicKeyValue: /0x[0-9a-f]{128}/i,
    },
    json: {
      hasMessage: /"message"\s*:/,
      hasSignature: /"signature"\s*:/,
      hasPublicKey: /"publicKey"\s*:/,
      validJson: /^\{[\s\S]*\}$/,
    },
  },

  // Test cases with different string messages
  testMessages: [
    { message: 'hello', description: 'simple word' },
    { message: 'Hello, World!', description: 'greeting with punctuation' },
    { message: 'test message 123', description: 'message with spaces and numbers' },
    { message: 'a', description: 'single character' },
    { message: '', description: 'empty message' },
    { message: 'The quick brown fox jumps over the lazy dog', description: 'pangram' },
  ],

  // Test cases with hex-encoded byte messages
  testHexMessages: [
    { message: '0x48656c6c6f', description: 'hex bytes for "Hello"' },
    { message: '0xdeadbeef', description: 'typical hex bytes' },
    { message: '0x00', description: 'single zero byte' },
    { message: '0x0000000000000000000000000000000000000000000000000000000000000001', description: '32 bytes' },
    {
      message: '0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
      description: 'sequential bytes'
    },
  ],

  // Test secret keys for signing
  testSecrets: [
    {
      secret: '0x0000000000000000000000000000000000000000000000000000000000000001',
      description: 'secret key = 1',
    },
    {
      secret: '0x0000000000000000000000000000000000000000000000000000000000000042',
      description: 'secret key = 0x42',
    },
    {
      secret: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      description: 'typical hex secret',
    },
  ],
};

/**
 * Extracts the validity status from human-readable verify CLI output
 * @param output - The CLI output string
 * @returns true if valid, false if invalid, null if not found
 */
export function extractValid(output: string): boolean | null {
  const validMatch = output.match(/Valid:\s*✓\s*YES/i);
  if (validMatch) {
    return true;
  }
  const invalidMatch = output.match(/Valid:\s*✗\s*NO/i);
  if (invalidMatch) {
    return false;
  }
  return null;
}

/**
 * Validates the structure of a VerifiedSignature JSON response
 * @param obj - The object to validate
 * @returns true if valid structure
 */
export function isValidVerifiedSignatureJson(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.message === 'string' &&
    typeof obj.signature === 'string' &&
    typeof obj.publicKey === 'string' &&
    typeof obj.valid === 'boolean'
  );
}

/**
 * Test vectors for signature verification
 */
export const VERIFY_SIGNATURE_TEST_VECTORS = {
  // Expected output patterns for human-readable format
  patterns: {
    humanReadable: {
      header: /Schnorr Signature Verification/,
      separator: /={50}/,
      messageLabel: /Message:/,
      signatureLabel: /Signature:/,
      publicKeyLabel: /Public Key:/,
      validLabel: /Valid:/,
      validYes: /✓\s*YES/,
      validNo: /✗\s*NO/,
    },
    json: {
      hasMessage: /"message"\s*:/,
      hasSignature: /"signature"\s*:/,
      hasPublicKey: /"publicKey"\s*:/,
      hasValid: /"valid"\s*:/,
      validJson: /^\{[\s\S]*\}$/,
    },
  },
};

/**
 * Test vectors for encrypted keystore operations
 */
export const ENCRYPTED_KEYSTORE_TEST_VECTORS = {
  // Expected output patterns for human-readable format
  patterns: {
    create: {
      header: /Created Encrypted Keystore/,
      separator: /={50}/,
      nameLabel: /Name:/,
      pathLabel: /Path:/,
      uuidLabel: /UUID:/,
      cipherLabel: /Cipher:/,
      kdfLabel: /KDF:/,
      warningLabel: /WARNING:/,
      uuidValue: /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    },
    unlock: {
      header: /Unlocked Keystore/,
      separator: /={50}/,
      uuidLabel: /UUID:/,
      secretLabel: /Secret:/,
      warningLabel: /WARNING:/,
      secretValue: /0x[0-9a-f]+/i,
    },
    inspect: {
      header: /Keystore Metadata/,
      separator: /={50}/,
      nameLabel: /Name:/,
      pathLabel: /Path:/,
      uuidLabel: /UUID:/,
      cipherLabel: /Cipher:/,
      kdfLabel: /KDF:/,
    },
    list: {
      header: /Keystores/,
      separator: /={50}/,
      directoryLabel: /Directory:/,
      noKeystores: /No keystores found/,
    },
    json: {
      hasName: /"name"\s*:/,
      hasPath: /"path"\s*:/,
      hasId: /"id"\s*:/,
      hasCipher: /"cipher"\s*:/,
      hasKdf: /"kdf"\s*:/,
      hasSecret: /"secret"\s*:/,
      validJson: /^\{[\s\S]*\}$/,
    },
  },

  // Expected encryption parameters
  expectedParams: {
    cipher: 'aes-128-ctr',
    kdf: 'scrypt',
    version: 3,
  },

  // Go-ethereum test vector for compatibility verification
  // From: https://lsongnotes.wordpress.com/2018/04/30/manually-decrypting-ethereum-keystore-file/
  goEthereumTestVector: {
    keystore: {
      address: '7e5f4552091a69125d5dfcb7b8c2659029395bdf',
      crypto: {
        cipher: 'aes-128-ctr',
        ciphertext: 'f97975cb858242372a7c910de23976be4f545ad6b4d6ddb86e54b7d9b3b1c6a1',
        cipherparams: {
          iv: '7fa01f1d0d6a7117382632028cb0c323',
        },
        kdf: 'scrypt',
        kdfparams: {
          dklen: 32,
          n: 262144,
          p: 1,
          r: 8,
          salt: '859c5d345ee58dfca293950c540016af3a889d0dacb00b8eff2ac2b150f0b07e',
        },
        mac: '31ccb67e48aba5d64bf727a5c6589fd5857021540d25d12df31323f10ae2bf97',
      },
      id: 'dc74bc44-784b-4293-b1c7-b91e9fd7d6cc',
      version: 3,
    },
    password: 'a',
    expectedSecret: '0x0000000000000000000000000000000000000000000000000000000000000001',
  },

  // Expected warning text
  warnings: {
    create: 'Remember your password! It cannot be recovered.',
    unlock: 'Handle this secret key carefully. Anyone with access can control associated accounts.',
  },

  // Test secret keys
  testSecrets: [
    {
      secret: '0x0000000000000000000000000000000000000000000000000000000000000001',
      description: 'secret key = 1',
    },
    {
      secret: '0x0000000000000000000000000000000000000000000000000000000000000042',
      description: 'secret key = 0x42',
    },
    {
      secret: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      description: 'typical hex secret',
    },
  ],

  // Test passwords
  testPasswords: [
    { password: 'password123', description: 'simple password' },
    { password: 'P@ssw0rd!Complex', description: 'complex password' },
    { password: 'a', description: 'single character' },
    { password: ' ', description: 'single space' },
    { password: 'password with spaces', description: 'password with spaces' },
  ],
};

/**
 * Validates that a string is a valid UUID v4
 * @param uuid - The string to validate
 * @returns true if valid UUID v4
 */
export function isValidUuidV4(uuid: string): boolean {
  const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Pattern.test(uuid);
}

/**
 * Extracts the UUID from human-readable keystore CLI output
 * @param output - The CLI output string
 * @returns The extracted UUID or null if not found
 */
export function extractKeystoreUuid(output: string): string | null {
  const match = output.match(/UUID:\s*([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i);
  return match ? match[1] : null;
}

/**
 * Extracts the file path from human-readable keystore CLI output
 * @param output - The CLI output string
 * @returns The extracted file path or null if not found
 */
export function extractKeystoreFile(output: string): string | null {
  const match = output.match(/File:\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : null;
}

/**
 * Extracts the cipher from human-readable keystore CLI output
 * @param output - The CLI output string
 * @returns The extracted cipher or null if not found
 */
export function extractKeystoreCipher(output: string): string | null {
  const match = output.match(/Cipher:\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : null;
}

/**
 * Extracts the KDF from human-readable keystore CLI output
 * @param output - The CLI output string
 * @returns The extracted KDF or null if not found
 */
export function extractKeystoreKdf(output: string): string | null {
  const match = output.match(/KDF:\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : null;
}

/**
 * Extracts the secret from human-readable unlock CLI output
 * @param output - The CLI output string
 * @returns The extracted secret or null if not found
 */
export function extractUnlockedSecret(output: string): string | null {
  const match = output.match(/Secret:\s*(0x[0-9a-f]+)/i);
  return match ? match[1] : null;
}

/**
 * Validates the structure of a keystore create JSON response
 * @param obj - The object to validate
 * @returns true if valid structure
 */
export function isValidKeystoreCreateJson(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.name === 'string' &&
    typeof obj.path === 'string' &&
    typeof obj.id === 'string' &&
    typeof obj.cipher === 'string' &&
    typeof obj.kdf === 'string' &&
    isValidUuidV4(obj.id)
  );
}

/**
 * Validates the structure of a keystore unlock JSON response
 * @param obj - The object to validate
 * @returns true if valid structure
 */
export function isValidKeystoreUnlockJson(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.secret === 'string' &&
    typeof obj.id === 'string' &&
    isValidUuidV4(obj.id)
  );
}

/**
 * Validates the structure of a keystore inspect JSON response
 * @param obj - The object to validate
 * @returns true if valid structure
 */
export function isValidKeystoreInspectJson(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.name === 'string' &&
    typeof obj.path === 'string' &&
    typeof obj.id === 'string' &&
    typeof obj.cipher === 'string' &&
    typeof obj.kdf === 'string' &&
    isValidUuidV4(obj.id)
  );
}

/**
 * Validates a keystore file JSON structure
 * @param obj - The parsed keystore file content
 * @returns true if valid keystore file structure
 */
export function isValidKeystoreFile(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    obj.version === 3 &&
    typeof obj.id === 'string' &&
    isValidUuidV4(obj.id) &&
    obj.crypto?.cipher === 'aes-128-ctr' &&
    obj.crypto?.kdf === 'scrypt' &&
    typeof obj.crypto?.ciphertext === 'string' &&
    typeof obj.crypto?.mac === 'string' &&
    typeof obj.crypto?.cipherparams?.iv === 'string' &&
    typeof obj.crypto?.kdfparams?.salt === 'string' &&
    typeof obj.crypto?.kdfparams?.n === 'number' &&
    typeof obj.crypto?.kdfparams?.r === 'number' &&
    typeof obj.crypto?.kdfparams?.p === 'number' &&
    typeof obj.crypto?.kdfparams?.dklen === 'number'
  );
}

// ============================================================================
// TX Metadata Test Vectors and Utilities
// ============================================================================

/**
 * Test vectors for TX metadata operations
 */
export const TX_METADATA_TEST_VECTORS = {
  // Valid transaction hashes
  validTxHashes: [
    '0x' + '1234567890abcdef'.repeat(4),
    '0x' + 'a'.repeat(64),
    '0x' + '0'.repeat(64),
  ],

  // Invalid transaction hashes
  invalidTxHashes: [
    'not-a-hash',
    '0x123', // too short
    '0x' + 'g'.repeat(64), // invalid hex
    '', // empty
  ],

  // Sample metadata entries
  sampleMetadata: [
    {
      label: 'DEX Swap',
      description: 'Swapped tokens on Uniswap',
      tags: ['defi', 'swap'],
      custom: { protocol: 'uniswap' },
    },
    {
      label: 'Transfer',
      description: 'Sent tokens to Alice',
      tags: ['token', 'transfer'],
    },
    {
      label: 'Mint NFT',
      tags: ['nft', 'mint'],
      contractAddress: '0x' + 'b'.repeat(40),
    },
  ],

  // Test password
  testPassword: 'test-password-for-metadata-123',
  wrongPassword: 'wrong-password',

  // Expected output patterns
  patterns: {
    add: {
      header: /Metadata Added/,
      separator: /={50}/,
      transactionLabel: /Transaction:/,
      labelLabel: /Label:/,
      encryptedLabel: /Encrypted:/,
      warningLabel: /WARNING:/,
    },
    get: {
      header: /Transaction Metadata/,
      separator: /={50}/,
      transactionLabel: /Transaction:/,
      labelLabel: /Label:/,
      descriptionLabel: /Description:/,
      tagsLabel: /Tags:/,
      createdLabel: /Created:/,
      updatedLabel: /Updated:/,
    },
    list: {
      header: /Transaction Metadata/,
      separator: /={50}/,
      totalLabel: /Total:/,
      noEntries: /No metadata entries found/,
    },
    update: {
      header: /Metadata Updated/,
      separator: /={50}/,
      transactionLabel: /Transaction:/,
      updatedFieldsLabel: /Updated fields:/,
    },
    delete: {
      header: /Metadata Deleted/,
      separator: /={50}/,
      transactionLabel: /Transaction:/,
    },
    json: {
      validJson: /^\{[\s\S]*\}$/,
    },
  },
};

/**
 * Generates a random transaction hash for testing
 */
export function generateRandomTxHash(): string {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

/**
 * Validates that a string is a valid transaction hash
 */
export function isValidTxHash(hash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(hash);
}

/**
 * Extracts the transaction hash from CLI output
 */
export function extractTxHash(output: string): string | null {
  const match = output.match(/Transaction:\s*(0x[0-9a-f]{64})/i);
  return match ? match[1] : null;
}

/**
 * Extracts the label from CLI metadata output
 */
export function extractMetadataLabel(output: string): string | null {
  const match = output.match(/Label:\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : null;
}

/**
 * Extracts the description from CLI metadata output
 */
export function extractMetadataDescription(output: string): string | null {
  const match = output.match(/Description:\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : null;
}

/**
 * Extracts tags from CLI metadata output
 */
export function extractMetadataTags(output: string): string[] | null {
  const match = output.match(/Tags:\s*(.+?)(?:\n|$)/);
  if (!match) return null;
  return match[1].split(',').map(t => t.trim()).filter(Boolean);
}

/**
 * Extracts the total count from list output
 */
export function extractMetadataTotal(output: string): number | null {
  const match = output.match(/Total:\s*(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Validates the structure of a TX metadata add JSON response
 */
export function isValidTxMetadataAddJson(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    obj.success === true &&
    typeof obj.txHash === 'string' &&
    typeof obj.encrypted === 'boolean' &&
    isValidTxHash(obj.txHash)
  );
}

/**
 * Validates the structure of a TX metadata get JSON response
 */
export function isValidTxMetadataGetJson(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.txHash === 'string' &&
    typeof obj.createdAt === 'number' &&
    typeof obj.updatedAt === 'number' &&
    isValidTxHash(obj.txHash)
  );
}

/**
 * Validates the structure of a TX metadata list JSON response
 * The list command outputs the entries array directly
 */
export function isValidTxMetadataListJson(obj: any): boolean {
  return Array.isArray(obj);
}

/**
 * Validates the structure of a TX metadata update JSON response
 */
export function isValidTxMetadataUpdateJson(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    obj.updated === true &&
    typeof obj.txHash === 'string' &&
    Array.isArray(obj.fields)
  );
}

/**
 * Validates the structure of a TX metadata delete JSON response
 */
export function isValidTxMetadataDeleteJson(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.deleted === 'boolean' &&
    typeof obj.txHash === 'string'
  );
}
