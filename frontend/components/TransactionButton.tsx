"use client";
import { useState, useCallback } from "react";
import { sendWriteTransaction, waitForTransaction } from "@/lib/genlayer";
import type { ConsensusStatus } from "@/lib/genlayer";
import { mapToUserFriendlyError } from "@/lib/errors";
import { ConsensusTracker } from "./ConsensusTracker";
import { useNetwork } from "@/hooks/useNetwork";
import type { CalldataEncodable } from "genlayer-js/types";

interface Props {
  functionName: string;
  args: CalldataEncodable[];
  label: string;
  onSuccess?: () => void;
  className?: string;
  disabled?: boolean;
  variant?: "primary" | "danger" | "secondary";
}

export function TransactionButton({
  functionName,
  args,
  label,
  onSuccess,
  className = "",
  disabled = false,
  variant = "primary",
}: Props) {
  const { config } = useNetwork();
  const [pending, setPending] = useState(false);
  const [consensus, setConsensus] = useState<ConsensusStatus | null>(null);
  const [error, setError] = useState("");
  const [l1Hash, setL1Hash] = useState("");

  const variantClasses = {
    primary: "bg-violet-600 hover:bg-violet-500",
    danger: "bg-red-600 hover:bg-red-500",
    secondary: "bg-white/10 hover:bg-white/20 border border-white/20",
  };

  const handleStatus = useCallback((s: ConsensusStatus) => {
    setConsensus(s);
  }, []);

  const handleClick = async () => {
    setPending(true);
    setError("");
    setConsensus(null);

    try {
      const hash = await sendWriteTransaction(functionName, args, config);
      setL1Hash(hash);
      await waitForTransaction(hash, 200, 5000, handleStatus, config);
      onSuccess?.();
      setTimeout(() => {
        setConsensus(null);
        setL1Hash("");
      }, 5000);
    } catch (err) {
      const friendly = mapToUserFriendlyError(err);
      setError(`${friendly.title}: ${friendly.message}`);
    } finally {
      setPending(false);
    }
  };

  const handleRetry = async () => {
    if (!l1Hash) return;
    setPending(true);
    setError("");
    setConsensus(null);

    try {
      const hash = await sendWriteTransaction(functionName, args, config);
      setL1Hash(hash);
      await waitForTransaction(hash, 200, 5000, handleStatus, config);
      onSuccess?.();
      setTimeout(() => {
        setConsensus(null);
        setL1Hash("");
      }, 5000);
    } catch (err) {
      const friendly = mapToUserFriendlyError(err);
      setError(`${friendly.title}: ${friendly.message}`);
    } finally {
      setPending(false);
    }
  };

  const showRetry =
    !pending &&
    consensus?.stage === "leader_timeout" &&
    error.includes("resubmit");

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        disabled={disabled || pending}
        className={`px-4 py-2.5 rounded-lg font-medium text-sm text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      >
        {pending ? "Processing..." : label}
      </button>

      {consensus && <ConsensusTracker status={consensus} />}

      {showRetry && (
        <button
          onClick={handleRetry}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium transition-colors"
        >
          Resubmit Transaction
        </button>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
