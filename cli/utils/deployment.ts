import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/foundation/fields';
import { createAztecNodeClient, waitForNode } from '@aztec/aztec.js/node';
import { TestWallet } from '@aztec/test-wallet/server';
import { Contract } from '@aztec/aztec.js/contracts';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import { getDefaultNodeUrl } from '../config/index.js';

/**
 * Deployment utility functions
 */
export class DeploymentUtils {
  /**
   * Deploy a contract
   */
  static async deployContract(params: string): Promise<any> {
    const p = JSON.parse(params);
    const {
      nodeUrl = getDefaultNodeUrl(),
      artifact: artifactInput,
      secretKey,
      salt,
      deployer,
      contractAddressSalt,
      universalDeploy,
      constructorArgs = [],
      constructorName,
      skipClassPublication,
      skipInstancePublication,
      skipInitialization,
      skipRegistration,
      wait = true,
      debug = false,
    } = p;

    const debugLog = (msg: string, data?: any) => {
      if (debug) {
        console.error(`[DEBUG] ${msg}`, data ? JSON.stringify(data, null, 2) : '');
      }
    };

    if (!artifactInput) {
      throw new Error('Artifact is required');
    }

    // Load artifact (supports aztec:, standards:, file paths, or JSON)
    debugLog(`[DEBUG] Loading artifact: ${typeof artifactInput === 'string' ? artifactInput : 'object'}`);
    let artifactJson: any;
    if (typeof artifactInput === 'string') {
      // Use parseJsonOrFile from rpc.ts logic
      const { parseJsonOrFile } = await import('./rpc.js');
      artifactJson = parseJsonOrFile(artifactInput);
    } else {
      artifactJson = artifactInput;
    }
    const contractArtifact = loadContractArtifact(artifactJson as any);
    debugLog(`[DEBUG] Artifact loaded:`, { name: contractArtifact.name });

    // Create node client and wait for it to be ready
    debugLog(`[DEBUG] Creating node client for: ${nodeUrl}`);
    const node = createAztecNodeClient(nodeUrl);
    await waitForNode(node);
    debugLog(`[DEBUG] Node is ready`);

    // Create wallet using TestWallet
    debugLog(`[DEBUG] Creating TestWallet...`);
    const wallet = await TestWallet.create(node, {
      proverEnabled: false,
    });
    debugLog(`[DEBUG] Wallet created`);

    // Create account if secret key is provided
    let accountManager: any = null;
    if (secretKey) {
      let saltToUse: Fr;
      if (salt) {
        if (salt === 'random' || salt.toLowerCase() === 'random') {
          saltToUse = Fr.random();
          debugLog(`[DEBUG] Generated random account salt: ${saltToUse.toString()}`);
        } else {
          saltToUse = Fr.fromString(salt);
        }
      } else {
        saltToUse = Fr.ZERO;
      }
      debugLog(`[DEBUG] Creating account with secret key...`);
      accountManager = await wallet.createSchnorrAccount(secretKey, saltToUse);
      debugLog(`[DEBUG] Account created:`, { address: accountManager.address.toString() });
    }

    // Prepare deployment options
    const deployOptions: any = {};

    if (contractAddressSalt !== undefined) {
      if (contractAddressSalt === 'random' || contractAddressSalt.toLowerCase() === 'random') {
        deployOptions.contractAddressSalt = Fr.random();
        debugLog(`[DEBUG] Generated random contract salt: ${deployOptions.contractAddressSalt.toString()}`);
      } else {
        deployOptions.contractAddressSalt = Fr.fromString(contractAddressSalt);
      }
    }

    if (deployer !== undefined) {
      deployOptions.deployer = AztecAddress.fromString(deployer);
    }

    if (universalDeploy !== undefined) {
      deployOptions.universalDeploy = universalDeploy;
    }

    if (skipClassPublication !== undefined) {
      deployOptions.skipClassPublication = skipClassPublication;
    }

    if (skipInstancePublication !== undefined) {
      deployOptions.skipInstancePublication = skipInstancePublication;
    }

    if (skipInitialization !== undefined) {
      deployOptions.skipInitialization = skipInitialization;
    }

    if (skipRegistration !== undefined) {
      deployOptions.skipRegistration = skipRegistration;
    }

    // Parse constructor args if provided as string
    let parsedConstructorArgs = constructorArgs;
    if (typeof constructorArgs === 'string') {
      try {
        parsedConstructorArgs = JSON.parse(constructorArgs);
      } catch {
        // If not JSON, treat as comma-separated values
        parsedConstructorArgs = constructorArgs.split(',').map((arg: string) => arg.trim());
      }
    }

    debugLog(`[DEBUG] Deploying contract with options:`, {
      constructorArgs: parsedConstructorArgs,
      constructorName,
      ...deployOptions,
    });

    // Deploy the contract
    const deployMethod = Contract.deploy(
      wallet,
      contractArtifact,
      parsedConstructorArgs,
      constructorName,
    );

    // Get instance to show address before deployment
    const instance = await deployMethod.getInstance(deployOptions);
    debugLog(`[DEBUG] Contract instance computed:`, {
      address: instance.address.toString(),
      contractClassId: instance.currentContractClassId.toString(),
    });

    // Send deployment transaction
    debugLog(`[DEBUG] Sending deployment transaction...`);
    const deployTx = deployMethod.send(deployOptions);
    const txHash = await deployTx.getTxHash();
    debugLog(`[DEBUG] Deployment transaction sent:`, { txHash: txHash.toString() });

    let receipt: any = null;
    let contract: any = null;

    if (wait) {
      debugLog(`[DEBUG] Waiting for deployment to complete...`);
      const deployReceipt = await deployTx.wait();
      receipt = {
        txHash: deployReceipt.txHash.toString(),
        status: deployReceipt.status,
        blockNumber: deployReceipt.blockNumber,
      };
      // Access instance from receipt (DeployTxReceipt has instance property)
      const receiptInstance = (deployReceipt as any).instance;
      contract = {
        address: deployReceipt.contract.address.toString(),
        instance: {
          address: receiptInstance.address.toString(),
          contractClassId: receiptInstance.currentContractClassId.toString(),
          initializationHash: receiptInstance.initializationHash.toString(),
          salt: receiptInstance.salt.toString(),
        },
      };
      debugLog(`[DEBUG] Deployment completed:`, contract);
    } else {
      // Return instance info even if not waiting
      contract = {
        address: instance.address.toString(),
        instance: {
          address: instance.address.toString(),
          contractClassId: instance.currentContractClassId.toString(),
          initializationHash: instance.initializationHash.toString(),
          salt: instance.salt.toString(),
        },
      };
    }

    return {
      txHash: txHash.toString(),
      contract,
      receipt,
      account: accountManager ? {
        address: accountManager.address.toString(),
      } : null,
    };
  }
}

