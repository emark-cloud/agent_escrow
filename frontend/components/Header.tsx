"use client";
import Link from "next/link";
import { ConnectWallet } from "./ConnectWallet";
import NetworkSwitcher from "./NetworkSwitcher";

export function Header() {
  return (
    <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            AE
          </div>
          <span className="text-lg font-bold text-white">AgentEscrow</span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link
            href="/marketplace"
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            Marketplace
          </Link>
          <Link
            href="/agreements"
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            Agreements
          </Link>
          <Link
            href="/demo"
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            Demo
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/agents"
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            Agents
          </Link>
          <NetworkSwitcher />
          <ConnectWallet />
        </nav>
      </div>
    </header>
  );
}
