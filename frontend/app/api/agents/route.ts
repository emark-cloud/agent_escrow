import { NextRequest, NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { checkApiKey } from "@/lib/server/auth";
import { getAllAgents, addAgent, removeAgent } from "@/lib/server/agentStore";

export const dynamic = "force-dynamic";

function deriveAddress(privateKey: string): string {
  const hex = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex;
  return privateKeyToAccount(hex).address;
}

/** List all agent wallets (env + JSON file). Returns name + address only. */
export async function GET(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  const agents: { name: string; address: string; source: "env" | "config" }[] = [];

  // Env-based wallets
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("WALLET_") && value) {
      const name = key.slice("WALLET_".length).toLowerCase();
      try {
        agents.push({ name, address: deriveAddress(value), source: "env" });
      } catch {
        // skip invalid keys
      }
    }
  }

  // JSON file wallets
  const fileAgents = getAllAgents();
  for (const [name, privateKey] of Object.entries(fileAgents)) {
    // Skip if already defined in env (env takes precedence)
    if (agents.some((a) => a.name === name.toLowerCase())) continue;
    try {
      agents.push({ name: name.toLowerCase(), address: deriveAddress(privateKey), source: "config" });
    } catch {
      // skip invalid keys
    }
  }

  return NextResponse.json({ agents });
}

/** Add a new agent wallet to agents.json. */
export async function POST(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  let body: { name?: string; privateKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, privateKey } = body;
  if (!name || !privateKey) {
    return NextResponse.json({ error: "Missing name or privateKey" }, { status: 400 });
  }

  // Validate name: alphanumeric + underscores only
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    return NextResponse.json(
      { error: "Name must be alphanumeric (underscores allowed)" },
      { status: 400 }
    );
  }

  // Check if env-based wallet with this name exists
  const envKey = `WALLET_${name.toUpperCase()}`;
  if (process.env[envKey]) {
    return NextResponse.json(
      { error: `Wallet "${name}" is defined in environment variables and cannot be overridden` },
      { status: 409 }
    );
  }

  // Validate private key by deriving address
  let address: string;
  try {
    address = deriveAddress(privateKey);
  } catch {
    return NextResponse.json({ error: "Invalid private key" }, { status: 400 });
  }

  addAgent(name.toLowerCase(), privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);

  return NextResponse.json({ name: name.toLowerCase(), address }, { status: 201 });
}

/** Remove an agent wallet from agents.json. */
export async function DELETE(req: NextRequest) {
  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name } = body;
  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  // Check if it's an env-based wallet
  const envKey = `WALLET_${name.toUpperCase()}`;
  if (process.env[envKey]) {
    return NextResponse.json(
      { error: `Wallet "${name}" is defined in environment variables and cannot be removed from here` },
      { status: 400 }
    );
  }

  const removed = removeAgent(name.toLowerCase());
  if (!removed) {
    return NextResponse.json({ error: `Wallet "${name}" not found` }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
