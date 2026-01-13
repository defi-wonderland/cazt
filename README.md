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
cazt key keystore ls                              # Alias for list
cazt key keystore delete <name>                   # Delete keystore file
cazt key keystore rm <name>                       # Alias for delete
```

All keystore commands support `--keystore-dir <dir>` to specify a custom directory for keystore files.

## Roadmap

Commands are being added incrementally. See [ROADMAP.md](./ROADMAP.md) for planned features.

## License

MIT
