// Cross-chain bridge config (Base Sepolia + zkSync)
export const BASE_CONFIG = {
  chainId: 84532,
  rpcUrl: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
  registryAddress: (process.env.BASE_REGISTRY_ADDRESS || "") as `0x${string}`,
  bridgeReceiverAddress: (process.env.BASE_BRIDGE_RECEIVER || "") as `0x${string}`,
  explorerUrl: "https://sepolia.basescan.org",
};

export const BRIDGE_CONFIG = {
  genlayerBridgeSender: process.env.GL_BRIDGE_SENDER || "",
  genlayerBridgeReceiver: process.env.GL_BRIDGE_RECEIVER || "",
  enabled: !!(process.env.BASE_REGISTRY_ADDRESS && process.env.GL_BRIDGE_SENDER),
};

// --- Network switching ---

export type NetworkName = "bradbury" | "studionet";

export interface NetworkConfig {
  chainId: number;
  chainIdHex: string;
  rpcUrl: string;
  contractAddress: `0x${string}`;
  consensusContract: `0x${string}`;
  chainName: string;
  gasWrite: number;
  gasDeploy: number;
  isStudio: boolean;
  explorerUrl: string;
}

export const NETWORK_CONFIGS: Record<NetworkName, NetworkConfig> = {
  bradbury: {
    chainId: 4221,
    chainIdHex: "0x107D",
    rpcUrl: "https://rpc-bradbury.genlayer.com",
    contractAddress: "0x7Ee4c7B8831cb65424B41163BE3a6808Ab3c95D3",
    consensusContract: "0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D",
    chainName: "GenLayer Bradbury Testnet",
    gasWrite: 5_000_000,
    gasDeploy: 20_000_000,
    isStudio: false,
    explorerUrl: "https://explorer-bradbury.genlayer.com",
  },
  studionet: {
    chainId: 61999,
    chainIdHex: "0xF22F",
    rpcUrl: "https://studio.genlayer.com/api",
    contractAddress: "0x0c72b13441d9d1eF7C4aBfE96d7348c0AAcC24f2",
    consensusContract: "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575",
    chainName: "GenLayer StudioNet",
    gasWrite: 500_000,
    gasDeploy: 500_000,
    isStudio: true,
    explorerUrl: "https://genlayer-explorer.vercel.app",
  },
};

export function getNetworkConfig(network: NetworkName): NetworkConfig {
  return NETWORK_CONFIGS[network];
}

export function getGenlayerChain(network: NetworkName) {
  const cfg = NETWORK_CONFIGS[network];
  return {
    chainId: cfg.chainIdHex,
    chainName: cfg.chainName,
    rpcUrls: [cfg.rpcUrl],
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  };
}

export const DEFAULT_NETWORK: NetworkName = "bradbury";

// Backwards-compatible exports (default to Bradbury)
export const GENLAYER_CONFIG = NETWORK_CONFIGS[DEFAULT_NETWORK];
export const GENLAYER_CHAIN = getGenlayerChain(DEFAULT_NETWORK);

// Status labels
export const AGREEMENT_STATUS: Record<number, string> = {
  0: "Created",
  1: "Active",
  2: "Completed",
  3: "Disputed",
  4: "Cancelled",
};

export const MILESTONE_STATUS: Record<number, string> = {
  0: "Pending",
  1: "Monitoring",
  2: "Verified",
  3: "Paid",
  4: "Disputed",
  5: "Failed",
  6: "Refunded",
};

// Milestone status colors
export const STATUS_COLORS: Record<number, string> = {
  0: "bg-gray-500",     // Pending
  1: "bg-blue-500",     // Monitoring
  2: "bg-green-500",    // Verified
  3: "bg-emerald-600",  // Paid
  4: "bg-red-500",      // Disputed
  5: "bg-gray-400",     // Failed
  6: "bg-orange-500",   // Refunded
};

// Agreement status colors (different semantics from milestone)
export const AGREEMENT_STATUS_COLORS: Record<number, string> = {
  0: "bg-gray-500",     // Created
  1: "bg-blue-500",     // Active
  2: "bg-green-500",    // Completed
  3: "bg-red-500",      // Disputed
  4: "bg-gray-400",     // Cancelled
};
