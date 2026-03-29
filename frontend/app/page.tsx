"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";

// --- Agent colors (shared with marketplace page) ---
const AGENT_COLORS: Record<string, string> = {
  sentinel: "bg-violet-500",
  oracle: "bg-cyan-500",
  atlas: "bg-amber-500",
  nexus: "bg-emerald-500",
  catalyst: "bg-red-500",
};
const AGENT_TEXT_COLORS: Record<string, string> = {
  sentinel: "text-violet-400",
  oracle: "text-cyan-400",
  atlas: "text-amber-400",
  nexus: "text-emerald-400",
  catalyst: "text-red-400",
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// --- Animated Flow (unchanged) ---
const FLOW_STEPS = [
  {
    id: "create",
    label: "Create Agreement",
    detail: "Client defines milestones, SLA criteria, and monitoring URLs",
    icon: "\u{1F4DD}",
    color: "violet",
  },
  {
    id: "accept",
    label: "Provider Accepts",
    detail: "Provider reviews terms and accepts the escrow deal",
    icon: "\u{1F91D}",
    color: "blue",
  },
  {
    id: "monitor",
    label: "AI SLA Monitoring",
    detail: "Validators fetch live URLs and evaluate compliance via LLM consensus",
    icon: "\u{1F50D}",
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
    icon: "\u2705",
    color: "green",
    path: "happy",
  },
  // Dispute path
  {
    id: "dispute",
    label: "Dispute Filed",
    detail: "SLA failures detected, client disputes the milestone",
    icon: "\u26A0\uFE0F",
    color: "red",
    path: "dispute",
  },
  {
    id: "court",
    label: "Internet Court",
    detail: "AI jury evaluates evidence from both parties",
    icon: "\u2696\uFE0F",
    color: "amber",
    path: "dispute",
  },
  {
    id: "verdict",
    label: "Verdict Applied",
    detail: "Binding verdict settles the escrow automatically",
    icon: "\u{1F3DB}\uFE0F",
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
        setTimeout(() => {
          setShowDispute((d) => !d);
          setActiveStep(0);
        }, 2000);
        return prev;
      }
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

  const visibleSteps = showDispute
    ? [FLOW_STEPS[0], FLOW_STEPS[1], FLOW_STEPS[2], FLOW_STEPS[5], FLOW_STEPS[6], FLOW_STEPS[7]]
    : [FLOW_STEPS[0], FLOW_STEPS[1], FLOW_STEPS[2], FLOW_STEPS[4]];

  const activeIndex = (() => {
    if (!showDispute) {
      if (activeStep <= 2) return activeStep;
      if (activeStep >= 4) return 3;
      return -1;
    } else {
      if (activeStep <= 2) return activeStep;
      if (activeStep === 5) return 3;
      if (activeStep === 6) return 4;
      if (activeStep === 7) return 5;
      return -1;
    }
  })();

  return (
    <div>
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

// --- Live Stats Bar ---
interface MarketplaceStats {
  total: number;
  available: number;
  claimed: number;
  completed: number;
  failed: number;
}

interface HealthData {
  agentWallets: Record<string, string>;
  rpcReachable: boolean;
}

interface ActivityEvent {
  timestamp: string;
  agent: string;
  type: string;
  details: string;
}

function StatPill({ value, label, color, loading }: { value: number; label: string; color: string; loading: boolean }) {
  return (
    <div className="text-center">
      {loading ? (
        <div className="h-7 w-10 bg-white/5 rounded animate-pulse mx-auto" />
      ) : (
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
      )}
      <div className="text-[10px] text-white/40 mt-1">{label}</div>
    </div>
  );
}

function LiveStatsBar({ stats, health }: { stats: MarketplaceStats | null; health: HealthData | null }) {
  const loading = stats === null;
  const agentCount = health ? Object.keys(health.agentWallets).length : 0;
  const rpcOk = health?.rpcReachable ?? false;

  return (
    <section className="max-w-6xl mx-auto px-6 -mt-8 mb-8 relative z-10">
      <div className="glass-card rounded-xl px-8 py-5 flex items-center justify-center gap-10 flex-wrap">
        <StatPill value={stats?.total ?? 0} label="Listings" color="text-white" loading={loading} />
        <div className="w-px h-8 bg-white/10 hidden sm:block" />
        <StatPill value={stats?.claimed ?? 0} label="Active Deals" color="text-blue-400" loading={loading} />
        <div className="w-px h-8 bg-white/10 hidden sm:block" />
        <StatPill value={stats?.completed ?? 0} label="Completed" color="text-emerald-400" loading={loading} />
        <div className="w-px h-8 bg-white/10 hidden sm:block" />
        <StatPill value={agentCount} label="AI Agents" color="text-violet-400" loading={loading} />
        <div className="w-px h-8 bg-white/10 hidden sm:block" />
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <span className={`w-2 h-2 rounded-full ${rpcOk ? "bg-green-400 pulse-dot" : "bg-amber-400"}`} />
            <span className={`text-sm font-medium ${rpcOk ? "text-green-400" : "text-amber-400"}`}>
              {rpcOk ? "Live" : "Offline"}
            </span>
          </div>
          <div className="text-[10px] text-white/40 mt-1">GenLayer</div>
        </div>
      </div>
    </section>
  );
}

// --- Features Grid ---
function FeatureCard({ icon, title, description, accent }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: string;
}) {
  return (
    <div className="glass-card rounded-xl p-6">
      <div className={`w-10 h-10 rounded-lg bg-${accent}-500/10 border border-${accent}-500/20 flex items-center justify-center mb-4`}>
        {icon}
      </div>
      <h3 className="text-lg font-bold mb-3">{title}</h3>
      <p className="text-sm text-white/40 leading-relaxed">{description}</p>
    </div>
  );
}

// --- Activity Ticker ---
function ActivityTicker({ events }: { events: ActivityEvent[] }) {
  const recent = [...events].reverse().slice(0, 8);

  return (
    <section className="max-w-6xl mx-auto px-6 py-16">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-bold">Live Activity</h2>
        {recent.length > 0 && (
          <span className="w-2 h-2 bg-green-400 rounded-full pulse-dot" />
        )}
      </div>

      <div className="glass-card rounded-xl p-5">
        {recent.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-4">
            No activity yet &mdash;{" "}
            <Link href="/demo" className="text-violet-400 hover:text-violet-300">
              start the demo
            </Link>{" "}
            to see agents transact in real time.
          </p>
        ) : (
          <div className="space-y-0">
            {recent.map((event, i) => {
              const agentKey = event.agent.toLowerCase();
              const dotColor = AGENT_COLORS[agentKey] || "bg-gray-500";
              const textColor = AGENT_TEXT_COLORS[agentKey] || "text-white/60";
              return (
                <div
                  key={`${event.timestamp}-${i}`}
                  className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                  <span className={`text-sm font-medium shrink-0 ${textColor}`}>{event.agent}</span>
                  <span className="text-sm text-white/40 truncate">{event.details}</span>
                  <span className="text-xs text-white/20 ml-auto whitespace-nowrap shrink-0">
                    {timeAgo(event.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// --- Main Page ---
export default function Home() {
  const { isConnected } = useWallet();
  const [stats, setStats] = useState<MarketplaceStats | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  // Fetch stats + health on mount, poll every 30s
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [mktRes, healthRes] = await Promise.all([
          fetch("/api/marketplace"),
          fetch("/api/health"),
        ]);
        if (mktRes.ok) {
          const mkt = await mktRes.json();
          if (mkt.stats) setStats(mkt.stats);
        }
        if (healthRes.ok) {
          const h = await healthRes.json();
          setHealth({ agentWallets: h.agentWallets || {}, rpcReachable: h.rpcReachable ?? false });
        }
      } catch (e) {
        console.error("Stats fetch error:", e);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch activity on mount, poll every 15s
  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const res = await fetch("/api/marketplace/activity");
        if (res.ok) {
          const data = await res.json();
          setActivity(data.events || []);
        }
      } catch (e) {
        console.error("Activity fetch error:", e);
      }
    };
    fetchActivity();
    const interval = setInterval(fetchActivity, 15000);
    return () => clearInterval(interval);
  }, []);

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
              The intelligent contract IS the SLA monitor. It fetches live web data,
              reasons about compliance with an LLM, and auto-releases payments
              or escalates disputes via Internet Court.
            </p>
            <div className="flex flex-wrap gap-4">
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

      {/* Live Stats Bar */}
      <LiveStatsBar stats={stats} health={health} />

      {/* Animated Flow */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl font-bold mb-4 text-center">How it works</h2>
        <p className="text-white/40 text-sm text-center mb-10 max-w-lg mx-auto">
          Two AI agents negotiate and complete a deal autonomously.
          Toggle between the happy path and dispute resolution flow.
        </p>
        <AnimatedFlow />
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-6 py-16 border-t border-white/5">
        <h2 className="text-2xl font-bold mb-8 text-center">What makes it different</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            accent="violet"
            icon={
              <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
            title="Contract-as-Monitor"
            description="No external oracles. The GenLayer intelligent contract fetches live URLs and uses on-chain AI consensus to determine SLA compliance."
          />
          <FeatureCard
            accent="amber"
            icon={
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
              </svg>
            }
            title="Internet Court"
            description="When disputes arise, an AI jury evaluates evidence from both parties and delivers a binding verdict that auto-settles the escrow."
          />
          <FeatureCard
            accent="emerald"
            icon={
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016A3.001 3.001 0 0021 9.349m-18 0a2.999 2.999 0 013-2.599h12a2.999 2.999 0 013 2.599" />
              </svg>
            }
            title="Autonomous Marketplace"
            description="5 AI agents autonomously discover, negotiate, and transact monitoring services. Providers list capabilities, clients claim deals."
          />
          <FeatureCard
            accent="sky"
            icon={
              <svg className="w-5 h-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            }
            title="Cross-Chain Verdicts"
            description="AI jury verdicts bridge from GenLayer to Base Sepolia via relay service, providing verifiable on-chain proof of dispute outcomes."
          />
          <FeatureCard
            accent="cyan"
            icon={
              <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
              </svg>
            }
            title="MCP Integration"
            description="13 tools via Model Context Protocol let any AI agent create agreements, check SLA status, and manage escrow programmatically."
          />
        </div>
      </section>

      {/* Live Activity Ticker */}
      <ActivityTicker events={activity} />

      {/* See It Live CTA */}
      <section className="max-w-6xl mx-auto px-6 py-20 border-t border-white/5">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">
            See the <span className="gradient-text">autonomous economy</span> in action
          </h2>
          <p className="text-white/40 mb-8 leading-relaxed">
            5 AI agents are discovering services, negotiating deals, and resolving
            disputes. Watch them transact on the marketplace or trigger
            a full demo cycle.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/marketplace"
              className="px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-lg font-semibold transition-colors"
            >
              Browse Marketplace
            </Link>
            <Link
              href="/demo"
              className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-lg font-semibold border border-white/10 transition-colors"
            >
              Run Live Demo
            </Link>
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
