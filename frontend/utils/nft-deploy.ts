// NFT Collection Contract Deployment via Web3

// Dynamic ABI loading to handle ecosystem extension availability
async function loadABIs() {
  try {
    const [ERC721, ERC1155] = await Promise.all([
      import("../../backend/ecosystem/smart-contracts/nft/ERC721NFT.json"),
      import("../../backend/ecosystem/smart-contracts/nft/ERC1155NFT.json"),
    ]);
    return {
      ERC721_ABI: ERC721.default,
      ERC1155_ABI: ERC1155.default,
    };
  } catch (error) {
    console.error("[NFT DEPLOY] Ecosystem extension not installed or ABIs not found");
    throw new Error(
      "NFT deployment requires the Ecosystem extension. Please ensure it is installed and configured."
    );
  }
}

export interface DeploymentParams {
  name: string;
  symbol: string;
  baseTokenURI: string;
  maxSupply: number;
  royaltyPercentage: number; // basis points (250 = 2.5%)
  mintPrice: string; // in ETH
  isPublicMint: boolean;
  standard: "ERC721" | "ERC1155";
  chain: string;
}

export interface DeploymentResult {
  contractAddress: string;
  transactionHash: string;
  blockNumber: number;
  gasUsed: string;
  deploymentCost: string; // in ETH
}

export async function deployNFTContract(
  params: DeploymentParams
): Promise<DeploymentResult> {
  try {
    console.log("[NFT DEPLOY] Starting deployment:", params);

    // Load ABIs dynamically (will throw error if ecosystem extension not installed)
    const { ERC721_ABI, ERC1155_ABI } = await loadABIs();

    // Get Wagmi config and connector client
    const { config } = await import("@/config/wallet");
    const { getConnectorClient } = await import("wagmi/actions");
    const { ContractFactory, parseEther } = await import("ethers");
    const { BrowserProvider } = await import("ethers");

    // Get the connected wallet client
    const connectorClient = await getConnectorClient(config);

    if (!connectorClient || !connectorClient.account) {
      throw new Error("No wallet connected. Please connect your wallet.");
    }

    const userAddress = connectorClient.account.address;
    console.log("[NFT DEPLOY] Connected wallet:", userAddress);

    // Create ethers provider from Wagmi connector
    const provider = new BrowserProvider(connectorClient.transport);
    const signer = await provider.getSigner();

    // Get the appropriate ABI and bytecode
    const contractArtifact = params.standard === "ERC721" ? ERC721_ABI : ERC1155_ABI;
    const abi = contractArtifact.abi;
    const bytecode = contractArtifact.bytecode;

    if (!bytecode) {
      throw new Error("Contract bytecode not found");
    }

    console.log("[NFT DEPLOY] Contract standard:", params.standard);
    console.log("[NFT DEPLOY] Preparing deployment transaction...");

    // Create contract factory
    const factory = new ContractFactory(abi, bytecode, signer);

    // Convert mint price to Wei
    const mintPriceWei = parseEther(params.mintPrice || "0");

    // Prepare constructor arguments
    // Use connected wallet as owner and royalty recipient
    const constructorArgs = [
      params.name,
      params.symbol,
      params.baseTokenURI || "",
      params.maxSupply,
      params.royaltyPercentage,
      userAddress, // royaltyRecipient
      mintPriceWei,
      params.isPublicMint,
      userAddress // owner
    ];

    console.log("[NFT DEPLOY] Constructor args:", constructorArgs);

    // Estimate gas
    const deploymentData = await factory.getDeployTransaction(...constructorArgs);
    const estimatedGas = await provider.estimateGas({
      data: deploymentData.data,
      from: userAddress
    });

    console.log("[NFT DEPLOY] Estimated gas:", estimatedGas.toString());

    // Deploy contract
    console.log("[NFT DEPLOY] Deploying contract... Please sign the transaction in your wallet.");
    const contract = await factory.deploy(...constructorArgs);

    console.log("[NFT DEPLOY] Transaction sent:", contract.deploymentTransaction()?.hash);
    console.log("[NFT DEPLOY] Waiting for confirmation...");

    // Wait for deployment to be mined
    await contract.waitForDeployment();

    const contractAddress = await contract.getAddress();
    const deploymentTx = contract.deploymentTransaction();

    if (!deploymentTx) {
      throw new Error("Deployment transaction not found");
    }

    // Get transaction receipt
    const receipt = await deploymentTx.wait();

    if (!receipt) {
      throw new Error("Transaction receipt not found");
    }

    console.log("[NFT DEPLOY] Contract deployed successfully!");
    console.log("[NFT DEPLOY] Contract address:", contractAddress);
    console.log("[NFT DEPLOY] Block number:", receipt.blockNumber);

    // Calculate deployment cost
    const gasUsed = receipt.gasUsed;
    const effectiveGasPrice = receipt.gasPrice || deploymentTx.gasPrice;
    const deploymentCost = (gasUsed * effectiveGasPrice) / BigInt(10 ** 18);

    const result: DeploymentResult = {
      contractAddress,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: gasUsed.toString(),
      deploymentCost: deploymentCost.toString()
    };

    console.log("[NFT DEPLOY] Deployment result:", result);

    return result;
  } catch (error: any) {
    console.error("[NFT DEPLOY] Deployment failed:", error);

    // Handle specific errors
    if (error.code === "ACTION_REJECTED" || error.code === 4001) {
      throw new Error("Transaction rejected by user");
    }

    if (error.code === "INSUFFICIENT_FUNDS") {
      throw new Error("Insufficient funds to deploy contract");
    }

    if (error.code === "NETWORK_ERROR") {
      throw new Error("Network error. Please check your connection.");
    }

    throw new Error(error.message || "Failed to deploy contract");
  }
}
