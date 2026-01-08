# PXE Database Persistence Design

## Context

CAZT is a CLI tool for interacting with the Aztec Network. When deploying wallets and performing other operations, the PXE (Private eXecution Environment) needs to maintain state about:

- Deployed contracts and their addresses
- Notes (private state)
- Authentication witnesses
- Capsules
- Address book entries

Previously, each command created an ephemeral PXE via `TestWallet.create()`, losing all state after execution. This prevents:

- Tracking deployments across sessions
- Syncing private notes
- Reusing contract registrations
- Efficient operation (no need to re-sync)

## Research Findings

### Aztec PXE Storage Backends

From aztec-packages documentation:

- **Node.js**: Uses **LMDB** (Lightning Memory-Mapped Database) via `@aztec/kv-store/lmdb-v2`
- **Browser**: Uses **IndexedDB** via `@aztec/kv-store/indexeddb`

### Network Isolation

Databases are **identified by `rollupAddress`** to ensure network isolation. Each Aztec network (devnet, testnet, local) has a unique rollup contract address on L1.

### Reference Implementation

From `aztec-standards/src/ts/test/utils.ts`:

```typescript
import { createStore } from '@aztec/kv-store/lmdb-v2';
import { createPXE, getPXEConfig } from '@aztec/pxe/server';
import { type AztecLMDBStoreV2 } from '@aztec/kv-store/lmdb-v2';

const store: AztecLMDBStoreV2 = await createStore('pxe', pxeVersion, {
  dataDirectory: storeDir,
  dataStoreMapSizeKb: 1e6,
});
const pxe: PXE = await createPXE(node, fullConfig, { store });
```

## Design

### Directory Structure

```
~/.cazt/
├── keystores/              # Existing secret storage
│   └── keys.json
└── data/                   # Network-specific PXE databases
    └── {rollupAddress}/    # One directory per network (first 16 chars of address)
        └── pxe/            # LMDB database files
```

### Rollup Address Format

The rollup address is truncated to the first 16 hex characters (excluding `0x`) for directory naming to keep paths manageable while maintaining uniqueness.

Example: `0x1234567890abcdef1234567890abcdef12345678` -> `1234567890abcdef`

### Implementation Components

#### 1. PXE Utility Module (`cli/utils/pxe.ts`)

Provides:

- `getDataDirectory(rollupAddress)` - Returns network-specific data directory
- `createPersistentPXE(nodeUrl)` - Creates PXE with persistent LMDB storage
- `getPXEDataPath()` - Returns base data path (`~/.cazt/data/`)

#### 2. Integration with Commands

Commands that need PXE persistence:

- `wallet deploy` - Deploys account, stores contract info
- `wallet address` - May query existing deployments (future)
- Future contract interaction commands

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `dataStoreMapSizeKb` | 1,000,000 (1GB) | Max LMDB map size |
| `proverEnabled` | false | Disable prover for CLI operations |

### PXE Version

Using PXE version `2` (current stable) for store creation.

## Pending Work

### PXE/Database Management Commands

A dedicated command group should be implemented for managing PXE databases:

```
cazt pxe list              # List all network databases
cazt pxe info [network]    # Show database info (size, contracts, notes count)
cazt pxe clear [network]   # Clear database for a network
cazt pxe sync [network]    # Force sync with network
cazt pxe export [network]  # Export database (backup)
cazt pxe import <file>     # Import database (restore)
```

### Queries

```
cazt pxe contracts [network]   # List registered contracts
cazt pxe notes [network]       # List notes (with privacy considerations)
cazt pxe deployments [network] # List deployments made from this CLI
```

### Future Considerations

1. **Database migrations** - Handle PXE version upgrades
2. **Cleanup policy** - Auto-cleanup of old/unused databases
3. **Size limits** - Warn when database grows large
4. **Multi-wallet support** - Separate data per wallet identity

## References

- [Aztec PXE Documentation](https://docs.aztec.network/)
- [LMDB](http://www.lmdb.tech/doc/)
- [aztec-packages/yarn-project/pxe](https://github.com/AztecProtocol/aztec-packages)
