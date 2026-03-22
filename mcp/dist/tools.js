import { createClient, abi } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { createWalletClient, http, encodeFunctionData, defineChain, } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
// ── Config ──────────────────────────────────────────────
const CONTRACT_ADDRESS = (process.env.CONTRACT_ADDRESS ||
    "0x7Ee4c7B8831cb65424B41163BE3a6808Ab3c95D3");
const CONSENSUS_CONTRACT = (process.env.CONSENSUS_CONTRACT ||
    "0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D");
const RPC_URL = process.env.RPC_URL || "https://zksync-os-testnet-genlayer.zksync.dev";
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
];
const STATUS_NAMES = {
    0: "Created",
    1: "Active",
    2: "Completed",
    3: "Disputed",
    4: "Cancelled",
};
const MILESTONE_STATUS_NAMES = {
    0: "Pending",
    1: "Monitoring",
    2: "Verified",
    3: "Paid",
    4: "Disputed",
    5: "Failed",
    6: "Refunded",
};
// ── Helpers ─────────────────────────────────────────────
function mapToObject(value) {
    if (value instanceof Map) {
        const obj = {};
        value.forEach((v, k) => {
            obj[String(k)] = mapToObject(v);
        });
        return obj;
    }
    if (Array.isArray(value))
        return value.map(mapToObject);
    if (typeof value === "bigint")
        return Number(value);
    return value;
}
function createReadClient() {
    return createClient({ chain: testnetBradbury });
}
async function readContract(functionName, args = []) {
    const client = createReadClient();
    const result = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName,
        args,
    });
    return mapToObject(result);
}
function getWalletKey(walletId) {
    if (walletId) {
        const envKey = `WALLET_${walletId.toUpperCase()}`;
        const key = process.env[envKey];
        if (!key)
            throw new Error(`Wallet "${walletId}" not configured (env: ${envKey})`);
        return (key.startsWith("0x") ? key : `0x${key}`);
    }
    const key = process.env.WALLET_PRIVATE_KEY;
    if (!key)
        throw new Error("No wallet configured. Set WALLET_PRIVATE_KEY or WALLET_<NAME> env vars.");
    return (key.startsWith("0x") ? key : `0x${key}`);
}
async function writeContract(walletId, functionName, args) {
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
    ]);
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
        gas: 5000000n,
    });
}
async function getGenLayerTxId(l1TxHash) {
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
                const log = receipt.logs?.find((l) => l.address.toLowerCase() === consensusAddr);
                if (log?.topics?.[1])
                    return log.topics[1];
                return null;
            }
        }
        catch {
            // not ready yet
        }
        await new Promise((r) => setTimeout(r, 3000));
    }
    return null;
}
async function waitForConsensus(l1TxHash) {
    const glTxId = await getGenLayerTxId(l1TxHash);
    if (!glTxId)
        throw new Error("Could not extract GenLayer txId from L1 receipt");
    const client = createReadClient();
    for (let i = 0; i < 200; i++) {
        try {
            const tx = await client.getTransaction({
                hash: glTxId,
            });
            const statusName = tx.statusName;
            if (statusName === "ACCEPTED" || statusName === "FINALIZED") {
                return { txHash: l1TxHash, glTxId, status: statusName };
            }
            if (["UNDETERMINED", "DISMISSED", "CANCELED"].includes(statusName)) {
                throw new Error(`Transaction failed: ${statusName}`);
            }
            if (statusName === "LEADER_TIMEOUT" && i > 30) {
                throw new Error("Leader timed out. Resubmit the transaction.");
            }
        }
        catch (e) {
            if (e instanceof Error &&
                (e.message.includes("failed") || e.message.includes("timed out")))
                throw e;
        }
        await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error("Transaction timed out waiting for consensus");
}
function text(msg) {
    return { content: [{ type: "text", text: msg }] };
}
function json(data) {
    return text(JSON.stringify(data, null, 2));
}
function err(msg) {
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
}
// ── Tool Registration ───────────────────────────────────
export function registerTools(server) {
    // ── Read Tools ──────────────────────────────────────
    server.tool("get_agreement", "Get an AgentEscrow agreement by ID, including all milestones and their SLA status", { agreement_id: z.string().describe("The agreement ID") }, async ({ agreement_id }) => {
        try {
            const agreement = await readContract("get_agreement", [agreement_id]);
            const count = Number(agreement.milestone_count ?? 0);
            const milestones = [];
            for (let i = 0; i < count; i++) {
                const ms = await readContract("get_milestone", [agreement_id, i]);
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
        }
        catch (e) {
            return err(e instanceof Error ? e.message : String(e));
        }
    });
    server.tool("list_agreements", "List AgentEscrow agreements. Optionally filter by address.", {
        address: z
            .string()
            .optional()
            .describe("Filter by party address (0x...). Omit for all agreements."),
    }, async ({ address }) => {
        try {
            const ids = address
                ? await readContract("get_agreements_by_address", [address])
                : await readContract("get_all_agreement_ids");
            const agreements = [];
            for (const id of ids) {
                const a = await readContract("get_agreement", [id]);
                agreements.push({
                    ...a,
                    statusName: STATUS_NAMES[Number(a.status)] ?? "Unknown",
                });
            }
            return json({ total: agreements.length, agreements });
        }
        catch (e) {
            return err(e instanceof Error ? e.message : String(e));
        }
    });
    // ── Write Tools ─────────────────────────────────────
    server.tool("create_agreement", "Create a new AgentEscrow agreement with milestones. The signing wallet becomes the client.", {
        wallet_id: z
            .string()
            .optional()
            .describe("Which wallet to sign with (e.g. 'alice'). Maps to WALLET_ALICE env var. Omit for default WALLET_PRIVATE_KEY."),
        agreement_id: z.string().describe("Unique agreement ID"),
        provider: z.string().describe("Provider address (0x...)"),
        description: z.string().describe("Agreement description"),
        milestones: z
            .array(z.object({
            description: z.string(),
            monitoring_url: z.string().describe("URL to monitor for SLA checks"),
            sla_criteria: z
                .string()
                .describe("SLA criteria the AI validators will check"),
            amount: z.string().describe("Payment amount for this milestone"),
        }))
            .describe("Array of milestones"),
        wait: z
            .boolean()
            .optional()
            .default(false)
            .describe("Wait for consensus before returning (takes 1-2 min)"),
    }, async ({ wallet_id, agreement_id, provider, description, milestones, wait }) => {
        try {
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
        }
        catch (e) {
            return err(e instanceof Error ? e.message : String(e));
        }
    });
    server.tool("accept_agreement", "Accept an agreement as the provider", {
        wallet_id: z.string().optional().describe("Wallet to sign with (e.g. 'bob')"),
        agreement_id: z.string().describe("The agreement ID to accept"),
        wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    }, async ({ wallet_id, agreement_id, wait }) => {
        try {
            const txHash = await writeContract(wallet_id, "accept_agreement", [
                agreement_id,
            ]);
            if (wait)
                return json(await waitForConsensus(txHash));
            return json({ txHash });
        }
        catch (e) {
            return err(e instanceof Error ? e.message : String(e));
        }
    });
    server.tool("check_sla", "Run an AI-powered SLA check on a milestone. Validators will fetch the monitoring URL and evaluate against the SLA criteria.", {
        wallet_id: z.string().optional().describe("Wallet to sign with"),
        agreement_id: z.string().describe("The agreement ID"),
        milestone_index: z.number().describe("Milestone index (0-based)"),
        wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    }, async ({ wallet_id, agreement_id, milestone_index, wait }) => {
        try {
            const txHash = await writeContract(wallet_id, "check_sla", [
                agreement_id,
                milestone_index,
            ]);
            if (wait)
                return json(await waitForConsensus(txHash));
            return json({ txHash });
        }
        catch (e) {
            return err(e instanceof Error ? e.message : String(e));
        }
    });
    server.tool("verify_milestone", "Mark a milestone as verified after successful SLA checks", {
        wallet_id: z.string().optional().describe("Wallet to sign with"),
        agreement_id: z.string().describe("The agreement ID"),
        milestone_index: z.number().describe("Milestone index (0-based)"),
        wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    }, async ({ wallet_id, agreement_id, milestone_index, wait }) => {
        try {
            const txHash = await writeContract(wallet_id, "verify_milestone", [
                agreement_id,
                milestone_index,
            ]);
            if (wait)
                return json(await waitForConsensus(txHash));
            return json({ txHash });
        }
        catch (e) {
            return err(e instanceof Error ? e.message : String(e));
        }
    });
    server.tool("release_payment", "Release escrow payment for a verified milestone", {
        wallet_id: z.string().optional().describe("Wallet to sign with"),
        agreement_id: z.string().describe("The agreement ID"),
        milestone_index: z.number().describe("Milestone index (0-based)"),
        wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    }, async ({ wallet_id, agreement_id, milestone_index, wait }) => {
        try {
            const txHash = await writeContract(wallet_id, "release_payment", [
                agreement_id,
                milestone_index,
            ]);
            if (wait)
                return json(await waitForConsensus(txHash));
            return json({ txHash });
        }
        catch (e) {
            return err(e instanceof Error ? e.message : String(e));
        }
    });
    server.tool("dispute_milestone", "Dispute a milestone that failed SLA checks", {
        wallet_id: z.string().optional().describe("Wallet to sign with"),
        agreement_id: z.string().describe("The agreement ID"),
        milestone_index: z.number().describe("Milestone index (0-based)"),
        reason: z.string().describe("Reason for the dispute"),
        wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    }, async ({ wallet_id, agreement_id, milestone_index, reason, wait }) => {
        try {
            const txHash = await writeContract(wallet_id, "dispute_milestone", [
                agreement_id,
                milestone_index,
                reason,
            ]);
            if (wait)
                return json(await waitForConsensus(txHash));
            return json({ txHash });
        }
        catch (e) {
            return err(e instanceof Error ? e.message : String(e));
        }
    });
    server.tool("submit_evidence", "Submit evidence for a disputed milestone", {
        wallet_id: z.string().optional().describe("Wallet to sign with"),
        agreement_id: z.string().describe("The agreement ID"),
        milestone_index: z.number().describe("Milestone index (0-based)"),
        evidence: z.string().describe("Evidence text supporting your position"),
        wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    }, async ({ wallet_id, agreement_id, milestone_index, evidence, wait }) => {
        try {
            const txHash = await writeContract(wallet_id, "submit_evidence", [
                agreement_id,
                milestone_index,
                evidence,
            ]);
            if (wait)
                return json(await waitForConsensus(txHash));
            return json({ txHash });
        }
        catch (e) {
            return err(e instanceof Error ? e.message : String(e));
        }
    });
    server.tool("cancel_agreement", "Cancel an agreement (only before it's accepted)", {
        wallet_id: z.string().optional().describe("Wallet to sign with"),
        agreement_id: z.string().describe("The agreement ID"),
        wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    }, async ({ wallet_id, agreement_id, wait }) => {
        try {
            const txHash = await writeContract(wallet_id, "cancel_agreement", [
                agreement_id,
            ]);
            if (wait)
                return json(await waitForConsensus(txHash));
            return json({ txHash });
        }
        catch (e) {
            return err(e instanceof Error ? e.message : String(e));
        }
    });
    server.tool("refund_milestone", "Refund a failed milestone back to the client", {
        wallet_id: z.string().optional().describe("Wallet to sign with"),
        agreement_id: z.string().describe("The agreement ID"),
        milestone_index: z.number().describe("Milestone index (0-based)"),
        wait: z.boolean().optional().default(false).describe("Wait for consensus"),
    }, async ({ wallet_id, agreement_id, milestone_index, wait }) => {
        try {
            const txHash = await writeContract(wallet_id, "refund_failed_milestone", [
                agreement_id,
                milestone_index,
            ]);
            if (wait)
                return json(await waitForConsensus(txHash));
            return json({ txHash });
        }
        catch (e) {
            return err(e instanceof Error ? e.message : String(e));
        }
    });
}
