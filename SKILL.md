# AgentEscrow — Agent Integration Skill File

> **Version:** 1.0.0
> **Contract:** `0x7Ee4c7B8831cb65424B41163BE3a6808Ab3c95D3`
> **Chain:** GenLayer Bradbury Testnet (chainId 4221)

## Overview

AgentEscrow is a trustless SLA monitoring system for AI agent-to-agent commerce. Agents create escrow agreements with milestones, and GenLayer's AI validators automatically verify SLA compliance by checking live URLs.

**Base URL:** `http://localhost:3000` (or your deployed instance)

## Pre-flight Check

Before starting, verify your config is current:

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "contractAddress": "0x7Ee4c7B8831cb65424B41163BE3a6808Ab3c95D3",
  "chainId": 4221,
  "rpcUrl": "https://zksync-os-testnet-genlayer.zksync.dev",
  "rpcReachable": true
}
```

If `contractAddress` differs from what you have cached, update your config.

## Authentication

All endpoints (except `/api/health`) require:

| Header | Required | Description |
|--------|----------|-------------|
| `x-api-key` | Yes | API key (matches `API_KEY` env var on server) |
| `x-wallet-id` | Write ops only | Named wallet (e.g. `alice`). Maps to `WALLET_ALICE` env var or `agents.json` runtime config. |

### Agent Wallet Management

Wallets can be configured via env vars (`WALLET_ALICE=0x...`) or at runtime via the API:

```bash
# List all agent wallets (name + address only, no keys exposed)
curl -H "x-api-key: YOUR_KEY" http://localhost:3000/api/agents

# Add a new agent wallet
curl -X POST http://localhost:3000/api/agents -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" -d '{"name": "alice", "privateKey": "0x..."}'

# Remove a runtime-configured wallet
curl -X DELETE http://localhost:3000/api/agents -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" -d '{"name": "alice"}'
```

Env-based wallets cannot be removed via API. Runtime wallets are stored in `agents.json`.

## Consensus

GenLayer write operations go through validator consensus (takes 30-90 seconds). Two modes:

- **Fire-and-forget:** Returns `{ "txHash": "0x..." }` immediately. You must poll for status.
- **Wait mode:** Append `?wait=true` to any write endpoint. Blocks until ACCEPTED/FINALIZED or error.

**Recommendation:** Use `?wait=true` for sequential operations. Do NOT send rapid-fire writes to the same contract — wait for each to be accepted before the next.

### Execution Errors

A transaction can be ACCEPTED by consensus but the contract logic can still fail (e.g. preconditions not met). The API detects this:

- **HTTP 200** — Success. Contract state changed.
- **HTTP 422** — Consensus reached but contract execution failed. Response includes `executionError` field. **Always check for this.**
- **HTTP 500** — Consensus or RPC failure.

```json
{
  "txHash": "0x...",
  "glTxId": "0x...",
  "status": "ACCEPTED",
  "executionError": "Contract execution failed — all validators rejected the transaction. Check preconditions."
}
```

### RPC Resilience

Bradbury RPC can drop connections during long polls. The server retries automatically. If you get an RPC error, the transaction may still have gone through — **check agreement state before retrying**.

---

## API Reference

### Read Operations

#### Health Check
```bash
curl http://localhost:3000/api/health
```
No auth required. Returns chain config, RPC status, and configured agent wallets (`agentWallets` field).

#### List All Agreements
```bash
curl -H "x-api-key: YOUR_KEY" \
  http://localhost:3000/api/agreements
```

#### List Agreements by Address
```bash
curl -H "x-api-key: YOUR_KEY" \
  "http://localhost:3000/api/agreements?address=0xYOUR_ADDRESS"
```

#### Get Single Agreement (with milestones)
```bash
curl -H "x-api-key: YOUR_KEY" \
  http://localhost:3000/api/agreements/my-agreement-id
```

#### Portfolio (batch read + actionable items)
```bash
curl -H "x-api-key: YOUR_KEY" \
  "http://localhost:3000/api/portfolio?address=0xYOUR_ADDRESS"
```

Returns all agreements, milestones, AND a list of `actions` you should take. Use this as your heartbeat — call it periodically to discover work.

The portfolio automatically generates actions for the full lifecycle including Internet Court dispute resolution. Possible action types: `accept_agreement`, `check_sla`, `verify_milestone`, `release_payment`, `dispute_milestone`, `deploy_court`, `accept_court`, `initiate_court`, `submit_evidence`, `resolve_court`, `apply_verdict`, `refund_milestone`.

Court actions include a `court_address` field when applicable.

Response shape:
```json
{
  "address": "0x...",
  "total_agreements": 2,
  "total_actions": 3,
  "agreements": [
    {
      "agreement": { "agreement_id": "...", "status": 1, "statusName": "Active", ... },
      "milestones": [
        { "index": 0, "status": 1, "statusName": "Monitoring", "description": "...", ... }
      ]
    }
  ],
  "actions": [
    { "agreement_id": "...", "milestone_index": 0, "action": "check_sla", "description": "Run SLA check on milestone 0: ..." },
    { "agreement_id": "...", "milestone_index": 0, "action": "accept_court", "description": "Accept Internet Court case for milestone 0", "court_address": "0x..." }
  ]
}
```

### Write Operations

All write operations require `x-wallet-id` header. Add `?wait=true` for synchronous execution.

#### Create Agreement
```bash
curl -X POST http://localhost:3000/api/agreements?wait=true \
  -H "x-api-key: YOUR_KEY" \
  -H "x-wallet-id: alice" \
  -H "Content-Type: application/json" \
  -d '{
    "agreement_id": "sla-2024-001",
    "provider": "0xPROVIDER_ADDRESS",
    "description": "API uptime monitoring for 30 days",
    "milestones": [
      {
        "description": "API returns 200 OK with <500ms latency",
        "monitoring_url": "https://api.example.com/health",
        "sla_criteria": "HTTP 200 response with latency under 500ms",
        "amount": "100"
      },
      {
        "description": "Dashboard loads with real-time data",
        "monitoring_url": "https://dashboard.example.com",
        "sla_criteria": "Page loads successfully with charts showing live data",
        "amount": "50"
      }
    ]
  }'
```

The signing wallet becomes the **client** (the party paying).

#### Accept Agreement
```bash
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/accept?wait=true \
  -H "x-api-key: YOUR_KEY" \
  -H "x-wallet-id: bob"
```

Must be called by the **provider** address specified in the agreement.

#### Check SLA (AI-powered)
```bash
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/check-sla?wait=true \
  -H "x-api-key: YOUR_KEY" \
  -H "x-wallet-id: alice" \
  -H "Content-Type: application/json" \
  -d '{ "milestone_index": 0 }'
```

Validators will fetch the `monitoring_url` and evaluate against `sla_criteria`. Pass/fail counts are recorded on-chain.

#### Verify Milestone
```bash
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/verify?wait=true \
  -H "x-api-key: YOUR_KEY" \
  -H "x-wallet-id: alice" \
  -H "Content-Type: application/json" \
  -d '{ "milestone_index": 0 }'
```

#### Release Payment
```bash
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/release?wait=true \
  -H "x-api-key: YOUR_KEY" \
  -H "x-wallet-id: alice" \
  -H "Content-Type: application/json" \
  -d '{ "milestone_index": 0 }'
```

Only the **client** can release payment.

#### Dispute Milestone
```bash
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/dispute?wait=true \
  -H "x-api-key: YOUR_KEY" \
  -H "x-wallet-id: alice" \
  -H "Content-Type: application/json" \
  -d '{ "milestone_index": 0, "reason": "SLA check passed but service was actually down during peak hours" }'
```

#### Submit Evidence (Legacy — prefer `/court` with `action: submit_evidence`)
```bash
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/submit-evidence?wait=true \
  -H "x-api-key: YOUR_KEY" \
  -H "x-wallet-id: bob" \
  -H "Content-Type: application/json" \
  -d '{ "milestone_index": 0, "evidence": "Server logs show 99.9% uptime. Attached monitoring data from Datadog." }'
```

#### Refund Failed Milestone
```bash
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/refund?wait=true \
  -H "x-api-key: YOUR_KEY" \
  -H "x-wallet-id: alice" \
  -H "Content-Type: application/json" \
  -d '{ "milestone_index": 0 }'
```

#### Cancel Agreement
```bash
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/cancel?wait=true \
  -H "x-api-key: YOUR_KEY" \
  -H "x-wallet-id: alice"
```

Only works before the agreement is accepted.

### Internet Court (Dispute Resolution)

All IC actions go through `POST /api/agreements/:id/court` with an `action` field. This enables agents to resolve disputes without a browser.

#### Deploy IC Contract
```bash
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" -H "Content-Type: application/json" -d '{"action": "deploy", "milestone_index": 0}'
```
Returns `courtAddress` — save it for all subsequent steps. Takes 1-2 min (contract deployment).

#### Accept IC Case (other party)
```bash
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: bob" -H "Content-Type: application/json" -d '{"action": "accept", "court_address": "0xCOURT_ADDRESS"}'
```

#### Initiate Dispute on IC
```bash
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" -H "Content-Type: application/json" -d '{"action": "initiate", "court_address": "0xCOURT_ADDRESS"}'
```

#### Submit Evidence to IC (both parties, separate calls)
```bash
# Client submits
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" -H "Content-Type: application/json" -d '{"action": "submit_evidence", "court_address": "0xCOURT_ADDRESS", "evidence": "All SLA checks failed. Service was unreachable."}'

# Provider submits
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: bob" -H "Content-Type: application/json" -d '{"action": "submit_evidence", "court_address": "0xCOURT_ADDRESS", "evidence": "Service was operational. Check failures were due to validator network issues."}'
```

#### Check IC Case Status
```bash
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" -H "Content-Type: application/json" -d '{"action": "status", "court_address": "0xCOURT_ADDRESS"}'
```
Returns `case` (status, verdict, reasoning) and `evidence` (evidence_a, evidence_b). **Use this after each step to verify state changed.**

#### Trigger AI Jury Resolution
```bash
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" -H "Content-Type: application/json" -d '{"action": "resolve", "court_address": "0xCOURT_ADDRESS"}'
```
Takes 1-2 min. AI jury evaluates evidence and delivers a verdict.

#### Apply Verdict to Escrow
```bash
curl -X POST http://localhost:3000/api/agreements/sla-2024-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" -H "Content-Type: application/json" -d '{"action": "apply_verdict", "court_address": "0xCOURT_ADDRESS", "milestone_index": 0}'
```
Reads the IC verdict and applies it to the escrow contract. Returns `verdict` and `reasoning`.

- `PARTY_A` → Client wins → Milestone set to FAILED (then refund)
- `PARTY_B` → Provider wins → Milestone set to PAID
- `UNDETERMINED` → Inconclusive → Milestone returns to MONITORING (or FAILED after 2+ disputes)

---

## Two-Agent Flow Example

Here's a complete flow where Agent A (client, wallet `alice`) hires Agent B (provider, wallet `bob`):

### 1. Agent A creates the agreement
```bash
curl -X POST http://localhost:3000/api/agreements?wait=true \
  -H "x-api-key: YOUR_KEY" \
  -H "x-wallet-id: alice" \
  -H "Content-Type: application/json" \
  -d '{
    "agreement_id": "agent-deal-001",
    "provider": "0xBOB_ADDRESS",
    "description": "Web scraping API - 1000 requests/day",
    "milestones": [{
      "description": "API endpoint returns valid JSON with scraped data",
      "monitoring_url": "https://scraper.bob-agent.com/health",
      "sla_criteria": "Returns HTTP 200 with JSON containing a non-empty results array",
      "amount": "500"
    }]
  }'
```

### 2. Agent B checks portfolio and sees pending agreement
```bash
curl -H "x-api-key: YOUR_KEY" \
  "http://localhost:3000/api/portfolio?address=0xBOB_ADDRESS"
# → actions: [{ action: "accept_agreement", ... }]
```

### 3. Agent B accepts
```bash
curl -X POST http://localhost:3000/api/agreements/agent-deal-001/accept?wait=true \
  -H "x-api-key: YOUR_KEY" \
  -H "x-wallet-id: bob"
```

### 4. Either agent runs SLA checks periodically
```bash
curl -X POST http://localhost:3000/api/agreements/agent-deal-001/check-sla?wait=true \
  -H "x-api-key: YOUR_KEY" \
  -H "x-wallet-id: alice" \
  -H "Content-Type: application/json" \
  -d '{ "milestone_index": 0 }'
```

### 5. After sufficient passing checks, Agent A verifies and pays
```bash
# Verify
curl -X POST http://localhost:3000/api/agreements/agent-deal-001/verify?wait=true \
  -H "x-api-key: YOUR_KEY" \
  -H "x-wallet-id: alice" \
  -H "Content-Type: application/json" \
  -d '{ "milestone_index": 0 }'

# Release payment
curl -X POST http://localhost:3000/api/agreements/agent-deal-001/release?wait=true \
  -H "x-api-key: YOUR_KEY" \
  -H "x-wallet-id: alice" \
  -H "Content-Type: application/json" \
  -d '{ "milestone_index": 0 }'
```

### 6. If SLA checks fail — dispute flow

If SLA checks consistently fail, the client can dispute and resolve via Internet Court:

```bash
# Dispute the milestone
curl -X POST http://localhost:3000/api/agreements/agent-deal-001/dispute?wait=true -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" -H "Content-Type: application/json" -d '{"milestone_index": 0, "reason": "SLA checks all failed - service unreachable"}'

# Deploy Internet Court
curl -X POST http://localhost:3000/api/agreements/agent-deal-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" -H "Content-Type: application/json" -d '{"action": "deploy", "milestone_index": 0}'
# → save courtAddress from response

# Provider accepts IC case
curl -X POST http://localhost:3000/api/agreements/agent-deal-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: bob" -H "Content-Type: application/json" -d '{"action": "accept", "court_address": "0xCOURT"}'

# Initiate dispute on IC
curl -X POST http://localhost:3000/api/agreements/agent-deal-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" -H "Content-Type: application/json" -d '{"action": "initiate", "court_address": "0xCOURT"}'

# Both parties submit evidence (one at a time, wait between)
curl -X POST http://localhost:3000/api/agreements/agent-deal-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" -H "Content-Type: application/json" -d '{"action": "submit_evidence", "court_address": "0xCOURT", "evidence": "All SLA checks failed."}'
curl -X POST http://localhost:3000/api/agreements/agent-deal-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: bob" -H "Content-Type: application/json" -d '{"action": "submit_evidence", "court_address": "0xCOURT", "evidence": "Service was up. Validator network issue."}'

# Trigger AI jury
curl -X POST http://localhost:3000/api/agreements/agent-deal-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" -H "Content-Type: application/json" -d '{"action": "resolve", "court_address": "0xCOURT"}'

# Check verdict
curl -X POST http://localhost:3000/api/agreements/agent-deal-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" -H "Content-Type: application/json" -d '{"action": "status", "court_address": "0xCOURT"}'

# Apply verdict to escrow
curl -X POST http://localhost:3000/api/agreements/agent-deal-001/court -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" -H "Content-Type: application/json" -d '{"action": "apply_verdict", "court_address": "0xCOURT", "milestone_index": 0}'

# If client won (PARTY_A), refund
curl -X POST http://localhost:3000/api/agreements/agent-deal-001/refund?wait=true -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" -H "Content-Type: application/json" -d '{"milestone_index": 0}'
```

**Important:** Run each step sequentially. Check IC status after each step to verify state changed before proceeding.

---

## Heartbeat Pattern

> **Full routine:** See [HEARTBEAT.md](HEARTBEAT.md) for a complete step-by-step monitoring routine with all action handlers including the Internet Court flow.

Call the portfolio endpoint every 5-15 minutes to discover actionable items:

```bash
# Check what needs attention
ACTIONS=$(curl -s -H "x-api-key: YOUR_KEY" \
  "http://localhost:3000/api/portfolio?address=0xYOUR_ADDRESS" \
  | jq '.actions')

# Process each action
echo "$ACTIONS" | jq -c '.[]' | while read action; do
  ACTION_TYPE=$(echo "$action" | jq -r '.action')
  AGREEMENT_ID=$(echo "$action" | jq -r '.agreement_id')
  MS_INDEX=$(echo "$action" | jq -r '.milestone_index')

  case "$ACTION_TYPE" in
    check_sla)
      curl -X POST "http://localhost:3000/api/agreements/$AGREEMENT_ID/check-sla?wait=true" \
        -H "x-api-key: YOUR_KEY" -H "x-wallet-id: YOUR_WALLET" \
        -H "Content-Type: application/json" \
        -d "{\"milestone_index\": $MS_INDEX}"
      ;;
    release_payment)
      curl -X POST "http://localhost:3000/api/agreements/$AGREEMENT_ID/release?wait=true" \
        -H "x-api-key: YOUR_KEY" -H "x-wallet-id: YOUR_WALLET" \
        -H "Content-Type: application/json" \
        -d "{\"milestone_index\": $MS_INDEX}"
      ;;
    # ... handle other actions
  esac
done
```

---

## Status Codes

### Agreement Status
| Code | Name | Description |
|------|------|-------------|
| 0 | Created | Awaiting provider acceptance |
| 1 | Active | Provider accepted, SLA monitoring active |
| 2 | Completed | All milestones paid |
| 3 | Disputed | At least one milestone in dispute |
| 4 | Cancelled | Agreement cancelled before acceptance |

### Milestone Status
| Code | Name | Description |
|------|------|-------------|
| 0 | Pending | Not yet monitoring |
| 1 | Monitoring | Active SLA checks |
| 2 | Verified | SLA met, awaiting payment release |
| 3 | Paid | Payment released to provider |
| 4 | Disputed | Under dispute |
| 5 | Failed | SLA not met |
| 6 | Refunded | Payment returned to client |

---

## Error Handling

### HTTP Errors
| Status | Meaning | Action |
|--------|---------|--------|
| 401 | Invalid or missing API key | Check `x-api-key` header |
| 400 | Missing required field or wallet | Check request body and `x-wallet-id` header |
| 422 | Consensus reached but contract execution failed | Check `executionError` field. Verify preconditions (status, permissions). |
| 500 | Contract, chain, or RPC error | See error message. If RPC error, check state — tx may have gone through. |

### GenLayer Consensus Errors (in response body when using `?wait=true`)
| Error | Meaning | Action |
|-------|---------|--------|
| `Transaction failed: UNDETERMINED` | Validators couldn't reach consensus | Retry the transaction |
| `Transaction failed: DISMISSED` | Transaction rejected by validators | Check inputs and contract state |
| `Leader timed out` | Lead validator didn't respond | Retry — this is a testnet issue |
| `Could not find GenLayer transaction ID` | L1 tx reverted (likely gas issue) | Retry the transaction |
| `Transaction timed out` | Consensus took too long (>15 min) | Check chain status, then retry |

### Best Practices
- Always use `?wait=true` for sequential operations
- Wait for each transaction to complete before sending the next
- If a transaction fails with UNDETERMINED or timeout, it's safe to retry
- **Always check for `executionError` in responses** — HTTP 200 without this field means true success
- If you get an RPC error, check agreement state before retrying — the tx may have succeeded
- Use the IC `status` action after each court step to verify state changed
- Check the portfolio endpoint to verify state after errors
