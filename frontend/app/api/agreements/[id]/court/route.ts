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
  resolveNetwork,
} from "@/lib/server/genlayer-server";
import { addActiveTx, removeActiveTx } from "@/lib/server/txActivity";
import { saveCourtDeployment, getCourtAddress } from "@/lib/server/courtStore";
import { INTERNET_COURT_CODE } from "@/lib/internetCourtCode";
import { getNetworkConfig, BRIDGE_CONFIG, BASE_CONFIG } from "@/lib/config";
import type { Milestone } from "@/types/agreement";
import { keccak256, toBytes } from "viem";

export const dynamic = "force-dynamic";

/**
 * GET /api/agreements/:id/court?milestone=N
 * Public read-only: returns court address + IC status for a milestone.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const network = resolveNetwork(req);
  const milestoneParam = req.nextUrl.searchParams.get("milestone");
  const msIdx = milestoneParam != null ? parseInt(milestoneParam, 10) : 0;
  if (isNaN(msIdx) || msIdx < 0) {
    return NextResponse.json({ error: "Invalid milestone index" }, { status: 400 });
  }

  const courtAddress = getCourtAddress(id, msIdx);
  if (!courtAddress) {
    return NextResponse.json({ courtAddress: null, case: null, evidence: null });
  }

  try {
    const [statusStr, evidenceStr] = await Promise.all([
      serverReadContractAt<string>(courtAddress, "get_status", [], network),
      serverReadContractAt<string>(courtAddress, "get_evidence", [], network),
    ]);
    return NextResponse.json({
      courtAddress,
      case: JSON.parse(statusStr),
      evidence: JSON.parse(evidenceStr),
    });
  } catch {
    // Court contract exists but can't be read (maybe not finalized yet)
    return NextResponse.json({ courtAddress, case: null, evidence: null });
  }
}

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
  const network = resolveNetwork(req);
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

  // Extract milestone_index once — optional for cases that accept court_address directly,
  // strictly validated in deploy/apply_verdict where it's required.
  const rawMsIdx = body.milestone_index != null ? validateMilestoneIndex(body.milestone_index) : 0;
  const msIdx = rawMsIdx instanceof NextResponse ? null : rawMsIdx;

  try {
    switch (action) {
      case "deploy": {
        if (msIdx == null) return rawMsIdx as NextResponse;

        // Read agreement and milestone data
        const agreement = await readContract<Record<string, unknown>>("get_agreement", [id], network);
        if (!agreement) {
          return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
        }

        const milestone = await readContract<Record<string, unknown>>("get_milestone", [id, msIdx], network);
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
        ], network);

        // Update activity with real txHash
        addActiveTx({
          agreementId: id,
          action: "deploy_court",
          txHash,
          wallet: walletId,
          startedAt: Date.now(),
        });

        const result = await serverWaitForConsensus(txHash, network);

        // Get deployed address
        const courtAddress = await serverGetDeployedAddress(txHash, network);
        removeActiveTx(id, "deploy_court");

        if (!courtAddress) {
          return NextResponse.json({
            ...result,
            error: "Deployed but could not detect contract address",
          }, { status: 500 });
        }

        // Persist court address so agents can discover it via portfolio
        saveCourtDeployment(id, msIdx, courtAddress, walletId);

        return NextResponse.json({
          ...result,
          courtAddress,
          milestone_index: msIdx,
        });
      }

      case "accept": {
        const courtAddress = (body.court_address as string) || (msIdx != null ? getCourtAddress(id, msIdx) : null);
        if (!courtAddress) {
          return NextResponse.json({ error: "Missing court_address (none deployed for this milestone)" }, { status: 400 });
        }

        const txHash = await serverWriteContractAt(wallet.privateKey, courtAddress, "accept_contract", [], network);
        addActiveTx({ agreementId: id, action: "accept_court", txHash, wallet: walletId, startedAt: Date.now() });
        const result = await serverWaitForConsensus(txHash, network);
        removeActiveTx(id, "accept_court");
        return consensusResultResponse(result);
      }

      case "initiate": {
        const courtAddress = (body.court_address as string) || (msIdx != null ? getCourtAddress(id, msIdx) : null);
        if (!courtAddress) {
          return NextResponse.json({ error: "Missing court_address (none deployed for this milestone)" }, { status: 400 });
        }

        const txHash = await serverWriteContractAt(wallet.privateKey, courtAddress, "initiate_dispute", [], network);
        addActiveTx({ agreementId: id, action: "initiate_dispute", txHash, wallet: walletId, startedAt: Date.now() });
        const result = await serverWaitForConsensus(txHash, network);
        removeActiveTx(id, "initiate_dispute");
        return consensusResultResponse(result);
      }

      case "submit_evidence": {
        const courtAddress = (body.court_address as string) || (msIdx != null ? getCourtAddress(id, msIdx) : null);
        const evidence = body.evidence as string;
        if (!courtAddress) {
          return NextResponse.json({ error: "Missing court_address (none deployed for this milestone)" }, { status: 400 });
        }
        if (!evidence) {
          return NextResponse.json({ error: "Missing evidence" }, { status: 400 });
        }

        const txHash = await serverWriteContractAt(wallet.privateKey, courtAddress, "submit_evidence", [evidence], network);
        addActiveTx({ agreementId: id, action: "submit_ic_evidence", txHash, wallet: walletId, startedAt: Date.now() });
        const result = await serverWaitForConsensus(txHash, network);
        removeActiveTx(id, "submit_ic_evidence");
        return consensusResultResponse(result);
      }

      case "resolve": {
        const courtAddress = (body.court_address as string) || (msIdx != null ? getCourtAddress(id, msIdx) : null);
        if (!courtAddress) {
          return NextResponse.json({ error: "Missing court_address (none deployed for this milestone)" }, { status: 400 });
        }

        const txHash = await serverWriteContractAt(wallet.privateKey, courtAddress, "resolve", [], network);
        addActiveTx({ agreementId: id, action: "resolve_court", txHash, wallet: walletId, startedAt: Date.now() });
        const result = await serverWaitForConsensus(txHash, network);
        removeActiveTx(id, "resolve_court");
        return consensusResultResponse(result);
      }

      case "apply_verdict": {
        if (msIdx == null) return rawMsIdx as NextResponse;
        const courtAddress = (body.court_address as string) || getCourtAddress(id, msIdx);
        if (!courtAddress) {
          return NextResponse.json({ error: "Missing court_address (none deployed for this milestone)" }, { status: 400 });
        }

        // Read IC verdict
        const statusStr = await serverReadContractAt<string>(courtAddress, "get_status", [], network);
        const icStatus = JSON.parse(statusStr);

        if (icStatus.status !== "resolved") {
          return NextResponse.json({ error: `IC case not resolved yet (status: ${icStatus.status})` }, { status: 400 });
        }

        // Apply verdict to escrow
        const networkConfig = getNetworkConfig(network);
        const txHash = await serverWriteContractAt(wallet.privateKey, networkConfig.contractAddress, "resolve_dispute", [
          id,
          msIdx,
          icStatus.verdict,
          courtAddress,
        ], network);
        addActiveTx({ agreementId: id, action: "apply_verdict", txHash, wallet: walletId, startedAt: Date.now() });
        const result = await serverWaitForConsensus(txHash, network);
        removeActiveTx(id, "apply_verdict");

        // Cross-chain: send verdict to BridgeSender.py for bridging to Base
        let bridgeTxHash: string | null = null;
        if (BRIDGE_CONFIG.enabled && BRIDGE_CONFIG.genlayerBridgeSender) {
          try {
            const reasoningHash = keccak256(toBytes(icStatus.reasoning || ""));
            // ABI encode: (string agreementId, uint256 milestoneIndex, string verdict, bytes32 reasoningHash)
            const encoder = new TextEncoder();
            const verdictData = encoder.encode(
              JSON.stringify({ agreementId: id, milestoneIndex: msIdx, verdict: icStatus.verdict, reasoningHash })
            );

            bridgeTxHash = await serverWriteContractAt(
              wallet.privateKey,
              BRIDGE_CONFIG.genlayerBridgeSender,
              "send_message",
              [BASE_CONFIG.chainId, BASE_CONFIG.registryAddress, verdictData],
              network
            );
            // Fire-and-forget: don't wait for consensus to avoid blocking the response
            console.log(`[Bridge] Verdict sent to BridgeSender: ${bridgeTxHash}`);
          } catch (bridgeErr) {
            console.error("[Bridge] Failed to send verdict to bridge (non-blocking):", bridgeErr);
          }
        }

        return NextResponse.json({
          ...result,
          verdict: icStatus.verdict,
          reasoning: icStatus.reasoning,
          bridge: bridgeTxHash ? {
            txHash: bridgeTxHash,
            status: "pending",
            path: "GenLayer → Relay → Base Sepolia VerdictRegistry",
          } : undefined,
        });
      }

      case "status": {
        const courtAddress = (body.court_address as string) || (msIdx != null ? getCourtAddress(id, msIdx) : null);
        if (!courtAddress) {
          return NextResponse.json({ error: "Missing court_address (none deployed for this milestone)" }, { status: 400 });
        }

        const [statusStr, evidenceStr] = await Promise.all([
          serverReadContractAt<string>(courtAddress, "get_status", [], network),
          serverReadContractAt<string>(courtAddress, "get_evidence", [], network),
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
