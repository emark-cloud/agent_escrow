# AgentEscrow

Trustless SLA monitoring for AI agent-to-agent commerce, built on GenLayer.

## Project Structure

- `contracts/agent_escrow.py` — GenLayer Intelligent Contract (escrow + SLA logic)
- `contracts/InternetCourt.py` — IC contract source (kept in sync with embedded version)
- `frontend/` — Next.js 16 + TypeScript + TailwindCSS app
- `frontend/lib/internetCourtCode.ts` — IC contract (embedded, deployed from frontend). **Authoritative copy** — `contracts/InternetCourt.py` is synced from this.
- `mcp/` — MCP server for AI agent integration (13 tools)
- `frontend/lib/server/agentStore.ts` — Runtime agent wallet store (reads/writes `agents.json`)
- `frontend/lib/server/txActivity.ts` — Active transaction tracking for agent consensus UI
- `tests/direct/` — 44 direct mode contract tests (pytest + genlayer-test)
- `demo.sh` — Narrated end-to-end demo script (happy path + dispute)
- `demo-agents.js` — Two-agent autonomy demo (heartbeat/portfolio pattern, random pass/fail scenario, full IC court flow)
- `.claude/commands/agent-demo.md` — Claude Code slash command (`/agent-demo`) for AI agent demo
- `SKILL.md` — Agent onboarding doc with curl examples for every endpoint
- `HEARTBEAT.md` — Agent periodic monitoring routine (portfolio-driven action loop)
- `GUIDELINES.md` — GenLayer development patterns reference

## Contract

Deployed on **Bradbury testnet**. Contract address is in `frontend/lib/config.ts`.

### Key Contract Methods
- `create_agreement(agreement_id, provider, description, ms_descriptions, ms_urls, ms_criteria, ms_amounts)` — Client creates escrow (pipe-separated milestone fields)
- `accept_agreement(agreement_id)` — Provider accepts
- `check_sla(agreement_id, milestone_index)` — AI-powered live SLA check
- `verify_milestone` / `release_payment` — Settlement flow
- `dispute_milestone(agreement_id, milestone_index, reason)` — Flag milestone as disputed (works in ACTIVE or DISPUTED state for multi-milestone disputes)
- `resolve_dispute(agreement_id, milestone_index, verdict, court_address)` — Apply IC verdict to escrow (client or provider only)
- `submit_evidence(agreement_id, milestone_index, evidence)` — Submit evidence for disputed milestone
- `cancel_agreement(agreement_id)` — Cancel before acceptance
- `refund_failed_milestone(agreement_id, milestone_index)` — Refund a failed milestone

### Contract Input Validation
- **`agreement_id`** must not contain `:`, `|`, or `,` characters (used as delimiters internally)
- **Milestone fields** must not contain `|` (pipe-separated encoding). Validated in API/MCP before sending.
- **`milestone_index`** must be a non-negative integer. Validated in API routes and MCP.

### Dispute State Machine
- An agreement can have multiple disputed milestones simultaneously
- `dispute_milestone` works when agreement is ACTIVE or DISPUTED
- `resolve_dispute` sets agreement back to ACTIVE, DISPUTED, or COMPLETED depending on remaining milestone states
- Milestones in PAID, REFUNDED, or FAILED status cannot be disputed

### `get_agreements_by_address` Return Type
Returns a **comma-separated string**, not a list. All `readContract` wrappers (client-side, server-side, MCP) automatically split this into `string[]`. If calling the contract directly, split the result: `result ? result.split(",") : []`.

### Internet Court (IC) Contract
Deployed from frontend or via API at runtime. Resolves disputes via AI jury consensus.

**Flow:** Deploy IC → Accept (other party) → Initiate Dispute → Submit Evidence (both parties, separate txs) → Resolve (triggers AI jury) → Apply Verdict to Escrow

**IC Status Values:** `created` → `active` → `disputed` → `resolving` → `resolved` (also `cancelled`). The portfolio endpoint reads IC status and generates appropriate actions for each step automatically.

**API flow:** All steps available via `POST /api/agreements/:id/court` with `action` field: `deploy`, `accept`, `initiate`, `submit_evidence`, `resolve`, `apply_verdict`, `status`. Agents can run the full dispute flow without a browser.

**Portfolio-driven court flow:** The portfolio endpoint (`GET /api/portfolio`) automatically surfaces IC actions based on court status: `deploy_court` (no court yet), `accept_court` (created), `initiate_court` (active), `submit_evidence` (disputed, checks who has submitted), `resolve_court` (both evidence submitted), `apply_verdict` (resolved). Agents using the heartbeat pattern drive the entire court flow without knowing the state machine.

**Critical:** Evidence submission and AI resolution must be separate transactions. If combined, LLM failure reverts the evidence storage.

**Address comparison:** Always use `.as_hex.lower()` for address comparisons in contracts. Direct `==` on Address objects can fail on Bradbury due to checksum differences.

## Agent Integration

### REST API (`frontend/app/api/`)
Server holds private keys, executes txs, returns `{ txHash }`. Auth via `x-api-key` header + `x-wallet-id` header for writes. Optional `?wait=true` for synchronous consensus.

**Endpoints:**
- `GET /api/health` — Public. Returns contract address, chain config, RPC status, agent wallets.
- `GET /api/agreements` — List all (or `?address=0x...` to filter)
- `GET /api/agreements/:id` — Single agreement with milestones
- `GET /api/agreements/:id/activity` — Active agent transactions (for live consensus tracking)
- `GET /api/portfolio?address=0x...` — Batch read: all agreements + milestones + actionable items (includes full IC court flow actions)
- `GET /api/agents` — List agent wallets (name + address, no private keys)
- `POST /api/agents` — Add agent wallet `{ name, privateKey }`
- `DELETE /api/agents` — Remove agent wallet `{ name }` (config-based only)
- `POST /api/agreements` — Create agreement
- `POST /api/agreements/:id/accept` — Accept agreement
- `POST /api/agreements/:id/check-sla` — Run AI SLA check
- `POST /api/agreements/:id/verify` — Verify milestone
- `POST /api/agreements/:id/release` — Release payment
- `POST /api/agreements/:id/dispute` — Dispute milestone
- `POST /api/agreements/:id/submit-evidence` — Submit evidence
- `POST /api/agreements/:id/resolve` — Apply IC verdict (legacy, prefer `/court` with `action: apply_verdict`)
- `POST /api/agreements/:id/refund` — Refund failed milestone
- `POST /api/agreements/:id/cancel` — Cancel agreement
- `POST /api/agreements/:id/court` — Internet Court actions (`action`: deploy, accept, initiate, submit_evidence, resolve, apply_verdict, status)

### Consensus Result & Execution Errors
With `?wait=true`, all write endpoints return a `ConsensusResult`. On GenLayer, a transaction can be ACCEPTED by consensus but the contract execution can still fail (validators agreed on the error). The API now detects this:
- **HTTP 200** — Consensus reached AND contract execution succeeded
- **HTTP 422** — Consensus reached BUT contract execution failed. Response includes `executionError` field. Detected via `lastRound.validatorVotesName` all being "DISAGREE".
- **HTTP 500** — Consensus failed (UNDETERMINED, DISMISSED, timeout) or RPC error

Agents should check for `executionError` in the response or HTTP status >= 400.

### RPC Resilience
Bradbury RPC can drop connections during long consensus polls. The server retries transient "fetch failed" errors automatically — only consensus-level failures (UNDETERMINED, DISMISSED, timeout) are thrown. If an API call errors with an RPC message, the transaction may still have gone through — check agreement state before retrying.

### MCP Server (`mcp/`)
Same capabilities as REST API. 13 tools: `get_agreement`, `list_agreements`, `create_agreement`, `accept_agreement`, `check_sla`, `verify_milestone`, `release_payment`, `dispute_milestone`, `submit_evidence`, `resolve_dispute`, `cancel_agreement`, `refund_milestone`, `check_portfolio`.

### SKILL.md
Complete agent onboarding doc with curl examples, error handling, heartbeat pattern, and two-agent flow walkthrough. Agents that aren't MCP-compatible use this.

### Agent Wallet Management
Agent wallets can be configured two ways:
1. **Environment variables** (`WALLET_ALICE=0x...` in `.env.local`) — immutable at runtime, shown as "env" source
2. **Runtime config** (`frontend/agents.json`) — managed via `/agents` UI or `GET/POST/DELETE /api/agents`

`getWalletForRequest()` in `auth.ts` checks env vars first, then falls back to `agents.json`. The health endpoint merges both sources.

### Agent Transaction Activity
When agents use `?wait=true`, the server tracks active transactions in `tx-activity.json`. The agreement detail page polls `/api/agreements/:id/activity` and shows live ConsensusTracker progress for agent-initiated transactions.

### Auth & Security
- API key compared with `crypto.timingSafeEqual` (timing-safe)
- Wallet env var names not leaked in error messages
- `milestone_index` validated as non-negative integer on all routes
- Pipe characters rejected in milestone fields to prevent encoding corruption

## Frontend

```bash
cd frontend
npm install
npm run dev
```

### Key Frontend Files
- `lib/config.ts` — Chain config, contract addresses, status labels, separate color maps for agreement vs milestone status
- `lib/genlayer.ts` — GenLayer integration (reads, writes, deploys, consensus tracking)
- `lib/server/auth.ts` — API auth helpers (`checkApiKey`, `validateMilestoneIndex`, `validateNoPipes`), wallet resolution (env + agents.json)
- `lib/server/genlayer-server.ts` — Server-side contract interaction, consensus tracking, execution error detection, IC deployment/interaction
- `lib/server/agentStore.ts` — Agent wallet CRUD (`agents.json`)
- `lib/server/txActivity.ts` — Active transaction tracking (`tx-activity.json`)
- `lib/internetCourtCode.ts` — IC contract source code (deployed from browser or API)
- `lib/errors.ts` — User-friendly error mapping
- `components/ConsensusTracker.tsx` — Live validator progress UI
- `components/TransactionButton.tsx` — Reusable tx button with consensus tracking
- `components/StatusBadge.tsx` — Uses `AGREEMENT_STATUS_COLORS` for agreements, `STATUS_COLORS` for milestones
- `components/AgentBadge.tsx` — Shows agent name badge next to addresses
- `hooks/useAgentWallets.tsx` — Context provider for agent wallet lookup (fetched from `/api/health`)
- `hooks/useAgentActivity.ts` — Polls active agent transactions for live consensus display
- `app/dashboard/page.tsx` — On-chain analytics dashboard (stats, milestone breakdown, SLA performance)
- `app/agents/page.tsx` — Agent wallet management UI
- `app/agreements/[id]/ResolvePanel.tsx` — Internet Court dispute resolution UI

## Testing

### Contract Tests (Direct Mode)
44 tests covering the full contract surface. Runs in ~3s with no server needed.

```bash
pip install genlayer-test pytest
pytest tests/direct/ -v
```

**Test files:**
- `tests/direct/test_agreement_lifecycle.py` — Create, accept, cancel, validation, access control (16 tests)
- `tests/direct/test_sla_and_milestones.py` — SLA checks with mocked web+LLM, verify, release, multi-milestone (12 tests)
- `tests/direct/test_disputes.py` — Dispute, evidence, resolve (3 verdicts), multi-milestone independence, refund (16 tests)
- `tests/direct/conftest.py` — Helpers: `addr()` for bytes→hex, `mock_sla_pass/fail()` with gl_call_hook for `prompt_non_comparative`, `create_and_accept()` setup helper

**Direct mode notes:**
- Fixtures return raw `bytes` addresses — use `addr(direct_bob)` helper to convert to `0x`-prefixed hex for contract `Address()` constructor
- `gl.eq_principle.prompt_non_comparative` calls `ExecPromptTemplate` which isn't handled natively — use `direct_vm._gl_call_hook` to intercept and return `{"ok": "PASS: ..."}` format
- View methods return actual dataclass objects (attribute access: `ag.status`), not dicts

### Demo Scripts
- `./demo.sh` — Narrated curl-based demo (happy path + dispute, colored output, ~10min)
- `node demo-agents.js` — Two autonomous agents using portfolio heartbeat pattern

### Claude Code Slash Command
`/agent-demo` — Claude acts as an AI agent, creating and completing a deal via the REST API.

## GenLayer Patterns
- See `GUIDELINES.md` for contract storage types, LLM patterns, and frontend integration
- **Bradbury testnet** — consensus contract `0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D`
- Reads use `genlayer-js` SDK `readContract()` with `testnetBradbury` chain
- GenLayer SDK returns `Map` and `bigint` — `mapToObject()` converts safely (Number for safe values, string for large bigints)
- L1 tx hash ≠ GenLayer txId on Bradbury — extract from `NewTransaction` event logs
- Gas: ~5M for writes (`0x4C4B40`), ~20M for contract deployments (`0x1312D00`)
- Don't send rapid-fire txs to same contract — wait for ACCEPTED before next tx
- `ensureCorrectChain()` only catches error code 4902 (chain not added), re-throws user rejections
