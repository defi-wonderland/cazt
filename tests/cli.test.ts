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
  EXPORT_KEY_TEST_VECTORS,
  isValidExportedKeyJson,
  isValidSchnorrSignature,
  isValidPublicKey,
  extractSignature,
  extractPublicKey,
  extractMessage,
  isValidSignedMessageJson,
  SIGN_MESSAGE_TEST_VECTORS,
  extractValid,
  isValidVerifiedSignatureJson,
  VERIFY_SIGNATURE_TEST_VECTORS,
  ENCRYPTED_KEYSTORE_TEST_VECTORS,
  isValidUuidV4,
  extractKeystoreUuid,
  extractKeystoreFile,
  extractKeystoreCipher,
  extractKeystoreKdf,
  extractUnlockedSecret,
  isValidKeystoreCreateJson,
  isValidKeystoreUnlockJson,
  isValidKeystoreInspectJson,
  isValidKeystoreFile,
} from './utils.js';
import { KeyStore } from '../cli/utils/keystore.js';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

// Use a test-specific keystore to avoid touching user's real keys
const TEST_KEYSTORE_DIR = path.join(os.tmpdir(), '.cazt');
const TEST_KEYSTORE_FILE = 'keys_test.json';

// Configure test keystore before all tests
beforeAll(async () => {
  KeyStore.setCustomPath(TEST_KEYSTORE_DIR, TEST_KEYSTORE_FILE);
  // Ensure clean test directory
  try {
    await fs.rm(TEST_KEYSTORE_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }
});

// Clean up after all tests
afterAll(async () => {
  try {
    await fs.rm(TEST_KEYSTORE_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
  KeyStore.resetPath();
});

// Enable test mode to use separate keystore (~/.cazt/keys_test.json)
// This prevents tests from accidentally wiping real keys
process.env.NODE_ENV = 'test';

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

      describe('with --alias option', () => {
        const testAlias = 'deriveKeysAliasTest';

        beforeEach(async () => {
          await KeyStore.clear();
        });

        afterEach(async () => {
          await KeyStore.clear();
        });

        it('should derive keys using secret from keystore alias', async () => {
          // First import a key
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);

          // Then derive keys using the alias
          const output = await executeCommand(['key', 'derive-keys', '--alias', testAlias]);

          expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.header);
          const secretKeys = extractDerivedSecretKeys(output);
          expect(secretKeys).not.toBeNull();
          expect(isValidSecretKey(secretKeys!.masterNullifierSecretKey)).toBe(true);
        });

        it('should produce same keys as direct secret input', async () => {
          // Import the key
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);

          // Derive using direct secret
          const directOutput = await executeCommand(['key', 'derive-keys', testSecret]);
          const directKeys = extractDerivedSecretKeys(directOutput);

          // Derive using alias
          const aliasOutput = await executeCommand(['key', 'derive-keys', '--alias', testAlias]);
          const aliasKeys = extractDerivedSecretKeys(aliasOutput);

          expect(directKeys!.masterNullifierSecretKey).toBe(aliasKeys!.masterNullifierSecretKey);
          expect(directKeys!.masterIncomingViewingSecretKey).toBe(aliasKeys!.masterIncomingViewingSecretKey);
        });

        it('should fail when alias does not exist', async () => {
          const output = await executeCommand(['key', 'derive-keys', '--alias', 'nonexistent'], true);

          expect(output).toContain('not found');
        });

        it('should fail when both secret and alias are provided', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);

          const output = await executeCommand(['key', 'derive-keys', testSecret, '--alias', testAlias], true);

          expect(output).toContain('Cannot specify both');
        });

        it('should fail when neither secret nor alias are provided', async () => {
          const output = await executeCommand(['key', 'derive-keys'], true);

          expect(output).toContain('Must specify either');
        });

        it('should work with --public flag and alias', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);

          const output = await executeCommand(['key', 'derive-keys', '--alias', testAlias, '--public']);

          expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.publicKeysHeader);
          const publicKeys = extractDerivedPublicKeys(output);
          expect(publicKeys).not.toBeNull();
        });
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
        expect(isValidAztecAddress(address!)).toBe(true);
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
          expect(isValidAztecAddress(address!)).toBe(true);
        }
      });

      it('should output JSON when --json flag is used', async () => {
        const output = await executeCommand(['key', 'derive-address', testSecret, '--json']);

        // Should be valid JSON
        expect(output).toMatch(DERIVE_ADDRESS_TEST_VECTORS.patterns.json.validJson);
        expect(output).toMatch(DERIVE_ADDRESS_TEST_VECTORS.patterns.json.hasAddress);

        const parsed = parseJsonOutput(output);
        expect(isValidDerivedAddressJson(parsed)).toBe(true);
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
          expect(isValidAztecAddress(address!)).toBe(true);
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
            expect(isValidAztecAddress(address!)).toBe(true);
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
          expect(isValidAztecAddress(parsed.address)).toBe(true);
    });
  });

      // Tests with string passphrase
      describe('with string passphrase', () => {
        it('should derive address from a string passphrase using Poseidon2', async () => {
          const output = await executeCommand(['key', 'derive-address', 'hello']);

          const address = extractAddress(output);
          expect(address).not.toBeNull();
          expect(isValidAztecAddress(address!)).toBe(true);
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
          expect(isValidAztecAddress(address!)).toBe(true);
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
          expect(isValidAztecAddress(parsed.address)).toBe(true);
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

      describe('with --alias option', () => {
        const testAlias = 'deriveAddressAliasTest';

        beforeEach(async () => {
          await KeyStore.clear();
        });

        afterEach(async () => {
          await KeyStore.clear();
        });

        it('should derive address using secret from keystore alias', async () => {
          // First import a key
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);

          // Then derive address using the alias
          const output = await executeCommand(['key', 'derive-address', '--alias', testAlias]);

          expect(output).toMatch(DERIVE_ADDRESS_TEST_VECTORS.patterns.humanReadable.header);
          const address = extractAddress(output);
          expect(address).not.toBeNull();
          expect(isValidAztecAddress(address!)).toBe(true);
        });

        it('should produce same address as direct secret input', async () => {
          // Import the key
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);

          // Derive using direct secret
          const directOutput = await executeCommand(['key', 'derive-address', testSecret]);
          const directAddress = extractAddress(directOutput);

          // Derive using alias
          const aliasOutput = await executeCommand(['key', 'derive-address', '--alias', testAlias]);
          const aliasAddress = extractAddress(aliasOutput);

          expect(directAddress).toBe(aliasAddress);
        });

        it('should fail when alias does not exist', async () => {
          const output = await executeCommand(['key', 'derive-address', '--alias', 'nonexistent'], true);

          expect(output).toContain('not found');
        });

        it('should fail when both secret and alias are provided', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);

          const output = await executeCommand(['key', 'derive-address', testSecret, '--alias', testAlias], true);

          expect(output).toContain('Cannot specify both');
        });

        it('should fail when neither secret nor alias are provided', async () => {
          const output = await executeCommand(['key', 'derive-address'], true);

          expect(output).toContain('Must specify either');
        });

        it('should work with --salt flag and alias', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);

          const output = await executeCommand(['key', 'derive-address', '--alias', testAlias, '--salt', '42']);

          const address = extractAddress(output);
          expect(address).not.toBeNull();
          expect(isValidAztecAddress(address!)).toBe(true);
          expect(output).toContain('Salt:');
        });

        it('should derive different addresses with same alias but different salts', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);

          const output1 = await executeCommand(['key', 'derive-address', '--alias', testAlias, '--salt', '0']);
          const output2 = await executeCommand(['key', 'derive-address', '--alias', testAlias, '--salt', '1']);

          const address1 = extractAddress(output1);
          const address2 = extractAddress(output2);

          expect(address1).not.toBe(address2);
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

      it('should display the keystore path', async () => {
        const alias = 'pathTest';
        const output = await executeCommand(['key', 'import', testSecret, '--alias', alias]);

        const keystorePath = extractKeystorePath(output);
        expect(keystorePath).not.toBeNull();
        expect(keystorePath).toContain('.cazt');
        expect(keystorePath).toContain('keys_test.json');
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
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.json.hasStored);
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.json.hasKeystorePath);
        expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.json.hasWarning);

        const parsed = parseJsonOutput(output);
        expect(isValidImportedKeyJson(parsed)).toBe(true);
      });

      it('should produce correct data in JSON format', async () => {
        const alias = 'jsonDataTest';
        const output = await executeCommand(['key', 'import', testSecret, '--alias', alias, '--json']);

        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(parsed.alias).toBe(alias);
        expect(parsed.secret).toBe(testSecret);
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

        // But should contain the actual labels
        expect(output).toContain('Alias:');
        expect(output).toContain('Secret:');
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

    describe('export subcommand', () => {
      const testSecret = '0x0000000000000000000000000000000000000000000000000000000000000001';
      const testAlias = 'exportTest';

      // Clean up keystore before and after each test
      beforeEach(async () => {
        await KeyStore.clear();
      });

      afterEach(async () => {
        await KeyStore.clear();
      });

      it('should export a secret key by alias with human-readable output', async () => {
        // First import a key
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);

        // Then export it
        const output = await executeCommand(['key', 'export', testAlias]);

        // Check for expected output structure
        expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.header);
        expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.separator);
        expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.aliasLabel);
        expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.secretLabel);
        expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.createdLabel);
        expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.updatedLabel);
        expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.warningLabel);
      });

      it('should export the correct secret key', async () => {
        // Import a key
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);

        // Export it
        const output = await executeCommand(['key', 'export', testAlias]);

        // Verify the secret matches
        expect(output).toContain(testSecret);
      });

      it('should display the correct alias', async () => {
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);
        const output = await executeCommand(['key', 'export', testAlias]);

        const extractedAlias = extractAlias(output);
        expect(extractedAlias).toBe(testAlias);
      });

      it('should display creation and update timestamps', async () => {
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);
        const output = await executeCommand(['key', 'export', testAlias]);

        expect(output).toMatch(/Created:/);
        expect(output).toMatch(/Updated:/);
      });

      it('should display the security warning', async () => {
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);
        const output = await executeCommand(['key', 'export', testAlias]);

        const warning = extractWarning(output);
        expect(warning).toBe(EXPORT_KEY_TEST_VECTORS.expectedWarning);
      });

      it('should fail when exporting non-existent alias', async () => {
        const output = await executeCommand(['key', 'export', 'nonExistentAlias'], true);

        expect(output).toMatch(/not found/i);
      });

      it('should export multiple times without changes (idempotent)', async () => {
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);

        const output1 = await executeCommand(['key', 'export', testAlias]);
        const output2 = await executeCommand(['key', 'export', testAlias]);

        // Both exports should contain the same secret
        expect(output1).toContain(testSecret);
        expect(output2).toContain(testSecret);
      });

      it('should export keys with various aliases', async () => {
        const testCases = [
          { alias: 'key1', secret: '0x0000000000000000000000000000000000000000000000000000000000000001' },
          { alias: 'key2', secret: '0x0000000000000000000000000000000000000000000000000000000000000042' },
          { alias: '_private', secret: '0x0000000000000000000000000000000000000000000000000000000000000003' },
        ];

        for (const testCase of testCases) {
          await executeCommand(['key', 'import', testCase.secret, '--alias', testCase.alias]);
          const output = await executeCommand(['key', 'export', testCase.alias]);

          expect(output).toContain(testCase.alias);
          expect(output).toContain(testCase.secret);
        }
      });

      it('should output JSON when --json flag is used', async () => {
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);
        const output = await executeCommand(['key', 'export', testAlias, '--json']);

        // Should be valid JSON
        expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.json.validJson);
        expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.json.hasAlias);
        expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.json.hasSecret);
        expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.json.hasCreatedAt);
        expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.json.hasUpdatedAt);
        expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.json.hasWarning);

        const parsed = parseJsonOutput(output);
        expect(isValidExportedKeyJson(parsed)).toBe(true);
      });

      it('should produce correct data in JSON format', async () => {
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);
        const output = await executeCommand(['key', 'export', testAlias, '--json']);

        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(parsed.alias).toBe(testAlias);
        expect(parsed.secret).toBe(testSecret);
        expect(parsed.createdAt).toBeDefined();
        expect(parsed.updatedAt).toBeDefined();
        expect(parsed.warning).toBe(EXPORT_KEY_TEST_VECTORS.expectedWarning);
      });

      it('should not include JSON formatting in human-readable output', async () => {
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias]);
        const output = await executeCommand(['key', 'export', testAlias]);

        // Human-readable output should not contain JSON-like formatting
        expect(output).not.toMatch(/"alias"/);
        expect(output).not.toMatch(/"secret"/);

        // But should contain the actual labels
        expect(output).toContain('Alias:');
        expect(output).toContain('Secret:');
      });

      it('should show updated timestamps after import with --force', async () => {
        const secret1 = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const secret2 = '0x0000000000000000000000000000000000000000000000000000000000000042';

        // Import first key
        await executeCommand(['key', 'import', secret1, '--alias', testAlias]);
        const output1 = await executeCommand(['key', 'export', testAlias, '--json']);
        const parsed1 = parseJsonOutput(output1);

        // Wait a bit to ensure timestamp difference
        await new Promise(resolve => setTimeout(resolve, 100));

        // Overwrite with second key
        await executeCommand(['key', 'import', secret2, '--alias', testAlias, '--force']);
        const output2 = await executeCommand(['key', 'export', testAlias, '--json']);
        const parsed2 = parseJsonOutput(output2);

        // CreatedAt should be the same, updatedAt should be different
        expect(parsed1.createdAt).toBe(parsed2.createdAt);
        expect(parsed1.updatedAt).not.toBe(parsed2.updatedAt);
        expect(parsed2.secret).toBe(secret2);
      });

      it('should handle empty keystore gracefully', async () => {
        // Don't import anything, just try to export
        const output = await executeCommand(['key', 'export', 'someAlias'], true);

        expect(output).toMatch(/not found/i);
      });
    });

    describe('list subcommand', () => {
      // Clean up keystore before and after each test
      beforeEach(async () => {
        await KeyStore.clear();
      });

      afterEach(async () => {
        await KeyStore.clear();
      });

      it('should list all stored key aliases with human-readable output', async () => {
        // Import some test keys
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'alice',
        ]);
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000042',
          '--alias',
          'bob',
        ]);

        const output = await executeCommand(['key', 'list']);

        // Check for expected output structure
        expect(output).toMatch(/Stored Key Aliases/);
        expect(output).toMatch(/={50}/);
        expect(output).toContain('alice');
        expect(output).toContain('bob');
      });

      it('should show message when no keys are stored', async () => {
        const output = await executeCommand(['key', 'list']);

        expect(output).toMatch(/Stored Key Aliases/);
        expect(output).toMatch(/No keys stored/);
      });

      it('should list keys in alphabetical order', async () => {
        // Import keys in non-alphabetical order
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'zebra',
        ]);
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000002',
          '--alias',
          'alice',
        ]);
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000003',
          '--alias',
          'mary',
        ]);

        const output = await executeCommand(['key', 'list']);

        // Extract positions of aliases in output
        const alicePos = output.indexOf('alice');
        const maryPos = output.indexOf('mary');
        const zebraPos = output.indexOf('zebra');

        // All should be present
        expect(alicePos).toBeGreaterThan(-1);
        expect(maryPos).toBeGreaterThan(-1);
        expect(zebraPos).toBeGreaterThan(-1);

        // Should appear in alphabetical order
        expect(alicePos).toBeLessThan(maryPos);
        expect(maryPos).toBeLessThan(zebraPos);
      });

      it('should work with ls alias', async () => {
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'test',
        ]);

        const output = await executeCommand(['key', 'ls']);

        expect(output).toMatch(/Stored Key Aliases/);
        expect(output).toContain('test');
      });

      it('should not expose secret keys in list output', async () => {
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000042';
        await executeCommand(['key', 'import', secret, '--alias', 'sensitive']);

        const output = await executeCommand(['key', 'list']);

        // Should show alias but not secret
        expect(output).toContain('sensitive');
        expect(output).not.toContain(secret);
      });

      it('should output JSON when --json flag is used', async () => {
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'alice',
        ]);

        const output = await executeCommand(['key', 'list', '--json']);

        // Should be valid JSON
        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(parsed.aliases).toBeDefined();
        expect(Array.isArray(parsed.aliases)).toBe(true);
        expect(parsed.aliases).toContain('alice');
      });

      it('should return empty array in JSON when no keys stored', async () => {
        const output = await executeCommand(['key', 'list', '--json']);

        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(parsed.aliases).toBeDefined();
        expect(Array.isArray(parsed.aliases)).toBe(true);
        expect(parsed.aliases.length).toBe(0);
      });

      it('should list multiple keys correctly in JSON format', async () => {
        const testKeys = [
          { alias: 'alice', secret: '0x0000000000000000000000000000000000000000000000000000000000000001' },
          { alias: 'bob', secret: '0x0000000000000000000000000000000000000000000000000000000000000002' },
          { alias: 'charlie', secret: '0x0000000000000000000000000000000000000000000000000000000000000003' },
        ];

        for (const key of testKeys) {
          await executeCommand(['key', 'import', key.secret, '--alias', key.alias]);
        }

        const output = await executeCommand(['key', 'list', '--json']);
        const parsed = parseJsonOutput(output);

        expect(parsed.aliases).toHaveLength(3);
        expect(parsed.aliases).toContain('alice');
        expect(parsed.aliases).toContain('bob');
        expect(parsed.aliases).toContain('charlie');
      });

      it('should not include JSON formatting in human-readable output', async () => {
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'test',
        ]);

        const output = await executeCommand(['key', 'list']);

        // Human-readable output should not contain JSON-like formatting
        expect(output).not.toMatch(/"aliases"/);
        expect(output).not.toMatch(/\[.*\]/);

        // But should contain the alias itself
        expect(output).toContain('test');
      });

      it('should handle special characters in aliases', async () => {
        const testAliases = ['my-key', 'my_key', 'key123', '_private'];

        for (let i = 0; i < testAliases.length; i++) {
          await executeCommand([
            'key',
            'import',
            `0x000000000000000000000000000000000000000000000000000000000000000${i + 1}`,
            '--alias',
            testAliases[i],
          ]);
        }

        const output = await executeCommand(['key', 'list']);

        for (const alias of testAliases) {
          expect(output).toContain(alias);
        }
      });

      it('should update list after importing new key', async () => {
        // Start with one key
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'first',
        ]);

        let output = await executeCommand(['key', 'list', '--json']);
        let parsed = parseJsonOutput(output);
        expect(parsed.aliases).toHaveLength(1);

        // Add another key
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000002',
          '--alias',
          'second',
        ]);

        output = await executeCommand(['key', 'list', '--json']);
        parsed = parseJsonOutput(output);
        expect(parsed.aliases).toHaveLength(2);
        expect(parsed.aliases).toContain('first');
        expect(parsed.aliases).toContain('second');
      });

      it('should be consistent between multiple invocations', async () => {
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'test1',
        ]);
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000002',
          '--alias',
          'test2',
        ]);

        const output1 = await executeCommand(['key', 'list', '--json']);
        const output2 = await executeCommand(['key', 'list', '--json']);

        const parsed1 = parseJsonOutput(output1);
        const parsed2 = parseJsonOutput(output2);

        expect(parsed1.aliases).toEqual(parsed2.aliases);
      });

      it('should list single key correctly', async () => {
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'single',
        ]);

        const output = await executeCommand(['key', 'list']);

        expect(output).toContain('single');
        expect(output).toMatch(/Stored Key Aliases/);
      });

      it('should handle large number of keys', async () => {
        // Import 10 keys
        for (let i = 0; i < 10; i++) {
          await executeCommand([
            'key',
            'import',
            `0x000000000000000000000000000000000000000000000000000000000000000${i.toString(16)}`,
            '--alias',
            `key${i}`,
          ]);
        }

        const output = await executeCommand(['key', 'list', '--json']);
        const parsed = parseJsonOutput(output);

        expect(parsed.aliases).toHaveLength(10);
        for (let i = 0; i < 10; i++) {
          expect(parsed.aliases).toContain(`key${i}`);
        }
      });
    });

    describe('sign subcommand', () => {
      it('should sign a message with human-readable output', async () => {
        const message = 'hello';
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        const output = await executeCommand(['key', 'sign', message, secret]);

        // Check for expected output structure
        expect(output).toMatch(SIGN_MESSAGE_TEST_VECTORS.patterns.humanReadable.header);
        expect(output).toMatch(SIGN_MESSAGE_TEST_VECTORS.patterns.humanReadable.separator);
        expect(output).toMatch(SIGN_MESSAGE_TEST_VECTORS.patterns.humanReadable.messageLabel);
        expect(output).toMatch(SIGN_MESSAGE_TEST_VECTORS.patterns.humanReadable.signatureLabel);
        expect(output).toMatch(SIGN_MESSAGE_TEST_VECTORS.patterns.humanReadable.publicKeyLabel);

        // Extract and validate components
        const extractedMessage = extractMessage(output);
        const signature = extractSignature(output);
        const publicKey = extractPublicKey(output);

        expect(extractedMessage).toBe(message);
        expect(signature).not.toBeNull();
        expect(publicKey).not.toBeNull();
        expect(isValidSchnorrSignature(signature!)).toBe(true);
        expect(isValidPublicKey(publicKey!)).toBe(true);
      });

      it('should produce valid signatures for same message and key', async () => {
        const message = 'test message';
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000042';

        const output1 = await executeCommand(['key', 'sign', message, secret]);
        const output2 = await executeCommand(['key', 'sign', message, secret]);

        const signature1 = extractSignature(output1);
        const signature2 = extractSignature(output2);
        const publicKey1 = extractPublicKey(output1);
        const publicKey2 = extractPublicKey(output2);

        // Both signatures should be valid
        expect(signature1).not.toBeNull();
        expect(signature2).not.toBeNull();
        expect(isValidSchnorrSignature(signature1!)).toBe(true);
        expect(isValidSchnorrSignature(signature2!)).toBe(true);

        // Same secret should produce same public key
        expect(publicKey1).toBe(publicKey2);

        // Note: Schnorr signatures may use random nonces, so signatures could differ
        // This is normal and doesn't indicate an issue with the implementation
      });

      it('should produce different signatures for different messages', async () => {
        const message1 = 'first message';
        const message2 = 'second message';
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        const output1 = await executeCommand(['key', 'sign', message1, secret]);
        const output2 = await executeCommand(['key', 'sign', message2, secret]);

        const signature1 = extractSignature(output1);
        const signature2 = extractSignature(output2);

        // Different messages should produce different signatures
        expect(signature1).not.toBe(signature2);
      });

      it('should produce different signatures for different keys', async () => {
        const message = 'same message';
        const secret1 = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const secret2 = '0x0000000000000000000000000000000000000000000000000000000000000042';

        const output1 = await executeCommand(['key', 'sign', message, secret1]);
        const output2 = await executeCommand(['key', 'sign', message, secret2]);

        const signature1 = extractSignature(output1);
        const signature2 = extractSignature(output2);
        const publicKey1 = extractPublicKey(output1);
        const publicKey2 = extractPublicKey(output2);

        // Different keys should produce different signatures and public keys
        expect(signature1).not.toBe(signature2);
        expect(publicKey1).not.toBe(publicKey2);
      });

      it('should handle various string messages', async () => {
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        for (const testCase of SIGN_MESSAGE_TEST_VECTORS.testMessages) {
          const output = await executeCommand(['key', 'sign', testCase.message, secret]);

          const extractedMessage = extractMessage(output);
          const signature = extractSignature(output);
          const publicKey = extractPublicKey(output);

          expect(extractedMessage).toBe(testCase.message);
          expect(signature).not.toBeNull();
          expect(publicKey).not.toBeNull();
          expect(isValidSchnorrSignature(signature!)).toBe(true);
          expect(isValidPublicKey(publicKey!)).toBe(true);
        }
      });

      it('should handle hex-encoded byte messages', async () => {
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        for (const testCase of SIGN_MESSAGE_TEST_VECTORS.testHexMessages) {
          const output = await executeCommand(['key', 'sign', testCase.message, secret]);

          const extractedMessage = extractMessage(output);
          const signature = extractSignature(output);
          const publicKey = extractPublicKey(output);

          expect(extractedMessage).toBe(testCase.message);
          expect(signature).not.toBeNull();
          expect(publicKey).not.toBeNull();
          expect(isValidSchnorrSignature(signature!)).toBe(true);
          expect(isValidPublicKey(publicKey!)).toBe(true);
        }
      });

      it('should handle both string and hex-encoded bytes for same content', async () => {
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const stringMessage = 'hello';
        const hexMessage = '0x68656c6c6f'; // "hello" in hex

        const output1 = await executeCommand(['key', 'sign', stringMessage, secret]);
        const output2 = await executeCommand(['key', 'sign', hexMessage, secret]);

        const signature1 = extractSignature(output1);
        const signature2 = extractSignature(output2);
        const publicKey1 = extractPublicKey(output1);
        const publicKey2 = extractPublicKey(output2);

        // Both should be valid signatures
        expect(signature1).not.toBeNull();
        expect(signature2).not.toBeNull();
        expect(isValidSchnorrSignature(signature1!)).toBe(true);
        expect(isValidSchnorrSignature(signature2!)).toBe(true);

        // Same secret should produce same public key
        expect(publicKey1).toBe(publicKey2);

        // Note: Even though the bytes are the same, signatures may differ due to random nonces
      });

      it('should output JSON when --json flag is used', async () => {
        const message = 'test message';
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        const output = await executeCommand(['key', 'sign', message, secret, '--json']);

        // Should be valid JSON
        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(isValidSignedMessageJson(parsed)).toBe(true);

        // Check structure
        expect(parsed.message).toBe(message);
        expect(parsed.signature).toBeDefined();
        expect(parsed.publicKey).toBeDefined();
        expect(isValidSchnorrSignature(parsed.signature)).toBe(true);
        expect(isValidPublicKey(parsed.publicKey)).toBe(true);
      });

      it('should handle different secret key formats', async () => {
        const message = 'test';

        for (const testCase of SIGN_MESSAGE_TEST_VECTORS.testSecrets) {
          const output = await executeCommand(['key', 'sign', message, testCase.secret]);

          const signature = extractSignature(output);
          const publicKey = extractPublicKey(output);

          expect(signature).not.toBeNull();
          expect(publicKey).not.toBeNull();
          expect(isValidSchnorrSignature(signature!)).toBe(true);
          expect(isValidPublicKey(publicKey!)).toBe(true);
        }
      });

      it('should treat non-hex strings as passphrases', async () => {
        const message = 'test';
        const passphrase = 'my-secret-passphrase';

        const output = await executeCommand(['key', 'sign', message, passphrase]);

        // Passphrase should be treated as valid and produce a signature
        const signature = extractSignature(output);
        expect(signature).toBeDefined();
        expect(signature).toMatch(/^0x[0-9a-f]+$/i);

        // Should show the derived secret key
        expect(output).toContain('Secret Key (derived from passphrase)');
      });

      it('should fail with invalid hex message', async () => {
        const message = '0xZZZZ'; // Invalid hex
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        const output = await executeCommand(['key', 'sign', message, secret], true);

        expect(output).toMatch(/Invalid hex-encoded message/i);
      });

      it('should fail when secret option is missing', async () => {
        const message = 'test';

        const output = await executeCommand(['key', 'sign', message], true);

        // Should fail with an error about invalid secret key (undefined)
        expect(output).toMatch(/Invalid secret key|secret/i);
      });

      it('should produce consistent public key for same secret', async () => {
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const message1 = 'first';
        const message2 = 'second';

        const output1 = await executeCommand(['key', 'sign', message1, secret]);
        const output2 = await executeCommand(['key', 'sign', message2, secret]);

        const publicKey1 = extractPublicKey(output1);
        const publicKey2 = extractPublicKey(output2);

        // Same secret should always produce same public key
        expect(publicKey1).toBe(publicKey2);
      });

      it('should handle empty message', async () => {
        const message = '';
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        const output = await executeCommand(['key', 'sign', message, secret]);

        const signature = extractSignature(output);
        const publicKey = extractPublicKey(output);

        expect(signature).not.toBeNull();
        expect(publicKey).not.toBeNull();
        expect(isValidSchnorrSignature(signature!)).toBe(true);
        expect(isValidPublicKey(publicKey!)).toBe(true);
      });

      it('should not include JSON formatting in human-readable output', async () => {
        const message = 'test';
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        const output = await executeCommand(['key', 'sign', message, secret]);

        // Human-readable output should not contain JSON-like formatting
        expect(output).not.toMatch(/"message"/);
        expect(output).not.toMatch(/"signature"/);
        expect(output).not.toMatch(/"publicKey"/);

        // But should contain the actual values
        const signature = extractSignature(output);
        const publicKey = extractPublicKey(output);
        expect(signature).not.toBeNull();
        expect(publicKey).not.toBeNull();
      });
    });

    describe('verify subcommand', () => {
      it('should verify a valid signature with human-readable output', async () => {
        const message = 'hello';
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        // First sign a message to get a valid signature
        const signOutput = await executeCommand(['key', 'sign', message, secret]);
        const signature = extractSignature(signOutput);
        const publicKey = extractPublicKey(signOutput);

        // Now verify it
        const verifyOutput = await executeCommand([
          'key',
          'verify',
          message,
          '--sig',
          signature!,
          '--pubkey',
          publicKey!,
        ]);

        // Check for expected output structure
        expect(verifyOutput).toMatch(VERIFY_SIGNATURE_TEST_VECTORS.patterns.humanReadable.header);
        expect(verifyOutput).toMatch(VERIFY_SIGNATURE_TEST_VECTORS.patterns.humanReadable.separator);
        expect(verifyOutput).toMatch(VERIFY_SIGNATURE_TEST_VECTORS.patterns.humanReadable.messageLabel);
        expect(verifyOutput).toMatch(VERIFY_SIGNATURE_TEST_VECTORS.patterns.humanReadable.signatureLabel);
        expect(verifyOutput).toMatch(VERIFY_SIGNATURE_TEST_VECTORS.patterns.humanReadable.publicKeyLabel);
        expect(verifyOutput).toMatch(VERIFY_SIGNATURE_TEST_VECTORS.patterns.humanReadable.validLabel);
        expect(verifyOutput).toMatch(VERIFY_SIGNATURE_TEST_VECTORS.patterns.humanReadable.validYes);

        // Extract and validate components
        const valid = extractValid(verifyOutput);
        expect(valid).toBe(true);
      });

      it('should reject an invalid signature (wrong message)', async () => {
        const message = 'hello';
        const wrongMessage = 'goodbye';
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        // Sign with one message
        const signOutput = await executeCommand(['key', 'sign', message, secret]);
        const signature = extractSignature(signOutput);
        const publicKey = extractPublicKey(signOutput);

        // Verify with different message
        const verifyOutput = await executeCommand(
          ['key', 'verify', wrongMessage, '--sig', signature!, '--pubkey', publicKey!],
          true
        );

        expect(verifyOutput).toMatch(VERIFY_SIGNATURE_TEST_VECTORS.patterns.humanReadable.validNo);
        const valid = extractValid(verifyOutput);
        expect(valid).toBe(false);
      });

      it('should reject an invalid signature (wrong public key)', async () => {
        const message = 'hello';
        const secret1 = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const secret2 = '0x0000000000000000000000000000000000000000000000000000000000000042';

        // Sign with secret1
        const signOutput = await executeCommand(['key', 'sign', message, secret1]);
        const signature = extractSignature(signOutput);

        // Get public key from secret2
        const signOutput2 = await executeCommand(['key', 'sign', 'test', secret2]);
        const wrongPublicKey = extractPublicKey(signOutput2);

        // Verify with wrong public key
        const verifyOutput = await executeCommand(
          ['key', 'verify', message, '--sig', signature!, '--pubkey', wrongPublicKey!],
          true
        );

        expect(verifyOutput).toMatch(VERIFY_SIGNATURE_TEST_VECTORS.patterns.humanReadable.validNo);
        const valid = extractValid(verifyOutput);
        expect(valid).toBe(false);
      });

      it('should reject a tampered signature', async () => {
        const message = 'hello';
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        // Sign a message
        const signOutput = await executeCommand(['key', 'sign', message, secret]);
        const signature = extractSignature(signOutput);
        const publicKey = extractPublicKey(signOutput);

        // Tamper with signature (flip last byte)
        const tamperedSig = signature!.slice(0, -2) + 'ff';

        // Verify tampered signature
        const verifyOutput = await executeCommand(
          ['key', 'verify', message, '--sig', tamperedSig, '--pubkey', publicKey!],
          true
        );

        const valid = extractValid(verifyOutput);
        expect(valid).toBe(false);
      });

      it('should verify hex-encoded byte messages', async () => {
        const hexMessage = '0xdeadbeef';
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        // Sign hex message
        const signOutput = await executeCommand(['key', 'sign', hexMessage, secret]);
        const signature = extractSignature(signOutput);
        const publicKey = extractPublicKey(signOutput);

        // Verify it
        const verifyOutput = await executeCommand([
          'key',
          'verify',
          hexMessage,
          '--sig',
          signature!,
          '--pubkey',
          publicKey!,
        ]);

        const valid = extractValid(verifyOutput);
        expect(valid).toBe(true);
      });

      it('should verify empty message', async () => {
        const message = '';
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        // Sign empty message
        const signOutput = await executeCommand(['key', 'sign', message, secret]);
        const signature = extractSignature(signOutput);
        const publicKey = extractPublicKey(signOutput);

        // Verify it
        const verifyOutput = await executeCommand([
          'key',
          'verify',
          message,
          '--sig',
          signature!,
          '--pubkey',
          publicKey!,
        ]);

        const valid = extractValid(verifyOutput);
        expect(valid).toBe(true);
      });

      it('should output JSON when --json flag is used', async () => {
        const message = 'test message';
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        // Sign a message
        const signOutput = await executeCommand(['key', 'sign', message, secret]);
        const signature = extractSignature(signOutput);
        const publicKey = extractPublicKey(signOutput);

        // Verify with JSON output
        const verifyOutput = await executeCommand([
          'key',
          'verify',
          message,
          '--sig',
          signature!,
          '--pubkey',
          publicKey!,
          '--json',
        ]);

        // Should be valid JSON
        const parsed = parseJsonOutput(verifyOutput);
        expect(parsed).not.toBeNull();
        expect(isValidVerifiedSignatureJson(parsed)).toBe(true);

        // Check structure
        expect(parsed.message).toBe(message);
        expect(parsed.signature).toBe(signature);
        expect(parsed.publicKey).toBe(publicKey);
        expect(parsed.valid).toBe(true);
      });

      it('should fail with invalid signature format', async () => {
        const message = 'test';
        const invalidSig = 'not-a-signature';
        const publicKey =
          '0x00000000000000000000000000000000000000000000000000000000000000010000000000000002cf135e7506a45d632d270d45f1181294833fc48d823f272c';

        const output = await executeCommand(
          ['key', 'verify', message, '--sig', invalidSig, '--pubkey', publicKey],
          true
        );

        expect(output).toMatch(/Invalid signature/i);
      });

      it('should fail with invalid public key format', async () => {
        const message = 'test';
        const signature =
          '0x0001cf7970b124d37a3aeefc596735067d16d4d886438c2778cf7c0207cbac4092fcf59fc11fe9fac0765bbb94c71e91a471257248d39badf81a8065ba8c0996';
        const invalidPubkey = 'not-a-pubkey';

        const output = await executeCommand(
          ['key', 'verify', message, '--sig', signature, '--pubkey', invalidPubkey],
          true
        );

        expect(output).toMatch(/Invalid public key/i);
      });

      it('should fail with invalid hex message', async () => {
        const message = '0xZZZZ'; // Invalid hex
        const signature =
          '0x0001cf7970b124d37a3aeefc596735067d16d4d886438c2778cf7c0207cbac4092fcf59fc11fe9fac0765bbb94c71e91a471257248d39badf81a8065ba8c0996';
        const publicKey =
          '0x00000000000000000000000000000000000000000000000000000000000000010000000000000002cf135e7506a45d632d270d45f1181294833fc48d823f272c';

        const output = await executeCommand(
          ['key', 'verify', message, '--sig', signature, '--pubkey', publicKey],
          true
        );

        expect(output).toMatch(/Invalid hex-encoded message/i);
      });

      it('should verify string and hex-encoded bytes produce same result', async () => {
        const stringMessage = 'hello';
        const hexMessage = '0x68656c6c6f'; // "hello" in hex
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        // Sign string message
        const signOutput1 = await executeCommand(['key', 'sign', stringMessage, secret]);
        const signature1 = extractSignature(signOutput1);
        const publicKey1 = extractPublicKey(signOutput1);

        // Verify with hex-encoded version (should work because they're the same bytes)
        const verifyOutput1 = await executeCommand([
          'key',
          'verify',
          hexMessage,
          '--sig',
          signature1!,
          '--pubkey',
          publicKey1!,
        ]);

        const valid1 = extractValid(verifyOutput1);
        expect(valid1).toBe(true);

        // Sign hex message
        const signOutput2 = await executeCommand(['key', 'sign', hexMessage, secret]);
        const signature2 = extractSignature(signOutput2);
        const publicKey2 = extractPublicKey(signOutput2);

        // Verify with string version (should work because they're the same bytes)
        const verifyOutput2 = await executeCommand([
          'key',
          'verify',
          stringMessage,
          '--sig',
          signature2!,
          '--pubkey',
          publicKey2!,
        ]);

        const valid2 = extractValid(verifyOutput2);
        expect(valid2).toBe(true);
      });

      it('should not include JSON formatting in human-readable output', async () => {
        const message = 'test';
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        // Sign and verify
        const signOutput = await executeCommand(['key', 'sign', message, secret]);
        const signature = extractSignature(signOutput);
        const publicKey = extractPublicKey(signOutput);

        const verifyOutput = await executeCommand([
          'key',
          'verify',
          message,
          '--sig',
          signature!,
          '--pubkey',
          publicKey!,
        ]);

        // Human-readable output should not contain JSON-like formatting
        expect(verifyOutput).not.toMatch(/"message"/);
        expect(verifyOutput).not.toMatch(/"signature"/);
        expect(verifyOutput).not.toMatch(/"publicKey"/);
        expect(verifyOutput).not.toMatch(/"valid"/);

        // But should contain the validation result
        const valid = extractValid(verifyOutput);
        expect(valid).not.toBeNull();
      });
    });

    describe('keystore command', () => {
      // Directory for encrypted keystore test files
      const KEYSTORE_TEST_DIR = path.join(os.tmpdir(), '.cazt-encrypted-keystore-test');
      let testFileCounter = 0;

      // Cleanup before and after tests
      beforeAll(async () => {
        try {
          await fs.rm(KEYSTORE_TEST_DIR, { recursive: true, force: true });
        } catch {
          // Ignore if doesn't exist
        }
        await fs.mkdir(KEYSTORE_TEST_DIR, { recursive: true });
      });

      afterAll(async () => {
        try {
          await fs.rm(KEYSTORE_TEST_DIR, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      });

      // Helper to generate unique test file path
      function getTestFilePath(): string {
        testFileCounter++;
        return path.join(KEYSTORE_TEST_DIR, `keystore-${testFileCounter}.json`);
      }

      describe('create subcommand', () => {
        it('should create an encrypted keystore file with human-readable output', async () => {
          const filePath = getTestFilePath();
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
          const password = 'testpassword123';

          const output = await executeCommand([
            'key',
            'keystore',
            'create',
            filePath,
            '--secret',
            secret,
            '--password',
            password,
          ]);

          // Check for expected output structure
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.create.header);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.create.separator);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.create.nameLabel);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.create.pathLabel);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.create.uuidLabel);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.create.cipherLabel);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.create.kdfLabel);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.create.warningLabel);

          // Check for valid UUID
          const uuid = extractKeystoreUuid(output);
          expect(uuid).not.toBeNull();
          expect(isValidUuidV4(uuid!)).toBe(true);

          // Check encryption parameters
          const cipher = extractKeystoreCipher(output);
          const kdf = extractKeystoreKdf(output);
          expect(cipher).toBe(ENCRYPTED_KEYSTORE_TEST_VECTORS.expectedParams.cipher);
          expect(kdf).toBe(ENCRYPTED_KEYSTORE_TEST_VECTORS.expectedParams.kdf);
        });

        it('should create a valid keystore file on disk', async () => {
          const filePath = getTestFilePath();
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
          const password = 'testpassword123';

          await executeCommand([
            'key',
            'keystore',
            'create',
            filePath,
            '--secret',
            secret,
            '--password',
            password,
          ]);

          // Verify file exists
          const exists = await fs.access(filePath).then(() => true).catch(() => false);
          expect(exists).toBe(true);

          // Verify file content is valid keystore format
          const content = await fs.readFile(filePath, 'utf-8');
          const keystoreData = JSON.parse(content);
          expect(isValidKeystoreFile(keystoreData)).toBe(true);
        });

        it('should output JSON when --json flag is provided', async () => {
          const filePath = getTestFilePath();
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000042';
          const password = 'testpassword';

          const output = await executeCommand([
            '--json',
            'key',
            'keystore',
            'create',
            filePath,
            '--secret',
            secret,
            '--password',
            password,
          ]);

          const parsed = parseJsonOutput(output);
          expect(parsed).not.toBeNull();
          expect(isValidKeystoreCreateJson(parsed)).toBe(true);
          expect(parsed.cipher).toBe(ENCRYPTED_KEYSTORE_TEST_VECTORS.expectedParams.cipher);
          expect(parsed.kdf).toBe(ENCRYPTED_KEYSTORE_TEST_VECTORS.expectedParams.kdf);
        });

        it('should work with different secret keys', async () => {
          for (const testCase of ENCRYPTED_KEYSTORE_TEST_VECTORS.testSecrets) {
            const filePath = getTestFilePath();
            const password = 'testpassword';

            const output = await executeCommand([
              '--json',
              'key',
              'keystore',
              'create',
              filePath,
              '--secret',
              testCase.secret,
              '--password',
              password,
            ]);

            const parsed = parseJsonOutput(output);
            expect(parsed).not.toBeNull();
            expect(isValidKeystoreCreateJson(parsed)).toBe(true);
          }
        });

        it('should work with different passwords', async () => {
          for (const testCase of ENCRYPTED_KEYSTORE_TEST_VECTORS.testPasswords) {
            const filePath = getTestFilePath();
            const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

            const output = await executeCommand([
              '--json',
              'key',
              'keystore',
              'create',
              filePath,
              '--secret',
              secret,
              '--password',
              testCase.password,
            ]);

            const parsed = parseJsonOutput(output);
            expect(parsed).not.toBeNull();
            expect(isValidKeystoreCreateJson(parsed)).toBe(true);
          }
        });

        it('should fail with invalid secret key', async () => {
          const filePath = getTestFilePath();
          const invalidSecret = 'not-a-valid-key';
          const password = 'testpassword';

          const output = await executeCommand(
            [
              'key',
              'keystore',
              'create',
              filePath,
              '--secret',
              invalidSecret,
              '--password',
              password,
            ],
            true
          );

          expect(output).toMatch(/Invalid secret key/i);
        });

        it('should generate unique UUIDs for each keystore', async () => {
          const uuids: string[] = [];

          for (let i = 0; i < 3; i++) {
            const filePath = getTestFilePath();
            const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
            const password = 'testpassword';

            const output = await executeCommand([
              'key',
              'keystore',
              'create',
              filePath,
              '--secret',
              secret,
              '--password',
              password,
            ]);

            const uuid = extractKeystoreUuid(output);
            expect(uuid).not.toBeNull();
            uuids.push(uuid!);
          }

          // All UUIDs should be unique
          const uniqueUuids = new Set(uuids);
          expect(uniqueUuids.size).toBe(uuids.length);
        });

        it('should create different ciphertext for same key with different passwords', async () => {
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
          const ciphertexts: string[] = [];

          for (const password of ['password1', 'password2', 'password3']) {
            const filePath = getTestFilePath();

            await executeCommand([
              'key',
              'keystore',
              'create',
              filePath,
              '--secret',
              secret,
              '--password',
              password,
            ]);

            const content = await fs.readFile(filePath, 'utf-8');
            const keystoreData = JSON.parse(content);
            ciphertexts.push(keystoreData.crypto.ciphertext);
          }

          // All ciphertexts should be different (different passwords = different derived keys)
          const uniqueCiphertexts = new Set(ciphertexts);
          expect(uniqueCiphertexts.size).toBe(ciphertexts.length);
        });
      });

      describe('unlock subcommand', () => {
        it('should decrypt a keystore file with correct password', async () => {
          const filePath = getTestFilePath();
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
          const password = 'testpassword123';

          // Create keystore
          await executeCommand([
            'key',
            'keystore',
            'create',
            filePath,
            '--secret',
            secret,
            '--password',
            password,
          ]);

          // Unlock keystore
          const output = await executeCommand([
            'key',
            'keystore',
            'unlock',
            filePath,
            '--password',
            password,
          ]);

          // Check for expected output structure
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.unlock.header);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.unlock.separator);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.unlock.uuidLabel);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.unlock.secretLabel);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.unlock.warningLabel);

          // Check that decrypted secret matches original
          const decryptedSecret = extractUnlockedSecret(output);
          expect(decryptedSecret).not.toBeNull();
          expect(decryptedSecret?.toLowerCase()).toBe(secret.toLowerCase());
        });

        it('should output JSON when --json flag is provided', async () => {
          const filePath = getTestFilePath();
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000042';
          const password = 'testpassword';

          // Create keystore
          await executeCommand([
            'key',
            'keystore',
            'create',
            filePath,
            '--secret',
            secret,
            '--password',
            password,
          ]);

          // Unlock with JSON output
          const output = await executeCommand([
            '--json',
            'key',
            'keystore',
            'unlock',
            filePath,
            '--password',
            password,
          ]);

          const parsed = parseJsonOutput(output);
          expect(parsed).not.toBeNull();
          expect(isValidKeystoreUnlockJson(parsed)).toBe(true);
          expect(parsed.secret.toLowerCase()).toBe(secret.toLowerCase());
        });

        it('should fail with wrong password', async () => {
          const filePath = getTestFilePath();
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
          const password = 'correctpassword';
          const wrongPassword = 'wrongpassword';

          // Create keystore
          await executeCommand([
            'key',
            'keystore',
            'create',
            filePath,
            '--secret',
            secret,
            '--password',
            password,
          ]);

          // Try to unlock with wrong password
          const output = await executeCommand(
            ['key', 'keystore', 'unlock', filePath, '--password', wrongPassword],
            true
          );

          expect(output).toMatch(/Invalid password|MAC verification failed/i);
        });

        it('should fail with non-existent file', async () => {
          const nonExistentPath = path.join(KEYSTORE_TEST_DIR, 'does-not-exist.json');

          const output = await executeCommand(
            ['key', 'keystore', 'unlock', nonExistentPath, '--password', 'password'],
            true
          );

          expect(output).toMatch(/ENOENT|no such file|not found/i);
        });

        it('should round-trip all test secrets', async () => {
          for (const testCase of ENCRYPTED_KEYSTORE_TEST_VECTORS.testSecrets) {
            const filePath = getTestFilePath();
            const password = 'testpassword';

            // Create keystore
            await executeCommand([
              'key',
              'keystore',
              'create',
              filePath,
              '--secret',
              testCase.secret,
              '--password',
              password,
            ]);

            // Unlock and verify
            const output = await executeCommand([
              '--json',
              'key',
              'keystore',
              'unlock',
              filePath,
              '--password',
              password,
            ]);

            const parsed = parseJsonOutput(output);
            expect(parsed).not.toBeNull();
            expect(parsed.secret.toLowerCase()).toBe(testCase.secret.toLowerCase());
          }
        });

        it('should round-trip all test passwords', async () => {
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

          for (const testCase of ENCRYPTED_KEYSTORE_TEST_VECTORS.testPasswords) {
            const filePath = getTestFilePath();

            // Create keystore
            await executeCommand([
              'key',
              'keystore',
              'create',
              filePath,
              '--secret',
              secret,
              '--password',
              testCase.password,
            ]);

            // Unlock and verify
            const output = await executeCommand([
              '--json',
              'key',
              'keystore',
              'unlock',
              filePath,
              '--password',
              testCase.password,
            ]);

            const parsed = parseJsonOutput(output);
            expect(parsed).not.toBeNull();
            expect(parsed.secret.toLowerCase()).toBe(secret.toLowerCase());
          }
        });

        it('should preserve UUID across create and unlock', async () => {
          const filePath = getTestFilePath();
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
          const password = 'testpassword';

          // Create keystore
          const createOutput = await executeCommand([
            'key',
            'keystore',
            'create',
            filePath,
            '--secret',
            secret,
            '--password',
            password,
          ]);
          const createUuid = extractKeystoreUuid(createOutput);

          // Unlock keystore
          const unlockOutput = await executeCommand([
            'key',
            'keystore',
            'unlock',
            filePath,
            '--password',
            password,
          ]);
          const unlockUuid = extractKeystoreUuid(unlockOutput);

          expect(createUuid).toBe(unlockUuid);
        });
      });

      describe('inspect subcommand', () => {
        it('should display keystore metadata without decrypting', async () => {
          const filePath = getTestFilePath();
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
          const password = 'testpassword';

          // Create keystore
          await executeCommand([
            'key',
            'keystore',
            'create',
            filePath,
            '--secret',
            secret,
            '--password',
            password,
          ]);

          // Inspect keystore (no password needed)
          const output = await executeCommand(['key', 'keystore', 'inspect', filePath]);

          // Check for expected output structure
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.inspect.header);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.inspect.separator);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.inspect.nameLabel);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.inspect.pathLabel);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.inspect.uuidLabel);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.inspect.cipherLabel);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.inspect.kdfLabel);

          // Should NOT contain the secret
          expect(output).not.toMatch(/Secret:/i);

          // Check encryption parameters
          const cipher = extractKeystoreCipher(output);
          const kdf = extractKeystoreKdf(output);
          expect(cipher).toBe(ENCRYPTED_KEYSTORE_TEST_VECTORS.expectedParams.cipher);
          expect(kdf).toBe(ENCRYPTED_KEYSTORE_TEST_VECTORS.expectedParams.kdf);
        });

        it('should output JSON when --json flag is provided', async () => {
          const filePath = getTestFilePath();
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000042';
          const password = 'testpassword';

          // Create keystore
          await executeCommand([
            'key',
            'keystore',
            'create',
            filePath,
            '--secret',
            secret,
            '--password',
            password,
          ]);

          // Inspect with JSON output
          const output = await executeCommand(['--json', 'key', 'keystore', 'inspect', filePath]);

          const parsed = parseJsonOutput(output);
          expect(parsed).not.toBeNull();
          expect(isValidKeystoreInspectJson(parsed)).toBe(true);
          expect(parsed.cipher).toBe(ENCRYPTED_KEYSTORE_TEST_VECTORS.expectedParams.cipher);
          expect(parsed.kdf).toBe(ENCRYPTED_KEYSTORE_TEST_VECTORS.expectedParams.kdf);

          // Should NOT contain the secret
          expect(parsed.secret).toBeUndefined();
        });

        it('should fail with non-existent file', async () => {
          const nonExistentPath = path.join(KEYSTORE_TEST_DIR, 'does-not-exist.json');

          const output = await executeCommand(
            ['key', 'keystore', 'inspect', nonExistentPath],
            true
          );

          expect(output).toMatch(/ENOENT|no such file|not found/i);
        });

        it('should fail with invalid JSON file', async () => {
          const invalidFilePath = path.join(KEYSTORE_TEST_DIR, 'invalid.json');
          await fs.writeFile(invalidFilePath, 'not valid json');

          const output = await executeCommand(
            ['key', 'keystore', 'inspect', invalidFilePath],
            true
          );

          expect(output).toMatch(/Invalid keystore|not valid JSON/i);
        });

        it('should preserve UUID from create', async () => {
          const filePath = getTestFilePath();
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
          const password = 'testpassword';

          // Create keystore
          const createOutput = await executeCommand([
            'key',
            'keystore',
            'create',
            filePath,
            '--secret',
            secret,
            '--password',
            password,
          ]);
          const createUuid = extractKeystoreUuid(createOutput);

          // Inspect keystore
          const inspectOutput = await executeCommand(['key', 'keystore', 'inspect', filePath]);
          const inspectUuid = extractKeystoreUuid(inspectOutput);

          expect(createUuid).toBe(inspectUuid);
        });
      });

      describe('Ethereum compatibility', () => {
        it('should decrypt go-ethereum keystore test vector', async () => {
          // Write the go-ethereum test vector to a file
          const filePath = path.join(KEYSTORE_TEST_DIR, 'go-ethereum-test.json');
          const testVector = ENCRYPTED_KEYSTORE_TEST_VECTORS.goEthereumTestVector;

          await fs.writeFile(filePath, JSON.stringify(testVector.keystore, null, 2));

          // Decrypt using our implementation
          const output = await executeCommand([
            '--json',
            'key',
            'keystore',
            'unlock',
            filePath,
            '--password',
            testVector.password,
          ]);

          const parsed = parseJsonOutput(output);
          expect(parsed).not.toBeNull();
          expect(parsed.secret.toLowerCase()).toBe(testVector.expectedSecret.toLowerCase());
          expect(parsed.id).toBe(testVector.keystore.id);
        });

        it('should use aes-128-ctr cipher (Ethereum standard)', async () => {
          const filePath = getTestFilePath();
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
          const password = 'testpassword';

          await executeCommand([
            'key',
            'keystore',
            'create',
            filePath,
            '--secret',
            secret,
            '--password',
            password,
          ]);

          // Read the file and verify cipher
          const content = await fs.readFile(filePath, 'utf-8');
          const keystoreData = JSON.parse(content);

          expect(keystoreData.crypto.cipher).toBe('aes-128-ctr');
          expect(keystoreData.crypto.kdf).toBe('scrypt');
          expect(keystoreData.version).toBe(3);
        });

        it('should use standard scrypt parameters', async () => {
          const filePath = getTestFilePath();
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
          const password = 'testpassword';

          await executeCommand([
            'key',
            'keystore',
            'create',
            filePath,
            '--secret',
            secret,
            '--password',
            password,
          ]);

          // Read the file and verify scrypt parameters
          const content = await fs.readFile(filePath, 'utf-8');
          const keystoreData = JSON.parse(content);

          // Standard Ethereum scrypt parameters
          expect(keystoreData.crypto.kdfparams.n).toBe(262144); // 2^18
          expect(keystoreData.crypto.kdfparams.r).toBe(8);
          expect(keystoreData.crypto.kdfparams.p).toBe(1);
          expect(keystoreData.crypto.kdfparams.dklen).toBe(32);
        });

        it('should produce 32-byte ciphertext for 32-byte secret (no padding)', async () => {
          const filePath = getTestFilePath();
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
          const password = 'testpassword';

          await executeCommand([
            'key',
            'keystore',
            'create',
            filePath,
            '--secret',
            secret,
            '--password',
            password,
          ]);

          // Read the file and verify ciphertext length
          const content = await fs.readFile(filePath, 'utf-8');
          const keystoreData = JSON.parse(content);

          // AES-128-CTR is a stream cipher, so ciphertext length = plaintext length
          // 32 bytes = 64 hex characters
          expect(keystoreData.crypto.ciphertext.length).toBe(64);
        });
      });

      describe('list subcommand', () => {
        it('should list keystores in a directory', async () => {
          // Create a couple of keystores first
          const filePath1 = getTestFilePath();
          const filePath2 = getTestFilePath();
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
          const password = 'testpassword';

          await executeCommand([
            'key', 'keystore', 'create', filePath1,
            '--secret', secret,
            '--password', password,
          ]);

          await executeCommand([
            'key', 'keystore', 'create', filePath2,
            '--secret', secret,
            '--password', password,
          ]);

          // List keystores
          const output = await executeCommand([
            'key', 'keystore', 'list',
            '--keystore-dir', KEYSTORE_TEST_DIR,
          ]);

          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.list.header);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.list.separator);
          expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.list.directoryLabel);
          expect(output).toContain(KEYSTORE_TEST_DIR);
        });

        it('should show "No keystores found" for empty directory', async () => {
          const emptyDir = path.join(os.tmpdir(), '.cazt-empty-keystore-test');
          await fs.mkdir(emptyDir, { recursive: true });

          try {
            const output = await executeCommand([
              'key', 'keystore', 'list',
              '--keystore-dir', emptyDir,
            ]);

            expect(output).toMatch(ENCRYPTED_KEYSTORE_TEST_VECTORS.patterns.list.noKeystores);
          } finally {
            await fs.rm(emptyDir, { recursive: true, force: true });
          }
        });

        it('should output JSON when --json flag is provided', async () => {
          // Create a keystore first
          const filePath = getTestFilePath();
          const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
          const password = 'testpassword';

          await executeCommand([
            'key', 'keystore', 'create', filePath,
            '--secret', secret,
            '--password', password,
          ]);

          // List keystores in JSON format
          const output = await executeCommand([
            '--json', 'key', 'keystore', 'list',
            '--keystore-dir', KEYSTORE_TEST_DIR,
          ]);

          const parsed = parseJsonOutput(output);
          expect(parsed).not.toBeNull();
          expect(parsed.directory).toBe(KEYSTORE_TEST_DIR);
          expect(Array.isArray(parsed.keystores)).toBe(true);
          expect(parsed.keystores.length).toBeGreaterThan(0);

          // Each keystore should have name, id, and path
          for (const ks of parsed.keystores) {
            expect(typeof ks.name).toBe('string');
            expect(typeof ks.id).toBe('string');
            expect(typeof ks.path).toBe('string');
          }
        });
      });
    });
  });
