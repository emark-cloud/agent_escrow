import { NextRequest, NextResponse } from "next/server";
import { checkApiKey, getWalletForRequest, isErrorResponse } from "@/lib/server/auth";
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
    const walletId = req.headers.get("x-wallet-id") || "unknown";
    const wait = req.nextUrl.searchParams.get("wait") === "true";
    if (wait) {
      const result = await serverWriteAndWait(wallet.privateKey, "accept_agreement", [id], {
        agreementId: id,
        action: "accept",
        wallet: walletId,
      });
      logMarketplaceActivity(id, "deal_started", `${walletId} accepted agreement ${id}`, walletId);
      return consensusResultResponse(result);
    }

    const txHash = await serverWriteContract(wallet.privateKey, "accept_agreement", [id]);
    logMarketplaceActivity(id, "deal_started", `${walletId} accepted agreement ${id}`, walletId);
    return NextResponse.json({ txHash });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
