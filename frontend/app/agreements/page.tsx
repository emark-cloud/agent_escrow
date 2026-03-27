"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";
import { useAgreementList, useAllAgreements } from "@/hooks/useAgreement";
import { AgreementStatusBadge } from "@/components/StatusBadge";
import { AgentBadge } from "@/components/AgentBadge";
import type { Agreement } from "@/types/agreement";

const STATUS_TABS = [
  { status: -1, label: "All", color: "violet" },
  { status: 1, label: "Active", color: "blue" },
  { status: 3, label: "Disputed", color: "red" },
  { status: 0, label: "Created", color: "gray" },
  { status: 2, label: "Completed", color: "green" },
  { status: 4, label: "Cancelled", color: "gray" },
] as const;

const TAB_STYLES: Record<string, { active: string; inactive: string }> = {
  violet: {
    active: "bg-violet-600 text-white border-violet-500",
    inactive: "text-white/50 hover:text-white/80 hover:bg-white/5 border-white/10",
  },
  blue: {
    active: "bg-blue-600 text-white border-blue-500",
    inactive: "text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/10 border-white/10",
  },
  red: {
    active: "bg-red-600 text-white border-red-500",
    inactive: "text-red-400/60 hover:text-red-400 hover:bg-red-500/10 border-white/10",
  },
  gray: {
    active: "bg-gray-600 text-white border-gray-500",
    inactive: "text-white/40 hover:text-white/60 hover:bg-white/5 border-white/10",
  },
  green: {
    active: "bg-green-600 text-white border-green-500",
    inactive: "text-green-400/60 hover:text-green-400 hover:bg-green-500/10 border-white/10",
  },
};

function AgreementCard({ ag }: { ag: Agreement }) {
  return (
    <Link
      href={`/agreements/${ag.agreement_id}`}
      className="glass-card rounded-xl p-5 flex items-center justify-between hover:bg-white/[0.06] transition-colors block"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <span className="font-mono text-sm text-white/60">
            #{ag.agreement_id}
          </span>
          <AgreementStatusBadge status={ag.status} />
        </div>
        <p className="text-sm text-white/80 truncate">
          {ag.description}
        </p>
        <div className="flex items-center gap-4 mt-2 text-xs text-white/30">
          <span className="inline-flex items-center gap-1">
            Client: {ag.client.slice(0, 6)}...{ag.client.slice(-4)}
            <AgentBadge address={ag.client} />
          </span>
          <span className="inline-flex items-center gap-1">
            Provider: {ag.provider.slice(0, 6)}...
            {ag.provider.slice(-4)}
            <AgentBadge address={ag.provider} />
          </span>
          <span>{ag.milestone_count} milestone(s)</span>
        </div>
      </div>
      <div className="text-right ml-4">
        <div className="text-sm font-mono">{ag.total_amount} USDC</div>
      </div>
    </Link>
  );
}

export default function AgreementsList() {
  const { address, isConnected, openModal: connect } = useWallet();
  const [showAll, setShowAll] = useState(true);
  const [activeTab, setActiveTab] = useState(-1);
  const myAgreements = useAgreementList(showAll ? null : (address ?? null));
  const allAgreements = useAllAgreements(showAll);
  const { agreements, loading, error } = showAll ? allAgreements : myAgreements;

  const counts = useMemo(() => {
    const map = new Map<number, number>();
    for (const ag of agreements) {
      map.set(ag.status, (map.get(ag.status) || 0) + 1);
    }
    return map;
  }, [agreements]);

  const filtered = useMemo(() => {
    const list = activeTab === -1
      ? agreements
      : agreements.filter((ag) => ag.status === activeTab);
    return [...list].reverse();
  }, [agreements, activeTab]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">
            {showAll ? "All Agreements" : "My Agreements"}
          </h1>
          <p className="text-white/40 text-sm mt-1">
            {showAll
              ? "All agreements on the contract"
              : "Agreements where you are client or provider"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const { refetch } = showAll ? allAgreements : myAgreements;
              refetch();
            }}
            className="p-2 text-white/40 hover:text-white/80 hover:bg-white/5 border border-white/10 rounded-lg transition-colors"
            title="Refresh"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-4 py-2 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
          >
            {showAll ? "Show Mine" : "Show All"}
          </button>
          <Link
            href="/create"
            className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg font-medium text-sm transition-colors"
          >
            + New Agreement
          </Link>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto">
        {STATUS_TABS.map(({ status, label, color }) => {
          const count = status === -1
            ? agreements.length
            : (counts.get(status) || 0);
          const isActive = activeTab === status;
          const styles = TAB_STYLES[color];
          return (
            <button
              key={status}
              onClick={() => setActiveTab(status)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap flex items-center gap-2 ${
                isActive ? styles.active : styles.inactive
              }`}
            >
              {label}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isActive ? "bg-white/20" : "bg-white/5"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-4 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          Failed to load agreements: {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-white/40">
          Loading agreements...
        </div>
      ) : filtered.length === 0 && !error ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <p className="text-white/40 mb-4">
            {agreements.length === 0
              ? "No agreements yet."
              : "No agreements in this category."}
          </p>
          {agreements.length === 0 && (
            <Link
              href="/create"
              className="text-violet-400 hover:text-violet-300 text-sm"
            >
              Create your first agreement
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ag) => (
            <AgreementCard key={ag.agreement_id} ag={ag} />
          ))}
        </div>
      )}
    </div>
  );
}
