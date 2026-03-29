import type { HardhatUserConfig } from "hardhat/config";
import "dotenv/config";
import "@matterlabs/hardhat-zksync";

const PRIVATE_KEY = process.env.BRIDGE_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  zksolc: {
    version: "latest",
  },
  paths: {
    sources: "./contracts/solidity",
    tests: "./tests/solidity",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    baseSepolia: {
      type: "http",
      url: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
      chainId: 84532,
      accounts: [PRIVATE_KEY],
    },
    zkSyncSepolia: {
      type: "http",
      url: process.env.ZKSYNC_SEPOLIA_RPC || "https://sepolia.era.zksync.dev",
      chainId: 300,
      accounts: [PRIVATE_KEY],
      zksync: true,
    },
  },
};

export default config;
