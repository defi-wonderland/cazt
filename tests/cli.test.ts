import { program } from '../cli/cli.js';
import {
  isValidSecretKey,
  isValidFieldElement,
  extractSecretKey,
  extractWarning,
  areKeysDifferent,
  KEY_TEST_VECTORS,
  DERIVE_KEYS_TEST_VECTORS,
  isValidDerivedKeysJson,
  extractDerivedSecretKeys,
  extractDerivedPublicKeys,
} from './utils.js';

// Mock console methods to capture output
let consoleOutput: string[] = [];
let originalLog: typeof console.log;
let originalError: typeof console.error;

beforeEach(() => {
  consoleOutput = [];
  originalLog = console.log;
  originalError = console.error;
  
  // Simple mock that captures output
  console.log = ((...args: any[]) => {
    consoleOutput.push(args.map(String).join(' '));
  }) as typeof console.log;
  
  console.error = ((...args: any[]) => {
    consoleOutput.push(args.map(String).join(' '));
  }) as typeof console.error;
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
});

/**
 * Helper function to execute a CLI command and capture output
 */
async function executeCommand(args: string[], expectError = false): Promise<string> {
  consoleOutput = [];
  // Set process.argv to simulate command line arguments
  const originalArgv = process.argv;
  const originalExit = process.exit;
  let exitCalled = false;
  let exitCode: number | undefined;
  
  // Mock process.exit to prevent actual exit
  process.exit = ((code?: number) => {
    exitCalled = true;
    exitCode = code;
    if (!expectError) {
      throw new Error(`Process exited with code ${code || 0}`);
    }
  }) as typeof process.exit;
  
  process.argv = ['node', 'cli.js', ...args];
  
  try {
    await program.parseAsync(process.argv);
    if (expectError && !exitCalled) {
      throw new Error('Expected command to fail but it succeeded');
    }
    return consoleOutput.join('\n');
  } catch (error: any) {
    if (expectError) {
      // Return the error message as output for error cases
      return error.message || consoleOutput.join('\n');
    }
    throw error;
  } finally {
    process.argv = originalArgv;
    process.exit = originalExit;
  }
}

describe('CLI Commands', () => {
  describe('key command', () => {
    describe('generate subcommand', () => {
      it('should generate a new secret key with human-readable output', async () => {
        const output = await executeCommand(['key', 'generate']);

        // Check for expected output structure
        expect(output).toMatch(KEY_TEST_VECTORS.patterns.humanReadable.header);
        expect(output).toMatch(KEY_TEST_VECTORS.patterns.humanReadable.separator);
        expect(output).toMatch(KEY_TEST_VECTORS.patterns.humanReadable.secretKeyLabel);
        expect(output).toMatch(KEY_TEST_VECTORS.patterns.humanReadable.warningLabel);

        // Check that a secret key value is present
        expect(output).toMatch(KEY_TEST_VECTORS.patterns.humanReadable.secretKeyValue);

        // Check that security warning is present
        expect(output).toMatch(KEY_TEST_VECTORS.patterns.humanReadable.securityWarning);
      });

      it('should generate a valid secret key', async () => {
        const output = await executeCommand(['key', 'generate']);

        // Extract the secret key from output
        const secretKey = extractSecretKey(output);

        expect(secretKey).not.toBeNull();
        expect(isValidSecretKey(secretKey!)).toBe(true);
        expect(isValidFieldElement(secretKey!)).toBe(true);
      });

      it('should include the expected security warning', async () => {
        const output = await executeCommand(['key', 'generate']);

        // Extract warning from output
        const warning = extractWarning(output);

        expect(warning).not.toBeNull();
        expect(warning).toBe(KEY_TEST_VECTORS.expectedWarning);
      });

      it('should generate different keys on multiple invocations', async () => {
        const output1 = await executeCommand(['key', 'generate']);
        const output2 = await executeCommand(['key', 'generate']);
        const output3 = await executeCommand(['key', 'generate']);

        const key1 = extractSecretKey(output1);
        const key2 = extractSecretKey(output2);
        const key3 = extractSecretKey(output3);

        expect(key1).not.toBeNull();
        expect(key2).not.toBeNull();
        expect(key3).not.toBeNull();

        // All keys should be different (extremely high probability)
        expect(areKeysDifferent(key1!, key2!)).toBe(true);
        expect(areKeysDifferent(key2!, key3!)).toBe(true);
        expect(areKeysDifferent(key1!, key3!)).toBe(true);
      });

      it('should have proper key format with 0x prefix', async () => {
        const output = await executeCommand(['key', 'generate']);
        const secretKey = extractSecretKey(output);

        expect(secretKey).not.toBeNull();
        expect(secretKey!.startsWith('0x')).toBe(true);

        // Check length is within valid range
        const keyWithoutPrefix = secretKey!.slice(2);
        expect(keyWithoutPrefix.length).toBeGreaterThan(KEY_TEST_VECTORS.fieldProperties.minLength);
        expect(keyWithoutPrefix.length).toBeLessThanOrEqual(KEY_TEST_VECTORS.fieldProperties.maxLength);
      });

      it('should contain only valid hexadecimal characters', async () => {
        const output = await executeCommand(['key', 'generate']);
        const secretKey = extractSecretKey(output);

        expect(secretKey).not.toBeNull();

        // Remove 0x prefix and check if all characters are valid hex
        const keyWithoutPrefix = secretKey!.slice(2);
        const isValidHex = /^[0-9a-fA-F]+$/.test(keyWithoutPrefix);

        expect(isValidHex).toBe(true);
      });

      it('should output formatted sections in correct order', async () => {
        const output = await executeCommand(['key', 'generate']);

        // Find positions of key elements
        const headerPos = output.indexOf('Generated Secret Key');
        const separatorPos = output.indexOf('='.repeat(50));
        const secretKeyPos = output.indexOf('Secret Key:');
        const warningPos = output.indexOf('WARNING:');

        // All elements should be present
        expect(headerPos).toBeGreaterThanOrEqual(0);
        expect(separatorPos).toBeGreaterThanOrEqual(0);
        expect(secretKeyPos).toBeGreaterThanOrEqual(0);
        expect(warningPos).toBeGreaterThanOrEqual(0);

        // Elements should appear in correct order
        expect(headerPos).toBeLessThan(separatorPos);
        expect(separatorPos).toBeLessThan(secretKeyPos);
        expect(secretKeyPos).toBeLessThan(warningPos);
      });

      it('should handle empty parameters object', async () => {
        // The generate command doesn't take parameters, but we test it works without any
        const output = await executeCommand(['key', 'generate']);

        // Should still generate valid output
        expect(output).toMatch(KEY_TEST_VECTORS.patterns.humanReadable.header);
        const secretKey = extractSecretKey(output);
        expect(secretKey).not.toBeNull();
        expect(isValidSecretKey(secretKey!)).toBe(true);
      });

      it('should generate keys within valid field element range', async () => {
        // Generate multiple keys and verify all are valid field elements
        const outputs = await Promise.all([
          executeCommand(['key', 'generate']),
          executeCommand(['key', 'generate']),
          executeCommand(['key', 'generate']),
          executeCommand(['key', 'generate']),
          executeCommand(['key', 'generate']),
        ]);

        for (const output of outputs) {
          const secretKey = extractSecretKey(output);
          expect(secretKey).not.toBeNull();
          expect(isValidFieldElement(secretKey!)).toBe(true);
        }
      });

      it('should not include JSON formatting in human-readable output', async () => {
        const output = await executeCommand(['key', 'generate']);

        // Human-readable output should not contain JSON-like braces or quotes around the key
        expect(output).not.toMatch(/"secretKey"/);
        expect(output).not.toMatch(/"warning"/);

        // But should contain the actual labels
        expect(output).toContain('Secret Key:');
        expect(output).toContain('WARNING:');
      });
    });

    describe('derive-keys subcommand', () => {
      const testSecret = '0x0000000000000000000000000000000000000000000000000000000000000001';

      it('should derive keys from a secret key with human-readable output', async () => {
        const output = await executeCommand(['key', 'derive-keys', testSecret]);

        // Check for expected output structure
        expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.header);
        expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.separator);
        expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.secretKeysHeader);

        // Check for all four secret key labels
        expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.masterNullifierSecretKey);
        expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.masterIncomingViewingSecretKey);
        expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.masterOutgoingViewingSecretKey);
        expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.masterTaggingSecretKey);

        // Should NOT include public keys by default
        expect(output).not.toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.publicKeysHeader);
      });

      it('should derive valid secret keys', async () => {
        const output = await executeCommand(['key', 'derive-keys', testSecret]);

        // Extract all secret keys
        const secretKeys = extractDerivedSecretKeys(output);

        expect(secretKeys).not.toBeNull();
        expect(isValidSecretKey(secretKeys!.masterNullifierSecretKey)).toBe(true);
        expect(isValidSecretKey(secretKeys!.masterIncomingViewingSecretKey)).toBe(true);
        expect(isValidSecretKey(secretKeys!.masterOutgoingViewingSecretKey)).toBe(true);
        expect(isValidSecretKey(secretKeys!.masterTaggingSecretKey)).toBe(true);

        expect(isValidFieldElement(secretKeys!.masterNullifierSecretKey)).toBe(true);
        expect(isValidFieldElement(secretKeys!.masterIncomingViewingSecretKey)).toBe(true);
        expect(isValidFieldElement(secretKeys!.masterOutgoingViewingSecretKey)).toBe(true);
        expect(isValidFieldElement(secretKeys!.masterTaggingSecretKey)).toBe(true);
      });

      it('should derive different keys for each key type', async () => {
        const output = await executeCommand(['key', 'derive-keys', testSecret]);
        const secretKeys = extractDerivedSecretKeys(output);

        expect(secretKeys).not.toBeNull();

        // All four keys should be different from each other
        const keys = [
          secretKeys!.masterNullifierSecretKey,
          secretKeys!.masterIncomingViewingSecretKey,
          secretKeys!.masterOutgoingViewingSecretKey,
          secretKeys!.masterTaggingSecretKey,
        ];

        // Check all pairs are different
        for (let i = 0; i < keys.length; i++) {
          for (let j = i + 1; j < keys.length; j++) {
            expect(areKeysDifferent(keys[i], keys[j])).toBe(true);
          }
        }
      });

      it('should produce deterministic results for the same secret', async () => {
        const output1 = await executeCommand(['key', 'derive-keys', testSecret]);
        const output2 = await executeCommand(['key', 'derive-keys', testSecret]);

        const secretKeys1 = extractDerivedSecretKeys(output1);
        const secretKeys2 = extractDerivedSecretKeys(output2);

        expect(secretKeys1).not.toBeNull();
        expect(secretKeys2).not.toBeNull();

        // All keys should be identical
        expect(secretKeys1!.masterNullifierSecretKey).toBe(secretKeys2!.masterNullifierSecretKey);
        expect(secretKeys1!.masterIncomingViewingSecretKey).toBe(secretKeys2!.masterIncomingViewingSecretKey);
        expect(secretKeys1!.masterOutgoingViewingSecretKey).toBe(secretKeys2!.masterOutgoingViewingSecretKey);
        expect(secretKeys1!.masterTaggingSecretKey).toBe(secretKeys2!.masterTaggingSecretKey);
      });

      it('should derive different keys for different secrets', async () => {
        const secret1 = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const secret2 = '0x0000000000000000000000000000000000000000000000000000000000000002';

        const output1 = await executeCommand(['key', 'derive-keys', secret1]);
        const output2 = await executeCommand(['key', 'derive-keys', secret2]);

        const secretKeys1 = extractDerivedSecretKeys(output1);
        const secretKeys2 = extractDerivedSecretKeys(output2);

        expect(secretKeys1).not.toBeNull();
        expect(secretKeys2).not.toBeNull();

        // All corresponding keys should be different
        expect(areKeysDifferent(secretKeys1!.masterNullifierSecretKey, secretKeys2!.masterNullifierSecretKey)).toBe(true);
        expect(areKeysDifferent(secretKeys1!.masterIncomingViewingSecretKey, secretKeys2!.masterIncomingViewingSecretKey)).toBe(true);
        expect(areKeysDifferent(secretKeys1!.masterOutgoingViewingSecretKey, secretKeys2!.masterOutgoingViewingSecretKey)).toBe(true);
        expect(areKeysDifferent(secretKeys1!.masterTaggingSecretKey, secretKeys2!.masterTaggingSecretKey)).toBe(true);
      });

      it('should output formatted sections in correct order', async () => {
        const output = await executeCommand(['key', 'derive-keys', testSecret]);

        // Find positions of key elements
        const headerPos = output.indexOf('Derived Keys');
        const separatorPos = output.indexOf('='.repeat(50));
        const secretKeysHeaderPos = output.indexOf('Secret Keys:');
        const nullifierPos = output.indexOf('Master Nullifier Secret Key:');
        const incomingPos = output.indexOf('Master Incoming Viewing Secret Key:');
        const outgoingPos = output.indexOf('Master Outgoing Viewing Secret Key:');
        const taggingPos = output.indexOf('Master Tagging Secret Key:');

        // All elements should be present
        expect(headerPos).toBeGreaterThanOrEqual(0);
        expect(separatorPos).toBeGreaterThanOrEqual(0);
        expect(secretKeysHeaderPos).toBeGreaterThanOrEqual(0);
        expect(nullifierPos).toBeGreaterThanOrEqual(0);
        expect(incomingPos).toBeGreaterThanOrEqual(0);
        expect(outgoingPos).toBeGreaterThanOrEqual(0);
        expect(taggingPos).toBeGreaterThanOrEqual(0);

        // Elements should appear in correct order
        expect(headerPos).toBeLessThan(separatorPos);
        expect(separatorPos).toBeLessThan(secretKeysHeaderPos);
        expect(secretKeysHeaderPos).toBeLessThan(nullifierPos);
        expect(nullifierPos).toBeLessThan(incomingPos);
        expect(incomingPos).toBeLessThan(outgoingPos);
        expect(outgoingPos).toBeLessThan(taggingPos);
      });

      it('should handle various test secret inputs', async () => {
        // Test multiple secret key formats
        for (const testCase of DERIVE_KEYS_TEST_VECTORS.testSecrets) {
          const output = await executeCommand(['key', 'derive-keys', testCase.secret]);
          const secretKeys = extractDerivedSecretKeys(output);

          expect(secretKeys).not.toBeNull();
          expect(isValidSecretKey(secretKeys!.masterNullifierSecretKey)).toBe(true);
          expect(isValidSecretKey(secretKeys!.masterIncomingViewingSecretKey)).toBe(true);
          expect(isValidSecretKey(secretKeys!.masterOutgoingViewingSecretKey)).toBe(true);
          expect(isValidSecretKey(secretKeys!.masterTaggingSecretKey)).toBe(true);
        }
      });

      it('should not include JSON formatting in human-readable output', async () => {
        const output = await executeCommand(['key', 'derive-keys', testSecret]);

        // Human-readable output should not contain JSON-like formatting
        expect(output).not.toMatch(/"secretKeys"/);
        expect(output).not.toMatch(/"publicKeys"/);
        expect(output).not.toMatch(/"masterNullifierSecretKey"/);

        // But should contain the actual labels
        expect(output).toContain('Secret Keys:');
        expect(output).toContain('Master Nullifier Secret Key:');
      });

      // Tests with --public flag
      describe('with --public flag', () => {
        it('should include public keys when --public flag is used', async () => {
          const output = await executeCommand(['key', 'derive-keys', testSecret, '--public']);

          // Should include both secret and public keys
          expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.secretKeysHeader);
          expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.publicKeysHeader);

          // Check for all public key labels
          expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.masterNullifierPublicKey);
          expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.masterIncomingViewingPublicKey);
          expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.masterOutgoingViewingPublicKey);
          expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.masterTaggingPublicKey);
        });

        it('should derive valid public keys', async () => {
          const output = await executeCommand(['key', 'derive-keys', testSecret, '--public']);

          // Extract public keys
          const publicKeys = extractDerivedPublicKeys(output);

          expect(publicKeys).not.toBeNull();
          expect(publicKeys!.masterNullifierPublicKey.startsWith('0x')).toBe(true);
          expect(publicKeys!.masterIncomingViewingPublicKey.startsWith('0x')).toBe(true);
          expect(publicKeys!.masterOutgoingViewingPublicKey.startsWith('0x')).toBe(true);
          expect(publicKeys!.masterTaggingPublicKey.startsWith('0x')).toBe(true);

          // Check they're valid hex strings
          expect(/^0x[0-9a-f]+$/i.test(publicKeys!.masterNullifierPublicKey)).toBe(true);
          expect(/^0x[0-9a-f]+$/i.test(publicKeys!.masterIncomingViewingPublicKey)).toBe(true);
          expect(/^0x[0-9a-f]+$/i.test(publicKeys!.masterOutgoingViewingPublicKey)).toBe(true);
          expect(/^0x[0-9a-f]+$/i.test(publicKeys!.masterTaggingPublicKey)).toBe(true);
        });

        it('should derive different public keys for each key type', async () => {
          const output = await executeCommand(['key', 'derive-keys', testSecret, '--public']);
          const publicKeys = extractDerivedPublicKeys(output);

          expect(publicKeys).not.toBeNull();

          // All four public keys should be different from each other
          const keys = [
            publicKeys!.masterNullifierPublicKey,
            publicKeys!.masterIncomingViewingPublicKey,
            publicKeys!.masterOutgoingViewingPublicKey,
            publicKeys!.masterTaggingPublicKey,
          ];

          // Check all pairs are different
          for (let i = 0; i < keys.length; i++) {
            for (let j = i + 1; j < keys.length; j++) {
              expect(areKeysDifferent(keys[i], keys[j])).toBe(true);
            }
          }
        });

        it('should produce deterministic public keys for the same secret', async () => {
          const output1 = await executeCommand(['key', 'derive-keys', testSecret, '--public']);
          const output2 = await executeCommand(['key', 'derive-keys', testSecret, '--public']);

          const publicKeys1 = extractDerivedPublicKeys(output1);
          const publicKeys2 = extractDerivedPublicKeys(output2);

          expect(publicKeys1).not.toBeNull();
          expect(publicKeys2).not.toBeNull();

          // All public keys should be identical
          expect(publicKeys1!.masterNullifierPublicKey).toBe(publicKeys2!.masterNullifierPublicKey);
          expect(publicKeys1!.masterIncomingViewingPublicKey).toBe(publicKeys2!.masterIncomingViewingPublicKey);
          expect(publicKeys1!.masterOutgoingViewingPublicKey).toBe(publicKeys2!.masterOutgoingViewingPublicKey);
          expect(publicKeys1!.masterTaggingPublicKey).toBe(publicKeys2!.masterTaggingPublicKey);
        });

        it('should show public keys after secret keys in output order', async () => {
          const output = await executeCommand(['key', 'derive-keys', testSecret, '--public']);

          const secretKeysHeaderPos = output.indexOf('Secret Keys:');
          const publicKeysHeaderPos = output.indexOf('Public Keys:');

          expect(secretKeysHeaderPos).toBeGreaterThan(0);
          expect(publicKeysHeaderPos).toBeGreaterThan(0);
          expect(secretKeysHeaderPos).toBeLessThan(publicKeysHeaderPos);
        });
      });
    });
  });
});
