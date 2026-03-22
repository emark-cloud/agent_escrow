import { NextResponse } from "next/server";
import { GENLAYER_CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

const API_VERSION = "1.0.0";

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
  });
}
