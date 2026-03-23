"use client";
import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";

export default function Home() {
  const { isConnected } = useWallet();

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-900/20 via-transparent to-transparent" />
        <div className="max-w-6xl mx-auto px-6 pt-24 pb-20 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/60 mb-6">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full pulse-dot" />
              Built on GenLayer
            </div>
            <h1 className="text-5xl sm:text-6xl font-bold leading-tight mb-6">
              Trustless SLA monitoring for{" "}
              <span className="gradient-text">AI agents</span>
            </h1>
            <p className="text-lg text-white/50 mb-10 max-w-xl leading-relaxed">
              The smart contract IS the SLA monitor. It fetches live web data,
              reasons about compliance with an LLM, and auto-releases payments
              or escalates disputes via Internet Court.
            </p>
            <div className="flex gap-4">
              <Link
                href="/create"
                className="px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-lg font-semibold transition-colors"
              >
                Create Agreement
              </Link>
              {isConnected && (
                <Link
                  href="/agreements"
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-lg font-semibold border border-white/10 transition-colors"
                >
                  My Agreements
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-bold mb-12 text-center">How it works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              step: "01",
              title: "Create Agreement",
              desc: "Define milestones with monitoring URLs and SLA criteria. The contract holds the escrow.",
            },
            {
              step: "02",
              title: "Live SLA Monitoring",
              desc: "The contract fetches real web data and uses AI to evaluate compliance. No oracles needed.",
            },
            {
              step: "03",
              title: "Auto-settle or Dispute",
              desc: "Passing SLAs trigger payment release. Failures escalate to Internet Court for AI jury verdict.",
            },
          ].map((item) => (
            <div key={item.step} className="glass-card rounded-xl p-6">
              <div className="text-sm font-mono text-violet-400 mb-3">
                {item.step}
              </div>
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-white/40 leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Key Features */}
      <section className="max-w-6xl mx-auto px-6 py-20 border-t border-white/5">
        <div className="grid md:grid-cols-2 gap-12">
          <div>
            <h3 className="text-xl font-bold mb-4">
              The contract IS the monitor
            </h3>
            <p className="text-white/40 leading-relaxed">
              Unlike traditional escrow, AgentEscrow doesn&apos;t rely on
              external oracles or manual verification. The GenLayer intelligent
              contract fetches live status pages, API endpoints, or any public
              URL and uses on-chain AI to determine SLA compliance.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-bold mb-4">
              Internet Court disputes
            </h3>
            <p className="text-white/40 leading-relaxed">
              When SLA checks fail, either party can escalate to Internet Court.
              An AI jury evaluates the evidence and delivers a binding verdict,
              automatically settling the escrow.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 mt-auto">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-white/30">
          <span>AgentEscrow — GenLayer Hackathon 2026</span>
          <span>Agentic Economy Infrastructure Track</span>
        </div>
      </footer>
    </div>
  );
}
