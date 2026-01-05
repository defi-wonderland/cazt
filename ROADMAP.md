# CAZT: Cast-like CLI for Aztec

## Motivation

Ethereum developers have `cast` from Foundry - a powerful CLI that makes common tasks trivial:
```bash
cast keccak "hello"           # Hash something
cast call 0x... "balanceOf(address)" 0x...  # Read contract
cast send 0x... "transfer(address,uint256)" ...  # Send tx
```

**Aztec developers have no equivalent.** Today, every interaction requires:

0. Using Aztec's CLI, which is not equivalent to cast
1. Writing a custom TypeScript script
2. Setting up wallet/PXE
3. Managing complex transaction construction

This friction slows down development, debugging, and adoption.

### Why Now?

- Devnet is live - developers are actively building
- The `aztec` CLI exists but is low-level and protocol-focused
- Foundry's `cast` has proven this UX pattern works
- Early tooling sets the standard for the ecosystem
- Focus developers on this tool, leaving `aztec` for Aztec engineers and node operators
- **Extensible foundation**: We can instantly integrate any new tool we (or the community) build - like the artifact registry, new hash functions, or protocol features - making CAZT the single entry point for Aztec developer tooling

## Scope

A CLI tool providing Foundry-like ergonomics for Aztec:

### Core Commands

```bash
# Key Management
cazt key generate                    # Generate secret key
cazt key derive-address <secret>     # Compute account address
cazt wallet sign <message>           # Sign with Schnorr

# Hash Functions
cazt hash keccak <data>              # Keccak256
cazt hash poseidon2 <fields>         # Poseidon2 (Aztec's native)
cazt hash pedersen <fields>          # Pedersen commitment

# Account Operations
cazt wallet deploy <secret>          # Deploy account contract
cazt wallet balance <address>        # Query token balance

# Contract Interaction
cazt contract deploy <artifact>      # Deploy contract
cazt contract call <address> <fn>    # View function
cazt contract simulate
cazt contract send <address> <fn>    # State-changing function
# Network Queries
cazt query block number              # Current block
cazt query storage <contract> <slot> # Public storage
cazt query tx <hash>                 # Transaction details

# Debugging
cazt tx analyze <hash>               # Decode effects, logs, gas
cazt tx decode-calldata <data>       # Decode with ABI
```

### Network Support
- `--sandbox` - Local sandbox (localhost:8080)
- `--devnet` - Aztec devnet
- `--testnet` - Future testnet
- `--rpc-url <url>` - Custom node

### Output Formats
- Human-readable by default (colored, formatted)
- `--json` flag for scripting/automation

## Command Domains

```
key
├── generate                                    # Generate a new random secret key
├── derive-keys <secret>                        # Derive all 4 master keys from secret
├── derive-address <secret> [--salt]            # Compute account address from secret
├── import <secret> --alias <name>              # Import secret key with alias
├── export <alias>                              # Export stored key by alias
├── list                                        # List all stored key aliases
├── sign <message> --secret <key>               # Sign message with Schnorr
├── verify <message> --sig <sig> --pubkey <pk>  # Verify Schnorr signature
└── keystore
    ├── create <file> --secret <key>            # Create encrypted keystore
    └── unlock <file> --password <pw>           # Decrypt keystore file

wallet
├── create [--type <schnorr>]                   # Create new account
├── deploy <secret> [--salt] [--type]           # Deploy account contract
├── info <address>                              # Query account info
├── address <secret> [--salt] [--type]          # Compute address (offline)
├── register <address> --secret <key>           # Register account with PXE
├── list                                        # List PXE-registered accounts
├── balance <address> --token <contract>        # Query token balance
├── vanity <prefix> [--suffix] [--type]         # Generate vanity address
└── authwit
    └── create <intent> --secret <key>          # Create authorization witness

contract
├── deploy <artifact> [--from <secret>] [--salt] [--args <json>] [--constructor <name>]
│                                               # Deploy contract from artifact
├── view <address> <function> [args...]         # Call view function
├── send <address> <function> [args...] --from <secret>
│                                               # Send state-changing tx
├── simulate <address> <function> [args...]     # Simulate without broadcast
├── info <address>                              # Query contract instance
├── class <class-id>                            # Query contract class
├── abi <artifact>                              # Display contract ABI
├── storage <address> [slot]                    # Read public storage
├── events <address> [--from <block>] [--to <block>]
│                                               # Query contract events
├── logs <address> [--from <block>] [--to <block>]
│                                               # Query contract logs
├── artifact
│   └── info <artifact>                         # Show artifact metadata
└── registry
    ├── list                                    # List registry artifacts
    ├── get <class-id> [--output <path>]        # Download from registry
    ├── upload <artifact>                       # Upload to registry
    └── search <query>                          # Search by name/class

query
├── public <contract> <slot>                    # Read public storage slot
├── notes <address> [--contract] [--status]     # Query notes for address
├── nullifiers <hash>                           # Check if nullifier exists
├── tx <hash>                                   # Query transaction
├── logs <address> [--from] [--to] [--type]     # Query logs for address
└── block
    ├── number                                  # Current block number
    ├── proven-number                           # Latest proven block
    ├── tips                                    # All block tips
    ├── get <number|hash> [--full]              # Get block details
    ├── range <from> <to> [--full]              # Get block range
    └── header <number|hash>                    # Get block header

tx
├── analyze <hash> [--effects] [--logs] [--gas] [--artifact <a>]
│                                               # Decode tx effects, logs, gas
├── compare <hash1> <hash2>                     # Compare two transactions
├── decode <calldata> --artifact <artifact> [--function <fn>]
│                                               # Decode calldata with artifact
├── status <hash>                               # Check tx status
├── receipt <hash>                              # Get full receipt
├── wait <hash> [--timeout <ms>]                # Wait for tx to mine
└── simulate <calldata> [--from] [--to]         # Simulate execution

node
├── ready                                       # Check node readiness
├── info                                        # Get full node info
├── version                                     # Get node version
├── chain-id                                    # Get chain ID
├── l1-addresses                                # Get L1 contract addresses
├── protocol-addresses                          # Get protocol addresses
├── enr                                         # Get ENR for P2P
├── base-fees                                   # Get current fees
└── sync-status                                 # Get sync status

bridge
├── l1-to-l2-witness <hash>                     # Get witness for message
├── l1-to-l2-block <hash>                       # Find block with message
├── is-l1-to-l2-synced <block>                  # Check sync status
├── l2-to-l1 <block>                            # Get L2→L1 messages
├── send-l1-to-l2 --recipient <addr> --content <data> --secret-hash <hash>
│                                               # Send L1→L2 message
├── consume-l1-to-l2 --message-hash <h> --secret <s>
│                                               # Consume message on L2
├── status <hash>                               # Check message status
└── pending [--direction <l1-to-l2|l2-to-l1>]   # List pending messages

monitor
├── blocks [--proven]                           # Stream new blocks
├── nullifiers [--contract <addr>]              # Stream nullifiers
├── notes <contract> [--slot]                   # Stream notes
├── address <address>                           # Stream address activity
├── messages [--direction]                      # Stream L1↔L2 messages
├── events <contract> [--event <name>]          # Stream contract events
├── logs [--contract <addr>]                    # Stream logs
└── pending [--from <addr>]                     # Stream pending pool

cast
├── hash
│   ├── zero                                    # Output zero hash
│   ├── keccak <data>                           # Keccak256 hash
│   ├── sha256 <data>                           # SHA256 hash
│   ├── poseidon2 <fields>                      # Poseidon2 hash
│   ├── pedersen <fields> [--index <i>]         # Pedersen hash
│   └── secret <secret>                         # Secret hash
├── address
│   ├── zero                                    # Zero Aztec address
│   ├── random                                  # Random address
│   ├── validate <address>                      # Validate format
│   ├── is-valid <address>                      # Returns bool
│   ├── from-field <field>                      # Field → address
│   ├── from-bigint <value>                     # Bigint → address
│   ├── from-number <value>                     # Number → address
│   └── to-point <address>                      # Address → point
├── eth
│   ├── zero                                    # Zero ETH address
│   ├── random                                  # Random ETH address
│   ├── validate <address>                      # Validate ETH address
│   ├── is-zero <address>                       # Check if zero
│   ├── from-field <field>                      # Field → ETH address
│   └── to-field <address>                      # ETH address → field
├── field
│   ├── random                                  # Random field
│   ├── from-string <value>                     # String → field
│   ├── to-string <field>                       # Field → string
│   ├── from-buffer <hex>                       # Buffer → field
│   ├── to-buffer <field>                       # Field → buffer
│   ├── from-bigint <value>                     # Bigint → field
│   ├── to-bigint <field>                       # Field → bigint
│   ├── is-zero <field>                         # Check if zero
│   └── equals <a> <b>                          # Compare fields
├── selector
│   ├── compute <signature>                     # Compute from sig
│   ├── event <signature>                       # Event selector
│   ├── note <signature>                        # Note selector
│   ├── from-field <field>                      # Field → selector
│   ├── from-string <hex>                       # String → selector
│   └── empty                                   # Empty selector
├── abi
│   ├── encode <types> <values>                 # ABI encode
│   ├── decode <types> <data>                   # ABI decode
│   └── decode-sig <signature>                  # Parse signature
├── nullifier
│   ├── silo --contract <c> --nullifier <n>     # Silo nullifier
│   └── l1-to-l2 --contract <c> --message-hash <h> --secret <s>
│                                               # L1→L2 nullifier
├── note
│   ├── hash-nonce --nullifier-zero <n> --index <i>
│   │                                           # Compute nonce hash
│   ├── silo-hash --contract <c> --note-hash <h>
│   │                                           # Silo note hash
│   └── unique-hash --nonce <n> --siloed-note-hash <h>
│                                               # Unique note hash
├── artifact
│   ├── hash <artifact>                         # Artifact hash
│   ├── load <path>                             # Load artifact
│   ├── to-buffer <artifact>                    # Serialize
│   └── from-buffer <buffer>                    # Deserialize
├── message
│   └── l2-to-l1-hash <params>                  # L2→L1 message hash
└── log
    ├── silo-private --contract <c> --tag <t>   # Silo private log
    ├── decrypt-private <ciphertext> --recipient-address <a> --recipient-secret-key <k>
    │                                           # Decrypt private log
    ├── calldata-hash <calldata>                # Hash calldata
    ├── var-args-hash <fields>                  # Hash var args
    ├── public-data-slot --contract <c> --slot <s>
    │                                           # Public data slot
    ├── hash-vk <fields>                        # Hash VK
    └── buffer-as-fields <buffer> [--length]    # Buffer → fields
```

## Potential Features

### CLI Builder
Generate a custom CLI from any contract artifact. Automatically maps the ABI to commands:

```bash
# Generate CLI for a Token contract
cazt generate-cli Token.json --name token-cli

# Auto-generated commands based on ABI:
token-cli mint --to 0x123... --amount 1000
token-cli transfer --from 0x123... --to 0x456... --amount 500
token-cli balance-of --owner 0x123...
token-cli total-supply
```

- Each external function becomes a subcommand
- Function parameters become named CLI arguments
- Return types are formatted for human/JSON output
- Private vs public functions handled automatically

### Sandbox Addons

#### Startup Transactions
Pre-configure a set of transactions to execute during sandbox startup:

```bash
# Define startup script
cazt sandbox init --script setup.cazt

# setup.cazt example:
# Deploy common contracts, mint test tokens, create test accounts
wallet deploy $ALICE_SECRET
wallet deploy $BOB_SECRET
contract deploy Token.json --from $ALICE_SECRET --salt 1
contract send $TOKEN mint --to $ALICE --amount 1000000
```

- Reproducible local environments
- Share setup scripts across team
- Fast reset to known state

#### Error Telemetry
Opt-in telemetry to understand common developer pain points:

```bash
# Enable telemetry
cazt config set telemetry true

# Collected (anonymized):
# - Command usage frequency
# - Error types and messages
# - Time to complete operations
# - Network targets (sandbox/devnet/testnet)
```

- Identify most common errors
- Prioritize UX improvements
- Understand real usage patterns
- Fully opt-in, privacy-respecting

## Estimation

<!-- TODO: Fill in estimates -->

| Domain | Effort | Notes |
|--------|--------|-------|
| key | | |
| wallet | | |
| contract | | |
| query | | |
| tx | | |
| node | | |
| bridge | | |
| monitor | | |
| cast | | |

## Current Status

🎨 **Vibe coded** - Functional prototype with rough edges

- CLI framework built with Commander.js
- ~127 commands defined across 9 domains
- Some tests passing
- Core functionality works (key generation, hashing, contract deployment)
- Needs polish, error handling, edge cases

## Dependencies

`@aztec/* packages`: API changes will break CLI
WASM/crypto libs: platform compatibility?

## Target Audience

**Primary:** dApp developers building on Aztec

**What we know:**
- They need to deploy contracts
- They need to interact with deployed contracts
- They need to debug transactions
- They want Foundry-like ergonomics

**What we don't know:**
- Their current workflow 🤷
- Pain points beyond "writing scripts is tedious"
- Which commands they'd use most

**TODO:** User research / interviews with devnet builders

## Differentiation from `aztec` CLI

| Feature | `aztec` CLI | `cazt` |
|---------|-------------|--------|
| Target user | Protocol engineers, node operators | dApp developers |
| Focus | Node management, protocol ops | Contract interaction, debugging |
| UX | Functional | Developer-friendly (Foundry-like) |
| Contract deployment | Basic | With sponsored fees, auto-account |
| Transaction analysis | Limited | Rich decoding, comparison |
| Artifact registry | ❌ | ✅ Integrated |
| Extensibility | Protocol-bound | Community tools |

## Testing Strategy

### Automated Testing
- Subprocess tests using `execSync` to call built CLI
- Tests both human-readable and `--json` output
- Offline tests for pure utilities (hash, address, field)
- Network tests use `--sandbox` flag

### Manual Testing
- End-to-end workflows on devnet
- Contract deployment + interaction flows
- Error handling and edge cases

**Current coverage:**
- ~120+ tests across domains
- Focus on happy paths
- Edge cases need more coverage

## Difficult Parts

- PXE and Sandbox ephemeral state

- ABI Encoding for Noir Types

- aztec-cli have tons of dependencies (wasm, crypto libs, etc)