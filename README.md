# CAZT

> A Swiss Army knife for interacting with Aztec applications from the command line

**CAZT = cast + Aztec** — A command-line tool inspired by Foundry's `cast`, specifically designed for the Aztec Network.

## Installation

### Prerequisites

- **Node.js** 20+
- **yarn** or **npm**

### From Source

```bash
git clone https://github.com/defi-wonderland/cazt.git
cd cazt
yarn install
yarn build

# Make cazt available globally
yarn link
```

After linking, you can use `cazt` from anywhere:

```bash
cazt --help
```

### Development

```bash
# Run in development mode (no build needed)
yarn start --help

# Build
yarn build

# Clean build artifacts
yarn clean

# Run tests
yarn test
```

## Configuration

Set environment variables or use flags:

```bash
# Set default RPC URL
export CAZT_RPC_URL=http://localhost:8080

# Or use flags
cazt --rpc-url http://localhost:8080 <command>

# Network shortcuts
cazt --rpc-url devnet <command>
cazt --rpc-url testnet <command>
```

**Network Shortcuts:**
- `devnet` → `https://devnet.aztec-labs.com`
- `testnet` → `https://aztec-testnet-fullnode.zkv.xyz`

## Commands

| Command | Description |
|---------|-------------|
| [`key`](#key) | Key generation, derivation, storage, and signing |
| [`tx`](#transaction) | Transaction decoding and metadata management |

---

### Key

Key management commands for generating, deriving, storing, and signing with Aztec keys.

```
key
├── generate        Generate a new random secret key
├── derive-keys     Derive all key types from a secret
├── derive-address  Compute account address from a secret
├── import          Store a secret key locally
├── export          Retrieve a stored secret key
├── list (ls)       List all stored secrets
├── delete (rm)     Delete a stored secret
├── sign            Sign a message with Schnorr
├── verify          Verify a Schnorr signature
└── keystore        Encrypted keystore management
    ├── create      Create an encrypted keystore file
    ├── unlock      Decrypt and show secret
    ├── inspect     View keystore metadata
    ├── list        List all keystore files
    └── delete      Delete a keystore file
```

#### `key generate`

Generate a new random secret key.

```bash
cazt key generate
cazt key generate --json
```

#### `key derive-keys`

Derive all Aztec key types (nullifier, incoming viewing, outgoing viewing, tagging) from a master secret.

```bash
cazt key derive-keys <secret>
cazt key derive-keys <secret> --public    # Include public keys
cazt key derive-keys --alias <name>       # Use stored secret
```

#### `key derive-address`

Compute the Schnorr account contract address from a secret key or passphrase.

```bash
cazt key derive-address <secret>
cazt key derive-address <secret> --salt 42
cazt key derive-address "my passphrase"        # String → Poseidon2 hash
cazt key derive-address --alias <name>
```

#### `key import`

Store a secret key locally with an alias. Encrypted by default.

```bash
cazt key import <secret> --alias <name>                # Encrypted (prompts for password)
cazt key import <secret> --alias <name> --password pw  # With password
cazt key import <secret> --alias <name> --no-encrypt   # Unencrypted
cazt key import <secret> --alias <name> --force        # Overwrite existing
```

#### `key export`

Retrieve a stored secret key by alias.

```bash
cazt key export <alias>
cazt key export <alias> --password <pw>    # For encrypted secrets
```

#### `key list`

List all stored secrets.

```bash
cazt key list
cazt key ls          # Alias
cazt key list --json
```

#### `key delete`

Delete a stored secret by alias.

```bash
cazt key delete <alias>
cazt key rm <alias>  # Alias
```

#### `key sign`

Sign a message using Schnorr signature.

```bash
cazt key sign <message> <secret>
cazt key sign <message> --alias <name> --password <pw>
cazt key sign "hello" "my passphrase"      # Passphrase → Poseidon2 hash
cazt key sign 0x68656c6c6f <secret>        # Hex-encoded message
```

#### `key verify`

Verify a Schnorr signature.

```bash
cazt key verify <message> --sig <signature> --pubkey <publicKey>
```

#### `key keystore`

Manage encrypted keystore files (Ethereum/geth-compatible format).

```bash
cazt key keystore create <name> --secret <key>   # Create (prompts for password)
cazt key keystore unlock <name>                   # Decrypt and show secret
cazt key keystore inspect <name>                  # View metadata (no password)
cazt key keystore list                            # List all keystores
cazt key keystore delete <name>                   # Delete keystore file
```

---

### Transaction

Transaction decoding and metadata management.

```
tx
├── decode            Decode a transaction and decrypt private logs
└── metadata          Encrypted local storage for transaction annotations
    ├── add           Add metadata to a transaction
    ├── get           Retrieve metadata (requires password)
    ├── list (ls)     List all entries (no password needed)
    ├── update        Update existing metadata
    └── delete (rm)   Delete metadata
```

#### `tx decode`

Decode a transaction and display its effects. Optionally decrypt private logs using your viewing keys.

```bash
cazt tx decode <tx-hash>
cazt tx decode <tx-hash> --secret <key>
cazt tx decode <tx-hash> --alias <name>
cazt tx decode <tx-hash> --alias <name> --artifact ./Token.json
```

**Options:**

| Option | Description |
|--------|-------------|
| `-r, --rpc <url>` | Aztec node URL (or `CAZT_RPC_URL` env var) |
| `-s, --secret <key>` | Secret key for decrypting private logs |
| `-a, --alias <name>` | Use stored secret key by alias |
| `--salt <value>` | Account salt for address derivation (default: 0) |
| `--artifact <path>` | Contract artifact JSON for event decoding |
| `--raw` | Include raw field values in output |
| `--json` | Output as JSON |

**Examples:**

```bash
# Basic decode - shows public summary only
cazt tx decode 0x1234...abcd --rpc devnet

# Decrypt private logs with a secret key
cazt tx decode 0x1234...abcd --secret 0xabcd...1234

# Decrypt using a stored alias (prompts for password if encrypted)
cazt tx decode 0x1234...abcd --alias my-wallet

# Decode events using contract artifact
cazt tx decode 0x1234...abcd --alias my-wallet --artifact ./TokenContract.json

# With custom salt (if account was created with non-zero salt)
cazt tx decode 0x1234...abcd --secret 0xabcd... --salt 42

# Raw output for debugging
cazt tx decode 0x1234...abcd --raw

# JSON output
cazt tx decode 0x1234...abcd --alias my-wallet --json
```

**Output:**

```
Transaction: 0x1234...abcd
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Status:        success
Block:         12345
Fee:           82800640

Public Summary:
  Note hashes:     1
  Nullifiers:      3
  L2→L1 messages:  0
  Private logs:    2 (encrypted)
  Public logs:     0
  Data writes:     1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your Data (Decrypted):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Found 1 log(s) for your keys:

  [Log 0] Event: Transfer
    Selector: 0x12345678
    from: 0x1234...
    to: 0x5678...
    amount: 100

Decryption: 1/2 logs decrypted
```

**Notes:**
- Private log decryption requires your secret key (via `--secret` or `--alias`)
- Event decoding requires the contract artifact (`--artifact`)
- Without an artifact, decrypted logs show raw field values
- Notes cannot be auto-decoded (note types are not in artifacts)

#### `tx metadata add`

Add metadata to a transaction. Encrypted by default using GETH keystore format.

```bash
cazt tx metadata add <tx-hash> --label "DEX Swap"
cazt tx metadata add <tx-hash> \
  --label "DEX Swap" \
  --description "Swapped 1 ETH for DAI" \
  --tags "defi,swap" \
  --contract 0xabcd...
cazt tx metadata add <tx-hash> --label "Test" --password <pw>
```

#### `tx metadata get`

Retrieve and decrypt metadata for a transaction.

```bash
cazt tx metadata get <tx-hash>
cazt tx metadata get <tx-hash> --password <pw>
```

#### `tx metadata list`

List all metadata entries. No password required.

```bash
cazt tx metadata list
cazt tx metadata list --tag defi
cazt tx metadata list --contract 0x...
cazt tx metadata list --limit 20
```

#### `tx metadata update`

Update metadata for an existing transaction.

```bash
cazt tx metadata update <tx-hash> --label "New Label"
cazt tx metadata update <tx-hash> --tags "new,tags" --password <pw>
```

#### `tx metadata delete`

Delete metadata for a transaction.

```bash
cazt tx metadata delete <tx-hash>
cazt tx metadata delete <tx-hash> --force
```

## Roadmap

Commands are being added incrementally. See [ROADMAP.md](./ROADMAP.md) for planned features.

## License

MIT
