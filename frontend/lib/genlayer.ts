import { createClient, abi } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import type { CalldataEncodable } from "genlayer-js/types";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { GENLAYER_CONFIG, GENLAYER_CHAIN } from "./config";
import { getProvider } from "./provider";

const { calldata, transactions } = abi;

async function ensureCorrectChain() {
  const provider = getProvider();
  if (!provider) throw new Error("No wallet connected. Please connect your wallet first.");
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: GENLAYER_CHAIN.chainId }],
    });
  } catch (e: unknown) {
    // 4902 = chain not added; only then try to add it
    const code = (e as { code?: number })?.code;
    if (code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [GENLAYER_CHAIN],
      });
    } else {
      throw e;
    }
  }
}

// Consensus contract ABI for addTransaction (Bradbury testnet)
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
    // Use Number for values that fit safely, string for large values
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

export async function readContractAt<T>(
  contractAddress: string,
  functionName: string,
  args: CalldataEncodable[] = []
): Promise<T> {
  const client = createReadClient();
  const result = await client.readContract({
    address: contractAddress as Address,
    functionName,
    args,
  });
  return mapToObject(result) as T;
}

export async function deployContract(
  code: string,
  args: CalldataEncodable[] = []
): Promise<string> {
  await ensureCorrectChain();
  const accounts = (await getProvider().request({
    method: "eth_accounts",
  })) as Address[];
  const senderAddress = accounts[0];

  if (!senderAddress) throw new Error("No wallet connected");

  const calldataObj = calldata.makeCalldataObject(undefined, args, undefined);
  const encodedCalldata = calldata.encode(calldataObj);
  const serializedData = transactions.serialize([
    code,
    encodedCalldata,
    false,
  ]) as Hex;

  const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;

  const txData = encodeFunctionData({
    abi: CONSENSUS_ABI,
    functionName: "addTransaction",
    args: [
      senderAddress,
      zeroAddress,
      BigInt(5),
      BigInt(3),
      serializedData,
      BigInt(0),
    ],
  });

  const txHash = (await getProvider().request({
    method: "eth_sendTransaction",
    params: [
      {
        from: senderAddress,
        to: GENLAYER_CONFIG.consensusContract,
        data: txData,
        gas: "0x1312D00",
      },
    ],
  })) as Hex;

  return txHash;
}

export async function getDeployedAddress(
  l1TxHash: string,
  maxRetries = 60,
  interval = 5000
): Promise<string | null> {
  // First extract the GenLayer txId from L1 receipt
  const glTxId = await getGenLayerTxId(l1TxHash);
  if (!glTxId) return null;

  const client = createReadClient();
  for (let i = 0; i < maxRetries; i++) {
    try {
      const tx = await client.getTransaction({
        hash: glTxId as unknown as Parameters<typeof client.getTransaction>[0]["hash"],
      });
      const addr =
        (tx as any)?.recipient ??
        (tx as any)?.to_address ??
        (tx as any)?.contractAddress ??
        null;
      if (addr && addr !== "0x0000000000000000000000000000000000000000") {
        return addr;
      }
    } catch {
      // not available yet
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return null;
}


export async function sendWriteTransactionTo(
  contractAddress: string,
  functionName: string,
  args: CalldataEncodable[]
): Promise<string> {
  await ensureCorrectChain();
  const accounts = (await getProvider().request({
    method: "eth_accounts",
  })) as Address[];
  const senderAddress = accounts[0];

  if (!senderAddress) throw new Error("No wallet connected");

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
      senderAddress,
      contractAddress as Address,
      BigInt(5),
      BigInt(3),
      serializedData,
      BigInt(0),
    ],
  });

  const txHash = (await getProvider().request({
    method: "eth_sendTransaction",
    params: [
      {
        from: senderAddress,
        to: GENLAYER_CONFIG.consensusContract,
        data: txData,
        gas: "0x4C4B40",
      },
    ],
  })) as Hex;

  return txHash;
}

export async function sendWriteTransaction(
  functionName: string,
  args: CalldataEncodable[]
): Promise<string> {
  await ensureCorrectChain();
  const accounts = (await getProvider().request({
    method: "eth_accounts",
  })) as Address[];
  const senderAddress = accounts[0];

  if (!senderAddress) throw new Error("No wallet connected");

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
      senderAddress,
      GENLAYER_CONFIG.contractAddress,
      BigInt(5),
      BigInt(3),
      serializedData,
      BigInt(0),
    ],
  });

  const txHash = (await getProvider().request({
    method: "eth_sendTransaction",
    params: [
      {
        from: senderAddress,
        to: GENLAYER_CONFIG.consensusContract,
        data: txData,
        gas: "0x4C4B40",
      },
    ],
  })) as Hex;

  return txHash;
}

export interface ConsensusStatus {
  stage: "l1_pending" | "pending" | "proposing" | "committing" | "revealing" | "accepted" | "finalized" | "leader_timeout" | "failed";
  votesCommitted: number;
  votesRevealed: number;
  totalValidators: number;
  result: string; // "IDLE" | "AGREE" | "DISAGREE"
  glTxId: string | null;
  recommendation: string;
}

export async function getConsensusStatus(
  l1TxHash: string,
  cachedGlTxId?: string | null
): Promise<ConsensusStatus> {
  const glTxId = cachedGlTxId || (await getGenLayerTxId(l1TxHash));

  if (!glTxId) {
    return {
      stage: "l1_pending",
      votesCommitted: 0,
      votesRevealed: 0,
      totalValidators: 5,
      result: "IDLE",
      glTxId: null,
      recommendation: "Waiting for L1 confirmation...",
    };
  }

  const client = createReadClient();
  try {
    const tx = await client.getTransaction({
      hash: glTxId as unknown as Parameters<typeof client.getTransaction>[0]["hash"],
    });

    const statusName = (tx as any).statusName as string;
    const resultName = (tx as any).resultName as string;
    const committed = Number((tx as any).lastRound?.votesCommitted ?? 0);
    const revealed = Number((tx as any).lastRound?.votesRevealed ?? 0);

    const stageMap: Record<string, ConsensusStatus["stage"]> = {
      PENDING: "pending",
      PROPOSING: "proposing",
      COMMITTING: "committing",
      REVEALING: "revealing",
      ACCEPTED: "accepted",
      FINALIZED: "finalized",
      LEADER_TIMEOUT: "leader_timeout",
      UNDETERMINED: "failed",
      UNINITIALIZED: "pending",
      DISMISSED: "failed",
      CANCELED: "failed",
    };

    const stage = stageMap[statusName] || "pending";

    const recommendations: Record<string, string> = {
      pending: "Transaction queued. Validators will pick it up shortly.",
      proposing: "Leader validator is executing your transaction...",
      committing: `Validators voting: ${committed}/5 committed. Almost there.`,
      revealing: `Validators revealing votes: ${revealed}/5. Nearly done.`,
      accepted: resultName === "DISAGREE"
        ? "Consensus reached, but contract execution failed. Check inputs."
        : "Consensus reached! State updated.",
      finalized: "Fully finalized on chain.",
      leader_timeout: "Leader timed out. Network will rotate to a new leader. If stuck, resubmit the transaction.",
      failed: "Transaction failed. Try resubmitting.",
    };

    return {
      stage,
      votesCommitted: committed,
      votesRevealed: revealed,
      totalValidators: 5,
      result: resultName,
      glTxId,
      recommendation: recommendations[stage] || "Processing...",
    };
  } catch {
    return {
      stage: "pending",
      votesCommitted: 0,
      votesRevealed: 0,
      totalValidators: 5,
      result: "IDLE",
      glTxId,
      recommendation: "Checking validator status...",
    };
  }
}

async function getGenLayerTxId(l1TxHash: string): Promise<string | null> {
  const consensusAddr = GENLAYER_CONFIG.consensusContract.toLowerCase();
  // Poll for L1 receipt
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
        // Find NewTransaction event from consensus contract
        const log = receipt.logs?.find(
          (l: { address: string }) => l.address.toLowerCase() === consensusAddr
        );
        if (log?.topics?.[1]) {
          return log.topics[1];
        }
        // Receipt exists but no matching log — L1 reverted or no event
        return null;
      }
    } catch {
      // not available yet
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

export async function waitForTransaction(
  txHash: string,
  maxRetries = 200,
  interval = 5000,
  onStatus?: (status: ConsensusStatus) => void
): Promise<{ status: string }> {
  const client = createReadClient();

  // Step 1: Extract GenLayer txId from L1 receipt logs
  onStatus?.({
    stage: "l1_pending", votesCommitted: 0, votesRevealed: 0,
    totalValidators: 5, result: "IDLE", glTxId: null,
    recommendation: "Waiting for L1 confirmation...",
  });

  const glTxId = await getGenLayerTxId(txHash);
  if (!glTxId) {
    throw new Error("Could not find GenLayer transaction ID from L1 receipt");
  }

  // Step 2: Poll GenLayer consensus using the correct txId
  for (let i = 0; i < maxRetries; i++) {
    // Use getConsensusStatus for live tracking
    const cs = await getConsensusStatus(txHash, glTxId);
    onStatus?.(cs);

    // Return immediately if consensus is reached
    if (cs.stage === "accepted" || cs.stage === "finalized") {
      return { status: cs.stage === "finalized" ? "FINALIZED" : "ACCEPTED" };
    }

    // Leader timeout — give it some rotations, then throw
    if (cs.stage === "leader_timeout" && i > 30) {
      throw new Error("Leader timed out. Please resubmit the transaction.");
    }

    // Failed/dismissed — throw immediately
    if (cs.stage === "failed") {
      throw new Error("Transaction failed on chain. Please resubmit.");
    }

    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error("Transaction timed out");
}
