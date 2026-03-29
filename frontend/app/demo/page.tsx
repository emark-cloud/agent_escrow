"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  HEALTH_STEP,
  HAPPY_STEPS,
  DISPUTE_STEPS,
  resolveEndpoint,
  resolveBody,
  type DemoStep,
  type DemoContext,
  type StepResult,
  type StepStatus,
} from "@/lib/demoSteps";

type Flow = "happy" | "dispute" | "full";

interface RunningStep {
  index: number;
  startTime: number;
}

const AGENT_COLORS: Record<string, string> = {
  alice: "text-blue-400 bg-blue-500/15 border-blue-500/20",
  bob: "text-green-400 bg-green-500/15 border-green-500/20",
  system: "text-cyan-400 bg-cyan-500/15 border-cyan-500/20",
};

const PHASE_LABELS: Record<string, string> = {
  health: "Setup",
  happy: "Happy Path",
  dispute: "Dispute Path",
};

function isRetryable(status: number, data: any): boolean {
  if (status === 500) {
    const msg = (data?.error || "").toLowerCase();
    if (
      msg.includes("leader timed out") ||
      msg.includes("transaction timed out") ||
      msg.includes("timed out") ||
      msg.includes("took too long") ||
      msg.includes("fetch failed")
    )
      return true;
  }
  return false;
}

export default function DemoPage() {
  const [apiKey, setApiKey] = useState("");
  const [flow, setFlow] = useState<Flow>("full");
  const [steps, setSteps] = useState<(DemoStep & { result: StepResult })[]>([]);
  const [context, setContext] = useState<DemoContext>({
    happyId: "",
    disputeId: "",
    aliceAddr: "",
    bobAddr: "",
    icAddress: "",
  });
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [runningStep, setRunningStep] = useState<RunningStep | null>(null);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const abortRef = useRef(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const totalStartRef = useRef(0);

  // Load API key from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("agentEscrow_apiKey");
    if (saved) setApiKey(saved);
  }, []);

  useEffect(() => {
    if (apiKey) localStorage.setItem("agentEscrow_apiKey", apiKey);
  }, [apiKey]);

  // Restore scripted demo state from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("agentEscrow_demoState");
      if (!saved) return;
      const state = JSON.parse(saved);
      if (state.steps?.length > 0) {
        // Mark any "running" steps as interrupted
        const restored = state.steps.map((s: any) => ({
          ...s,
          result: s.result.status === "running"
            ? { ...s.result, status: "failed", error: "Interrupted — navigated away" }
            : s.result,
        }));
        setSteps(restored);
        setContext(state.context);
        setFlow(state.flow);
        setTotalElapsed(state.totalElapsed || 0);
        setIsDone(state.isDone || false);
        // If it was running, mark remaining pending steps as skipped
        if (state.isRunning) {
          setSteps((prev) =>
            prev.map((s) =>
              s.result.status === "pending"
                ? { ...s, result: { status: "skipped" as StepStatus } }
                : s
            )
          );
          setIsDone(true);
        }
      }
    } catch {}
  }, []);

  // Persist scripted demo state to sessionStorage
  useEffect(() => {
    if (steps.length === 0) return;
    try {
      // Strip response data to keep storage small — keep only status, elapsed, error, httpCode
      const lightweight = steps.map((s) => ({
        ...s,
        extractors: undefined,
        result: {
          status: s.result.status,
          elapsed: s.result.elapsed,
          error: s.result.error,
          httpCode: s.result.httpCode,
          retries: s.result.retries,
        },
      }));
      sessionStorage.setItem(
        "agentEscrow_demoState",
        JSON.stringify({ steps: lightweight, context, flow, isRunning, isDone, totalElapsed })
      );
    } catch {}
  }, [steps, context, flow, isRunning, isDone, totalElapsed]);

  // Elapsed timer
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setTotalElapsed(Math.floor((Date.now() - totalStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Auto-scroll to running step
  useEffect(() => {
    if (runningStep !== null) {
      const el = document.getElementById(`step-${runningStep.index}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [runningStep]);

  const buildSteps = useCallback((selectedFlow: Flow): DemoStep[] => {
    const allSteps: DemoStep[] = [HEALTH_STEP];
    if (selectedFlow === "happy" || selectedFlow === "full") {
      allSteps.push(...HAPPY_STEPS);
    }
    if (selectedFlow === "dispute" || selectedFlow === "full") {
      allSteps.push(...DISPUTE_STEPS);
    }
    return allSteps;
  }, []);

  async function apiCall(
    step: DemoStep,
    ctx: DemoContext,
    key: string,
  ): Promise<{ httpCode: number; data: any; retries: number }> {
    const maxRetries = 3;
    let lastData: any;
    let lastStatus = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const endpoint = resolveEndpoint(step, ctx);
      const body = resolveBody(step, ctx);
      const isPost = step.method === "POST";
      const shouldWait = step.wait !== false && isPost;
      const url = `${endpoint}${shouldWait ? "?wait=true" : ""}`;

      const headers: Record<string, string> = {
        "x-api-key": key,
        "Content-Type": "application/json",
      };
      if (step.walletId) headers["x-wallet-id"] = step.walletId;

      const opts: RequestInit = {
        method: step.method,
        headers,
        signal: AbortSignal.timeout(600_000),
      };
      if (body && isPost) opts.body = JSON.stringify(body);

      const resp = await fetch(url, opts);
      lastStatus = resp.status;
      lastData = await resp.json().catch(() => ({}));

      if (resp.ok) return { httpCode: lastStatus, data: lastData, retries: attempt - 1 };

      if (attempt < maxRetries && isRetryable(lastStatus, lastData)) {
        continue;
      }
      break;
    }
    return { httpCode: lastStatus, data: lastData, retries: 0 };
  }

  async function runDemo() {
    abortRef.current = false;
    setIsRunning(true);
    setIsDone(false);
    totalStartRef.current = Date.now();

    const runId = String(Date.now() % 10_000_000);
    const ctx: DemoContext = {
      happyId: `demo-happy-${runId}`,
      disputeId: `demo-dispute-${runId}`,
      aliceAddr: "",
      bobAddr: "",
      icAddress: "",
    };
    setContext(ctx);

    const stepDefs = buildSteps(flow);
    const initial = stepDefs.map((s) => ({
      ...s,
      result: { status: "pending" as StepStatus },
    }));
    setSteps(initial);

    for (let i = 0; i < stepDefs.length; i++) {
      if (abortRef.current) {
        setSteps((prev) =>
          prev.map((s, j) =>
            j >= i ? { ...s, result: { status: "skipped" } } : s
          )
        );
        break;
      }

      const step = stepDefs[i];
      const startTime = Date.now();
      setRunningStep({ index: i, startTime });

      // Set running
      setSteps((prev) =>
        prev.map((s, j) =>
          j === i ? { ...s, result: { status: "running" } } : s
        )
      );

      try {
        const { httpCode, data, retries } = await apiCall(step, ctx, apiKey);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const ok = httpCode >= 200 && httpCode < 400;

        // Run extractors to update context
        if (ok && step.extractors) {
          for (const [key, fn] of Object.entries(step.extractors)) {
            const val = fn(data);
            if (val) {
              ctx[key] = val;
              setContext({ ...ctx });
            }
          }
        }

        const result: StepResult = {
          status: ok ? "success" : step.canFail ? "success" : "failed",
          httpCode,
          response: data,
          elapsed,
          retries,
        };

        // For canFail steps, mark as success but note the execution error if any
        if (step.canFail && !ok) {
          result.status = "success";
          result.error = data?.executionError || data?.error || `HTTP ${httpCode}`;
        }

        setSteps((prev) =>
          prev.map((s, j) => (j === i ? { ...s, result } : s))
        );

        // Stop on non-canFail failure
        if (!ok && !step.canFail) {
          setSteps((prev) =>
            prev.map((s, j) =>
              j > i ? { ...s, result: { status: "skipped" } } : s
            )
          );
          break;
        }
      } catch (e) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        setSteps((prev) =>
          prev.map((s, j) =>
            j === i
              ? {
                  ...s,
                  result: {
                    status: step.canFail ? "success" : "failed",
                    error: e instanceof Error ? e.message : String(e),
                    elapsed,
                  },
                }
              : j > i && !step.canFail
              ? { ...s, result: { status: "skipped" } }
              : s
          )
        );
        if (!step.canFail) break;
      }
    }

    setRunningStep(null);
    setIsRunning(false);
    setIsDone(true);
    setTotalElapsed(Math.floor((Date.now() - totalStartRef.current) / 1000));
  }

  function stopDemo() {
    abortRef.current = true;
  }

  const successCount = steps.filter((s) => s.result.status === "success").length;
  const failCount = steps.filter((s) => s.result.status === "failed").length;

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Live Demo</h1>
        <p className="text-white/50">
          Watch two AI agents (Alice &amp; Bob) negotiate escrow agreements, run live SLA checks, and resolve disputes through Internet Court — all on GenLayer.
        </p>
      </div>

      {/* Controls */}
      <div className="glass-card rounded-xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* API Key */}
          <div className="flex-1">
            <label className="text-xs text-white/40 mb-1 block">API Key</label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-violet-500/50"
              disabled={isRunning}
            />
          </div>

          {/* Flow selector */}
          <div>
            <label className="text-xs text-white/40 mb-1 block">Flow</label>
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {(["happy", "dispute", "full"] as Flow[]).map((f) => (
                <button
                  key={f}
                  onClick={() => !isRunning && setFlow(f)}
                  className={`px-4 py-2 text-sm transition-colors ${
                    flow === f
                      ? "bg-violet-600 text-white"
                      : "bg-white/5 text-white/50 hover:bg-white/10"
                  } ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={isRunning}
                >
                  {f === "happy" ? "Happy" : f === "dispute" ? "Dispute" : "Full"}
                </button>
              ))}
            </div>
          </div>

          {/* Start/Stop */}
          <div className="flex items-end">
            {!isRunning ? (
              <button
                onClick={runDemo}
                disabled={!apiKey}
                className="px-6 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                Start Demo
              </button>
            ) : (
              <button
                onClick={stopDemo}
                className="px-6 py-2 bg-red-600/80 hover:bg-red-500 rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Running status */}
        {(isRunning || isDone) && (
          <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-sm">
            <div className="flex items-center gap-4 text-white/50">
              {context.happyId && (
                <span>
                  Happy: <code className="text-white/70">{context.happyId}</code>
                </span>
              )}
              {context.disputeId && (
                <span>
                  Dispute: <code className="text-white/70">{context.disputeId}</code>
                </span>
              )}
            </div>
            <div className="font-mono text-white/40">
              {formatTime(totalElapsed)}
            </div>
          </div>
        )}
      </div>

      {/* Timeline */}
      {steps.length > 0 && (
        <div ref={timelineRef} className="relative">
          {/* Vertical line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-white/10" />

          {steps.map((step, i) => {
            const prevPhase = i > 0 ? steps[i - 1].phase : null;
            const showPhaseHeader = step.phase !== prevPhase;

            return (
              <div key={step.id}>
                {showPhaseHeader && (
                  <div className="relative flex items-center gap-3 mb-4 mt-8 first:mt-0">
                    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center z-10">
                      {step.phase === "health" ? (
                        <HeartIcon />
                      ) : step.phase === "happy" ? (
                        <CheckCircleIcon />
                      ) : (
                        <ScaleIcon />
                      )}
                    </div>
                    <h2 className="text-lg font-semibold text-white/80">
                      {PHASE_LABELS[step.phase]}
                    </h2>
                  </div>
                )}

                <div id={`step-${i}`} className="relative flex gap-4 mb-3">
                  {/* Status dot */}
                  <div className="relative z-10 mt-4">
                    <StepDot status={step.result.status} />
                  </div>

                  {/* Card */}
                  <div
                    className={`flex-1 glass-card rounded-lg p-4 transition-all ${
                      step.result.status === "running"
                        ? "border-violet-500/30 shadow-lg shadow-violet-500/5"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${
                          AGENT_COLORS[step.agent]
                        }`}
                      >
                        {step.agent}
                      </span>
                      <span className="font-medium text-sm">{step.label}</span>
                      {step.result.elapsed !== undefined && (
                        <span className="text-xs text-white/30 ml-auto">
                          {step.result.elapsed}s
                          {(step.result.retries ?? 0) > 0 && (
                            <span className="text-yellow-400/60 ml-1">
                              ({step.result.retries} retry)
                            </span>
                          )}
                        </span>
                      )}
                      {step.result.status === "running" && (
                        <ElapsedCounter startTime={runningStep?.startTime || Date.now()} />
                      )}
                    </div>
                    <p className="text-xs text-white/40 mb-2">{step.narration}</p>

                    {/* Response details */}
                    {step.result.response && (
                      <StepDetails step={step} />
                    )}

                    {step.result.error && step.result.status === "failed" && (
                      <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1 mt-1">
                        {step.result.error}
                      </div>
                    )}

                    {/* canFail steps that had errors */}
                    {step.result.error && step.result.status === "success" && step.canFail && (
                      <div className="text-xs text-yellow-400/70 bg-yellow-500/10 rounded px-2 py-1 mt-1">
                        Expected: {step.result.error}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {isDone && (
        <div className="glass-card rounded-xl p-6 mt-8">
          <h3 className="font-semibold mb-3">Demo Complete</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-white/40 text-xs">Total Time</div>
              <div className="font-mono">{formatTime(totalElapsed)}</div>
            </div>
            <div>
              <div className="text-white/40 text-xs">Steps</div>
              <div>
                <span className="text-green-400">{successCount} passed</span>
                {failCount > 0 && (
                  <span className="text-red-400 ml-2">{failCount} failed</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-white/40 text-xs">Agreements</div>
              <div className="text-xs space-y-1">
                {context.happyId && (
                  <Link
                    href={`/agreements/${context.happyId}`}
                    className="text-violet-400 hover:text-violet-300 block"
                  >
                    {context.happyId}
                  </Link>
                )}
                {context.disputeId && (
                  <Link
                    href={`/agreements/${context.disputeId}`}
                    className="text-violet-400 hover:text-violet-300 block"
                  >
                    {context.disputeId}
                  </Link>
                )}
              </div>
            </div>
            <div>
              <div className="text-white/40 text-xs">Agents</div>
              <div className="text-xs">
                <span className="text-blue-400">Alice</span> (client),{" "}
                <span className="text-green-400">Bob</span> (provider)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {steps.length === 0 && !isRunning && (
        <div className="text-center py-20 text-white/30">
          <p className="text-lg mb-2">Configure API key and select a flow to begin</p>
          <p className="text-sm">
            The demo creates real on-chain transactions on GenLayer Bradbury testnet.
            Each step may take 30-120 seconds for consensus.
          </p>
        </div>
      )}

      {/* Autonomous Demos */}
      <div className="mt-16 border-t border-white/10 pt-12">
        <h2 className="text-2xl font-bold mb-2">Autonomous Demos</h2>
        <p className="text-white/40 text-sm mb-6">
          Launch autonomous agent scripts that create, negotiate, and complete deals without human input.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <AutonomousDemoPanel
            id="marketplace"
            title="5-Agent Marketplace"
            description="Five agents create service listings, discover and claim deals, and process SLA checks autonomously. Watch live at /marketplace."
            icon="🏪"
            color="violet"
            apiKey={apiKey}
          />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function StepDot({ status }: { status: StepStatus }) {
  switch (status) {
    case "running":
      return (
        <div className="w-3 h-3 rounded-full bg-violet-500 animate-pulse ring-4 ring-violet-500/20" />
      );
    case "success":
      return <div className="w-3 h-3 rounded-full bg-green-500" />;
    case "failed":
      return <div className="w-3 h-3 rounded-full bg-red-500" />;
    case "skipped":
      return <div className="w-3 h-3 rounded-full bg-white/20" />;
    default:
      return <div className="w-3 h-3 rounded-full bg-white/10 border border-white/20" />;
  }
}

function ElapsedCounter({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <span className="text-xs text-violet-400/70 ml-auto font-mono animate-pulse">
      {elapsed}s...
    </span>
  );
}

function StepDetails({ step }: { step: DemoStep & { result: StepResult } }) {
  const [expanded, setExpanded] = useState(false);
  const resp = step.result.response;
  if (!resp) return null;

  // Show key display fields inline
  const fields = step.displayFields || [];
  const displayPairs = fields
    .map((f) => [f, resp[f]])
    .filter(([, v]) => v !== undefined && v !== null && v !== "");

  // For the final state views, show a formatted summary
  const isFinalView = step.id.endsWith("-final");

  return (
    <div className="mt-1">
      {displayPairs.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {displayPairs.map(([key, val]) => (
            <span key={key} className="text-white/50">
              <span className="text-white/30">{key}:</span>{" "}
              <span className="text-white/70 font-mono">
                {typeof val === "string" && val.startsWith("0x")
                  ? `${val.slice(0, 10)}...${val.slice(-6)}`
                  : String(val)}
              </span>
            </span>
          ))}
        </div>
      )}

      {isFinalView && resp.statusName && (
        <div className="text-xs mt-1 space-y-0.5">
          <div className="text-white/50">
            Status: <span className="text-white/70 font-medium">{resp.statusName}</span>
          </div>
          {resp.milestones?.map((m: any, i: number) => (
            <div key={i} className="text-white/40 pl-2">
              Milestone {i}: {m.statusName || "unknown"}
              {m.pass_count > 0 && <span className="text-green-400/70"> ({m.pass_count} pass)</span>}
              {m.fail_count > 0 && <span className="text-red-400/70"> ({m.fail_count} fail)</span>}
              {m.dispute_reason && (
                <span className="text-yellow-400/60"> — {m.dispute_reason}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Expandable full response */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-white/20 hover:text-white/40 mt-1"
      >
        {expanded ? "hide response" : "show response"}
      </button>
      {expanded && (
        <pre className="text-[10px] text-white/30 bg-black/30 rounded p-2 mt-1 overflow-x-auto max-h-40">
          {JSON.stringify(resp, null, 2)}
        </pre>
      )}
    </div>
  );
}

function AutonomousDemoPanel({
  id,
  title,
  description,
  icon,
  color,
  apiKey,
}: {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  apiKey: string;
}) {
  const [status, setStatus] = useState<"stopped" | "running" | "stopping">("stopped");
  const [output, setOutput] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const lineCountRef = useRef(0);

  // Check if already running on mount
  useEffect(() => {
    async function checkStatus() {
      try {
        const resp = await fetch(`/api/demos?id=${id}&since=0`);
        const data = await resp.json();
        if (data.status === "running") {
          setStatus("running");
          if (data.output?.length > 0) {
            setOutput(data.output);
            lineCountRef.current = data.total;
          }
        }
      } catch {}
    }
    checkStatus();
  }, [id]);

  // Poll output when running or stopping
  useEffect(() => {
    if (status !== "running" && status !== "stopping") return;
    let cancelled = false;

    const poll = async () => {
      while (!cancelled) {
        try {
          const resp = await fetch(`/api/demos?id=${id}&since=${lineCountRef.current}`);
          const data = await resp.json();
          if (data.output?.length > 0) {
            setOutput((prev) => [...prev, ...data.output].slice(-300));
            lineCountRef.current = data.total;
          }
          if (data.status === "stopped") {
            setStatus("stopped");
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 2000));
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [status, id]);

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  async function start() {
    setOutput([]);
    lineCountRef.current = 0;
    try {
      const resp = await fetch("/api/demos", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ id, action: "start" }),
      });
      const data = await resp.json();
      if (data.error) {
        setOutput([`Error: ${data.error}`]);
        return;
      }
      setStatus("running");
    } catch (err) {
      setOutput([`Failed to start: ${err}`]);
    }
  }

  async function stop() {
    setStatus("stopping");
    try {
      await fetch("/api/demos", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ id, action: "stop" }),
      });
    } catch {}
  }

  const borderColor = color === "blue" ? "border-blue-500/20" : "border-violet-500/20";
  const bgAccent = color === "blue" ? "bg-blue-500/10" : "bg-violet-500/10";
  const textAccent = color === "blue" ? "text-blue-400" : "text-violet-400";
  const btnBg = color === "blue" ? "bg-blue-600 hover:bg-blue-500" : "bg-violet-600 hover:bg-violet-500";

  return (
    <div className={`glass-card rounded-xl p-5 border ${borderColor}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className={`text-2xl w-10 h-10 rounded-lg flex items-center justify-center ${bgAccent}`}>
            {icon}
          </span>
          <div>
            <h3 className="font-semibold text-sm">{title}</h3>
            <p className="text-[11px] text-white/40 mt-0.5">{description}</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 mb-3">
        {status === "stopped" ? (
          <button onClick={start} className={`px-4 py-1.5 ${btnBg} rounded-lg text-xs font-semibold transition-colors`}>
            Start
          </button>
        ) : (
          <button
            onClick={stop}
            disabled={status === "stopping"}
            className="px-4 py-1.5 bg-red-600/80 hover:bg-red-500 disabled:opacity-50 rounded-lg text-xs font-semibold transition-colors"
          >
            {status === "stopping" ? "Stopping..." : "Stop"}
          </button>
        )}
        {status === "running" && (
          <span className="flex items-center gap-1.5 text-xs text-white/40">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Running
          </span>
        )}
        {output.length > 0 && status === "stopped" && (
          <button
            onClick={() => { setOutput([]); lineCountRef.current = 0; }}
            className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white/40 hover:text-white/60 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Output terminal */}
      {output.length > 0 && (
        <div
          ref={outputRef}
          className="bg-black/50 rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed text-white/70"
        >
          {output.map((line, i) => (
            <div key={i} className={line.includes("[stderr]") ? "text-red-400/70" : ""}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

// ── Icons ──

function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-cyan-400">
      <path
        d="M8 14s-5.5-3.5-5.5-7A3.5 3.5 0 0 1 8 4.5 3.5 3.5 0 0 1 13.5 7C13.5 10.5 8 14 8 14z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-green-400">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 8l2 2 3-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ScaleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-yellow-400">
      <path d="M8 2v12M3 5l5-2 5 2M3 5l-1 4h4L3 5zM13 5l-1 4h4l-3-4z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
