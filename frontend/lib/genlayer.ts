import { createClient, abi } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import type { CalldataEncodable } from "genlayer-js/types";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { GENLAYER_CONFIG, type NetworkConfig, getGenlayerChain } from "./config";
import { getProvider } from "./provider";

const { calldata, transactions } = abi;

// --- Chain helpers ---

function getSdkChain(config: NetworkConfig) {
  return config.isStudio ? studionet : testnetBradbury;
}

// Consensus ABI: StudioNet has 5 params (nonpayable), Bradbury has 6 (payable)
const CONSENSUS_ABI_STUDIONET = [
  {
    inputs: [
      { name: "_sender", type: "address" },
      { name: "_recipient", type: "address" },
      { name: "_numOfInitialValidators", type: "uint256" },
      { name: "_maxRotations", type: "uint256" },
      { name: "_txData", type: "bytes" },
    ],
    name: "addTransaction",
    outputs: [],
    stateMutability: "nonpayable",
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

const CONSENSUS_ABI_BRADBURY = [
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

function encodeAddTx(config: NetworkConfig, sender: Address, recipient: Address, data: Hex) {
  if (config.isStudio) {
    return encodeFunctionData({
      abi: CONSENSUS_ABI_STUDIONET,
      functionName: "addTransaction",
      args: [sender, recipient, BigInt(5), BigInt(3), data],
    });
  }
  return encodeFunctionData({
    abi: CONSENSUS_ABI_BRADBURY,
    functionName: "addTransaction",
    args: [sender, recipient, BigInt(5), BigInt(3), data, BigInt(0)],
  });
}

// --- Ensure correct MetaMask chain ---

async function ensureCorrectChain(config: NetworkConfig = GENLAYER_CONFIG) {
  const provider = getProvider();
  if (!provider) throw new Error("No wallet connected. Please connect your wallet first.");
  const chain = getGenlayerChain(config.isStudio ? "studionet" : "bradbury");
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.chainId }],
    });
  } catch (e: unknown) {
    const code = (e as { code?: number })?.code;
    if (code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [chain],
      });
    } else {
      throw e;
    }
  }
}

// --- Map/bigint conversion ---

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

// --- Read operations ---

export function createReadClient(config: NetworkConfig = GENLAYER_CONFIG) {
  return createClient({ chain: getSdkChain(config) });
}

export async function readContract<T>(
  functionName: string,
  args: CalldataEncodable[] = [],
  config: NetworkConfig = GENLAYER_CONFIG
): Promise<T> {
  const client = createReadClient(config);
  const raw = await client.readContract({
    address: config.contractAddress as Address,
    functionName,
    args,
  });
  const result = mapToObject(raw);

  if (functionName === "get_agreements_by_address") {
    const str = result as string;
    return (str ? str.split(",") : []) as T;
  }

  return result as T;
}

export async function readContractAt<T>(
  contractAddress: string,
  functionName: string,
  args: CalldataEncodable[] = [],
  config: NetworkConfig = GENLAYER_CONFIG
): Promise<T> {
  const client = createReadClient(config);
  const result = await client.readContract({
    address: contractAddress as Address,
    functionName,
    args,
  });
  return mapToObject(result) as T;
}

// --- Write operations ---

export async function deployContract(
  code: string,
  args: CalldataEncodable[] = [],
  config: NetworkConfig = GENLAYER_CONFIG
): Promise<string> {
  await ensureCorrectChain(config);
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
  const txData = encodeAddTx(config, senderAddress, zeroAddress, serializedData);

  const txHash = (await getProvider().request({
    method: "eth_sendTransaction",
    params: [
      {
        from: senderAddress,
        to: config.consensusContract,
        data: txData,
        gas: "0x" + config.gasDeploy.toString(16),
      },
    ],
  })) as Hex;

  return txHash;
}

export async function getDeployedAddress(
  l1TxHash: string,
  maxRetries = 60,
  interval = 5000,
  config: NetworkConfig = GENLAYER_CONFIG
): Promise<string | null> {
  const glTxId = await getGenLayerTxId(l1TxHash, config);
  if (!glTxId) return null;

  const client = createReadClient(config);
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
  args: CalldataEncodable[],
  config: NetworkConfig = GENLAYER_CONFIG
): Promise<string> {
  await ensureCorrectChain(config);
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

  const txData = encodeAddTx(config, senderAddress, contractAddress as Address, serializedData);

  const txHash = (await getProvider().request({
    method: "eth_sendTransaction",
    params: [
      {
        from: senderAddress,
        to: config.consensusContract,
        data: txData,
        gas: "0x" + config.gasWrite.toString(16),
      },
    ],
  })) as Hex;

  return txHash;
}

export async function sendWriteTransaction(
  functionName: string,
  args: CalldataEncodable[],
  config: NetworkConfig = GENLAYER_CONFIG
): Promise<string> {
  await ensureCorrectChain(config);
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

  const txData = encodeAddTx(config, senderAddress, config.contractAddress, serializedData);

  const txHash = (await getProvider().request({
    method: "eth_sendTransaction",
    params: [
      {
        from: senderAddress,
        to: config.consensusContract,
        data: txData,
        gas: "0x" + config.gasWrite.toString(16),
      },
    ],
  })) as Hex;

  return txHash;
}

// --- Consensus tracking ---

export interface ConsensusStatus {
  stage: "l1_pending" | "pending" | "proposing" | "committing" | "revealing" | "accepted" | "finalized" | "leader_timeout" | "failed";
  votesCommitted: number;
  votesRevealed: number;
  totalValidators: number;
  result: string;
  glTxId: string | null;
  recommendation: string;
}

export async function getConsensusStatus(
  l1TxHash: string,
  cachedGlTxId?: string | null,
  config: NetworkConfig = GENLAYER_CONFIG
): Promise<ConsensusStatus> {
  const glTxId = cachedGlTxId || (await getGenLayerTxId(l1TxHash, config));

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

  const client = createReadClient(config);
  try {
    const tx = await client.getTransaction({
      hash: glTxId as unknown as Parameters<typeof client.getTransaction>[0]["hash"],
    });

    const statusName = (tx as any).statusName as string;
    const resultName = (tx as any).resultName as string;
    const committed = Number((tx as any).lastRound?.votesCommitted ?? 0);
    const revealed = Number((tx as any).lastRound?.votesRevealed ?? 0);
    const validatorVotes: string[] = (tx as any).lastRound?.validatorVotesName ?? [];
    const allDisagree = validatorVotes.length > 0 && validatorVotes.every((v: string) => v === "DISAGREE");

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
      accepted: allDisagree
        ? "Consensus reached, but contract execution failed. Check preconditions."
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

// --- GenLayer txId extraction ---

async function getGenLayerTxId(
  l1TxHash: string,
  config: NetworkConfig = GENLAYER_CONFIG
): Promise<string | null> {
  // On StudioNet, L1 tx hash IS the GenLayer txId
  if (config.isStudio) return l1TxHash;

  // Bradbury: extract from NewTransaction event logs
  const consensusAddr = config.consensusContract.toLowerCase();
  for (let i = 0; i < 30; i++) {
    try {
      const resp = await fetch(config.rpcUrl, {
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

export async function waitForTransaction(
  txHash: string,
  maxRetries = 200,
  interval = 5000,
  onStatus?: (status: ConsensusStatus) => void,
  config: NetworkConfig = GENLAYER_CONFIG
): Promise<{ status: string }> {
  onStatus?.({
    stage: "l1_pending", votesCommitted: 0, votesRevealed: 0,
    totalValidators: 5, result: "IDLE", glTxId: null,
    recommendation: "Waiting for L1 confirmation...",
  });

  const glTxId = await getGenLayerTxId(txHash, config);
  if (!glTxId) {
    throw new Error("Could not find GenLayer transaction ID from L1 receipt");
  }

  for (let i = 0; i < maxRetries; i++) {
    const cs = await getConsensusStatus(txHash, glTxId, config);
    onStatus?.(cs);

    if (cs.stage === "accepted" || cs.stage === "finalized") {
      return { status: cs.stage === "finalized" ? "FINALIZED" : "ACCEPTED" };
    }

    if (cs.stage === "leader_timeout" && i > 30) {
      throw new Error("Leader timed out. Please resubmit the transaction.");
    }

    if (cs.stage === "failed") {
      throw new Error("Transaction failed on chain. Please resubmit.");
    }

    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error("Transaction timed out");
}
