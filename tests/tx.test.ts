import {
  TX_METADATA_TEST_VECTORS,
  generateRandomTxHash,
  extractMetadataLabel,
  extractMetadataDescription,
  extractMetadataTags,
  extractMetadataTotal,
  parseJsonOutput,
  isValidTxMetadataAddJson,
  isValidTxMetadataGetJson,
  isValidTxMetadataListJson,
  isValidTxMetadataUpdateJson,
  isValidTxMetadataDeleteJson,
  setupConsoleMock,
  teardownConsoleMock,
  executeCommand,
} from './utils.js';
import { TxMetadataStore } from '../cli/storage/tx-metadata-store.js';

// Enable test mode - this makes TxMetadataStore use ~/.cazt/tx-metadata_test/
process.env.NODE_ENV = 'test';
process.env.CAZT_TEST_MODE = 'true';

// Clear test metadata store before all tests
beforeAll(async () => {
  const store = await TxMetadataStore.open();
  await store.clear();
  await store.close();
});

// Clear test metadata store after all tests
afterAll(async () => {
  const store = await TxMetadataStore.open();
  await store.clear();
  await store.close();
});

beforeEach(() => {
  setupConsoleMock();
});

afterEach(() => {
  teardownConsoleMock();
});

describe('tx metadata command', () => {
  const TEST_PASSWORD = 'test-metadata-password-123';
  let testTxHash: string;

  beforeEach(async () => {
    testTxHash = generateRandomTxHash();
  });

  describe('add subcommand', () => {
    it('should add encrypted metadata with password flag', async () => {
      const output = await executeCommand([
        'tx', 'metadata', 'add', testTxHash,
        '--label', 'Test Label',
        '--password', TEST_PASSWORD,
      ]);

      expect(output).toMatch(TX_METADATA_TEST_VECTORS.patterns.add.header);
      expect(output).toMatch(TX_METADATA_TEST_VECTORS.patterns.add.separator);
      expect(output).toMatch(/Encrypted:\s*yes/);
      expect(output).toMatch(/WARNING:/);

      const label = extractMetadataLabel(output);
      expect(label).toBe('Test Label');
    });

    it('should add metadata with all fields', async () => {
      const output = await executeCommand([
        'tx', 'metadata', 'add', testTxHash,
        '--label', 'Full Entry',
        '--description', 'A complete metadata entry',
        '--tags', 'test,complete,all-fields',
        '--contract', '0x' + 'a'.repeat(40),
        '--password', TEST_PASSWORD,
      ]);

      expect(output).toMatch(TX_METADATA_TEST_VECTORS.patterns.add.header);
      expect(output).toMatch(/Label:\s*Full Entry/);
      expect(output).toMatch(/Tags:\s*test, complete, all-fields/);
    });

    it('should add plaintext metadata with --no-encrypt', async () => {
      const output = await executeCommand([
        'tx', 'metadata', 'add', testTxHash,
        '--label', 'Plaintext Entry',
        '--no-encrypt',
      ]);

      expect(output).toMatch(TX_METADATA_TEST_VECTORS.patterns.add.header);
      expect(output).toMatch(/Encrypted:\s*no/);
    });

    it('should fail when adding duplicate entry', async () => {
      // Add first entry
      await executeCommand([
        'tx', 'metadata', 'add', testTxHash,
        '--label', 'First',
        '--password', TEST_PASSWORD,
      ]);

      // Try to add duplicate
      const output = await executeCommand([
        'tx', 'metadata', 'add', testTxHash,
        '--label', 'Duplicate',
        '--password', TEST_PASSWORD,
      ], true);

      expect(output).toMatch(/already exists/i);
    });

    it('should output JSON with --json flag', async () => {
      const output = await executeCommand([
        '--json',
        'tx', 'metadata', 'add', testTxHash,
        '--label', 'JSON Test',
        '--password', TEST_PASSWORD,
      ]);

      const json = parseJsonOutput(output);
      expect(json).not.toBeNull();
      expect(isValidTxMetadataAddJson(json)).toBe(true);
      expect(json.encrypted).toBe(true);
    });
  });

  describe('get subcommand', () => {
    beforeEach(async () => {
      // Add test entry
      await executeCommand([
        'tx', 'metadata', 'add', testTxHash,
        '--label', 'Get Test',
        '--description', 'Description for get test',
        '--tags', 'get,test',
        '--password', TEST_PASSWORD,
      ]);
    });

    it('should retrieve and decrypt metadata', async () => {
      const output = await executeCommand([
        'tx', 'metadata', 'get', testTxHash,
        '--password', TEST_PASSWORD,
      ]);

      expect(output).toMatch(TX_METADATA_TEST_VECTORS.patterns.get.header);
      expect(output).toMatch(TX_METADATA_TEST_VECTORS.patterns.get.separator);

      const label = extractMetadataLabel(output);
      expect(label).toBe('Get Test');

      const description = extractMetadataDescription(output);
      expect(description).toBe('Description for get test');

      const tags = extractMetadataTags(output);
      expect(tags).toContain('get');
      expect(tags).toContain('test');
    });

    it('should fail with wrong password', async () => {
      const output = await executeCommand([
        'tx', 'metadata', 'get', testTxHash,
        '--password', 'wrong-password',
      ], true);

      expect(output).toMatch(/Invalid password/i);
    });

    it('should return not found for unknown tx', async () => {
      const unknownHash = generateRandomTxHash();
      const output = await executeCommand([
        'tx', 'metadata', 'get', unknownHash,
        '--password', TEST_PASSWORD,
      ]);

      expect(output).toMatch(/not found|No metadata/i);
    });

    it('should output JSON with --json flag', async () => {
      const output = await executeCommand([
        '--json',
        'tx', 'metadata', 'get', testTxHash,
        '--password', TEST_PASSWORD,
      ]);

      const json = parseJsonOutput(output);
      expect(json).not.toBeNull();
      expect(isValidTxMetadataGetJson(json)).toBe(true);
      expect(json.label).toBe('Get Test');
    });
  });

  describe('list subcommand', () => {
    let hash1: string, hash2: string, hash3: string;

    beforeEach(async () => {
      // Add multiple test entries
      hash1 = generateRandomTxHash();
      hash2 = generateRandomTxHash();
      hash3 = generateRandomTxHash();

      await executeCommand([
        'tx', 'metadata', 'add', hash1,
        '--label', 'Entry One',
        '--tags', 'defi,swap',
        '--password', TEST_PASSWORD,
      ]);

      await executeCommand([
        'tx', 'metadata', 'add', hash2,
        '--label', 'Entry Two',
        '--tags', 'nft',
        '--contract', '0x' + 'b'.repeat(40),
        '--password', TEST_PASSWORD,
      ]);

      await executeCommand([
        'tx', 'metadata', 'add', hash3,
        '--label', 'Entry Three',
        '--tags', 'defi,lending',
        '--password', TEST_PASSWORD,
      ]);
    });

    it('should list entries without password', async () => {
      const output = await executeCommand(['tx', 'metadata', 'list']);

      expect(output).toMatch(TX_METADATA_TEST_VECTORS.patterns.list.header);
      expect(output).toMatch(/Entry One/);
      expect(output).toMatch(/Entry Two/);
      expect(output).toMatch(/Entry Three/);

      const total = extractMetadataTotal(output);
      expect(total).toBeGreaterThanOrEqual(3);
    });

    it('should filter by tag', async () => {
      const output = await executeCommand([
        'tx', 'metadata', 'list',
        '--tag', 'defi',
      ]);

      expect(output).toMatch(/Entry One/);
      expect(output).toMatch(/Entry Three/);
      // Entry Two has 'nft' tag, not 'defi'
    });

    it('should filter by contract', async () => {
      const output = await executeCommand([
        'tx', 'metadata', 'list',
        '--contract', '0x' + 'b'.repeat(40),
      ]);

      expect(output).toMatch(/Entry Two/);
    });

    it('should respect limit option', async () => {
      const output = await executeCommand([
        'tx', 'metadata', 'list',
        '--limit', '2',
      ]);

      expect(output).toMatch(/Total:/);
    });

    it('should output JSON with --json flag', async () => {
      const output = await executeCommand([
        '--json',
        'tx', 'metadata', 'list',
      ]);

      const json = parseJsonOutput(output);
      expect(json).not.toBeNull();
      expect(isValidTxMetadataListJson(json)).toBe(true);
      expect(json.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('update subcommand', () => {
    beforeEach(async () => {
      await executeCommand([
        'tx', 'metadata', 'add', testTxHash,
        '--label', 'Original Label',
        '--description', 'Original description',
        '--tags', 'original,tags',
        '--password', TEST_PASSWORD,
      ]);
    });

    it('should update label', async () => {
      const output = await executeCommand([
        'tx', 'metadata', 'update', testTxHash,
        '--label', 'Updated Label',
        '--password', TEST_PASSWORD,
      ]);

      expect(output).toMatch(TX_METADATA_TEST_VECTORS.patterns.update.header);
      expect(output).toMatch(/Updated fields:.*label/);

      // Verify update
      const getOutput = await executeCommand([
        'tx', 'metadata', 'get', testTxHash,
        '--password', TEST_PASSWORD,
      ]);
      expect(getOutput).toMatch(/Label:\s*Updated Label/);
      // Description should be preserved
      expect(getOutput).toMatch(/Description:\s*Original description/);
    });

    it('should update tags', async () => {
      await executeCommand([
        'tx', 'metadata', 'update', testTxHash,
        '--tags', 'new,updated,tags',
        '--password', TEST_PASSWORD,
      ]);

      const getOutput = await executeCommand([
        'tx', 'metadata', 'get', testTxHash,
        '--password', TEST_PASSWORD,
      ]);

      const tags = extractMetadataTags(getOutput);
      expect(tags).toContain('new');
      expect(tags).toContain('updated');
      expect(tags).not.toContain('original');
    });

    it('should fail with wrong password', async () => {
      const output = await executeCommand([
        'tx', 'metadata', 'update', testTxHash,
        '--label', 'Should Fail',
        '--password', 'wrong-password',
      ], true);

      expect(output).toMatch(/Invalid password/i);
    });

    it('should fail for non-existent entry', async () => {
      const unknownHash = generateRandomTxHash();
      const output = await executeCommand([
        'tx', 'metadata', 'update', unknownHash,
        '--label', 'Should Fail',
        '--password', TEST_PASSWORD,
      ], true);

      expect(output).toMatch(/not found|No metadata/i);
    });

    it('should require at least one update field', async () => {
      const output = await executeCommand([
        'tx', 'metadata', 'update', testTxHash,
        '--password', TEST_PASSWORD,
      ], true);

      expect(output).toMatch(/At least one update field must be provided/i);
    });

    it('should output JSON with --json flag', async () => {
      const output = await executeCommand([
        '--json',
        'tx', 'metadata', 'update', testTxHash,
        '--label', 'JSON Update',
        '--password', TEST_PASSWORD,
      ]);

      const json = parseJsonOutput(output);
      expect(json).not.toBeNull();
      expect(isValidTxMetadataUpdateJson(json)).toBe(true);
      expect(json.fields).toContain('label');
    });
  });

  describe('delete subcommand', () => {
    beforeEach(async () => {
      await executeCommand([
        'tx', 'metadata', 'add', testTxHash,
        '--label', 'To Delete',
        '--password', TEST_PASSWORD,
      ]);
    });

    it('should delete metadata with --force', async () => {
      const output = await executeCommand([
        'tx', 'metadata', 'delete', testTxHash,
        '--force',
      ]);

      expect(output).toMatch(TX_METADATA_TEST_VECTORS.patterns.delete.header);
      expect(output).toMatch(/Transaction:/);

      // Verify deletion - entry should no longer be found
      const getOutput = await executeCommand([
        'tx', 'metadata', 'get', testTxHash,
        '--password', TEST_PASSWORD,
      ]);
      expect(getOutput).toMatch(/not found|No metadata/i);
    });

    it('should report not found for unknown tx', async () => {
      const unknownHash = generateRandomTxHash();
      const output = await executeCommand([
        'tx', 'metadata', 'delete', unknownHash,
        '--force',
      ]);

      expect(output).toMatch(/not found|No metadata/i);
    });

    it('should output JSON with --json flag', async () => {
      const output = await executeCommand([
        '--json',
        'tx', 'metadata', 'delete', testTxHash,
        '--force',
      ]);

      const json = parseJsonOutput(output);
      expect(json).not.toBeNull();
      expect(isValidTxMetadataDeleteJson(json)).toBe(true);
      expect(json.deleted).toBe(true);
    });
  });
});
