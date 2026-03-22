"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface AgentWalletsContextValue {
  /** Map of agent name → public address (lowercased) */
  wallets: Record<string, string>;
  /** Check if an address belongs to a known agent wallet */
  isAgent: (address: string) => boolean;
  /** Get agent name for an address, or null */
  agentName: (address: string) => string | null;
}

const AgentWalletsContext = createContext<AgentWalletsContextValue>({
  wallets: {},
  isAgent: () => false,
  agentName: () => null,
});

export function AgentWalletsProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        if (data.agentWallets) {
          // Lowercase all addresses for comparison
          const normalized: Record<string, string> = {};
          for (const [name, addr] of Object.entries(data.agentWallets)) {
            normalized[name] = (addr as string).toLowerCase();
          }
          setWallets(normalized);
        }
      })
      .catch(() => {
        // health endpoint unreachable — no agent indicators
      });
  }, []);

  const isAgent = (address: string) => {
    const lower = address.toLowerCase();
    return Object.values(wallets).some((a) => a === lower);
  };

  const agentName = (address: string) => {
    const lower = address.toLowerCase();
    for (const [name, addr] of Object.entries(wallets)) {
      if (addr === lower) return name;
    }
    return null;
  };

  return (
    <AgentWalletsContext.Provider value={{ wallets, isAgent, agentName }}>
      {children}
    </AgentWalletsContext.Provider>
  );
}

export function useAgentWallets() {
  return useContext(AgentWalletsContext);
}
