import { NextRequest, NextResponse } from "next/server";
import { checkApiKey, getWalletForRequest, isErrorResponse, validateNoPipes } from "@/lib/server/auth";
import { getListingById, claimListing, addActivity } from "@/lib/server/marketplaceStore";
import { getProfile, seedProfiles } from "@/lib/server/agentProfiles";

let seeded = false;
import {
  serverWriteAndWait,
  consensusResultResponse,
} from "@/lib/server/genlayer-server";
import { randomBytes } from "crypto";

// POST /api/marketplace/[id]/claim — claim a listing and create on-chain agreement
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  const wallet = getWalletForRequest(req);
  if (isErrorResponse(wallet)) return wallet;

  const { id } = await params;
  const body = await req.json();
  const { agent } = body;

  if (!agent) {
    return NextResponse.json({ error: "Missing required field: agent" }, { status: 400 });
  }

  if (!seeded) { seedProfiles(); seeded = true; }
  const profile = getProfile(agent);
  if (!profile) {
    return NextResponse.json({ error: `Unknown agent: ${agent}` }, { status: 400 });
  }

  if (profile.role === "provider") {
    return NextResponse.json(
      { error: `Agent ${agent} is a provider and cannot claim listings` },
      { status: 400 }
    );
  }

  const listing = getListingById(id);
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  if (listing.status !== "available") {
    return NextResponse.json({ error: "Listing is no longer available" }, { status: 409 });
  }
  if (listing.provider_agent.toLowerCase() === agent.toLowerCase()) {
    return NextResponse.json({ error: "Cannot claim your own listing" }, { status: 400 });
  }

  // Generate agreement ID
  const agreementId = `mkt-${randomBytes(3).toString("hex")}`;

  // Validate no pipe chars
  const pipeErr = validateNoPipes({
    description: listing.description,
    monitoring_url: listing.monitoring_url,
    sla_criteria: listing.sla_criteria,
  });
  if (pipeErr) return pipeErr;

  try {
    // Create on-chain agreement (client = claiming agent, provider = listing creator)
    const args = [
      agreementId,
      listing.provider_address,
      listing.description,
      listing.title,            // ms_descriptions (single milestone)
      listing.monitoring_url,   // ms_urls
      listing.sla_criteria,     // ms_criteria
      listing.price,            // ms_amounts
    ];

    const result = await serverWriteAndWait(wallet.privateKey, "create_agreement", args, {
      agreementId,
      action: "create",
      wallet: agent,
    });

    // Update marketplace listing
    claimListing(id, agent, wallet.address, agreementId);

    addActivity({
      agent,
      type: "listing_claimed",
      details: `Claimed "${listing.title}" from ${listing.provider_agent} → agreement ${agreementId}`,
    });

    addActivity({
      agent,
      type: "deal_started",
      details: `Deal ${agreementId}: ${agent} ↔ ${listing.provider_agent} (${listing.price} GEN)`,
    });

    return NextResponse.json({
      listing_id: id,
      agreement_id: agreementId,
      consensus: result,
    }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
