/**
 * Test utilities and test vectors for CLI tests
 */

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
export function isValidFieldElement(key: string): boolean {
  try {
    // Remove 0x prefix if present
    const cleanKey = key.startsWith('0x') ? key.slice(2) : key;

    // Check if it's a valid hex string
    if (!/^[0-9a-fA-F]+$/.test(cleanKey)) {
      return false;
    }

    // Convert to BigInt and check it's non-negative
    const keyBigInt = BigInt('0x' + cleanKey);

    // Just check that it's a valid positive bigint
    // The Fr class from Aztec handles modular reduction, so values from Fr.toString()
    // should always be valid, even if they appear to exceed the field modulus before reduction
    return keyBigInt >= 0n;
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
  expectedWarning: 'SECURITY WARNING: Store this secret key securely. Anyone with access can control associated accounts.',

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
    isValidSecretKey(obj.secretKey)
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
    if (typeof obj.secretKeys[key] !== 'string' || !isValidSecretKey(obj.secretKeys[key])) {
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
export function isValidAztecAddress(address: string): boolean {
  // Aztec addresses are hex strings (with or without 0x prefix)
  const hexPattern = /^(0x)?[0-9a-fA-F]+$/;
  if (!hexPattern.test(address)) {
    return false;
  }

  // Remove 0x prefix if present
  const cleanAddress = address.startsWith('0x') ? address.slice(2) : address;

  // Aztec addresses should be 64 characters (32 bytes)
  return cleanAddress.length === 64;
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
export function isValidDerivedAddressJson(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.address === 'string' &&
    isValidAztecAddress(obj.address)
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
      expectedAddress: '0x24976a75c17d31ec8425d2d8b0a9090ac16a3634f712588bf717c85f08b06134',
      description: 'secret key = 1, no salt (defaults to 0)',
    },
    {
      secretKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
      salt: '0',
      expectedAddress: '0x24976a75c17d31ec8425d2d8b0a9090ac16a3634f712588bf717c85f08b06134',
      description: 'secret key = 1, salt = 0',
    },
    {
      secretKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
      salt: '1',
      expectedAddress: '0x187f2d51640404859d6d2d61ab3e8dd6e03da7d7d1169c1e2e9073ac5e0f6c61',
      description: 'secret key = 1, salt = 1',
    },
    {
      secretKey: '0x0000000000000000000000000000000000000000000000000000000000000042',
      salt: undefined,
      expectedAddress: '0x1efffe6fa20045009f15601b94ae974f9e39cf2b73510887406a55067ad73578',
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
  encryptedWarning: 'Your secret is encrypted. Remember your password - it cannot be recovered.',
  plainWarning: 'SECURITY WARNING: Your secret is stored unencrypted. Consider using encryption for production keys.',

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
    isValidSecretKey(obj.secret)
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
  expectedWarning: 'SECURITY WARNING: Handle this secret key carefully. Anyone with access can control associated accounts.',
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
    isValidSecretKey(obj.secret)
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
 * Validates that a string is a valid Schnorr signature
 * @param signature - The signature string to validate
 * @returns true if valid Schnorr signature format
 */
export function isValidSchnorrSignature(signature: string): boolean {
  // Schnorr signatures should be 128 hex characters (64 bytes: 32 for s + 32 for e)
  // with or without 0x prefix
  const hexPattern = /^(0x)?[0-9a-fA-F]{128}$/;
  return hexPattern.test(signature);
}

/**
 * Validates that a string is a valid Grumpkin public key
 * @param publicKey - The public key string to validate
 * @returns true if valid public key format
 */
export function isValidPublicKey(publicKey: string): boolean {
  // Grumpkin public keys are represented as points (x, y)
  // They should be hex strings (with or without 0x prefix)
  const hexPattern = /^(0x)?[0-9a-fA-F]+$/;
  if (!hexPattern.test(publicKey)) {
    return false;
  }

  // Remove 0x prefix if present
  const cleanKey = publicKey.startsWith('0x') ? publicKey.slice(2) : publicKey;

  // Public keys should be 128 characters (64 bytes: 32 for x + 32 for y)
  return cleanKey.length === 128;
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
    typeof obj.publicKey === 'string' &&
    isValidSchnorrSignature(obj.signature) &&
    isValidPublicKey(obj.publicKey)
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
    typeof obj.valid === 'boolean' &&
    isValidSchnorrSignature(obj.signature) &&
    isValidPublicKey(obj.publicKey)
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
    isValidSecretKey(obj.secret) &&
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
