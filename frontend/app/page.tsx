"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";

const FLOW_STEPS = [
  {
    id: "create",
    label: "Create Agreement",
    detail: "Client defines milestones, SLA criteria, and monitoring URLs",
    icon: "📝",
    color: "violet",
  },
  {
    id: "accept",
    label: "Provider Accepts",
    detail: "Provider reviews terms and accepts the escrow deal",
    icon: "🤝",
    color: "blue",
  },
  {
    id: "monitor",
    label: "AI SLA Monitoring",
    detail: "Validators fetch live URLs and evaluate compliance via LLM consensus",
    icon: "🔍",
    color: "cyan",
  },
  {
    id: "branch",
    label: "",
    detail: "",
    icon: "",
    color: "",
  },
  // Happy path
  {
    id: "verify",
    label: "Verify & Pay",
    detail: "SLA passes verified, payment auto-released to provider",
    icon: "✅",
    color: "green",
    path: "happy",
  },
  // Dispute path
  {
    id: "dispute",
    label: "Dispute Filed",
    detail: "SLA failures detected, client disputes the milestone",
    icon: "⚠️",
    color: "red",
    path: "dispute",
  },
  {
    id: "court",
    label: "Internet Court",
    detail: "AI jury evaluates evidence from both parties",
    icon: "⚖️",
    color: "amber",
    path: "dispute",
  },
  {
    id: "verdict",
    label: "Verdict Applied",
    detail: "Binding verdict settles the escrow automatically",
    icon: "🏛️",
    color: "purple",
    path: "dispute",
  },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  violet: { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-400", glow: "shadow-violet-500/20" },
  blue: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", glow: "shadow-blue-500/20" },
  cyan: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400", glow: "shadow-cyan-500/20" },
  green: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-400", glow: "shadow-green-500/20" },
  red: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", glow: "shadow-red-500/20" },
  amber: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", glow: "shadow-amber-500/20" },
  purple: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", glow: "shadow-purple-500/20" },
};

function FlowNode({ step, active, visible }: { step: typeof FLOW_STEPS[0]; active: boolean; visible: boolean }) {
  const colors = COLOR_MAP[step.color] || COLOR_MAP.violet;
  return (
    <div
      className={`flow-node ${colors.bg} ${colors.border} border rounded-xl p-4 transition-all duration-500 ${
        visible ? "opacity-100" : "opacity-0"
      } ${active ? `flow-active shadow-lg ${colors.glow}` : ""}`}
      style={{ animationDelay: "0s" }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{step.icon}</span>
        <div>
          <div className={`font-semibold text-sm ${colors.text}`}>{step.label}</div>
          <div className="text-xs text-white/40 mt-0.5">{step.detail}</div>
        </div>
      </div>
    </div>
  );
}

function AnimatedFlow() {
  const [activeStep, setActiveStep] = useState(0);
  const [showDispute, setShowDispute] = useState(false);

  const totalSteps = showDispute ? 8 : 5;

  const advance = useCallback(() => {
    setActiveStep((prev) => {
      const next = prev + 1;
      if (next >= totalSteps) {
        // Reset and toggle path
        setTimeout(() => {
          setShowDispute((d) => !d);
          setActiveStep(0);
        }, 2000);
        return prev;
      }
      // Skip branch node
      if (FLOW_STEPS[next]?.id === "branch") {
        return next + (showDispute ? 2 : 1);
      }
      return next;
    });
  }, [totalSteps, showDispute]);

  useEffect(() => {
    setActiveStep(0);
  }, [showDispute]);

  useEffect(() => {
    const timer = setInterval(advance, 2500);
    return () => clearInterval(timer);
  }, [advance]);

  // Map step index to the steps we actually show
  const visibleSteps = showDispute
    ? [
        FLOW_STEPS[0], // create
        FLOW_STEPS[1], // accept
        FLOW_STEPS[2], // monitor
        FLOW_STEPS[5], // dispute
        FLOW_STEPS[6], // court
        FLOW_STEPS[7], // verdict
      ]
    : [
        FLOW_STEPS[0], // create
        FLOW_STEPS[1], // accept
        FLOW_STEPS[2], // monitor
        FLOW_STEPS[4], // verify & pay
      ];

  // Map activeStep to the index in visibleSteps
  const activeIndex = (() => {
    if (!showDispute) {
      // happy: 0,1,2 map directly, then 4 maps to index 3
      if (activeStep <= 2) return activeStep;
      if (activeStep >= 4) return 3;
      return -1;
    } else {
      // dispute: 0,1,2 map directly, 5->3, 6->4, 7->5
      if (activeStep <= 2) return activeStep;
      if (activeStep === 5) return 3;
      if (activeStep === 6) return 4;
      if (activeStep === 7) return 5;
      return -1;
    }
  })();

  return (
    <div>
      {/* Path toggle */}
      <div className="flex items-center justify-center gap-3 mb-10">
        <button
          onClick={() => { setShowDispute(false); setActiveStep(0); }}
          className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-all ${
            !showDispute
              ? "bg-green-500/15 border-green-500/30 text-green-400"
              : "bg-white/5 border-white/10 text-white/40 hover:text-white/60"
          }`}
        >
          Happy Path
        </button>
        <button
          onClick={() => { setShowDispute(true); setActiveStep(0); }}
          className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-all ${
            showDispute
              ? "bg-red-500/15 border-red-500/30 text-red-400"
              : "bg-white/5 border-white/10 text-white/40 hover:text-white/60"
          }`}
        >
          Dispute Path
        </button>
      </div>

      {/* Flow */}
      <div className="flex flex-col gap-3 max-w-lg mx-auto">
        {visibleSteps.map((step, i) => (
          <div key={step.id}>
            {i > 0 && (
              <div className="flex justify-center py-1">
                <div
                  className={`w-px h-6 transition-all duration-500 ${
                    i <= activeIndex ? "bg-white/20" : "bg-white/5"
                  }`}
                />
              </div>
            )}

            {/* Branch indicator */}
            {i === 3 && (
              <div className="flex justify-center mb-2">
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  showDispute
                    ? "text-red-400/60 border-red-500/20 bg-red-500/5"
                    : "text-green-400/60 border-green-500/20 bg-green-500/5"
                }`}>
                  {showDispute ? "SLA FAILED" : "SLA PASSED"}
                </span>
              </div>
            )}

            <FlowNode
              step={step}
              active={i === activeIndex}
              visible={i <= activeIndex + 1}
            />
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-8 text-[10px] text-white/30">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-violet-500/40" />
          Agent action
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-cyan-500/40" />
          AI validator consensus
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500/40" />
          Internet Court
        </span>
      </div>
    </div>
  );
}

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
              <Link
                href="/demo"
                className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-lg font-semibold border border-white/10 transition-colors"
              >
                Run Live Demo
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

      {/* Animated Flow */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-bold mb-4 text-center">How it works</h2>
        <p className="text-white/40 text-sm text-center mb-10 max-w-lg mx-auto">
          Two AI agents negotiate and complete a deal autonomously.
          Toggle between the happy path and dispute resolution flow.
        </p>
        <AnimatedFlow />
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
