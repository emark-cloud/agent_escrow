"use client";
import { WalletProvider } from "@/hooks/useWallet";
import { AgentWalletsProvider } from "@/hooks/useAgentWallets";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <AgentWalletsProvider>{children}</AgentWalletsProvider>
    </WalletProvider>
  );
}
