import { ethers } from "ethers";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

function loadArtifact(name: string) {
  const path = `artifacts/contracts/solidity/${name}.sol/${name}.json`;
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org");
  const wallet = new ethers.Wallet(process.env.BRIDGE_PRIVATE_KEY!, provider);
  console.log("Deploying to Base Sepolia with:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");

  const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";
  const ZKSYNC_EID = 40305;
  const PLACEHOLDER_BYTES32 = ethers.zeroPadValue(wallet.address, 32);

  // 1. Deploy BridgeSender
  console.log("\n--- Deploying BridgeSender ---");
  const senderArt = loadArtifact("BridgeSender");
  const SenderFactory = new ethers.ContractFactory(senderArt.abi, senderArt.bytecode, wallet);
  const sender = await SenderFactory.deploy(LZ_ENDPOINT, wallet.address, ZKSYNC_EID, PLACEHOLDER_BYTES32);
  await sender.waitForDeployment();
  const senderAddr = await sender.getAddress();
  console.log("BridgeSender:", senderAddr);

  // 2. Deploy BridgeReceiver
  console.log("\n--- Deploying BridgeReceiver ---");
  const receiverArt = loadArtifact("BridgeReceiver");
  const ReceiverFactory = new ethers.ContractFactory(receiverArt.abi, receiverArt.bytecode, wallet);
  const receiver = await ReceiverFactory.deploy(LZ_ENDPOINT, wallet.address);
  await receiver.waitForDeployment();
  const receiverAddr = await receiver.getAddress();
  console.log("BridgeReceiver:", receiverAddr);

  // 3. Deploy VerdictRegistry
  console.log("\n--- Deploying VerdictRegistry ---");
  const registryArt = loadArtifact("VerdictRegistry");
  const RegistryFactory = new ethers.ContractFactory(registryArt.abi, registryArt.bytecode, wallet);
  const registry = await RegistryFactory.deploy(receiverAddr);
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("VerdictRegistry:", registryAddr);

  console.log("\n═══════════════════════════════════════");
  console.log("Base Sepolia Deployment Complete");
  console.log("═══════════════════════════════════════");
  console.log(`BASE_BRIDGE_SENDER=${senderAddr}`);
  console.log(`BASE_BRIDGE_RECEIVER=${receiverAddr}`);
  console.log(`BASE_REGISTRY_ADDRESS=${registryAddr}`);
  console.log("\nNext: Deploy to zkSync, then run configure-trust.ts");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
