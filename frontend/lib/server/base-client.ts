/**
 * Base Sepolia client for reading cross-chain verdict data.
 * Uses viem (already installed) for Base Sepolia reads.
 */

import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import { BASE_CONFIG } from "../config";

const VERDICT_REGISTRY_ABI = parseAbi([
  "function getVerdict(string agreementId, uint256 milestoneIndex) view returns (tuple(string agreementId, uint256 milestoneIndex, string verdict, bytes32 reasoningHash, uint256 timestamp, bool exists))",
  "function hasVerdict(string agreementId, uint256 milestoneIndex) view returns (bool)",
  "function getVerdictCount() view returns (uint256)",
  "function getAgreementCount() view returns (uint256)",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any;

function getClient() {
  if (!_client) {
    _client = createPublicClient({
      chain: baseSepolia,
      transport: http(BASE_CONFIG.rpcUrl),
    });
  }
  return _client;
}

export interface CrossChainVerdict {
  agreementId: string;
  milestoneIndex: number;
  verdict: string;
  reasoningHash: string;
  timestamp: number;
  exists: boolean;
}

/**
 * Check if a verdict has been bridged to Base Sepolia
 */
export async function hasVerdictOnBase(
  agreementId: string,
  milestoneIndex: number
): Promise<boolean> {
  if (!BASE_CONFIG.registryAddress) return false;
  try {
    const result = await getClient().readContract({
      address: BASE_CONFIG.registryAddress,
      abi: VERDICT_REGISTRY_ABI,
      functionName: "hasVerdict",
      args: [agreementId, BigInt(milestoneIndex)],
    });
    return result as boolean;
  } catch (e) {
    console.error("Base hasVerdict error:", e);
    return false;
  }
}

/**
 * Get verdict data from Base Sepolia VerdictRegistry
 */
export async function getVerdictFromBase(
  agreementId: string,
  milestoneIndex: number
): Promise<CrossChainVerdict | null> {
  if (!BASE_CONFIG.registryAddress) return null;
  try {
    const result = await getClient().readContract({
      address: BASE_CONFIG.registryAddress,
      abi: VERDICT_REGISTRY_ABI,
      functionName: "getVerdict",
      args: [agreementId, BigInt(milestoneIndex)],
    }) as any;

    if (!result.exists) return null;

    return {
      agreementId: result.agreementId,
      milestoneIndex: Number(result.milestoneIndex),
      verdict: result.verdict,
      reasoningHash: result.reasoningHash,
      timestamp: Number(result.timestamp),
      exists: true,
    };
  } catch (e) {
    console.error("Base getVerdict error:", e);
    return null;
  }
}

/**
 * Get cross-chain stats from Base Sepolia
 */
export async function getCrossChainStats(): Promise<{
  verdictCount: number;
  agreementCount: number;
} | null> {
  if (!BASE_CONFIG.registryAddress) return null;
  try {
    const [verdictCount, agreementCount] = await Promise.all([
      getClient().readContract({
        address: BASE_CONFIG.registryAddress,
        abi: VERDICT_REGISTRY_ABI,
        functionName: "getVerdictCount",
        args: [],
      }),
      getClient().readContract({
        address: BASE_CONFIG.registryAddress,
        abi: VERDICT_REGISTRY_ABI,
        functionName: "getAgreementCount",
        args: [],
      }),
    ]);
    return {
      verdictCount: Number(verdictCount),
      agreementCount: Number(agreementCount),
    };
  } catch (e) {
    console.error("Base stats error:", e);
    return null;
  }
}
