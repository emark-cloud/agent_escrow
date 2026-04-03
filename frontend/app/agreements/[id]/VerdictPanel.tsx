"use client";
import { useState, useEffect } from "react";

interface CourtData {
  courtAddress: string | null;
  case: {
    status: string;
    verdict: string;
    reasoning: string;
    statement: string;
    party_a: string;
    party_b: string;
  } | null;
  evidence: {
    evidence_a: string;
    evidence_b: string;
  } | null;
}

interface Props {
  agreementId: string;
  milestoneIndex: number;
  clientAddress: string;
  providerAddress: string;
}

export function VerdictPanel({ agreementId, milestoneIndex, clientAddress, providerAddress }: Props) {
  const [data, setData] = useState<CourtData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function fetchCourt() {
      try {
        const res = await fetch(
          `/api/agreements/${agreementId}/court?milestone=${milestoneIndex}`
        );
        if (res.ok) {
          const d = await res.json();
          if (d.case) setData(d);
        }
      } catch {
        // No court data available
      }
    }
    fetchCourt();
  }, [agreementId, milestoneIndex]);

  if (!data?.case || data.case.status !== "resolved") return null;

  const { verdict, reasoning } = data.case;
  const isClientWin = verdict === "PARTY_A";
  const isProviderWin = verdict === "PARTY_B";

  return (
    <div className="mt-3 border border-amber-500/20 rounded-lg p-4 bg-amber-500/5">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-4 h-4 flex items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
          IC
        </div>
        <h4 className="text-sm font-semibold text-amber-400">
          Internet Court Verdict
        </h4>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs text-white/40">Ruling:</span>
        <span
          className={`text-sm font-bold ${
            isClientWin ? "text-orange-400" : isProviderWin ? "text-green-400" : "text-yellow-400"
          }`}
        >
          {isClientWin
            ? "Client wins — Provider failed SLA"
            : isProviderWin
              ? "Provider wins — SLA fulfilled"
              : "Inconclusive"}
        </span>
      </div>

      <p className="text-xs text-white/50 leading-relaxed">{reasoning}</p>

      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2 text-[11px] text-amber-400/60 hover:text-amber-400 transition-colors"
      >
        {expanded ? "Hide details" : "Show evidence & details"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 pt-3 border-t border-white/5">
          <div className="text-xs text-white/30">
            <span className="text-white/20">Statement: </span>
            {data.case.statement}
          </div>
          <div className="text-xs text-white/30">
            <span className="text-white/20">Court contract: </span>
            <span className="font-mono">{data.courtAddress}</span>
          </div>
          {data.evidence && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 bg-white/[0.03] rounded text-xs">
                <div className="text-white/25 mb-1">Client Evidence</div>
                <div className="text-white/50">{data.evidence.evidence_a || "None"}</div>
              </div>
              <div className="p-2 bg-white/[0.03] rounded text-xs">
                <div className="text-white/25 mb-1">Provider Evidence</div>
                <div className="text-white/50">{data.evidence.evidence_b || "None"}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
