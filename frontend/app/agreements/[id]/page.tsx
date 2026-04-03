"use client";
import { use, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useAgreement } from "@/hooks/useAgreement";
import {
  AgreementStatusBadge,
  MilestoneStatusBadge,
} from "@/components/StatusBadge";
import { TransactionButton } from "@/components/TransactionButton";
import { AgentBadge } from "@/components/AgentBadge";
import { ConsensusTracker } from "@/components/ConsensusTracker";
import { useAgentActivity } from "@/hooks/useAgentActivity";
import { useAgentWallets } from "@/hooks/useAgentWallets";
import { DisputePanel } from "./DisputePanel";
import { ResolvePanel } from "./ResolvePanel";
import { CrossChainStatus } from "./CrossChainStatus";
import { AgreementFlow } from "./AgreementFlow";

export default function AgreementDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { address } = useWallet();
  const { agreement, milestones, loading, error, refetch } = useAgreement(id);
  const agentTxs = useAgentActivity(id);
  const { agentName } = useAgentWallets();

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-20 text-center text-white/40">
        Loading agreement...
      </div>
    );
  }

  if (error || !agreement) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <p className="text-red-400">{error || "Agreement not found"}</p>
      </div>
    );
  }

  const isClient =
    address?.toLowerCase() === agreement.client.toLowerCase();
  const isProvider =
    address?.toLowerCase() === agreement.provider.toLowerCase();

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">Agreement #{id}</h1>
            <AgreementStatusBadge status={agreement.status} />
          </div>
          <p className="text-white/50">{agreement.description}</p>
        </div>
        <div className="text-right text-sm">
          <div className="text-white/40">Total Escrow</div>
          <div className="text-xl font-mono font-bold">
            {agreement.total_amount} USDC
          </div>
        </div>
      </div>

      {/* Parties */}
      <div className="glass-card rounded-xl p-5 mb-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs text-white/40 mb-1">Client</div>
            <div className="font-mono text-sm flex items-center gap-2">
              <span>
                {agreement.client.slice(0, 10)}...{agreement.client.slice(-6)}
              </span>
              <AgentBadge address={agreement.client} />
              {isClient && (
                <span className="text-xs text-violet-400">(you)</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-white/40 mb-1">Provider</div>
            <div className="font-mono text-sm flex items-center gap-2">
              <span>
                {agreement.provider.slice(0, 10)}...
                {agreement.provider.slice(-6)}
              </span>
              <AgentBadge address={agreement.provider} />
              {isProvider && (
                <span className="text-xs text-violet-400">(you)</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Agent Activity */}
      {agentTxs.length > 0 && (
        <div className="space-y-3 mb-6">
          {agentTxs.map((tx) => (
            <div key={tx.txHash} className="glass-card rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium">
                  Agent {agentName(tx.wallet) || tx.wallet}
                </span>
                <span className="text-xs text-white/40">
                  is running <span className="text-violet-400">{tx.action.replace("_", " ")}</span>
                </span>
              </div>
              <ConsensusTracker status={tx.consensus} />
            </div>
          ))}
        </div>
      )}

      {/* Actions bar */}
      {agreement.status === 0 && isProvider && (
        <div className="glass-card rounded-xl p-5 mb-6">
          <p className="text-sm text-white/60 mb-3">
            This agreement is waiting for you to accept.
          </p>
          <TransactionButton
            functionName="accept_agreement"
            args={[id]}
            label="Accept Agreement"
            onSuccess={refetch}
          />
        </div>
      )}

      {agreement.status === 0 && isClient && (
        <div className="glass-card rounded-xl p-5 mb-6">
          <p className="text-sm text-white/60 mb-3">
            Waiting for provider to accept. You can cancel this agreement.
          </p>
          <TransactionButton
            functionName="cancel_agreement"
            args={[id]}
            label="Cancel Agreement"
            variant="danger"
            onSuccess={refetch}
          />
        </div>
      )}

      {/* Milestones */}
      <h2 className="text-lg font-semibold mb-4">
        Milestones ({milestones.length})
      </h2>
      <div className="space-y-4">
        {milestones.map((ms, i) => (
          <div key={i} className="glass-card rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-mono text-white/40">
                    #{i + 1}
                  </span>
                  <MilestoneStatusBadge status={ms.status} />
                </div>
                <p className="text-sm font-medium">{ms.description}</p>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm">{ms.amount} USDC</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs text-white/40 mb-3">
              <div>
                <span className="block text-white/25">Monitoring URL</span>
                <a
                  href={ms.monitoring_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 hover:text-violet-300 break-all"
                >
                  {ms.monitoring_url}
                </a>
              </div>
              <div>
                <span className="block text-white/25">SLA Criteria</span>
                <span className="text-white/50">{ms.sla_criteria}</span>
              </div>
            </div>

            {/* Check results */}
            <div className="flex items-center gap-4 text-xs mb-4">
              <span className="text-green-400">
                {ms.pass_count} PASS
              </span>
              <span className="text-red-400">
                {ms.fail_count} FAIL
              </span>
              {ms.last_check_result && (
                <span
                  className="text-white/30 truncate max-w-xs cursor-help"
                  title={ms.last_check_result}
                >
                  Last: {ms.last_check_result}
                </span>
              )}
            </div>

            {/* Milestone actions */}
            {agreement.status === 1 && (
              <div className="flex gap-3 flex-wrap">
                {ms.status === 1 && (
                  <>
                    <TransactionButton
                      functionName="check_sla"
                      args={[id, i]}
                      label="Run SLA Check"
                      variant="secondary"
                      onSuccess={refetch}
                    />
                    {ms.pass_count + ms.fail_count >= 3 &&
                      ms.pass_count > ms.fail_count && (
                        <TransactionButton
                          functionName="verify_milestone"
                          args={[id, i]}
                          label="Verify Milestone"
                          onSuccess={refetch}
                        />
                      )}
                  </>
                )}

                {ms.status === 2 && isClient && (
                  <TransactionButton
                    functionName="release_payment"
                    args={[id, i]}
                    label="Release Payment"
                    onSuccess={refetch}
                  />
                )}

                {(ms.status === 1 || ms.status === 2) &&
                  (isClient || isProvider) && (
                    <DisputePanel
                      agreementId={id}
                      milestoneIndex={i}
                      onSuccess={refetch}
                    />
                  )}
              </div>
            )}

            {ms.status === 3 && (
              <div className="text-xs text-emerald-400 font-medium">
                Payment released
              </div>
            )}
            {ms.status === 4 && (
              <div className="mt-3 space-y-3">
                <div className="text-xs text-red-400 font-medium">
                  Disputed — awaiting resolution
                </div>
                {ms.dispute_reason && (
                  <div className="text-xs text-white/40">
                    <span className="text-white/25">Reason: </span>
                    {ms.dispute_reason}
                  </div>
                )}
                <CrossChainStatus agreementId={id} milestoneIndex={i} />
              </div>
            )}
            {ms.status === 5 && (
              <div className="text-xs text-gray-400 font-medium">
                Failed
              </div>
            )}
            {ms.status === 6 && (
              <CrossChainStatus agreementId={id} milestoneIndex={i} />
            )}
          </div>
        ))}
      </div>

      {/* Court case info + resolve */}
      {agreement.status === 3 && (
        <div className="glass-card rounded-xl p-5 mt-6 border-red-500/20">
          <h3 className="text-sm font-semibold text-red-400 mb-2">
            Dispute Active
          </h3>
          {agreement.court_case_id && (
            <p className="text-xs text-white/40 mb-3">
              Case ID: {agreement.court_case_id}
            </p>
          )}
          {(isClient || isProvider) && (
            <ResolvePanel
              agreementId={id}
              milestones={milestones}
              clientAddress={agreement.client}
              providerAddress={agreement.provider}
              onSuccess={refetch}
            />
          )}
        </div>
      )}

      {/* Progress Flow */}
      <AgreementFlow agreement={agreement} milestones={milestones} />
    </div>
  );
}
