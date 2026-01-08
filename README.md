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
- `local` → `http://localhost:8080`
- `devnet` → `https://devnet.aztec-labs.com`
- `next-devnet` → `https://next.devnet.aztec-labs.com`
- `testnet` → `https://aztec-testnet-fullnode.zkv.xyz`

## Commands

| Command | Description |
|---------|-------------|
| [`key`](#key) | Key generation, derivation, storage, and signing |
| [`wallet`](#wallet) | Account wallet operations |

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

### Wallet

Account wallet commands for creating, managing, and deploying Aztec accounts.

```
wallet
├── create          Create a new account (generates secret key and computes address)
├── address         Compute account address from secret key (offline)
└── deploy          Deploy an account contract to the network
```

#### `wallet create`

Create a new Aztec account by generating a random secret key and computing the corresponding address.

```bash
cazt wallet create                  # Create a schnorr account (default)
cazt wallet create --type schnorr   # Explicit account type
cazt wallet create --json           # Output as JSON
```

**Output includes:**
- **Address**: The computed Aztec account address
- **Secret Key**: The generated secret key (store securely!)
- **Type**: Account type (currently only `schnorr`)
- **Salt**: Salt used for address derivation (default: 0)

#### `wallet address`

Compute the account address from a secret key without deploying. Works offline.

```bash
cazt wallet address <secret>                    # Compute address from secret
cazt wallet address <secret> --salt 42          # With custom salt
cazt wallet address "my passphrase"             # Passphrase → Poseidon2 hash
cazt wallet address --alias <name>              # Use stored secret
cazt wallet address --alias <name> --password <pw>  # For encrypted secrets
cazt wallet address --type schnorr              # Explicit account type
```

**Example:**
```bash
$ cazt wallet address 0x0000000000000000000000000000000000000000000000000000000000000001
Account Address
==================================================

Address: 0x24976a75c17d31ec8425d2d8b0a9090ac16a3634f712588bf717c85f08b06134
Type:    schnorr
Salt:    0x0000000000000000000000000000000000000000000000000000000000000000
```

#### `wallet deploy`

Deploy an account contract to the network using sponsored fee payments.

```bash
cazt wallet deploy <secret>                     # Deploy from secret
cazt wallet deploy <secret> --salt 42           # With custom salt
cazt wallet deploy --alias <name>               # Use stored secret
cazt wallet deploy --alias <name> --password <pw>  # For encrypted secrets
cazt wallet deploy --type schnorr               # Explicit account type
cazt wallet deploy --rpc-url devnet             # Deploy to devnet
```

**Output includes:**
- **Address**: The deployed account address
- **Tx Hash**: The deployment transaction hash
- **Status**: Transaction status
- **Block**: Block number (when confirmed)

**Example:**
```bash
$ cazt wallet deploy 0x123... --rpc-url devnet
Account Deployed
==================================================

Address:     0x24976a75c17d31ec8425d2d8b0a9090ac16a3634f712588bf717c85f08b06134
Tx Hash:     0xabc123...
Status:      success
Block:       12345
```

## Roadmap

Commands are being added incrementally. See [ROADMAP.md](./ROADMAP.md) for planned features.

## License

MIT
