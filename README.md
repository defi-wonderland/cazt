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

## Roadmap

Commands are being added incrementally. See [ROADMAP.md](./ROADMAP.md) for planned features.

## License

MIT
