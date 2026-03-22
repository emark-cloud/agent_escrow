import { createClient, abi } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import type { CalldataEncodable } from "genlayer-js/types";
import {
  createWalletClient,
  http,
  encodeFunctionData,
  defineChain,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { GENLAYER_CONFIG } from "../config";

const { calldata, transactions } = abi;

// Custom viem chain definition for signing
const genlayerChain = defineChain({
  id: GENLAYER_CONFIG.chainId,
  name: "GenLayer Bradbury Testnet",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: {
    default: { http: [GENLAYER_CONFIG.rpcUrl] },
  },
});

// Consensus contract ABI (same as client-side)
const CONSENSUS_ABI = [
  {
    inputs: [
      { name: "_sender", type: "address" },
      { name: "_recipient", type: "address" },
      { name: "_numOfInitialValidators", type: "uint256" },
      { name: "_maxRotations", type: "uint256" },
      { name: "_calldata", type: "bytes" },
      { name: "_validUntil", type: "uint256" },
    ],
    name: "addTransaction",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "txId", type: "bytes32" },
      { indexed: true, name: "recipient", type: "address" },
      { indexed: true, name: "activator", type: "address" },
    ],
    name: "NewTransaction",
    type: "event",
  },
] as const;

// Convert Map/bigint to plain objects recursively
export function mapToObject(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    value.forEach((v, k) => {
      obj[String(k)] = mapToObject(v);
    });
    return obj;
  }
  if (Array.isArray(value)) {
    return value.map(mapToObject);
  }
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(-Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  return value;
}

export function createReadClient() {
  return createClient({ chain: testnetBradbury });
}

export async function readContract<T>(
  functionName: string,
  args: CalldataEncodable[] = []
): Promise<T> {
  const client = createReadClient();
  const raw = await client.readContract({
    address: GENLAYER_CONFIG.contractAddress as Address,
    functionName,
    args,
  });
  const result = mapToObject(raw);

  // get_agreements_by_address returns a comma-separated string, not a list
  if (functionName === "get_agreements_by_address") {
    const str = result as string;
    return (str ? str.split(",") : []) as T;
  }

  return result as T;
}

export async function serverWriteContract(
  privateKey: Hex,
  functionName: string,
  args: CalldataEncodable[]
): Promise<string> {
  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: genlayerChain,
    transport: http(GENLAYER_CONFIG.rpcUrl),
  });

  const calldataObj = calldata.makeCalldataObject(functionName, args, undefined);
  const encodedCalldata = calldata.encode(calldataObj);
  const serializedData = transactions.serialize([
    encodedCalldata,
    false,
  ]) as Hex;

  const txData = encodeFunctionData({
    abi: CONSENSUS_ABI,
    functionName: "addTransaction",
    args: [
      account.address,
      GENLAYER_CONFIG.contractAddress,
      BigInt(5),
      BigInt(3),
      serializedData,
      BigInt(0),
    ],
  });

  const txHash = await walletClient.sendTransaction({
    to: GENLAYER_CONFIG.consensusContract,
    data: txData,
    gas: BigInt(5_000_000),
  });

  return txHash;
}

export async function serverGetGenLayerTxId(
  l1TxHash: string
): Promise<string | null> {
  const consensusAddr = GENLAYER_CONFIG.consensusContract.toLowerCase();

  for (let i = 0; i < 30; i++) {
    try {
      const resp = await fetch(GENLAYER_CONFIG.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getTransactionReceipt",
          params: [l1TxHash],
          id: 1,
        }),
      });
      const data = await resp.json();
      const receipt = data?.result;
      if (receipt) {
        const log = receipt.logs?.find(
          (l: { address: string }) => l.address.toLowerCase() === consensusAddr
        );
        if (log?.topics?.[1]) {
          return log.topics[1];
        }
        return null;
      }
    } catch {
      // not available yet
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

export interface ConsensusResult {
  txHash: string;
  glTxId: string | null;
  status: string;
}

export async function serverWaitForConsensus(
  l1TxHash: string,
  maxRetries = 200,
  interval = 5000
): Promise<ConsensusResult> {
  const glTxId = await serverGetGenLayerTxId(l1TxHash);
  if (!glTxId) {
    throw new Error("Could not find GenLayer transaction ID from L1 receipt");
  }

  const client = createReadClient();

  for (let i = 0; i < maxRetries; i++) {
    try {
      const tx = await client.getTransaction({
        hash: glTxId as unknown as Parameters<typeof client.getTransaction>[0]["hash"],
      });

      const statusName = (tx as any).statusName as string;

      if (statusName === "ACCEPTED" || statusName === "FINALIZED") {
        return { txHash: l1TxHash, glTxId, status: statusName };
      }

      if (statusName === "UNDETERMINED" || statusName === "DISMISSED" || statusName === "CANCELED") {
        throw new Error(`Transaction failed: ${statusName}`);
      }

      if (statusName === "LEADER_TIMEOUT" && i > 30) {
        throw new Error("Leader timed out. Please resubmit.");
      }
    } catch (e) {
      if (e instanceof Error && (e.message.includes("failed") || e.message.includes("timed out"))) {
        throw e;
      }
      // not available yet
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error("Transaction timed out");
}
