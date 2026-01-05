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

// Commands are added by feature PRs. See ROADMAP.md for planned commands:
// - key: Key management (generate, derive, import, export, keystore)
// - wallet: Wallet operations (create, deploy, balance, authwit)
// - contract: Contract interactions (deploy, view, send, simulate)
// - query: Query operations (public, notes, nullifiers, tx, block)
// - tx: Transaction analysis (analyze, compare, decode, status)
// - node: Node info and status
// - bridge: L1↔L2 bridge operations
// - monitor: Streaming/monitoring operations
// - cast: Pure utility functions (hash, address, field, selector, etc.)

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
