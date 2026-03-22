"use client";
import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";
import { useAgreementList } from "@/hooks/useAgreement";
import { AgreementStatusBadge } from "@/components/StatusBadge";

export default function AgreementsList() {
  const { address, isConnected, connect } = useWallet();
  const { agreements, loading } = useAgreementList(address);

  if (!isConnected) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h1 className="text-3xl font-bold mb-4">My Agreements</h1>
        <p className="text-white/40 mb-8">
          Connect your wallet to view your agreements.
        </p>
        <button
          onClick={connect}
          className="px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-lg font-semibold transition-colors"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">My Agreements</h1>
          <p className="text-white/40 text-sm mt-1">
            Agreements where you are client or provider
          </p>
        </div>
        <Link
          href="/create"
          className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg font-medium text-sm transition-colors"
        >
          + New Agreement
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-20 text-white/40">
          Loading agreements...
        </div>
      ) : agreements.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <p className="text-white/40 mb-4">No agreements yet.</p>
          <Link
            href="/create"
            className="text-violet-400 hover:text-violet-300 text-sm"
          >
            Create your first agreement
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {agreements.map((ag) => (
            <Link
              key={ag.agreement_id}
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
                <div className="flex gap-4 mt-2 text-xs text-white/30">
                  <span>
                    Client: {ag.client.slice(0, 6)}...{ag.client.slice(-4)}
                  </span>
                  <span>
                    Provider: {ag.provider.slice(0, 6)}...
                    {ag.provider.slice(-4)}
                  </span>
                  <span>{ag.milestone_count} milestone(s)</span>
                </div>
              </div>
              <div className="text-right ml-4">
                <div className="text-sm font-mono">{ag.total_amount} units</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
