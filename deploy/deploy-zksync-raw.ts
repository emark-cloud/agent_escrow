import { ethers } from "ethers";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const RPC = process.env.ZKSYNC_SEPOLIA_RPC || "https://sepolia.era.zksync.dev";
const PK = process.env.BRIDGE_PRIVATE_KEY!;

async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
    signal: AbortSignal.timeout(120000),
  });
  const data = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

async function getBalance(addr: string): Promise<bigint> {
  const hex = (await rpc("eth_getBalance", [addr, "latest"])) as string;
  return BigInt(hex);
}

async function getNonce(addr: string): Promise<number> {
  const hex = (await rpc("eth_getTransactionCount", [addr, "latest"])) as string;
  return parseInt(hex, 16);
}

async function getGasPrice(): Promise<bigint> {
  const hex = (await rpc("eth_gasPrice")) as string;
  return BigInt(hex);
}

async function sendRawTx(signedTx: string): Promise<string> {
  return (await rpc("eth_sendRawTransaction", [signedTx])) as string;
}

async function waitForReceipt(txHash: string, timeout = 120000): Promise<{ contractAddress: string; status: string }> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const receipt = (await rpc("eth_getTransactionReceipt", [txHash])) as { contractAddress: string; status: string } | null;
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Receipt timeout for " + txHash);
}

function loadArtifact(name: string) {
  return JSON.parse(fs.readFileSync(`artifacts/contracts/solidity/${name}.sol/${name}.json`, "utf8"));
}

async function deploy(wallet: ethers.Wallet, artifact: { abi: ethers.InterfaceAbi; bytecode: string }, args: unknown[], nonce: number, gasPrice: bigint): Promise<string> {
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode);
  const deployTx = await factory.getDeployTransaction(...args);

  const tx = {
    type: 0,
    nonce,
    gasPrice,
    gasLimit: 5000000,
    data: deployTx.data,
    chainId: 300,
    value: 0,
  };

  const signed = await wallet.signTransaction(tx);
  const txHash = await sendRawTx(signed);
  console.log("  TX:", txHash);

  const receipt = await waitForReceipt(txHash);
  if (receipt.status !== "0x1") throw new Error("Deploy failed: " + txHash);
  return receipt.contractAddress;
}

async function main() {
  const wallet = new ethers.Wallet(PK);
  console.log("Deploying to zkSync Era Sepolia with:", wallet.address);

  const bal = await getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(bal), "ETH");

  let nonce = await getNonce(wallet.address);
  const gasPrice = await getGasPrice();
  console.log("Nonce:", nonce, "Gas price:", gasPrice.toString());

  const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";

  // 1. BridgeReceiver
  console.log("\n--- Deploying BridgeReceiver ---");
  const receiverArt = loadArtifact("BridgeReceiver");
  const receiverAddr = await deploy(wallet, receiverArt, [LZ_ENDPOINT, wallet.address], nonce++, gasPrice);
  console.log("BridgeReceiver:", receiverAddr);

  // 2. BridgeForwarder
  console.log("\n--- Deploying BridgeForwarder ---");
  const forwarderArt = loadArtifact("BridgeForwarder");
  const forwarderAddr = await deploy(wallet, forwarderArt, [LZ_ENDPOINT, wallet.address, wallet.address], nonce++, gasPrice);
  console.log("BridgeForwarder:", forwarderAddr);

  // 3. Authorize relay
  console.log("\n--- Authorizing relay wallet ---");
  const iface = new ethers.Interface(receiverArt.abi);
  const calldata = iface.encodeFunctionData("setAuthorizedRelayer", [wallet.address, true]);
  const authTx = {
    type: 0,
    nonce: nonce++,
    gasPrice,
    gasLimit: 200000,
    to: receiverAddr,
    data: calldata,
    chainId: 300,
    value: 0,
  };
  const signedAuth = await wallet.signTransaction(authTx);
  const authHash = await sendRawTx(signedAuth);
  console.log("  TX:", authHash);
  const authReceipt = await waitForReceipt(authHash);
  console.log("  Status:", authReceipt.status === "0x1" ? "OK" : "FAILED");

  console.log("\n═══════════════════════════════════════");
  console.log("zkSync Era Sepolia Deployment Complete");
  console.log("═══════════════════════════════════════");
  console.log(`ZKSYNC_BRIDGE_RECEIVER=${receiverAddr}`);
  console.log(`ZKSYNC_BRIDGE_FORWARDER=${forwarderAddr}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
