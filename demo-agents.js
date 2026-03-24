#!/usr/bin/env node

// ============================================================================
// AgentEscrow — Two-Agent Autonomy Demo
// Shows Alice and Bob operating autonomously via the heartbeat/portfolio pattern.
// Usage: node demo-agents.js [BASE_URL]
// ============================================================================

const BASE_URL = process.argv[2] || "http://localhost:3000";
const API_KEY = process.env.API_KEY || "test";
const POLL_INTERVAL = 15_000; // 15 seconds

// Colors for console output
const COLORS = {
  alice: "\x1b[34m", // blue
  bob: "\x1b[32m",   // green
  system: "\x1b[36m", // cyan
  error: "\x1b[31m",  // red
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

function log(agent, msg) {
  const color = COLORS[agent] || COLORS.system;
  const ts = new Date().toLocaleTimeString();
  const tag = agent.toUpperCase().padEnd(6);
  console.log(`${COLORS.dim}${ts}${COLORS.reset} ${color}[${tag}]${COLORS.reset} ${msg}`);
}

function logSystem(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`${COLORS.dim}${ts}${COLORS.reset} ${COLORS.system}[SYSTEM]${COLORS.reset} ${msg}`);
}

const MAX_RETRIES = 3;

function isRetryable(status, data) {
  if (status === 500) {
    const msg = (data?.error || "").toLowerCase();
    if (msg.includes("leader timed out") || msg.includes("transaction timed out") ||
        msg.includes("fetch failed") || msg.includes("econnreset") || msg.includes("econnrefused")) {
      return true;
    }
  }
  return false;
}

async function apiCall(method, endpoint, walletId, body) {
  const url = `${BASE_URL}${endpoint}${method === "POST" ? "?wait=true" : ""}`;
  const headers = {
    "x-api-key": API_KEY,
    "Content-Type": "application/json",
  };
  if (walletId) headers["x-wallet-id"] = walletId;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, opts);
      const data = await resp.json();

      if (resp.status >= 400) {
        if (attempt < MAX_RETRIES && isRetryable(resp.status, data)) {
          logSystem(`⚠ Transient error (HTTP ${resp.status}), retry ${attempt}/${MAX_RETRIES}...`);
          continue;
        }
        const err = data.executionError || data.error || JSON.stringify(data);
        throw new Error(`HTTP ${resp.status}: ${err}`);
      }
      return data;
    } catch (e) {
      lastError = e;
      // Retry on network-level failures (fetch itself threw)
      if (attempt < MAX_RETRIES && e.cause?.code) {
        logSystem(`⚠ Network error (${e.cause.code}), retry ${attempt}/${MAX_RETRIES}...`);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

// Pre-written evidence for disputes
const EVIDENCE = {
  alice: "As the client, SLA checks confirm the provider's service did not meet the agreed criteria. Multiple automated checks by GenLayer validators returned failures. The milestone should be marked as failed.",
  bob: "As the provider, I acknowledge the SLA criteria may have been overly strict. The underlying service was operational and returning valid responses. The criteria specification was ambiguous.",
};

// Track what we've already done to avoid duplicates
const completedActions = new Set();

function actionKey(action) {
  return `${action.action}:${action.agreement_id}:${action.milestone_index}`;
}

async function processAction(agent, walletId, action) {
  const key = actionKey(action);
  if (completedActions.has(key)) return false;

  log(agent, `${COLORS.dim}Action: ${action.action} — ${action.description}${COLORS.reset}`);

  try {
    const agId = action.agreement_id;
    const msIdx = action.milestone_index;

    switch (action.action) {
      case "accept_agreement":
        await apiCall("POST", `/api/agreements/${agId}/accept`, walletId, {});
        log(agent, `${COLORS.bold}Accepted agreement ${agId}${COLORS.reset}`);
        break;

      case "check_sla":
        await apiCall("POST", `/api/agreements/${agId}/check-sla`, walletId, {
          milestone_index: msIdx,
        });
        log(agent, `SLA check completed for milestone ${msIdx}`);
        break;

      case "verify_milestone":
        await apiCall("POST", `/api/agreements/${agId}/verify`, walletId, {
          milestone_index: msIdx,
        });
        log(agent, `${COLORS.bold}Verified milestone ${msIdx}${COLORS.reset}`);
        break;

      case "release_payment":
        await apiCall("POST", `/api/agreements/${agId}/release`, walletId, {
          milestone_index: msIdx,
        });
        log(agent, `${COLORS.bold}Released payment for milestone ${msIdx}${COLORS.reset}`);
        break;

      case "submit_evidence":
        await apiCall("POST", `/api/agreements/${agId}/court`, walletId, {
          action: "submit_evidence",
          milestone_index: msIdx,
          evidence: EVIDENCE[agent],
        });
        log(agent, `Submitted evidence for milestone ${msIdx}`);
        break;

      case "refund_milestone":
        await apiCall("POST", `/api/agreements/${agId}/refund`, walletId, {
          milestone_index: msIdx,
        });
        log(agent, `Refunded milestone ${msIdx}`);
        break;

      default:
        log(agent, `${COLORS.dim}Skipping unknown action: ${action.action}${COLORS.reset}`);
        return false;
    }

    completedActions.add(key);
    return true;
  } catch (err) {
    log(agent, `${COLORS.error}Error: ${err.message}${COLORS.reset}`);
    // Mark as completed to avoid retrying the same failing action
    completedActions.add(key);
    return false;
  }
}

async function runAgent(agent, walletId, address) {
  while (true) {
    try {
      const portfolio = await apiCall("GET", `/api/portfolio?address=${address}`, walletId);
      const actions = portfolio.actions || [];

      if (actions.length > 0) {
        log(agent, `Found ${actions.length} pending action(s)`);
        // Process one action at a time (sequential to avoid rapid-fire txs)
        for (const action of actions) {
          const did = await processAction(agent, walletId, action);
          if (did) break; // One action per cycle, wait for next poll
        }
      }

      // Check if our target agreement is completed
      for (const entry of portfolio.agreements || []) {
        if (entry.agreement.agreement_id === AGREEMENT_ID) {
          const statusName = entry.agreement.statusName;
          if (statusName === "Completed") {
            log(agent, `${COLORS.bold}Agreement ${AGREEMENT_ID} is COMPLETED!${COLORS.reset}`);
            return "completed";
          }
        }
      }
    } catch (err) {
      log(agent, `${COLORS.error}Poll error: ${err.message}${COLORS.reset}`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
}

// Global agreement ID
let AGREEMENT_ID;

async function main() {
  console.log(`\n${COLORS.bold}═══════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.bold}  AgentEscrow — Two-Agent Autonomy Demo${COLORS.reset}`);
  console.log(`${COLORS.bold}═══════════════════════════════════════════════${COLORS.reset}\n`);

  // Health check
  logSystem(`Connecting to ${BASE_URL}...`);
  const health = await apiCall("GET", "/api/health");
  logSystem(`Contract: ${health.contractAddress}`);

  const wallets = health.agentWallets || {};
  const aliceAddr = wallets.alice;
  const bobAddr = wallets.bob;

  if (!aliceAddr || !bobAddr) {
    logSystem(`${COLORS.error}Need 'alice' and 'bob' agent wallets configured.${COLORS.reset}`);
    process.exit(1);
  }

  const alice = { name: "alice", address: aliceAddr };
  const bob = { name: "bob", address: bobAddr };

  logSystem(`Alice: ${alice.address}`);
  logSystem(`Bob:   ${bob.address}`);

  // Create the initial agreement (Alice's bootstrap action)
  const runId = Date.now().toString().slice(-6);
  AGREEMENT_ID = `auto-${runId}`;

  logSystem(`\nCreating initial agreement: ${AGREEMENT_ID}`);
  log("alice", "Creating agreement with Bob...");

  await apiCall("POST", "/api/agreements", "alice", {
    agreement_id: AGREEMENT_ID,
    provider: bob.address,
    description: `Autonomous agent deal ${runId}`,
    milestones: [
      {
        description: "GitHub API health check",
        monitoring_url: "https://api.github.com",
        sla_criteria: "Response returns HTTP 200 and body is valid JSON",
        amount: "100",
      },
    ],
  });

  log("alice", `${COLORS.bold}Agreement created! Both agents now run autonomously.${COLORS.reset}`);
  logSystem(`\nStarting autonomous agent loops (polling every ${POLL_INTERVAL / 1000}s)...\n`);
  logSystem(`${"─".repeat(47)}`);

  const startTime = Date.now();

  // Run both agents in parallel
  const result = await Promise.race([
    runAgent("alice", "alice", alice.address),
    runAgent("bob", "bob", bob.address),
  ]);

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  console.log(`\n${COLORS.bold}═══════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.bold}  DEMO COMPLETE${COLORS.reset}`);
  console.log(`${COLORS.bold}═══════════════════════════════════════════════${COLORS.reset}`);
  console.log(`\n  Agreement: ${AGREEMENT_ID}`);
  console.log(`  Result: ${result}`);
  console.log(`  Time: ${elapsed}s`);
  console.log(`  Actions taken: ${completedActions.size}`);
  console.log(`\n  Both agents discovered work, took actions, and completed`);
  console.log(`  the deal autonomously using the heartbeat/portfolio pattern.\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error(`${COLORS.error}Fatal: ${err.message}${COLORS.reset}`);
  process.exit(1);
});
