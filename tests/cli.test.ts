import { program } from '../cli/cli.js';
import {
  isValidFieldElement,
  extractSecretKey,
  extractWarning,
  areKeysDifferent,
  KEY_TEST_VECTORS,
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
  });
});
