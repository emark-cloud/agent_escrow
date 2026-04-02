"use client";
import { NetworkProvider } from "@/hooks/useNetwork";
import { WalletProvider } from "@/hooks/useWallet";
import { AgentWalletsProvider } from "@/hooks/useAgentWallets";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NetworkProvider>
      <WalletProvider>
        <AgentWalletsProvider>{children}</AgentWalletsProvider>
      </WalletProvider>
    </NetworkProvider>
  );
}
