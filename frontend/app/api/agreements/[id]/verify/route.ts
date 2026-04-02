import { NextRequest, NextResponse } from "next/server";
import { checkApiKey, getWalletForRequest, isErrorResponse, validateMilestoneIndex } from "@/lib/server/auth";
import { serverWriteContract, serverWriteAndWait, consensusResultResponse, resolveNetwork } from "@/lib/server/genlayer-server";
import { logMarketplaceActivity } from "@/lib/server/marketplaceStore";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkApiKey(req);
  if (authError) return authError;

  const wallet = getWalletForRequest(req);
  if (isErrorResponse(wallet)) return wallet;

  const { id } = await params;
  const network = resolveNetwork(req);

  try {
    const body = await req.json();
    const msIdx = validateMilestoneIndex(body.milestone_index);
    if (msIdx instanceof NextResponse) return msIdx;

    const walletId = req.headers.get("x-wallet-id") || "unknown";
    const wait = req.nextUrl.searchParams.get("wait") === "true";
    if (wait) {
      const result = await serverWriteAndWait(wallet.privateKey, "verify_milestone", [id, msIdx], {
        agreementId: id,
        action: "verify",
        wallet: walletId,
      }, network);
      logMarketplaceActivity(id, "sla_check", `Milestone ${msIdx} verified on ${id}`, walletId, network);
      return consensusResultResponse(result);
    }

    const txHash = await serverWriteContract(wallet.privateKey, "verify_milestone", [id, msIdx], network);
    logMarketplaceActivity(id, "sla_check", `Milestone ${msIdx} verified on ${id}`, walletId, network);
    return NextResponse.json({ txHash });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
