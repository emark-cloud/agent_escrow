"use client";
import { useState } from "react";
import { sendWriteTransaction, waitForTransaction } from "@/lib/genlayer";
import { mapToUserFriendlyError } from "@/lib/errors";

interface Props {
  agreementId: string;
  milestoneIndex: number;
  onSuccess?: () => void;
}

export function DisputePanel({ agreementId, milestoneIndex, onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const handleDispute = async () => {
    if (!reason.trim()) {
      setError("Please provide a reason for the dispute");
      return;
    }

    setPending(true);
    setError("");
    setStatus("Sending dispute...");

    try {
      const hash = await sendWriteTransaction("dispute_milestone", [
        agreementId,
        milestoneIndex,
        reason,
      ]);
      setStatus("Waiting for consensus...");
      await waitForTransaction(hash);
      setStatus("Dispute filed!");
      onSuccess?.();
      setTimeout(() => {
        setOpen(false);
        setStatus("");
      }, 2000);
    } catch (err) {
      const friendly = mapToUserFriendlyError(err);
      setError(`${friendly.title}: ${friendly.message}`);
      setStatus("");
    } finally {
      setPending(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-lg transition-colors"
      >
        Dispute
      </button>
    );
  }

  return (
    <div className="w-full mt-3 p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
      <h4 className="text-sm font-semibold text-red-400 mb-2">
        Dispute Milestone #{milestoneIndex + 1}
      </h4>

      {!confirmed ? (
        <>
          <p className="text-xs text-white/40 mb-3">
            This will mark the milestone as disputed and pause payment processing.
            Both parties can then submit evidence before resolution.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmed(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors"
            >
              I understand, continue
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe why this milestone should be disputed..."
            rows={3}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-red-500 resize-none mb-3"
          />
          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
          {status && <p className="text-xs text-violet-400 mb-2">{status}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleDispute}
              disabled={pending}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {pending ? "Processing..." : "File Dispute"}
            </button>
            <button
              onClick={() => { setOpen(false); setConfirmed(false); }}
              disabled={pending}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
