"use client";
import { useState, useEffect, useCallback } from "react";
import { readContract } from "@/lib/genlayer";
import {
  MILESTONE_STATUS,
  STATUS_COLORS,
} from "@/lib/config";
import { AgreementStatusBadge } from "@/components/StatusBadge";
import { AgentBadge } from "@/components/AgentBadge";
import Link from "next/link";
import type { Agreement, Milestone } from "@/types/agreement";

interface AgreementWithMilestones {
  agreement: Agreement;
  milestones: Milestone[];
}

export default function DashboardPage() {
  const [data, setData] = useState<AgreementWithMilestones[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const raw = await readContract<string>("get_all_agreement_ids", []);
      const ids = raw ? (Array.isArray(raw) ? raw : raw.split(",")) : [];
      const uniqueIds = [...new Set(ids.filter(Boolean))];

      const results: AgreementWithMilestones[] = [];

      for (const id of uniqueIds) {
        try {
          const agRaw = await readContract<Record<string, unknown>>(
            "get_agreement",
            [id]
          );
          const ag: Agreement = {
            agreement_id: String(agRaw.agreement_id ?? ""),
            client: String(agRaw.client ?? ""),
            provider: String(agRaw.provider ?? ""),
            description: String(agRaw.description ?? ""),
            total_amount: Number(agRaw.total_amount ?? 0),
            milestone_count: Number(agRaw.milestone_count ?? 0),
            status: Number(agRaw.status ?? 0),
            court_case_id: String(agRaw.court_case_id ?? ""),
          };

          const milestones: Milestone[] = [];
          for (let i = 0; i < ag.milestone_count; i++) {
            try {
              const mRaw = await readContract<Record<string, unknown>>(
                "get_milestone",
                [id, i]
              );
              milestones.push({
                description: String(mRaw.description ?? ""),
                monitoring_url: String(mRaw.monitoring_url ?? ""),
                sla_criteria: String(mRaw.sla_criteria ?? ""),
                amount: Number(mRaw.amount ?? 0),
                pass_count: Number(mRaw.pass_count ?? 0),
                fail_count: Number(mRaw.fail_count ?? 0),
                status: Number(mRaw.status ?? 0),
                last_check_result: String(mRaw.last_check_result ?? ""),
                dispute_reason: String(mRaw.dispute_reason ?? ""),
                evidence_client: String(mRaw.evidence_client ?? ""),
                evidence_provider: String(mRaw.evidence_provider ?? ""),
              });
            } catch {
              // skip unreadable milestone
            }
          }
          results.push({ agreement: ag, milestones });
        } catch {
          // skip unreadable agreement
        }
      }
      setData(results);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Aggregations
  const totalAgreements = data.length;
  const agreementsByStatus: Record<number, number> = {};
  const milestonesByStatus: Record<number, number> = {};
  let totalMilestones = 0;
  let totalSlaChecks = 0;
  let totalPasses = 0;
  let totalValue = 0;

  for (const { agreement, milestones } of data) {
    agreementsByStatus[agreement.status] =
      (agreementsByStatus[agreement.status] ?? 0) + 1;
    totalValue += agreement.total_amount;

    for (const ms of milestones) {
      totalMilestones++;
      milestonesByStatus[ms.status] = (milestonesByStatus[ms.status] ?? 0) + 1;
      totalSlaChecks += ms.pass_count + ms.fail_count;
      totalPasses += ms.pass_count;
    }
  }

  const passRate =
    totalSlaChecks > 0 ? Math.round((totalPasses / totalSlaChecks) * 100) : 0;

  const recentAgreements = [...data]
    .reverse()
    .slice(0, 10);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
        <div className="text-center py-20 text-white/40">
          Loading on-chain data...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-white/40 text-sm mt-1">
            Aggregate on-chain analytics
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 mb-6 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Total Agreements" value={totalAgreements} />
        <StatCard
          label="Active"
          value={agreementsByStatus[1] ?? 0}
          color="text-blue-400"
        />
        <StatCard
          label="Completed"
          value={agreementsByStatus[2] ?? 0}
          color="text-green-400"
        />
        <StatCard
          label="Disputed"
          value={agreementsByStatus[3] ?? 0}
          color="text-red-400"
        />
        <StatCard label="Total Milestones" value={totalMilestones} />
      </div>

      {/* Two-column: Milestone Breakdown + SLA Performance */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Milestone Breakdown */}
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Milestone Breakdown</h2>
          {totalMilestones === 0 ? (
            <p className="text-white/30 text-sm">No milestones yet</p>
          ) : (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4, 5, 6].map((status) => {
                const count = milestonesByStatus[status] ?? 0;
                if (count === 0) return null;
                const pct = Math.round((count / totalMilestones) * 100);
                const colorClass = STATUS_COLORS[status] ?? "bg-gray-500";
                return (
                  <div key={status}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-white/60">
                        {MILESTONE_STATUS[status]}
                      </span>
                      <span className="text-white/80">
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${colorClass}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SLA Performance */}
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">SLA Performance</h2>
          <div className="grid grid-cols-2 gap-4">
            <MiniStat label="Total SLA Checks" value={totalSlaChecks} />
            <MiniStat label="Pass Rate" value={`${passRate}%`} />
            <MiniStat label="Total Passes" value={totalPasses} />
            <MiniStat
              label="Total Fails"
              value={totalSlaChecks - totalPasses}
            />
          </div>
          <div className="mt-6 pt-4 border-t border-white/5">
            <div className="flex justify-between text-sm">
              <span className="text-white/40">Total Escrow Value</span>
              <span className="font-mono text-white/80">
                {totalValue} USDC
              </span>
            </div>
          </div>
          {totalSlaChecks > 0 && (
            <div className="mt-4">
              <div className="h-3 bg-white/5 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-green-500"
                  style={{
                    width: `${passRate}%`,
                  }}
                />
                <div
                  className="h-full bg-red-500"
                  style={{
                    width: `${100 - passRate}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-white/30 mt-1">
                <span>Pass ({passRate}%)</span>
                <span>Fail ({100 - passRate}%)</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Agreements */}
      <div className="glass-card rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Agreements</h2>
        {recentAgreements.length === 0 ? (
          <p className="text-white/30 text-sm">No agreements yet</p>
        ) : (
          <div className="space-y-3">
            {recentAgreements.map(({ agreement: ag, milestones }) => (
              <Link
                key={ag.agreement_id}
                href={`/agreements/${ag.agreement_id}`}
                className="flex items-center justify-between p-4 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] transition-colors border border-white/5"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono text-sm text-white/60">
                      #{ag.agreement_id}
                    </span>
                    <AgreementStatusBadge status={ag.status} />
                  </div>
                  <p className="text-sm text-white/60 truncate">
                    {ag.description}
                  </p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-white/30">
                    <span className="inline-flex items-center gap-1">
                      Client: {ag.client.slice(0, 6)}...{ag.client.slice(-4)}
                      <AgentBadge address={ag.client} />
                    </span>
                    <span className="inline-flex items-center gap-1">
                      Provider: {ag.provider.slice(0, 6)}...
                      {ag.provider.slice(-4)}
                      <AgentBadge address={ag.provider} />
                    </span>
                    <span>
                      {milestones.length} milestone
                      {milestones.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className="text-sm font-mono">{ag.total_amount} USDC</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="glass-card rounded-xl p-5">
      <div className="text-xs text-white/40 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color ?? "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div>
      <div className="text-xs text-white/40">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}
