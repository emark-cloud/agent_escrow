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
      const agRaw = await readContract<Record<string, unknown>>("get_agreement", [agreementId]);
      const ag: Agreement = {
        agreement_id: String(agRaw.agreement_id ?? ""),
        client: String(agRaw.client ?? ""),
        provider: String(agRaw.provider ?? ""),
        description: String(agRaw.description ?? ""),
        total_amount: Number(agRaw.total_amount ?? 0),
        milestone_count: Number(agRaw.milestone_count ?? 0),
        status: Number(agRaw.status ?? 0),
        court_case_id: String(agRaw.court_case_id ?? ""),
      };
      setAgreement(ag);

      const msRaws = await Promise.all(
        Array.from({ length: ag.milestone_count }, (_, i) =>
          readContract<Record<string, unknown>>("get_milestone", [agreementId, i])
        )
      );
      setMilestones(
        msRaws.map((mRaw) => ({
          description: String(mRaw.description ?? ""),
          monitoring_url: String(mRaw.monitoring_url ?? ""),
          sla_criteria: String(mRaw.sla_criteria ?? ""),
          amount: Number(mRaw.amount ?? 0),
          pass_count: Number(mRaw.pass_count ?? 0),
          fail_count: Number(mRaw.fail_count ?? 0),
          status: Number(mRaw.status ?? 0),
          last_check_result: String(mRaw.last_check_result ?? ""),
          dispute_reason: String(mRaw.dispute_reason ?? ""),
          evidence_client: String(mRaw.evidence_client ?? ""),
          evidence_provider: String(mRaw.evidence_provider ?? ""),
        }))
      );
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
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!address) {
      setAgreements([]);
      setLoading(false);
      return;
    }
    try {
      const ids = await readContract<string[]>("get_agreements_by_address", [address]);
      const uniqueIds = [...new Set(ids)];

      const results = await Promise.all(
        uniqueIds.map(async (id) => {
          try {
            const agRaw = await readContract<Record<string, unknown>>("get_agreement", [id]);
            return {
              agreement_id: String(agRaw.agreement_id ?? ""),
              client: String(agRaw.client ?? ""),
              provider: String(agRaw.provider ?? ""),
              description: String(agRaw.description ?? ""),
              total_amount: Number(agRaw.total_amount ?? 0),
              milestone_count: Number(agRaw.milestone_count ?? 0),
              status: Number(agRaw.status ?? 0),
              court_case_id: String(agRaw.court_case_id ?? ""),
            } as Agreement;
          } catch {
            return null;
          }
        })
      );
      setAgreements(results.filter((r): r is Agreement => r !== null));
      setError(null);
    } catch (err) {
      setAgreements([]);
      setError(err instanceof Error ? err.message : "Failed to load agreements");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 10000);
    return () => clearInterval(interval);
  }, [fetch]);

  return { agreements, loading, error, refetch: fetch };
}

export function useAllAgreements(enabled: boolean) {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!enabled) {
      setAgreements([]);
      setLoading(false);
      return;
    }
    try {
      const raw = await readContract<string>("get_all_agreement_ids", []);
      const ids = raw ? (Array.isArray(raw) ? raw : raw.split(",")) : [];
      const uniqueIds = [...new Set(ids.filter(Boolean))];

      const results = await Promise.all(
        uniqueIds.map(async (id) => {
          try {
            const agRaw = await readContract<Record<string, unknown>>("get_agreement", [id]);
            return {
              agreement_id: String(agRaw.agreement_id ?? ""),
              client: String(agRaw.client ?? ""),
              provider: String(agRaw.provider ?? ""),
              description: String(agRaw.description ?? ""),
              total_amount: Number(agRaw.total_amount ?? 0),
              milestone_count: Number(agRaw.milestone_count ?? 0),
              status: Number(agRaw.status ?? 0),
              court_case_id: String(agRaw.court_case_id ?? ""),
            } as Agreement;
          } catch {
            return null;
          }
        })
      );
      setAgreements(results.filter((r): r is Agreement => r !== null));
      setError(null);
    } catch (err) {
      setAgreements([]);
      setError(err instanceof Error ? err.message : "Failed to load agreements");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 10000);
    return () => clearInterval(interval);
  }, [fetch]);

  return { agreements, loading, error, refetch: fetch };
}
