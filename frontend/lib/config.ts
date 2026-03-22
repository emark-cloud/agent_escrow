export const GENLAYER_CONFIG = {
  chainId: 4221,
  chainIdHex: "0x107D",
  rpcUrl: "https://zksync-os-testnet-genlayer.zksync.dev",
  contractAddress: "0xb2b84Df324054773Bc08d23c20B50833529944de" as `0x${string}`,
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

// Internet Court on Base Sepolia
export const INTERNET_COURT = {
  factory: "0xd533cB0B52E85b3F506b6f0c28b8f6bc4E449Dda" as `0x${string}`,
  usdc: "0x58C27C7C1Ff5DBF480c956acf6b119508b6FBa4f" as `0x${string}`,
  rpc: "https://sepolia.base.org",
  chainId: 84532,
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
};

export const STATUS_COLORS: Record<number, string> = {
  0: "bg-gray-500",
  1: "bg-blue-500",
  2: "bg-green-500",
  3: "bg-emerald-600",
  4: "bg-red-500",
  5: "bg-gray-400",
};
