import { readdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Artifact management utility functions
 */
export class ArtifactUtils {
  /**
   * Get the package root directory (works in both dev and when installed)
   */
  private static getPackageRoot(): string {
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

  /**
   * List available artifacts from a source
   * @param params - JSON string with:
   *   - source: string - Source name (e.g., "aztec", "standards")
   * @returns Array of artifact names
   */
  static listArtifacts(params: string): any {
    const p = JSON.parse(params);
    const source = p.source || 'aztec';
    const packageRoot = this.getPackageRoot();
    
    const artifacts: any[] = [];
    
    if (source === 'aztec') {
      // Look in node_modules/@aztec/noir-contracts.js/artifacts
      const artifactsPath = resolve(packageRoot, 'node_modules/@aztec/noir-contracts.js/artifacts');
      
      if (!existsSync(artifactsPath)) {
        throw new Error(`Artifacts directory not found: ${artifactsPath}`);
      }
      
      try {
        const files = readdirSync(artifactsPath);
        // Filter for .json files (not .d.json.ts files)
        const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.d.json.ts'));
        
        for (const file of jsonFiles) {
          // Extract contract name from filename (e.g., "token_contract-Token.json" -> "Token")
          const match = file.match(/(.+)-(.+)\.json$/);
          if (match) {
            const [, contractFile, contractName] = match;
            artifacts.push({
              name: contractName,
              file: file,
              fullName: `aztec:${contractName}`,
              path: join(artifactsPath, file),
            });
          }
        }
        
        // Sort by name
        artifacts.sort((a, b) => a.name.localeCompare(b.name));
      } catch (error: any) {
        throw new Error(`Failed to read artifacts directory: ${error.message}`);
      }
    } else if (source === 'standards') {
      // Look in .aztec-standards/target (relative to package root)
      const artifactsPath = resolve(packageRoot, '.aztec-standards/target');
      
      if (!existsSync(artifactsPath)) {
        // Provide helpful error message
        const aztecStandardsDir = resolve(packageRoot, '.aztec-standards');
        let errorMsg = `Artifacts directory not found: ${artifactsPath}\n`;
        errorMsg += `Package root: ${packageRoot}\n`;
        
        if (existsSync(aztecStandardsDir)) {
          const subdirs = readdirSync(aztecStandardsDir);
          errorMsg += `.aztec-standards directory exists with subdirectories: ${subdirs.join(', ')}\n`;
        } else {
          errorMsg += `.aztec-standards directory does not exist.\n`;
        }
        
        errorMsg += `\nPlease run 'yarn build-aztec-standards' to build the artifacts.`;
        throw new Error(errorMsg);
      }
      
      try {
        const files = readdirSync(artifactsPath);
        // Filter for .json files (not .d.json.ts files)
        const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.d.json.ts'));
        
        if (jsonFiles.length === 0) {
          throw new Error(`No JSON artifacts found in ${artifactsPath}. Run 'yarn build-aztec-standards' to build the artifacts.`);
        }
        
        for (const file of jsonFiles) {
          // Extract contract name from filename
          // Could be "Token.json" or "token_contract-Token.json" format
          const match = file.match(/(.+)-(.+)\.json$/) || file.match(/(.+)\.json$/);
          if (match) {
            const contractName = match[2] || match[1]; // Use second group if available, else first
            artifacts.push({
              name: contractName,
              file: file,
              fullName: `standards:${contractName}`,
              path: join(artifactsPath, file),
            });
          }
        }
        
        // Sort by name
        artifacts.sort((a, b) => a.name.localeCompare(b.name));
      } catch (error: any) {
        throw new Error(`Failed to read artifacts directory: ${error.message}`);
      }
    } else {
      throw new Error(`Unknown artifact source: ${source}. Supported sources: aztec, standards`);
    }
    
    return {
      source,
      artifacts,
      count: artifacts.length,
    };
  }

  /**
   * Resolve artifact path from name or path
   * @param artifactInput - Either a file path, @file.json, or artifact name like "aztec:Token" or "standards:Token"
   * @returns Path to the artifact file
   */
  static resolveArtifact(artifactInput: string): string {
    const packageRoot = this.getPackageRoot();
    
    // Check if it's an artifact name (format: "source:ContractName")
    if (artifactInput.includes(':') && !artifactInput.startsWith('@') && !artifactInput.includes('/') && !artifactInput.includes('\\')) {
      const [source, contractName] = artifactInput.split(':');
      
      if (source === 'aztec') {
        // Look for the artifact in node_modules
        const artifactsPath = resolve(packageRoot, 'node_modules/@aztec/noir-contracts.js/artifacts');
        
        try {
          const files = readdirSync(artifactsPath);
          // Search for file containing the contract name
          const matchingFile = files.find(f => 
            f.endsWith('.json') && 
            !f.endsWith('.d.json.ts') &&
            f.includes(contractName)
          );
          
          if (matchingFile) {
            return join(artifactsPath, matchingFile);
          }
          
          // If not found by name, try case-insensitive search
          const lowerContractName = contractName.toLowerCase();
          const caseInsensitiveMatch = files.find(f => 
            f.endsWith('.json') && 
            !f.endsWith('.d.json.ts') &&
            f.toLowerCase().includes(lowerContractName)
          );
          
          if (caseInsensitiveMatch) {
            return join(artifactsPath, caseInsensitiveMatch);
          }
          
          throw new Error(`Artifact "${contractName}" not found in ${source} artifacts`);
        } catch (error: any) {
          throw new Error(`Failed to resolve artifact "${artifactInput}": ${error.message}`);
        }
      } else if (source === 'standards') {
        // Look for the artifact in .aztec-standards/target
        const artifactsPath = resolve(packageRoot, '.aztec-standards/target');
        
        if (!existsSync(artifactsPath)) {
          throw new Error(`Artifacts directory not found: ${artifactsPath}. Run 'yarn build-aztec-standards' first.`);
        }
        
        try {
          const files = readdirSync(artifactsPath);
          // Search for file containing the contract name
          const matchingFile = files.find(f => 
            f.endsWith('.json') && 
            !f.endsWith('.d.json.ts') &&
            (f.includes(contractName) || f === `${contractName}.json`)
          );
          
          if (matchingFile) {
            return join(artifactsPath, matchingFile);
          }
          
          // If not found by name, try case-insensitive search
          const lowerContractName = contractName.toLowerCase();
          const caseInsensitiveMatch = files.find(f => 
            f.endsWith('.json') && 
            !f.endsWith('.d.json.ts') &&
            (f.toLowerCase().includes(lowerContractName) || f.toLowerCase() === `${lowerContractName}.json`)
          );
          
          if (caseInsensitiveMatch) {
            return join(artifactsPath, caseInsensitiveMatch);
          }
          
          throw new Error(`Artifact "${contractName}" not found in standards artifacts`);
        } catch (error: any) {
          throw new Error(`Failed to resolve artifact "${artifactInput}": ${error.message}`);
        }
      } else {
        throw new Error(`Unknown artifact source: ${source}`);
      }
    }
    
    // Otherwise, treat as file path (existing behavior)
    return artifactInput;
  }
}

