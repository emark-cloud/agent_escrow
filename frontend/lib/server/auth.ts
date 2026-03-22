import { NextRequest, NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { timingSafeEqual } from "crypto";
import type { Address, Hex } from "viem";

export interface WalletInfo {
  privateKey: Hex;
  address: Address;
}

export function checkApiKey(req: NextRequest): NextResponse | null {
  const apiKey = req.headers.get("x-api-key");
  const expected = process.env.API_KEY;
  if (!apiKey || !expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const a = Buffer.from(apiKey);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function validateMilestoneIndex(value: unknown): number | NextResponse {
  if (value === undefined || value === null) {
    return NextResponse.json({ error: "Missing milestone_index" }, { status: 400 });
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    return NextResponse.json(
      { error: "milestone_index must be a non-negative integer" },
      { status: 400 }
    );
  }
  return n;
}

export function validateNoPipes(fields: Record<string, string>): NextResponse | null {
  for (const [name, value] of Object.entries(fields)) {
    if (value.includes("|")) {
      return NextResponse.json(
        { error: `Field "${name}" must not contain the pipe character (|)` },
        { status: 400 }
      );
    }
  }
  return null;
}

export function getWalletForRequest(req: NextRequest): WalletInfo | NextResponse {
  const walletId = req.headers.get("x-wallet-id");
  if (!walletId) {
    return NextResponse.json(
      { error: "Missing x-wallet-id header" },
      { status: 400 }
    );
  }

  const envKey = `WALLET_${walletId.toUpperCase()}`;
  const privateKey = process.env[envKey];
  if (!privateKey) {
    return NextResponse.json(
      { error: `Wallet "${walletId}" not configured` },
      { status: 400 }
    );
  }

  const hex = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex;
  const account = privateKeyToAccount(hex);

  return { privateKey: hex, address: account.address };
}

export function isErrorResponse(value: WalletInfo | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
