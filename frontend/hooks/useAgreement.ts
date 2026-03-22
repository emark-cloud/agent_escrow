"use client";
import { useState, useEffect, useCallback } from "react";
import { readContract } from "@/lib/genlayer";
import type { Agreement, Milestone } from "@/types/agreement";

export function useAgreement(agreementId: string) {
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const ag = await readContract<Agreement>("get_agreement", [agreementId]);
      setAgreement(ag);

      const ms: Milestone[] = [];
      for (let i = 0; i < ag.milestone_count; i++) {
        const m = await readContract<Milestone>("get_milestone", [
          agreementId,
          i,
        ]);
        ms.push(m);
      }
      setMilestones(ms);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [agreementId]);

  useEffect(() => {
    fetch();
    // Poll every 5s for active agreements
    const interval = setInterval(fetch, 5000);
    return () => clearInterval(interval);
  }, [fetch]);

  return { agreement, milestones, loading, error, refetch: fetch };
}

export function useAgreementList(address: string | null) {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!address) {
      setAgreements([]);
      setLoading(false);
      return;
    }
    try {
      const idsCsv = await readContract<string>("get_agreements_by_address", [
        address,
      ]);
      const ids: string[] = idsCsv ? idsCsv.split(",").filter(Boolean) : [];
      const uniqueIds = [...new Set(ids)];

      const results: Agreement[] = [];
      for (const id of uniqueIds) {
        try {
          const ag = await readContract<Agreement>("get_agreement", [id]);
          results.push(ag);
        } catch {
          // skip invalid
        }
      }
      setAgreements(results);
    } catch {
      setAgreements([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 10000);
    return () => clearInterval(interval);
  }, [fetch]);

  return { agreements, loading, refetch: fetch };
}
