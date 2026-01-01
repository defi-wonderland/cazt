#!/usr/bin/env node

import { Command } from 'commander';
import { RpcClient, parseJsonOrFile } from './utils/rpc.js';
import { AztecUtilities } from './utils/index.js';
import { resolveRpcUrl, resolveAdminUrl } from './config/index.js';
import * as readline from 'readline';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
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
      
      // Commands that should have a line break after them (based on z file structure)
      const lineBreakAfter = new Set([
        'storage-layout',
        'admin',
        'silo-nullifier',
        'l2-to-l1-message-hash',
        'address-from-number',
        'note-selector',
        'decode-function-signature',
        'field-equals',
        'buffer-as-fields',
        'is-bounded-vec-struct',
        'contract-artifact-from-buffer',
        'eth-address-is-zero',
        'compute-initialization-hash'
      ]);
      
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
        
        const nameWidth = 35; // Increased from 30 to add 5 more spaces
        const paddedName = name.padEnd(nameWidth);
        const wrappedDesc = helper.wrap(desc, helpWidth - indent - nameWidth, indent + nameWidth);
        const descLines = wrappedDesc.split('\n');
        
        output.push(`  ${bold}${paddedName}${reset}${descLines[0]}`);
        for (let j = 1; j < descLines.length; j++) {
          output.push(' '.repeat(indent + nameWidth) + descLines[j]);
        }
        
        // Add line break after this command if it's in the set
        if (lineBreakAfter.has(name)) {
          output.push('');
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
  .description('cast-like CLI for Aztec Node JSON-RPC')
  .version(packageJson.version)
  .option('--rpc-url <url>', 'Aztec node RPC url (or "devnet"/"testnet" for network shortcuts)', resolveRpcUrl(undefined))
  .option('--admin-url <url>', 'Aztec admin RPC url', resolveAdminUrl(undefined))
  .option('--no-pretty', 'Print compact JSON', false)
  .option('--json', 'Output as JSON (default: raw value for utilities)', false);

// Raw RPC command
program
  .command('raw')
  .description('Generic raw JSON-RPC call')
  .requiredOption('--method <method>', 'Method name: node_* or nodeAdmin_*')
  .option('--params <params>', 'JSON array for params', '[]')
  .action(async (options) => {
    const client = new RpcClient({
      rpcUrl: resolveRpcUrl(program.opts().rpcUrl),
      adminUrl: program.opts().adminUrl,
      pretty: !program.opts().noPretty,
    });
    const params = parseJsonOrFile(options.params);
    const result = await client.call(options.method, params);
    console.log(client.formatOutput(result, !program.opts().noPretty));
  });

// Block commands
const blockCmd = program.command('block').description('Block queries');
blockCmd.command('number').description('Get current block number').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getBlockNumber', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
blockCmd.command('proven-number').description('Get proven block number').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getProvenBlockNumber', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
blockCmd.command('tips').description('Get L2 tips').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getL2Tips', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
blockCmd.command('get').description('Get block by number').requiredOption('--number <number>', 'Block number').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getBlock', [options.number]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
blockCmd.command('range').description('Get blocks range').requiredOption('--from <from>', 'From block').requiredOption('--limit <limit>', 'Limit').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getBlocks', [parseInt(options.from), parseInt(options.limit)]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
blockCmd.command('header').description('Get block header').option('--number <number>', 'Block number').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const params = options.number ? [options.number] : [];
  const result = await client.call('node_getBlockHeader', params);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});

// Transaction commands
const txCmd = program.command('tx').description('Transactions');
txCmd.command('send').description('Send transaction').requiredOption('--json <json>', 'JSON object or @file.json').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const tx = parseJsonOrFile(options.json);
  const result = await client.call('node_sendTx', [tx]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
txCmd.command('receipt').description('Get transaction receipt').requiredOption('--hash <hash>', 'Transaction hash').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getTxReceipt', [options.hash]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
txCmd.command('effect').description('Get transaction effect').requiredOption('--hash <hash>', 'Transaction hash').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getTxEffect', [options.hash]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
txCmd.command('get').description('Get transaction by hash').requiredOption('--hash <hash>', 'Transaction hash').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getTxByHash', [options.hash]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
txCmd.command('pending').description('Get pending transactions').option('--limit <limit>', 'Limit').option('--after <after>', 'After hash').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const params = [
    options.limit ? parseInt(options.limit) : null,
    options.after || null,
  ];
  const result = await client.call('node_getPendingTxs', params);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
txCmd.command('pending-count').description('Get pending transaction count').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getPendingTxCount', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
txCmd.command('validate').description('Validate transaction').requiredOption('--json <json>', 'tx JSON or @file.json').option('--options <options>', 'JSON options', 'null').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const tx = parseJsonOrFile(options.json);
  const opts = parseJsonOrFile(options.options);
  const result = await client.call('node_isValidTx', [tx, opts]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
txCmd.command('sim-public').description('Simulate public calls').requiredOption('--json <json>', 'tx JSON or @file.json').option('--skip-fee-enforcement', 'Skip fee enforcement').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const tx = parseJsonOrFile(options.json);
  const result = await client.call('node_simulatePublicCalls', [tx, options.skipFeeEnforcement || null]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});

// State commands
const stateCmd = program.command('state').description('State queries');
stateCmd.command('public-at').description('Get public storage at').requiredOption('--block <block>', 'Block').requiredOption('--contract <contract>', 'Contract address').requiredOption('--slot <slot>', 'Storage slot').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getPublicStorageAt', [options.block, options.contract, options.slot]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
stateCmd.command('sync-status').description('Get world state sync status').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getWorldStateSyncStatus', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});

// Merkle commands
const merkleCmd = program.command('merkle').description('Merkle tree queries');
merkleCmd.command('find-leaves').description('Find leaves indexes').requiredOption('--block <block>', 'Block').requiredOption('--tree-id <treeId>', 'Tree ID').requiredOption('--leaves <leaves>', 'JSON array or @file.json').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const leaves = parseJsonOrFile(options.leaves);
  const result = await client.call('node_findLeavesIndexes', [options.block, parseInt(options.treeId), leaves]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
merkleCmd.command('nullifier-path').description('Get nullifier sibling path').requiredOption('--block <block>', 'Block').requiredOption('--index <index>', 'Index').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getNullifierSiblingPath', [options.block, options.index]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
merkleCmd.command('note-hash-path').description('Get note hash sibling path').requiredOption('--block <block>', 'Block').requiredOption('--index <index>', 'Index').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getNoteHashSiblingPath', [options.block, options.index]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
merkleCmd.command('archive-path').description('Get archive sibling path').requiredOption('--block <block>', 'Block').requiredOption('--index <index>', 'Index').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getArchiveSiblingPath', [options.block, options.index]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
merkleCmd.command('public-data-path').description('Get public data sibling path').requiredOption('--block <block>', 'Block').requiredOption('--index <index>', 'Index').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getPublicDataSiblingPath', [options.block, options.index]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});

// Witness commands
const witnessCmd = program.command('witness').description('Membership witnesses');
witnessCmd.command('nullifier').description('Get nullifier membership witness').requiredOption('--block <block>', 'Block').requiredOption('--nullifier <nullifier>', 'Nullifier').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getNullifierMembershipWitness', [options.block, options.nullifier]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
witnessCmd.command('low-nullifier').description('Get low nullifier membership witness').requiredOption('--block <block>', 'Block').requiredOption('--nullifier <nullifier>', 'Nullifier').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getLowNullifierMembershipWitness', [options.block, options.nullifier]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
witnessCmd.command('public-data').description('Get public data witness').requiredOption('--block <block>', 'Block').requiredOption('--leaf-slot <leafSlot>', 'Leaf slot').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getPublicDataWitness', [options.block, options.leafSlot]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
witnessCmd.command('archive').description('Get archive membership witness').requiredOption('--block <block>', 'Block').requiredOption('--archive-leaf <archiveLeaf>', 'Archive leaf').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getArchiveMembershipWitness', [options.block, options.archiveLeaf]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
witnessCmd.command('note-hash').description('Get note hash membership witness').requiredOption('--block <block>', 'Block').requiredOption('--note-hash <noteHash>', 'Note hash').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getNoteHashMembershipWitness', [options.block, options.noteHash]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});

// Bridge commands
const bridgeCmd = program.command('bridge').description('L1<->L2 messages');
bridgeCmd.command('l1-to-l2-witness').description('Get L1->L2 message membership witness').requiredOption('--block <block>', 'Block').requiredOption('--message <message>', 'Message').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getL1ToL2MessageMembershipWitness', [options.block, options.message]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
bridgeCmd.command('l1-to-l2-block').description('Get L1->L2 message block').requiredOption('--message <message>', 'Message').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getL1ToL2MessageBlock', [options.message]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
bridgeCmd.command('is-l1-to-l2-synced').description('Check if L1->L2 message is synced').requiredOption('--message <message>', 'Message').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_isL1ToL2MessageSynced', [options.message]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
bridgeCmd.command('l2-to-l1').description('Get L2->L1 messages').requiredOption('--block <block>', 'Block').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getL2ToL1Messages', [options.block]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});

// Logs commands
const logsCmd = program.command('logs').description('Logs');
logsCmd.command('private').description('Get private logs').requiredOption('--from <from>', 'From block').requiredOption('--limit <limit>', 'Limit').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getPrivateLogs', [parseInt(options.from), parseInt(options.limit)]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
logsCmd.command('public').description('Get public logs').requiredOption('--filter <filter>', 'filter JSON or @file.json').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const filter = parseJsonOrFile(options.filter);
  const result = await client.call('node_getPublicLogs', [filter]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
logsCmd.command('contract-class').description('Get contract class logs').requiredOption('--filter <filter>', 'filter JSON or @file.json').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const filter = parseJsonOrFile(options.filter);
  const result = await client.call('node_getContractClassLogs', [filter]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
logsCmd.command('by-tags').description('Get logs by tags').requiredOption('--tags <tags>', 'JSON array or @file.json').option('--logs-per-tag <logsPerTag>', 'Logs per tag').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const tags = parseJsonOrFile(options.tags);
  const params = [tags];
  if (options.logsPerTag) params.push(parseInt(options.logsPerTag));
  const result = await client.call('node_getLogsByTags', params);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});

// Notes commands
const notesCmd = program.command('notes').description('Note queries');
notesCmd
  .command('fetch')
  .description('Fetch notes from wallet for a storage slot')
  .requiredOption('--contract <address>', 'Contract address (required)')
  .requiredOption('--artifact <json>', 'Contract artifact JSON file path, artifact name (e.g., "aztec:Token"), or JSON string (required)')
  .option('--contract-secret-key <key>', 'Secret key (Fr) for contract registration (optional)')
  .option('--sender <sender>', 'Sender address (AztecAddress) - required for scopes filtering, will be registered with wallet')
  .option('--storage-slot <slot>', 'Storage slot (Fr) - optional, can be a number or field value')
  .option('--storage-slot-name <name>', 'Storage slot name from artifact (e.g., "balances") - optional, alternative to --storage-slot')
  .option('--storage-slot-key <key>', 'Key for deriving slot in map (e.g., user address) - optional, required if --storage-slot-name is provided for map slots')
  .option('--secret-key <key>', 'Secret key (Fr) for account creation - can be provided multiple times or comma-separated')
  .option('--secret-keys <keys>', 'Comma-separated list of secret keys (Fr) for account creation - alternative to multiple --secret-key')
  .option('--salt <salt>', 'Salt (Fr) for account creation - can be provided multiple times or comma-separated (defaults to 0 if not provided)')
  .option('--salts <salts>', 'Comma-separated list of salts (Fr) for account creation - alternative to multiple --salt (defaults to 0 if not provided)')
  .option('--status <status>', 'Note status (ACTIVE | CANCELLED | SETTLED)', 'ACTIVE')
  .option('--siloed-nullifier <nullifier>', 'Siloed nullifier (Fr) - optional')
  .option('--scopes <addresses>', 'Comma-separated list of scope addresses - optional')
  .option('--node-url <url>', 'Node URL (or "devnet"/"testnet" for network shortcuts)', resolveRpcUrl(process.env.CAZT_RPC_URL))
  .option('--debug', 'Enable debug logging', false)
  .action(async (options) => {
    const params: any = {
      contractAddress: options.contract,
      nodeUrl: resolveRpcUrl(options.nodeUrl),
      debug: options.debug || false,
    };
    
    // Artifact is required
    params.artifact = parseJsonOrFile(options.artifact);
    
    if (options.sender) {
      params.sender = options.sender;
    }

    // Storage slot options
    if (options.storageSlot) {
      params.storageSlot = options.storageSlot;
    }

    if (options.storageSlotName) {
      params.storageSlotName = options.storageSlotName;
    }

    if (options.storageSlotKey) {
      params.storageSlotKey = options.storageSlotKey;
    }

    // Handle multiple secret keys
    const secretKeys: string[] = [];
    if (options.secretKeys) {
      // Comma-separated list
      secretKeys.push(...options.secretKeys.split(',').map((s: string) => s.trim()));
    }
    // Commander allows multiple --secret-key flags, they come as an array
    if (options.secretKey) {
      if (Array.isArray(options.secretKey)) {
        secretKeys.push(...options.secretKey);
      } else {
        secretKeys.push(options.secretKey);
      }
    }
    if (secretKeys.length > 0) {
      params.secretKeys = secretKeys;
    }

    // Handle multiple salts
    const salts: string[] = [];
    if (options.salts) {
      // Comma-separated list
      salts.push(...options.salts.split(',').map((s: string) => s.trim()));
    }
    // Commander allows multiple --salt flags, they come as an array
    if (options.salt) {
      if (Array.isArray(options.salt)) {
        salts.push(...options.salt);
      } else {
        salts.push(options.salt);
      }
    }
    if (salts.length > 0) {
      params.salts = salts;
    }

    // Validate that if sender is provided, we should have secret keys for account creation
    if (options.sender && secretKeys.length === 0) {
      console.warn('Warning: Sender address provided but secret-key(s) are missing. Account creation will be skipped.');
    }

    if (options.contractSecretKey) {
      params.contractSecretKey = options.contractSecretKey;
    }

    try {
      const result = await AztecUtilities.fetchNotes(JSON.stringify(params));
      console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
    } catch (error: any) {
      console.error(`Error fetching notes: ${error.message}`);
      process.exit(1);
    }
  });

notesCmd
  .command('compute-hash')
  .description('Compute note hash(es). Can compute from scratch (items + slot) or from existing hashes (raw -> siloed -> unique).')
  .option('--raw-note-hash <hash>', 'Use existing raw note hash (skip computing from items)')
  .option('--siloed-note-hash <hash>', 'Use existing siloed note hash (skip computing from raw hash, requires --contract)')
  .option('--note-items <items>', 'Note items as comma-separated field values (e.g., "0x1,0x2,0x3") or JSON array or @file.json (required if not using --raw-note-hash or --siloed-note-hash)')
  .option('--storage-slot <slot>', 'Storage slot (Fr) - required if computing from items')
  .option('--partial', 'Use partial note hashing (2-step: commitment from private fields + storage slot, then final hash from commitment + value)')
  .option('--contract <address>', 'Contract address (required for siloed hash computation)')
  .option('--note-nonce <nonce>', 'Note nonce (required for unique hash computation)')
  .action(async (options) => {
    try {
      const params: any = {};
      
      // Determine which hash to start from
      if (options.siloedNoteHash) {
        // Start from siloed hash
        if (!options.contract) {
          throw new Error('--contract is required when using --siloed-note-hash');
        }
        params.siloedNoteHash = options.siloedNoteHash;
        params.contractAddress = options.contract;
      } else if (options.rawNoteHash) {
        // Start from raw hash
        params.rawNoteHash = options.rawNoteHash;
        if (options.contract) {
          params.contractAddress = options.contract;
        }
      } else {
        // Compute from items
        if (!options.noteItems) {
          throw new Error('--note-items is required when not using --raw-note-hash or --siloed-note-hash');
        }
        if (!options.storageSlot) {
          throw new Error('--storage-slot is required when computing from note items');
        }
        
        let noteItems: string[];
        
        // Check if it's a file reference
        if (options.noteItems.startsWith('@')) {
          const parsed = parseJsonOrFile(options.noteItems);
          if (!Array.isArray(parsed)) {
            throw new Error('note-items file must contain a JSON array');
          }
          noteItems = parsed;
        } else if (options.noteItems.trim().startsWith('[')) {
          // Try parsing as JSON array
          const parsed = JSON.parse(options.noteItems);
          if (!Array.isArray(parsed)) {
            throw new Error('note-items must be a JSON array or comma-separated values');
          }
          noteItems = parsed;
        } else {
          // Parse as comma-separated values
          noteItems = options.noteItems.split(',').map((item: string) => item.trim()).filter((item: string) => item.length > 0);
        }
        
        params.noteItems = noteItems;
        params.storageSlot = options.storageSlot;
        
        if (options.partial) {
          params.partial = true;
        }
      }
      
      // Add contract if provided (needed for siloed/unique computation)
      if (options.contract && !params.contractAddress) {
        params.contractAddress = options.contract;
      }
      
      // Add nonce if provided
      if (options.noteNonce) {
        if (!params.contractAddress && !params.siloedNoteHash) {
          throw new Error('--contract is required when using --note-nonce');
        }
        params.noteNonce = options.noteNonce;
      }
      
      const result = await AztecUtilities.computeNoteHash(JSON.stringify(params));
      
      // If result is an object (multiple hashes), always output as JSON
      if (typeof result === 'object') {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        outputResult(result, program.opts().json);
      }
    } catch (error: any) {
      console.error(`Error computing note hash: ${error.message}`);
      process.exit(1);
    }
  });

notesCmd
  .command('verify')
  .description('Verify if a note exists in a transaction')
  .requiredOption('--tx-hash <hash>', 'Transaction hash (required)')
  .option('--note-hash <hash>', 'Base note hash (default, use this or provide note content to compute)')
  .option('--contract <address>', 'Contract address (required if computing hash from content, or if siloing hash)')
  .option('--artifact <json>', 'Contract artifact JSON file path, artifact name (e.g., "aztec:Token"), or JSON string (required if computing hash from content)')
  .option('--note-content <json>', 'Note content as JSON object or @file.json (required if computing hash from content)')
  .option('--storage-slot <slot>', 'Storage slot (Fr) - can be a number or field value (required if computing hash from content)')
  .option('--node-url <url>', 'Node URL (or "devnet"/"testnet" for network shortcuts)', resolveRpcUrl(process.env.CAZT_RPC_URL))
  .option('--note-type-name <name>', 'Note type name from artifact (optional, for disambiguation when computing hash)')
  .option('--first-nullifier <nullifier>', 'First nullifier from transaction (optional, for unique hash computation)')
  .option('--note-index <index>', 'Note index in transaction (optional, for unique hash computation)')
  .action(async (options) => {
    try {
      const params: any = {
        txHash: options.txHash,
        nodeUrl: resolveRpcUrl(options.nodeUrl),
      };
      
      // If note hash is provided, use it directly
      if (options.noteHash) {
        params.noteHash = options.noteHash;
        if (options.contract) {
          params.contractAddress = options.contract;
        }
      } else {
        // Otherwise, compute from note content
        if (!options.contract) {
          throw new Error('--contract is required when computing hash from note content');
        }
        if (!options.artifact) {
          throw new Error('--artifact is required when computing hash from note content');
        }
        if (!options.noteContent) {
          throw new Error('--note-content is required when computing hash from note content');
        }
        if (!options.storageSlot) {
          throw new Error('--storage-slot is required when computing hash from note content');
        }
        
        params.contractAddress = options.contract;
        params.artifact = parseJsonOrFile(options.artifact);
        params.noteContent = parseJsonOrFile(options.noteContent);
        params.storageSlot = options.storageSlot;
        
        if (options.noteTypeName) {
          params.noteTypeName = options.noteTypeName;
        }
      }
      
      if (options.firstNullifier) {
        params.firstNullifier = options.firstNullifier;
      }
      
      if (options.noteIndex) {
        params.noteIndex = parseInt(options.noteIndex);
      }
      
      const result = await AztecUtilities.verifyNoteInTransaction(JSON.stringify(params));
      console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
    } catch (error: any) {
      console.error(`Error verifying note: ${error.message}`);
      process.exit(1);
    }
  });

// Deployment commands
const deployCmd = program.command('deploy').description('Deploy Aztec contracts');

// Simple deployment - just artifact
deployCmd
  .command('simple')
  .description('Deploy a contract (simplest form - just artifact)')
  .requiredOption('--artifact <artifact>', 'Contract artifact (aztec:ContractName, standards:ContractName, or file path)')
  .option('--node-url <url>', 'Node URL (or "devnet"/"testnet")', resolveRpcUrl(process.env.CAZT_RPC_URL))
  .option('--secret-key <key>', 'Secret key (Fr) for account creation')
  .option('--salt <salt>', 'Salt (Fr) for account creation (use "random" for random salt)')
  .option('--no-wait', 'Don\'t wait for deployment to complete', false)
  .option('--debug', 'Enable debug logging', false)
  .action(async (options) => {
    try {
      const params: any = {
        nodeUrl: resolveRpcUrl(options.nodeUrl),
        artifact: options.artifact,
        wait: !options.noWait,
        debug: options.debug || false,
      };

      if (options.secretKey) {
        params.secretKey = options.secretKey;
      }
      if (options.salt) {
        params.salt = options.salt;
      }

      const result = await AztecUtilities.deployContract(JSON.stringify(params));
      outputResult(result, program.opts().json);
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
      if (options.debug) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Deployment with salt
deployCmd
  .command('with-salt')
  .description('Deploy a contract with a specific salt for address computation')
  .requiredOption('--artifact <artifact>', 'Contract artifact (aztec:ContractName, standards:ContractName, or file path)')
  .requiredOption('--contract-salt <salt>', 'Salt (Fr) for contract address computation (use "random" for random salt)')
  .option('--node-url <url>', 'Node URL (or "devnet"/"testnet")', resolveRpcUrl(process.env.CAZT_RPC_URL))
  .option('--secret-key <key>', 'Secret key (Fr) for account creation')
  .option('--salt <salt>', 'Salt (Fr) for account creation (use "random" for random salt)')
  .option('--no-wait', 'Don\'t wait for deployment to complete', false)
  .option('--debug', 'Enable debug logging', false)
  .action(async (options) => {
    try {
      const params: any = {
        nodeUrl: resolveRpcUrl(options.nodeUrl),
        artifact: options.artifact,
        contractAddressSalt: options.contractSalt,
        wait: !options.noWait,
        debug: options.debug || false,
      };

      if (options.secretKey) {
        params.secretKey = options.secretKey;
      }
      if (options.salt) {
        params.salt = options.salt;
      }

      const result = await AztecUtilities.deployContract(JSON.stringify(params));
      outputResult(result, program.opts().json);
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
      if (options.debug) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Deployment with constructor arguments
deployCmd
  .command('with-args')
  .description('Deploy a contract with constructor arguments')
  .requiredOption('--artifact <artifact>', 'Contract artifact (aztec:ContractName, standards:ContractName, or file path)')
  .requiredOption('--args <args>', 'Constructor arguments (JSON array or comma-separated values)')
  .option('--constructor-name <name>', 'Constructor function name (if multiple constructors)')
  .option('--node-url <url>', 'Node URL (or "devnet"/"testnet")', resolveRpcUrl(process.env.CAZT_RPC_URL))
  .option('--secret-key <key>', 'Secret key (Fr) for account creation')
  .option('--salt <salt>', 'Salt (Fr) for account creation (use "random" for random salt)')
  .option('--contract-salt <salt>', 'Salt (Fr) for contract address computation (use "random" for random salt)')
  .option('--no-wait', 'Don\'t wait for deployment to complete', false)
  .option('--debug', 'Enable debug logging', false)
  .action(async (options) => {
    try {
      const params: any = {
        nodeUrl: resolveRpcUrl(options.nodeUrl),
        artifact: options.artifact,
        constructorArgs: options.args,
        wait: !options.noWait,
        debug: options.debug || false,
      };

      if (options.constructorName) {
        params.constructorName = options.constructorName;
      }
      if (options.secretKey) {
        params.secretKey = options.secretKey;
      }
      if (options.salt) {
        params.salt = options.salt;
      }
      if (options.contractSalt) {
        params.contractAddressSalt = options.contractSalt;
      }

      const result = await AztecUtilities.deployContract(JSON.stringify(params));
      outputResult(result, program.opts().json);
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
      if (options.debug) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Full deployment with all options
deployCmd
  .command('full')
  .description('Deploy a contract with all available options')
  .requiredOption('--artifact <artifact>', 'Contract artifact (aztec:ContractName, standards:ContractName, or file path)')
  .option('--args <args>', 'Constructor arguments (JSON array or comma-separated values)')
  .option('--constructor-name <name>', 'Constructor function name (if multiple constructors)')
  .option('--contract-salt <salt>', 'Salt (Fr) for contract address computation (use "random" for random salt)')
  .option('--deployer <address>', 'Deployer address (AztecAddress)')
  .option('--universal-deploy', 'Don\'t include sender in address computation', false)
  .option('--skip-class-publication', 'Skip contract class publication', false)
  .option('--skip-instance-publication', 'Skip instance publication', false)
  .option('--skip-initialization', 'Skip contract initialization', false)
  .option('--skip-registration', 'Skip contract registration in wallet', false)
  .option('--node-url <url>', 'Node URL (or "devnet"/"testnet")', resolveRpcUrl(process.env.CAZT_RPC_URL))
  .option('--secret-key <key>', 'Secret key (Fr) for account creation')
  .option('--salt <salt>', 'Salt (Fr) for account creation (use "random" for random salt)')
  .option('--no-wait', 'Don\'t wait for deployment to complete', false)
  .option('--debug', 'Enable debug logging', false)
  .action(async (options) => {
    try {
      const params: any = {
        nodeUrl: resolveRpcUrl(options.nodeUrl),
        artifact: options.artifact,
        wait: !options.noWait,
        debug: options.debug || false,
      };

      if (options.args) {
        params.constructorArgs = options.args;
      }
      if (options.constructorName) {
        params.constructorName = options.constructorName;
      }
      if (options.contractSalt) {
        params.contractAddressSalt = options.contractSalt;
      }
      if (options.deployer) {
        params.deployer = options.deployer;
      }
      if (options.universalDeploy) {
        params.universalDeploy = true;
      }
      if (options.skipClassPublication) {
        params.skipClassPublication = true;
      }
      if (options.skipInstancePublication) {
        params.skipInstancePublication = true;
      }
      if (options.skipInitialization) {
        params.skipInitialization = true;
      }
      if (options.skipRegistration) {
        params.skipRegistration = true;
      }
      if (options.secretKey) {
        params.secretKey = options.secretKey;
      }
      if (options.salt) {
        params.salt = options.salt;
      }

      const result = await AztecUtilities.deployContract(JSON.stringify(params));
      outputResult(result, program.opts().json);
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
      if (options.debug) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Artifacts commands
const artifactsCmd = program.command('artifacts').description('List available contract artifacts');
artifactsCmd
  .command('aztec')
  .description('List all available Aztec contract artifacts')
  .option('--full', 'Show full artifact details (default: show names only)', false)
  .action(async (options) => {
    try {
      const result = AztecUtilities.listArtifacts(JSON.stringify({ source: 'aztec' }));
      
      if (options.full) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        if (result.artifacts && Array.isArray(result.artifacts)) {
          result.artifacts.forEach((artifact: any) => {
            console.log(artifact.name);
          });
        }
      }
    } catch (error: any) {
      console.error(`Error listing artifacts: ${error.message}`);
      process.exit(1);
    }
  });

artifactsCmd
  .command('standards')
  .description('List all available Aztec Standards contract artifacts')
  .option('--full', 'Show full artifact details (default: show names only)', false)
  .action(async (options) => {
    try {
      const result = AztecUtilities.listArtifacts(JSON.stringify({ source: 'standards' }));
      
      if (options.full) {
        console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
      } else {
        if (result.artifacts && Array.isArray(result.artifacts)) {
          result.artifacts.forEach((artifact: any) => {
            console.log(artifact.name);
          });
        }
      }
    } catch (error: any) {
      console.error(`Error listing artifacts: ${error.message}`);
      process.exit(1);
    }
  });

// Note slot utility
program
  .command('note-slot')
  .description('Derive storage slot in a map')
  .requiredOption('--base-slot <slot>', 'Base storage slot (Fr)')
  .requiredOption('--key <key>', 'Key for the map (AztecAddress or Fr)')
  .action(async (options) => {
    const params = JSON.stringify({
      baseSlot: options.baseSlot,
      key: options.key,
    });
    
    try {
      const result = await AztecUtilities.deriveNoteSlot(params);
      outputResult(result, program.opts().json);
    } catch (error: any) {
      console.error(`Error deriving note slot: ${error.message}`);
      process.exit(1);
    }
  });

// Storage layout command
program
  .command('storage-layout')
  .description('Get storage layout from contract artifact')
  .requiredOption('--artifact <json>', 'Contract artifact JSON file path, artifact name (e.g., "aztec:Token"), or JSON string (required)')
  .action(async (options) => {
    const artifact = parseJsonOrFile(options.artifact);
    const params = JSON.stringify({ artifact });
    
    try {
      const result = AztecUtilities.getStorageLayout(params);
      console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
    } catch (error: any) {
      console.error(`Error getting storage layout: ${error.message}`);
      process.exit(1);
    }
  });

// Contract commands
const contractCmd = program.command('contract').description('Contract queries');
contractCmd.command('class').description('Get contract class').requiredOption('--id <id>', 'Class ID').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getContractClass', [options.id]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
contractCmd.command('get').description('Get contract').argument('<address>', 'Contract address').action(async (address) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getContract', [address]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});

// Node commands
const nodeCmd = program.command('node').description('Node info & fees');
nodeCmd.command('ready').description('Check if node is ready').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_isReady', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
nodeCmd.command('info').description('Get node info').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getNodeInfo', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
nodeCmd.command('node-version').description('Get node version').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getNodeVersion', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
nodeCmd.command('version').description('Get version').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getVersion', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
nodeCmd.command('chain-id').description('Get chain ID').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getChainId', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
nodeCmd.command('l1-addresses').description('Get L1 contract addresses').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getL1ContractAddresses', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
nodeCmd.command('protocol-addresses').description('Get protocol contract addresses').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getProtocolContractAddresses', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
nodeCmd.command('enr').description('Get encoded ENR').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getEncodedEnr', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
nodeCmd.command('base-fees').description('Get current base fees').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getCurrentBaseFees', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});

// Validators commands
const validatorsCmd = program.command('validators').description('Validators');
validatorsCmd.command('stats').description('Get validators stats').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getValidatorsStats', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
validatorsCmd.command('one').description('Get validator stats').requiredOption('--address <address>', 'Validator address').option('--from-slot <fromSlot>', 'From slot').option('--to-slot <toSlot>', 'To slot').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const params = [options.address];
  if (options.fromSlot) params.push(options.fromSlot);
  if (options.toSlot) params.push(options.toSlot);
  const result = await client.call('node_getValidatorStats', params);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});

// Debug commands
const debugCmd = program.command('debug').description('Debug helpers');
debugCmd.command('register-sigs').description('Register contract function signatures').requiredOption('--sigs <sigs>', 'JSON array or @file.json').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const sigs = parseJsonOrFile(options.sigs);
  const result = await client.call('node_registerContractFunctionSignatures', [sigs]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
debugCmd.command('allowed-public-setup').description('Get allowed public setup').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('node_getAllowedPublicSetup', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});

// Admin commands
const adminCmd = program.command('admin').description('Admin namespace (port 8880)');
adminCmd.command('get-config').description('Get admin config').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('nodeAdmin_getConfig', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
adminCmd.command('set-config').description('Set admin config').requiredOption('--json <json>', 'partial config JSON or @file.json').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const config = parseJsonOrFile(options.json);
  const result = await client.call('nodeAdmin_setConfig', [config]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
adminCmd.command('pause-sync').description('Pause sync').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('nodeAdmin_pauseSync', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
adminCmd.command('resume-sync').description('Resume sync').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('nodeAdmin_resumeSync', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
adminCmd.command('rollback-to').description('Rollback to block').requiredOption('--target-block-number <number>', 'Target block number').option('--force', 'Force rollback').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const params = [parseInt(options.targetBlockNumber), options.force || null];
  const result = await client.call('nodeAdmin_rollbackTo', params);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
adminCmd.command('start-snapshot-upload').description('Start snapshot upload').requiredOption('--location <location>', 'Location').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('nodeAdmin_startSnapshotUpload', [options.location]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
adminCmd.command('get-slash-payloads').description('Get slash payloads').action(async () => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('nodeAdmin_getSlashPayloads', []);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});
adminCmd.command('get-slash-offenses').description('Get slash offenses').option('--round <round>', 'Round', 'current').action(async (options) => {
  const client = new RpcClient({ rpcUrl: resolveRpcUrl(program.opts().rpcUrl), adminUrl: program.opts().adminUrl, pretty: !program.opts().noPretty });
  const result = await client.call('nodeAdmin_getSlashOffenses', [options.round]);
  console.log(client.formatOutput(result, !program.opts().noPretty));
});

// Helper to output raw or JSON
function outputResult(value: string | any, json: boolean = false): void {
  if (json) {
    const output = typeof value === 'string' ? { value } : value;
    console.log(JSON.stringify(output, null, program.opts().noPretty ? 0 : 2));
  } else {
    console.log(value);
  }
}

// Hash utilities
program.command('hash-zero').alias('hz').description('Prints the zero hash').action(async () => {
  const result = '0x0000000000000000000000000000000000000000000000000000000000000000';
  outputResult(result, program.opts().json);
});

program.command('keccak').alias('k').description('Keccak-256 hash').argument('[data]', 'The data to hash').action(async (data) => {
  try {
    const input = data || await readStdin();
    const result = await AztecUtilities.keccak(input);
    outputResult(`0x${result}`, program.opts().json);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
});

program.command('sha256').alias('sha').description('SHA-256 hash (Aztec standard)').argument('[data]', 'The data to hash').action(async (data) => {
  const input = data || await readStdin();
  const result = await AztecUtilities.sha256(input);
  outputResult(result, program.opts().json);
});

program.command('poseidon2').alias('p2').alias('poseidon').description('Poseidon2 hash').argument('<fields>', 'Comma-separated field values (e.g., "0x1,0x2,0x3") or JSON array').action(async (fields: string) => {
  try {
    let fieldsArray: string[];
    
    // Check if it's a JSON array
    if (fields.trim().startsWith('[')) {
      // Try parsing as JSON array
      const parsed = JSON.parse(fields);
      if (!Array.isArray(parsed)) {
        throw new Error('fields must be a JSON array or comma-separated values');
      }
      fieldsArray = parsed;
    } else {
      // Parse as comma-separated values
      fieldsArray = fields.split(',').map((item: string) => item.trim()).filter((item: string) => item.length > 0);
    }
    
    const result = await AztecUtilities.poseidon2(JSON.stringify(fieldsArray));
    outputResult(result, program.opts().json);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
});

program.command('pedersen').alias('ped').description('Pedersen hash').argument('<fields>', 'Comma-separated field values (e.g., "0x1,0x2,0x3") or JSON array').option('--index <index>', 'Hash index (default: 0)', '0').action(async (fields: string, options) => {
  try {
    let fieldsArray: string[];
    
    // Check if it's a JSON array
    if (fields.trim().startsWith('[')) {
      // Try parsing as JSON array
      const parsed = JSON.parse(fields);
      if (!Array.isArray(parsed)) {
        throw new Error('fields must be a JSON array or comma-separated values');
      }
      fieldsArray = parsed;
    } else {
      // Parse as comma-separated values
      fieldsArray = fields.split(',').map((item: string) => item.trim()).filter((item: string) => item.length > 0);
    }
    
    const params = JSON.stringify({
      inputs: fieldsArray,
      index: parseInt(options.index) || 0,
    });
    
    const result = await AztecUtilities.computePedersenHash(params);
    outputResult(result, program.opts().json);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
});

program.command('secret-hash').alias('sh').description('Compute secret hash').argument('<secret>', 'The secret value').action(async (secret: string) => {
  const result = await AztecUtilities.secretHash(secret);
  outputResult(result, program.opts().json);
});

program.command('silo-nullifier').alias('sn').description('Silo a nullifier with contract address').requiredOption('--contract <contract>', 'Contract address').requiredOption('--nullifier <nullifier>', 'Nullifier value').action(async (options) => {
  const result = await AztecUtilities.siloNullifier(options.contract, options.nullifier);
  outputResult(result, program.opts().json);
});

// Selector and signature utilities
program.command('sig').alias('selector').alias('si').description('Compute function selector from signature').argument('[sig]', 'Function signature').action(async (sig) => {
  const input = sig || await readStdin();
  const result = await AztecUtilities.selectorFromSignature(input);
  outputResult(result, program.opts().json);
});

program.command('field-from-string').alias('ffs').description('Convert string to field element').argument('<value>', 'String value to convert').action(async (value: string) => {
  const result = AztecUtilities.fieldFromString(value);
  outputResult(result, program.opts().json);
});

program.command('field-to-string').alias('fts').description('Convert field element to string').argument('<field>', 'Field value to convert').action(async (field: string) => {
  const result = AztecUtilities.fieldToString(field);
  outputResult(result, program.opts().json);
});

program.command('hash-vk').alias('vk').description('Hash verification key').argument('<fields>', 'JSON array of field values').action(async (fields: string) => {
  const result = await AztecUtilities.hashVK(fields);
  outputResult(result, program.opts().json);
});

program.command('note-hash-nonce').alias('nhn').description('Compute note hash nonce').requiredOption('--nullifier-zero <nullifierZero>', 'Nullifier zero').requiredOption('--index <index>', 'Note hash index').action(async (options) => {
  const result = await AztecUtilities.noteHashNonce(options.nullifierZero, parseInt(options.index));
  outputResult(result, program.opts().json);
});

program.command('silo-note-hash').alias('snh').description('Silo note hash to contract').requiredOption('--contract <contract>', 'Contract address').requiredOption('--note-hash <noteHash>', 'Note hash').action(async (options) => {
  const result = await AztecUtilities.siloNoteHash(options.contract, options.noteHash);
  outputResult(result, program.opts().json);
});

program.command('unique-note-hash').alias('unh').description('Compute unique note hash').requiredOption('--nonce <nonce>', 'Note nonce').requiredOption('--siloed-note-hash <siloedNoteHash>', 'Siloed note hash').action(async (options) => {
  const result = await AztecUtilities.uniqueNoteHash(options.nonce, options.siloedNoteHash);
  outputResult(result, program.opts().json);
});

program.command('silo-private-log').alias('spl').description('Silo private log tag').requiredOption('--contract <contract>', 'Contract address').requiredOption('--tag <tag>', 'Unsiloed tag').action(async (options) => {
  const result = await AztecUtilities.siloPrivateLog(options.contract, options.tag);
  outputResult(result, program.opts().json);
});

program.command('decrypt-private-log').alias('dpl').description('Decrypt a raw private log ciphertext').requiredOption('--ciphertext <ciphertext>', 'Comma-separated field values (e.g., "0x1,0x2,...") or JSON array or @file.json').requiredOption('--recipient-address <address>', 'Complete address of the recipient').requiredOption('--recipient-secret-key <key>', 'Secret key (Fr) of the recipient').action(async (options) => {
  try {
    let ciphertext: string[];
    
    // Check if it's a file reference
    if (options.ciphertext.startsWith('@')) {
      const parsed = parseJsonOrFile(options.ciphertext);
      if (!Array.isArray(parsed)) {
        throw new Error('ciphertext file must contain a JSON array');
      }
      ciphertext = parsed;
    } else if (options.ciphertext.trim().startsWith('[')) {
      // Try parsing as JSON array
      const parsed = JSON.parse(options.ciphertext);
      if (!Array.isArray(parsed)) {
        throw new Error('ciphertext must be a JSON array or comma-separated values');
      }
      ciphertext = parsed;
    } else {
      // Parse as comma-separated values
      ciphertext = options.ciphertext.split(',').map((item: string) => item.trim()).filter((item: string) => item.length > 0);
    }
    
    const params = JSON.stringify({
      ciphertext,
      recipientAddress: options.recipientAddress,
      recipientSecretKey: options.recipientSecretKey,
    });
    
    const result = await AztecUtilities.decryptRawPrivateLog(params);
    // Array output - always JSON
    console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
});

program.command('var-args-hash').alias('vah').description('Hash function arguments (for authwit)').argument('<fields>', 'JSON array of field values').action(async (fields: string) => {
  const result = await AztecUtilities.varArgsHash(fields);
  outputResult(result, program.opts().json);
});

program.command('calldata-hash').alias('cdh').description('Hash public function calldata').argument('<calldata>', 'JSON array of calldata fields').action(async (calldata: string) => {
  const result = await AztecUtilities.calldataHash(calldata);
  outputResult(result, program.opts().json);
});

program.command('l1-to-l2-message-nullifier').alias('l1l2n').description('Compute L1->L2 message nullifier').requiredOption('--contract <contract>', 'Contract address').requiredOption('--message-hash <messageHash>', 'Message hash').requiredOption('--secret <secret>', 'Secret').action(async (options) => {
  const result = await AztecUtilities.l1ToL2MessageNullifier(options.contract, options.messageHash, options.secret);
  outputResult(result, program.opts().json);
});

program.command('l2-to-l1-message-hash').alias('l2l1h').description('Compute L2->L1 message hash').argument('<params>', 'JSON object with l2Sender, l1Recipient, content, rollupVersion, chainId').action(async (params: string) => {
  const result = await AztecUtilities.l2ToL1MessageHash(params);
  outputResult(result, program.opts().json);
});

// Address utilities
program.command('address-zero').alias('az').description('Prints the zero address').action(async () => {
  const result = AztecUtilities.addressZero();
  outputResult(result, program.opts().json);
});

program.command('address-validate').alias('av').description('Validate Aztec address format').argument('<address>', 'Address to validate').action(async (address: string) => {
  const result = AztecUtilities.addressValidate(address);
  // This returns an object, so always output as JSON
  console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
});

program.command('public-data-slot').alias('pds').description('Compute public data tree leaf slot').requiredOption('--contract <contract>', 'Contract address').requiredOption('--slot <slot>', 'Storage slot').action(async (options) => {
  const result = await AztecUtilities.publicDataSlot(options.contract, options.slot);
  outputResult(result, program.opts().json);
});

program.command('address-random').alias('ar').description('Generate random valid Aztec address').action(async () => {
  const result = await AztecUtilities.addressRandom();
  outputResult(result, program.opts().json);
});

program.command('address-is-valid').alias('aiv').description('Check if address is valid').argument('<address>', 'Address to check').action(async (address: string) => {
  const result = await AztecUtilities.addressIsValid(address);
  // Boolean output - output as true/false string
  outputResult(result.toString(), program.opts().json);
});

program.command('address-to-point').alias('atp').description('Convert address to Grumpkin point').argument('<address>', 'Address to convert').action(async (address: string) => {
  const result = await AztecUtilities.addressToPoint(address);
  // Object output - always JSON
  console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
});

program.command('address-from-field').alias('aff').description('Create address from field').argument('<field>', 'Field value').action(async (field: string) => {
  const result = AztecUtilities.addressFromField(field);
  outputResult(result, program.opts().json);
});

program.command('address-from-bigint').alias('afb').description('Create address from bigint').argument('<value>', 'BigInt value').action(async (value: string) => {
  const result = AztecUtilities.addressFromBigInt(value);
  outputResult(result, program.opts().json);
});

program.command('address-from-number').alias('afn').description('Create address from number').argument('<value>', 'Number value').action(async (value: string) => {
  const result = AztecUtilities.addressFromNumber(parseInt(value));
  outputResult(result, program.opts().json);
});

// Selector utilities
program.command('selector-from-name-params').alias('sfnp').description('Create selector from function name and parameters').argument('<params>', 'JSON object with name and parameters').action(async (params: string) => {
  const result = await AztecUtilities.selectorFromNameParams(params);
  outputResult(result, program.opts().json);
});

program.command('selector-from-field').alias('sff').description('Create selector from field').argument('<field>', 'Field value').action(async (field: string) => {
  const result = AztecUtilities.selectorFromField(field);
  outputResult(result, program.opts().json);
});

program.command('selector-from-string').alias('sfs').description('Create selector from hex string').argument('<hex>', 'Hex string').action(async (hex: string) => {
  const result = AztecUtilities.selectorFromString(hex);
  outputResult(result, program.opts().json);
});

program.command('selector-empty').alias('se').description('Get empty selector').action(async () => {
  const result = AztecUtilities.selectorEmpty();
  outputResult(result, program.opts().json);
});

program.command('event-selector').alias('es').description('Compute event selector').argument('<sig>', 'Event signature').action(async (sig: string) => {
  const result = await AztecUtilities.eventSelector(sig);
  outputResult(result, program.opts().json);
});

program.command('note-selector').alias('ns').description('Compute note selector').argument('<sig>', 'Note signature').action(async (sig: string) => {
  const result = await AztecUtilities.noteSelector(sig);
  outputResult(result, program.opts().json);
});

// ABI encoding/decoding
program.command('abi-encode').alias('ae').description('ABI encode function arguments').argument('<params>', 'JSON object with abi and args').action(async (params: string) => {
  const result = AztecUtilities.abiEncode(params);
  // Array output - always JSON
  console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
});

program.command('abi-decode').alias('ad').description('ABI decode fields').argument('<params>', 'JSON object with types and fields').action(async (params: string) => {
  const result = AztecUtilities.abiDecode(params);
  // Decoded output - always JSON
  console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
});

program.command('decode-function-signature').alias('dfs').description('Decode function signature').argument('<params>', 'JSON object with name and parameters').action(async (params: string) => {
  const result = AztecUtilities.decodeFunctionSignature(params);
  outputResult(result, program.opts().json);
});

// Field utilities
program.command('field-random').alias('fr').description('Generate random field element').action(async () => {
  const result = AztecUtilities.fieldRandom();
  outputResult(result, program.opts().json);
});

program.command('field-from-buffer').alias('ffb').description('Create field from buffer').argument('<buffer>', 'Hex buffer').action(async (buffer: string) => {
  const result = AztecUtilities.fieldFromBuffer(buffer);
  outputResult(result, program.opts().json);
});

program.command('field-to-buffer').alias('ftb').description('Convert field to buffer').argument('<field>', 'Field value').action(async (field: string) => {
  const result = AztecUtilities.fieldToBuffer(field);
  outputResult(result, program.opts().json);
});

program.command('field-from-bigint').alias('ffbi').description('Create field from bigint').argument('<value>', 'BigInt value').action(async (value: string) => {
  const result = AztecUtilities.fieldFromBigInt(value);
  outputResult(result, program.opts().json);
});

program.command('field-to-bigint').alias('ftbi').description('Convert field to bigint').argument('<field>', 'Field value').action(async (field: string) => {
  const result = AztecUtilities.fieldToBigInt(field);
  outputResult(result, program.opts().json);
});

program.command('field-is-zero').alias('fiz').description('Check if field is zero').argument('<field>', 'Field value').action(async (field: string) => {
  const result = AztecUtilities.fieldIsZero(field);
  outputResult(result.toString(), program.opts().json);
});

program.command('field-equals').alias('fe').description('Compare two fields').argument('<field1>', 'First field').argument('<field2>', 'Second field').action(async (field1: string, field2: string) => {
  const result = AztecUtilities.fieldEquals(field1, field2);
  outputResult(result.toString(), program.opts().json);
});

// Artifact utilities
program.command('artifact-hash').alias('ah').description('Compute artifact hash').argument('<artifact>', 'Contract artifact JSON file path, artifact name (e.g., "aztec:Token"), or JSON string').action(async (artifact: string) => {
  const artifactObj = parseJsonOrFile(artifact);
  const result = await AztecUtilities.artifactHash(JSON.stringify(artifactObj));
  outputResult(result, program.opts().json);
});

program.command('artifact-hash-preimage').alias('ahp').description('Compute artifact hash preimage').argument('<artifact>', 'Contract artifact JSON file path, artifact name (e.g., "aztec:Token"), or JSON string').action(async (artifact: string) => {
  const artifactObj = parseJsonOrFile(artifact);
  const result = await AztecUtilities.artifactHashPreimage(JSON.stringify(artifactObj));
  // Object output - always JSON
  console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
});

program.command('artifact-metadata-hash').alias('amh').description('Compute artifact metadata hash').argument('<artifact>', 'Contract artifact JSON file path, artifact name (e.g., "aztec:Token"), or JSON string').action(async (artifact: string) => {
  const artifactObj = parseJsonOrFile(artifact);
  const result = AztecUtilities.artifactMetadataHash(JSON.stringify(artifactObj));
  outputResult(result, program.opts().json);
});

program.command('function-artifact-hash').alias('fah').description('Compute function artifact hash').argument('<function>', 'Function artifact JSON file path, artifact name (e.g., "aztec:Token"), or JSON string').action(async (function_: string) => {
  const functionObj = parseJsonOrFile(function_);
  const result = await AztecUtilities.functionArtifactHash(JSON.stringify(functionObj));
  outputResult(result, program.opts().json);
});

program.command('function-metadata-hash').alias('fmh').description('Compute function metadata hash').argument('<function>', 'Function artifact JSON file path, artifact name (e.g., "aztec:Token"), or JSON string').action(async (function_: string) => {
  const functionObj = parseJsonOrFile(function_);
  const result = AztecUtilities.functionMetadataHash(JSON.stringify(functionObj));
  outputResult(result, program.opts().json);
});

program.command('buffer-as-fields').alias('baf').description('Convert buffer to fields').argument('<params>', 'JSON object with buffer (hex) and targetLength').action(async (params: string) => {
  const result = AztecUtilities.bufferAsFields(params);
  // Array output - always JSON
  console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
});

// ABI type utilities
program.command('is-address-struct').alias('ias').description('Check if ABI type is address struct').argument('<abi_type>', 'ABI type JSON').action(async (abiType: string) => {
  const result = AztecUtilities.isAddressStruct(abiType);
  outputResult(result.toString(), program.opts().json);
});

program.command('is-eth-address-struct').alias('ieas').description('Check if ABI type is ETH address struct').argument('<abi_type>', 'ABI type JSON').action(async (abiType: string) => {
  const result = AztecUtilities.isEthAddressStruct(abiType);
  outputResult(result.toString(), program.opts().json);
});

program.command('is-aztec-address-struct').alias('iaas').description('Check if ABI type is Aztec address struct').argument('<abi_type>', 'ABI type JSON').action(async (abiType: string) => {
  const result = AztecUtilities.isAztecAddressStruct(abiType);
  outputResult(result.toString(), program.opts().json);
});

program.command('is-function-selector-struct').alias('ifss').description('Check if ABI type is function selector struct').argument('<abi_type>', 'ABI type JSON').action(async (abiType: string) => {
  const result = AztecUtilities.isFunctionSelectorStruct(abiType);
  outputResult(result.toString(), program.opts().json);
});

program.command('is-wrapped-field-struct').alias('iwfs').description('Check if ABI type is wrapped field struct').argument('<abi_type>', 'ABI type JSON').action(async (abiType: string) => {
  const result = AztecUtilities.isWrappedFieldStruct(abiType);
  outputResult(result.toString(), program.opts().json);
});

program.command('is-bounded-vec-struct').alias('ibvs').description('Check if ABI type is bounded vec struct').argument('<abi_type>', 'ABI type JSON').action(async (abiType: string) => {
  const result = AztecUtilities.isBoundedVecStruct(abiType);
  outputResult(result.toString(), program.opts().json);
});

// Contract artifact loading
program.command('load-contract-artifact').alias('lca').description('Load contract artifact from Noir compiled contract').argument('<noir_contract>', 'Noir compiled contract JSON file path, artifact name (e.g., "aztec:Token"), or JSON string').action(async (noirContract: string) => {
  const contractObj = parseJsonOrFile(noirContract);
  const result = AztecUtilities.loadContractArtifact(JSON.stringify(contractObj));
  console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
});

program.command('load-contract-artifact-for-public').alias('lcafp').description('Load contract artifact for public functions').argument('<noir_contract>', 'Noir compiled contract JSON file path, artifact name (e.g., "aztec:Token"), or JSON string').action(async (noirContract: string) => {
  const contractObj = parseJsonOrFile(noirContract);
  const result = AztecUtilities.loadContractArtifactForPublic(JSON.stringify(contractObj));
  console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
});

program.command('contract-artifact-to-buffer').alias('catb').description('Serialize contract artifact to buffer').argument('<artifact>', 'Contract artifact JSON file path, artifact name (e.g., "aztec:Token"), or JSON string').action(async (artifact: string) => {
  const artifactObj = parseJsonOrFile(artifact);
  const result = AztecUtilities.contractArtifactToBuffer(JSON.stringify(artifactObj));
  outputResult(result, program.opts().json);
});

program.command('contract-artifact-from-buffer').alias('cafb').description('Deserialize contract artifact from buffer').argument('<buffer>', 'Hex buffer').action(async (buffer: string) => {
  const result = AztecUtilities.contractArtifactFromBuffer(buffer);
  console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
});

// EthAddress utilities
program.command('eth-address-zero').alias('eaz').description('Get zero Ethereum address').action(async () => {
  const result = AztecUtilities.ethAddressZero();
  outputResult(result, program.opts().json);
});

program.command('eth-address-random').alias('ear').description('Generate random Ethereum address').action(async () => {
  const result = await AztecUtilities.ethAddressRandom();
  outputResult(result, program.opts().json);
});

program.command('eth-address-validate').alias('eav').description('Validate Ethereum address format').argument('<address>', 'Address to validate').action(async (address: string) => {
  const result = AztecUtilities.ethAddressValidate(address);
  console.log(JSON.stringify(result, null, program.opts().noPretty ? 0 : 2));
});

program.command('eth-address-from-field').alias('eaff').description('Create Ethereum address from field').argument('<field>', 'Field value').action(async (field: string) => {
  const result = AztecUtilities.ethAddressFromField(field);
  outputResult(result, program.opts().json);
});

program.command('eth-address-to-field').alias('eatf').description('Convert Ethereum address to field').argument('<address>', 'Ethereum address').action(async (address: string) => {
  const result = AztecUtilities.ethAddressToField(address);
  outputResult(result, program.opts().json);
});

program.command('eth-address-is-zero').alias('eaiz').description('Check if Ethereum address is zero').argument('<address>', 'Ethereum address').action(async (address: string) => {
  const result = AztecUtilities.ethAddressIsZero(address);
  outputResult(result.toString(), program.opts().json);
});

// Address computation utilities
program.command('compute-contract-address').alias('cca').description('Compute contract address from instance').argument('<instance>', 'Contract instance JSON').action(async (instance: string) => {
  const result = await AztecUtilities.computeContractAddress(instance);
  outputResult(result, program.opts().json);
});

program.command('compute-partial-address').alias('cpa').description('Compute partial address').argument('<instance>', 'Contract instance JSON').action(async (instance: string) => {
  const result = await AztecUtilities.computePartialAddress(instance);
  outputResult(result, program.opts().json);
});

program.command('compute-preaddress').alias('cpr').description('Compute preaddress').argument('<params>', 'JSON object with publicKeysHash and partialAddress').action(async (params: string) => {
  const result = await AztecUtilities.computePreaddress(params);
  outputResult(result, program.opts().json);
});

program.command('compute-address-from-keys').alias('cafk').description('Compute address from public keys and partial address').argument('<params>', 'JSON object with publicKeys and partialAddress').action(async (params: string) => {
  const result = await AztecUtilities.computeAddressFromKeys(params);
  outputResult(result, program.opts().json);
});

program.command('compute-salted-initialization-hash').alias('csih').description('Compute salted initialization hash').argument('<params>', 'JSON object with initializationHash, salt, and deployer').action(async (params: string) => {
  const result = await AztecUtilities.computeSaltedInitializationHash(params);
  outputResult(result, program.opts().json);
});

program.command('compute-initialization-hash').alias('cih').description('Compute initialization hash').argument('<params>', 'JSON object with initFn (optional) and args').action(async (params: string) => {
  const result = await AztecUtilities.computeInitializationHash(params);
  outputResult(result, program.opts().json);
});

// Helper function to read from stdin
async function readStdin(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    let input = '';
    rl.on('line', (line) => {
      input += line + '\n';
    });
    rl.on('close', () => {
      resolve(input.trim());
    });
  });
}

// Export program for testing
export { program };

// Only parse if this is the main module (not imported for testing)
// Check if we're being run directly (not imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('cli.js') || 
                     process.argv[1]?.endsWith('cli.ts') ||
                     (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test' && !process.argv[1]?.includes('jest'));

if (isMainModule) {
  program.parse();
}

