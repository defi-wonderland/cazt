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
  .description('Import a secret key with an alias for local storage')
  .requiredOption('--alias <name>', 'Alias to store the key under')
  .option('--force', 'Overwrite existing alias if it exists')
  .action(async (secret: string, options: { alias: string; force?: boolean }) => {
    try {
      const { WalletUtils } = await import('./utils/wallet.js');
      const result = await WalletUtils.importKey(secret, options.alias, options.force || false);

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('Imported Secret Key');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Alias: ${result.alias}`);
        console.log(`Secret: ${result.secret}`);
        console.log('');
        console.log(`Stored in: ${result.keystorePath}`);
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
  .description('Export a secret key by its alias from local storage')
  .action(async (alias: string) => {
    try {
      const { WalletUtils } = await import('./utils/wallet.js');
      const result = await WalletUtils.exportKey(alias);

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('Exported Secret Key');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Alias: ${result.alias}`);
        console.log(`Secret: ${result.secret}`);
        console.log('');
        console.log(`Created: ${new Date(result.createdAt).toLocaleString()}`);
        console.log(`Updated: ${new Date(result.updatedAt).toLocaleString()}`);
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
  .description('List all stored key aliases')
  .action(async () => {
    try {
      const { WalletUtils } = await import('./utils/wallet.js');
      const result = await WalletUtils.listKeys();

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('Stored Key Aliases');
        console.log('='.repeat(50));
        if (result.aliases.length === 0) {
          console.log('');
          console.log('No keys stored');
        } else {
          console.log('');
          for (const alias of result.aliases) {
            console.log(`  ${alias}`);
          }
        }
      }
    } catch (error: any) {
      console.error(`Error listing keys: ${error.message}`);
      process.exit(1);
    }
  });

keyCmd
  .command('sign <message>')
  .description('Sign a message with Schnorr signature (strings or hex bytes with 0x prefix)')
  .requiredOption('--secret <key>', 'Secret key to sign with (hex or decimal)')
  .action(async (message: string, options: { secret: string }) => {
    try {
      const { WalletUtils } = await import('./utils/wallet.js');
      const result = await WalletUtils.signMessage(message, options.secret);

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        console.log('Schnorr Signature');
        console.log('='.repeat(50));
        console.log('');
        console.log(`Message: ${result.message}`);
        console.log('');
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
