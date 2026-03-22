"use client";
import { useAgentWallets } from "@/hooks/useAgentWallets";

interface AgentBadgeProps {
  address: string;
  className?: string;
}

/**
 * Shows a small "Agent" badge with robot icon if the address belongs to
 * a known agent wallet (configured via WALLET_* env vars on the server).
 */
export function AgentBadge({ address, className = "" }: AgentBadgeProps) {
  const { isAgent, agentName } = useAgentWallets();

  if (!isAgent(address)) return null;

  const name = agentName(address);

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 ${className}`}
      title={name ? `Agent wallet: ${name}` : "Agent wallet"}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <rect x="3" y="5" width="10" height="8" rx="2" fill="currentColor" opacity="0.3" />
        <rect x="3" y="5" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="6" cy="9" r="1" fill="currentColor" />
        <circle cx="10" cy="9" r="1" fill="currentColor" />
        <path d="M8 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="1.5" r="1" fill="currentColor" />
        <path d="M1 8h2M13 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {name || "Agent"}
    </span>
  );
}
