import { NextRequest, NextResponse } from "next/server";
import { getActivity } from "@/lib/server/marketplaceStore";

// GET /api/marketplace/activity — recent marketplace events
export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") || "50");
  const events = getActivity(limit);
  return NextResponse.json({ events });
}
