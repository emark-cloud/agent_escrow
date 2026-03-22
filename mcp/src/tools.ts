import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createClient, abi } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import type { CalldataEncodable } from "genlayer-js/types";
import {
  createWalletClient,
  http,
  encodeFunctionData,
  defineChain,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

// ── Config ──────────────────────────────────────────────

const CONTRACT_ADDRESS = (process.env.CONTRACT_ADDRESS ||
  "0x7Ee4c7B8831cb65424B41163BE3a6808Ab3c95D3") as Address;
const CONSENSUS_CONTRACT = (process.env.CONSENSUS_CONTRACT ||
  "0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D") as Address;
const RPC_URL =
  process.env.RPC_URL || "https://zksync-os-testnet-genlayer.zksync.dev";
const CHAIN_ID = 4221;

const { calldata, transactions } = abi;

const genlayerChain = defineChain({
  id: CHAIN_ID,
  name: "GenLayer Bradbury Testnet",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

const CONSENSUS_ABI = [
  {
    inputs: [
      { name: "_sender", type: "address" },
      { name: "_recipient", type: "address" },
      { name: "_numOfInitialValidators", type: "uint256" },
      { name: "_maxRotations", type: "uint256" },
      { name: "_calldata", type: "bytes" },
      { name: "_validUntil", type: "uint256" },
    ],
    name: "addTransaction",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "txId", type: "bytes32" },
      { indexed: true, name: "recipient", type: "address" },
      { indexed: true, name: "activator", type: "address" },
    ],
    name: "NewTransaction",
    type: "event",
  },
] as const;

const STATUS_NAMES: Record<number, string> = {
  0: "Created",
  1: "Active",
  2: "Completed",
  3: "Disputed",
  4: "Cancelled",
};

const MILESTONE_STATUS_NAMES: Record<number, string> = {
  0: "Pending",
  1: "Monitoring",
  2: "Verified",
  3: "Paid",
  4: "Disputed",
  5: "Failed",
  6: "Refunded",
};

// ── Helpers ─────────────────────────────────────────────

function mapToObject(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    value.forEach((v, k) => {
      obj[String(k)] = mapToObject(v);
    });
    return obj;
  }
  if (Array.isArray(value)) return value.map(mapToObject);
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(-Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  return value;
}

function createReadClient() {
  return createClient({ chain: testnetBradbury });
}

async function readContract<T>(
  functionName: string,
  args: CalldataEncodable[] = []
): Promise<T> {
  const client = createReadClient();
  const raw = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
  });
  const result = mapToObject(raw);

  // get_agreements_by_address returns a comma-separated string, not a list
  if (functionName === "get_agreements_by_address") {
    const str = result as string;
    return (str ? str.split(",") : []) as T;
  }

  return result as T;
}

function getWalletKey(walletId?: string): Hex {
  if (walletId) {
    const envKey = `WALLET_${walletId.toUpperCase()}`;
    const key = process.env[envKey];
    if (!key)
      throw new Error(`Wallet "${walletId}" not configured (env: ${envKey})`);
    return (key.startsWith("0x") ? key : `0x${key}`) as Hex;
  }
  const key = process.env.WALLET_PRIVATE_KEY;
  if (!key)
    throw new Error(
      "No wallet configured. Set WALLET_PRIVATE_KEY or WALLET_<NAME> env vars."
    );
  return (key.startsWith("0x") ? key : `0x${key}`) as Hex;
}

async function writeContract(
  walletId: string | undefined,
  functionName: string,
  args: CalldataEncodable[]
): Promise<string> {
  const privateKey = getWalletKey(walletId);
  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: genlayerChain,
    transport: http(RPC_URL),
  });

  const calldataObj = calldata.makeCalldataObject(functionName, args, undefined);
  const encodedCalldata = calldata.encode(calldataObj);
  const serializedData = transactions.serialize([
    encodedCalldata,
    false,
  ]) as Hex;

  const txData = encodeFunctionData({
    abi: CONSENSUS_ABI,
    functionName: "addTransaction",
    args: [
      account.address,
      CONTRACT_ADDRESS,
      5n,
      3n,
      serializedData,
      0n,
    ],
  });

  return await walletClient.sendTransaction({
    to: CONSENSUS_CONTRACT,
    data: txData,
    gas: 5_000_000n,
  });
}

async function getGenLayerTxId(l1TxHash: string): Promise<string | null> {
  const consensusAddr = CONSENSUS_CONTRACT.toLowerCase();
  for (let i = 0; i < 30; i++) {
    try {
      const resp = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getTransactionReceipt",
          params: [l1TxHash],
          id: 1,
        }),
      });
      const data = await resp.json();
      const receipt = data?.result;
      if (receipt) {
        const log = receipt.logs?.find(
          (l: { address: string }) => l.address.toLowerCase() === consensusAddr
        );
        if (log?.topics?.[1]) return log.topics[1];
        return null;
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

async function waitForConsensus(
  l1TxHash: string
): Promise<{ txHash: string; glTxId: string; status: string }> {
  const glTxId = await getGenLayerTxId(l1TxHash);
  if (!glTxId) throw new Error("Could not extract GenLayer txId from L1 receipt");

  const client = createReadClient();
  for (let i = 0; i < 200; i++) {
    try {
      const tx = await client.getTransaction({
        hash: glTxId as unknown as Parameters<
          typeof client.getTransaction
        >[0]["hash"],
      });
      const statusName = (tx as any).statusName as string;
      if (statusName === "ACCEPTED" || statusName === "FINALIZED") {
        return { txHash: l1TxHash, glTxId, status: statusName };
      }
      if (["UNDETERMINED", "DISMISSED", "CANCELED"].includes(statusName)) {
        throw new Error(`Transaction failed: ${statusName}`);
      }
      if (statusName === "LEADER_TIMEOUT" && i > 30) {
        throw new Error("Leader timed out. Resubmit the transaction.");
      }
    } catch (e) {
      if (
        e instanceof Error &&
        (e.message.includes("failed") || e.message.includes("timed out"))
      )
        throw e;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Transaction timed out waiting for consensus");
}

function text(msg: string) {
  return { content: [{ type: "text" as const, text: msg }] };
}

function json(data: unknown) {
  return text(JSON.stringify(data, null, 2));
}

function err(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const };
}

// ── Tool Registration ───────────────────────────────────

export function registerTools(server: McpServer) {
  // ── Read Tools ──────────────────────────────────────

  server.tool(
    "get_agreement",
    "Get an AgentEscrow agreement by ID, including all milestones and their SLA status",
    { agreement_id: z.string().describe("The agreement ID") },
    async ({ agreement_id }) => {
      try {
        const agreement = await readContract<Record<string, unknown>>(
          "get_agreement",
          [agreement_id]
        );
        const count = Number(agreement.milestone_count ?? 0);
        const milestones = [];
        for (let i = 0; i < count; i++) {
          const ms = await readContract<Record<string, unknown>>(
            "get_milestone",
            [agreement_id, i]
          );
          milestones.push({
            index: i,
            ...ms,
            statusName: MILESTONE_STATUS_NAMES[Number(ms.status)] ?? "Unknown",
          });
        }
        return json({
          ...agreement,
          statusName: STATUS_NAMES[Number(agreement.status)] ?? "Unknown",
          milestones,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "list_agreements",
    "List AgentEscrow agreements. Optionally filter by address.",
    {
      address: z
        .string()
        .optional()
        .describe("Filter by party address (0x...). Omit for all agreements."),
    },
    async ({ address }) => {
      try {
        const ids = address
          ? await readContract<string[]>("get_agreements_by_address", [address])
          : await readContract<string[]>("get_all_agreement_ids");

        const agreements = [];
        for (const id of ids) {
          const a = await readContract<Record<string, unknown>>(
            "get_agreement",
            [id]
          );
          agreements.push({
            ...a,
            statusName: STATUS_NAMES[Number(a.status)] ?? "Unknown",
          });
        }
        return json({ total: agreements.length, agreements });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // ── Write Tools ─────────────────────────────────────

  server.tool(
    "create_agreement",
    "Create a new AgentEscrow agreement with milestones. The signing wallet becomes the client.",
    {
      wallet_id: z
        .string()
        .optional()
        .describe(
          "Which wallet to sign with (e.g. 'alice'). Maps to WALLET_ALICE env var. Omit for default WALLET_PRIVATE_KEY."
        ),
      agreement_id: z.string().describe("Unique agreement ID"),
      provider: z.string().describe("Provider address (0x...)"),
      description: z.string().describe("Agreement description"),
      milestones: z
        .array(
          z.object({
            description: z.string(),
            monitoring_url: z.string().describe("URL to monitor for SLA checks"),
            sla_criteria: z
              .string()
              .describe("SLA criteria the AI validators will check"),
            amount: z.string().describe("Payment amount for this milestone"),
          })
        )
        .describe("Array of milestones"),
      wait: z
        .boolean()
        .optional()
        .default(false)
        .describe("Wait for consensus before returning (takes 1-2 min)"),
    },
    async ({ wallet_id, agreement_id, provider, description, milestones, wait }) => {
      try {
        for (const m of milestones) {
          for (const [field, val] of Object.entries(m)) {
            if (val.includes("|")) {
              return err(`Field "${field}" must not contain the pipe character (|)`);
            }
          }
        }

        const ms_descriptions = milestones.map((m) => m.description).join("|");
        const ms_urls = milestones.map((m) => m.monitoring_url).join("|");
        const ms_criteria = milestones.map((m) => m.sla_criteria).join("|");
        const ms_amounts = milestones.map((m) => m.amount).join("|");

        const txHash = await writeContract(wallet_id, "create_agreement", [
          agreement_id,
          provider,
          description,
          ms_descriptions,
          ms_urls,
          ms_criteria,
          ms_amounts,
        ]);

        if (wait) {
          const result = await waitForConsensus(txHash);
          return json(result);
        }
        return json({ txHash });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "accept_agreement",
    "Accept an agreement as the provider",
    {
      wallet_id: z.string().optional().describe("Wallet to sign with (e.g. 'bob')"),
      agreement_id: z.string().describe("The agreement ID to accept"),
      wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    },
    async ({ wallet_id, agreement_id, wait }) => {
      try {
        const txHash = await writeContract(wallet_id, "accept_agreement", [
          agreement_id,
        ]);
        if (wait) return json(await waitForConsensus(txHash));
        return json({ txHash });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "check_sla",
    "Run an AI-powered SLA check on a milestone. Validators will fetch the monitoring URL and evaluate against the SLA criteria.",
    {
      wallet_id: z.string().optional().describe("Wallet to sign with"),
      agreement_id: z.string().describe("The agreement ID"),
      milestone_index: z.number().int().nonnegative().describe("Milestone index (0-based)"),
      wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    },
    async ({ wallet_id, agreement_id, milestone_index, wait }) => {
      try {
        const txHash = await writeContract(wallet_id, "check_sla", [
          agreement_id,
          milestone_index,
        ]);
        if (wait) return json(await waitForConsensus(txHash));
        return json({ txHash });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "verify_milestone",
    "Mark a milestone as verified after successful SLA checks",
    {
      wallet_id: z.string().optional().describe("Wallet to sign with"),
      agreement_id: z.string().describe("The agreement ID"),
      milestone_index: z.number().int().nonnegative().describe("Milestone index (0-based)"),
      wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    },
    async ({ wallet_id, agreement_id, milestone_index, wait }) => {
      try {
        const txHash = await writeContract(wallet_id, "verify_milestone", [
          agreement_id,
          milestone_index,
        ]);
        if (wait) return json(await waitForConsensus(txHash));
        return json({ txHash });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "release_payment",
    "Release escrow payment for a verified milestone",
    {
      wallet_id: z.string().optional().describe("Wallet to sign with"),
      agreement_id: z.string().describe("The agreement ID"),
      milestone_index: z.number().int().nonnegative().describe("Milestone index (0-based)"),
      wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    },
    async ({ wallet_id, agreement_id, milestone_index, wait }) => {
      try {
        const txHash = await writeContract(wallet_id, "release_payment", [
          agreement_id,
          milestone_index,
        ]);
        if (wait) return json(await waitForConsensus(txHash));
        return json({ txHash });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "dispute_milestone",
    "Dispute a milestone that failed SLA checks",
    {
      wallet_id: z.string().optional().describe("Wallet to sign with"),
      agreement_id: z.string().describe("The agreement ID"),
      milestone_index: z.number().int().nonnegative().describe("Milestone index (0-based)"),
      reason: z.string().describe("Reason for the dispute"),
      wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    },
    async ({ wallet_id, agreement_id, milestone_index, reason, wait }) => {
      try {
        const txHash = await writeContract(wallet_id, "dispute_milestone", [
          agreement_id,
          milestone_index,
          reason,
        ]);
        if (wait) return json(await waitForConsensus(txHash));
        return json({ txHash });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "submit_evidence",
    "Submit evidence for a disputed milestone",
    {
      wallet_id: z.string().optional().describe("Wallet to sign with"),
      agreement_id: z.string().describe("The agreement ID"),
      milestone_index: z.number().int().nonnegative().describe("Milestone index (0-based)"),
      evidence: z.string().describe("Evidence text supporting your position"),
      wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    },
    async ({ wallet_id, agreement_id, milestone_index, evidence, wait }) => {
      try {
        const txHash = await writeContract(wallet_id, "submit_evidence", [
          agreement_id,
          milestone_index,
          evidence,
        ]);
        if (wait) return json(await waitForConsensus(txHash));
        return json({ txHash });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "cancel_agreement",
    "Cancel an agreement (only before it's accepted)",
    {
      wallet_id: z.string().optional().describe("Wallet to sign with"),
      agreement_id: z.string().describe("The agreement ID"),
      wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    },
    async ({ wallet_id, agreement_id, wait }) => {
      try {
        const txHash = await writeContract(wallet_id, "cancel_agreement", [
          agreement_id,
        ]);
        if (wait) return json(await waitForConsensus(txHash));
        return json({ txHash });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "refund_milestone",
    "Refund a failed milestone back to the client",
    {
      wallet_id: z.string().optional().describe("Wallet to sign with"),
      agreement_id: z.string().describe("The agreement ID"),
      milestone_index: z.number().int().nonnegative().describe("Milestone index (0-based)"),
      wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    },
    async ({ wallet_id, agreement_id, milestone_index, wait }) => {
      try {
        const txHash = await writeContract(wallet_id, "refund_failed_milestone", [
          agreement_id,
          milestone_index,
        ]);
        if (wait) return json(await waitForConsensus(txHash));
        return json({ txHash });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "resolve_dispute",
    "Apply an Internet Court verdict to a disputed milestone. Only client or provider can call this.",
    {
      wallet_id: z.string().optional().describe("Wallet to sign with"),
      agreement_id: z.string().describe("The agreement ID"),
      milestone_index: z.number().int().nonnegative().describe("Milestone index (0-based)"),
      verdict: z.enum(["PARTY_A", "PARTY_B", "UNDETERMINED"]).describe("The court verdict"),
      court_address: z.string().describe("Address of the Internet Court contract that rendered the verdict"),
      wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    },
    async ({ wallet_id, agreement_id, milestone_index, verdict, court_address, wait }) => {
      try {
        const txHash = await writeContract(wallet_id, "resolve_dispute", [
          agreement_id,
          milestone_index,
          verdict,
          court_address,
        ]);
        if (wait) return json(await waitForConsensus(txHash));
        return json({ txHash });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // ── Portfolio / Heartbeat ─────────────────────────────

  server.tool(
    "check_portfolio",
    "Check all agreements and actionable items for a wallet address. Use this as a heartbeat to discover what needs attention — SLA checks to run, payments to release, disputes to respond to, etc.",
    {
      address: z
        .string()
        .describe("Wallet address (0x...) to check portfolio for"),
    },
    async ({ address }) => {
      try {
        const ids = await readContract<string[]>("get_agreements_by_address", [
          address,
        ]);

        const addressLower = address.toLowerCase();
        const agreements: Record<string, unknown>[] = [];
        const actions: {
          agreement_id: string;
          milestone_index: number;
          action: string;
          description: string;
        }[] = [];

        for (const id of ids) {
          const agreement = await readContract<Record<string, unknown>>(
            "get_agreement",
            [id]
          );
          const milestones: Record<string, unknown>[] = [];

          const isClient =
            String(agreement.client).toLowerCase() === addressLower;
          const isProvider =
            String(agreement.provider).toLowerCase() === addressLower;
          const agreementStatus = Number(agreement.status);

          // Created → provider can accept (once per agreement)
          if (agreementStatus === 0 && isProvider) {
            actions.push({
              agreement_id: id,
              milestone_index: -1,
              action: "accept_agreement",
              description: `Accept agreement "${agreement.description}"`,
            });
          }

          const count = Number(agreement.milestone_count ?? 0);
          for (let i = 0; i < count; i++) {
            const ms = await readContract<Record<string, unknown>>(
              "get_milestone",
              [id, i]
            );
            const status = Number(ms.status);
            milestones.push({
              index: i,
              ...ms,
              statusName: MILESTONE_STATUS_NAMES[status] ?? "Unknown",
            });

            // Pending in Active agreement → kick off first SLA check
            if (status === 0 && agreementStatus === 1) {
              actions.push({
                agreement_id: id,
                milestone_index: i,
                action: "check_sla",
                description: `Start SLA monitoring on milestone ${i}: "${ms.description}"`,
              });
            }

            // Monitoring → run SLA check
            if (status === 1) {
              actions.push({
                agreement_id: id,
                milestone_index: i,
                action: "check_sla",
                description: `Run SLA check on milestone ${i}: "${ms.description}"`,
              });

              // If there are passing checks, client can verify
              if (Number(ms.pass_count) > 0 && isClient) {
                actions.push({
                  agreement_id: id,
                  milestone_index: i,
                  action: "verify_milestone",
                  description: `Verify milestone ${i} (${ms.pass_count} passes): "${ms.description}"`,
                });
              }
            }

            if (status === 2 && isClient) {
              actions.push({
                agreement_id: id,
                milestone_index: i,
                action: "release_payment",
                description: `Release payment for milestone ${i}: "${ms.description}"`,
              });
            }

            if (status === 4) {
              const hasEvidence = isClient
                ? ms.evidence_client
                : ms.evidence_provider;
              if (!hasEvidence) {
                actions.push({
                  agreement_id: id,
                  milestone_index: i,
                  action: "submit_evidence",
                  description: `Submit evidence for disputed milestone ${i}: "${ms.description}"`,
                });
              }
            }

            if (status === 5 && isClient) {
              actions.push({
                agreement_id: id,
                milestone_index: i,
                action: "refund_milestone",
                description: `Refund failed milestone ${i}: "${ms.description}"`,
              });
            }
          }

          agreements.push({
            ...agreement,
            statusName: STATUS_NAMES[agreementStatus] ?? "Unknown",
            milestones,
          });
        }

        return json({
          address,
          total_agreements: agreements.length,
          total_actions: actions.length,
          agreements,
          actions,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
