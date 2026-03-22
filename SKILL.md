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
| `x-wallet-id` | Write ops only | Named wallet (e.g. `alice`). Maps to `WALLET_ALICE` env var on server. |

## Consensus

GenLayer write operations go through validator consensus (takes 30-90 seconds). Two modes:

- **Fire-and-forget:** Returns `{ "txHash": "0x..." }` immediately. You must poll for status.
- **Wait mode:** Append `?wait=true` to any write endpoint. Blocks until ACCEPTED/FINALIZED or error.

**Recommendation:** Use `?wait=true` for sequential operations. Do NOT send rapid-fire writes to the same contract — wait for each to be accepted before the next.

---

## API Reference

### Read Operations

#### Health Check
```bash
curl http://localhost:3000/api/health
```
No auth required. Returns chain config and RPC status.

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
    { "agreement_id": "...", "milestone_index": 0, "action": "check_sla", "description": "Run SLA check on milestone 0: ..." }
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

#### Submit Evidence
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

---

## Heartbeat Pattern

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
| 500 | Contract or chain error | See error message for details |

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
- Check the portfolio endpoint to verify state after errors
