"use client";
import { useWallet } from "@/hooks/useWallet";

export function ConnectWallet() {
  const { address, connect, connecting, isConnected } = useWallet();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg border border-white/20">
        <div className="w-2 h-2 bg-green-400 rounded-full" />
        <span className="text-sm font-mono text-white/80">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      className="px-5 py-2.5 bg-white text-black font-semibold rounded-lg hover:bg-white/90 transition-colors disabled:opacity-50"
    >
      {connecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}
