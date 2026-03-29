import { NextRequest, NextResponse } from "next/server";
import { getVerdictFromBase, getCrossChainStats } from "@/lib/server/base-client";
import { BASE_CONFIG, BRIDGE_CONFIG } from "@/lib/config";

/**
 * GET /api/cross-chain/:agreementId — Get cross-chain verdict status
 *
 * Returns verdict data from both GenLayer and Base Sepolia,
 * proving the verdict was bridged trustlessly via LayerZero V2.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agreementId } = await params;
  const milestoneIndex = parseInt(
    req.nextUrl.searchParams.get("milestone") || "0",
    10
  );

  if (!BRIDGE_CONFIG.enabled) {
    return NextResponse.json({
      enabled: false,
      message: "Cross-chain bridge not configured",
    });
  }

  // Check Base Sepolia for bridged verdict
  const baseVerdict = await getVerdictFromBase(agreementId, milestoneIndex);
  const stats = await getCrossChainStats();

  return NextResponse.json({
    enabled: true,
    agreementId,
    milestoneIndex,
    base: {
      chainId: BASE_CONFIG.chainId,
      registryAddress: BASE_CONFIG.registryAddress,
      explorerUrl: BASE_CONFIG.explorerUrl,
      verdict: baseVerdict,
      bridged: !!baseVerdict,
    },
    bridge: {
      genlayerBridgeSender: BRIDGE_CONFIG.genlayerBridgeSender,
      path: "GenLayer → Relay → zkSync Hub → LayerZero V2 → Base Sepolia",
    },
    stats,
  });
}
