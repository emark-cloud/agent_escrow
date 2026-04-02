import { NextRequest, NextResponse } from "next/server";
import { checkApiKey, getWalletForRequest, isErrorResponse } from "@/lib/server/auth";
import { serverWriteContract, serverWriteAndWait, consensusResultResponse, resolveNetwork } from "@/lib/server/genlayer-server";

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
    const wait = req.nextUrl.searchParams.get("wait") === "true";
    if (wait) {
      const result = await serverWriteAndWait(wallet.privateKey, "cancel_agreement", [id], {
        agreementId: id,
        action: "cancel",
        wallet: req.headers.get("x-wallet-id") || "unknown",
      }, network);
      return consensusResultResponse(result);
    }

    const txHash = await serverWriteContract(wallet.privateKey, "cancel_agreement", [id], network);
    return NextResponse.json({ txHash });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
