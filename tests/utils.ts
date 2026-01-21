import { Fr } from '@aztec/foundation/fields';

/**
 * Test utilities and test vectors for CLI tests
 */

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
