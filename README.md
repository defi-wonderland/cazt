# CAZT

> A Swiss Army knife for interacting with Aztec applications from the command line

[![GitHub](https://img.shields.io/badge/github-defi--wonderland%2Fcazt-blue)](https://github.com/defi-wonderland/cazt)

**CAZT = cast + Aztec** is a command-line tool inspired by Foundry's `cast`, but specifically designed for the Aztec Network. It provides a comprehensive set of utilities for interacting with Aztec nodes, computing hashes, managing addresses, and working with Aztec-specific data structures.

## Installation

### Prerequisites

- **Node.js** 20+ and npm/yarn
- (Optional) Access to an Aztec Node for RPC commands

### From Source

```bash
# Clone and build
git clone https://github.com/defi-wonderland/cazt.git
cd cazt
yarn install
yarn build

# Make cazt available globally via symlink
yarn link
# or with npm:
npm link
```

After linking, you can use `cazt` from anywhere:

```bash
cazt --help
```

### Development Setup

For local development without global installation:

```bash
git clone https://github.com/defi-wonderland/cazt.git
cd cazt
yarn install

# Use directly (no build needed)
yarn start --help
# or
npx tsx cli/cli.ts --help

# Or build and use locally
yarn build
./bin/cazt --help
```

### Building Aztec Standards Artifacts

To use Aztec Standards contract artifacts, you need to build them first:

```bash
# Build aztec-standards artifacts (stored in .aztec-standards/)
yarn build-aztec-standards [commit-or-tag]

# Default builds from origin/dev
yarn build-aztec-standards
```

This will clone the [aztec-standards repository](https://github.com/defi-wonderland/aztec-standards), build the contracts, and store the artifacts in `.aztec-standards/target/` (hidden folder).

### Troubleshooting

If `cazt` command is not found after installation:

```bash
# Add npm global bin to PATH
echo 'export PATH="$(npm bin -g):$PATH"' >> ~/.zshrc && source ~/.zshrc
# (Use ~/.bashrc for bash)
```

## Usage

### Basic Commands

```bash
# Get help
cazt --help

# Utility commands (output raw values by default)
cazt address-zero
cazt keccak "hello world"
cazt field-random
cazt sha256 "test"

# Output as JSON
cazt --json address-zero

# RPC commands (require running Aztec node)
cazt block number
cazt tx get <tx-hash>
```

### Configuration

Set environment variables or use flags:

```bash
# Set default RPC URL
export CAZT_RPC_URL=http://localhost:8080
export CAZT_ADMIN_URL=http://localhost:8880

# Or use flags
cazt --rpc-url http://localhost:8080 block number

# Use network shortcuts (devnet, testnet)
cazt --rpc-url devnet block number
cazt --rpc-url testnet block number
```

**Network Shortcuts:**
- `devnet` → `https://devnet.aztec-labs.com`
- `testnet` → `https://aztec-testnet-fullnode.zkv.xyz`

## Features

### Utility Commands

- **Aztec Address utilities**: `address-zero`, `address-random`, `address-validate`, `address-from-field`, `address-to-point`, etc.
- **Ethereum Address utilities**: `eth-address-zero`, `eth-address-random`, `eth-address-validate`, `eth-address-from-field`, `eth-address-to-field`, `eth-address-is-zero`
- **Address computation**: `compute-contract-address`, `compute-partial-address`, `compute-preaddress`, `compute-address-from-keys`, `compute-salted-initialization-hash`, `compute-initialization-hash`
- **Hash functions**: `keccak`, `sha256`, `poseidon2`, `pedersen`, `secret-hash`, `hash-vk`, `var-args-hash`, `calldata-hash`, etc.
- **Field operations**: `field-random`, `field-from-string`, `field-to-string`, `field-equals`, `field-is-zero`, `field-from-buffer`, `field-to-buffer`, etc.
- **Selector utilities**: `sig`, `selector-from-signature`, `event-selector`, `note-selector`, `selector-from-field`, etc.
- **ABI encoding/decoding**: `abi-encode`, `abi-decode`, `decode-function-signature`
- **Contract artifacts**: `artifact-hash`, `artifact-hash-preimage`, `artifact-metadata-hash`, `function-artifact-hash`, `load-contract-artifact`, etc.
- **Note & Nullifier utilities**: `silo-nullifier`, `silo-note-hash`, `unique-note-hash`, `note-hash-nonce`, `silo-private-log`
- **Message utilities**: `l1-to-l2-message-nullifier`, `l2-to-l1-message-hash`
- **Storage utilities**: `public-data-slot`, `note-slot`, `storage-layout`

### Note Queries

- **Fetch notes**: `notes fetch` - Fetch notes from a wallet for a given storage slot
  - Automatically deserializes notes (replaces note buffer with array of field strings)
  - Registers contract with wallet using provided artifact
  - Creates accounts from secret keys and adds them to scopes
  - Supports multiple accounts via multiple secret keys

- **Compute note hash**: `notes compute-hash` - Compute note hash(es) from note items or existing hashes
  - Can compute raw, siloed, and unique note hashes progressively
  - Supports partial notes (2-step hashing for UintNote-like structures)
  - Accepts comma-separated field values or JSON arrays

- **Verify note**: `notes verify` - Verify if a note exists in a transaction
  - Can use note hash directly or compute from note content
  - Supports checking raw, siloed, or unique note hashes

### Artifact Management

- **List artifacts**: `artifacts aztec` - List all available Aztec contract artifacts from `@aztec/noir-contracts.js`
- **List standards**: `artifacts standards` - List all available Aztec Standards contract artifacts from `.aztec-standards/target/`

### RPC Commands

- **Block queries**: `block number`, `block get`, `block header`
- **Transaction queries**: `tx get`, `tx receipt`
- **State queries**: `state storage`, `state note`
- **Merkle tree queries**: `merkle root`, `merkle siblings`
- **Logs**: `logs get`, `logs get-unencrypted`
- **Contract queries**: `contract call`, `contract view`
- **Node info**: `node version`, `node status`

### Output Format

By default, utility commands output raw values (like `cast`):

```bash
$ cazt address-zero
0x0000000000000000000000000000000000000000000000000000000000000000

$ cazt keccak "hello"
0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad
```

Use `--json` flag for JSON output:

```bash
$ cazt --json address-zero
{
  "value": "0x0000000000000000000000000000000000000000000000000000000000000000"
}
```

RPC commands always output JSON (pretty-printed by default, use `--no-pretty` for compact).

## Examples

### Basic Utilities

```bash
# Generate a random field element
cazt field-random

# Compute Keccak hash
cazt keccak "hello world"

# Compute function selector
cazt sig "transfer(address,uint256)"

# Validate an Aztec address
cazt address-validate "0x0000000000000000000000000000000000000000000000000000000000000000"

# Validate an Ethereum address
cazt eth-address-validate "0x0000000000000000000000000000000000000000"

# Get zero addresses
cazt address-zero
cazt eth-address-zero

# Compute Poseidon2 hash (supports comma-separated or JSON array)
cazt poseidon2 0x1,0x2,0x3
cazt poseidon2 '["0x1","0x2","0x3"]'

# Compute Pedersen hash
cazt pedersen 0x1,0x2,0x3
cazt pedersen 0x1,0x2,0x3 --index 5

# Silo a nullifier
cazt silo-nullifier --contract <address> --nullifier <value>
```

### Note Queries

```bash
# Fetch notes using artifact name (from aztec or standards)
cazt notes fetch \
  --contract 0x08ded8acfa50e8d138c782f84f835133c1ca4803040bf6dc2bfd028294321373 \
  --artifact standards:Token \
  --storage-slot-name private_balances \
  --storage-slot-key 0x18db9a39c0c2475c662aa7babc1dedec40b5a7cb1779fc96e763364f2328c12d \
  --sender 0x11deabd59b872d17c737b66f61d332230f341e774c6b5d3762f46a74536f947f \
  --secret-key 0x0aebd1b4be76efa44f5ee655c20bf9ea60f7ae44b9a7fd1fd9f189c7a0b0cdae

# Fetch notes using direct storage slot
cazt notes fetch \
  --contract <address> \
  --artifact path/to/artifact.json \
  --storage-slot 7 \
  --sender <sender-address> \
  --secret-key <secret-key>

# Fetch notes with multiple accounts (comma-separated or multiple flags)
cazt notes fetch \
  --contract <address> \
  --artifact aztec:Token \
  --storage-slot-name balances \
  --storage-slot-key <user-address> \
  --secret-keys <key1>,<key2> \
  --salts <salt1>,<salt2>

# Or use multiple flags
cazt notes fetch \
  --contract <address> \
  --artifact aztec:Token \
  --storage-slot-name balances \
  --storage-slot-key <user-address> \
  --secret-key <key1> --secret-key <key2> \
  --salt <salt1> --salt <salt2>

# Fetch notes with additional filters
cazt notes fetch \
  --contract <address> \
  --artifact standards:Token \
  --storage-slot-name private_balances \
  --storage-slot-key <user-address> \
  --sender <sender-address> \
  --secret-key <secret-key> \
  --status ACTIVE \
  --siloed-nullifier <nullifier> \
  --scopes <address1>,<address2>

# Fetch notes with debug logging (shows PXE INFO logs)
cazt notes fetch \
  --contract <address> \
  --artifact standards:Token \
  --storage-slot-name private_balances \
  --storage-slot-key <user-address> \
  --sender <sender-address> \
  --secret-key <secret-key> \
  --debug

# Register contract with secret key for note decryption
cazt notes fetch \
  --contract <address> \
  --artifact standards:Token \
  --contract-secret-key <contract-secret-key> \
  --storage-slot-name private_balances \
  --storage-slot-key <user-address> \
  --sender <sender-address> \
  --secret-key <secret-key>
```

### Note Hash Computation

```bash
# Compute raw note hash from note items and storage slot
cazt notes compute-hash \
  --note-items 0x1,0x2,0x3 \
  --storage-slot 0x098022aaadde6cfc46ad7213b08210ebd64f1b11aeb7acb28015386a6e6bdd1a

# Compute raw, siloed, and unique note hashes progressively
cazt notes compute-hash \
  --note-items 0x1,0x2,0x3 \
  --storage-slot 0x098022aaadde6cfc46ad7213b08210ebd64f1b11aeb7acb28015386a6e6bdd1a \
  --contract 0x18b953ef8d49994a0d1eb715ffe1dee4ba44a59d9f6c3bd8f08cc4d837533e0b \
  --note-nonce 0x1234

# Compute from existing raw note hash
cazt notes compute-hash \
  --raw-note-hash 0x1234... \
  --contract 0x18b953ef8d49994a0d1eb715ffe1dee4ba44a59d9f6c3bd8f08cc4d837533e0b \
  --note-nonce 0x5678

# Compute partial note hash (2-step hashing for UintNote)
cazt notes compute-hash \
  --note-items 0xowner,0xrandomness,0xvalue \
  --storage-slot 0x098022aaadde6cfc46ad7213b08210ebd64f1b11aeb7acb28015386a6e6bdd1a \
  --partial

# Use JSON array format
cazt notes compute-hash \
  --note-items '["0x1","0x2","0x3"]' \
  --storage-slot 0x098022aaadde6cfc46ad7213b08210ebd64f1b11aeb7acb28015386a6e6bdd1a
```

**Note Hash Computation Options:**
- `--note-items <items>` (required if not using `--raw-note-hash` or `--siloed-note-hash`): Comma-separated field values (e.g., `"0x1,0x2,0x3"`), JSON array, or `@file.json`
- `--storage-slot <slot>` (required if computing from items): Storage slot (Fr)
- `--raw-note-hash <hash>` (optional): Use existing raw note hash (skip computing from items)
- `--siloed-note-hash <hash>` (optional): Use existing siloed note hash (requires `--contract`)
- `--contract <address>` (optional): Contract address (required for siloed/unique hash computation)
- `--note-nonce <nonce>` (optional): Note nonce (required for unique hash computation)
- `--partial` (optional): Use partial note hashing (2-step: commitment from private fields + storage slot, then final hash from commitment + value)

**Note Hash Computation Output:**
Returns JSON with computed hashes:
```json
{
  "rawNoteHash": "0x...",
  "siloedNoteHash": "0x...",
  "uniqueNoteHash": "0x..."
}
```

### Note Verification

```bash
# Verify note using note hash directly
cazt notes verify \
  --tx-hash 0x1234... \
  --note-hash 0x5678...

# Verify note with contract (for siloed hash check)
cazt notes verify \
  --tx-hash 0x1234... \
  --note-hash 0x5678... \
  --contract 0x18b953ef8d49994a0d1eb715ffe1dee4ba44a59d9f6c3bd8f08cc4d837533e0b

# Verify note by computing hash from content
cazt notes verify \
  --tx-hash 0x1234... \
  --contract 0x18b953ef8d49994a0d1eb715ffe1dee4ba44a59d9f6c3bd8f08cc4d837533e0b \
  --artifact standards:Token \
  --note-content '{"value": 1000, "owner": "0x..."}' \
  --storage-slot 0x098022aaadde6cfc46ad7213b08210ebd64f1b11aeb7acb28015386a6e6bdd1a

# Verify unique note hash
cazt notes verify \
  --tx-hash 0x1234... \
  --note-hash 0x5678... \
  --contract 0x18b953ef8d49994a0d1eb715ffe1dee4ba44a59d9f6c3bd8f08cc4d837533e0b \
  --first-nullifier 0xabcd... \
  --note-index 0

# Use network shortcuts for node URL
cazt notes verify \
  --tx-hash 0x1234... \
  --note-hash 0x5678... \
  --node-url devnet
```

**Note Verification Options:**
- `--tx-hash <hash>` (required): Transaction hash
- `--note-hash <hash>` (optional): Base note hash (use this or provide note content to compute)
- `--contract <address>` (optional): Contract address (required if computing hash from content, or if siloing hash)
- `--artifact <json>` (optional): Contract artifact (required if computing hash from content)
- `--note-content <json>` (optional): Note content as JSON object or `@file.json` (required if computing hash from content)
- `--storage-slot <slot>` (optional): Storage slot (required if computing hash from content)
- `--node-url <url>` (optional): Node URL (or `devnet`/`testnet` for network shortcuts)
- `--note-type-name <name>` (optional): Note type name from artifact (for disambiguation)
- `--first-nullifier <nullifier>` (optional): First nullifier from transaction (for unique hash computation)
- `--note-index <index>` (optional): Note index in transaction (for unique hash computation)

**Note Verification Output:**
Returns JSON with verification result:
```json
{
  "exists": true,
  "noteHash": "0x...",
  "siloedNoteHash": "0x...",
  "uniqueNoteHash": "0x...",
  "txHash": "0x...",
  "noteHashes": ["0x...", "0x..."],
  "firstNullifier": "0x..."
}
```

**Note Fetch Options:**
- `--contract <address>` (required): Contract address
- `--artifact <path|name>` (required): Artifact file path, artifact name (e.g., `aztec:Token`, `standards:Token`), or JSON string
- `--contract-secret-key <key>` (optional): Secret key for contract registration (needed for note decryption)
- `--sender <address>` (optional): Sender address to register with wallet and use for scopes filtering
- `--storage-slot <slot>` (optional): Direct storage slot (Fr) - number or field value
- `--storage-slot-name <name>` (optional): Storage slot name from artifact (e.g., "balances", "private_balances")
- `--storage-slot-key <key>` (optional): Key for deriving slot in map (required if using `--storage-slot-name` for map slots)
- `--secret-key <key>` (optional): Secret key for account creation (can be provided multiple times)
- `--secret-keys <keys>` (optional): Comma-separated list of secret keys (alternative to multiple `--secret-key`)
- `--salt <salt>` (optional): Salt for account creation (defaults to 0 if not provided, can be provided multiple times)
- `--salts <salts>` (optional): Comma-separated list of salts (alternative to multiple `--salt`)
- `--status <status>` (optional): Note status filter - `ACTIVE`, `CANCELLED`, or `SETTLED` (default: `ACTIVE`)
- `--siloed-nullifier <nullifier>` (optional): Filter by siloed nullifier
- `--scopes <addresses>` (optional): Comma-separated list of scope addresses (account addresses are automatically added)
- `--node-url <url>` (optional): Node URL (default: `http://localhost:8080` or `CAZT_RPC_URL` env var)
- `--debug` (optional): Enable debug logging (shows PXE INFO logs, otherwise suppressed)

**Note Fetch Output:**
Returns JSON with a `notes` array. Each note contains:
- `note`: Array of deserialized field strings (replaces the raw note buffer)
- `recipient`: Recipient address
- `contractAddress`: Contract address
- `storageSlot`: Storage slot
- `txHash`: Transaction hash
- `noteNonce`: Note nonce

### Artifact Management

```bash
# List all available Aztec contract artifacts
cazt artifacts aztec

# List with full details
cazt artifacts aztec --full

# List all available Aztec Standards contract artifacts
cazt artifacts standards

# List with full details
cazt artifacts standards --full
```

### Storage Utilities

```bash
# Derive storage slot in a map
cazt note-slot \
  --base-slot 0x1234... \
  --key 0x18db9a39c0c2475c662aa7babc1dedec40b5a7cb1779fc96e763364f2328c12d

# Get storage layout from artifact
cazt storage-layout --artifact path/to/artifact.json
# or using artifact name
cazt storage-layout --artifact aztec:Token
cazt storage-layout --artifact standards:Escrow
```

### RPC Commands

```bash
# Get block number (requires running node)
cazt block number

# Call a contract function (requires running node)
cazt contract call --address <address> --function <selector> --args <args>
```

## Artifact Sources

CAZT supports multiple artifact sources:

1. **Aztec artifacts** (`aztec:ContractName`): Built-in artifacts from `@aztec/noir-contracts.js`
   - Example: `aztec:Token`, `aztec:Escrow`

2. **Standards artifacts** (`standards:ContractName`): Artifacts from Aztec Standards (requires building first)
   - Example: `standards:Token`, `standards:Escrow`
   - Build with: `yarn build-aztec-standards`

3. **File paths**: Direct paths to JSON artifact files
   - Example: `path/to/artifact.json` or `@artifact.json`

4. **JSON strings**: Inline JSON artifact data

## Notes Fetch Details

The `notes fetch` command:

1. **Connects to Aztec Node**: Creates a connection to the specified node (default: `http://localhost:8080`)
2. **Creates Wallet**: Sets up a TestWallet with PXE
3. **Registers Contract**: Registers the contract with the wallet using the provided artifact (and optional contract secret key for decryption)
4. **Registers Sender**: If `--sender` is provided, registers the sender address with the wallet
5. **Creates Accounts**: Creates account managers from provided secret keys (salt defaults to 0 if not provided)
6. **Determines Scopes**: Combines provided scopes with all account manager addresses
7. **Fetches Notes**: Retrieves notes matching the filter criteria
8. **Deserializes Notes**: Automatically deserializes note buffers into arrays of field strings

**Important Notes:**
- Salt defaults to `Fr.ZERO` (0) if not provided
- Multiple secret keys create multiple account managers, all added to scopes
- The contract must be registered before fetching notes (done automatically)
- Notes are automatically deserialized - the raw note buffer is replaced with an array of field strings
- PXE INFO logs are suppressed by default (use `--debug` to see them)

## Development

```bash
# Install dependencies
yarn install

# Build (compiles TypeScript to dist/)
yarn build

# Run in development mode (no build needed, uses tsx)
yarn start --help
yarn start address-zero

# Or run directly with tsx
npx tsx cli/cli.ts --help

# Clean build artifacts
yarn clean

# Make cazt globally available via symlink
yarn link
# or with npm:
npm link
# Then use: cazt --help (from anywhere)

# Build aztec-standards artifacts
yarn build-aztec-standards

# Run tests
yarn test
```

### Project Structure

```
cazt/
├── bin/
│   └── cazt              # Wrapper script (executes dist/cli.js)
├── cli/                  # TypeScript source files
│   ├── cli.ts           # Main CLI entry point
│   ├── index.ts         # Library exports
│   ├── test.ts          # Test suite
│   └── utils/           # Utility modules
├── dist/                # Compiled JavaScript (generated)
├── .aztec-standards/    # Aztec Standards artifacts (hidden, generated)
│   ├── artifacts/       # TypeScript artifact files
│   └── target/          # JSON artifact files
├── scripts/             # Build scripts
│   └── build-aztec-standards.ts
└── package.json
```

## Repository

- **GitHub**: https://github.com/defi-wonderland/cazt
- **Version**: 3.0.0-devnet.2
