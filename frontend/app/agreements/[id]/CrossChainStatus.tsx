"use client";
import { useState, useEffect } from "react";

interface BaseVerdict {
  agreementId: string;
  milestoneIndex: number;
  verdict: string;
  reasoningHash: string;
  timestamp: number;
  exists: boolean;
}

interface CrossChainData {
  enabled: boolean;
  message?: string;
  agreementId?: string;
  milestoneIndex?: number;
  base?: {
    chainId: number;
    registryAddress: string;
    explorerUrl: string;
    verdict: BaseVerdict | null;
    bridged: boolean;
  };
  bridge?: {
    genlayerBridgeSender: string;
    path: string;
  };
  stats?: {
    verdictCount: number;
    agreementCount: number;
  } | null;
}

interface Props {
  agreementId: string;
  milestoneIndex: number;
}

const CHAIN_HOPS = [
  { name: "GenLayer", color: "text-violet-400", icon: "GL" },
  { name: "zkSync Hub", color: "text-blue-400", icon: "ZK" },
  { name: "LayerZero V2", color: "text-yellow-400", icon: "LZ" },
  { name: "Base Sepolia", color: "text-sky-400", icon: "B" },
];

export function CrossChainStatus({ agreementId, milestoneIndex }: Props) {
  const [data, setData] = useState<CrossChainData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch(
          `/api/cross-chain/${agreementId}?milestone=${milestoneIndex}`
        );
        if (res.ok) {
          setData(await res.json());
        }
      } catch {
        // Silently fail — cross-chain is optional
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
  }, [agreementId, milestoneIndex]);

  if (loading) return null;
  if (!data || !data.enabled) return null;

  const bridged = data.base?.bridged;
  const verdict = data.base?.verdict;

  return (
    <div className="mt-4 border border-sky-500/20 rounded-lg p-4 bg-sky-500/5">
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-2 h-2 rounded-full ${bridged ? "bg-green-400" : "bg-yellow-400 animate-pulse"}`}
        />
        <h4 className="text-sm font-semibold text-sky-400">
          Cross-Chain Verdict
        </h4>
        <span className="text-xs text-white/30 ml-auto">Base Sepolia</span>
      </div>

      {/* Bridge path visualization */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto">
        {CHAIN_HOPS.map((hop, i) => (
          <div key={hop.name} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded ${
                bridged
                  ? "bg-white/5"
                  : i === 0
                    ? "bg-white/5"
                    : "bg-white/[0.02]"
              }`}
            >
              <span
                className={`text-[10px] font-bold ${bridged ? hop.color : i === 0 ? hop.color : "text-white/20"}`}
              >
                {hop.icon}
              </span>
              <span
                className={`text-[10px] ${bridged ? "text-white/50" : i === 0 ? "text-white/50" : "text-white/20"}`}
              >
                {hop.name}
              </span>
            </div>
            {i < CHAIN_HOPS.length - 1 && (
              <span
                className={`text-[10px] ${bridged ? "text-green-400" : "text-white/15"}`}
              >
                →
              </span>
            )}
          </div>
        ))}
      </div>

      {bridged && verdict ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-white/40">Verdict:</span>
            <span
              className={`font-medium ${
                verdict.verdict === "client"
                  ? "text-orange-400"
                  : verdict.verdict === "provider"
                    ? "text-green-400"
                    : "text-white/60"
              }`}
            >
              {verdict.verdict}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-white/40">Bridged:</span>
            <span className="text-white/60">
              {new Date(verdict.timestamp * 1000).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-white/40">Reasoning Hash:</span>
            <span className="font-mono text-white/40 text-[10px] truncate max-w-[200px]">
              {verdict.reasoningHash}
            </span>
          </div>
          {data.base?.explorerUrl && data.base.registryAddress && (
            <a
              href={`${data.base.explorerUrl}/address/${data.base.registryAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 mt-1"
            >
              View on Basescan
              <span className="text-[10px]">↗</span>
            </a>
          )}
        </div>
      ) : (
        <div className="text-xs text-white/30">
          Verdict not yet bridged to Base Sepolia. It will appear here after the
          relay service forwards it via LayerZero V2.
        </div>
      )}

      {data.stats && (
        <div className="flex gap-4 mt-3 pt-3 border-t border-white/5 text-[10px] text-white/25">
          <span>{data.stats.verdictCount} verdicts bridged</span>
          <span>{data.stats.agreementCount} agreements tracked</span>
        </div>
      )}
    </div>
  );
}
