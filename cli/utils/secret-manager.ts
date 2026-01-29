/**
 * Unified Secret Manager
 *
 * Manages both encrypted (keystore files) and unencrypted secrets.
 * All secrets are stored in ~/.cazt/keystores/:
 * - Encrypted: ~/.cazt/keystores/<alias> (keystore file format)
 * - Unencrypted: ~/.cazt/keystores/keys.json
 *
 * Default behavior is encrypted storage for security.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { EncryptedKeystore } from './encrypted-keystore.js';
import { promptPassword } from './password.js';
import { getKeystoresDir as sharedGetKeystoresDir, ensureDir, isTestMode } from './paths.js';

/**
 * Stored secret metadata
 */
export interface SecretInfo {
  alias: string;
  encrypted: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Result of resolving a secret
 */
export interface ResolvedSecret {
  alias: string;
  secret: string;
  encrypted: boolean;
}

/**
 * Interface for unencrypted keys storage
 */
interface PlainKeysData {
  version: string;
  keys: Record<string, {
    alias: string;
    secret: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

/**
 * Unified Secret Manager
 */
export class SecretManager {
  private static readonly VERSION = '1.0.0';
  private static readonly FILE_MODE = 0o600;
  private static readonly DIR_MODE = 0o700;

  // Configurable base directory for testing
  private static _customDir: string | null = null;

  /**
   * Set custom base directory (for testing)
   */
  static setCustomDir(dir: string | null): void {
    SecretManager._customDir = dir;
  }

  /**
   * Reset to default directory
   */
  static resetDir(): void {
    SecretManager._customDir = null;
  }

  /**
   * Get the base keystores directory
   */
  static getKeystoresDir(): string {
    if (SecretManager._customDir) {
      return SecretManager._customDir;
    }
    return sharedGetKeystoresDir();
  }

  /**
   * Get path to encrypted keystore file for an alias
   */
  private static getEncryptedPath(alias: string): string {
    return path.join(SecretManager.getKeystoresDir(), alias);
  }

  /**
   * Get path to unencrypted keys.json
   */
  private static getPlainKeysPath(): string {
    return path.join(SecretManager.getKeystoresDir(), 'keys.json');
  }

  /**
   * Validates alias naming rules
   */
  static isValidAlias(alias: string): boolean {
    const aliasPattern = /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/;
    return aliasPattern.test(alias);
  }

  /**
   * Ensure keystores directory exists
   */
  private static async ensureDirectory(): Promise<void> {
    await ensureDir(SecretManager.getKeystoresDir());
  }

  /**
   * Read unencrypted keys storage
   */
  private static async readPlainKeys(): Promise<PlainKeysData> {
    await SecretManager.ensureDirectory();

    try {
      const data = await fs.readFile(SecretManager.getPlainKeysPath(), 'utf-8');
      const parsed = JSON.parse(data);

      if (!parsed.version || !parsed.keys || typeof parsed.keys !== 'object') {
        throw new Error('Invalid keys.json format');
      }

      return parsed as PlainKeysData;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { version: SecretManager.VERSION, keys: {} };
      }
      throw error;
    }
  }

  /**
   * Write unencrypted keys storage
   */
  private static async writePlainKeys(data: PlainKeysData): Promise<void> {
    await SecretManager.ensureDirectory();
    const json = JSON.stringify(data, null, 2);
    await fs.writeFile(SecretManager.getPlainKeysPath(), json, { mode: SecretManager.FILE_MODE });
  }

  /**
   * Check if an encrypted keystore exists for an alias
   */
  private static async hasEncrypted(alias: string): Promise<boolean> {
    try {
      const filePath = SecretManager.getEncryptedPath(alias);
      await fs.access(filePath);
      return await EncryptedKeystore.isValidKeystore(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Check if an unencrypted key exists for an alias
   */
  private static async hasPlain(alias: string): Promise<boolean> {
    const data = await SecretManager.readPlainKeys();
    return !!data.keys[alias];
  }

  /**
   * Check if an alias exists (encrypted or unencrypted)
   */
  static async exists(alias: string): Promise<{ exists: boolean; encrypted?: boolean }> {
    if (await SecretManager.hasEncrypted(alias)) {
      return { exists: true, encrypted: true };
    }
    if (await SecretManager.hasPlain(alias)) {
      return { exists: true, encrypted: false };
    }
    return { exists: false };
  }

  /**
   * Import a secret (encrypted by default)
   *
   * @param alias - Name for the secret
   * @param secret - The secret value
   * @param options - Import options
   */
  static async import(
    alias: string,
    secret: string,
    options: {
      encrypted?: boolean;
      password?: string;
      force?: boolean;
    } = {}
  ): Promise<{ path: string; encrypted: boolean }> {
    const { encrypted = true, password, force = false } = options;

    if (!SecretManager.isValidAlias(alias)) {
      throw new Error(
        `Invalid alias '${alias}'. Must start with letter/underscore, contain only alphanumeric/underscore/dash, and be 1-64 characters.`
      );
    }

    // Check if alias already exists
    const existing = await SecretManager.exists(alias);
    if (existing.exists && !force) {
      const type = existing.encrypted ? 'encrypted' : 'unencrypted';
      throw new Error(`Alias '${alias}' already exists (${type}). Use --force to overwrite.`);
    }

    // If overwriting, delete the old one first (might be different type)
    if (existing.exists && force) {
      await SecretManager.delete(alias);
    }

    await SecretManager.ensureDirectory();

    if (encrypted) {
      // Get password for encryption
      let pwd: string;

      if (password !== undefined) {
        // Password provided via --password option (can be empty)
        pwd = password;
      } else {
        // Prompt for password interactively
        const { promptPasswordWithConfirm } = await import('./password.js');
        pwd = await promptPasswordWithConfirm('Enter password: ', 'Confirm password: ');

        // Confirm if user entered empty password interactively
        if (pwd.length === 0) {
          const { promptConfirm } = await import('./password.js');
          const confirmed = await promptConfirm('Warning: Empty password provides no security. Continue? (y/N): ');
          if (!confirmed) {
            throw new Error('Import cancelled');
          }
        }
      }

      const filePath = SecretManager.getEncryptedPath(alias);
      await EncryptedKeystore.create(secret, pwd, filePath);

      return { path: filePath, encrypted: true };
    } else {
      // Store unencrypted
      const data = await SecretManager.readPlainKeys();
      const now = new Date().toISOString();

      data.keys[alias] = {
        alias,
        secret,
        createdAt: now,
        updatedAt: now,
      };

      await SecretManager.writePlainKeys(data);

      return { path: SecretManager.getPlainKeysPath(), encrypted: false };
    }
  }

  /**
   * Export/retrieve a secret by alias
   * Prompts for password if encrypted
   *
   * @param alias - The alias to retrieve
   * @param password - Optional password (for encrypted, will prompt if not provided)
   */
  static async export(alias: string, password?: string): Promise<ResolvedSecret> {
    const status = await SecretManager.exists(alias);

    if (!status.exists) {
      throw new Error(`Alias '${alias}' not found.`);
    }

    if (status.encrypted) {
      // Decrypt keystore
      let pwd = password;
      if (pwd === undefined) {
        pwd = await promptPassword('Enter password: ');
      }

      // Allow empty passwords for decryption (if the keystore was created with one)
      const filePath = SecretManager.getEncryptedPath(alias);
      const result = await EncryptedKeystore.decrypt(filePath, pwd);

      return {
        alias,
        secret: result.secret,
        encrypted: true,
      };
    } else {
      // Read from plain keys
      const data = await SecretManager.readPlainKeys();
      const entry = data.keys[alias];

      if (!entry) {
        throw new Error(`Alias '${alias}' not found.`);
      }

      return {
        alias,
        secret: entry.secret,
        encrypted: false,
      };
    }
  }

  /**
   * Resolve a secret by alias (for use in other commands)
   * This is the main entry point for --alias resolution
   */
  static async resolve(alias: string, password?: string): Promise<string> {
    const result = await SecretManager.export(alias, password);
    return result.secret;
  }

  /**
   * List all secrets (both encrypted and unencrypted)
   */
  static async list(): Promise<SecretInfo[]> {
    await SecretManager.ensureDirectory();
    const secrets: SecretInfo[] = [];

    // Get encrypted keystores
    const dir = SecretManager.getKeystoresDir();
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name !== 'keys.json') {
          const filePath = path.join(dir, entry.name);
          try {
            if (await EncryptedKeystore.isValidKeystore(filePath)) {
              secrets.push({
                alias: entry.name,
                encrypted: true,
              });
            }
          } catch {
            // Skip invalid files
          }
        }
      }
    } catch {
      // Directory might not exist yet
    }

    // Get unencrypted keys
    try {
      const data = await SecretManager.readPlainKeys();
      for (const [alias, entry] of Object.entries(data.keys)) {
        secrets.push({
          alias,
          encrypted: false,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        });
      }
    } catch {
      // keys.json might not exist
    }

    // Sort alphabetically
    return secrets.sort((a, b) => a.alias.localeCompare(b.alias));
  }

  /**
   * Delete a secret by alias
   */
  static async delete(alias: string): Promise<{ deleted: boolean; encrypted?: boolean }> {
    const status = await SecretManager.exists(alias);

    if (!status.exists) {
      throw new Error(`Alias '${alias}' not found.`);
    }

    if (status.encrypted) {
      const filePath = SecretManager.getEncryptedPath(alias);
      await fs.unlink(filePath);
      return { deleted: true, encrypted: true };
    } else {
      const data = await SecretManager.readPlainKeys();
      delete data.keys[alias];
      await SecretManager.writePlainKeys(data);
      return { deleted: true, encrypted: false };
    }
  }

  /**
   * Clear all secrets (for testing)
   */
  static async clear(): Promise<void> {
    const dir = SecretManager.getKeystoresDir();

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          await fs.unlink(path.join(dir, entry.name));
        }
      }
    } catch {
      // Directory might not exist
    }
  }

  /**
   * Get the keystores directory path for display
   */
  static getStoragePath(): string {
    return SecretManager.getKeystoresDir();
  }
}
