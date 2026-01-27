import { promises as fs } from 'fs';
import * as path from 'path';
import { getCaztDir, isTestMode, ensureDir } from './paths.js';

/**
 * Interface for stored key data
 */
export interface StoredKey {
  alias: string;
  secret: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Interface for keystore file format
 */
interface KeyStoreData {
  version: string;
  keys: Record<string, StoredKey>;
}

/**
 * KeyStore manages local storage of secret keys with aliases
 * Keys are stored in ~/.cazt/keys.json with proper permissions
 *
 * In test mode (NODE_ENV=test or CAZT_TEST_MODE=true), keys are stored
 * in ~/.cazt/keys_test.json to prevent accidentally wiping real keys
 */
export class KeyStore {
  private static readonly DEFAULT_FILE = 'keys.json';
  private static readonly VERSION = '1.0.0';
  private static readonly FILE_MODE = 0o600; // Read/write for owner only

  // Configurable paths for testing
  private static _customDir: string | null = null;
  private static _customFile: string | null = null;

  /**
   * Set custom keystore directory and filename (for testing)
   * @param dir - Custom directory path (null to reset to default)
   * @param filename - Custom filename (null to reset to default)
   */
  static setCustomPath(dir: string | null, filename: string | null = null): void {
    KeyStore._customDir = dir;
    KeyStore._customFile = filename;
  }

  /**
   * Reset to default keystore path
   */
  static resetPath(): void {
    KeyStore._customDir = null;
    KeyStore._customFile = null;
  }

  private static get CAZT_DIR(): string {
    return KeyStore._customDir ?? getCaztDir();
  }

  private static get KEYS_FILE(): string {
    const filename = KeyStore._customFile ?? KeyStore.DEFAULT_FILE;
    return path.join(KeyStore.CAZT_DIR, filename);
  }

  /**
   * Gets the keys file path based on test mode
   */
  private static getKeysFile(): string {
    const filename = isTestMode() ? 'keys_test.json' : 'keys.json';
    return path.join(getCaztDir(), filename);
  }

  /**
   * Validates that an alias follows naming rules
   * - Alphanumeric, underscore, dash allowed
   * - Must start with letter or underscore
   * - 1-64 characters
   */
  static isValidAlias(alias: string): boolean {
    const aliasPattern = /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/;
    return aliasPattern.test(alias);
  }

  /**
   * Ensures the appropriate .cazt directory exists with proper permissions
   */
  private static async ensureDirectory(): Promise<void> {
    await ensureDir(getCaztDir());
  }

  /**
   * Reads the keystore file, creating it if it doesn't exist
   */
  private static async readKeyStore(): Promise<KeyStoreData> {
    await KeyStore.ensureDirectory();

    try {
      const data = await fs.readFile(KeyStore.getKeysFile(), 'utf-8');
      const parsed = JSON.parse(data);

      // Validate structure
      if (!parsed.version || !parsed.keys || typeof parsed.keys !== 'object') {
        throw new Error('Invalid keystore format');
      }

      return parsed as KeyStoreData;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create empty keystore
        const emptyStore: KeyStoreData = {
          version: KeyStore.VERSION,
          keys: {},
        };
        await KeyStore.writeKeyStore(emptyStore);
        return emptyStore;
      }
      throw new Error(`Failed to read keystore: ${error.message}`);
    }
  }

  /**
   * Writes the keystore file with proper permissions
   */
  private static async writeKeyStore(data: KeyStoreData): Promise<void> {
    await KeyStore.ensureDirectory();

    const json = JSON.stringify(data, null, 2);
    await fs.writeFile(KeyStore.getKeysFile(), json, { mode: KeyStore.FILE_MODE });
  }

  /**
   * Saves a secret key with an alias
   * @throws Error if alias is invalid or already exists (unless force=true)
   */
  static async save(alias: string, secret: string, force: boolean = false): Promise<void> {
    if (!KeyStore.isValidAlias(alias)) {
      throw new Error(
        `Invalid alias '${alias}'. Must start with letter/underscore, contain only alphanumeric/underscore/dash, and be 1-64 characters.`
      );
    }

    const store = await KeyStore.readKeyStore();

    if (store.keys[alias] && !force) {
      throw new Error(
        `Alias '${alias}' already exists. Use --force to overwrite.`
      );
    }

    const now = new Date().toISOString();
    const isUpdate = !!store.keys[alias];

    store.keys[alias] = {
      alias,
      secret,
      createdAt: isUpdate ? store.keys[alias].createdAt : now,
      updatedAt: now,
    };

    await KeyStore.writeKeyStore(store);
  }

  /**
   * Loads a secret key by alias
   * @throws Error if alias doesn't exist
   */
  static async load(alias: string): Promise<StoredKey> {
    const store = await KeyStore.readKeyStore();

    if (!store.keys[alias]) {
      throw new Error(`Alias '${alias}' not found in keystore.`);
    }

    return store.keys[alias];
  }

  /**
   * Checks if an alias exists in the keystore
   */
  static async exists(alias: string): Promise<boolean> {
    const store = await KeyStore.readKeyStore();
    return !!store.keys[alias];
  }

  /**
   * Lists all stored aliases
   */
  static async list(): Promise<StoredKey[]> {
    const store = await KeyStore.readKeyStore();
    return Object.values(store.keys).sort((a, b) => a.alias.localeCompare(b.alias));
  }

  /**
   * Removes an alias from the keystore
   * @throws Error if alias doesn't exist
   */
  static async remove(alias: string): Promise<void> {
    const store = await KeyStore.readKeyStore();

    if (!store.keys[alias]) {
      throw new Error(`Alias '${alias}' not found in keystore.`);
    }

    delete store.keys[alias];
    await KeyStore.writeKeyStore(store);
  }

  /**
   * Gets the keystore file path for display purposes
   */
  static getKeysFilePath(): string {
    return KeyStore.getKeysFile();
  }

  /**
   * Clears all keys from the keystore (for testing purposes)
   */
  static async clear(): Promise<void> {
    const emptyStore: KeyStoreData = {
      version: KeyStore.VERSION,
      keys: {},
    };
    await KeyStore.writeKeyStore(emptyStore);
  }
}
