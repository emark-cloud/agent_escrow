import { ethers } from "ethers";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

function loadArtifact(name: string) {
  const path = `artifacts/contracts/solidity/${name}.sol/${name}.json`;
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.ZKSYNC_SEPOLIA_RPC || "https://sepolia.era.zksync.dev");
  const wallet = new ethers.Wallet(process.env.BRIDGE_PRIVATE_KEY!, provider);
  console.log("Deploying to zkSync Era Sepolia with:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");

  const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";

  // 1. Deploy BridgeReceiver
  console.log("\n--- Deploying BridgeReceiver ---");
  const receiverArt = loadArtifact("BridgeReceiver");
  const ReceiverFactory = new ethers.ContractFactory(receiverArt.abi, receiverArt.bytecode, wallet);
  const receiver = await ReceiverFactory.deploy(LZ_ENDPOINT, wallet.address);
  await receiver.waitForDeployment();
  const receiverAddr = await receiver.getAddress();
  console.log("BridgeReceiver:", receiverAddr);

  // 2. Deploy BridgeForwarder
  console.log("\n--- Deploying BridgeForwarder ---");
  const forwarderArt = loadArtifact("BridgeForwarder");
  const ForwarderFactory = new ethers.ContractFactory(forwarderArt.abi, forwarderArt.bytecode, wallet);
  const forwarder = await ForwarderFactory.deploy(LZ_ENDPOINT, wallet.address, wallet.address);
  await forwarder.waitForDeployment();
  const forwarderAddr = await forwarder.getAddress();
  console.log("BridgeForwarder:", forwarderAddr);

  // 3. Authorize relay wallet on BridgeReceiver
  console.log("\n--- Authorizing relay wallet ---");
  const tx = await receiver.getFunction("setAuthorizedRelayer")(wallet.address, true);
  await tx.wait();
  console.log("Relay authorized on BridgeReceiver");

  console.log("\n═══════════════════════════════════════");
  console.log("zkSync Era Sepolia Deployment Complete");
  console.log("═══════════════════════════════════════");
  console.log(`ZKSYNC_BRIDGE_RECEIVER=${receiverAddr}`);
  console.log(`ZKSYNC_BRIDGE_FORWARDER=${forwarderAddr}`);
  console.log("\nNext: Run configure-trust.ts to link all contracts");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
