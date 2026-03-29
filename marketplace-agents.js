#!/usr/bin/env node

// ============================================================================
// AgentEscrow — 5-Agent Autonomous Marketplace Demo
// Agents discover each other, create service listings, claim deals, run SLA
// checks, and complete agreements autonomously.
// Usage: node marketplace-agents.js [BASE_URL]
// ============================================================================

const BASE_URL = process.argv[2] || "http://localhost:3000";
const API_KEY = process.env.API_KEY || "test";
const POLL_INTERVAL = 25_000; // 25 seconds between agent cycles
const AGENT_STAGGER = 10_000; // 10 seconds offset per agent
const MAX_CYCLES = 40; // Safety limit

// 5 agents with unique colors
const AGENT_COLORS = {
  sentinel: "\x1b[35m", // magenta
  oracle: "\x1b[36m",   // cyan
  atlas: "\x1b[33m",    // yellow
  nexus: "\x1b[32m",    // green
  catalyst: "\x1b[31m", // red
};
const C = {
  system: "\x1b[34m",
  error: "\x1b[31m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

function log(agent, msg) {
  const color = AGENT_COLORS[agent] || C.system;
  const ts = new Date().toLocaleTimeString();
  const tag = agent.toUpperCase().padEnd(9);
  console.log(`${C.dim}${ts}${C.reset} ${color}[${tag}]${C.reset} ${msg}`);
}

function logSystem(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`${C.dim}${ts}${C.reset} ${C.system}[SYSTEM   ]${C.reset} ${msg}`);
}

const MAX_RETRIES = 3;

function isRetryable(status, data) {
  if (status === 422) return false;
  if (status === 500) {
    const msg = (data?.error || "").toLowerCase();
    if (msg.includes("timed out") || msg.includes("fetch failed") ||
        msg.includes("econnreset") || msg.includes("nonce is not consistent")) {
      return true;
    }
  }
  return false;
}

async function apiCall(method, endpoint, walletId, body, useWait = true) {
  const wait = method === "POST" && useWait ? "?wait=true" : "";
  const url = `${BASE_URL}${endpoint}${wait}`;
  const headers = { "x-api-key": API_KEY, "Content-Type": "application/json" };
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
        if (attempt < MAX_RETRIES) {
          logSystem(`⚠ Non-JSON response (HTTP ${resp.status}), retry ${attempt}/${MAX_RETRIES}...`);
          continue;
        }
        throw new Error(`HTTP ${resp.status}: Non-JSON — ${text.slice(0, 100)}`);
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
      const errMsg = (e.message || "").toLowerCase();
      const isNetwork = e.cause?.code || errMsg.includes("fetch failed") || errMsg.includes("timed out") || errMsg.includes("abort");
      if (attempt < MAX_RETRIES && isNetwork) {
        logSystem(`⚠ Network error, retry ${attempt}/${MAX_RETRIES}...`);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

// Pre-written evidence for disputes
const CLIENT_EVIDENCE = "As the client, automated SLA checks by GenLayer validators consistently returned failures. The provider's service did not meet the agreed criteria. The milestone should be marked as failed.";
const PROVIDER_EVIDENCE = "As the provider, the underlying service was operational and returning valid responses. The SLA criteria specification may have been overly strict or ambiguous.";

// Per-agent state tracking
const agentState = {};

function getState(agent) {
  if (!agentState[agent]) {
    agentState[agent] = {
      completedActions: new Set(),
      failCooldowns: new Map(),
      slaCheckCounts: {}, // per agreement
    };
  }
  return agentState[agent];
}

function actionKey(action) {
  return `${action.action}:${action.agreement_id}:${action.milestone_index}`;
}

const COOLDOWN_MS = 25_000; // Match poll interval
const MAX_SLA_CHECKS_PER_AGREEMENT = 4;
const NO_COOLDOWN_ACTIONS = new Set(["apply_verdict", "resolve_court"]);

function handleError(agent, key, err, actionName) {
  log(agent, `${C.error}Error: ${err.message}${C.reset}`);
  const state = getState(agent);
  if (err.message.includes("HTTP 422")) {
    state.completedActions.add(key);
  } else if (!NO_COOLDOWN_ACTIONS.has(actionName)) {
    state.failCooldowns.set(key, Date.now());
  }
}

function isOnCooldown(agent, key) {
  const lastFail = getState(agent).failCooldowns.get(key);
  if (!lastFail) return false;
  if (Date.now() - lastFail > COOLDOWN_MS) {
    getState(agent).failCooldowns.delete(key);
    return false;
  }
  return true;
}

// Determine if this agent should be the "lead" for write actions on a given agreement
// (the client is the lead to avoid nonce conflicts between client and provider)
function isLeadForAgreement(agentName, agentAddress, agreement) {
  return agreement?.client?.toLowerCase() === agentAddress?.toLowerCase();
}

async function processPortfolioAction(agentName, walletId, agentAddress, action) {
  const state = getState(agentName);
  const key = actionKey(action);
  const agId = action.agreement_id;
  const msIdx = action.milestone_index;

  if (state.completedActions.has(key) || isOnCooldown(agentName, key)) return false;

  switch (action.action) {
    case "accept_agreement": {
      log(agentName, `${C.dim}Accepting agreement ${agId}${C.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/accept`, walletId, {});
        log(agentName, `${C.bold}✓ Accepted agreement ${agId}${C.reset}`);
        state.completedActions.add(key);
        return true;
      } catch (err) { handleError(agentName, key, err, action.action); return false; }
    }

    case "check_sla": {
      const count = state.slaCheckCounts[agId] || 0;
      if (count >= MAX_SLA_CHECKS_PER_AGREEMENT) return false;
      log(agentName, `${C.dim}SLA check #${count + 1} on ${agId} milestone ${msIdx}${C.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/check-sla`, walletId, { milestone_index: msIdx });
        state.slaCheckCounts[agId] = count + 1;
        log(agentName, `SLA check #${count + 1} completed`);
        return true;
      } catch (err) {
        log(agentName, `${C.error}SLA check error: ${err.message}${C.reset}`);
        state.slaCheckCounts[agId] = count + 1;
        return false;
      }
    }

    case "verify_milestone": {
      log(agentName, `${C.dim}Verifying milestone ${msIdx} on ${agId}${C.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/verify`, walletId, { milestone_index: msIdx });
        log(agentName, `${C.bold}✓ Verified milestone ${msIdx}${C.reset}`);
        state.completedActions.add(key);
        return true;
      } catch (err) { handleError(agentName, key, err, action.action); return false; }
    }

    case "release_payment": {
      log(agentName, `${C.dim}Releasing payment for ${agId} milestone ${msIdx}${C.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/release`, walletId, { milestone_index: msIdx });
        log(agentName, `${C.bold}✓ Released payment${C.reset}`);
        state.completedActions.add(key);
        return true;
      } catch (err) { handleError(agentName, key, err, action.action); return false; }
    }

    case "dispute_milestone": {
      log(agentName, `${C.dim}Disputing milestone ${msIdx} on ${agId}${C.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/dispute`, walletId, {
          milestone_index: msIdx,
          reason: "Automated SLA checks consistently failed — service did not meet agreed criteria.",
        });
        log(agentName, `${C.bold}⚠ Disputed milestone ${msIdx}${C.reset}`);
        state.completedActions.add(key);
        return true;
      } catch (err) { handleError(agentName, key, err, action.action); return false; }
    }

    case "deploy_court": {
      log(agentName, `${C.dim}Deploying Internet Court for ${agId}${C.reset}`);
      try {
        const result = await apiCall("POST", `/api/agreements/${agId}/court`, walletId, {
          action: "deploy", milestone_index: msIdx,
        });
        log(agentName, `${C.bold}⚖ Court deployed at ${result.courtAddress}${C.reset}`);
        state.completedActions.add(key);
        return true;
      } catch (err) { handleError(agentName, key, err, action.action); return false; }
    }

    case "accept_court": {
      if (!action.court_address) return false;
      log(agentName, `${C.dim}Accepting court case for ${agId}${C.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/court`, walletId, {
          action: "accept", court_address: action.court_address,
        });
        log(agentName, `${C.bold}⚖ Accepted court case${C.reset}`);
        state.completedActions.add(key);
        return true;
      } catch (err) { handleError(agentName, key, err, action.action); return false; }
    }

    case "initiate_court": {
      if (!action.court_address) return false;
      log(agentName, `${C.dim}Initiating court dispute for ${agId}${C.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/court`, walletId, {
          action: "initiate", court_address: action.court_address,
        });
        log(agentName, `${C.bold}⚖ Court dispute initiated${C.reset}`);
        state.completedActions.add(key);
        return true;
      } catch (err) { handleError(agentName, key, err, action.action); return false; }
    }

    case "submit_evidence": {
      if (!action.court_address) return false;
      const evidence = action.description?.includes("provider") ? PROVIDER_EVIDENCE : CLIENT_EVIDENCE;
      log(agentName, `${C.dim}Submitting evidence for ${agId}${C.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/court`, walletId, {
          action: "submit_evidence", court_address: action.court_address, evidence,
        });
        log(agentName, `Submitted evidence`);
        state.completedActions.add(key);
        return true;
      } catch (err) { handleError(agentName, key, err, action.action); return false; }
    }

    case "resolve_court": {
      if (!action.court_address) return false;
      log(agentName, `${C.dim}Triggering AI jury resolution for ${agId}${C.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/court`, walletId, {
          action: "resolve", court_address: action.court_address,
        });
        log(agentName, `${C.bold}⚖ AI jury resolution triggered${C.reset}`);
        state.completedActions.add(key);
        return true;
      } catch (err) { handleError(agentName, key, err, action.action); return false; }
    }

    case "apply_verdict": {
      if (!action.court_address) return false;
      log(agentName, `${C.dim}Applying verdict for ${agId}${C.reset}`);
      try {
        const result = await apiCall("POST", `/api/agreements/${agId}/court`, walletId, {
          action: "apply_verdict", milestone_index: msIdx, court_address: action.court_address,
        });
        log(agentName, `${C.bold}⚖ Verdict applied: ${result.verdict}${C.reset}`);
        // Cross-chain bridge: check if verdict was sent to Base Sepolia
        if (result.bridge?.txHash) {
          log(agentName, `${C.dim}🔗 Bridge TX: ${result.bridge.txHash}${C.reset}`);
          try {
            const ccStatus = await apiCall("GET", `/api/cross-chain/${agId}?milestone=${msIdx}`);
            if (ccStatus.base?.bridged) {
              log(agentName, `${C.green}✓ Verdict confirmed on Base Sepolia (${ccStatus.base.verdict.verdict})${C.reset}`);
            } else {
              log(agentName, `${C.dim}Verdict pending on Base (relay will deliver it)${C.reset}`);
            }
          } catch { /* cross-chain check is non-blocking */ }
        }
        state.completedActions.add(key);
        return true;
      } catch (err) { handleError(agentName, key, err, action.action); return false; }
    }

    case "refund_milestone": {
      log(agentName, `${C.dim}Refunding milestone ${msIdx} on ${agId}${C.reset}`);
      try {
        await apiCall("POST", `/api/agreements/${agId}/refund`, walletId, { milestone_index: msIdx });
        log(agentName, `Refunded milestone ${msIdx}`);
        state.completedActions.add(key);
        return true;
      } catch (err) { handleError(agentName, key, err, action.action); return false; }
    }

    default:
      return false;
  }
}

// ============================================================================
// Agent loop: marketplace actions + portfolio processing
// ============================================================================

async function runAgentCycle(agentName, walletId, agentAddress) {
  // Phase 1: Marketplace decision — create or claim a listing
  try {
    const decision = await apiCall("POST", "/api/marketplace/decide", walletId, { agent: agentName }, false);

    if (decision.action === "create_listing" && decision.listing) {
      log(agentName, `${C.dim}Creating listing: "${decision.listing.title}"${C.reset}`);
      try {
        const result = await apiCall("POST", "/api/marketplace", walletId, {
          agent: agentName,
          ...decision.listing,
        }, false);
        log(agentName, `${C.bold}+ Listed "${result.listing.title}" (${result.listing.price} GEN)${C.reset}`);
      } catch (err) {
        log(agentName, `${C.error}Listing error: ${err.message}${C.reset}`);
      }
    } else if (decision.action === "claim_listing" && decision.listing_id) {
      log(agentName, `${C.dim}Claiming listing ${decision.listing_id}: ${decision.reasoning}${C.reset}`);
      try {
        const result = await apiCall("POST", `/api/marketplace/${decision.listing_id}/claim`, walletId, {
          agent: agentName,
        });
        log(agentName, `${C.bold}→ Claimed listing → agreement ${result.agreement_id}${C.reset}`);
      } catch (err) {
        log(agentName, `${C.error}Claim error: ${err.message}${C.reset}`);
      }
    } else {
      log(agentName, `${C.dim}Waiting: ${decision.reasoning}${C.reset}`);
    }
  } catch (err) {
    log(agentName, `${C.error}Decision error: ${err.message}${C.reset}`);
  }

  // Phase 2: Portfolio processing — work on existing agreements
  try {
    const portfolio = await apiCall("GET", `/api/portfolio?address=${agentAddress}`, walletId);
    const actions = portfolio.actions || [];

    // Build client lookup: agreement_id -> is this agent the client?
    const isClientOf = {};
    for (const entry of portfolio.agreements || []) {
      const ag = entry.agreement;
      isClientOf[ag.agreement_id] = ag.client?.toLowerCase() === agentAddress.toLowerCase();
    }

    if (actions.length > 0) {
      // Process one action per cycle to avoid nonce conflicts
      for (const action of actions) {
        const agId = action.agreement_id;
        const isClient = isClientOf[agId];
        const isProvider = isClientOf[agId] === false; // explicitly false, not undefined

        // Role-based gating to prevent nonce conflicts:
        // - Client-only: verify, release, dispute, check_sla, deploy_court, initiate_court, resolve_court, apply_verdict
        // - Provider-only: accept_agreement, accept_court
        // - Both: submit_evidence, refund_milestone
        const clientOnly = ["verify_milestone", "release_payment", "dispute_milestone", "check_sla",
                            "deploy_court", "initiate_court", "resolve_court", "apply_verdict"];
        const providerOnly = ["accept_agreement", "accept_court"];

        if (clientOnly.includes(action.action) && !isClient) continue;
        if (providerOnly.includes(action.action) && !isProvider) continue;

        const did = await processPortfolioAction(agentName, walletId, agentAddress, action);
        if (did) break;
      }
    }
  } catch (err) {
    log(agentName, `${C.error}Portfolio error: ${err.message}${C.reset}`);
  }
}

// ============================================================================
// Bootstrap: ensure all 5 agents have wallets
// ============================================================================

const AGENT_NAMES = ["sentinel", "oracle", "atlas", "nexus", "catalyst"];

async function ensureAgentWallets(existingWallets) {
  const crypto = await import("crypto");

  for (const name of AGENT_NAMES) {
    if (existingWallets[name]) {
      logSystem(`${name}: ${existingWallets[name]}`);
      continue;
    }
    // Generate a random private key and register via API (server derives the address)
    const key = "0x" + crypto.randomBytes(32).toString("hex");
    try {
      await apiCall("POST", "/api/agents", null, { name, privateKey: key }, false);
      // Re-fetch health to get the derived address
      const health = await apiCall("GET", "/api/health");
      const addr = (health.agentWallets || {})[name];
      if (addr) {
        existingWallets[name] = addr;
        logSystem(`${name}: ${addr} (new)`);
      } else {
        logSystem(`${C.error}Wallet created for ${name} but address not found in health${C.reset}`);
      }
    } catch (err) {
      logSystem(`${C.error}Failed to create wallet for ${name}: ${err.message}${C.reset}`);
    }
  }
  return existingWallets;
}

async function seedProfiles() {
  // Profiles are seeded by the API when first accessed via decide endpoint
  // Just trigger a decide call for one agent to ensure profiles exist
  try {
    await apiCall("POST", "/api/marketplace/decide", AGENT_NAMES[0], { agent: AGENT_NAMES[0] }, false);
  } catch {
    // Profile might not exist yet, that's OK — the decide endpoint will create it
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(`\n${C.bold}═══════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}  AgentEscrow — 5-Agent Autonomous Marketplace${C.reset}`);
  console.log(`${C.bold}═══════════════════════════════════════════════════════${C.reset}\n`);

  // Health check
  logSystem(`Connecting to ${BASE_URL}...`);
  const health = await apiCall("GET", "/api/health");
  logSystem(`Contract: ${health.contractAddress}`);

  let wallets = {};
  // Collect existing wallets from health endpoint
  for (const [name, addr] of Object.entries(health.agentWallets || {})) {
    wallets[name.toLowerCase()] = addr;
  }

  // Ensure all 5 agents have wallets
  logSystem(`\n--- Bootstrap: Agent Wallets ---`);
  wallets = await ensureAgentWallets(wallets);

  const missing = AGENT_NAMES.filter((n) => !wallets[n]);
  if (missing.length > 0) {
    logSystem(`${C.error}Missing wallets for: ${missing.join(", ")}. Exiting.${C.reset}`);
    process.exit(1);
  }

  // Print all wallet addresses prominently (for faucet funding)
  console.log(`\n${C.bold}  Agent Wallet Addresses (fund these via faucet):${C.reset}`);
  console.log(`  ${"─".repeat(50)}`);
  for (const name of AGENT_NAMES) {
    const color = AGENT_COLORS[name] || C.system;
    console.log(`  ${color}${name.padEnd(10)}${C.reset} ${wallets[name]}`);
  }
  console.log(`  ${"─".repeat(50)}\n`);

  // Seed profiles
  logSystem(`\n--- Seed: Agent Profiles ---`);
  await seedProfiles();
  logSystem(`Profiles ready.`);

  // Phase 1: Providers create initial listings (staggered)
  logSystem(`\n--- Seed: Initial Listings ---`);
  const providers = ["sentinel", "oracle", "catalyst"];
  for (const name of providers) {
    try {
      const decision = await apiCall("POST", "/api/marketplace/decide", name, { agent: name }, false);
      if (decision.action === "create_listing" && decision.listing) {
        const result = await apiCall("POST", "/api/marketplace", name, {
          agent: name,
          ...decision.listing,
        }, false);
        log(name, `${C.bold}+ Listed "${result.listing.title}" (${result.listing.price} GEN)${C.reset}`);
      }
    } catch (err) {
      log(name, `${C.error}Seed error: ${err.message}${C.reset}`);
    }
  }

  // Show marketplace state
  try {
    const { stats } = await apiCall("GET", "/api/marketplace");
    logSystem(`Marketplace: ${stats.available} available, ${stats.claimed} claimed, ${stats.total} total`);
  } catch {}

  logSystem(`\n--- Autonomous Loop (${AGENT_NAMES.length} agents, ${POLL_INTERVAL / 1000}s cycles) ---\n`);
  logSystem(`${"─".repeat(55)}`);

  // Run all agents in staggered parallel loops
  let cycle = 0;
  const activeAgents = new Set(AGENT_NAMES);

  while (cycle < MAX_CYCLES && activeAgents.size > 0) {
    cycle++;
    logSystem(`\n── Cycle ${cycle} ──`);

    for (const name of AGENT_NAMES) {
      if (!activeAgents.has(name)) continue;

      // Stagger: each agent starts offset from the others
      const staggerDelay = AGENT_NAMES.indexOf(name) * AGENT_STAGGER;
      if (cycle === 1 && staggerDelay > 0) {
        log(name, `${C.dim}Starting in ${staggerDelay / 1000}s...${C.reset}`);
        await new Promise((r) => setTimeout(r, staggerDelay));
      }

      // walletId = agent name — auth.ts resolves this via agents.json lookup
      await runAgentCycle(name, name, wallets[name]);
    }

    // Show marketplace stats at end of each cycle
    try {
      const { stats } = await apiCall("GET", "/api/marketplace");
      logSystem(`Marketplace: ${stats.available} avail | ${stats.claimed} active | ${stats.completed} done | ${stats.failed} failed`);
    } catch {}

    if (cycle < MAX_CYCLES) {
      logSystem(`Sleeping ${POLL_INTERVAL / 1000}s...`);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }
  }

  console.log(`\n${C.bold}═══════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}  MARKETPLACE DEMO COMPLETE${C.reset}`);
  console.log(`${C.bold}═══════════════════════════════════════════════════════${C.reset}`);
  console.log(`\n  Cycles: ${cycle}`);
  console.log(`  Agents: ${AGENT_NAMES.length}`);
  console.log(`\n  Agents autonomously created listings, claimed deals, and`);
  console.log(`  processed SLA checks through the marketplace.\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error(`${C.error}Fatal: ${err.message}${C.reset}`);
  process.exit(1);
});
