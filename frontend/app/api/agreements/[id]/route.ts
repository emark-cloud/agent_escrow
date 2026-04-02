import { NextRequest, NextResponse } from "next/server";
import { checkApiKey } from "@/lib/server/auth";
import { readContract, resolveNetwork } from "@/lib/server/genlayer-server";
import type { Agreement, Milestone } from "@/types/agreement";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkApiKey(req);
  if (authError) return authError;

  const { id } = await params;
  const network = resolveNetwork(req);

  try {
    const agreement = await readContract<Agreement>("get_agreement", [id], network);

    const milestones: Milestone[] = [];
    for (let i = 0; i < agreement.milestone_count; i++) {
      const milestone = await readContract<Milestone>("get_milestone", [id, i], network);
      milestones.push(milestone);
    }

    return NextResponse.json({ agreement, milestones });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
