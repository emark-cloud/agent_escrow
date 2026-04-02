import { NextRequest, NextResponse } from "next/server";
import { checkApiKey } from "@/lib/server/auth";
import { readContract, serverReadContractAt, resolveNetwork } from "@/lib/server/genlayer-server";
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

  const network = resolveNetwork(req);

  try {
    const ids = await readContract<string[]>("get_agreements_by_address", [address], network);

    const agreements: Array<{
      agreement: Agreement & { statusName: string };
      milestones: Array<Milestone & { index: number; statusName: string }>;
    }> = [];
    const actions: ActionItem[] = [];
    const addressLower = address.toLowerCase();

    for (const id of ids) {
      const agreement = await readContract<Agreement>("get_agreement", [id], network);
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
        const ms = await readContract<Milestone>("get_milestone", [id, i], network);
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

          // If there are enough failures and no passes, client can dispute
          if (ms.fail_count >= 2 && ms.pass_count === 0 && isClient) {
            actions.push({
              agreement_id: id,
              milestone_index: i,
              action: "dispute_milestone",
              description: `Dispute milestone ${i} (${ms.fail_count} failures, 0 passes): "${ms.description}"`,
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

        // Disputed → drive the Internet Court flow
        if (ms.status === 4) {
          const courtAddr = getCourtAddress(id, i);

          if (!courtAddr) {
            // Step 1: No court deployed yet → deployer (client) deploys
            if (isClient) {
              actions.push({
                agreement_id: id,
                milestone_index: i,
                action: "deploy_court",
                description: `Deploy Internet Court for disputed milestone ${i}: "${ms.description}"`,
              });
            }
          } else {
            // Court exists — read its status to determine next step
            let icStatus: { status: string; verdict?: string } | null = null;
            try {
              const statusStr = await serverReadContractAt<string>(courtAddr, "get_status", [], network);
              icStatus = JSON.parse(statusStr);
            } catch {
              // Court read failed — skip court actions this cycle
            }

            if (icStatus) {
              if (icStatus.status === "created") {
                // Step 2: Other party accepts the court case
                if (isProvider) {
                  actions.push({
                    agreement_id: id,
                    milestone_index: i,
                    action: "accept_court",
                    description: `Accept Internet Court case for milestone ${i}`,
                    court_address: courtAddr,
                  });
                }
              } else if (icStatus.status === "active") {
                // Step 3: Initiator starts the dispute
                if (isClient) {
                  actions.push({
                    agreement_id: id,
                    milestone_index: i,
                    action: "initiate_court",
                    description: `Initiate Internet Court dispute for milestone ${i}`,
                    court_address: courtAddr,
                  });
                }
              } else if (icStatus.status === "disputed") {
                // Step 4: Both parties submit evidence
                // Read evidence to see who has submitted
                let evidence: { party_a?: string; party_b?: string } | null = null;
                try {
                  const evidenceStr = await serverReadContractAt<string>(courtAddr, "get_evidence", [], network);
                  evidence = JSON.parse(evidenceStr);
                } catch {
                  // Evidence read failed — skip
                }

                const clientHasEvidence = evidence?.party_a && evidence.party_a.length > 0;
                const providerHasEvidence = evidence?.party_b && evidence.party_b.length > 0;

                if (isClient && !clientHasEvidence) {
                  actions.push({
                    agreement_id: id,
                    milestone_index: i,
                    action: "submit_evidence",
                    description: `Submit evidence for milestone ${i} (client)`,
                    court_address: courtAddr,
                  });
                }
                if (isProvider && !providerHasEvidence) {
                  actions.push({
                    agreement_id: id,
                    milestone_index: i,
                    action: "submit_evidence",
                    description: `Submit evidence for milestone ${i} (provider)`,
                    court_address: courtAddr,
                  });
                }

                // Step 5: If both submitted, either party can resolve
                if (clientHasEvidence && providerHasEvidence) {
                  actions.push({
                    agreement_id: id,
                    milestone_index: i,
                    action: "resolve_court",
                    description: `Trigger AI jury resolution for milestone ${i}`,
                    court_address: courtAddr,
                  });
                }
              } else if (icStatus.status === "resolving") {
                // AI jury is deliberating — no action needed, just wait
              } else if (icStatus.status === "resolved") {
                // Step 6: Apply verdict back to escrow
                if (isClient || isProvider) {
                  actions.push({
                    agreement_id: id,
                    milestone_index: i,
                    action: "apply_verdict",
                    description: `Apply IC verdict (${icStatus.verdict}) to milestone ${i}`,
                    court_address: courtAddr,
                  });
                }
              }
            }
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
