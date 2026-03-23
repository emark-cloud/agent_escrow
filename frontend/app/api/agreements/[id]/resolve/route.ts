import { NextRequest, NextResponse } from "next/server";
import { checkApiKey, getWalletForRequest, isErrorResponse, validateMilestoneIndex } from "@/lib/server/auth";
import { serverWriteContract, serverWaitForConsensusTracked, consensusResultResponse } from "@/lib/server/genlayer-server";

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
    const { verdict, court_address } = body;

    if (!verdict || !court_address) {
      return NextResponse.json(
        { error: "Missing verdict or court_address" },
        { status: 400 }
      );
    }

    if (!["PARTY_A", "PARTY_B", "UNDETERMINED"].includes(verdict)) {
      return NextResponse.json(
        { error: "verdict must be PARTY_A, PARTY_B, or UNDETERMINED" },
        { status: 400 }
      );
    }

    const txHash = await serverWriteContract(wallet.privateKey, "resolve_dispute", [
      id,
      msIdx,
      verdict,
      court_address,
    ]);

    const wait = req.nextUrl.searchParams.get("wait") === "true";
    if (wait) {
      const result = await serverWaitForConsensusTracked(txHash, {
        agreementId: id,
        action: "resolve",
        wallet: req.headers.get("x-wallet-id") || "unknown",
      });
      return consensusResultResponse(result);
    }

    return NextResponse.json({ txHash });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
