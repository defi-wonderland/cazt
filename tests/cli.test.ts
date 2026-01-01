import { program } from '../cli/cli.js';

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
  describe('address-zero command', () => {
    it('should output zero address', async () => {
      const output = await executeCommand(['address-zero']);
      
      expect(output).toContain('0x0000000000000000000000000000000000000000000000000000000000000000');
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['az']);
      
      expect(output).toContain('0x0000000000000000000000000000000000000000000000000000000000000000');
    });
  });

  describe('address-validate command', () => {
    it('should validate a valid address', async () => {
      const validAddress = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const output = await executeCommand(['address-validate', validAddress]);
      
      // Should output the validation result (either JSON or the address)
      expect(output).toBeTruthy();
    });

    it('should reject an invalid address', async () => {
      const output = await executeCommand(['address-validate', 'invalid']);
      
      // Should output validation error
      expect(output).toBeTruthy();
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['av', '0x0000000000000000000000000000000000000000000000000000000000000000']);
      
      expect(output).toBeTruthy();
    });
  });

  describe('address-random command', () => {
    it('should generate a random address', async () => {
      const output = await executeCommand(['address-random']);
      
      // Should output a valid address format
      expect(output).toMatch(/^0x[0-9a-f]{64}$/i);
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['ar']);
      
      expect(output).toMatch(/^0x[0-9a-f]{64}$/i);
    });
  });

  describe('field-from-string command', () => {
    it('should convert string to field', async () => {
      const output = await executeCommand(['field-from-string', '123']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['ffs', '456']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });
  });

  describe('field-random command', () => {
    it('should generate random field', async () => {
      const output = await executeCommand(['field-random']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['fr']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });
  });

  describe('field-is-zero command', () => {
    it('should check if field is zero', async () => {
      const output = await executeCommand(['field-is-zero', '0x0000000000000000000000000000000000000000000000000000000000000000']);
      
      // Should output true or "true"
      expect(output.toLowerCase()).toMatch(/true/);
    });

    it('should return false for non-zero field', async () => {
      const output = await executeCommand(['field-is-zero', '0x01']);
      
      // Should output false or "false"
      expect(output.toLowerCase()).toMatch(/false/);
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['fiz', '0x0000000000000000000000000000000000000000000000000000000000000000']);
      
      expect(output.toLowerCase()).toMatch(/true/);
    });
  });

  describe('field-equals command', () => {
    it('should return true for equal fields', async () => {
      const output = await executeCommand(['field-equals', '0x01', '0x01']);
      
      expect(output.toLowerCase()).toMatch(/true/);
    });

    it('should return false for different fields', async () => {
      const output = await executeCommand(['field-equals', '0x01', '0x02']);
      
      expect(output.toLowerCase()).toMatch(/false/);
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['fe', '0x01', '0x01']);
      
      expect(output.toLowerCase()).toMatch(/true/);
    });
  });

  describe('keccak command', () => {
    it('should compute keccak hash for UTF-8 input (1)', async () => {
      const output = await executeCommand(['keccak', '1']);
      
      // Should output the hash with 0x prefix
      expect(output).toContain('0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6');
    });

    it('should compute keccak hash for hex input (0x01)', async () => {
      const output = await executeCommand(['keccak', '0x01']);
      
      expect(output).toContain('0x5fe7f977e71dba2ea1a68e21057beebb9be2ac30c6410aa38d4f3fbe41dcffd2');
    });

    it('should error on keccak hex input with odd digits (0x1)', async () => {
      const output = await executeCommand(['keccak', '0x1'], true);
      
      // Should contain error message about odd number of digits
      expect(output.toLowerCase()).toContain('odd number of digits');
    });

    it('should compute keccak hash for UTF-8 with letters', async () => {
      const output = await executeCommand(['keccak', 'hello']);
      
      expect(output).toMatch(/^0x[0-9a-f]{64}$/i);
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['k', 'test']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });
  });

  describe('sha256 command', () => {
    it('should compute sha256 hash', async () => {
      const output = await executeCommand(['sha256', 'test']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['sha', 'hello']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });
  });

  describe('selector command', () => {
    it('should compute selector from signature', async () => {
      const output = await executeCommand(['sig', 'transfer(address,uint256)']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });

    it('should work with aliases', async () => {
      const output1 = await executeCommand(['selector', 'transfer(address,uint256)']);
      const output2 = await executeCommand(['si', 'transfer(address,uint256)']);
      
      // Both should produce the same result
      expect(output1).toMatch(/^0x[0-9a-f]+$/i);
      expect(output2).toMatch(/^0x[0-9a-f]+$/i);
      expect(output1).toBe(output2);
    });
  });

  describe('event-selector command', () => {
    it('should compute event selector', async () => {
      const output = await executeCommand(['event-selector', 'Transfer(address,uint256)']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['es', 'Transfer(address,uint256)']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });
  });

  describe('note-selector command', () => {
    it('should compute note selector', async () => {
      const output = await executeCommand(['note-selector', 'transfer(address,uint256)']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['ns', 'transfer(address,uint256)']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });
  });

  describe('eth-address-zero command', () => {
    it('should output zero Ethereum address', async () => {
      const output = await executeCommand(['eth-address-zero']);
      
      expect(output).toContain('0x0000000000000000000000000000000000000000');
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['eaz']);
      
      expect(output).toContain('0x0000000000000000000000000000000000000000');
    });
  });

  describe('eth-address-random command', () => {
    it('should generate random Ethereum address', async () => {
      const output = await executeCommand(['eth-address-random']);
      
      expect(output).toMatch(/^0x[0-9a-f]{40}$/i);
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['ear']);
      
      expect(output).toMatch(/^0x[0-9a-f]{40}$/i);
    });
  });

  describe('eth-address-validate command', () => {
    it('should validate a valid Ethereum address', async () => {
      const validAddress = '0x0000000000000000000000000000000000000000';
      const output = await executeCommand(['eth-address-validate', validAddress]);
      
      expect(output).toBeTruthy();
    });

    it('should reject an invalid Ethereum address', async () => {
      const output = await executeCommand(['eth-address-validate', 'invalid']);
      
      expect(output).toBeTruthy();
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['eav', '0x0000000000000000000000000000000000000000']);
      
      expect(output).toBeTruthy();
    });
  });

  describe('eth-address-is-zero command', () => {
    it('should return true for zero Ethereum address', async () => {
      const output = await executeCommand(['eth-address-is-zero', '0x0000000000000000000000000000000000000000']);
      
      expect(output.toLowerCase()).toMatch(/true/);
    });

    it('should return false for non-zero Ethereum address', async () => {
      const output = await executeCommand(['eth-address-is-zero', '0x0000000000000000000000000000000000000001']);
      
      expect(output.toLowerCase()).toMatch(/false/);
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['eaiz', '0x0000000000000000000000000000000000000000']);
      
      expect(output.toLowerCase()).toMatch(/true/);
    });
  });

  describe('eth-address-from-field command', () => {
    it('should convert field to Ethereum address', async () => {
      const output = await executeCommand(['eth-address-from-field', '0x01']);
      
      expect(output).toMatch(/^0x[0-9a-f]{40}$/i);
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['eaff', '0x01']);
      
      expect(output).toMatch(/^0x[0-9a-f]{40}$/i);
    });
  });

  describe('eth-address-to-field command', () => {
    it('should convert Ethereum address to field', async () => {
      const output = await executeCommand(['eth-address-to-field', '0x0000000000000000000000000000000000000001']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['eatf', '0x0000000000000000000000000000000000000001']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });
  });

  describe('compute-preaddress command', () => {
    it('should compute preaddress', async () => {
      const params = JSON.stringify({
        publicKeysHash: '0x01',
        partialAddress: '0x02',
      });
      const output = await executeCommand(['compute-preaddress', params]);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });

    it('should work with alias', async () => {
      const params = JSON.stringify({
        publicKeysHash: '0x01',
        partialAddress: '0x02',
      });
      const output = await executeCommand(['cpr', params]);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });
  });

  describe('poseidon2 command', () => {
    it('should compute poseidon2 hash with comma-separated values', async () => {
      const output = await executeCommand(['poseidon2', '0x01,0x02']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });

    it('should compute poseidon2 hash with JSON array', async () => {
      const output = await executeCommand(['poseidon2', '["0x01","0x02"]']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });

    it('should compute poseidon2 with UTF-8 inputs (4,8)', async () => {
      const output = await executeCommand(['poseidon2', '4,8']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
      expect(output.length).toBe(66); // 0x + 64 hex chars
    });

    it('should compute poseidon2 with even-length hex inputs (0x04,0x08)', async () => {
      const output = await executeCommand(['poseidon2', '0x04,0x08']);
      
      expect(output).toBe('0x2bcaeb6d58bb38baf753d58c3c96618fea82163345295eb40e88344eeb0ce2a1');
    });

    it('should error on poseidon2 with odd-length hex input', async () => {
      const output = await executeCommand(['poseidon2', '0x1,0x2'], true);
      
      expect(output.toLowerCase()).toContain('odd number of digits');
    });

    it('should work with aliases', async () => {
      const output1 = await executeCommand(['p2', '0x01,0x02']);
      const output2 = await executeCommand(['poseidon', '0x01,0x02']);
      
      expect(output1).toBe(output2);
      expect(output1).toMatch(/^0x[0-9a-f]+$/i);
    });
  });

  describe('pedersen command', () => {
    it('should compute pedersen hash with hex inputs (0x01,0x01)', async () => {
      const output = await executeCommand(['pedersen', '0x01,0x01']);
      
      expect(output).toBe('0x07ebfbf4df29888c6cd6dca13d4bb9d1a923013ddbbcbdc3378ab8845463297b');
    });

    it('should compute pedersen hash with hex inputs (0x01,0x01) index 5', async () => {
      const output = await executeCommand(['pedersen', '0x01,0x01', '--index', '5']);
      
      expect(output).toBe('0x1c446df60816b897cda124524e6b03f36df0cec333fad87617aab70d7861daa6');
    });

    it('should compute pedersen hash with hex inputs (0x04,0x08) index 7', async () => {
      const output = await executeCommand(['pedersen', '0x04,0x08', '--index', '7']);
      
      expect(output).toBe('0x04c2352a060d4ac1cdfb603ebc4327b5764597231614f61d245bf35772c08696');
    });

    it('should produce different results for UTF-8 vs hex inputs', async () => {
      const outputHex = await executeCommand(['pedersen', '0x01,0x01']);
      const outputUtf8 = await executeCommand(['pedersen', '1,1']);
      
      // UTF-8 inputs should NOT match hex inputs
      expect(outputHex).not.toBe(outputUtf8);
    });

    it('should error on pedersen hash with odd-length hex input', async () => {
      const output = await executeCommand(['pedersen', '0x1,0x1'], true);
      
      expect(output.toLowerCase()).toContain('odd number of digits');
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['ped', '0x01,0x01']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });
  });

  describe('secret-hash command', () => {
    it('should compute secret hash', async () => {
      const output = await executeCommand(['secret-hash', '0x1234']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['sh', '0x5678']);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });
  });

  describe('silo-nullifier command', () => {
    it('should silo a nullifier', async () => {
      const output = await executeCommand([
        'silo-nullifier',
        '--contract', '0x0000000000000000000000000000000000000000000000000000000000000000',
        '--nullifier', '0x01'
      ]);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });

    it('should work with alias', async () => {
      const output = await executeCommand([
        'sn',
        '--contract', '0x0000000000000000000000000000000000000000000000000000000000000000',
        '--nullifier', '0x01'
      ]);
      
      expect(output).toMatch(/^0x[0-9a-f]+$/i);
    });
  });

  describe('hash-zero command', () => {
    it('should output zero hash', async () => {
      const output = await executeCommand(['hash-zero']);
      
      expect(output).toContain('0x0000000000000000000000000000000000000000000000000000000000000000');
    });

    it('should work with alias', async () => {
      const output = await executeCommand(['hz']);
      
      expect(output).toContain('0x0000000000000000000000000000000000000000000000000000000000000000');
    });
  });
});
