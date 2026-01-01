import fetch from 'node-fetch';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface RpcClientOptions {
  rpcUrl: string;
  adminUrl: string;
  pretty: boolean;
}

export class RpcClient {
  private rpcUrl: string;
  private adminUrl: string;
  private pretty: boolean;

  constructor(options: RpcClientOptions) {
    this.rpcUrl = options.rpcUrl;
    this.adminUrl = options.adminUrl;
    this.pretty = options.pretty;
  }

  async call(method: string, params: any[]): Promise<any> {
    const url = method.startsWith('nodeAdmin_') ? this.adminUrl : this.rpcUrl;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as { result?: any; error?: any };
    
    if (data.error) {
      throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
    }

    return data.result;
  }

  formatOutput(result: any, pretty: boolean): string {
    // Handle null/undefined explicitly
    if (result === null || result === undefined) {
      return pretty ? 'null' : 'null';
    }
    if (pretty) {
      return JSON.stringify(result, null, 2);
    }
    return JSON.stringify(result);
  }
}

/**
 * Get the package root directory (works in both dev and when installed)
 */
function getPackageRoot(): string {
  // Strategy 1: Start from current file location and walk up
  try {
    const currentFile = fileURLToPath(import.meta.url);
    let currentDir = dirname(currentFile);
    
    // Walk up from current directory to find package.json
    for (let i = 0; i < 10; i++) { // Max 10 levels up
      const packageJsonPath = join(currentDir, 'package.json');
      if (existsSync(packageJsonPath)) {
        return currentDir;
      }
      const parent = dirname(currentDir);
      if (parent === currentDir) break; // Reached filesystem root
      currentDir = parent;
    }
  } catch (error) {
    // Fall through to next strategy
  }
  
  // Strategy 2: Start from process.cwd() and walk up
  let current = process.cwd();
  for (let i = 0; i < 10; i++) { // Max 10 levels up
    const packageJsonPath = join(current, 'package.json');
    if (existsSync(packageJsonPath)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break; // Reached filesystem root
    current = parent;
  }
  
  // Fallback: return process.cwd() - assume we're in the package root
  return process.cwd();
}

export function parseJsonOrFile(input: string): any {
  const packageRoot = getPackageRoot();
  
  // Handle artifact names (format: "source:ContractName")
  if (input.includes(':') && !input.startsWith('@') && !input.includes('/') && !input.includes('\\')) {
    const [source, contractName] = input.split(':');
    
    if (source === 'aztec') {
      // Resolve artifact from node_modules
      const artifactsPath = resolve(packageRoot, 'node_modules/@aztec/noir-contracts.js/artifacts');
      
      if (!existsSync(artifactsPath)) {
        throw new Error(`Artifacts directory not found: ${artifactsPath}`);
      }
      
      try {
        const files = readdirSync(artifactsPath);
        
        const matchingFile = files.find((f: string) => 
          f.endsWith('.json') && 
          !f.endsWith('.d.json.ts') &&
          (f.includes(contractName) || f.toLowerCase().includes(contractName.toLowerCase()))
        );
        
        if (matchingFile) {
          const filePath = join(artifactsPath, matchingFile);
          const content = readFileSync(filePath, 'utf-8');
          return JSON.parse(content);
        }
        
        throw new Error(`Artifact "${contractName}" not found in aztec artifacts`);
      } catch (error: any) {
        throw new Error(`Failed to load artifact "${input}": ${error.message}`);
      }
    } else if (source === 'standards') {
      // Resolve artifact from .aztec-standards/target
      const artifactsPath = resolve(packageRoot, '.aztec-standards/target');
      
      if (!existsSync(artifactsPath)) {
        throw new Error(`Artifacts directory not found: ${artifactsPath}. Run 'yarn build-aztec-standards' first.`);
      }
      
      try {
        const files = readdirSync(artifactsPath);
        
        const matchingFile = files.find((f: string) => 
          f.endsWith('.json') && 
          !f.endsWith('.d.json.ts') &&
          (f.includes(contractName) || f === `${contractName}.json` || f.toLowerCase().includes(contractName.toLowerCase()))
        );
        
        if (matchingFile) {
          const filePath = join(artifactsPath, matchingFile);
          const content = readFileSync(filePath, 'utf-8');
          return JSON.parse(content);
        }
        
        throw new Error(`Artifact "${contractName}" not found in standards artifacts`);
      } catch (error: any) {
        throw new Error(`Failed to load artifact "${input}": ${error.message}`);
      }
    }
  }
  
  // Handle @ prefix (explicit file indicator)
  if (input.startsWith('@')) {
    const filePath = input.slice(1);
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }
  
  // Try to treat as file path if it looks like one
  if (input.includes('/') || input.includes('\\') || input.endsWith('.json')) {
    try {
      const resolvedPath = resolve(input);
      if (existsSync(resolvedPath)) {
        const content = readFileSync(resolvedPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      // If file doesn't exist or can't be read, fall through to JSON parsing
    }
  }
  
  // Otherwise, treat as JSON string
  return JSON.parse(input);
}

