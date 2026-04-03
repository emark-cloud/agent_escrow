"use client";
import { useState, useEffect } from "react";
import type { Agreement, Milestone } from "@/types/agreement";

interface Props {
  agreement: Agreement;
  milestones: Milestone[];
}

// ── Step definition ──

interface FlowStep {
  id: string;
  label: string;
  status: "completed" | "active" | "pending" | "error" | "skipped";
  detail?: string;
}

interface FlowSection {
  title: string;
  color: string; // tailwind border/text color token
  steps: FlowStep[];
}

// ── IC court status from server ──

interface ICCourtInfo {
  status: string;
  verdict?: string;
  reasoning?: string;
  evidence_a?: string;
  evidence_b?: string;
}

interface CrossChainInfo {
  enabled: boolean;
  base?: {
    bridged: boolean;
    verdict?: {
      verdict: string;
      timestamp: number;
      reasoningHash: string;
    } | null;
  };
}

// ── Helpers ──

const MS_STATUS: Record<number, string> = {
  0: "Pending",
  1: "Monitoring",
  2: "Verified",
  3: "Paid",
  4: "Disputed",
  5: "Failed",
  6: "Refunded",
};

function buildHappyPath(agreement: Agreement, milestones: Milestone[]): FlowSection {
  const agStatus = agreement.status; // 0=Created,1=Active,2=Completed,3=Disputed,4=Cancelled
  const steps: FlowStep[] = [];

  // Step 1: Created
  steps.push({
    id: "created",
    label: "Agreement Created",
    status: agStatus >= 0 ? "completed" : "pending",
    detail: `${agreement.milestone_count} milestone${agreement.milestone_count !== 1 ? "s" : ""}, ${agreement.total_amount} USDC`,
  });

  // Step 2: Accepted
  if (agStatus === 4) {
    steps.push({
      id: "accepted",
      label: "Accepted",
      status: "skipped",
      detail: "Agreement was cancelled",
    });
  } else {
    steps.push({
      id: "accepted",
      label: "Provider Accepted",
      status: agStatus >= 1 ? "completed" : "active",
      detail: agStatus === 0 ? "Waiting for provider to accept" : undefined,
    });
  }

  // Step 3: SLA Monitoring
  if (agStatus >= 1 && agStatus !== 4) {
    const totalChecks = milestones.reduce((s, ms) => s + ms.pass_count + ms.fail_count, 0);
    const totalPasses = milestones.reduce((s, ms) => s + ms.pass_count, 0);
    const totalFails = milestones.reduce((s, ms) => s + ms.fail_count, 0);
    const anyMonitoring = milestones.some(ms => ms.status === 1);
    const allVerifiedOrBeyond = milestones.every(ms => ms.status >= 2);

    steps.push({
      id: "monitoring",
      label: "SLA Monitoring",
      status: allVerifiedOrBeyond ? "completed" : anyMonitoring || totalChecks > 0 ? "active" : "pending",
      detail: totalChecks > 0
        ? `${totalPasses} pass, ${totalFails} fail across ${totalChecks} checks`
        : "No SLA checks run yet",
    });

    // Step 4: Verification
    const verifiedCount = milestones.filter(ms => ms.status >= 2 && ms.status !== 4 && ms.status !== 5).length;
    steps.push({
      id: "verified",
      label: "Milestones Verified",
      status: verifiedCount === milestones.length ? "completed"
        : verifiedCount > 0 ? "active" : "pending",
      detail: `${verifiedCount}/${milestones.length} verified`,
    });

    // Step 5: Payment
    const paidCount = milestones.filter(ms => ms.status === 3).length;
    steps.push({
      id: "paid",
      label: "Payment Released",
      status: agStatus === 2 ? "completed"
        : paidCount > 0 ? "active" : "pending",
      detail: paidCount > 0 ? `${paidCount}/${milestones.length} paid` : undefined,
    });
  }

  return { title: "Agreement Lifecycle", color: "violet", steps };
}

function buildDisputePath(agreement: Agreement, milestones: Milestone[]): FlowSection | null {
  const disputedMs = milestones.map((ms, i) => ({ ms, i })).filter(({ ms }) =>
    ms.status === 4 || ms.status === 5 || ms.status === 6
  );
  if (disputedMs.length === 0 && agreement.status !== 3) return null;

  const steps: FlowStep[] = [];

  // Dispute filed
  const hasDispute = agreement.status === 3 || disputedMs.length > 0;
  steps.push({
    id: "dispute-filed",
    label: "Dispute Filed",
    status: hasDispute ? "completed" : "pending",
    detail: disputedMs.length > 0
      ? `${disputedMs.length} milestone${disputedMs.length !== 1 ? "s" : ""}: ${disputedMs.map(({ i }) => `#${i + 1}`).join(", ")}`
      : undefined,
  });

  // Show dispute reasons
  for (const { ms, i } of disputedMs) {
    if (ms.dispute_reason) {
      steps.push({
        id: `dispute-reason-${i}`,
        label: `Milestone #${i + 1} Reason`,
        status: ms.status === 4 ? "active" : "completed",
        detail: ms.dispute_reason,
      });
    }
  }

  // Resolution
  const resolvedCount = disputedMs.filter(({ ms }) => ms.status === 5 || ms.status === 6).length;
  if (hasDispute) {
    steps.push({
      id: "resolution",
      label: "Dispute Resolved",
      status: resolvedCount === disputedMs.length && disputedMs.length > 0 ? "completed"
        : resolvedCount > 0 ? "active" : "pending",
      detail: resolvedCount > 0
        ? `${resolvedCount}/${disputedMs.length} resolved`
        : "Awaiting Internet Court verdict",
    });
  }

  // Refund (if applicable)
  const refundedCount = disputedMs.filter(({ ms }) => ms.status === 6).length;
  const failedCount = disputedMs.filter(({ ms }) => ms.status === 5).length;
  if (refundedCount > 0 || failedCount > 0) {
    steps.push({
      id: "outcome",
      label: "Outcome Applied",
      status: "completed",
      detail: [
        refundedCount > 0 ? `${refundedCount} refunded` : null,
        failedCount > 0 ? `${failedCount} failed` : null,
      ].filter(Boolean).join(", "),
    });
  }

  return { title: "Dispute Resolution", color: "red", steps };
}

function buildCourtFlow(
  agreement: Agreement,
  milestones: Milestone[],
  courtInfo: ICCourtInfo | null,
): FlowSection | null {
  const hasDispute = agreement.status === 3 || milestones.some(ms => ms.status === 4);
  if (!hasDispute) return null;

  const steps: FlowStep[] = [];

  if (!courtInfo) {
    steps.push({
      id: "ic-deploy",
      label: "Deploy Internet Court",
      status: "active",
      detail: "No court contract deployed yet",
    });
    steps.push({ id: "ic-accept", label: "Other Party Accepts", status: "pending" });
    steps.push({ id: "ic-initiate", label: "Initiate Dispute", status: "pending" });
    steps.push({ id: "ic-evidence", label: "Submit Evidence", status: "pending" });
    steps.push({ id: "ic-resolve", label: "AI Jury Verdict", status: "pending" });
    steps.push({ id: "ic-apply", label: "Apply to Escrow", status: "pending" });
    return { title: "Internet Court", color: "amber", steps };
  }

  const s = courtInfo.status;

  // Deploy
  steps.push({
    id: "ic-deploy",
    label: "Court Deployed",
    status: "completed",
  });

  // Accept
  steps.push({
    id: "ic-accept",
    label: "Case Accepted",
    status: s === "created" ? "active"
      : ["active", "disputed", "resolving", "resolved"].includes(s) ? "completed" : "pending",
    detail: s === "created" ? "Waiting for other party to accept" : undefined,
  });

  // Initiate
  steps.push({
    id: "ic-initiate",
    label: "Dispute Initiated",
    status: s === "active" ? "active"
      : ["disputed", "resolving", "resolved"].includes(s) ? "completed" : "pending",
    detail: s === "active" ? "Ready to initiate dispute" : undefined,
  });

  // Evidence
  const hasEvidenceA = !!courtInfo.evidence_a;
  const hasEvidenceB = !!courtInfo.evidence_b;
  const evidenceDetail = s === "disputed"
    ? `Client: ${hasEvidenceA ? "submitted" : "pending"} · Provider: ${hasEvidenceB ? "submitted" : "pending"}`
    : undefined;
  steps.push({
    id: "ic-evidence",
    label: "Evidence Submitted",
    status: s === "disputed" ? "active"
      : ["resolving", "resolved"].includes(s) ? "completed" : "pending",
    detail: evidenceDetail,
  });

  // Resolve
  steps.push({
    id: "ic-resolve",
    label: "AI Jury Verdict",
    status: s === "resolving" ? "active"
      : s === "resolved" ? "completed" : "pending",
    detail: s === "resolving" ? "Validators evaluating evidence..."
      : s === "resolved" && courtInfo.verdict
        ? `Verdict: ${courtInfo.verdict === "PARTY_A" ? "Client wins" : courtInfo.verdict === "PARTY_B" ? "Provider wins" : courtInfo.verdict}`
        : undefined,
  });

  // Apply verdict
  const verdictApplied = milestones.some(ms => ms.status === 5 || ms.status === 6);
  steps.push({
    id: "ic-apply",
    label: "Verdict Applied",
    status: verdictApplied ? "completed"
      : s === "resolved" ? "active" : "pending",
    detail: s === "resolved" && !verdictApplied ? "Ready to apply verdict to escrow" : undefined,
  });

  return { title: "Internet Court", color: "amber", steps };
}

function buildCrossChainFlow(
  crossChain: CrossChainInfo | null,
  milestones: Milestone[],
): FlowSection | null {
  if (!crossChain || !crossChain.enabled) return null;
  const hasResolved = milestones.some(ms => ms.status === 5 || ms.status === 6);
  if (!hasResolved && !crossChain.base?.bridged) return null;

  const steps: FlowStep[] = [];

  // Verdict emitted
  steps.push({
    id: "cc-emit",
    label: "Verdict Emitted",
    status: hasResolved ? "completed" : "pending",
    detail: "GenLayer BridgeSender",
  });

  // Relay pickup
  steps.push({
    id: "cc-relay",
    label: "Relay Forwarded",
    status: crossChain.base?.bridged ? "completed" : hasResolved ? "active" : "pending",
    detail: crossChain.base?.bridged ? undefined : "Relay polls every ~1 minute",
  });

  // Base Sepolia
  const verdict = crossChain.base?.verdict;
  steps.push({
    id: "cc-base",
    label: "Recorded on Base",
    status: crossChain.base?.bridged ? "completed" : "pending",
    detail: verdict
      ? `${verdict.verdict} · ${new Date(verdict.timestamp * 1000).toLocaleDateString()}`
      : undefined,
  });

  return { title: "Cross-Chain Bridge", color: "sky", steps };
}

// ── Status dot colors ──

const STATUS_DOT: Record<FlowStep["status"], string> = {
  completed: "bg-green-400",
  active: "bg-violet-400 animate-pulse",
  pending: "bg-white/15",
  error: "bg-red-400",
  skipped: "bg-white/10",
};

const STATUS_LINE: Record<FlowStep["status"], string> = {
  completed: "bg-green-400/40",
  active: "bg-violet-400/40",
  pending: "bg-white/8",
  error: "bg-red-400/40",
  skipped: "bg-white/5",
};

const STATUS_TEXT: Record<FlowStep["status"], string> = {
  completed: "text-white/70",
  active: "text-white",
  pending: "text-white/30",
  error: "text-red-400",
  skipped: "text-white/20 line-through",
};

const SECTION_COLORS: Record<string, { border: string; title: string; bg: string }> = {
  violet: { border: "border-violet-500/20", title: "text-violet-400", bg: "bg-violet-500/5" },
  red: { border: "border-red-500/20", title: "text-red-400", bg: "bg-red-500/5" },
  amber: { border: "border-amber-500/20", title: "text-amber-400", bg: "bg-amber-500/5" },
  sky: { border: "border-sky-500/20", title: "text-sky-400", bg: "bg-sky-500/5" },
};

// ── Component ──

export function AgreementFlow({ agreement, milestones }: Props) {
  const [courtInfo, setCourtInfo] = useState<ICCourtInfo | null>(null);
  const [crossChain, setCrossChain] = useState<CrossChainInfo | null>(null);

  // Fetch IC court status for disputed milestones
  useEffect(() => {
    if (agreement.status !== 3 && !milestones.some(ms => ms.status === 4)) return;

    const disputedIdx = milestones.findIndex(ms => ms.status === 4);
    if (disputedIdx === -1) return;

    async function fetchCourt() {
      try {
        const res = await fetch(
          `/api/agreements/${agreement.agreement_id}/court?milestone=${disputedIdx}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.case) {
            setCourtInfo({
              status: data.case.status || "unknown",
              verdict: data.case.verdict,
              reasoning: data.case.reasoning,
              evidence_a: data.evidence?.evidence_a,
              evidence_b: data.evidence?.evidence_b,
            });
          }
        }
      } catch {
        // Court not deployed yet — that's fine
      }
    }
    fetchCourt();
    const interval = setInterval(fetchCourt, 8000);
    return () => clearInterval(interval);
  }, [agreement.agreement_id, agreement.status, milestones]);

  // Fetch cross-chain status
  useEffect(() => {
    const resolvedIdx = milestones.findIndex(ms => ms.status === 5 || ms.status === 6);

    async function fetchCrossChain() {
      try {
        const idx = resolvedIdx >= 0 ? resolvedIdx : 0;
        const res = await fetch(`/api/cross-chain/${agreement.agreement_id}?milestone=${idx}`);
        if (res.ok) {
          setCrossChain(await res.json());
        }
      } catch {
        // Cross-chain not configured
      }
    }
    fetchCrossChain();
    const interval = setInterval(fetchCrossChain, 15000);
    return () => clearInterval(interval);
  }, [agreement.agreement_id, milestones]);

  // Build sections
  const sections: FlowSection[] = [];
  sections.push(buildHappyPath(agreement, milestones));

  const dispute = buildDisputePath(agreement, milestones);
  if (dispute) sections.push(dispute);

  const court = buildCourtFlow(agreement, milestones, courtInfo);
  if (court) sections.push(court);

  const cc = buildCrossChainFlow(crossChain, milestones);
  if (cc) sections.push(cc);

  return (
    <div className="space-y-4 mt-8">
      <h2 className="text-lg font-semibold">Progress</h2>
      {sections.map((section) => {
        const colors = SECTION_COLORS[section.color] || SECTION_COLORS.violet;
        return (
          <div
            key={section.title}
            className={`rounded-xl border ${colors.border} ${colors.bg} p-4`}
          >
            <h3 className={`text-xs font-semibold ${colors.title} mb-3 uppercase tracking-wider`}>
              {section.title}
            </h3>
            <div className="space-y-0">
              {section.steps.map((step, i) => (
                <div key={step.id} className="flex items-start gap-3">
                  {/* Vertical line + dot */}
                  <div className="flex flex-col items-center w-4 shrink-0">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1 ${STATUS_DOT[step.status]}`} />
                    {i < section.steps.length - 1 && (
                      <div className={`w-0.5 flex-1 min-h-[20px] ${STATUS_LINE[step.status]}`} />
                    )}
                  </div>
                  {/* Content */}
                  <div className="pb-3 min-w-0">
                    <div className={`text-sm font-medium leading-tight ${STATUS_TEXT[step.status]}`}>
                      {step.label}
                    </div>
                    {step.detail && (
                      <div className="text-xs text-white/30 mt-0.5 leading-snug break-words">
                        {step.detail}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
