import { NextRequest, NextResponse } from "next/server";
import { checkApiKey, getWalletForRequest, isErrorResponse, validateMilestoneIndex } from "@/lib/server/auth";
import { serverWriteContract, serverWriteAndWait, consensusResultResponse } from "@/lib/server/genlayer-server";
import { getListingByAgreementId, updateListingStatus, addActivity } from "@/lib/server/marketplaceStore";

function markListingCompleted(agreementId: string) {
  const listing = getListingByAgreementId(agreementId);
  if (listing) {
    updateListingStatus(listing.id, "completed");
    addActivity({ agent: listing.claimed_by || "unknown", type: "deal_completed", details: `Deal ${agreementId} completed — payment released` });
  }
}

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

    const wait = req.nextUrl.searchParams.get("wait") === "true";
    if (wait) {
      const result = await serverWriteAndWait(wallet.privateKey, "release_payment", [id, msIdx], {
        agreementId: id,
        action: "release",
        wallet: req.headers.get("x-wallet-id") || "unknown",
      });
      markListingCompleted(id);
      return consensusResultResponse(result);
    }

    const txHash = await serverWriteContract(wallet.privateKey, "release_payment", [id, msIdx]);
    markListingCompleted(id);
    return NextResponse.json({ txHash });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
