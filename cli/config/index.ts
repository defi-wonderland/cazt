/**
 * Configuration for CAZT CLI
 */

/**
 * Network URL mappings for shortcuts (devnet, testnet)
 */
export const NETWORK_URLS: Record<string, string> = {
  devnet: 'https://devnet.aztec-labs.com',
  testnet: 'https://aztec-testnet-fullnode.zkv.xyz',
};

/**
 * Default URLs
 */
export const DEFAULT_URLS = {
  /** Default RPC URL for local development */
  RPC: 'http://localhost:8080',
  /** Default Admin URL for local development */
  ADMIN: 'http://localhost:8880',
} as const;

/**
 * Environment variable names
 */
export const ENV_VARS = {
  /** Environment variable for RPC URL */
  RPC_URL: 'CAZT_RPC_URL',
  /** Environment variable for Admin URL */
  ADMIN_URL: 'CAZT_ADMIN_URL',
} as const;

/**
 * Resolve RPC URL - converts network shortcuts (devnet, testnet) to actual URLs
 * Falls back to environment variable or default localhost URL
 */
export function resolveRpcUrl(url: string | undefined): string {
  if (!url) {
    return process.env[ENV_VARS.RPC_URL] || DEFAULT_URLS.RPC;
  }
  // Check if it's a network shortcut
  const lowerUrl = url.toLowerCase();
  if (NETWORK_URLS[lowerUrl]) {
    return NETWORK_URLS[lowerUrl];
  }
  // Otherwise return as-is
  return url;
}

/**
 * Resolve Admin URL - falls back to environment variable or default localhost URL
 */
export function resolveAdminUrl(url: string | undefined): string {
  if (!url) {
    return process.env[ENV_VARS.ADMIN_URL] || DEFAULT_URLS.ADMIN;
  }
  return url;
}

/**
 * Get default node URL (for utilities that need a node URL)
 */
export function getDefaultNodeUrl(): string {
  return process.env[ENV_VARS.RPC_URL] || DEFAULT_URLS.RPC;
}

