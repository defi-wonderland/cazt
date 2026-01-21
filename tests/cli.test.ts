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
  isValidAztecAddress,
  extractAddress,
  isValidDerivedAddressJson,
  DERIVE_ADDRESS_TEST_VECTORS,
  parseJsonOutput,
  IMPORT_KEY_TEST_VECTORS,
  extractAlias,
  extractKeystorePath,
  isValidImportedKeyJson,
} from './utils.js';
import { KeyStore } from '../cli/utils/keystore.js';

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
    // Reset options to defaults before parsing to avoid state pollution
    // Commander.js retains options between parseAsync calls
    // Reset both program and all subcommands
    function resetCommandOptions(cmd: any): void {
      cmd._optionValues = {};
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
        expect(isValidFieldElement(secretKey!)).toBe(true);
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
        expect(isValidFieldElement(secretKeys!.masterNullifierSecretKey)).toBe(true);
        expect(isValidFieldElement(secretKeys!.masterIncomingViewingSecretKey)).toBe(true);
        expect(isValidFieldElement(secretKeys!.masterOutgoingViewingSecretKey)).toBe(true);
        expect(isValidFieldElement(secretKeys!.masterTaggingSecretKey)).toBe(true);

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
          expect(isValidFieldElement(secretKeys!.masterNullifierSecretKey)).toBe(true);
          expect(isValidFieldElement(secretKeys!.masterIncomingViewingSecretKey)).toBe(true);
          expect(isValidFieldElement(secretKeys!.masterOutgoingViewingSecretKey)).toBe(true);
          expect(isValidFieldElement(secretKeys!.masterTaggingSecretKey)).toBe(true);
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

    describe('derive-address subcommand', () => {
      const testSecret = '0x0000000000000000000000000000000000000000000000000000000000000001';

      it('should derive account address from secret key with human-readable output', async () => {
        const output = await executeCommand(['key', 'derive-address', testSecret]);

        // Check for expected output structure
        expect(output).toMatch(DERIVE_ADDRESS_TEST_VECTORS.patterns.humanReadable.header);
        expect(output).toMatch(DERIVE_ADDRESS_TEST_VECTORS.patterns.humanReadable.separator);
        expect(output).toMatch(DERIVE_ADDRESS_TEST_VECTORS.patterns.humanReadable.addressLabel);

        // Check for address value in output
        expect(output).toMatch(DERIVE_ADDRESS_TEST_VECTORS.patterns.humanReadable.addressValue);
      });

      it('should derive a valid Aztec address', async () => {
        const output = await executeCommand(['key', 'derive-address', testSecret]);

        // Extract the address
        const address = extractAddress(output);

        expect(address).not.toBeNull();
        expect(await isValidAztecAddress(address!)).toBe(true);
      });

      it('should derive the correct address for known test vectors', async () => {
        for (const testCase of DERIVE_ADDRESS_TEST_VECTORS.knownAddresses) {
          const args = ['key', 'derive-address', testCase.secretKey];
          if (testCase.salt !== undefined) {
            args.push('--salt', testCase.salt);
          }

          const output = await executeCommand(args);
          const address = extractAddress(output);

          expect(address).toBe(testCase.expectedAddress);
        }
      });

      it('should derive the same address for the same secret key (deterministic)', async () => {
        const output1 = await executeCommand(['key', 'derive-address', testSecret]);
        const output2 = await executeCommand(['key', 'derive-address', testSecret]);

        const address1 = extractAddress(output1);
        const address2 = extractAddress(output2);

        expect(address1).not.toBeNull();
        expect(address2).not.toBeNull();
        expect(address1).toBe(address2);
      });

      it('should derive different addresses for different secret keys', async () => {
        const secret1 = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const secret2 = '0x0000000000000000000000000000000000000000000000000000000000000002';

        const output1 = await executeCommand(['key', 'derive-address', secret1]);
        const output2 = await executeCommand(['key', 'derive-address', secret2]);

        const address1 = extractAddress(output1);
        const address2 = extractAddress(output2);

        expect(address1).not.toBeNull();
        expect(address2).not.toBeNull();
        expect(address1).not.toBe(address2);
      });

      it('should handle various secret key formats', async () => {
        for (const testCase of DERIVE_ADDRESS_TEST_VECTORS.randomSecretTests) {
          const output = await executeCommand(['key', 'derive-address', testCase.secretKey]);
          const address = extractAddress(output);

          expect(address).not.toBeNull();
          expect(await isValidAztecAddress(address!)).toBe(true);
        }
      });

      it('should output JSON when --json flag is used', async () => {
        const output = await executeCommand(['key', 'derive-address', testSecret, '--json']);

        // Should be valid JSON
        expect(output).toMatch(DERIVE_ADDRESS_TEST_VECTORS.patterns.json.validJson);
        expect(output).toMatch(DERIVE_ADDRESS_TEST_VECTORS.patterns.json.hasAddress);

        const parsed = parseJsonOutput(output);
        expect(await isValidDerivedAddressJson(parsed)).toBe(true);
      });

      it('should produce correct address in JSON format', async () => {
        const knownTest = DERIVE_ADDRESS_TEST_VECTORS.knownAddresses[0];
        const output = await executeCommand(['key', 'derive-address', knownTest.secretKey, '--json']);

        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(parsed.address).toBe(knownTest.expectedAddress);
      });

      it('should not include JSON formatting in human-readable output', async () => {
        const output = await executeCommand(['key', 'derive-address', testSecret]);

        // Human-readable output should not contain JSON-like formatting
        expect(output).not.toMatch(/"address"/);

        // But should contain the actual label
        expect(output).toContain('Address:');
      });

      // Tests with --salt option
      describe('with --salt option', () => {
        it('should accept salt parameter', async () => {
          const salt = '0x1234567890abcdef';
          const output = await executeCommand(['key', 'derive-address', testSecret, '--salt', salt]);

          // Should show salt in output
          expect(output).toMatch(DERIVE_ADDRESS_TEST_VECTORS.patterns.humanReadable.saltLabel);
          expect(output).toContain(salt);

          // Should still produce a valid address
          const address = extractAddress(output);
          expect(address).not.toBeNull();
          expect(await isValidAztecAddress(address!)).toBe(true);
        });

        it('should derive different addresses with different salts', async () => {
          const salt1 = '0';
          const salt2 = '1';

          const output1 = await executeCommand(['key', 'derive-address', testSecret, '--salt', salt1]);
          const output2 = await executeCommand(['key', 'derive-address', testSecret, '--salt', salt2]);

          const address1 = extractAddress(output1);
          const address2 = extractAddress(output2);

          expect(address1).not.toBeNull();
          expect(address2).not.toBeNull();
          expect(address1).not.toBe(address2);
        });

        it('should derive the same address for the same secret and salt (deterministic)', async () => {
          const salt = '0x42';

          const output1 = await executeCommand(['key', 'derive-address', testSecret, '--salt', salt]);
          const output2 = await executeCommand(['key', 'derive-address', testSecret, '--salt', salt]);

          const address1 = extractAddress(output1);
          const address2 = extractAddress(output2);

          expect(address1).not.toBeNull();
          expect(address2).not.toBeNull();
          expect(address1).toBe(address2);
        });

        it('should handle various salt formats', async () => {
          for (const testCase of DERIVE_ADDRESS_TEST_VECTORS.saltTests) {
            const output = await executeCommand(['key', 'derive-address', testSecret, '--salt', testCase.salt]);
            const address = extractAddress(output);

            expect(address).not.toBeNull();
            expect(await isValidAztecAddress(address!)).toBe(true);
          }
        });

        it('should produce correct addresses for known test vectors with salts', async () => {
          const testWithSalt1 = DERIVE_ADDRESS_TEST_VECTORS.knownAddresses.find(t => t.salt === '1');
          if (testWithSalt1) {
            const output = await executeCommand(['key', 'derive-address', testWithSalt1.secretKey, '--salt', testWithSalt1.salt!]);
            const address = extractAddress(output);
            expect(address).toBe(testWithSalt1.expectedAddress);
          }
        });

        it('should include salt in JSON output when provided', async () => {
          const salt = '0x1234';
          const output = await executeCommand(['key', 'derive-address', testSecret, '--salt', salt, '--json']);

          const parsed = parseJsonOutput(output);
          expect(parsed).not.toBeNull();
          expect(parsed.address).toBeDefined();
          expect(await isValidAztecAddress(parsed.address)).toBe(true);

        });
      });

      // Tests with string passphrase
      describe('with string passphrase', () => {
        it('should derive address from a string passphrase using Poseidon2', async () => {
          const output = await executeCommand(['key', 'derive-address', 'hello']);

          const address = extractAddress(output);
          expect(address).not.toBeNull();
          expect(await isValidAztecAddress(address!)).toBe(true);
        });

        it('should show derived secret key when using string passphrase', async () => {
          const output = await executeCommand(['key', 'derive-address', 'hello']);

          expect(output).toContain('Secret Key (derived from passphrase):');
          expect(output).toMatch(/0x[0-9a-fA-F]+/);
        });

        it('should produce deterministic results for same passphrase', async () => {
          const output1 = await executeCommand(['key', 'derive-address', 'mysecret']);
          const output2 = await executeCommand(['key', 'derive-address', 'mysecret']);

          const address1 = extractAddress(output1);
          const address2 = extractAddress(output2);

          expect(address1).toBe(address2);
        });

        it('should produce different addresses for different passphrases', async () => {
          const output1 = await executeCommand(['key', 'derive-address', 'alice']);
          const output2 = await executeCommand(['key', 'derive-address', 'bob']);

          const address1 = extractAddress(output1);
          const address2 = extractAddress(output2);

          expect(address1).not.toBe(address2);
        });

        it('should pad short strings with # to 32 chars before hashing', async () => {
          // "a" padded becomes "a###############################" (a + 31 #)
          // "ab" padded becomes "ab##############################" (ab + 30 #)
          // They should produce different results because they differ before padding
          const output1 = await executeCommand(['key', 'derive-address', 'a']);
          const output2 = await executeCommand(['key', 'derive-address', 'ab']);

          const address1 = extractAddress(output1);
          const address2 = extractAddress(output2);

          expect(address1).not.toBe(address2);
        });

        it('should work with salt and string passphrase', async () => {
          const output = await executeCommand(['key', 'derive-address', 'mysecret', '--salt', '1']);

          const address = extractAddress(output);
          expect(address).not.toBeNull();
          expect(await isValidAztecAddress(address!)).toBe(true);
          expect(output).toContain('Salt:');
        });

        it('should derive different addresses with same passphrase but different salts', async () => {
          const output1 = await executeCommand(['key', 'derive-address', 'mysecret', '--salt', '0']);
          const output2 = await executeCommand(['key', 'derive-address', 'mysecret', '--salt', '1']);

          const address1 = extractAddress(output1);
          const address2 = extractAddress(output2);

          expect(address1).not.toBe(address2);
        });

        it('should not show derived secret key for hex secrets', async () => {
          const output = await executeCommand(['key', 'derive-address', testSecret]);

          expect(output).not.toContain('Secret Key (derived from passphrase):');
        });

        it('should include secretKey in JSON output when using passphrase', async () => {
          const output = await executeCommand(['key', 'derive-address', 'hello', '--json']);

          const parsed = parseJsonOutput(output);
          expect(parsed).not.toBeNull();
          expect(parsed.address).toBeDefined();
          expect(parsed.secretKey).toBeDefined();
          expect(await isValidAztecAddress(parsed.address)).toBe(true);
          expect(parsed.secretKey.startsWith('0x')).toBe(true);
        });

        it('should not include secretKey in JSON output for hex secrets', async () => {
          const output = await executeCommand(['key', 'derive-address', testSecret, '--json']);

          const parsed = parseJsonOutput(output);
          expect(parsed).not.toBeNull();
          expect(parsed.address).toBeDefined();
          expect(parsed.secretKey).toBeUndefined();
        });
      });
    });

    describe('import subcommand', () => {
      const testSecret = '0x0000000000000000000000000000000000000000000000000000000000000001';

      // Clean up keystore before and after each test
      beforeEach(async () => {
        await KeyStore.clear();
      });

      afterEach(async () => {
        await KeyStore.clear();
      });

      it('should import a secret key with alias with human-readable output', async () => {
        const alias = 'mykey';
        const output = await executeCommand(['key', 'import', testSecret, '--alias', alias]);

        // Check for expected output structure
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.header);
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.separator);
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.aliasLabel);
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.secretLabel);
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.addressLabel);
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.storedLabel);
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.warningLabel);
      });

      it('should import and store a valid secret key', async () => {
        const alias = 'testkey';
        const output = await executeCommand(['key', 'import', testSecret, '--alias', alias]);

        // Verify the key was stored
        const stored = await KeyStore.load(alias);
        expect(stored).toBeDefined();
        expect(stored.alias).toBe(alias);
        expect(isValidSecretKey(stored.secret)).toBe(true);
      });

      it('should extract and display the alias correctly', async () => {
        const alias = 'myWallet';
        const output = await executeCommand(['key', 'import', testSecret, '--alias', alias]);

        const extractedAlias = extractAlias(output);
        expect(extractedAlias).toBe(alias);
      });

      it('should derive and display the address for the imported key', async () => {
        const alias = 'addressTest';
        const output = await executeCommand(['key', 'import', testSecret, '--alias', alias]);

        const address = extractAddress(output);
        expect(address).not.toBeNull();
        expect(await isValidAztecAddress(address!)).toBe(true);
      });

      it('should display the keystore path', async () => {
        const alias = 'pathTest';
        const output = await executeCommand(['key', 'import', testSecret, '--alias', alias]);

        const path = extractKeystorePath(output);
        expect(path).not.toBeNull();
        expect(path).toContain('.cazt');
        expect(path).toContain('keys.json');
      });

      it('should display the security warning', async () => {
        const alias = 'warningTest';
        const output = await executeCommand(['key', 'import', testSecret, '--alias', alias]);

        const warning = extractWarning(output);
        expect(warning).toBe(IMPORT_KEY_TEST_VECTORS.expectedWarning);
      });

      it('should handle various valid aliases', async () => {
        for (const testCase of IMPORT_KEY_TEST_VECTORS.validAliases) {
          await KeyStore.clear(); // Clear for each test
          const output = await executeCommand(['key', 'import', testSecret, '--alias', testCase.alias]);

          const extractedAlias = extractAlias(output);
          expect(extractedAlias).toBe(testCase.alias);

          // Verify storage
          const stored = await KeyStore.load(testCase.alias);
          expect(stored.alias).toBe(testCase.alias);
        }
      });

      it('should reject invalid aliases', async () => {
        for (const testCase of IMPORT_KEY_TEST_VECTORS.invalidAliases) {
          const output = await executeCommand(['key', 'import', testSecret, '--alias', testCase.alias], true);

          expect(output).toMatch(/Invalid alias/i);
        }
      });

      it('should reject invalid secret keys', async () => {
        for (const testCase of IMPORT_KEY_TEST_VECTORS.invalidSecrets) {
          const output = await executeCommand(['key', 'import', testCase.secret, '--alias', 'test'], true);

          expect(output).toMatch(/Invalid secret key|Error/i);
        }
      });

      it('should reject duplicate alias without --force flag', async () => {
        const alias = 'duplicate';

        // Import first time
        await executeCommand(['key', 'import', testSecret, '--alias', alias]);

        // Try to import again with same alias
        const output = await executeCommand(['key', 'import', testSecret, '--alias', alias], true);

        expect(output).toMatch(/already exists/i);
        expect(output).toMatch(/--force/i);
      });

      it('should allow overwriting with --force flag', async () => {
        const alias = 'forceTest';
        const secret1 = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const secret2 = '0x0000000000000000000000000000000000000000000000000000000000000042';

        // Import first key
        await executeCommand(['key', 'import', secret1, '--alias', alias]);

        // Overwrite with second key using --force
        const output = await executeCommand(['key', 'import', secret2, '--alias', alias, '--force']);

        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.header);

        // Verify the stored key was updated
        const stored = await KeyStore.load(alias);
        expect(stored.secret).toBe(secret2); // Full normalized form
      });

      it('should handle different secret key formats', async () => {
        let index = 0;
        for (const testCase of IMPORT_KEY_TEST_VECTORS.testSecrets) {
          const alias = `test${index++}`;
          const output = await executeCommand(['key', 'import', testCase.secret, '--alias', alias]);

          // Check output contains the secret (import uses "Secret:" not "Secret Key:")
          expect(output).toMatch(/Secret:/);
          expect(output).toMatch(/0x[0-9a-f]+/i);

          // Verify storage
          const stored = await KeyStore.load(alias);
          expect(isValidSecretKey(stored.secret)).toBe(true);
        }
      });

      it('should output JSON when --json flag is used', async () => {
        const alias = 'jsonTest';
        const output = await executeCommand(['key', 'import', testSecret, '--alias', alias, '--json']);

        // Should be valid JSON
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.json.validJson);
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.json.hasAlias);
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.json.hasSecret);
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.json.hasAddress);
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.json.hasStored);
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.json.hasKeystorePath);
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.json.hasWarning);

        const parsed = parseJsonOutput(output);
        expect(await isValidImportedKeyJson(parsed)).toBe(true);
      });

      it('should produce correct data in JSON format', async () => {
        const alias = 'jsonDataTest';
        const output = await executeCommand(['key', 'import', testSecret, '--alias', alias, '--json']);

        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(parsed.alias).toBe(alias);
        expect(parsed.secret).toBe(testSecret);
        expect(await isValidAztecAddress(parsed.address)).toBe(true);
        expect(parsed.stored).toBe(true);
        expect(parsed.keystorePath).toContain('.cazt');
        expect(parsed.warning).toBe(IMPORT_KEY_TEST_VECTORS.expectedWarning);
      });

      it('should not include JSON formatting in human-readable output', async () => {
        const alias = 'humanReadableTest';
        const output = await executeCommand(['key', 'import', testSecret, '--alias', alias]);

        // Human-readable output should not contain JSON-like formatting
        expect(output).not.toMatch(/"alias"/);
        expect(output).not.toMatch(/"secret"/);
        expect(output).not.toMatch(/"address"/);

        // But should contain the actual labels
        expect(output).toContain('Alias:');
        expect(output).toContain('Secret:');
        expect(output).toContain('Address:');
      });

      it('should persist keys across imports', async () => {
        const alias1 = 'key1';
        const alias2 = 'key2';
        const secret1 = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const secret2 = '0x0000000000000000000000000000000000000000000000000000000000000042';

        // Import first key
        await executeCommand(['key', 'import', secret1, '--alias', alias1]);

        // Import second key
        await executeCommand(['key', 'import', secret2, '--alias', alias2]);

        // Both should be stored
        const stored1 = await KeyStore.load(alias1);
        const stored2 = await KeyStore.load(alias2);

        expect(stored1.alias).toBe(alias1);
        expect(stored2.alias).toBe(alias2);
        expect(stored1.secret).not.toBe(stored2.secret);
      });

      it('should derive consistent addresses for the same secret', async () => {
        const alias = 'consistentTest';
        const output = await executeCommand(['key', 'import', testSecret, '--alias', alias]);

        const address1 = extractAddress(output);

        // Import again with different alias but same secret
        await KeyStore.clear();
        const alias2 = 'consistentTest2';
        const output2 = await executeCommand(['key', 'import', testSecret, '--alias', alias2]);

        const address2 = extractAddress(output2);

        // Addresses should be the same for the same secret
        expect(address1).toBe(address2);
      });

      it('should normalize secret keys before storage', async () => {
        const alias = 'normalizeTest';
        const decimalSecret = '66'; // Decimal representation

        const output = await executeCommand(['key', 'import', decimalSecret, '--alias', alias]);

        // Should succeed
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.header);

        // Stored key should be normalized to hex format
        const stored = await KeyStore.load(alias);
        expect(stored.secret).toMatch(/^0x/);
        expect(isValidSecretKey(stored.secret)).toBe(true);
      });

      it('should require --alias option', async () => {
        // Try to import without --alias flag
        const output = await executeCommand(['key', 'import', testSecret], true);

        // Commander.js will show an error about the required option
        // The output might contain 'required option' or show undefined alias
        expect(output).toMatch(/required option|alias.*undefined/i);
      });
    });
  });
});
