import { NextRequest, NextResponse } from "next/server";
import { checkApiKey, getWalletForRequest, isErrorResponse } from "@/lib/server/auth";
import {
  getAllListings,
  createListing,
  getMarketplaceStats,
  addActivity,
} from "@/lib/server/marketplaceStore";
import { getProfile, seedProfiles } from "@/lib/server/agentProfiles";

let seeded = false;
function ensureSeeded() {
  if (!seeded) { seedProfiles(); seeded = true; }
}

// GET /api/marketplace — list all listings (optional ?status=available)
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const listings = getAllListings(status);
  const stats = getMarketplaceStats();
  return NextResponse.json({ listings, stats });
}

// POST /api/marketplace — create a new listing
export async function POST(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  const wallet = getWalletForRequest(req);
  if (isErrorResponse(wallet)) return wallet;

  const body = await req.json();
  const { agent, category, title, description, monitoring_url, sla_criteria, price } = body;

  if (!agent || !title || !monitoring_url || !sla_criteria || !price) {
    return NextResponse.json(
      { error: "Missing required fields: agent, title, monitoring_url, sla_criteria, price" },
      { status: 400 }
    );
  }

  ensureSeeded();
  const profile = getProfile(agent);
  if (!profile) {
    return NextResponse.json({ error: `Unknown agent: ${agent}` }, { status: 400 });
  }

  if (profile.role === "client") {
    return NextResponse.json(
      { error: `Agent ${agent} is a client and cannot create listings` },
      { status: 400 }
    );
  }

  const listing = createListing({
    provider_agent: agent,
    provider_address: wallet.address,
    category: category || "api-health",
    title,
    description: description || "",
    monitoring_url,
    sla_criteria,
    price: String(price),
  });

  addActivity({
    agent,
    type: "listing_created",
    details: `Listed "${title}" for ${price} GEN`,
  });

  return NextResponse.json({ listing }, { status: 201 });
}
