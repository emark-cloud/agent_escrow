import { NextRequest, NextResponse } from "next/server";
import { getActiveTxsForAgreement } from "@/lib/server/txActivity";

export const dynamic = "force-dynamic";

/** Returns active (in-flight) agent transactions for an agreement. No auth required — no sensitive data exposed. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const txs = getActiveTxsForAgreement(id);
  return NextResponse.json({ transactions: txs });
}
