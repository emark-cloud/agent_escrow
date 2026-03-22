"use client";
import { WalletProvider } from "@/hooks/useWallet";

export function Providers({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
