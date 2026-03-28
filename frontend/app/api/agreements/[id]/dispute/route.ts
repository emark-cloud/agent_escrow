import { NextRequest, NextResponse } from "next/server";
import { checkApiKey, getWalletForRequest, isErrorResponse, validateMilestoneIndex } from "@/lib/server/auth";
import { serverWriteContract, serverWriteAndWait, consensusResultResponse } from "@/lib/server/genlayer-server";
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

  try {
    const body = await req.json();
    const msIdx = validateMilestoneIndex(body.milestone_index);
    if (msIdx instanceof NextResponse) return msIdx;
    const { reason } = body;

    if (!reason) {
      return NextResponse.json({ error: "Missing reason" }, { status: 400 });
    }

    const walletId = req.headers.get("x-wallet-id") || "unknown";
    const wait = req.nextUrl.searchParams.get("wait") === "true";
    if (wait) {
      const result = await serverWriteAndWait(wallet.privateKey, "dispute_milestone", [id, msIdx, reason], {
        agreementId: id,
        action: "dispute",
        wallet: walletId,
      });
      logMarketplaceActivity(id, "dispute_filed", `Dispute filed on ${id} milestone ${msIdx}`, walletId);
      return consensusResultResponse(result);
    }

    const txHash = await serverWriteContract(wallet.privateKey, "dispute_milestone", [id, msIdx, reason]);
    logMarketplaceActivity(id, "dispute_filed", `Dispute filed on ${id} milestone ${msIdx}`, walletId);
    return NextResponse.json({ txHash });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
