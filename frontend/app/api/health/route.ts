import { NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { GENLAYER_CONFIG } from "@/lib/config";
import { getAllAgents } from "@/lib/server/agentStore";

export const dynamic = "force-dynamic";

const API_VERSION = "1.0.0";

function getAgentWallets(): Record<string, string> {
  const wallets: Record<string, string> = {};

  // Env-based wallets
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("WALLET_") && value) {
      const name = key.slice("WALLET_".length).toLowerCase();
      const hex = (value.startsWith("0x") ? value : `0x${value}`) as Hex;
      try {
        const account = privateKeyToAccount(hex);
        wallets[name] = account.address;
      } catch {
        // skip invalid keys
      }
    }
  }

  // JSON file wallets (env takes precedence)
  const fileAgents = getAllAgents();
  for (const [name, privateKey] of Object.entries(fileAgents)) {
    const lowerName = name.toLowerCase();
    if (lowerName in wallets) continue;
    const hex = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex;
    try {
      const account = privateKeyToAccount(hex);
      wallets[lowerName] = account.address;
    } catch {
      // skip invalid keys
    }
  }

  return wallets;
}

export async function GET() {
  let rpcOk = false;
  try {
    const resp = await fetch(GENLAYER_CONFIG.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_chainId",
        params: [],
        id: 1,
      }),
    });
    const data = await resp.json();
    rpcOk = !!data?.result;
  } catch {
    // RPC unreachable
  }

  return NextResponse.json({
    status: rpcOk ? "ok" : "degraded",
    version: API_VERSION,
    contractAddress: GENLAYER_CONFIG.contractAddress,
    chainId: GENLAYER_CONFIG.chainId,
    rpcUrl: GENLAYER_CONFIG.rpcUrl,
    consensusContract: GENLAYER_CONFIG.consensusContract,
    rpcReachable: rpcOk,
    agentWallets: getAgentWallets(),
  });
}
