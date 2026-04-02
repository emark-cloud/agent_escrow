"use client";
import { useState, useEffect } from "react";
import { useNetwork } from "@/hooks/useNetwork";

interface ServiceListing {
  id: string;
  provider_agent: string;
  provider_address: string;
  category: string;
  title: string;
  description: string;
  monitoring_url: string;
  sla_criteria: string;
  price: string;
  status: "available" | "claimed" | "completed" | "failed";
  claimed_by?: string;
  agreement_id?: string;
  created_at: string;
}

interface MarketplaceEvent {
  timestamp: string;
  agent: string;
  type: string;
  details: string;
}

interface Stats {
  total: number;
  available: number;
  claimed: number;
  completed: number;
  failed: number;
}

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

const STATUS_STYLES: Record<string, string> = {
  available: "bg-green-500/15 text-green-400 border-green-500/30",
  claimed: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
};

const CATEGORY_LABELS: Record<string, string> = {
  "api-health": "API Health",
  "data-feed": "Data Feed",
  uptime: "Uptime",
  performance: "Performance",
};

function AgentBadge({ name }: { name: string }) {
  const color = AGENT_COLORS[name.toLowerCase()] || "bg-gray-500";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {name}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-white/40 mt-1">{label}</div>
    </div>
  );
}

function ListingCard({ listing }: { listing: ServiceListing }) {
  const statusStyle = STATUS_STYLES[listing.status] || STATUS_STYLES.available;
  const catLabel = CATEGORY_LABELS[listing.category] || listing.category;

  return (
    <div className="glass-card rounded-xl p-4 hover:bg-white/[0.04] transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{listing.title}</h3>
          <p className="text-xs text-white/40 mt-0.5 truncate">{listing.description}</p>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ml-2 shrink-0 ${statusStyle}`}>
          {listing.status}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-white/50 mb-3">
        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
          {catLabel}
        </span>
        <span className="font-mono">{listing.price} GEN</span>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-white/30">Provider:</span>
          <AgentBadge name={listing.provider_agent} />
        </div>
        {listing.claimed_by && (
          <div className="flex items-center gap-2">
            <span className="text-white/30">Client:</span>
            <AgentBadge name={listing.claimed_by} />
          </div>
        )}
      </div>

      {listing.agreement_id && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <a
            href={`/agreements/${listing.agreement_id}`}
            className="text-xs text-violet-400 hover:text-violet-300 font-mono"
          >
            {listing.agreement_id}
          </a>
        </div>
      )}

      <div className="mt-2 text-[10px] text-white/20 font-mono truncate">
        {listing.monitoring_url}
      </div>
    </div>
  );
}

function ActivityItem({ event }: { event: MarketplaceEvent }) {
  const agentColor = AGENT_TEXT_COLORS[event.agent.toLowerCase()] || "text-white/60";
  const time = new Date(event.timestamp).toLocaleTimeString();
  const icon =
    event.type === "listing_created" ? "+"
    : event.type === "listing_claimed" ? "→"
    : event.type === "deal_started" ? "⚡"
    : event.type === "deal_completed" ? "✓"
    : event.type === "dispute_filed" ? "⚠"
    : "•";

  return (
    <div className="flex items-start gap-2 text-xs py-1.5 border-b border-white/5 last:border-0">
      <span className="text-white/20 font-mono shrink-0 w-16">{time}</span>
      <span className="shrink-0 w-4 text-center">{icon}</span>
      <span className={`${agentColor} font-medium shrink-0`}>{event.agent}</span>
      <span className="text-white/50 truncate">{event.details}</span>
    </div>
  );
}

const AGENT_PROFILES = [
  { name: "Sentinel", role: "Provider", specialty: "API uptime monitoring", color: "violet" },
  { name: "Oracle", role: "Provider", specialty: "Data feed verification", color: "cyan" },
  { name: "Atlas", role: "Client", specialty: "Infrastructure monitoring", color: "amber" },
  { name: "Nexus", role: "Client", specialty: "SLA coverage", color: "emerald" },
  { name: "Catalyst", role: "Both", specialty: "Full-stack agent", color: "red" },
];

export default function MarketplacePage() {
  const { network } = useNetwork();
  const [listings, setListings] = useState<ServiceListing[]>([]);
  const [activity, setActivity] = useState<MarketplaceEvent[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, available: 0, claimed: 0, completed: 0, failed: 0 });
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    async function fetchData() {
      try {
        const headers = { "x-network": network };
        const [mktRes, actRes] = await Promise.all([
          fetch("/api/marketplace", { headers }),
          fetch("/api/marketplace/activity", { headers }),
        ]);
        if (mktRes.ok) {
          const mkt = await mktRes.json();
          setListings(mkt.listings || []);
          if (mkt.stats) setStats(mkt.stats);
        }
        if (actRes.ok) {
          const act = await actRes.json();
          setActivity((act.events || []).reverse());
        }
      } catch (e) {
        console.error("Marketplace fetch error:", e);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [network]);

  const filtered =
    filter === "all"
      ? listings
      : listings.filter((l) => l.status === filter);

  // Sort: newest first
  const sorted = [...filtered].reverse();

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Agent Marketplace</h1>
        <p className="text-white/40 text-sm">
          AI agents autonomously create, discover, and fulfill service monitoring deals.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        <StatCard label="Total Listings" value={stats.total} color="text-white" />
        <StatCard label="Available" value={stats.available} color="text-green-400" />
        <StatCard label="In Progress" value={stats.claimed} color="text-blue-400" />
        <StatCard label="Completed" value={stats.completed} color="text-emerald-400" />
        <StatCard label="Failed" value={stats.failed} color="text-red-400" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Listings (2 cols) */}
        <div className="lg:col-span-2">
          {/* Filter tabs */}
          <div className="flex items-center gap-2 mb-4">
            {["all", "available", "claimed", "completed", "failed"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  filter === f
                    ? "bg-white/10 border-white/20 text-white"
                    : "bg-white/5 border-white/10 text-white/40 hover:text-white/60"
                }`}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Listing grid */}
          {sorted.length === 0 ? (
            <div className="glass-card rounded-xl p-12 text-center">
              <p className="text-white/30 text-sm">
                No listings yet. Run <code className="text-violet-400">node marketplace-agents.js</code> to start the autonomous marketplace.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {sorted.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar: Activity + Agents */}
        <div className="space-y-6">
          {/* Agent Roster */}
          <div className="glass-card rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3">Agent Roster</h2>
            <div className="space-y-2">
              {AGENT_PROFILES.map((a) => {
                const agentListings = listings.filter(
                  (l) =>
                    l.provider_agent.toLowerCase() === a.name.toLowerCase() ||
                    l.claimed_by?.toLowerCase() === a.name.toLowerCase()
                );
                const active = agentListings.filter((l) => l.status === "claimed").length;
                const done = agentListings.filter(
                  (l) => l.status === "completed" || l.status === "failed"
                ).length;

                return (
                  <div
                    key={a.name}
                    className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                  >
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-${a.color}-500/20 text-${a.color}-400`}
                    >
                      {a.name[0]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold">{a.name}</div>
                      <div className="text-[10px] text-white/30">
                        {a.role} · {a.specialty}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono text-white/60">{active} active</div>
                      <div className="text-[10px] text-white/30">{done} done</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="glass-card rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3">Activity Feed</h2>
            {activity.length === 0 ? (
              <p className="text-xs text-white/30">No activity yet.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {activity.slice(0, 30).map((event, i) => (
                  <ActivityItem key={i} event={event} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
