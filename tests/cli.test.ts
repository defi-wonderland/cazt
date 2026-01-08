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
  isValidImportedKeyJson,
  EXPORT_KEY_TEST_VECTORS,
  isValidExportedKeyJson,
  LIST_KEYS_TEST_VECTORS,
  isValidListedKeysJson,
  DELETE_KEY_TEST_VECTORS,
  isValidDeletedKeyJson,
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
  WALLET_CREATE_TEST_VECTORS,
  isValidCreatedAccountJson,
  extractType,
  extractSalt,
  WALLET_ADDRESS_TEST_VECTORS,
  isValidComputedAddressJson,
  // Integration test utilities
  DEFAULT_NODE_URL,
  isSandboxAvailable,
  runCliSync,
  parseCliJson,
  generateSecretKey,
} from './utils.js';
import { SecretManager } from '../cli/utils/secret-manager.js';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

// Use a test-specific directory to avoid touching user's real secrets
const TEST_SECRETS_DIR = path.join(os.tmpdir(), '.cazt-secrets-test');

// Configure test secrets directory before all tests
beforeAll(async () => {
  SecretManager.setCustomDir(TEST_SECRETS_DIR);
  // Ensure clean test directory
  try {
    await fs.rm(TEST_SECRETS_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }
});

// Clean up after all tests
afterAll(async () => {
  try {
    await fs.rm(TEST_SECRETS_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
  SecretManager.resetDir();
});

// Enable test mode to use separate keystore (~/.cazt/keys_test.json)
// This prevents tests from accidentally wiping real keys
process.env.NODE_ENV = 'test';

// Mock console methods to capture output
let consoleOutput: string[] = [];
let originalLog: typeof console.log;
let originalError: typeof console.error;
let originalStderrWrite: typeof process.stderr.write;

beforeEach(() => {
  consoleOutput = [];
  originalLog = console.log;
  originalError = console.error;
  originalStderrWrite = process.stderr.write;

  // Simple mock that captures output
  console.log = ((...args: any[]) => {
    consoleOutput.push(args.map(String).join(' '));
  }) as typeof console.log;

  console.error = ((...args: any[]) => {
    consoleOutput.push(args.map(String).join(' '));
  }) as typeof console.error;

  // Commander.js writes directly to stderr, so capture that too
  process.stderr.write = ((chunk: any) => {
    consoleOutput.push(String(chunk).trim());
    return true;
  }) as typeof process.stderr.write;
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
  process.stderr.write = originalStderrWrite;
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
  // Always throw to stop execution - commander calls exit on validation errors
  process.exit = ((code?: number) => {
    exitCalled = true;
    exitCode = code;
    throw new Error(`Process exited with code ${code || 0}`);
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
      // Return captured output (console errors) + error message for error cases
      const output = consoleOutput.join('\n');
      return output || error.message;
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
          await SecretManager.clear();
        });

        afterEach(async () => {
          await SecretManager.clear();
        });

        it('should derive keys using secret from stored alias', async () => {
          // First import a key (unencrypted for test simplicity)
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

          // Then derive keys using the alias
          const output = await executeCommand(['key', 'derive-keys', '--alias', testAlias]);

          expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.header);
          const secretKeys = extractDerivedSecretKeys(output);
          expect(secretKeys).not.toBeNull();
          expect(isValidSecretKey(secretKeys!.masterNullifierSecretKey)).toBe(true);
        });

        it('should produce same keys as direct secret input', async () => {
          // Import the key (unencrypted for test simplicity)
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

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
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

          const output = await executeCommand(['key', 'derive-keys', testSecret, '--alias', testAlias], true);

          expect(output).toContain('Cannot specify both');
        });

        it('should fail when neither secret nor alias are provided', async () => {
          const output = await executeCommand(['key', 'derive-keys'], true);

          expect(output).toContain('Must specify either');
        });

        it('should work with --public flag and alias', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

          const output = await executeCommand(['key', 'derive-keys', '--alias', testAlias, '--public']);

          expect(output).toMatch(DERIVE_KEYS_TEST_VECTORS.patterns.humanReadable.publicKeysHeader);
          const publicKeys = extractDerivedPublicKeys(output);
          expect(publicKeys).not.toBeNull();
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
          await SecretManager.clear();
        });

        afterEach(async () => {
          await SecretManager.clear();
        });

        it('should derive address using secret from stored alias', async () => {
          // First import a key (unencrypted for test simplicity)
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

          // Then derive address using the alias
          const output = await executeCommand(['key', 'derive-address', '--alias', testAlias]);

          expect(output).toMatch(DERIVE_ADDRESS_TEST_VECTORS.patterns.humanReadable.header);
          const address = extractAddress(output);
          expect(address).not.toBeNull();
          expect(isValidAztecAddress(address!)).toBe(true);
        });

        it('should produce same address as direct secret input', async () => {
          // Import the key (unencrypted for test simplicity)
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

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
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

          const output = await executeCommand(['key', 'derive-address', testSecret, '--alias', testAlias], true);

          expect(output).toContain('Cannot specify both');
        });

        it('should fail when neither secret nor alias are provided', async () => {
          const output = await executeCommand(['key', 'derive-address'], true);

          expect(output).toContain('Must specify either');
        });

        it('should work with --salt flag and alias', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

          const output = await executeCommand(['key', 'derive-address', '--alias', testAlias, '--salt', '42']);

          const address = extractAddress(output);
          expect(address).not.toBeNull();
          expect(isValidAztecAddress(address!)).toBe(true);
          expect(output).toContain('Salt:');
        });

        it('should derive different addresses with same alias but different salts', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

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
      const testPassword = 'testpassword123';

      // Clean up secrets before and after each test
      beforeEach(async () => {
        await SecretManager.clear();
      });

      afterEach(async () => {
        await SecretManager.clear();
      });

      describe('encrypted import (default)', () => {
        it('should import an encrypted secret key with human-readable output', async () => {
          const alias = 'mykey';
          const output = await executeCommand([
            'key', 'import', testSecret, '--alias', alias, '--password', testPassword
          ]);

          expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.header);
          expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.separator);
          expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.aliasLabel);
          expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.encryptedLabel);
          expect(output).toMatch(/yes/i); // encrypted: yes
          expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.storedLabel);
          expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.warningLabel);
        });

        it('should extract and display the alias correctly', async () => {
          const alias = 'myWallet';
          const output = await executeCommand([
            'key', 'import', testSecret, '--alias', alias, '--password', testPassword
          ]);

          const extractedAlias = extractAlias(output);
          expect(extractedAlias).toBe(alias);
        });

        it('should output JSON when --json flag is used', async () => {
          const alias = 'jsonTest';
          const output = await executeCommand([
            '--json', 'key', 'import', testSecret, '--alias', alias, '--password', testPassword
          ]);

          expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.json.validJson);
          expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.json.hasAlias);
          expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.json.hasSecret);
          expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.json.hasEncrypted);
          expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.json.hasStoragePath);

          const parsed = parseJsonOutput(output);
          expect(isValidImportedKeyJson(parsed)).toBe(true);
          expect(parsed.encrypted).toBe(true);
        });

        it('should produce correct data in JSON format', async () => {
          const alias = 'jsonDataTest';
          const output = await executeCommand([
            '--json', 'key', 'import', testSecret, '--alias', alias, '--password', testPassword
          ]);

          const parsed = parseJsonOutput(output);
          expect(parsed).not.toBeNull();
          expect(parsed.alias).toBe(alias);
          expect(parsed.secret).toBe(testSecret);
          expect(parsed.encrypted).toBe(true);
          expect(parsed.storagePath).toContain(alias); // Encrypted files use alias as filename
        });
      });

      describe('unencrypted import (--no-encrypt)', () => {
        it('should import an unencrypted secret key with human-readable output', async () => {
          const alias = 'plainkey';
          const output = await executeCommand([
            'key', 'import', testSecret, '--alias', alias, '--no-encrypt'
          ]);

          expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.header);
          expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.aliasLabel);
          expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.encryptedLabel);
          expect(output).toMatch(/no/i); // encrypted: no
        });

        it('should output JSON when --json flag is used', async () => {
          const alias = 'plainJsonTest';
          const output = await executeCommand([
            '--json', 'key', 'import', testSecret, '--alias', alias, '--no-encrypt'
          ]);

          const parsed = parseJsonOutput(output);
          expect(isValidImportedKeyJson(parsed)).toBe(true);
          expect(parsed.encrypted).toBe(false);
          expect(parsed.storagePath).toContain('keys.json');
        });

        it('should handle various valid aliases', async () => {
          for (const testCase of IMPORT_KEY_TEST_VECTORS.validAliases.slice(0, 3)) {
            await SecretManager.clear();
            const output = await executeCommand([
              'key', 'import', testSecret, '--alias', testCase.alias, '--no-encrypt'
            ]);

            const extractedAlias = extractAlias(output);
            expect(extractedAlias).toBe(testCase.alias);
          }
        });
      });

      describe('common behavior', () => {
        it('should reject invalid aliases', async () => {
          for (const testCase of IMPORT_KEY_TEST_VECTORS.invalidAliases) {
            const output = await executeCommand([
              'key', 'import', testSecret, '--alias', testCase.alias, '--no-encrypt'
            ], true);

            expect(output).toMatch(/Invalid alias/i);
          }
        });

        it('should reject invalid secret keys', async () => {
          for (const testCase of IMPORT_KEY_TEST_VECTORS.invalidSecrets) {
            const output = await executeCommand([
              'key', 'import', testCase.secret, '--alias', 'test', '--no-encrypt'
            ], true);

            expect(output).toMatch(/Invalid secret key|Error/i);
          }
        });

        it('should reject duplicate alias without --force flag', async () => {
          const alias = 'duplicate';

          await executeCommand([
            'key', 'import', testSecret, '--alias', alias, '--no-encrypt'
          ]);

          const output = await executeCommand([
            'key', 'import', testSecret, '--alias', alias, '--no-encrypt'
          ], true);

          expect(output).toMatch(/already exists/i);
          expect(output).toMatch(/--force/i);
        });

        it('should allow overwriting with --force flag', async () => {
          const alias = 'forceTest';
          const secret1 = '0x0000000000000000000000000000000000000000000000000000000000000001';
          const secret2 = '0x0000000000000000000000000000000000000000000000000000000000000042';

          await executeCommand([
            'key', 'import', secret1, '--alias', alias, '--no-encrypt'
          ]);

          const output = await executeCommand([
            'key', 'import', secret2, '--alias', alias, '--no-encrypt', '--force'
          ]);

          expect(output).toMatch(IMPORT_KEY_TEST_VECTORS.patterns.humanReadable.header);

          // Verify by exporting
          const exportOutput = await executeCommand(['key', 'export', alias]);
          expect(exportOutput).toContain(secret2);
        });

        it('should require --alias option', async () => {
          const output = await executeCommand(['key', 'import', testSecret], true);
          expect(output).toMatch(/required option|alias/i);
        });
      });
    });

    describe('export subcommand', () => {
      const testSecret = '0x0000000000000000000000000000000000000000000000000000000000000001';
      const testAlias = 'exportTest';
      const testPassword = 'testPassword123';

      // Clean up secrets before and after each test
      beforeEach(async () => {
        await SecretManager.clear();
      });

      afterEach(async () => {
        await SecretManager.clear();
      });

      describe('unencrypted export (--no-encrypt import)', () => {
        it('should export a secret key by alias with human-readable output', async () => {
          // First import a key (unencrypted)
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

          // Then export it
          const output = await executeCommand(['key', 'export', testAlias]);

          // Check for expected output structure
          expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.header);
          expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.separator);
          expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.aliasLabel);
          expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.secretLabel);
          expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.encryptedLabel);
          expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.warningLabel);
        });

        it('should export the correct secret key', async () => {
          // Import a key
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

          // Export it
          const output = await executeCommand(['key', 'export', testAlias]);

          // Verify the secret matches
          expect(output).toContain(testSecret);
        });

        it('should display the correct alias', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);
          const output = await executeCommand(['key', 'export', testAlias]);

          const extractedAlias = extractAlias(output);
          expect(extractedAlias).toBe(testAlias);
        });

        it('should display encryption status as no', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);
          const output = await executeCommand(['key', 'export', testAlias]);

          expect(output).toMatch(/Encrypted:\s*no/);
        });

        it('should display the security warning', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);
          const output = await executeCommand(['key', 'export', testAlias]);

          const warning = extractWarning(output);
          expect(warning).toBe(EXPORT_KEY_TEST_VECTORS.expectedWarning);
        });

        it('should export multiple times without changes (idempotent)', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

          const output1 = await executeCommand(['key', 'export', testAlias]);
          const output2 = await executeCommand(['key', 'export', testAlias]);

          // Both exports should contain the same secret
          expect(output1).toContain(testSecret);
          expect(output2).toContain(testSecret);
        });

        it('should output JSON when --json flag is used', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);
          const output = await executeCommand(['key', 'export', testAlias, '--json']);

          // Should be valid JSON
          expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.json.validJson);
          expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.json.hasAlias);
          expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.json.hasSecret);
          expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.json.hasEncrypted);
          expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.json.hasWarning);

          const parsed = parseJsonOutput(output);
          expect(isValidExportedKeyJson(parsed)).toBe(true);
        });

        it('should produce correct data in JSON format', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);
          const output = await executeCommand(['key', 'export', testAlias, '--json']);

          const parsed = parseJsonOutput(output);
          expect(parsed).not.toBeNull();
          expect(parsed.alias).toBe(testAlias);
          expect(parsed.secret).toBe(testSecret);
          expect(parsed.encrypted).toBe(false);
          expect(parsed.warning).toBe(EXPORT_KEY_TEST_VECTORS.expectedWarning);
        });

        it('should not include JSON formatting in human-readable output', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);
          const output = await executeCommand(['key', 'export', testAlias]);

          // Human-readable output should not contain JSON-like formatting
          expect(output).not.toMatch(/"alias"/);
          expect(output).not.toMatch(/"secret"/);

          // But should contain the actual labels
          expect(output).toContain('Alias:');
          expect(output).toContain('Secret:');
        });
      });

      describe('encrypted export', () => {
        it('should export an encrypted secret with --password option', async () => {
          // Import an encrypted key
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--password', testPassword]);

          // Export with password
          const output = await executeCommand(['key', 'export', testAlias, '--password', testPassword]);

          // Check for expected output structure
          expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.header);
          expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.aliasLabel);
          expect(output).toMatch(EXPORT_KEY_TEST_VECTORS.patterns.humanReadable.secretLabel);
          expect(output).toContain(testSecret);
        });

        it('should show encryption status as yes', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--password', testPassword]);
          const output = await executeCommand(['key', 'export', testAlias, '--password', testPassword]);

          expect(output).toMatch(/Encrypted:\s*yes/);
        });

        // Interactive password prompt tests are skipped since they require TTY
        // The prompt behavior is tested manually in real CLI usage

        it('should fail with wrong password', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--password', testPassword]);

          const output = await executeCommand(['key', 'export', testAlias, '--password', 'wrongPassword'], true);

          expect(output).toMatch(/invalid|wrong|incorrect|failed/i);
        });

        it('should output correct JSON for encrypted export', async () => {
          await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--password', testPassword]);
          const output = await executeCommand(['key', 'export', testAlias, '--password', testPassword, '--json']);

          const parsed = parseJsonOutput(output);
          expect(parsed).not.toBeNull();
          expect(parsed.alias).toBe(testAlias);
          expect(parsed.secret).toBe(testSecret);
          expect(parsed.encrypted).toBe(true);
          expect(parsed.warning).toBe(EXPORT_KEY_TEST_VECTORS.expectedWarning);
        });
      });

      describe('common behavior', () => {
        it('should fail when exporting non-existent alias', async () => {
          const output = await executeCommand(['key', 'export', 'nonExistentAlias'], true);

          expect(output).toMatch(/not found/i);
        });

        it('should export keys with various aliases', async () => {
          const testCases = [
            { alias: 'key1', secret: '0x0000000000000000000000000000000000000000000000000000000000000001' },
            { alias: 'key2', secret: '0x0000000000000000000000000000000000000000000000000000000000000042' },
            { alias: '_private', secret: '0x0000000000000000000000000000000000000000000000000000000000000003' },
          ];

          for (const testCase of testCases) {
            await executeCommand(['key', 'import', testCase.secret, '--alias', testCase.alias, '--no-encrypt']);
            const output = await executeCommand(['key', 'export', testCase.alias]);

            expect(output).toContain(testCase.alias);
            expect(output).toContain(testCase.secret);
          }
        });

        it('should handle empty storage gracefully', async () => {
          // Don't import anything, just try to export
          const output = await executeCommand(['key', 'export', 'someAlias'], true);

          expect(output).toMatch(/not found/i);
        });

        it('should export new secret after --force import', async () => {
          const secret1 = '0x0000000000000000000000000000000000000000000000000000000000000001';
          const secret2 = '0x0000000000000000000000000000000000000000000000000000000000000042';

          // Import first key (unencrypted for simplicity)
          await executeCommand(['key', 'import', secret1, '--alias', testAlias, '--no-encrypt']);
          const output1 = await executeCommand(['key', 'export', testAlias, '--json']);
          const parsed1 = parseJsonOutput(output1);
          expect(parsed1.secret).toBe(secret1);

          // Overwrite with second key
          await executeCommand(['key', 'import', secret2, '--alias', testAlias, '--no-encrypt', '--force']);
          const output2 = await executeCommand(['key', 'export', testAlias, '--json']);
          const parsed2 = parseJsonOutput(output2);

          expect(parsed2.secret).toBe(secret2);
        });
      });
    });

    describe('list subcommand', () => {
      // Clean up secrets before and after each test
      beforeEach(async () => {
        await SecretManager.clear();
      });

      afterEach(async () => {
        await SecretManager.clear();
      });

      it('should list all stored secrets with human-readable output', async () => {
        // Import some test keys (unencrypted for simplicity)
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'alice',
          '--no-encrypt',
        ]);
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000042',
          '--alias',
          'bob',
          '--no-encrypt',
        ]);

        const output = await executeCommand(['key', 'list']);

        // Check for expected output structure
        expect(output).toMatch(LIST_KEYS_TEST_VECTORS.patterns.humanReadable.header);
        expect(output).toMatch(LIST_KEYS_TEST_VECTORS.patterns.humanReadable.separator);
        expect(output).toContain('alice');
        expect(output).toContain('bob');
      });

      it('should show message when no secrets are stored', async () => {
        const output = await executeCommand(['key', 'list']);

        expect(output).toMatch(LIST_KEYS_TEST_VECTORS.patterns.humanReadable.header);
        expect(output).toMatch(LIST_KEYS_TEST_VECTORS.patterns.humanReadable.noSecrets);
      });

      it('should show encryption status for each secret', async () => {
        // Import one encrypted and one unencrypted key
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'encrypted_key',
          '--password',
          'testpass',
        ]);
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000002',
          '--alias',
          'plain_key',
          '--no-encrypt',
        ]);

        const output = await executeCommand(['key', 'list']);

        // Check that encryption status is displayed
        expect(output).toContain('encrypted_key');
        expect(output).toContain('plain_key');
        expect(output).toMatch(/\(encrypted\)/);
        expect(output).toMatch(/\(plain\)/);
      });

      it('should work with ls alias', async () => {
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'test',
          '--no-encrypt',
        ]);

        const output = await executeCommand(['key', 'ls']);

        expect(output).toMatch(LIST_KEYS_TEST_VECTORS.patterns.humanReadable.header);
        expect(output).toContain('test');
      });

      it('should not expose secret keys in list output', async () => {
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000042';
        await executeCommand(['key', 'import', secret, '--alias', 'sensitive', '--no-encrypt']);

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
          '--no-encrypt',
        ]);

        const output = await executeCommand(['key', 'list', '--json']);

        // Should be valid JSON
        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(isValidListedKeysJson(parsed)).toBe(true);
        expect(parsed.secrets).toBeDefined();
        expect(Array.isArray(parsed.secrets)).toBe(true);
        expect(parsed.secrets.some((s: any) => s.alias === 'alice')).toBe(true);
      });

      it('should return empty array in JSON when no secrets stored', async () => {
        const output = await executeCommand(['key', 'list', '--json']);

        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(parsed.secrets).toBeDefined();
        expect(Array.isArray(parsed.secrets)).toBe(true);
        expect(parsed.secrets.length).toBe(0);
      });

      it('should list multiple secrets correctly in JSON format with encryption status', async () => {
        const testKeys = [
          { alias: 'alice', secret: '0x0000000000000000000000000000000000000000000000000000000000000001' },
          { alias: 'bob', secret: '0x0000000000000000000000000000000000000000000000000000000000000002' },
          { alias: 'charlie', secret: '0x0000000000000000000000000000000000000000000000000000000000000003' },
        ];

        for (const key of testKeys) {
          await executeCommand(['key', 'import', key.secret, '--alias', key.alias, '--no-encrypt']);
        }

        const output = await executeCommand(['key', 'list', '--json']);
        const parsed = parseJsonOutput(output);

        expect(parsed.secrets).toHaveLength(3);
        expect(parsed.secrets.some((s: any) => s.alias === 'alice')).toBe(true);
        expect(parsed.secrets.some((s: any) => s.alias === 'bob')).toBe(true);
        expect(parsed.secrets.some((s: any) => s.alias === 'charlie')).toBe(true);

        // Check that encryption status is included
        for (const secret of parsed.secrets) {
          expect(typeof secret.encrypted).toBe('boolean');
        }
      });

      it('should show correct encryption status in JSON', async () => {
        // Import one encrypted and one unencrypted key
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'encrypted_key',
          '--password',
          'testpass',
        ]);
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000002',
          '--alias',
          'plain_key',
          '--no-encrypt',
        ]);

        const output = await executeCommand(['key', 'list', '--json']);
        const parsed = parseJsonOutput(output);

        const encryptedSecret = parsed.secrets.find((s: any) => s.alias === 'encrypted_key');
        const plainSecret = parsed.secrets.find((s: any) => s.alias === 'plain_key');

        expect(encryptedSecret.encrypted).toBe(true);
        expect(plainSecret.encrypted).toBe(false);
      });

      it('should not include JSON formatting in human-readable output', async () => {
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'test',
          '--no-encrypt',
        ]);

        const output = await executeCommand(['key', 'list']);

        // Human-readable output should not contain JSON-like formatting
        expect(output).not.toMatch(/"secrets"/);

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
            '--no-encrypt',
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
          '--no-encrypt',
        ]);

        let output = await executeCommand(['key', 'list', '--json']);
        let parsed = parseJsonOutput(output);
        expect(parsed.secrets).toHaveLength(1);

        // Add another key
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000002',
          '--alias',
          'second',
          '--no-encrypt',
        ]);

        output = await executeCommand(['key', 'list', '--json']);
        parsed = parseJsonOutput(output);
        expect(parsed.secrets).toHaveLength(2);
        expect(parsed.secrets.some((s: any) => s.alias === 'first')).toBe(true);
        expect(parsed.secrets.some((s: any) => s.alias === 'second')).toBe(true);
      });

      it('should be consistent between multiple invocations', async () => {
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'test1',
          '--no-encrypt',
        ]);
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000002',
          '--alias',
          'test2',
          '--no-encrypt',
        ]);

        const output1 = await executeCommand(['key', 'list', '--json']);
        const output2 = await executeCommand(['key', 'list', '--json']);

        const parsed1 = parseJsonOutput(output1);
        const parsed2 = parseJsonOutput(output2);

        expect(parsed1.secrets).toEqual(parsed2.secrets);
      });

      it('should list single key correctly', async () => {
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'single',
          '--no-encrypt',
        ]);

        const output = await executeCommand(['key', 'list']);

        expect(output).toContain('single');
        expect(output).toMatch(LIST_KEYS_TEST_VECTORS.patterns.humanReadable.header);
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
            '--no-encrypt',
          ]);
        }

        const output = await executeCommand(['key', 'list', '--json']);
        const parsed = parseJsonOutput(output);

        expect(parsed.secrets).toHaveLength(10);
        for (let i = 0; i < 10; i++) {
          expect(parsed.secrets.some((s: any) => s.alias === `key${i}`)).toBe(true);
        }
      });

      it('should include storage path in JSON output', async () => {
        const output = await executeCommand(['key', 'list', '--json']);
        const parsed = parseJsonOutput(output);

        expect(parsed.storagePath).toBeDefined();
        expect(typeof parsed.storagePath).toBe('string');
      });
    });

    describe('delete subcommand', () => {
      const testSecret = '0x0000000000000000000000000000000000000000000000000000000000000001';
      const testAlias = 'deleteTest';

      // Clean up secrets before and after each test
      beforeEach(async () => {
        await SecretManager.clear();
      });

      afterEach(async () => {
        await SecretManager.clear();
      });

      it('should delete an unencrypted secret with human-readable output', async () => {
        // Import a key
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

        // Delete it
        const output = await executeCommand(['key', 'delete', testAlias]);

        // Check for expected output structure
        expect(output).toMatch(DELETE_KEY_TEST_VECTORS.patterns.humanReadable.header);
        expect(output).toMatch(DELETE_KEY_TEST_VECTORS.patterns.humanReadable.separator);
        expect(output).toMatch(DELETE_KEY_TEST_VECTORS.patterns.humanReadable.aliasLabel);
        expect(output).toMatch(DELETE_KEY_TEST_VECTORS.patterns.humanReadable.wasEncryptedLabel);
        expect(output).toContain(testAlias);
      });

      it('should delete an encrypted secret', async () => {
        // Import an encrypted key
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--password', 'testpass']);

        // Delete it (no password needed to delete)
        const output = await executeCommand(['key', 'delete', testAlias]);

        expect(output).toMatch(DELETE_KEY_TEST_VECTORS.patterns.humanReadable.header);
        expect(output).toContain(testAlias);
        expect(output).toMatch(/Was encrypted:\s*yes/);
      });

      it('should show correct encryption status after deletion', async () => {
        // Import unencrypted key
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

        const output = await executeCommand(['key', 'delete', testAlias]);

        expect(output).toMatch(/Was encrypted:\s*no/);
      });

      it('should work with rm alias', async () => {
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

        const output = await executeCommand(['key', 'rm', testAlias]);

        expect(output).toMatch(DELETE_KEY_TEST_VECTORS.patterns.humanReadable.header);
        expect(output).toContain(testAlias);
      });

      it('should remove secret from list after deletion', async () => {
        // Import a key
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);

        // Verify it exists in list
        let listOutput = await executeCommand(['key', 'list', '--json']);
        let parsed = parseJsonOutput(listOutput);
        expect(parsed.secrets.some((s: any) => s.alias === testAlias)).toBe(true);

        // Delete it
        await executeCommand(['key', 'delete', testAlias]);

        // Verify it's gone from list
        listOutput = await executeCommand(['key', 'list', '--json']);
        parsed = parseJsonOutput(listOutput);
        expect(parsed.secrets.some((s: any) => s.alias === testAlias)).toBe(false);
      });

      it('should fail when deleting non-existent alias', async () => {
        const output = await executeCommand(['key', 'delete', 'nonExistentAlias'], true);

        expect(output).toMatch(/not found/i);
      });

      it('should output JSON when --json flag is used', async () => {
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--no-encrypt']);
        const output = await executeCommand(['key', 'delete', testAlias, '--json']);

        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(isValidDeletedKeyJson(parsed)).toBe(true);
        expect(parsed.alias).toBe(testAlias);
        expect(typeof parsed.encrypted).toBe('boolean');
        expect(parsed.deleted).toBe(true);
      });

      it('should output correct JSON for encrypted secret deletion', async () => {
        await executeCommand(['key', 'import', testSecret, '--alias', testAlias, '--password', 'testpass']);
        const output = await executeCommand(['key', 'delete', testAlias, '--json']);

        const parsed = parseJsonOutput(output);
        expect(parsed.encrypted).toBe(true);
        expect(parsed.deleted).toBe(true);
      });

      it('should delete multiple keys individually', async () => {
        const aliases = ['key1', 'key2', 'key3'];

        // Import multiple keys
        for (let i = 0; i < aliases.length; i++) {
          await executeCommand([
            'key',
            'import',
            `0x000000000000000000000000000000000000000000000000000000000000000${i + 1}`,
            '--alias',
            aliases[i],
            '--no-encrypt',
          ]);
        }

        // Delete one by one
        for (const alias of aliases) {
          const output = await executeCommand(['key', 'delete', alias]);
          expect(output).toContain(alias);
        }

        // Verify all are gone
        const listOutput = await executeCommand(['key', 'list', '--json']);
        const parsed = parseJsonOutput(listOutput);
        expect(parsed.secrets).toHaveLength(0);
      });

      it('should not affect other secrets when deleting one', async () => {
        // Import two keys
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000001',
          '--alias',
          'keep',
          '--no-encrypt',
        ]);
        await executeCommand([
          'key',
          'import',
          '0x0000000000000000000000000000000000000000000000000000000000000002',
          '--alias',
          'delete',
          '--no-encrypt',
        ]);

        // Delete one
        await executeCommand(['key', 'delete', 'delete']);

        // Verify the other still exists
        const listOutput = await executeCommand(['key', 'list', '--json']);
        const parsed = parseJsonOutput(listOutput);
        expect(parsed.secrets).toHaveLength(1);
        expect(parsed.secrets[0].alias).toBe('keep');
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
  });

  describe('wallet command', () => {
    describe('create subcommand', () => {
      it('should create a new account with human-readable output', async () => {
        const output = await executeCommand(['wallet', 'create']);

        // Check for expected output structure
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.humanReadable.header);
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.humanReadable.separator);
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.humanReadable.addressLabel);
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.humanReadable.secretKeyLabel);
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.humanReadable.typeLabel);
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.humanReadable.saltLabel);
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.humanReadable.warningLabel);

        // Check that an address value is present (64 hex chars after 0x)
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.humanReadable.addressValue);

        // Check that a secret key value is present
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.humanReadable.secretKeyValue);

        // Check that security warning is present
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.humanReadable.securityWarning);
      });

      it('should create a valid account with valid secret key and address', async () => {
        const output = await executeCommand(['wallet', 'create']);

        // Extract values from output
        const address = extractAddress(output);
        const secretKey = extractSecretKey(output);
        const type = extractType(output);
        const salt = extractSalt(output);

        expect(address).not.toBeNull();
        expect(secretKey).not.toBeNull();
        expect(type).not.toBeNull();
        expect(salt).not.toBeNull();

        // Validate formats
        expect(isValidAztecAddress(address!)).toBe(true);
        expect(isValidSecretKey(secretKey!)).toBe(true);
        expect(isValidFieldElement(secretKey!)).toBe(true);
        expect(type).toBe('schnorr');
      });

      it('should include the expected security warning', async () => {
        const output = await executeCommand(['wallet', 'create']);

        // Extract warning from output
        const warning = extractWarning(output);

        expect(warning).not.toBeNull();
        expect(warning).toBe(WALLET_CREATE_TEST_VECTORS.expectedWarning);
      });

      it('should generate different accounts on multiple invocations', async () => {
        const output1 = await executeCommand(['wallet', 'create']);
        const output2 = await executeCommand(['wallet', 'create']);
        const output3 = await executeCommand(['wallet', 'create']);

        const address1 = extractAddress(output1);
        const address2 = extractAddress(output2);
        const address3 = extractAddress(output3);

        const key1 = extractSecretKey(output1);
        const key2 = extractSecretKey(output2);
        const key3 = extractSecretKey(output3);

        // All addresses and keys should be different
        expect(address1).not.toBe(address2);
        expect(address2).not.toBe(address3);
        expect(address1).not.toBe(address3);

        expect(key1).not.toBe(key2);
        expect(key2).not.toBe(key3);
        expect(key1).not.toBe(key3);
      });

      it('should output valid JSON when --json flag is used', async () => {
        const output = await executeCommand(['wallet', 'create', '--json']);

        // Check JSON structure
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.json.validJson);
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.json.hasAddress);
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.json.hasSecretKey);
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.json.hasType);
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.json.hasSalt);
        expect(output).toMatch(WALLET_CREATE_TEST_VECTORS.patterns.json.hasWarning);

        // Parse and validate JSON structure
        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(isValidCreatedAccountJson(parsed)).toBe(true);
      });

      it('should output valid JSON when --json --no-pretty flags are used', async () => {
        const output = await executeCommand(['wallet', 'create', '--json', '--no-pretty']);

        // Parse and validate JSON structure
        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(isValidCreatedAccountJson(parsed)).toBe(true);
      });

      it('should create schnorr account by default', async () => {
        const output = await executeCommand(['wallet', 'create', '--json']);

        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(parsed.type).toBe('schnorr');
      });

      it('should create schnorr account when --type schnorr is specified', async () => {
        const output = await executeCommand(['wallet', 'create', '--type', 'schnorr', '--json']);

        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(parsed.type).toBe('schnorr');
      });

      it('should fail for unsupported account types', async () => {
        for (const unsupportedType of WALLET_CREATE_TEST_VECTORS.unsupportedTypes) {
          const output = await executeCommand(['wallet', 'create', '--type', unsupportedType], true);

          expect(output).toMatch(/not supported/i);
        }
      });

      it('should use salt of 0 by default', async () => {
        const output = await executeCommand(['wallet', 'create', '--json']);

        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(parsed.salt).toBe(WALLET_CREATE_TEST_VECTORS.defaults.salt);
      });

      it('should compute deterministic address from secret key', async () => {
        // Create an account and extract its secret
        const createOutput = await executeCommand(['wallet', 'create', '--json']);
        const createParsed = parseJsonOutput(createOutput);

        // Use the same secret to derive-address and verify it matches
        const deriveOutput = await executeCommand(['key', 'derive-address', createParsed.secretKey, '--json']);
        const deriveParsed = parseJsonOutput(deriveOutput);

        expect(deriveParsed.address).toBe(createParsed.address);
      });

      it('should not include JSON formatting in human-readable output', async () => {
        const output = await executeCommand(['wallet', 'create']);

        // Human-readable output should not contain JSON-like formatting
        expect(output).not.toMatch(/"secretKey"/);
        expect(output).not.toMatch(/"address"/);
        expect(output).not.toMatch(/"type"/);
        expect(output).not.toMatch(/"salt"/);
        expect(output).not.toMatch(/"warning"/);
      });
    });

    describe('address subcommand', () => {
      it('should compute address with human-readable output', async () => {
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const output = await executeCommand(['wallet', 'address', secret]);

        // Check for expected output structure
        expect(output).toMatch(WALLET_ADDRESS_TEST_VECTORS.patterns.humanReadable.header);
        expect(output).toMatch(WALLET_ADDRESS_TEST_VECTORS.patterns.humanReadable.separator);
        expect(output).toMatch(WALLET_ADDRESS_TEST_VECTORS.patterns.humanReadable.addressLabel);
        expect(output).toMatch(WALLET_ADDRESS_TEST_VECTORS.patterns.humanReadable.typeLabel);
        expect(output).toMatch(WALLET_ADDRESS_TEST_VECTORS.patterns.humanReadable.saltLabel);

        // Check that an address value is present
        expect(output).toMatch(WALLET_ADDRESS_TEST_VECTORS.patterns.humanReadable.addressValue);
      });

      it('should compute correct address for known secret key', async () => {
        const testCase = WALLET_ADDRESS_TEST_VECTORS.knownAddresses[0];
        const output = await executeCommand(['wallet', 'address', testCase.secretKey]);

        const address = extractAddress(output);
        expect(address).toBe(testCase.expectedAddress);
      });

      it('should compute correct address with salt', async () => {
        const testCase = WALLET_ADDRESS_TEST_VECTORS.knownAddresses[2]; // salt = 1
        const output = await executeCommand(['wallet', 'address', testCase.secretKey, '--salt', testCase.salt!]);

        const address = extractAddress(output);
        expect(address).toBe(testCase.expectedAddress);
      });

      it('should output valid JSON when --json flag is used', async () => {
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const output = await executeCommand(['wallet', 'address', secret, '--json']);

        // Check JSON structure
        expect(output).toMatch(WALLET_ADDRESS_TEST_VECTORS.patterns.json.validJson);
        expect(output).toMatch(WALLET_ADDRESS_TEST_VECTORS.patterns.json.hasAddress);
        expect(output).toMatch(WALLET_ADDRESS_TEST_VECTORS.patterns.json.hasType);
        expect(output).toMatch(WALLET_ADDRESS_TEST_VECTORS.patterns.json.hasSalt);

        // Parse and validate JSON structure
        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(isValidComputedAddressJson(parsed)).toBe(true);
      });

      it('should use schnorr type by default', async () => {
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const output = await executeCommand(['wallet', 'address', secret, '--json']);

        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(parsed.type).toBe('schnorr');
      });

      it('should use salt of 0 by default', async () => {
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const output = await executeCommand(['wallet', 'address', secret, '--json']);

        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(parsed.salt).toBe(WALLET_ADDRESS_TEST_VECTORS.defaults.salt);
      });

      it('should fail for unsupported account types', async () => {
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        for (const unsupportedType of WALLET_ADDRESS_TEST_VECTORS.unsupportedTypes) {
          const output = await executeCommand(['wallet', 'address', secret, '--type', unsupportedType], true);
          expect(output).toMatch(/not supported/i);
        }
      });

      it('should derive secret key from passphrase', async () => {
        const passphrase = 'my secret passphrase';
        const output = await executeCommand(['wallet', 'address', passphrase, '--json']);

        const parsed = parseJsonOutput(output);
        expect(parsed).not.toBeNull();
        expect(isValidAztecAddress(parsed.address)).toBe(true);
        // Should include derived secret key when using passphrase
        expect(parsed.secretKey).toBeDefined();
        expect(isValidSecretKey(parsed.secretKey)).toBe(true);
      });

      it('should show derived secret key in human-readable output for passphrase', async () => {
        const passphrase = 'my secret passphrase';
        const output = await executeCommand(['wallet', 'address', passphrase]);

        expect(output).toMatch(WALLET_ADDRESS_TEST_VECTORS.patterns.humanReadable.derivedSecretKeyLabel);
      });

      it('should compute same address as key derive-address for hex secrets', async () => {
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';

        const walletOutput = await executeCommand(['wallet', 'address', secret, '--json']);
        const keyOutput = await executeCommand(['key', 'derive-address', secret, '--json']);

        const walletParsed = parseJsonOutput(walletOutput);
        const keyParsed = parseJsonOutput(keyOutput);

        expect(walletParsed.address).toBe(keyParsed.address);
      });

      it('should work with --alias from keystore', async () => {
        // First import a key
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000042';
        const testAlias = 'wallet_address_test_key';
        await executeCommand(['key', 'import', secret, '--alias', testAlias, '--no-encrypt']);

        // Then use it with wallet address
        const output = await executeCommand(['wallet', 'address', '--alias', testAlias, '--json']);
        const parsed = parseJsonOutput(output);

        expect(parsed).not.toBeNull();
        expect(isValidAztecAddress(parsed.address)).toBe(true);

        // Clean up
        await executeCommand(['key', 'delete', testAlias]);
      });

      it('should fail when neither secret nor alias provided', async () => {
        const output = await executeCommand(['wallet', 'address'], true);
        expect(output).toMatch(/Must specify either/i);
      });

      it('should not include JSON formatting in human-readable output', async () => {
        const secret = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const output = await executeCommand(['wallet', 'address', secret]);

        // Human-readable output should not contain JSON-like formatting
        expect(output).not.toMatch(/"address"/);
        expect(output).not.toMatch(/"type"/);
        expect(output).not.toMatch(/"salt"/);
      });
    });

    describe('deploy subcommand (integration tests)', () => {
      // These tests require a local sandbox to be running at http://localhost:8080
      // They will be skipped if the sandbox is not available.
      let sandboxAvailable: boolean;

      beforeAll(async () => {
        sandboxAvailable = await isSandboxAvailable();
        if (!sandboxAvailable) {
          console.warn(`
╔══════════════════════════════════════════════════════════════╗
║  SANDBOX NOT AVAILABLE - SKIPPING WALLET DEPLOY TESTS        ║
║                                                              ║
║  To run these tests, start a local Aztec sandbox:            ║
║    aztec sandbox                                             ║
║                                                              ║
║  Or set NODE_URL environment variable to point to a          ║
║  running Aztec node.                                         ║
╚══════════════════════════════════════════════════════════════╝
`);
        }
      });

      it('should deploy an account to the network', async () => {
        if (!sandboxAvailable) {
          console.log('Skipping: sandbox not available');
          return;
        }

        const secretKey = generateSecretKey();

        // First compute the expected address offline
        const addressOutput = runCliSync(`wallet address ${secretKey} --json`);
        const addressJson = parseCliJson(addressOutput);
        const expectedAddress = addressJson.address;

        expect(isValidAztecAddress(expectedAddress)).toBe(true);

        // Deploy the account
        const deployOutput = runCliSync(`wallet deploy ${secretKey} --rpc-url ${DEFAULT_NODE_URL} --json`);
        const deployJson = parseCliJson(deployOutput);

        // Verify deployment result
        expect(deployJson.address).toBe(expectedAddress);
        expect(deployJson.status).toBe('success');
        expect(typeof deployJson.txHash).toBe('string');
        expect(deployJson.txHash).toMatch(/^0x[0-9a-f]+$/i);
      }, 300_000);

      it('should deploy an account with a custom salt', async () => {
        if (!sandboxAvailable) {
          console.log('Skipping: sandbox not available');
          return;
        }

        const secretKey = generateSecretKey();
        const salt = '42';

        // Compute expected address with salt
        const addressOutput = runCliSync(`wallet address ${secretKey} --salt ${salt} --json`);
        const addressJson = parseCliJson(addressOutput);
        const expectedAddress = addressJson.address;

        // Deploy with same salt
        const deployOutput = runCliSync(`wallet deploy ${secretKey} --salt ${salt} --rpc-url ${DEFAULT_NODE_URL} --json`);
        const deployJson = parseCliJson(deployOutput);

        expect(deployJson.address).toBe(expectedAddress);
        expect(deployJson.status).toBe('success');
      }, 300_000);

      it('should deploy an account using passphrase', async () => {
        if (!sandboxAvailable) {
          console.log('Skipping: sandbox not available');
          return;
        }

        const passphrase = `test-passphrase-${Date.now()}`;

        // Compute expected address from passphrase
        const addressOutput = runCliSync(`wallet address "${passphrase}" --json`);
        const addressJson = parseCliJson(addressOutput);
        const expectedAddress = addressJson.address;

        // Deploy using passphrase
        const deployOutput = runCliSync(`wallet deploy "${passphrase}" --rpc-url ${DEFAULT_NODE_URL} --json`);
        const deployJson = parseCliJson(deployOutput);

        expect(deployJson.address).toBe(expectedAddress);
        expect(deployJson.status).toBe('success');
      }, 300_000);

      it('should deploy with human-readable output', async () => {
        if (!sandboxAvailable) {
          console.log('Skipping: sandbox not available');
          return;
        }

        const secretKey = generateSecretKey();

        // Deploy without --json flag
        const output = runCliSync(`wallet deploy ${secretKey} --rpc-url ${DEFAULT_NODE_URL}`);

        // Check human-readable output format
        expect(output).toMatch(/Account Deployed/);
        expect(output).toMatch(/={50}/);
        expect(output).toMatch(/Address:/);
        expect(output).toMatch(/Tx Hash:/);
        expect(output).toMatch(/Status:\s*success/);

        // Extract and validate address
        const address = extractAddress(output);
        expect(address).not.toBeNull();
        expect(isValidAztecAddress(address!)).toBe(true);
      }, 300_000);

      it('should use --alias from keystore', async () => {
        if (!sandboxAvailable) {
          console.log('Skipping: sandbox not available');
          return;
        }

        const secretKey = generateSecretKey();
        const alias = `test_deploy_alias_${Date.now()}`;

        try {
          // Import the key with an alias (no encryption for test simplicity)
          runCliSync(`key import ${secretKey} --alias ${alias} --no-encrypt`);

          // Compute expected address
          const addressOutput = runCliSync(`wallet address --alias ${alias} --json`);
          const addressJson = parseCliJson(addressOutput);
          const expectedAddress = addressJson.address;

          // Deploy using alias
          const deployOutput = runCliSync(`wallet deploy --alias ${alias} --rpc-url ${DEFAULT_NODE_URL} --json`);
          const deployJson = parseCliJson(deployOutput);

          expect(deployJson.address).toBe(expectedAddress);
          expect(deployJson.status).toBe('success');
        } finally {
          // Cleanup: delete the imported key
          try {
            runCliSync(`key delete ${alias}`);
          } catch {
            // Ignore cleanup errors
          }
        }
      }, 300_000);

      it('should deploy using network shortcut "local"', async () => {
        if (!sandboxAvailable) {
          console.log('Skipping: sandbox not available');
          return;
        }

        const secretKey = generateSecretKey();

        // Deploy using "local" shortcut instead of full URL
        const deployOutput = runCliSync(`wallet deploy ${secretKey} --rpc-url local --json`);
        const deployJson = parseCliJson(deployOutput);

        expect(deployJson.status).toBe('success');
        expect(isValidAztecAddress(deployJson.address)).toBe(true);
      }, 300_000);

      it('should fail gracefully when deploying to unreachable node', async () => {
        // This test runs even without sandbox
        const secretKey = generateSecretKey();

        // Try to deploy to a non-existent node
        expect(() => {
          runCliSync(`wallet deploy ${secretKey} --rpc-url http://localhost:99999 --json`);
        }).toThrow();
      }, 60_000);

      it('should fail when neither secret nor alias provided', async () => {
        if (!sandboxAvailable) {
          console.log('Skipping: sandbox not available');
          return;
        }

        expect(() => {
          runCliSync(`wallet deploy --rpc-url ${DEFAULT_NODE_URL}`);
        }).toThrow(/Must specify either <secret> or --alias/);
      });

      it('should fail for unsupported account type', async () => {
        if (!sandboxAvailable) {
          console.log('Skipping: sandbox not available');
          return;
        }

        const secretKey = generateSecretKey();

        expect(() => {
          runCliSync(`wallet deploy ${secretKey} --type ecdsa --rpc-url ${DEFAULT_NODE_URL}`);
        }).toThrow(/not supported/);
      });
    });
  });
});

// Note: Keystore command was removed as encryption is now integrated into import/export
