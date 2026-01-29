#!/usr/bin/env node

import { Command } from 'commander';
import { resolveRpcUrl, resolveAdminUrl } from './config/index.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

// ANSI escape codes for formatting
const bold = '\x1b[1m';
const reset = '\x1b[0m';
const underline = '\x1b[4m';

// Customize help output to show bold command names and aliases in descriptions
program.configureHelp({
  formatHelp: (cmd: any, helper: any) => {
    const termWidth = process.stdout.columns || 80;
    const helpWidth = Math.min(termWidth, 80);
    const indent = 2;
    
    let output: string[] = [];
    
    // Usage
    output.push(`${bold}${underline}Usage:${reset} ${helper.commandUsage(cmd)}`);
    output.push('');
    
    // Description
    if (cmd.description()) {
      output.push(helper.commandDescription(cmd));
      output.push('');
    }
    
    // Commands
    const commands = helper.visibleCommands(cmd);
    if (commands.length > 0) {
      output.push(`${bold}${underline}Commands:${reset}`);
      output.push('');
      
      for (let i = 0; i < commands.length; i++) {
        const subcommand = commands[i];
        const name = subcommand.name();
        const aliases = subcommand.aliases();
        let desc = subcommand.description();
        
        // Add aliases to description
        if (aliases.length > 0) {
          const aliasList = aliases.map((a: string) => a).join(', ');
          desc = desc ? `${desc} [aliases: ${aliasList}]` : `[aliases: ${aliasList}]`;
        }
        
        const nameWidth = 35;
        const paddedName = name.padEnd(nameWidth);
        const wrappedDesc = helper.wrap(desc, helpWidth - indent - nameWidth, indent + nameWidth);
        const descLines = wrappedDesc.split('\n');
        
        output.push(`  ${bold}${paddedName}${reset}${descLines[0]}`);
        for (let j = 1; j < descLines.length; j++) {
          output.push(' '.repeat(indent + nameWidth) + descLines[j]);
        }
      }
      output.push('');
    }
    
    // Options
    const options = helper.visibleOptions(cmd);
    if (options.length > 0) {
      output.push(`${bold}${underline}Options:${reset}`);
      output.push('');
      
      for (const option of options) {
        const flags = option.flags || option.long || '';
        const desc = option.description || '';
        const nameWidth = 30;
        const paddedFlags = flags.padEnd(nameWidth);
        const wrappedDesc = helper.wrap(desc, helpWidth - indent - nameWidth, indent + nameWidth);
        const descLines = wrappedDesc.split('\n');
        
        output.push(`  ${bold}${paddedFlags}${reset}${descLines[0]}`);
        for (let i = 1; i < descLines.length; i++) {
          output.push(' '.repeat(indent + nameWidth) + descLines[i]);
        }
      }
      output.push('');
    }
    
    // Arguments
    const args = helper.visibleArguments(cmd);
    if (args.length > 0) {
      output.push(`${bold}${underline}Arguments:${reset}`);
      output.push('');
      
      for (const arg of args) {
        const name = arg.name();
        const desc = arg.description || '';
        const nameWidth = 30;
        const paddedName = name.padEnd(nameWidth);
        const wrappedDesc = helper.wrap(desc, helpWidth - indent - nameWidth, indent + nameWidth);
        const descLines = wrappedDesc.split('\n');
        
        output.push(`  ${bold}${paddedName}${reset}${descLines[0]}`);
        for (let i = 1; i < descLines.length; i++) {
          output.push(' '.repeat(indent + nameWidth) + descLines[i]);
        }
      }
      output.push('');
    }
    
    return output.join('\n');
  }
});

program
  .name('cazt')
  .description('A Swiss Army knife for interacting with Aztec applications from the command line')
  .version(packageJson.version)
  .option('--rpc-url <url>', 'Aztec node RPC url (or "devnet"/"testnet" for network shortcuts)', resolveRpcUrl(undefined))
  .option('--admin-url <url>', 'Aztec admin RPC url', resolveAdminUrl(undefined))
  .option('--no-pretty', 'Print compact JSON', false)
  .option('--json', 'Output as JSON (default: raw value for utilities)', false);

// =============================================================================
// KEY COMMANDS
// =============================================================================

const keyCmd = program.command('key').description('Key management commands');

keyCmd
  .command('generate')
  .description('Generate a new random secret key')
  .action(async () => {
    try {
      const { WalletUtils } = await import('./utils/wallet.js');
      const result = await WalletUtils.generateKey('{}');

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('Generated Secret Key');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Secret Key: ${result.secretKey}`);
        console.log('');
        console.log(`WARNING: ${result.warning}`);
      }
    } catch (error: any) {
      console.error(`Error generating key: ${error.message}`);
      process.exit(1);
    }
  });

keyCmd
  .command('derive-keys [secret]')
  .description('Derive keys from secret key or keystore alias')
  .option('--alias <name>', 'Load secret from keystore by alias')
  .option('--public', 'Include public keys in the output')
  .action(async (secret: string | undefined, options: { alias?: string; public?: boolean }) => {
    try {
      const { WalletUtils, resolveSecret } = await import('./utils/wallet.js');
      const resolvedSecret = await resolveSecret(secret, options.alias);
      const result = await WalletUtils.deriveKeysFromSecret(resolvedSecret, options.public || false);

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('Derived Keys');
        console.log('='.repeat(50));
        console.log('');
        console.log('Secret Keys:');
        console.log(`  Master Nullifier Secret Key: ${result.secretKeys.masterNullifierSecretKey}`);
        console.log(`  Master Incoming Viewing Secret Key: ${result.secretKeys.masterIncomingViewingSecretKey}`);
        console.log(`  Master Outgoing Viewing Secret Key: ${result.secretKeys.masterOutgoingViewingSecretKey}`);
        console.log(`  Master Tagging Secret Key: ${result.secretKeys.masterTaggingSecretKey}`);

        if (result.publicKeys) {
          console.log('');
          console.log('Public Keys:');
          console.log(`  Master Nullifier Public Key: ${result.publicKeys.masterNullifierPublicKey}`);
          console.log(`  Master Incoming Viewing Public Key: ${result.publicKeys.masterIncomingViewingPublicKey}`);
          console.log(`  Master Outgoing Viewing Public Key: ${result.publicKeys.masterOutgoingViewingPublicKey}`);
          console.log(`  Master Tagging Public Key: ${result.publicKeys.masterTaggingPublicKey}`);
        }
      }
    } catch (error: any) {
      console.error(`Error deriving keys: ${error.message}`);
      process.exit(1);
    }
  });

keyCmd
  .command('derive-address [secret]')
  .description('Compute account address from secret key, passphrase, or keystore alias')
  .option('--alias <name>', 'Load secret from keystore by alias')
  .option('--salt <salt>', 'Optional salt for address derivation')
  .action(async (secret: string | undefined, options: { alias?: string; salt?: string }) => {
    try {
      const { WalletUtils, resolveSecret } = await import('./utils/wallet.js');
      const resolvedSecret = await resolveSecret(secret, options.alias);
      const result = await WalletUtils.deriveAddress(resolvedSecret, options.salt);

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('Derived Account Address');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Address: ${result.address}`);
        if (result.secretKey) {
          console.log('');
          console.log(`Secret Key (derived from passphrase): ${result.secretKey}`);
        }
        if (options.salt) {
          console.log('');
          console.log(`Salt: ${options.salt}`);
        }
      }
    } catch (error: any) {
      console.error(`Error deriving address: ${error.message}`);
      process.exit(1);
    }
  });

keyCmd
  .command('import <secret>')
  .description('Import a secret key with an alias (encrypted by default)')
  .requiredOption('--alias <name>', 'Alias to store the key under')
  .option('--no-encrypt', 'Store without encryption (not recommended for production)')
  .option('--password <password>', 'Password for encryption (will prompt if not provided)')
  .option('--force', 'Overwrite existing alias if it exists')
  .action(async (secret: string, options: { alias: string; encrypt: boolean; password?: string; force?: boolean }) => {
    try {
      const { WalletUtils } = await import('./utils/wallet.js');

      if (options.encrypt && !options.password) {
        console.log('Importing secret key (encrypted)...');
        console.log('');
      }

      const result = await WalletUtils.importKey(secret, options.alias, {
        encrypted: options.encrypt,
        password: options.password,
        force: options.force,
      });

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('');
        console.log('Imported Secret Key');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Alias: ${result.alias}`);
        console.log(`Encrypted: ${result.encrypted ? 'yes' : 'no'}`);
        console.log(`Stored in: ${result.storagePath}`);
        console.log('');
        console.log(`WARNING: ${result.warning}`);
      }
    } catch (error: any) {
      console.error(`Error importing key: ${error.message}`);
      process.exit(1);
    }
  });

keyCmd
  .command('export <alias>')
  .description('Export a secret key by its alias (prompts for password if encrypted)')
  .option('--password <password>', 'Password for encrypted secrets (will prompt if not provided)')
  .action(async (alias: string, options: { password?: string }) => {
    try {
      const { WalletUtils } = await import('./utils/wallet.js');
      const result = await WalletUtils.exportKey(alias, options.password);

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('Exported Secret Key');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Alias: ${result.alias}`);
        console.log(`Encrypted: ${result.encrypted ? 'yes' : 'no'}`);
        console.log(`Secret: ${result.secret}`);
        console.log('');
        console.log(`WARNING: ${result.warning}`);
      }
    } catch (error: any) {
      console.error(`Error exporting key: ${error.message}`);
      process.exit(1);
    }
  });

keyCmd
  .command('list')
  .alias('ls')
  .description('List all stored secrets with encryption status')
  .action(async () => {
    try {
      const { WalletUtils } = await import('./utils/wallet.js');
      const result = await WalletUtils.listKeys();

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('Stored Secrets');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Storage: ${result.storagePath}`);
        console.log('');
        if (result.secrets.length === 0) {
          console.log('No secrets stored');
        } else {
          for (const secret of result.secrets) {
            const status = secret.encrypted ? '(encrypted)' : '(plain)';
            console.log(`  ${secret.alias} ${status}`);
          }
        }
      }
    } catch (error: any) {
      console.error(`Error listing keys: ${error.message}`);
      process.exit(1);
    }
  });

keyCmd
  .command('delete <alias>')
  .alias('rm')
  .description('Delete a stored secret by its alias')
  .action(async (alias: string) => {
    try {
      const { WalletUtils } = await import('./utils/wallet.js');
      const result = await WalletUtils.deleteKey(alias);

      if (program.opts().json) {
        console.log(JSON.stringify({ deleted: true, ...result }, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('Deleted Secret');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Alias: ${result.alias}`);
        console.log(`Was encrypted: ${result.encrypted ? 'yes' : 'no'}`);
      }
    } catch (error: any) {
      console.error(`Error deleting key: ${error.message}`);
      process.exit(1);
    }
  });

keyCmd
  .command('sign <message> [secret]')
  .description('Sign a message with Schnorr signature (strings or hex bytes with 0x prefix)')
  .option('--alias <name>', 'Alias of the secret key to use from keystore')
  .action(async (message: string, secret: string | undefined, options: { alias?: string }) => {
    try {
      const { WalletUtils, resolveSecret } = await import('./utils/wallet.js');
      const resolvedSecret = await resolveSecret(secret, options.alias);
      const result = await WalletUtils.signMessage(message, resolvedSecret);

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('Schnorr Signature');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Message: ${result.message}`);
        console.log('');
        if (result.derivedSecretKey) {
          console.log(`Secret Key (derived from passphrase): ${result.derivedSecretKey}`);
          console.log('');
        }
        console.log(`Signature: ${result.signature}`);
        console.log('');
        console.log(`Public Key: ${result.publicKey}`);
      }
    } catch (error: any) {
      console.error(`Error signing message: ${error.message}`);
      process.exit(1);
    }
  });

keyCmd
  .command('verify <message>')
  .description('Verify a Schnorr signature (strings or hex bytes with 0x prefix)')
  .requiredOption('--sig <signature>', 'Signature to verify (hex string)')
  .requiredOption('--pubkey <key>', 'Public key to verify against (hex string)')
  .action(async (message: string, options: { sig: string; pubkey: string }) => {
    try {
      const { WalletUtils } = await import('./utils/wallet.js');
      const result = await WalletUtils.verifySignature(message, options.sig, options.pubkey);

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('Schnorr Signature Verification');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Message: ${result.message}`);
        console.log('');
        console.log(`Signature: ${result.signature}`);
        console.log('');
        console.log(`Public Key: ${result.publicKey}`);
        console.log('');
        console.log(`Valid: ${result.valid ? '✓ YES' : '✗ NO'}`);
      }

      // Exit with non-zero code if signature is invalid (useful for scripting)
      if (!result.valid) {
        process.exit(1);
      }
    } catch (error: any) {
      console.error(`Error verifying signature: ${error.message}`);
      process.exit(1);
    }
  });

// =============================================================================
// KEYSTORE SUBCOMMAND (Encrypted file-based storage)
// =============================================================================

const keystoreCmd = keyCmd.command('keystore').description('Encrypted keystore file management');

keystoreCmd
  .command('create <name>')
  .description('Create an encrypted keystore file from a secret key')
  .requiredOption('--secret <key>', 'Secret key to encrypt (hex string)')
  .option('--password <password>', 'Password for encryption (will prompt if not provided)')
  .option('--keystore-dir <dir>', 'Directory to store keystore files', undefined)
  .action(async (name: string, options: { secret: string; password?: string; keystoreDir?: string }) => {
    try {
      const { EncryptedKeystore } = await import('./utils/encrypted-keystore.js');
      const result = await EncryptedKeystore.createKeystore(options.secret, name, {
        password: options.password,
        keystoreDir: options.keystoreDir,
      });

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('');
        console.log('Created Encrypted Keystore');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Name: ${result.name}`);
        console.log(`Path: ${result.path}`);
        console.log(`UUID: ${result.id}`);
        console.log(`Cipher: ${result.cipher}`);
        console.log(`KDF: ${result.kdf}`);
        console.log('');
        console.log(`WARNING: ${result.warning}`);
      }
    } catch (error: any) {
      console.error(`Error creating keystore: ${error.message}`);
      process.exit(1);
    }
  });

keystoreCmd
  .command('unlock <name>')
  .description('Decrypt and display the secret from a keystore')
  .option('--password <password>', 'Password for decryption (will prompt if not provided)')
  .option('--keystore-dir <dir>', 'Directory containing keystore files', undefined)
  .action(async (name: string, options: { password?: string; keystoreDir?: string }) => {
    try {
      const { EncryptedKeystore } = await import('./utils/encrypted-keystore.js');
      const result = await EncryptedKeystore.unlock(name, {
        password: options.password,
        keystoreDir: options.keystoreDir,
      });

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('');
        console.log('Unlocked Keystore');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Name: ${result.name}`);
        console.log(`UUID: ${result.id}`);
        console.log(`Secret: ${result.secret}`);
        console.log('');
        console.log(`WARNING: ${result.warning}`);
      }
    } catch (error: any) {
      console.error(`Error unlocking keystore: ${error.message}`);
      process.exit(1);
    }
  });

keystoreCmd
  .command('inspect <name>')
  .description('Display keystore metadata without decrypting')
  .option('--keystore-dir <dir>', 'Directory containing keystore files', undefined)
  .action(async (name: string, options: { keystoreDir?: string }) => {
    try {
      const { EncryptedKeystore } = await import('./utils/encrypted-keystore.js');
      const result = await EncryptedKeystore.inspect(name, options.keystoreDir);

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('Keystore Information');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Name: ${result.name}`);
        console.log(`Path: ${result.path}`);
        console.log(`UUID: ${result.id}`);
        console.log(`Version: ${result.version}`);
        console.log(`Cipher: ${result.cipher}`);
        console.log(`KDF: ${result.kdf}`);
      }
    } catch (error: any) {
      console.error(`Error inspecting keystore: ${error.message}`);
      process.exit(1);
    }
  });

keystoreCmd
  .command('list')
  .alias('ls')
  .description('List all keystores in the keystore directory')
  .option('--keystore-dir <dir>', 'Directory containing keystore files', undefined)
  .action(async (options: { keystoreDir?: string }) => {
    try {
      const { EncryptedKeystore } = await import('./utils/encrypted-keystore.js');
      const result = await EncryptedKeystore.list(options.keystoreDir);

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('Keystores');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Directory: ${result.directory}`);
        console.log('');
        if (result.keystores.length === 0) {
          console.log('No keystores found');
        } else {
          for (const ks of result.keystores) {
            console.log(`  ${ks.name} (${ks.id})`);
          }
        }
      }
    } catch (error: any) {
      console.error(`Error listing keystores: ${error.message}`);
      process.exit(1);
    }
  });

keystoreCmd
  .command('delete <name>')
  .alias('rm')
  .description('Delete a keystore file')
  .option('--keystore-dir <dir>', 'Directory containing keystore files', undefined)
  .action(async (name: string, options: { keystoreDir?: string }) => {
    try {
      const { EncryptedKeystore } = await import('./utils/encrypted-keystore.js');
      const result = await EncryptedKeystore.delete(name, options.keystoreDir);

      if (program.opts().json) {
        console.log(JSON.stringify({ deleted: true, ...result }, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('Deleted Keystore');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Name: ${result.name}`);
        console.log(`Path: ${result.path}`);
      }
    } catch (error: any) {
      console.error(`Error deleting keystore: ${error.message}`);
      process.exit(1);
    }
  });

// ============================================================================
// TX METADATA COMMANDS
// ============================================================================

const txCmd = program.command('tx').description('Transaction-related commands');

const txMetadataCmd = txCmd.command('metadata').description('Manage transaction metadata');

txMetadataCmd
  .command('add <tx-hash>')
  .description('Add metadata to a transaction')
  .option('-l, --label <label>', 'Short label for the transaction')
  .option('-d, --description <desc>', 'Longer description (encrypted)')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-c, --custom <json>', 'Custom JSON data (encrypted)')
  .option('--contract <address>', 'Associated contract address')
  .option('--password <password>', 'Password for encryption (will prompt if not provided)')
  .option('--no-encrypt', 'Store without encryption (testing only)')
  .action(async (txHash: string, options: {
    label?: string;
    description?: string;
    tags?: string;
    custom?: string;
    contract?: string;
    password?: string;
    encrypt: boolean;
  }) => {
    try {
      const { TxMetadataStore } = await import('./storage/tx-metadata-store.js');
      const { promptPasswordWithConfirm } = await import('./utils/password.js');

      // Parse custom JSON if provided
      let customData: Record<string, unknown> | undefined;
      if (options.custom) {
        try {
          customData = JSON.parse(options.custom);
        } catch {
          throw new Error('Invalid custom JSON data');
        }
      }

      // Parse tags
      const tags = options.tags?.split(',').map(t => t.trim()).filter(t => t.length > 0);

      const store = await TxMetadataStore.open();

      try {
        if (options.encrypt) {
          // Get password
          const password = options.password ?? await promptPasswordWithConfirm();

          await store.add(txHash, {
            label: options.label,
            description: options.description,
            tags,
            custom: customData,
            contractAddress: options.contract,
          }, password);
        } else {
          await store.addPlaintext(txHash, {
            label: options.label,
            description: options.description,
            tags,
            custom: customData,
            contractAddress: options.contract,
          });
        }

        if (program.opts().json) {
          console.log(JSON.stringify({
            success: true,
            txHash,
            label: options.label,
            tags,
            encrypted: options.encrypt,
          }, null, program.opts().noPretty ? 0 : 2));
        } else {
          console.log('Metadata Added');
          console.log('='.repeat(50));
          console.log('');
          console.log(`Transaction: ${txHash}`);
          if (options.label) console.log(`Label: ${options.label}`);
          if (tags?.length) console.log(`Tags: ${tags.join(', ')}`);
          console.log(`Encrypted: ${options.encrypt ? 'yes' : 'no'}`);
          if (options.encrypt) {
            console.log('');
            console.log('WARNING: Remember your password. There is no way to recover encrypted metadata.');
          }
        }
      } finally {
        await store.close();
      }
    } catch (error: any) {
      console.error(`Error adding metadata: ${error.message}`);
      process.exit(1);
    }
  });

txMetadataCmd
  .command('get <tx-hash>')
  .description('Get metadata for a transaction (requires password for encrypted entries)')
  .option('--password <password>', 'Password for decryption (will prompt if not provided)')
  .action(async (txHash: string, options: { password?: string }) => {
    try {
      const { TxMetadataStore } = await import('./storage/tx-metadata-store.js');
      const { promptPassword } = await import('./utils/password.js');

      const store = await TxMetadataStore.open();

      try {
        // First check if entry exists
        if (!(await store.exists(txHash))) {
          if (program.opts().json) {
            console.log(JSON.stringify({ found: false, txHash }, null, program.opts().noPretty ? 0 : 2));
          } else {
            console.log(`No metadata found for transaction ${txHash}`);
          }
          return;
        }

        // Try to get with password
        const password = options.password ?? await promptPassword('Enter password to decrypt metadata: ');
        const metadata = await store.get(txHash, password);

        if (!metadata) {
          console.log(`No metadata found for transaction ${txHash}`);
          return;
        }

        if (program.opts().json) {
          console.log(JSON.stringify(metadata, null, program.opts().noPretty ? 0 : 2));
        } else {
          console.log('Transaction Metadata');
          console.log('='.repeat(50));
          console.log('');
          console.log(`Transaction: ${metadata.txHash}`);
          if (metadata.label) console.log(`Label: ${metadata.label}`);
          if (metadata.description) console.log(`Description: ${metadata.description}`);
          if (metadata.tags?.length) console.log(`Tags: ${metadata.tags.join(', ')}`);
          if (metadata.contractAddress) console.log(`Contract: ${metadata.contractAddress}`);
          if (metadata.functionName) console.log(`Function: ${metadata.functionName}`);
          console.log(`Created: ${new Date(metadata.createdAt).toISOString()}`);
          console.log(`Updated: ${new Date(metadata.updatedAt).toISOString()}`);
          if (metadata.custom) {
            console.log(`Custom: ${JSON.stringify(metadata.custom)}`);
          }
        }
      } finally {
        await store.close();
      }
    } catch (error: any) {
      console.error(`Error getting metadata: ${error.message}`);
      process.exit(1);
    }
  });

txMetadataCmd
  .command('list')
  .alias('ls')
  .description('List all transaction metadata (no password required)')
  .option('--tag <tag>', 'Filter by tag')
  .option('--contract <address>', 'Filter by contract address')
  .option('--limit <n>', 'Limit number of results', parseInt)
  .action(async (options: { tag?: string; contract?: string; limit?: number }) => {
    try {
      const { TxMetadataStore } = await import('./storage/tx-metadata-store.js');

      const store = await TxMetadataStore.open();

      try {
        const entries = await store.list({
          tag: options.tag,
          contract: options.contract,
          limit: options.limit,
        });

        if (program.opts().json) {
          console.log(JSON.stringify(entries, null, program.opts().noPretty ? 0 : 2));
        } else if (entries.length === 0) {
          console.log('No metadata entries found');
        } else {
          console.log('Transaction Metadata');
          console.log('='.repeat(50));
          console.log('');

          for (const entry of entries) {
            const label = entry.label ?? '(no label)';
            const tags = entry.tags?.length ? ` [${entry.tags.join(', ')}]` : '';
            console.log(`${entry.txHash} - ${label}${tags}`);
          }

          console.log('');
          console.log(`Total: ${entries.length} entries`);
        }
      } finally {
        await store.close();
      }
    } catch (error: any) {
      console.error(`Error listing metadata: ${error.message}`);
      process.exit(1);
    }
  });

txMetadataCmd
  .command('delete <tx-hash>')
  .alias('rm')
  .description('Delete metadata for a transaction')
  .option('--force', 'Skip confirmation prompt')
  .action(async (txHash: string, options: { force?: boolean }) => {
    try {
      const { TxMetadataStore } = await import('./storage/tx-metadata-store.js');
      const { promptConfirm } = await import('./utils/password.js');

      const store = await TxMetadataStore.open();

      try {
        // Check if exists
        if (!(await store.exists(txHash))) {
          if (program.opts().json) {
            console.log(JSON.stringify({ deleted: false, txHash, reason: 'not found' }, null, program.opts().noPretty ? 0 : 2));
          } else {
            console.log(`No metadata found for transaction ${txHash}`);
          }
          return;
        }

        // Confirm deletion
        if (!options.force) {
          const confirmed = await promptConfirm(`Delete metadata for ${txHash}? (y/N): `);
          if (!confirmed) {
            console.log('Deletion cancelled');
            return;
          }
        }

        const deleted = await store.delete(txHash);

        if (program.opts().json) {
          console.log(JSON.stringify({ deleted, txHash }, null, program.opts().noPretty ? 0 : 2));
        } else {
          console.log('Metadata Deleted');
          console.log('='.repeat(50));
          console.log('');
          console.log(`Transaction: ${txHash}`);
        }
      } finally {
        await store.close();
      }
    } catch (error: any) {
      console.error(`Error deleting metadata: ${error.message}`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────
// Update Command
// ─────────────────────────────────────────────────────────────

txMetadataCmd
  .command('update <tx-hash>')
  .description('Update metadata for a transaction (requires password)')
  .option('-l, --label <label>', 'New label for the transaction')
  .option('-d, --description <description>', 'New description (encrypted)')
  .option('-t, --tags <tags>', 'New comma-separated tags (replaces existing)')
  .option('-c, --custom <json>', 'New custom JSON data (replaces existing)')
  .option('--contract <address>', 'New associated contract address')
  .option('--function <name>', 'New function name')
  .option('--password <password>', 'Password for decryption/encryption (will prompt if not provided)')
  .action(async (txHash: string, options: {
    label?: string;
    description?: string;
    tags?: string;
    custom?: string;
    contract?: string;
    function?: string;
    password?: string;
  }) => {
    try {
      const { TxMetadataStore } = await import('./storage/tx-metadata-store.js');
      const { promptPassword } = await import('./utils/password.js');

      // Check if any update fields provided
      if (!options.label && !options.description && !options.tags && !options.custom && !options.contract && !options.function) {
        console.error('Error: At least one update field must be provided (--label, --description, --tags, --custom, --contract, --function)');
        process.exit(1);
      }

      const store = await TxMetadataStore.open();

      try {
        // Check if exists
        if (!(await store.exists(txHash))) {
          console.error(`No metadata found for transaction ${txHash}`);
          process.exit(1);
        }

        // Get password
        const password = options.password ?? await promptPassword('Enter password: ');

        // Build updates object
        const updates: Record<string, unknown> = {};
        if (options.label !== undefined) updates.label = options.label;
        if (options.description !== undefined) updates.description = options.description;
        if (options.tags !== undefined) updates.tags = options.tags.split(',').map(t => t.trim()).filter(Boolean);
        if (options.custom !== undefined) {
          try {
            updates.custom = JSON.parse(options.custom);
          } catch {
            console.error('Error: Invalid JSON for --custom option');
            process.exit(1);
          }
        }
        if (options.contract !== undefined) updates.contractAddress = options.contract;
        if (options.function !== undefined) updates.functionName = options.function;

        await store.update(txHash, updates, password);

        if (program.opts().json) {
          console.log(JSON.stringify({
            updated: true,
            txHash,
            fields: Object.keys(updates),
          }, null, program.opts().noPretty ? 0 : 2));
        } else {
          console.log('Metadata Updated');
          console.log('='.repeat(50));
          console.log('');
          console.log(`Transaction: ${txHash}`);
          console.log(`Updated fields: ${Object.keys(updates).join(', ')}`);
        }
      } finally {
        await store.close();
      }
    } catch (error: any) {
      if (error.message.includes('MAC verification failed')) {
        console.error('Error: Invalid password');
      } else {
        console.error(`Error updating metadata: ${error.message}`);
      }
      process.exit(1);
    }
  });

// ============================================================================
// TX DECODE COMMAND
// ============================================================================

txCmd
  .command('decode <tx-hash>')
  .description('Decode a transaction and display its effects. Use --secret or --alias to decrypt private logs.')
  .option('-r, --rpc <url>', 'RPC URL or network name (devnet, testnet)')
  .option('--raw', 'Include raw field values')
  .option('-s, --secret <key>', 'Secret key for decrypting private logs (hex)')
  .option('-a, --alias <name>', 'Use stored secret key by alias')
  .option('--salt <value>', 'Salt for account address derivation (default: 0)')
  .option('--artifact <path>', 'Contract artifact JSON for event decoding')
  .action(async (txHash: string, options: {
    rpc?: string;
    raw?: boolean;
    secret?: string;
    alias?: string;
    salt?: string;
    artifact?: string;
  }) => {
    try {
      const { TxDecoderService, deriveCompleteAddressFromSecret } = await import('./utils/tx-decoder.js');
      const { resolveRpcUrl } = await import('./config/index.js');
      const { Fr } = await import('@aztec/aztec.js/fields');

      const nodeUrl = resolveRpcUrl(options.rpc);

      // Get secret key if alias provided
      let secretKey = options.secret;
      if (options.alias && !secretKey) {
        const { SecretManager } = await import('./utils/secret-manager.js');
        const { promptPassword } = await import('./utils/password.js');

        // Check if alias exists and if it's encrypted
        const { exists, encrypted } = await SecretManager.exists(options.alias);
        if (!exists) {
          throw new Error(`Alias '${options.alias}' not found`);
        }

        // Resolve the secret (will prompt for password if encrypted)
        const password = encrypted ? await promptPassword('Enter password for stored key: ') : undefined;
        secretKey = await SecretManager.resolve(options.alias, password);
      }

      // Connect to node
      const decoder = await TxDecoderService.connect(nodeUrl);

      // Load artifact if provided
      let artifact: any;
      if (options.artifact) {
        const fs = await import('fs');
        const path = await import('path');
        const artifactPath = path.resolve(options.artifact);
        if (!fs.existsSync(artifactPath)) {
          throw new Error(`Artifact file not found: ${artifactPath}`);
        }
        artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
      }

      // Build decode options
      const decodeOptions: { includeRaw?: boolean; secretKey?: string; completeAddress?: any; artifact?: any } = {
        includeRaw: options.raw,
        artifact,
      };

      // If we have a secret key, derive the complete address for decryption
      if (secretKey) {
        const salt = options.salt ? Fr.fromHexString(options.salt) : Fr.ZERO;
        decodeOptions.secretKey = secretKey;
        decodeOptions.completeAddress = await deriveCompleteAddressFromSecret(secretKey, salt);
      }

      const decoded = await decoder.decodeTx(txHash, decodeOptions);

      // Add spacing after password prompt for readability
      if (!program.opts().json) {
        console.log('');
      }

      if (program.opts().json) {
        console.log(JSON.stringify(decoded, null, program.opts().noPretty ? 0 : 2));
      } else {
        // Human-readable output
        console.log(`Transaction: ${decoded.txHash}`);
        console.log('━'.repeat(60));
        console.log('');
        console.log(`Status:        ${decoded.status}${decoded.revertReason && decoded.revertReason !== 'OK' ? ` (${decoded.revertReason})` : ''}`);
        if (decoded.blockNumber !== null) {
          console.log(`Block:         ${decoded.blockNumber}`);
        }
        if (decoded.transactionFee !== null) {
          console.log(`Fee:           ${decoded.transactionFee}`);
        }
        console.log('');
        console.log('Public Summary:');
        console.log(`  Note hashes:     ${decoded.publicSummary.noteHashCount}`);
        console.log(`  Nullifiers:      ${decoded.publicSummary.nullifierCount}`);
        console.log(`  L2→L1 messages:  ${decoded.publicSummary.l2ToL1MessageCount}`);
        console.log(`  Private logs:    ${decoded.publicSummary.privateLogCount} (encrypted)`);
        console.log(`  Public logs:     ${decoded.publicSummary.publicLogCount}`);
        console.log(`  Data writes:     ${decoded.publicSummary.publicDataWriteCount}`);

        // Show decrypted data if available
        if (decoded.yourData) {
          console.log('');
          console.log('━'.repeat(60));
          console.log('Your Data (Decrypted):');
          console.log('━'.repeat(60));
          console.log('');

          // Show artifact context if provided
          if (options.artifact) {
            const artifactName = artifact?.name || 'Unknown';
            console.log(`Artifact: ${artifactName}`);
            console.log('');
          }

          if (decoded.yourData.found) {
            console.log(`Found ${decoded.yourData.successfulDecryptions} log(s) for your keys:`);
            console.log('');
            for (const log of decoded.yourData.incoming) {
              if (log.event) {
                // Show decoded event
                console.log(`  [Log ${log.logIndex}] Event: ${log.event.name}`);
                console.log(`    Selector: ${log.event.selector}`);
                for (const field of log.event.decodedFields) {
                  console.log(`    ${field.name}: ${field.value}`);
                }
              } else {
                // Show raw fields (no matching event or no artifact)
                console.log(`  [Log ${log.logIndex}] ${log.fieldCount} fields`);
                for (let i = 0; i < log.fields.length; i++) {
                  console.log(`    field[${i}]: ${log.fields[i]}`);
                }
              }
              console.log('');
            }
          } else {
            console.log('No private data found for your keys.');
          }
          console.log('');
          console.log(`Decryption: ${decoded.yourData.successfulDecryptions}/${decoded.yourData.decryptionAttempts} logs decrypted`);
        }

        // Show raw data if requested
        if (decoded.raw) {
          console.log('');
          console.log('━'.repeat(60));
          console.log('Raw Values:');
          console.log('━'.repeat(60));

          if (decoded.raw.noteHashes.length > 0) {
            console.log('');
            console.log('Note Hashes:');
            for (const hash of decoded.raw.noteHashes) {
              console.log(`  ${hash}`);
            }
          }

          if (decoded.raw.nullifiers.length > 0) {
            console.log('');
            console.log('Nullifiers:');
            for (const nullifier of decoded.raw.nullifiers) {
              console.log(`  ${nullifier}`);
            }
          }

          if (decoded.raw.publicLogs.length > 0) {
            console.log('');
            console.log('Public Logs:');
            for (const log of decoded.raw.publicLogs) {
              console.log(`  ${log}`);
            }
          }

          if (decoded.raw.publicDataWrites.length > 0) {
            console.log('');
            console.log('Public Data Writes:');
            for (const write of decoded.raw.publicDataWrites) {
              console.log(`  Slot ${write.slot} = ${write.value}`);
            }
          }

          if (decoded.raw.l2ToL1Msgs.length > 0) {
            console.log('');
            console.log('L2→L1 Messages:');
            for (const msg of decoded.raw.l2ToL1Msgs) {
              console.log(`  ${msg}`);
            }
          }

          if (decoded.raw.privateLogs.length > 0) {
            console.log('');
            console.log('Private Logs (encrypted):');
            for (const log of decoded.raw.privateLogs) {
              console.log(`  ${log.substring(0, 64)}...`);
            }
          }
        }

        // Tip if no secret provided but there are private logs
        if (!secretKey && decoded.publicSummary.privateLogCount > 0) {
          console.log('');
          console.log('Tip: Use --secret or --alias to decrypt private logs.');
        }
      }
    } catch (error: any) {
      console.error(`Error decoding transaction: ${error.message}`);
      process.exit(1);
    }
  });

// Export program for testing
export { program };

// Only parse if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('cli.js') || 
                     process.argv[1]?.endsWith('cli.ts') ||
                     (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test' && !process.argv[1]?.includes('jest'));

if (isMainModule) {
  program.parse();
}
