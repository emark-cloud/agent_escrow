"use client";
import { useState } from "react";
import { sendWriteTransaction, waitForTransaction } from "@/lib/genlayer";
import { mapToUserFriendlyError } from "@/lib/errors";
import type { Milestone } from "@/types/agreement";

interface Props {
  agreementId: string;
  milestoneIndex: number;
  milestone: Milestone;
  isClient: boolean;
  isProvider: boolean;
  onSuccess?: () => void;
}

export function EvidencePanel({
  agreementId,
  milestoneIndex,
  milestone,
  isClient,
  isProvider,
  onSuccess,
}: Props) {
  const [evidence, setEvidence] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const alreadySubmitted =
    (isClient && milestone.evidence_client) ||
    (isProvider && milestone.evidence_provider);

  const handleSubmit = async () => {
    if (!evidence.trim()) {
      setError("Please provide evidence");
      return;
    }

    setPending(true);
    setError("");
    setStatus("Submitting evidence...");

    try {
      const hash = await sendWriteTransaction("submit_evidence", [
        agreementId,
        milestoneIndex,
        evidence,
      ]);
      setStatus("Waiting for consensus...");
      await waitForTransaction(hash);
      setStatus("Evidence submitted!");
      onSuccess?.();
    } catch (err) {
      const friendly = mapToUserFriendlyError(err);
      setError(`${friendly.title}: ${friendly.message}`);
      setStatus("");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-2">
      {milestone.evidence_client && (
        <div className="p-3 bg-white/5 rounded-lg">
          <div className="text-xs text-white/25 mb-1">Client Evidence</div>
          <p className="text-xs text-white/60">{milestone.evidence_client}</p>
        </div>
      )}
      {milestone.evidence_provider && (
        <div className="p-3 bg-white/5 rounded-lg">
          <div className="text-xs text-white/25 mb-1">Provider Evidence</div>
          <p className="text-xs text-white/60">{milestone.evidence_provider}</p>
        </div>
      )}

      {(isClient || isProvider) && !alreadySubmitted && (
        <div className="p-3 bg-white/5 rounded-lg">
          <div className="text-xs text-white/40 mb-2">Submit your evidence</div>
          <textarea
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="Describe your evidence for this dispute..."
            rows={3}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-violet-500 resize-none mb-2"
          />
          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
          {status && <p className="text-xs text-violet-400 mb-2">{status}</p>}
          <button
            onClick={handleSubmit}
            disabled={pending}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {pending ? "Submitting..." : "Submit Evidence"}
          </button>
        </div>
      )}
    </div>
  );
}
