"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import { useNetwork } from "@/hooks/useNetwork";
import { sendWriteTransaction, waitForTransaction, readContract } from "@/lib/genlayer";
import type { ConsensusStatus } from "@/lib/genlayer";
import { mapToUserFriendlyError } from "@/lib/errors";
import { ConsensusTracker } from "@/components/ConsensusTracker";
import type { MilestoneFormData } from "@/types/agreement";

const emptyMilestone: MilestoneFormData = {
  description: "",
  monitoring_url: "",
  sla_criteria: "",
  amount: "",
};

export default function CreateAgreement() {
  const { address, isConnected, openModal: connect } = useWallet();
  const { config } = useNetwork();
  const router = useRouter();

  const [agreementId, setAgreementId] = useState(
    () => `ag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const [provider, setProvider] = useState("");
  const [description, setDescription] = useState("");
  const [milestones, setMilestones] = useState<MilestoneFormData[]>([
    { ...emptyMilestone },
  ]);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [consensus, setConsensus] = useState<ConsensusStatus | null>(null);

  const updateMilestone = (
    index: number,
    field: keyof MilestoneFormData,
    value: string
  ) => {
    const updated = [...milestones];
    updated[index] = { ...updated[index], [field]: value };
    setMilestones(updated);
  };

  const addMilestone = () => {
    setMilestones([...milestones, { ...emptyMilestone }]);
  };

  const removeMilestone = (index: number) => {
    if (milestones.length <= 1) return;
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      connect();
      return;
    }

    // Validate
    if (!agreementId.trim()) {
      setError("Agreement ID is required");
      return;
    }
    if (!provider || !description) {
      setError("Provider address and description are required");
      return;
    }
    const addressRegex = /^0x[0-9a-fA-F]{40}$/;
    if (!addressRegex.test(provider)) {
      setError("Provider address must be a valid 0x address (42 characters)");
      return;
    }
    if (provider.toLowerCase() === address?.toLowerCase()) {
      setError("Provider cannot be the same as client");
      return;
    }

    for (const m of milestones) {
      if (!m.description || !m.monitoring_url || !m.sla_criteria || !m.amount) {
        setError("All milestone fields are required");
        return;
      }
    }

    for (const m of milestones) {
      if ([m.description, m.monitoring_url, m.sla_criteria, m.amount].some(f => f.includes("|"))) {
        setError("Milestone fields cannot contain the pipe character (|)");
        return;
      }
    }

    setPending(true);
    setError("");
    setStatus("Sending transaction...");

    try {
      // Pipe-separated milestone fields
      const msDescriptions = milestones.map((m) => m.description).join("|");
      const msUrls = milestones.map((m) => m.monitoring_url).join("|");
      const msCriteria = milestones.map((m) => m.sla_criteria).join("|");
      const msAmounts = milestones.map((m) => m.amount).join("|");

      const totalAmount = milestones.reduce(
        (sum, m) => sum + Number(m.amount || 0),
        0
      );

      const hash = await sendWriteTransaction("create_agreement", [
        agreementId,
        provider,
        description,
        msDescriptions,
        msUrls,
        msCriteria,
        msAmounts,
      ], config);

      setStatus("Waiting for consensus...");
      await waitForTransaction(hash, 200, 5000, (s) => setConsensus(s), config);

      setPending(false);
      setStatus("Agreement created! Redirecting...");

      // Try to get the created ID for redirect, but don't block on it
      let redirectId = agreementId;
      try {
        const createdId = await readContract<string>("get_last_created_id", [], config);
        if (createdId) redirectId = createdId;
      } catch {
        // use the local agreementId
      }
      setTimeout(() => router.push(`/agreements/${redirectId}`), 1500);
    } catch (err) {
      const friendly = mapToUserFriendlyError(err);
      setError(`${friendly.title}: ${friendly.message}`);
      setStatus("");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Create Agreement</h1>
      <p className="text-white/40 mb-8">
        Define an SLA-monitored escrow agreement between two AI agents.
      </p>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Info */}
        <div className="glass-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">Agreement Details</h2>

          <div>
            <label className="block text-sm text-white/60 mb-1">
              Agreement ID
            </label>
            <input
              type="text"
              value={agreementId}
              onChange={(e) => setAgreementId(e.target.value)}
              placeholder="ag-..."
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-violet-500"
            />
            <p className="text-xs text-white/25 mt-1">
              Auto-generated. You can customize it.
            </p>
          </div>

          <div>
            <label className="block text-sm text-white/60 mb-1">
              Provider Address
            </label>
            <input
              type="text"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="0x..."
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-sm text-white/60 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the service agreement..."
              rows={3}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>

          {address && (
            <p className="text-xs text-white/30">
              Client (you): {address}
            </p>
          )}
        </div>

        {/* Milestones */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Milestones</h2>
            <button
              type="button"
              onClick={addMilestone}
              className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
            >
              + Add Milestone
            </button>
          </div>

          {milestones.map((m, i) => (
            <div key={i} className="glass-card rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white/60">
                  Milestone {i + 1}
                </h3>
                {milestones.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMilestone(i)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={m.description}
                  onChange={(e) =>
                    updateMilestone(i, "description", e.target.value)
                  }
                  placeholder="e.g., Maintain 99.5% API uptime for 7 days"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1">
                  Monitoring URL
                </label>
                <input
                  type="url"
                  value={m.monitoring_url}
                  onChange={(e) =>
                    updateMilestone(i, "monitoring_url", e.target.value)
                  }
                  placeholder="https://status.example.com"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1">
                  SLA Criteria
                </label>
                <textarea
                  value={m.sla_criteria}
                  onChange={(e) =>
                    updateMilestone(i, "sla_criteria", e.target.value)
                  }
                  placeholder="e.g., All services showing 'Operational' status, no incidents in last 24 hours"
                  rows={2}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-violet-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1">
                  Payment Amount (USDC)
                </label>
                <input
                  type="number"
                  value={m.amount}
                  onChange={(e) =>
                    updateMilestone(i, "amount", e.target.value)
                  }
                  placeholder="1000"
                  min="1"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        {milestones.some((m) => m.amount) && (
          <div className="glass-card rounded-xl p-4 text-center">
            <span className="text-sm text-white/40">Total Escrow: </span>
            <span className="text-lg font-mono font-bold">
              {milestones.reduce(
                (sum, m) => sum + Number(m.amount || 0),
                0
              )}{" "}
              USDC
            </span>
          </div>
        )}

        {/* Submit */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        {consensus && <ConsensusTracker status={consensus} />}

        {status && !consensus && (
          <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-lg text-sm text-violet-300">
            {status}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending
            ? "Creating..."
            : isConnected
              ? "Create Agreement"
              : "Connect Wallet to Create"}
        </button>
      </form>
    </div>
  );
}
