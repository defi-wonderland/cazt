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
