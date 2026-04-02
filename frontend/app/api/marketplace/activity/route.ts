import { NextRequest, NextResponse } from "next/server";
import { getActivity } from "@/lib/server/marketplaceStore";
import { resolveNetwork } from "@/lib/server/genlayer-server";

// GET /api/marketplace/activity — recent marketplace events
export async function GET(req: NextRequest) {
  const network = resolveNetwork(req);
  const limit = Number(req.nextUrl.searchParams.get("limit") || "50");
  const events = getActivity(limit, network);
  return NextResponse.json({ events });
}
