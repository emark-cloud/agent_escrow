import { NextRequest, NextResponse } from "next/server";
import { checkApiKey } from "@/lib/server/auth";
import { spawn, type ChildProcess } from "child_process";
import { join } from "path";

// Track running demo processes
const runningDemos: Map<string, { process: ChildProcess; output: string[]; startedAt: number; exited: boolean }> = new Map();

const MAX_OUTPUT_LINES = 500;
const PROJECT_ROOT = join(process.cwd(), "..");

function isRunning(demo: { process: ChildProcess; exited: boolean }): boolean {
  return !demo.exited;
}

function getDemoScripts(): Record<string, { cmd: string; args: string[]; label: string }> {
  return {
    marketplace: {
      cmd: "node",
      args: [[PROJECT_ROOT, "marketplace-agents.js"].join("/"), "http://localhost:3000"],
      label: "5-Agent Marketplace Demo",
    },
  };
}

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
    const running = isRunning(demo);
    const output = demo.output.slice(since);
    return NextResponse.json({
      id: demoId,
      status: running ? "running" : "stopped",
      exitCode: demo.process.exitCode,
      output,
      total: demo.output.length,
      startedAt: demo.startedAt,
    });
  }

  // List all demos
  const demos = Object.entries(getDemoScripts()).map(([id, script]) => {
    const running = runningDemos.get(id);
    return {
      id,
      label: script.label,
      status: running && isRunning(running) ? "running" : "stopped",
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

  if (!id || !getDemoScripts()[id]) {
    return NextResponse.json({ error: `Unknown demo: ${id}` }, { status: 400 });
  }

  if (reqAction === "stop") {
    const demo = runningDemos.get(id);
    if (demo && isRunning(demo)) {
      demo.process.kill("SIGTERM");
      return NextResponse.json({ id, status: "stopping" });
    }
    return NextResponse.json({ id, status: "stopped" });
  }

  // Start
  const existing = runningDemos.get(id);
  if (existing && isRunning(existing)) {
    return NextResponse.json({ error: `Demo ${id} is already running` }, { status: 409 });
  }

  const script = getDemoScripts()[id];
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

  const demoEntry = { process: child, output, startedAt: Date.now(), exited: false };

  child.on("exit", (code) => {
    output.push(`\n--- Demo exited with code ${code} ---`);
    demoEntry.exited = true;
  });

  runningDemos.set(id, demoEntry);

  return NextResponse.json({ id, status: "started", pid: child.pid }, { status: 201 });
}
