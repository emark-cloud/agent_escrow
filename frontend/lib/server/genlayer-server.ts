import { createClient, abi } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
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
import { NextRequest, NextResponse } from "next/server";
import {
  GENLAYER_CONFIG,
  DEFAULT_NETWORK,
  type NetworkName,
  type NetworkConfig,
  getNetworkConfig,
} from "../config";

const { calldata, transactions } = abi;

// --- Network resolution from request ---

export function resolveNetwork(req: NextRequest): NetworkName {
  const header = req.headers.get("x-network");
  if (header === "studionet" || header === "bradbury") return header;
  const cookie = req.cookies.get("agentescrow_network")?.value;
  if (cookie === "studionet" || cookie === "bradbury") return cookie;
  return DEFAULT_NETWORK;
}

// --- Chain helpers ---

function getSdkChain(config: NetworkConfig) {
  return config.isStudio ? studionet : testnetBradbury;
}

function getViemChain(config: NetworkConfig) {
  return defineChain({
    id: config.chainId,
    name: config.chainName,
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
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

export function createReadClient(network: NetworkName = DEFAULT_NETWORK) {
  const config = getNetworkConfig(network);
  return createClient({ chain: getSdkChain(config) });
}

export async function readContract<T>(
  functionName: string,
  args: CalldataEncodable[] = [],
  network: NetworkName = DEFAULT_NETWORK
): Promise<T> {
  const config = getNetworkConfig(network);
  const client = createReadClient(network);
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

export async function serverReadContractAt<T>(
  contractAddress: string,
  functionName: string,
  args: CalldataEncodable[] = [],
  network: NetworkName = DEFAULT_NETWORK
): Promise<T> {
  const client = createReadClient(network);
  const raw = await client.readContract({
    address: contractAddress as Address,
    functionName,
    args,
  });
  return mapToObject(raw) as T;
}

// --- Write operations ---

export async function serverWriteContract(
  privateKey: Hex,
  functionName: string,
  args: CalldataEncodable[],
  network: NetworkName = DEFAULT_NETWORK
): Promise<string> {
  const config = getNetworkConfig(network);
  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: getViemChain(config),
    transport: http(config.rpcUrl),
  });

  const calldataObj = calldata.makeCalldataObject(functionName, args, undefined);
  const encodedCalldata = calldata.encode(calldataObj);
  const serializedData = transactions.serialize([
    encodedCalldata,
    false,
  ]) as Hex;

  const txData = encodeAddTx(config, account.address, config.contractAddress, serializedData);

  const txHash = await walletClient.sendTransaction({
    to: config.consensusContract,
    data: txData,
    gas: BigInt(config.gasWrite),
  });

  return txHash;
}

export async function serverDeployContract(
  privateKey: Hex,
  code: string,
  args: CalldataEncodable[],
  network: NetworkName = DEFAULT_NETWORK
): Promise<string> {
  const config = getNetworkConfig(network);
  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: getViemChain(config),
    transport: http(config.rpcUrl),
  });

  const calldataObj = calldata.makeCalldataObject(undefined, args, undefined);
  const encodedCalldata = calldata.encode(calldataObj);
  const serializedData = transactions.serialize([
    code,
    encodedCalldata,
    false,
  ]) as Hex;

  const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;
  const txData = encodeAddTx(config, account.address, zeroAddress, serializedData);

  const txHash = await walletClient.sendTransaction({
    to: config.consensusContract,
    data: txData,
    gas: BigInt(config.gasDeploy),
  });

  return txHash;
}

export async function serverWriteContractAt(
  privateKey: Hex,
  contractAddress: string,
  functionName: string,
  args: CalldataEncodable[],
  network: NetworkName = DEFAULT_NETWORK
): Promise<string> {
  const config = getNetworkConfig(network);
  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: getViemChain(config),
    transport: http(config.rpcUrl),
  });

  const calldataObj = calldata.makeCalldataObject(functionName, args, undefined);
  const encodedCalldata = calldata.encode(calldataObj);
  const serializedData = transactions.serialize([
    encodedCalldata,
    false,
  ]) as Hex;

  const txData = encodeAddTx(config, account.address, contractAddress as Address, serializedData);

  const txHash = await walletClient.sendTransaction({
    to: config.consensusContract,
    data: txData,
    gas: BigInt(config.gasWrite),
  });

  return txHash;
}

export async function serverGetDeployedAddress(
  l1TxHash: string,
  network: NetworkName = DEFAULT_NETWORK,
  maxRetries = 60,
  interval = 5000
): Promise<string | null> {
  const glTxId = await serverGetGenLayerTxId(l1TxHash, network);
  if (!glTxId) return null;

  const client = createReadClient(network);
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

// --- GenLayer txId extraction ---

export async function serverGetGenLayerTxId(
  l1TxHash: string,
  network: NetworkName = DEFAULT_NETWORK
): Promise<string | null> {
  const config = getNetworkConfig(network);

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

// --- Consensus result ---

export interface ConsensusResult {
  txHash: string;
  glTxId: string | null;
  status: string;
  executionError?: string;
}

export async function serverWaitForConsensus(
  l1TxHash: string,
  network: NetworkName = DEFAULT_NETWORK,
  maxRetries = 200,
  interval = 5000
): Promise<ConsensusResult> {
  const glTxId = await serverGetGenLayerTxId(l1TxHash, network);
  if (!glTxId) {
    throw new Error("Could not find GenLayer transaction ID from L1 receipt");
  }

  const client = createReadClient(network);

  for (let i = 0; i < maxRetries; i++) {
    try {
      const tx = await client.getTransaction({
        hash: glTxId as unknown as Parameters<typeof client.getTransaction>[0]["hash"],
      });

      const statusName = (tx as any).statusName as string;

      if (statusName === "ACCEPTED" || statusName === "FINALIZED") {
        const lastRound = (tx as any).lastRound;
        const votes: string[] = lastRound?.validatorVotesName ?? [];
        const allDisagree = votes.length > 0 && votes.every((v: string) => v === "DISAGREE");

        if (allDisagree) {
          return {
            txHash: l1TxHash,
            glTxId,
            status: statusName,
            executionError: "Contract execution failed — all validators rejected the transaction. Check preconditions (agreement status, milestone state, permissions).",
          };
        }

        return { txHash: l1TxHash, glTxId, status: statusName };
      }

      if (statusName === "UNDETERMINED" || statusName === "DISMISSED" || statusName === "CANCELED") {
        throw new Error(`Transaction failed: ${statusName}`);
      }

      if (statusName === "LEADER_TIMEOUT" && i > 30) {
        const err = new Error("Leader timed out. Please resubmit.");
        (err as any).retryable = true;
        throw err;
      }
    } catch (e) {
      if (e instanceof Error) {
        const msg = e.message;
        const isConsensusFail = msg.startsWith("Transaction failed:") || msg === "Leader timed out. Please resubmit.";
        if (isConsensusFail) throw e;
      }
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  const err = new Error("Transaction timed out");
  (err as any).retryable = true;
  throw err;
}

// --- Response helper ---

export function consensusResultResponse(result: ConsensusResult): NextResponse {
  if (result.executionError) {
    return NextResponse.json(result, { status: 422 });
  }
  return NextResponse.json(result);
}

// --- Retryable write+wait ---

function isRetryableError(e: unknown): boolean {
  if (e instanceof Error) {
    if ((e as any).retryable) return true;
    const msg = e.message.toLowerCase();
    if (msg.includes("fetch failed") || msg.includes("econnrefused") || msg.includes("econnreset") ||
        msg.includes("timed out") || msg.includes("took too long")) return true;
  }
  return false;
}

export async function serverWriteAndWait(
  privateKey: Hex,
  functionName: string,
  args: CalldataEncodable[],
  trackingOpts?: TrackedWaitOptions,
  network: NetworkName = DEFAULT_NETWORK,
  maxAttempts = 3,
): Promise<ConsensusResult> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const txHash = await serverWriteContract(privateKey, functionName, args, network);
      if (trackingOpts) {
        return await serverWaitForConsensusTracked(txHash, trackingOpts, network);
      }
      return await serverWaitForConsensus(txHash, network);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxAttempts && isRetryableError(e)) {
        console.log(`[retry] Attempt ${attempt}/${maxAttempts} failed (${lastError.message}), resubmitting...`);
        continue;
      }
      throw lastError;
    }
  }
  throw lastError;
}

// --- Activity-tracked consensus ---
import { addActiveTx, removeActiveTx } from "./txActivity";

export interface TrackedWaitOptions {
  agreementId: string;
  action: string;
  wallet: string;
}

export async function serverWaitForConsensusTracked(
  l1TxHash: string,
  opts: TrackedWaitOptions,
  network: NetworkName = DEFAULT_NETWORK
): Promise<ConsensusResult> {
  addActiveTx({
    agreementId: opts.agreementId,
    action: opts.action,
    txHash: l1TxHash,
    wallet: opts.wallet,
    startedAt: Date.now(),
  });

  try {
    const result = await serverWaitForConsensus(l1TxHash, network);
    return result;
  } finally {
    removeActiveTx(opts.agreementId, opts.action);
  }
}
