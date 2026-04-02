import { NextRequest, NextResponse } from "next/server";
import { checkApiKey, getWalletForRequest, isErrorResponse, validateNoPipes } from "@/lib/server/auth";
import {
  readContract,
  serverWriteContract,
  serverWriteAndWait,
  consensusResultResponse,
  resolveNetwork,
} from "@/lib/server/genlayer-server";
import type { Agreement } from "@/types/agreement";

export async function GET(req: NextRequest) {
  const authError = checkApiKey(req);
  if (authError) return authError;

  const network = resolveNetwork(req);
  const address = req.nextUrl.searchParams.get("address");

  try {
    if (address) {
      const ids = await readContract<string[]>("get_agreements_by_address", [address], network);
      const agreements: Agreement[] = [];
      for (const id of ids) {
        const agreement = await readContract<Agreement>("get_agreement", [id], network);
        agreements.push(agreement);
      }
      return NextResponse.json({ agreements });
    }

    const ids = await readContract<string[]>("get_all_agreement_ids", undefined, network);
    const agreements: Agreement[] = [];
    for (const id of ids) {
      const agreement = await readContract<Agreement>("get_agreement", [id], network);
      agreements.push(agreement);
    }
    return NextResponse.json({ agreements });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authError = checkApiKey(req);
  if (authError) return authError;

  const wallet = getWalletForRequest(req);
  if (isErrorResponse(wallet)) return wallet;
  const network = resolveNetwork(req);

  try {
    const body = await req.json();
    const { agreement_id, provider, description, milestones } = body;

    if (!agreement_id || !provider || !description || !milestones?.length) {
      return NextResponse.json(
        { error: "Missing required fields: agreement_id, provider, description, milestones" },
        { status: 400 }
      );
    }

    // Validate no pipe characters in milestone fields
    for (const m of milestones) {
      const pipeErr = validateNoPipes({
        description: m.description,
        monitoring_url: m.monitoring_url,
        sla_criteria: m.sla_criteria,
        amount: String(m.amount),
      });
      if (pipeErr) return pipeErr;
    }

    // Convert milestones array to pipe-separated strings
    const ms_descriptions = milestones.map((m: any) => m.description).join("|");
    const ms_urls = milestones.map((m: any) => m.monitoring_url).join("|");
    const ms_criteria = milestones.map((m: any) => m.sla_criteria).join("|");
    const ms_amounts = milestones.map((m: any) => String(m.amount)).join("|");

    const args = [
      agreement_id,
      provider,
      description,
      ms_descriptions,
      ms_urls,
      ms_criteria,
      ms_amounts,
    ];

    const wait = req.nextUrl.searchParams.get("wait") === "true";
    if (wait) {
      const result = await serverWriteAndWait(wallet.privateKey, "create_agreement", args, {
        agreementId: agreement_id,
        action: "create",
        wallet: req.headers.get("x-wallet-id") || "unknown",
      }, network);
      return consensusResultResponse(result);
    }

    const txHash = await serverWriteContract(wallet.privateKey, "create_agreement", args, network);
    return NextResponse.json({ txHash });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
