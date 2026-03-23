"use client";
import { useState, useEffect, useCallback } from "react";
import { getConsensusStatus, type ConsensusStatus } from "@/lib/genlayer";

export interface AgentTx {
  agreementId: string;
  action: string;
  txHash: string;
  wallet: string;
  startedAt: number;
  consensus: ConsensusStatus | null;
}

export function useAgentActivity(agreementId: string) {
  const [activeTxs, setActiveTxs] = useState<AgentTx[]>([]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/agreements/${agreementId}/activity`);
      if (!res.ok) return;
      const { transactions } = await res.json();

      if (!transactions || transactions.length === 0) {
        setActiveTxs([]);
        return;
      }

      // For each active tx, get consensus status
      const withStatus = await Promise.all(
        transactions.map(async (tx: any) => {
          try {
            const consensus = await getConsensusStatus(tx.txHash, tx.glTxId);
            return { ...tx, consensus };
          } catch {
            return { ...tx, consensus: null };
          }
        })
      );

      setActiveTxs(withStatus);
    } catch {
      // endpoint unreachable
    }
  }, [agreementId]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [poll]);

  return activeTxs;
}
