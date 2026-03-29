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

export const GENLAYER_CONFIG = {
  chainId: 4221,
  chainIdHex: "0x107D",
  rpcUrl: "https://zksync-os-testnet-genlayer.zksync.dev",
  contractAddress: "0x7Ee4c7B8831cb65424B41163BE3a6808Ab3c95D3" as `0x${string}`,
  consensusContract: "0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D" as `0x${string}`,
};

export const GENLAYER_CHAIN = {
  chainId: "0x107D",
  chainName: "GenLayer Bradbury Testnet",
  rpcUrls: ["https://zksync-os-testnet-genlayer.zksync.dev"],
  nativeCurrency: {
    name: "GEN",
    symbol: "GEN",
    decimals: 18,
  },
};

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
