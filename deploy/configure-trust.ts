import { ethers } from "ethers";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: "./frontend/.env.local" });

function loadArtifact(name: string) {
  const path = `artifacts/contracts/solidity/${name}.sol/${name}.json`;
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

const BASE_SEPOLIA_EID = 40245;
const ZKSYNC_SEPOLIA_EID = 40305;

async function configureBase() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org");
  const wallet = new ethers.Wallet(process.env.BRIDGE_PRIVATE_KEY!, provider);
  console.log("Configuring Base Sepolia trust with:", wallet.address);

  const { BASE_BRIDGE_SENDER, BASE_BRIDGE_RECEIVER, ZKSYNC_BRIDGE_RECEIVER, ZKSYNC_BRIDGE_FORWARDER } = process.env;
  if (!BASE_BRIDGE_SENDER || !BASE_BRIDGE_RECEIVER || !ZKSYNC_BRIDGE_RECEIVER || !ZKSYNC_BRIDGE_FORWARDER) {
    throw new Error("Missing env vars: BASE_BRIDGE_SENDER, BASE_BRIDGE_RECEIVER, ZKSYNC_BRIDGE_RECEIVER, ZKSYNC_BRIDGE_FORWARDER");
  }

  const senderArt = loadArtifact("BridgeSender");
  const receiverArt = loadArtifact("BridgeReceiver");

  // BridgeSender: set zkSync BridgeReceiver as destination
  console.log("\n--- BridgeSender: set zkSync BridgeReceiver ---");
  const sender = new ethers.Contract(BASE_BRIDGE_SENDER, senderArt.abi, wallet);
  const zkReceiverBytes32 = ethers.zeroPadValue(ZKSYNC_BRIDGE_RECEIVER, 32);
  let tx = await sender.setZkSyncBridgeReceiver(ZKSYNC_SEPOLIA_EID, zkReceiverBytes32);
  await tx.wait();
  console.log("Done");

  // BridgeReceiver: trust zkSync BridgeForwarder
  console.log("\n--- BridgeReceiver: trust zkSync BridgeForwarder ---");
  const receiver = new ethers.Contract(BASE_BRIDGE_RECEIVER, receiverArt.abi, wallet);
  const forwarderBytes32 = ethers.zeroPadValue(ZKSYNC_BRIDGE_FORWARDER, 32);
  tx = await receiver.setTrustedForwarder(ZKSYNC_SEPOLIA_EID, forwarderBytes32);
  await tx.wait();
  console.log("Done");

  console.log("\nBase Sepolia trust configured!");
}

async function configureZkSync() {
  const provider = new ethers.JsonRpcProvider(process.env.ZKSYNC_SEPOLIA_RPC || "https://sepolia.era.zksync.dev");
  const wallet = new ethers.Wallet(process.env.BRIDGE_PRIVATE_KEY!, provider);
  console.log("Configuring zkSync Era Sepolia trust with:", wallet.address);

  const { ZKSYNC_BRIDGE_FORWARDER, ZKSYNC_BRIDGE_RECEIVER, BASE_BRIDGE_SENDER, BASE_BRIDGE_RECEIVER } = process.env;
  if (!ZKSYNC_BRIDGE_FORWARDER || !ZKSYNC_BRIDGE_RECEIVER || !BASE_BRIDGE_SENDER || !BASE_BRIDGE_RECEIVER) {
    throw new Error("Missing env vars: ZKSYNC_BRIDGE_FORWARDER, ZKSYNC_BRIDGE_RECEIVER, BASE_BRIDGE_SENDER, BASE_BRIDGE_RECEIVER");
  }

  const forwarderArt = loadArtifact("BridgeForwarder");
  const receiverArt = loadArtifact("BridgeReceiver");

  // BridgeForwarder: set Base BridgeReceiver as destination
  console.log("\n--- BridgeForwarder: set Base BridgeReceiver ---");
  const forwarder = new ethers.Contract(ZKSYNC_BRIDGE_FORWARDER, forwarderArt.abi, wallet);
  const baseReceiverBytes32 = ethers.zeroPadValue(BASE_BRIDGE_RECEIVER, 32);
  let tx = await forwarder.setBridgeAddress(BASE_SEPOLIA_EID, baseReceiverBytes32);
  await tx.wait();
  console.log("Done");

  // BridgeReceiver: trust Base BridgeSender
  console.log("\n--- BridgeReceiver: trust Base BridgeSender ---");
  const receiver = new ethers.Contract(ZKSYNC_BRIDGE_RECEIVER, receiverArt.abi, wallet);
  const baseSenderBytes32 = ethers.zeroPadValue(BASE_BRIDGE_SENDER, 32);
  tx = await receiver.setTrustedForwarder(BASE_SEPOLIA_EID, baseSenderBytes32);
  await tx.wait();
  console.log("Done");

  console.log("\nzkSync Era Sepolia trust configured!");
}

async function main() {
  const target = process.argv[2];
  if (target === "base") {
    await configureBase();
  } else if (target === "zksync") {
    await configureZkSync();
  } else if (target === "all") {
    await configureBase();
    await configureZkSync();
  } else {
    console.log("Usage: tsx deploy/configure-trust.ts [base|zksync|all]");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
