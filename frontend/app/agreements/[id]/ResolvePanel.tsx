"use client";
import { useState, useEffect, useCallback } from "react";
import {
  sendWriteTransaction,
  sendWriteTransactionTo,
  waitForTransaction,
  readContractAt,
  deployContract,
  getDeployedAddress,
} from "@/lib/genlayer";
import { useNetwork } from "@/hooks/useNetwork";
import { INTERNET_COURT_CODE } from "@/lib/internetCourtCode";
import { mapToUserFriendlyError } from "@/lib/errors";
import type { Milestone } from "@/types/agreement";

interface Props {
  agreementId: string;
  milestones: Milestone[];
  clientAddress: string;
  providerAddress: string;
  onSuccess?: () => void;
}

interface ICStatus {
  status: string;
  verdict: string;
  reasoning: string;
  statement: string;
  party_a: string;
  party_b: string;
}

interface ICEvidence {
  evidence_a: string;
  evidence_b: string;
}

export function ResolvePanel({
  agreementId,
  milestones,
  clientAddress,
  providerAddress,
  onSuccess,
}: Props) {
  const { config } = useNetwork();
  const storageKey = `ic-case-${agreementId}`;

  // Restore persisted state on mount
  const [step, setStep] = useState<
    "idle" | "deploying" | "case_active" | "applying"
  >(() => {
    if (typeof window === "undefined") return "idle";
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const { courtAddr } = JSON.parse(saved);
        if (courtAddr) return "case_active";
      } catch {}
    }
    return "idle";
  });
  const [courtAddress, setCourtAddress] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved).courtAddr || "";
    } catch {}
    return "";
  });
  const [icStatus, setIcStatus] = useState<ICStatus | null>(null);
  const [icEvidence, setIcEvidence] = useState<ICEvidence | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<number | null>(
    () => {
      if (typeof window === "undefined") return null;
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) return JSON.parse(saved).milestone ?? null;
      } catch {}
      return null;
    }
  );
  const [evidenceText, setEvidenceText] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [actionPending, setActionPending] = useState(false);

  // Persist IC case state
  const persistCase = (courtAddr: string, milestone: number | null) => {
    localStorage.setItem(storageKey, JSON.stringify({ courtAddr, milestone }));
  };

  const clearCase = () => {
    localStorage.removeItem(storageKey);
  };

  const disputedMilestones = milestones
    .map((ms, i) => ({ ms, i }))
    .filter(({ ms }) => ms.status === 4);

  // Auto-poll IC status when case is active
  const pollICStatus = useCallback(async () => {
    if (!courtAddress) return;
    try {
      const [statusStr, evidenceStr] = await Promise.all([
        readContractAt<string>(courtAddress, "get_status", [], config),
        readContractAt<string>(courtAddress, "get_evidence", [], config),
      ]);
      setIcStatus(JSON.parse(statusStr));
      setIcEvidence(JSON.parse(evidenceStr));
    } catch {
      // silently ignore poll errors
    }
  }, [courtAddress]);

  useEffect(() => {
    if (step !== "case_active" || !courtAddress) return;
    pollICStatus();
    const interval = setInterval(pollICStatus, 5000);
    return () => clearInterval(interval);
  }, [step, courtAddress, pollICStatus]);

  if (disputedMilestones.length === 0) return null;

  const handleFileWithIC = async (milestoneIndex: number) => {
    const ms = milestones[milestoneIndex];
    setSelectedMilestone(milestoneIndex);
    setStep("deploying");
    setError("");
    setStatus("Deploying Internet Court case...");

    try {
      const statement = `The provider met the SLA criteria: "${ms.sla_criteria}" for milestone "${ms.description}"`;
      const guidelines = [
        `Evaluate whether the provider fulfilled the SLA based on:`,
        `- SLA Criteria: ${ms.sla_criteria}`,
        `- SLA Check Results: ${ms.pass_count} PASS, ${ms.fail_count} FAIL`,
        `- Last Check: ${ms.last_check_result || "N/A"}`,
        `- Dispute Reason: ${ms.dispute_reason || "N/A"}`,
        `Judge based on the automated SLA check history and submitted evidence.`,
      ].join("\n");
      const evidenceDefs = JSON.stringify({
        party_a: { types: ["text"], max_chars: 5000 },
        party_b: { types: ["text"], max_chars: 5000 },
      });

      // Get connected wallet to determine the other party
      const { getProvider } = await import("@/lib/provider");
      const accounts = (await getProvider().request({
        method: "eth_accounts",
      })) as string[];
      const sender = accounts[0]?.toLowerCase();
      const otherParty =
        sender === clientAddress.toLowerCase()
          ? providerAddress
          : clientAddress;

      const hash = await deployContract(INTERNET_COURT_CODE, [
        otherParty,
        statement,
        guidelines,
        evidenceDefs,
        0,
      ], config);

      setStatus("Waiting for deployment consensus (1-2 min)...");
      await waitForTransaction(hash, 200, 5000, undefined, config);

      setStatus("Deployed! Fetching contract address...");
      const addr = await getDeployedAddress(hash, 60, 5000, config);
      if (addr) {
        setCourtAddress(addr);
        persistCase(addr, milestoneIndex);
        setStatus("Internet Court case deployed!");
      } else {
        setStatus(
          "Deployed! Could not auto-detect address — paste it from GenLayer Studio."
        );
      }
      setStep("case_active");
    } catch (err) {
      const friendly = mapToUserFriendlyError(err);
      setError(`${friendly.title}: ${friendly.message}`);
      setStatus("");
      setStep("idle");
    }
  };

  const runICAction = async (
    label: string,
    fn: () => Promise<void>
  ) => {
    setActionPending(true);
    setError("");
    setStatus(label);
    try {
      await fn();
      setStatus("");
      pollICStatus();
    } catch (err) {
      const friendly = mapToUserFriendlyError(err);
      setError(`${friendly.title}: ${friendly.message}`);
      setStatus("");
    } finally {
      setActionPending(false);
    }
  };

  const handleAcceptIC = () =>
    runICAction("Accepting IC case...", async () => {
      const hash = await sendWriteTransactionTo(courtAddress, "accept_contract", [], config);
      await waitForTransaction(hash, 200, 5000, undefined, config);
    });

  const handleInitiateDispute = () =>
    runICAction("Initiating dispute...", async () => {
      const hash = await sendWriteTransactionTo(courtAddress, "initiate_dispute", [], config);
      await waitForTransaction(hash, 200, 5000, undefined, config);
    });

  const handleSubmitICEvidence = () =>
    runICAction("Submitting evidence...", async () => {
      if (!evidenceText.trim()) throw new Error("Please enter evidence");
      const hash = await sendWriteTransactionTo(courtAddress, "submit_evidence", [evidenceText], config);
      await waitForTransaction(hash, 200, 5000, undefined, config);
      setEvidenceText("");
    });

  const handleResolveIC = () =>
    runICAction("Resolving dispute — AI jury evaluating (1-2 min)...", async () => {
      const hash = await sendWriteTransactionTo(courtAddress, "resolve", [], config);
      await waitForTransaction(hash, 200, 5000, undefined, config);
    });

  const handleApplyVerdict = async () => {
    if (!icStatus || icStatus.status !== "resolved" || selectedMilestone === null) return;
    setStep("applying");
    setError("");
    setStatus("Applying verdict to escrow...");

    try {
      const hash = await sendWriteTransaction("resolve_dispute", [
        agreementId,
        selectedMilestone,
        icStatus.verdict,
        courtAddress,
      ], config);
      setStatus("Waiting for consensus...");
      await waitForTransaction(hash, 200, 5000, undefined, config);
      setStatus("Verdict applied!");
      clearCase();
      onSuccess?.();
    } catch (err) {
      const friendly = mapToUserFriendlyError(err);
      setError(`${friendly.title}: ${friendly.message}`);
      setStatus("");
      setStep("case_active");
    }
  };

  const statusLabel = (s: string) => {
    const labels: Record<string, string> = {
      created: "Awaiting provider acceptance",
      active: "Active — ready to initiate dispute",
      disputed: "Disputed — awaiting evidence from both parties",
      resolving: "AI jury evaluating...",
      resolved: "Verdict delivered",
    };
    return labels[s] || s;
  };

  return (
    <div className="space-y-4 mt-3">
      <h4 className="text-sm font-medium text-white/60">
        Resolve via Internet Court
      </h4>
      <p className="text-xs text-white/40">
        Disputes are resolved by Internet Court — an AI jury of GenLayer
        validators evaluates the evidence and delivers a consensus verdict.
      </p>

      {/* Step 1: File with IC */}
      {step === "idle" &&
        disputedMilestones.map(({ ms, i }) => (
          <div
            key={i}
            className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
          >
            <div>
              <div className="text-sm font-medium">
                Milestone #{i + 1}: {ms.description}
              </div>
              <div className="text-xs text-white/40 mt-1">
                {ms.pass_count} PASS / {ms.fail_count} FAIL
              </div>
            </div>
            <button
              onClick={() => handleFileWithIC(i)}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
            >
              File with Internet Court
            </button>
          </div>
        ))}

      {/* Deploying spinner */}
      {step === "deploying" && (
        <div className="flex items-center gap-2 text-xs text-violet-400">
          <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          {status}
        </div>
      )}

      {/* Step 2: Case active */}
      {step === "case_active" && (
        <div className="space-y-3">
          {/* Clear case button */}
          <div className="flex justify-end">
            <button
              onClick={() => {
                clearCase();
                setCourtAddress("");
                setIcStatus(null);
                setIcEvidence(null);
                setSelectedMilestone(null);
                setStep("idle");
                setStatus("");
                setError("");
              }}
              className="text-xs text-white/30 hover:text-red-400 transition-colors"
            >
              Clear Case
            </button>
          </div>

          {/* IC address input */}
          <div>
            <label className="block text-xs text-white/40 mb-1">
              Internet Court Contract Address
            </label>
            <input
              type="text"
              value={courtAddress}
              onChange={(e) => {
                setCourtAddress(e.target.value);
                persistCase(e.target.value, selectedMilestone);
              }}
              placeholder="0x... (paste from GenLayer Studio)"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* IC case status */}
          {courtAddress && icStatus && (
            <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-violet-300">
                  Internet Court Case
                </span>
                <span className="text-xs text-white/40 px-2 py-0.5 bg-white/10 rounded-full">
                  {statusLabel(icStatus.status)}
                </span>
              </div>

              {/* Step-by-step guide based on current status */}
              {icStatus.status === "created" && (
                <div className="space-y-2">
                  <p className="text-xs text-white/40">
                    {icStatus.party_a.toLowerCase() === clientAddress.toLowerCase()
                      ? "Switch to provider account and accept the case."
                      : "Switch to client account and accept the case."}
                  </p>
                  <button
                    onClick={handleAcceptIC}
                    disabled={actionPending}
                    className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {actionPending ? "Processing..." : "Accept Case"}
                  </button>
                </div>
              )}

              {icStatus.status === "active" && (
                <div className="space-y-2">
                  <p className="text-xs text-white/40">
                    Initiate the dispute to enable evidence submission.
                  </p>
                  <button
                    onClick={handleInitiateDispute}
                    disabled={actionPending}
                    className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {actionPending ? "Processing..." : "Initiate Dispute"}
                  </button>
                </div>
              )}

              {icStatus.status === "disputed" && (
                <div className="space-y-2">
                  <p className="text-xs text-white/40">
                    Both parties must submit evidence. Then click Resolve to
                    trigger the AI jury evaluation.
                  </p>

                  {/* Evidence status indicators */}
                  {icEvidence && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className={`p-2 rounded ${icEvidence.evidence_a ? "bg-green-500/10 border border-green-500/20" : "bg-white/5 border border-white/10"}`}>
                        <span className="text-white/40">Client (Party A): </span>
                        <span className={icEvidence.evidence_a ? "text-green-400" : "text-yellow-400"}>
                          {icEvidence.evidence_a ? "Submitted" : "Pending"}
                        </span>
                      </div>
                      <div className={`p-2 rounded ${icEvidence.evidence_b ? "bg-green-500/10 border border-green-500/20" : "bg-white/5 border border-white/10"}`}>
                        <span className="text-white/40">Provider (Party B): </span>
                        <span className={icEvidence.evidence_b ? "text-green-400" : "text-yellow-400"}>
                          {icEvidence.evidence_b ? "Submitted" : "Pending"}
                        </span>
                      </div>
                    </div>
                  )}

                  <textarea
                    value={evidenceText}
                    onChange={(e) => setEvidenceText(e.target.value)}
                    placeholder="Your evidence for this dispute... (submit from the correct wallet — client or provider)"
                    rows={3}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-violet-500 resize-none"
                  />
                  <button
                    onClick={handleSubmitICEvidence}
                    disabled={actionPending || !evidenceText.trim()}
                    className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {actionPending ? "Submitting..." : "Submit Evidence"}
                  </button>

                  {/* Resolve button — shown when both parties have submitted */}
                  {icEvidence && icEvidence.evidence_a && icEvidence.evidence_b && (
                    <button
                      onClick={handleResolveIC}
                      disabled={actionPending}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {actionPending ? "Processing..." : "Resolve — Trigger AI Jury"}
                    </button>
                  )}
                </div>
              )}

              {icStatus.status === "resolving" && (
                <div className="flex items-center gap-2 text-xs text-violet-400">
                  <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                  AI jury is evaluating evidence...
                </div>
              )}

              {icStatus.status === "resolved" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">Verdict:</span>
                    <span
                      className={`text-sm font-bold ${
                        icStatus.verdict === "PARTY_B"
                          ? "text-green-400"
                          : icStatus.verdict === "PARTY_A"
                            ? "text-red-400"
                            : "text-yellow-400"
                      }`}
                    >
                      {icStatus.verdict === "PARTY_B"
                        ? "Provider fulfilled SLA"
                        : icStatus.verdict === "PARTY_A"
                          ? "Provider failed SLA"
                          : "Inconclusive"}
                    </span>
                  </div>
                  <p className="text-xs text-white/50">{icStatus.reasoning}</p>
                  <button
                    onClick={handleApplyVerdict}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors"
                  >
                    Apply Verdict to Escrow
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Applying spinner */}
      {step === "applying" && (
        <div className="flex items-center gap-2 text-xs text-violet-400">
          <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          {status}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
      {status && step === "case_active" && (
        <p className="text-xs text-violet-400">{status}</p>
      )}
    </div>
  );
}
