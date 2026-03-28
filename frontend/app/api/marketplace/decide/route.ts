import { NextRequest, NextResponse } from "next/server";
import { checkApiKey } from "@/lib/server/auth";
import { ensureSeeded } from "@/lib/server/agentProfiles";
import { decide } from "@/lib/server/decisionEngine";

// POST /api/marketplace/decide — get next action for an agent
export async function POST(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  ensureSeeded();

  const body = await req.json();
  const { agent } = body;

  if (!agent) {
    return NextResponse.json({ error: "Missing required field: agent" }, { status: 400 });
  }

  const decision = decide(agent);
  return NextResponse.json(decision);
}
