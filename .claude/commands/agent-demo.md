Act as an autonomous AI agent that uses the AgentEscrow REST API to create and complete a deal.

You are "Alice," an AI agent client. You will create an agreement with Bob, then autonomously process it through the full lifecycle using the API.

## Setup

1. First, check the server health to get agent addresses:
```bash
curl -s http://localhost:3000/api/health | jq .
```

2. Use the API key from the response or environment. All requests need:
   - Header: `x-api-key: test` (or your configured key)
   - Header: `x-wallet-id: alice` (or `bob` when acting as Bob)
   - Append `?wait=true` to all POST requests for synchronous consensus

## Your Mission

Execute this flow step by step, showing the responses:

### Phase 1: Create Agreement
Create an agreement with a unique ID (use a timestamp suffix) monitoring the GitHub API:
```bash
curl -s -X POST "http://localhost:3000/api/agreements?wait=true" \
  -H "x-api-key: test" -H "x-wallet-id: alice" -H "Content-Type: application/json" \
  -d '{"agreement_id": "agent-demo-TIMESTAMP", "provider": "BOB_ADDRESS", "description": "AI agent monitoring deal", "milestones": [{"description": "GitHub API health", "monitoring_url": "https://api.github.com", "sla_criteria": "Response returns HTTP 200 and body is valid JSON", "amount": "100"}]}'
```

### Phase 2: Accept as Bob
Switch to Bob's wallet and accept:
```bash
curl -s -X POST "http://localhost:3000/api/agreements/AGREEMENT_ID/accept?wait=true" \
  -H "x-api-key: test" -H "x-wallet-id: bob" -H "Content-Type: application/json" -d '{}'
```

### Phase 3: Run SLA Checks
Run 3 SLA checks (required minimum) as Alice:
```bash
curl -s -X POST "http://localhost:3000/api/agreements/AGREEMENT_ID/check-sla?wait=true" \
  -H "x-api-key: test" -H "x-wallet-id: alice" -H "Content-Type: application/json" \
  -d '{"milestone_index": 0}'
```

### Phase 4: Verify & Pay
After 3 passing checks, verify the milestone and release payment:
```bash
curl -s -X POST "http://localhost:3000/api/agreements/AGREEMENT_ID/verify?wait=true" \
  -H "x-api-key: test" -H "x-wallet-id: alice" -H "Content-Type: application/json" \
  -d '{"milestone_index": 0}'
```
```bash
curl -s -X POST "http://localhost:3000/api/agreements/AGREEMENT_ID/release?wait=true" \
  -H "x-api-key: test" -H "x-wallet-id: alice" -H "Content-Type: application/json" \
  -d '{"milestone_index": 0}'
```

### Phase 5: Verify Completion
Check final state:
```bash
curl -s "http://localhost:3000/api/agreements/AGREEMENT_ID" -H "x-api-key: test" | jq .
```

## Rules
- Wait for each consensus round to complete before the next call (~30-90s each)
- If a call returns HTTP 422, read the `executionError` and adapt
- Show each response and narrate what happened
- After completion, summarize the full lifecycle with timings
