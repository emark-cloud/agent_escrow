"use client";
import type { ConsensusStatus } from "@/lib/genlayer";

interface Props {
  status: ConsensusStatus | null;
}

const STAGES = [
  { key: "l1_pending", label: "L1 Confirmed" },
  { key: "pending", label: "Queued" },
  { key: "proposing", label: "Leader Executing" },
  { key: "committing", label: "Validators Voting" },
  { key: "revealing", label: "Revealing Votes" },
  { key: "accepted", label: "Consensus Reached" },
] as const;

function stageIndex(stage: string): number {
  const idx = STAGES.findIndex((s) => s.key === stage);
  if (stage === "finalized") return STAGES.length;
  if (stage === "leader_timeout") return 2; // stuck at proposing
  return idx >= 0 ? idx : 0;
}

export function ConsensusTracker({ status }: Props) {
  if (!status) return null;

  const current = stageIndex(status.stage);
  const isTimeout = status.stage === "leader_timeout";
  const isFailed = status.stage === "failed";
  const isDone = status.stage === "accepted" || status.stage === "finalized";

  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-lg space-y-3">
      {/* Progress steps */}
      <div className="flex items-center gap-1">
        {STAGES.map((stage, i) => {
          const completed = i < current;
          const active = i === current && !isDone;
          const done = isDone && i <= current;

          return (
            <div key={stage.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    done
                      ? "bg-green-500 text-white"
                      : completed
                        ? "bg-violet-500 text-white"
                        : active
                          ? isTimeout
                            ? "bg-amber-500 text-white animate-pulse"
                            : "bg-violet-500 text-white animate-pulse"
                          : "bg-white/10 text-white/30"
                  }`}
                >
                  {done ? "✓" : completed ? "✓" : i + 1}
                </div>
                <span
                  className={`text-[10px] mt-1 text-center leading-tight ${
                    done || completed || active
                      ? "text-white/70"
                      : "text-white/25"
                  }`}
                >
                  {stage.label}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div
                  className={`h-0.5 w-full min-w-2 mt-[-12px] ${
                    completed || done
                      ? "bg-violet-500"
                      : "bg-white/10"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Validator votes */}
      {(status.stage === "committing" || status.stage === "revealing") && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">Validators:</span>
          <div className="flex gap-1">
            {Array.from({ length: status.totalValidators }).map((_, i) => {
              const voted =
                status.stage === "committing"
                  ? i < status.votesCommitted
                  : i < status.votesRevealed;
              return (
                <div
                  key={i}
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] transition-colors ${
                    voted
                      ? "bg-violet-500 text-white"
                      : "bg-white/10 text-white/30"
                  }`}
                >
                  {voted ? "✓" : i + 1}
                </div>
              );
            })}
          </div>
          <span className="text-xs text-white/40">
            {status.stage === "committing"
              ? `${status.votesCommitted}/${status.totalValidators} committed`
              : `${status.votesRevealed}/${status.totalValidators} revealed`}
          </span>
        </div>
      )}

      {/* Recommendation */}
      <div
        className={`flex items-center gap-2 text-xs ${
          isTimeout || isFailed
            ? "text-amber-400"
            : isDone
              ? "text-green-400"
              : "text-violet-400"
        }`}
      >
        {!isDone && !isTimeout && !isFailed && (
          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {(isTimeout || isFailed) && <span>⚠</span>}
        {isDone && <span>✓</span>}
        {status.recommendation}
      </div>

      {/* GenLayer TxId */}
      {status.glTxId && (
        <div className="text-[10px] text-white/20 truncate">
          GL: {status.glTxId}
        </div>
      )}
    </div>
  );
}
