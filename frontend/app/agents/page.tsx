"use client";
import { useState, useEffect, useCallback } from "react";

interface Agent {
  name: string;
  address: string;
  source: "env" | "config";
}

export default function AgentsPage() {
  const [apiKey, setApiKey] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [name, setName] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load API key from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("agentEscrow_apiKey");
    if (saved) setApiKey(saved);
  }, []);

  // Save API key to localStorage
  useEffect(() => {
    if (apiKey) localStorage.setItem("agentEscrow_apiKey", apiKey);
  }, [apiKey]);

  const fetchAgents = useCallback(async () => {
    if (!apiKey) return;
    try {
      const res = await fetch("/api/agents", {
        headers: { "x-api-key": apiKey },
      });
      if (!res.ok) {
        if (res.status === 401) setError("Invalid API key");
        return;
      }
      const data = await res.json();
      setAgents(data.agents);
      setError("");
    } catch {
      setError("Failed to fetch agents");
    }
  }, [apiKey]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) {
      setError("Enter your API key first");
      return;
    }
    if (!name || !privateKey) {
      setError("Name and private key are required");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ name, privateKey }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add agent");
        return;
      }

      setSuccess(`Added agent "${data.name}" (${data.address})`);
      setName("");
      setPrivateKey("");
      fetchAgents();
    } catch {
      setError("Failed to add agent");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (agentName: string) => {
    if (!confirm(`Remove agent "${agentName}"?`)) return;

    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/agents", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ name: agentName }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to remove agent");
        return;
      }

      setSuccess(`Removed agent "${agentName}"`);
      fetchAgents();
    } catch {
      setError("Failed to remove agent");
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Agent Wallets</h1>
      <p className="text-white/40 mb-8">
        Manage agent wallets used for API transactions. Agents configured via
        environment variables are read-only.
      </p>

      {/* API Key */}
      <div className="glass-card rounded-xl p-6 mb-8">
        <label className="block text-sm text-white/60 mb-1">API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your API key to manage agents"
          className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-violet-500"
        />
        <p className="text-xs text-white/25 mt-1">
          Saved in browser localStorage. Required for all operations.
        </p>
      </div>

      {/* Add Agent */}
      <div className="glass-card rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Add Agent</h2>
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-sm text-white/60 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. alice, bob, agent_1"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-violet-500"
            />
            <p className="text-xs text-white/25 mt-1">
              Alphanumeric and underscores only. Used as the x-wallet-id header
              value.
            </p>
          </div>
          <div>
            <label className="block text-sm text-white/60 mb-1">
              Private Key
            </label>
            <input
              type="password"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="0x..."
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-violet-500 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !apiKey}
            className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Adding..." : "Add Agent"}
          </button>
        </form>
      </div>

      {/* Status messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-400">
          {success}
        </div>
      )}

      {/* Agent List */}
      <div className="glass-card rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Configured Agents</h2>
        {agents.length === 0 ? (
          <p className="text-sm text-white/30">
            {apiKey
              ? "No agents configured yet."
              : "Enter your API key to view agents."}
          </p>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <div
                key={agent.name}
                className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{agent.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        agent.source === "env"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-violet-500/20 text-violet-400"
                      }`}
                    >
                      {agent.source}
                    </span>
                  </div>
                  <p className="text-xs text-white/40 font-mono mt-0.5 truncate">
                    {agent.address}
                  </p>
                </div>
                {agent.source === "config" && (
                  <button
                    onClick={() => handleRemove(agent.name)}
                    className="ml-4 text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
