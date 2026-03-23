import { NextRequest, NextResponse } from "next/server";
import { checkApiKey, getWalletForRequest, isErrorResponse, validateMilestoneIndex } from "@/lib/server/auth";
import {
  readContract,
  serverDeployContract,
  serverWriteContractAt,
  serverGetDeployedAddress,
  serverWaitForConsensus,
  serverReadContractAt,
  consensusResultResponse,
} from "@/lib/server/genlayer-server";
import { addActiveTx, removeActiveTx } from "@/lib/server/txActivity";
import { INTERNET_COURT_CODE } from "@/lib/internetCourtCode";
import { GENLAYER_CONFIG } from "@/lib/config";
import type { Milestone } from "@/types/agreement";

export const dynamic = "force-dynamic";

/**
 * POST /api/agreements/:id/court
 *
 * Actions (via `action` field in body):
 * - deploy: Deploy IC contract for a disputed milestone
 * - accept: Accept the IC case (other party)
 * - initiate: Initiate dispute on IC
 * - submit_evidence: Submit evidence to IC
 * - resolve: Trigger AI jury resolution
 * - apply_verdict: Read IC verdict and apply to escrow
 * - status: Get current IC case status
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkApiKey(req);
  if (authError) return authError;

  const wallet = getWalletForRequest(req);
  if (isErrorResponse(wallet)) return wallet;

  const { id } = await params;
  const walletId = req.headers.get("x-wallet-id") || "unknown";

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action as string;
  if (!action) {
    return NextResponse.json({ error: "Missing action field" }, { status: 400 });
  }

  try {
    switch (action) {
      case "deploy": {
        const msIdx = validateMilestoneIndex(body.milestone_index);
        if (msIdx instanceof NextResponse) return msIdx;

        // Read agreement and milestone data
        const agreement = await readContract<Record<string, unknown>>("get_agreement", [id]);
        if (!agreement) {
          return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
        }

        const milestone = await readContract<Record<string, unknown>>("get_milestone", [id, msIdx]);
        if (!milestone) {
          return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
        }

        if (Number(milestone.status) !== 4) {
          return NextResponse.json({ error: "Milestone is not disputed" }, { status: 400 });
        }

        const clientAddr = String(agreement.client);
        const providerAddr = String(agreement.provider);

        // Determine other party
        const senderLower = wallet.address.toLowerCase();
        const otherParty = senderLower === clientAddr.toLowerCase() ? providerAddr : clientAddr;

        // Build IC constructor args
        const statement = `The provider met the SLA criteria: "${milestone.sla_criteria}" for milestone "${milestone.description}"`;
        const guidelines = [
          `Evaluate whether the provider fulfilled the SLA based on:`,
          `- SLA Criteria: ${milestone.sla_criteria}`,
          `- SLA Check Results: ${milestone.pass_count} PASS, ${milestone.fail_count} FAIL`,
          `- Last Check: ${milestone.last_check_result || "N/A"}`,
          `- Dispute Reason: ${milestone.dispute_reason || "N/A"}`,
          `Judge based on the automated SLA check history and submitted evidence.`,
        ].join("\n");
        const evidenceDefs = JSON.stringify({
          party_a: { types: ["text"], max_chars: 5000 },
          party_b: { types: ["text"], max_chars: 5000 },
        });

        // Deploy
        addActiveTx({
          agreementId: id,
          action: "deploy_court",
          txHash: "",
          wallet: walletId,
          startedAt: Date.now(),
        });

        const txHash = await serverDeployContract(wallet.privateKey, INTERNET_COURT_CODE, [
          otherParty,
          statement,
          guidelines,
          evidenceDefs,
          0,
        ]);

        // Update activity with real txHash
        addActiveTx({
          agreementId: id,
          action: "deploy_court",
          txHash,
          wallet: walletId,
          startedAt: Date.now(),
        });

        const result = await serverWaitForConsensus(txHash);

        // Get deployed address
        const courtAddress = await serverGetDeployedAddress(txHash);
        removeActiveTx(id, "deploy_court");

        if (!courtAddress) {
          return NextResponse.json({
            ...result,
            error: "Deployed but could not detect contract address",
          }, { status: 500 });
        }

        return NextResponse.json({
          ...result,
          courtAddress,
          milestone_index: msIdx,
        });
      }

      case "accept": {
        const courtAddress = body.court_address as string;
        if (!courtAddress) {
          return NextResponse.json({ error: "Missing court_address" }, { status: 400 });
        }

        const txHash = await serverWriteContractAt(wallet.privateKey, courtAddress, "accept_contract", []);
        addActiveTx({ agreementId: id, action: "accept_court", txHash, wallet: walletId, startedAt: Date.now() });
        const result = await serverWaitForConsensus(txHash);
        removeActiveTx(id, "accept_court");
        return consensusResultResponse(result);
      }

      case "initiate": {
        const courtAddress = body.court_address as string;
        if (!courtAddress) {
          return NextResponse.json({ error: "Missing court_address" }, { status: 400 });
        }

        const txHash = await serverWriteContractAt(wallet.privateKey, courtAddress, "initiate_dispute", []);
        addActiveTx({ agreementId: id, action: "initiate_dispute", txHash, wallet: walletId, startedAt: Date.now() });
        const result = await serverWaitForConsensus(txHash);
        removeActiveTx(id, "initiate_dispute");
        return consensusResultResponse(result);
      }

      case "submit_evidence": {
        const courtAddress = body.court_address as string;
        const evidence = body.evidence as string;
        if (!courtAddress) {
          return NextResponse.json({ error: "Missing court_address" }, { status: 400 });
        }
        if (!evidence) {
          return NextResponse.json({ error: "Missing evidence" }, { status: 400 });
        }

        const txHash = await serverWriteContractAt(wallet.privateKey, courtAddress, "submit_evidence", [evidence]);
        addActiveTx({ agreementId: id, action: "submit_ic_evidence", txHash, wallet: walletId, startedAt: Date.now() });
        const result = await serverWaitForConsensus(txHash);
        removeActiveTx(id, "submit_ic_evidence");
        return consensusResultResponse(result);
      }

      case "resolve": {
        const courtAddress = body.court_address as string;
        if (!courtAddress) {
          return NextResponse.json({ error: "Missing court_address" }, { status: 400 });
        }

        const txHash = await serverWriteContractAt(wallet.privateKey, courtAddress, "resolve", []);
        addActiveTx({ agreementId: id, action: "resolve_court", txHash, wallet: walletId, startedAt: Date.now() });
        const result = await serverWaitForConsensus(txHash);
        removeActiveTx(id, "resolve_court");
        return consensusResultResponse(result);
      }

      case "apply_verdict": {
        const courtAddress = body.court_address as string;
        const msIdx = validateMilestoneIndex(body.milestone_index);
        if (msIdx instanceof NextResponse) return msIdx;
        if (!courtAddress) {
          return NextResponse.json({ error: "Missing court_address" }, { status: 400 });
        }

        // Read IC verdict
        const statusStr = await serverReadContractAt<string>(courtAddress, "get_status", []);
        const icStatus = JSON.parse(statusStr);

        if (icStatus.status !== "resolved") {
          return NextResponse.json({ error: `IC case not resolved yet (status: ${icStatus.status})` }, { status: 400 });
        }

        // Apply verdict to escrow
        const txHash = await serverWriteContractAt(wallet.privateKey, GENLAYER_CONFIG.contractAddress, "resolve_dispute", [
          id,
          msIdx,
          icStatus.verdict,
          courtAddress,
        ]);
        addActiveTx({ agreementId: id, action: "apply_verdict", txHash, wallet: walletId, startedAt: Date.now() });
        const result = await serverWaitForConsensus(txHash);
        removeActiveTx(id, "apply_verdict");

        return NextResponse.json({
          ...result,
          verdict: icStatus.verdict,
          reasoning: icStatus.reasoning,
        });
      }

      case "status": {
        const courtAddress = body.court_address as string;
        if (!courtAddress) {
          return NextResponse.json({ error: "Missing court_address" }, { status: 400 });
        }

        const [statusStr, evidenceStr] = await Promise.all([
          serverReadContractAt<string>(courtAddress, "get_status", []),
          serverReadContractAt<string>(courtAddress, "get_evidence", []),
        ]);

        return NextResponse.json({
          case: JSON.parse(statusStr),
          evidence: JSON.parse(evidenceStr),
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Valid: deploy, accept, initiate, submit_evidence, resolve, apply_verdict, status` },
          { status: 400 }
        );
    }
  } catch (e) {
    // Clean up any activity tracking
    removeActiveTx(id, "deploy_court");
    removeActiveTx(id, "accept_court");
    removeActiveTx(id, "initiate_dispute");
    removeActiveTx(id, "submit_ic_evidence");
    removeActiveTx(id, "resolve_court");
    removeActiveTx(id, "apply_verdict");

    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
