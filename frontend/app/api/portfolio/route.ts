import { NextRequest, NextResponse } from "next/server";
import { checkApiKey } from "@/lib/server/auth";
import { readContract } from "@/lib/server/genlayer-server";
import { getCourtAddress } from "@/lib/server/courtStore";
import type { Agreement, Milestone } from "@/types/agreement";
import { AGREEMENT_STATUS, MILESTONE_STATUS } from "@/lib/config";

interface ActionItem {
  agreement_id: string;
  milestone_index: number;
  action: string;
  description: string;
  court_address?: string;
}

export async function GET(req: NextRequest) {
  const authError = checkApiKey(req);
  if (authError) return authError;

  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json(
      { error: "Missing required query param: address" },
      { status: 400 }
    );
  }

  try {
    const ids = await readContract<string[]>("get_agreements_by_address", [address]);

    const agreements: Array<{
      agreement: Agreement & { statusName: string };
      milestones: Array<Milestone & { index: number; statusName: string }>;
    }> = [];
    const actions: ActionItem[] = [];
    const addressLower = address.toLowerCase();

    for (const id of ids) {
      const agreement = await readContract<Agreement>("get_agreement", [id]);
      const milestones: Array<Milestone & { index: number; statusName: string }> = [];

      const isClient = agreement.client.toLowerCase() === addressLower;
      const isProvider = agreement.provider.toLowerCase() === addressLower;

      // Created → provider can accept (once per agreement, not per milestone)
      if (agreement.status === 0 && isProvider) {
        actions.push({
          agreement_id: id,
          milestone_index: -1,
          action: "accept_agreement",
          description: `Accept agreement "${agreement.description}"`,
        });
      }

      for (let i = 0; i < agreement.milestone_count; i++) {
        const ms = await readContract<Milestone>("get_milestone", [id, i]);
        milestones.push({
          ...ms,
          index: i,
          statusName: MILESTONE_STATUS[ms.status] ?? "Unknown",
        });

        // Pending in Active agreement → kick off first SLA check
        if (ms.status === 0 && agreement.status === 1) {
          actions.push({
            agreement_id: id,
            milestone_index: i,
            action: "check_sla",
            description: `Start SLA monitoring on milestone ${i}: "${ms.description}"`,
          });
        }

        // Monitoring → run SLA check
        if (ms.status === 1) {
          actions.push({
            agreement_id: id,
            milestone_index: i,
            action: "check_sla",
            description: `Run SLA check on milestone ${i}: "${ms.description}"`,
          });

          // If there are passing checks, client can verify
          if (ms.pass_count > 0 && isClient) {
            actions.push({
              agreement_id: id,
              milestone_index: i,
              action: "verify_milestone",
              description: `Verify milestone ${i} (${ms.pass_count} passes): "${ms.description}"`,
            });
          }
        }

        // Verified → client can release payment
        if (ms.status === 2 && isClient) {
          actions.push({
            agreement_id: id,
            milestone_index: i,
            action: "release_payment",
            description: `Release payment for milestone ${i}: "${ms.description}"`,
          });
        }

        // Disputed → submit evidence if not already submitted
        if (ms.status === 4) {
          const hasEvidence = isClient
            ? ms.evidence_client
            : ms.evidence_provider;
          if (!hasEvidence) {
            const courtAddr = getCourtAddress(id, i);
            actions.push({
              agreement_id: id,
              milestone_index: i,
              action: "submit_evidence",
              description: `Submit evidence for disputed milestone ${i}: "${ms.description}"`,
              ...(courtAddr ? { court_address: courtAddr } : {}),
            });
          }
        }

        // Failed → client can request refund
        if (ms.status === 5 && isClient) {
          actions.push({
            agreement_id: id,
            milestone_index: i,
            action: "refund_milestone",
            description: `Refund failed milestone ${i}: "${ms.description}"`,
          });
        }
      }

      agreements.push({
        agreement: {
          ...agreement,
          statusName: AGREEMENT_STATUS[agreement.status] ?? "Unknown",
        },
        milestones,
      });
    }

    return NextResponse.json({
      address,
      total_agreements: agreements.length,
      total_actions: actions.length,
      agreements,
      actions,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
