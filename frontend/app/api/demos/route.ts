import { NextRequest, NextResponse } from "next/server";
import { checkApiKey } from "@/lib/server/auth";
import { spawn, type ChildProcess } from "child_process";
import { join } from "path";

// Track running demo processes
const runningDemos: Map<string, { process: ChildProcess; output: string[]; startedAt: number }> = new Map();

const MAX_OUTPUT_LINES = 500;
const PROJECT_ROOT = join(process.cwd(), "..");

const DEMO_SCRIPTS: Record<string, { cmd: string; args: string[]; label: string }> = {
  agents: {
    cmd: "node",
    args: [join(PROJECT_ROOT, "demo-agents.js"), "http://localhost:3000"],
    label: "Two-Agent Autonomous Demo",
  },
  marketplace: {
    cmd: "node",
    args: [join(PROJECT_ROOT, "marketplace-agents.js"), "http://localhost:3000"],
    label: "5-Agent Marketplace Demo",
  },
};

// GET /api/demos — list demos and their status/output
export async function GET(req: NextRequest) {
  const demoId = req.nextUrl.searchParams.get("id");
  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam ? parseInt(sinceParam, 10) : 0;

  if (demoId) {
    const demo = runningDemos.get(demoId);
    if (!demo) {
      return NextResponse.json({ id: demoId, status: "stopped", output: [], total: 0 });
    }
    const isRunning = demo.process.exitCode === null;
    const output = demo.output.slice(since);
    return NextResponse.json({
      id: demoId,
      status: isRunning ? "running" : "stopped",
      exitCode: demo.process.exitCode,
      output,
      total: demo.output.length,
      startedAt: demo.startedAt,
    });
  }

  // List all demos
  const demos = Object.entries(DEMO_SCRIPTS).map(([id, script]) => {
    const running = runningDemos.get(id);
    return {
      id,
      label: script.label,
      status: running && running.process.exitCode === null ? "running" : "stopped",
      lines: running?.output.length || 0,
      startedAt: running?.startedAt || null,
    };
  });

  return NextResponse.json({ demos });
}

// POST /api/demos — start or stop a demo
export async function POST(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  const body = await req.json();
  const { id, action: reqAction } = body as { id: string; action: "start" | "stop" };

  if (!id || !DEMO_SCRIPTS[id]) {
    return NextResponse.json({ error: `Unknown demo: ${id}` }, { status: 400 });
  }

  if (reqAction === "stop") {
    const demo = runningDemos.get(id);
    if (demo && demo.process.exitCode === null) {
      demo.process.kill("SIGTERM");
      return NextResponse.json({ id, status: "stopping" });
    }
    return NextResponse.json({ id, status: "stopped" });
  }

  // Start
  const existing = runningDemos.get(id);
  if (existing && existing.process.exitCode === null) {
    return NextResponse.json({ error: `Demo ${id} is already running` }, { status: 409 });
  }

  const script = DEMO_SCRIPTS[id];
  const output: string[] = [];

  const env = { ...process.env, API_KEY: process.env.API_KEY || "test" };
  const child = spawn(script.cmd, script.args, {
    cwd: PROJECT_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Strip ANSI codes for clean display
  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

  child.stdout?.on("data", (data: Buffer) => {
    const lines = stripAnsi(data.toString()).split("\n").filter(Boolean);
    for (const line of lines) {
      output.push(line);
      if (output.length > MAX_OUTPUT_LINES) output.shift();
    }
  });

  child.stderr?.on("data", (data: Buffer) => {
    const lines = stripAnsi(data.toString()).split("\n").filter(Boolean);
    for (const line of lines) {
      output.push(`[stderr] ${line}`);
      if (output.length > MAX_OUTPUT_LINES) output.shift();
    }
  });

  child.on("exit", (code) => {
    output.push(`\n--- Demo exited with code ${code} ---`);
  });

  runningDemos.set(id, { process: child, output, startedAt: Date.now() });

  return NextResponse.json({ id, status: "started", pid: child.pid }, { status: 201 });
}
