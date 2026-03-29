/**
 * GenLayer -> Base Relay
 *
 * Polls GenLayer BridgeSender for pending verdict messages and relays them
 * directly to the VerdictRegistry on Base Sepolia.
 *
 * Architecture: GenLayer BridgeSender → Relay → Base VerdictRegistry
 * (Direct relay — LayerZero V2 is not available on zkSync Era Sepolia)
 */

import { ethers } from "ethers";
import { createAccount, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import type { Address } from "genlayer-js/types";
import {
  getBridgeSenderAddress,
  getPrivateKey,
} from "./config.js";

interface BridgeMessage {
  targetChainId: number;
  targetContract: string;
  data: string;
}

const VERDICT_REGISTRY_ABI = [
  "function processBridgeMessage(uint32 _sourceChainId, address _srcSender, bytes _message) external",
];

const BASE_RPC = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";
const BASE_CHAIN_ID = 84532;
// GenLayer Bradbury chain ID used as sourceChainId in the verdict
const GL_CHAIN_ID = 4221;

// Raw RPC call to Base Sepolia
async function baseRpc(method: string, params: any[]): Promise<any> {
  const resp = await fetch(BASE_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
    signal: AbortSignal.timeout(30000),
  });
  const json = await resp.json();
  if ((json as any).error) throw new Error(`RPC error: ${(json as any).error.message}`);
  return (json as any).result;
}

export class GenLayerToEvmRelay {
  private wallet: ethers.Wallet;
  private registryIface: ethers.Interface;
  private genLayerClient: any;
  private usedHashes: Set<string>;

  constructor() {
    this.wallet = new ethers.Wallet(getPrivateKey());
    this.registryIface = new ethers.Interface(VERDICT_REGISTRY_ABI);

    // Initialize GenLayer client
    const privateKey = getPrivateKey();
    const account = createAccount(`0x${privateKey.replace(/^0x/, "")}` as `0x${string}`);
    this.genLayerClient = createClient({
      chain: testnetBradbury,
      account,
    });

    this.usedHashes = new Set<string>();
  }

  private async getPendingMessages(): Promise<string[]> {
    try {
      const response = await this.genLayerClient.readContract({
        address: getBridgeSenderAddress() as Address,
        functionName: "get_message_hashes",
        args: [],
      });

      if (!Array.isArray(response)) {
        console.error("Unexpected response format:", response);
        return [];
      }

      return response.filter(
        (hash): hash is string => !this.usedHashes.has(hash)
      );
    } catch (error) {
      console.error("Error fetching messages:", error);
      return [];
    }
  }

  private async relayMessage(hash: string): Promise<void> {
    try {
      console.log(`[GL→Base] Processing message ${hash}`);

      // Get message from GenLayer
      const raw = await this.genLayerClient.readContract({
        address: getBridgeSenderAddress() as Address,
        functionName: "get_message",
        args: [hash],
      });

      // Handle both Map and plain object responses
      const get = (key: string) => raw instanceof Map ? raw.get(key) : (raw as any)[key];

      // Convert data to hex
      let messageData = get("data");
      if (messageData instanceof Uint8Array || Buffer.isBuffer(messageData)) {
        messageData = "0x" + Buffer.from(messageData).toString("hex");
      } else if (
        typeof messageData === "string" &&
        !messageData.startsWith("0x")
      ) {
        messageData = "0x" + messageData;
      }

      const targetContract = get("target_contract");
      console.log(`[GL→Base] Target: ${targetContract}, data: ${(messageData as string).slice(0, 80)}...`);

      // The bridge message data is in bridge format:
      //   (uint32 srcChainId, address srcSender, address targetContract, bytes innerData)
      // where innerData is JSON with verdict fields. We need to:
      // 1. Decode the bridge wrapper to extract innerData
      // 2. Parse the JSON
      // 3. ABI-encode as (string, uint256, string, bytes32) for VerdictRegistry

      let abiEncodedMessage: string;
      try {
        // Try decoding bridge wrapper format
        const bridgeCoder = new ethers.AbiCoder();
        const decoded = bridgeCoder.decode(
          ["uint32", "address", "address", "bytes"],
          messageData as string
        );
        const innerDataBytes = decoded[3]; // bytes innerData
        const jsonStr = ethers.toUtf8String(innerDataBytes);
        console.log(`[GL→Base] Inner JSON: ${jsonStr}`);

        const verdict = JSON.parse(jsonStr);
        abiEncodedMessage = bridgeCoder.encode(
          ["string", "uint256", "string", "bytes32"],
          [
            verdict.agreementId,
            verdict.milestoneIndex,
            verdict.verdict,
            verdict.reasoningHash,
          ]
        );
        console.log(`[GL→Base] ABI-encoded message for VerdictRegistry`);
      } catch (decodeErr) {
        // Fallback: maybe the data IS already ABI-encoded or is raw JSON
        console.log(`[GL→Base] Bridge wrapper decode failed, trying raw JSON parse...`);
        try {
          const jsonStr = ethers.toUtf8String(messageData as string);
          const verdict = JSON.parse(jsonStr);
          const coder = new ethers.AbiCoder();
          abiEncodedMessage = coder.encode(
            ["string", "uint256", "string", "bytes32"],
            [
              verdict.agreementId,
              verdict.milestoneIndex,
              verdict.verdict,
              verdict.reasoningHash,
            ]
          );
        } catch {
          // Last resort: pass data as-is (original behavior)
          console.warn(`[GL→Base] Could not parse message data, passing raw`);
          abiEncodedMessage = messageData as string;
        }
      }

      // Call processBridgeMessage directly on the VerdictRegistry
      const txData = this.registryIface.encodeFunctionData("processBridgeMessage", [
        GL_CHAIN_ID,
        this.wallet.address, // srcSender = relay
        abiEncodedMessage,
      ]);

      const nonce = await baseRpc("eth_getTransactionCount", [this.wallet.address, "latest"]);
      const gasPrice = await baseRpc("eth_gasPrice", []);

      const tx = {
        to: targetContract,
        data: txData,
        nonce: parseInt(nonce, 16),
        gasLimit: 500_000,
        gasPrice: BigInt(gasPrice),
        chainId: BASE_CHAIN_ID,
        type: 0,
      };

      const signedTx = await this.wallet.signTransaction(tx);
      const txHash = await baseRpc("eth_sendRawTransaction", [signedTx]);
      console.log(`[GL→Base] TX: ${txHash}`);

      // Wait for receipt
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const receipt = await baseRpc("eth_getTransactionReceipt", [txHash]);
          if (receipt) {
            if (receipt.status === "0x1") {
              console.log(`[GL→Base] Confirmed in block ${parseInt(receipt.blockNumber, 16)}`);
            } else {
              console.error(`[GL→Base] TX failed! Status: ${receipt.status}`);
            }
            return;
          }
        } catch (e) { /* not mined yet */ }
      }
      console.warn(`[GL→Base] TX ${txHash} not confirmed after 60s`);
    } catch (error) {
      console.error(`[GL→Base] Error relaying ${hash}:`, error);
    }
  }

  public async sync(): Promise<void> {
    try {
      console.log("[GL→Base] Starting sync...");

      const hashes = await this.getPendingMessages();
      console.log(`[GL→Base] Found ${hashes.length} messages`);

      for (const hash of hashes) {
        this.usedHashes.add(hash);
        await this.relayMessage(hash);
      }

      console.log("[GL→Base] Sync complete");
    } catch (error) {
      console.error("[GL→Base] Sync error:", error);
    }
  }
}
