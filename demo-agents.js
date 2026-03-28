#!/usr/bin/env node

// ============================================================================
// AgentEscrow — Two-Agent Autonomy Demo
// Shows Alice and Bob operating autonomously via the heartbeat/portfolio pattern.
// Usage: node demo-agents.js [BASE_URL]
// ============================================================================

const BASE_URL = process.argv[2] || "http://localhost:3000";
const API_KEY = process.env.API_KEY || "test";
const POLL_INTERVAL = 15_000; // 15 seconds
const MAX_RUNTIME_MS = 45 * 60 * 1000; // 45 minutes max

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
  // 422 = consensus reached but contract rejected — never retry (the tx went through)
  if (status === 422) return false;
  if (status === 500) {
    const msg = (data?.error || "").toLowerCase();
    if (msg.includes("leader timed out") || msg.includes("transaction timed out") ||
        msg.includes("timed out") || msg.includes("took too long") ||
        msg.includes("fetch failed") || msg.includes("econnreset") || msg.includes("econnrefused") ||
        msg.includes("nonce is not consistent")) {
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

  const opts = { method, headers, signal: AbortSignal.timeout(600_000) };
  if (body) opts.body = JSON.stringify(body);

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, opts);
      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        // Server returned non-JSON (e.g. HTML error page) — treat as transient
        if (attempt < MAX_RETRIES) {
          logSystem(`⚠ Non-JSON response (HTTP ${resp.status}), retry ${attempt}/${MAX_RETRIES}...`);
          continue;
        }
        throw new Error(`HTTP ${resp.status}: Non-JSON response — ${text.slice(0, 100)}`);
      }

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
      const errCode = e.cause?.code || e.code;
      const errMsg = (e.message || "").toLowerCase();
      const isNetwork = errCode || errMsg.includes("fetch failed") || errMsg.includes("timed out") ||
        errMsg.includes("econnreset") || errMsg.includes("abort");
      if (attempt < MAX_RETRIES && isNetwork) {
        logSystem(`⚠ Network error (${errCode || errMsg.slice(0, 40)}), retry ${attempt}/${MAX_RETRIES}...`);
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

// Track one-shot actions we've already done (accept, verify, release, etc.)
const completedActions = new Set();
// Track SLA checks separately — these are repeatable, count how many we've done
let slaCheckCount = 0;
const MAX_SLA_CHECKS = 4; // Stop after this many to avoid infinite loops
// Cooldown: skip actions that recently failed (avoid hammering on transient errors)
const failCooldowns = new Map(); // key -> timestamp of last failure
const COOLDOWN_MS = 15_000; // Wait 15s before retrying a failed action (matches poll interval)
// Actions that depend on async state changes (court resolving) — no cooldown, just retry each poll
const NO_COOLDOWN_ACTIONS = new Set(["apply_verdict", "resolve_court"]);

function actionKey(action) {
  return `${action.action}:${action.agreement_id}:${action.milestone_index}`;
}

// Only permanently mark as completed for 422 (contract rejected).
// For transient errors, set a cooldown so we retry after a delay.
function handleError(agent, key, err, actionName) {
  log(agent, `${COLORS.error}Error: ${err.message}${COLORS.reset}`);
  if (err.message.includes("HTTP 422")) {
    completedActions.add(key); // Permanent — contract rejected
  } else if (!NO_COOLDOWN_ACTIONS.has(actionName)) {
    failCooldowns.set(key, Date.now()); // Temporary — retry after cooldown
  }
  // No cooldown for verdict/resolve actions — they depend on async state changes
}

function isOnCooldown(key) {
  const lastFail = failCooldowns.get(key);
  if (!lastFail) return false;
  if (Date.now() - lastFail > COOLDOWN_MS) {
    failCooldowns.delete(key);
    return false;
  }
  return true;
}

async function processAction(agent, walletId, action) {
  const key = actionKey(action);
  const agId = action.agreement_id;
  const msIdx = action.milestone_index;

  switch (action.action) {
    case "accept_agreement": {
      if (completedActions.has(key) || isOnCooldown(key)) return false;
      log(agent, `${COLORS.dim}Action: ${action.action} — ${action.description}${COLORS.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/accept`, walletId, {});
        log(agent, `${COLORS.bold}Accepted agreement ${agId}${COLORS.reset}`);
        completedActions.add(key);
        return true;
      } catch (err) {
        handleError(agent, key, err, action.action);
        return false;
      }
    }

    case "check_sla": {
      // Only Alice (client) runs SLA checks to avoid nonce conflicts
      if (agent !== "alice") return false;
      if (slaCheckCount >= MAX_SLA_CHECKS) return false;
      log(agent, `${COLORS.dim}Action: check_sla (#${slaCheckCount + 1}) — ${action.description}${COLORS.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/check-sla`, walletId, {
          milestone_index: msIdx,
        });
        slaCheckCount++;
        log(agent, `SLA check #${slaCheckCount} completed for milestone ${msIdx}`);
        return true;
      } catch (err) {
        log(agent, `${COLORS.error}Error: ${err.message}${COLORS.reset}`);
        // Only count contract rejections (422) toward the cap, not network errors
        if (err.message.includes("HTTP 422")) {
          slaCheckCount++;
        }
        return false;
      }
    }

    case "verify_milestone": {
      if (completedActions.has(key) || isOnCooldown(key)) return false;
      log(agent, `${COLORS.dim}Action: ${action.action} — ${action.description}${COLORS.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/verify`, walletId, {
          milestone_index: msIdx,
        });
        log(agent, `${COLORS.bold}Verified milestone ${msIdx}${COLORS.reset}`);
        completedActions.add(key);
        return true;
      } catch (err) {
        handleError(agent, key, err, action.action);
        return false;
      }
    }

    case "release_payment": {
      if (completedActions.has(key) || isOnCooldown(key)) return false;
      log(agent, `${COLORS.dim}Action: ${action.action} — ${action.description}${COLORS.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/release`, walletId, {
          milestone_index: msIdx,
        });
        log(agent, `${COLORS.bold}Released payment for milestone ${msIdx}${COLORS.reset}`);
        completedActions.add(key);
        return true;
      } catch (err) {
        handleError(agent, key, err, action.action);
        return false;
      }
    }

    case "dispute_milestone": {
      if (completedActions.has(key) || isOnCooldown(key)) return false;
      log(agent, `${COLORS.dim}Action: ${action.action} — ${action.description}${COLORS.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/dispute`, walletId, {
          milestone_index: msIdx,
          reason: "Automated SLA checks consistently failed — service did not meet agreed criteria.",
        });
        log(agent, `${COLORS.bold}Disputed milestone ${msIdx}${COLORS.reset}`);
        completedActions.add(key);
        return true;
      } catch (err) {
        handleError(agent, key, err, action.action);
        return false;
      }
    }

    case "deploy_court": {
      if (completedActions.has(key) || isOnCooldown(key)) return false;
      log(agent, `${COLORS.dim}Action: ${action.action} — ${action.description}${COLORS.reset}`);
      try {
        const result = await apiCall("POST", `/api/agreements/${agId}/court`, walletId, {
          action: "deploy",
          milestone_index: msIdx,
        });
        log(agent, `${COLORS.bold}Deployed Internet Court at ${result.courtAddress}${COLORS.reset}`);
        completedActions.add(key);
        return true;
      } catch (err) {
        handleError(agent, key, err, action.action);
        return false;
      }
    }

    case "accept_court": {
      if (completedActions.has(key) || isOnCooldown(key)) return false;
      if (!action.court_address) return false;
      log(agent, `${COLORS.dim}Action: ${action.action} — ${action.description}${COLORS.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/court`, walletId, {
          action: "accept",
          court_address: action.court_address,
        });
        log(agent, `${COLORS.bold}Accepted Internet Court case${COLORS.reset}`);
        completedActions.add(key);
        return true;
      } catch (err) {
        handleError(agent, key, err, action.action);
        return false;
      }
    }

    case "initiate_court": {
      if (completedActions.has(key) || isOnCooldown(key)) return false;
      if (!action.court_address) return false;
      log(agent, `${COLORS.dim}Action: ${action.action} — ${action.description}${COLORS.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/court`, walletId, {
          action: "initiate",
          court_address: action.court_address,
        });
        log(agent, `${COLORS.bold}Initiated Internet Court dispute${COLORS.reset}`);
        completedActions.add(key);
        return true;
      } catch (err) {
        handleError(agent, key, err, action.action);
        return false;
      }
    }

    case "submit_evidence": {
      if (completedActions.has(key) || isOnCooldown(key)) return false;
      if (!action.court_address) return false;
      log(agent, `${COLORS.dim}Action: ${action.action} — ${action.description}${COLORS.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/court`, walletId, {
          action: "submit_evidence",
          court_address: action.court_address,
          evidence: EVIDENCE[agent],
        });
        log(agent, `Submitted evidence for milestone ${msIdx}`);
        completedActions.add(key);
        return true;
      } catch (err) {
        handleError(agent, key, err, action.action);
        return false;
      }
    }

    case "resolve_court": {
      if (completedActions.has(key) || isOnCooldown(key)) return false;
      if (!action.court_address) return false;
      // Only Alice triggers resolution to avoid nonce conflicts
      if (agent !== "alice") return false;
      log(agent, `${COLORS.dim}Action: ${action.action} — ${action.description}${COLORS.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/court`, walletId, {
          action: "resolve",
          court_address: action.court_address,
        });
        log(agent, `${COLORS.bold}AI jury resolution triggered${COLORS.reset}`);
        completedActions.add(key);
        return true;
      } catch (err) {
        handleError(agent, key, err, action.action);
        return false;
      }
    }

    case "apply_verdict": {
      if (completedActions.has(key) || isOnCooldown(key)) return false;
      if (!action.court_address) return false;
      // Only Alice applies verdict to avoid nonce conflicts
      if (agent !== "alice") return false;
      log(agent, `${COLORS.dim}Action: ${action.action} — ${action.description}${COLORS.reset}`);
      try {
        const result = await apiCall("POST", `/api/agreements/${agId}/court`, walletId, {
          action: "apply_verdict",
          milestone_index: msIdx,
          court_address: action.court_address,
        });
        log(agent, `${COLORS.bold}Applied verdict: ${result.verdict}${COLORS.reset}`);
        completedActions.add(key);
        // If verdict was UNDETERMINED, milestone goes back to MONITORING — allow more SLA checks
        if (result.verdict === "UNDETERMINED") {
          slaCheckCount = Math.max(0, slaCheckCount - 2);
          log(agent, `${COLORS.dim}Verdict undetermined — SLA checks re-enabled${COLORS.reset}`);
        }
        return true;
      } catch (err) {
        handleError(agent, key, err, action.action);
        return false;
      }
    }

    case "refund_milestone": {
      if (completedActions.has(key) || isOnCooldown(key)) return false;
      log(agent, `${COLORS.dim}Action: ${action.action} — ${action.description}${COLORS.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/refund`, walletId, {
          milestone_index: msIdx,
        });
        log(agent, `Refunded milestone ${msIdx}`);
        completedActions.add(key);
        return true;
      } catch (err) {
        handleError(agent, key, err, action.action);
        return false;
      }
    }

    default:
      return false;
  }
}

async function runAgent(agent, walletId, address, startTime) {
  while (true) {
    // Safety timeout
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      log(agent, `${COLORS.error}Max runtime (${MAX_RUNTIME_MS / 60000}min) reached. Exiting.${COLORS.reset}`);
      return "timeout";
    }

    try {
      const portfolio = await apiCall("GET", `/api/portfolio?address=${address}`, walletId);
      // Only act on our current agreement, ignore stale ones from previous runs
      const actions = (portfolio.actions || []).filter(
        (a) => a.agreement_id === AGREEMENT_ID
      );

      if (actions.length > 0) {
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

// Monitoring scenarios — one pass, one fail, picked randomly each run
const SCENARIOS = [
  {
    description: "GitHub API health check",
    monitoring_url: "https://api.github.com",
    sla_criteria: "Response returns HTTP 200 and body is valid JSON",
    amount: "100",
    expectation: "pass",
  },
  {
    description: "GitHub API impossible SLA",
    monitoring_url: "https://api.github.com",
    sla_criteria: "Response must contain a field called 'quantum_ready' set to true and server response time must be under 1 nanosecond",
    amount: "175",
    expectation: "fail",
  },
];

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

  // Pick a random monitoring scenario
  const scenario = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];

  // Create the initial agreement (Alice's bootstrap action)
  const runId = Date.now().toString().slice(-6);
  AGREEMENT_ID = `auto-${runId}`;

  logSystem(`\nCreating initial agreement: ${AGREEMENT_ID}`);
  logSystem(`Scenario: "${scenario.description}" (expected: ${scenario.expectation})`);
  logSystem(`URL: ${scenario.monitoring_url}`);
  logSystem(`SLA: ${scenario.sla_criteria}`);
  log("alice", "Creating agreement with Bob...");

  try {
    await apiCall("POST", "/api/agreements", "alice", {
      agreement_id: AGREEMENT_ID,
      provider: bob.address,
      description: `Autonomous agent deal ${runId} — ${scenario.description}`,
      milestones: [
        {
          description: scenario.description,
          monitoring_url: scenario.monitoring_url,
          sla_criteria: scenario.sla_criteria,
          amount: scenario.amount,
        },
      ],
    });
    log("alice", `${COLORS.bold}Agreement created!${COLORS.reset}`);
  } catch (e) {
    // Network error during create — the tx may have gone through. Check if it exists.
    log("alice", `${COLORS.error}Create error: ${e.message}${COLORS.reset}`);
    logSystem("Checking if agreement was created despite the error...");
    try {
      await apiCall("GET", `/api/agreements/${AGREEMENT_ID}`, "alice");
      log("alice", `${COLORS.bold}Agreement exists on-chain — continuing.${COLORS.reset}`);
    } catch {
      logSystem(`${COLORS.error}Agreement not found. Exiting.${COLORS.reset}`);
      process.exit(1);
    }
  }

  log("alice", "Both agents now run autonomously.");
  logSystem(`\nStarting autonomous agent loops (polling every ${POLL_INTERVAL / 1000}s)...\n`);
  logSystem(`${"─".repeat(47)}`);

  const startTime = Date.now();

  // Run both agents in parallel
  const result = await Promise.race([
    runAgent("alice", "alice", alice.address, startTime),
    runAgent("bob", "bob", bob.address, startTime),
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
