import { NextRequest, NextResponse } from "next/server";
import { checkApiKey, getWalletForRequest, isErrorResponse, validateMilestoneIndex } from "@/lib/server/auth";
import { serverWriteContract, serverWriteAndWait, consensusResultResponse } from "@/lib/server/genlayer-server";

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
    const { evidence } = body;

    if (!evidence) {
      return NextResponse.json({ error: "Missing evidence" }, { status: 400 });
    }

    const wait = req.nextUrl.searchParams.get("wait") === "true";
    if (wait) {
      const result = await serverWriteAndWait(wallet.privateKey, "submit_evidence", [id, msIdx, evidence], {
        agreementId: id,
        action: "submit_evidence",
        wallet: req.headers.get("x-wallet-id") || "unknown",
      });
      return consensusResultResponse(result);
    }

    const txHash = await serverWriteContract(wallet.privateKey, "submit_evidence", [id, msIdx, evidence]);
    return NextResponse.json({ txHash });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
