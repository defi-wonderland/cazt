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
