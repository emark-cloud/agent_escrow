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
- `frontend/lib/server/serviceCatalog.ts` — 16 curated service templates for marketplace (pass/fail mix)
- `frontend/lib/server/marketplaceStore.ts` — Marketplace listing + activity CRUD (per-network: `marketplace-{network}.json`, `marketplace-activity-{network}.json`)
- `frontend/lib/server/agentProfiles.ts` — 5 agent profiles with roles/specialties (`agent-profiles.json`)
- `frontend/lib/server/decisionEngine.ts` — Agent decision engine (create listing, claim listing, or wait)
- `tests/direct/` — 44 direct mode contract tests (pytest + genlayer-test)
- `demo.sh` — Narrated end-to-end demo script (happy path + dispute)
- `marketplace-agents.js` — Five-agent autonomous marketplace demo (agents create listings, claim deals, run SLA checks)
- `.claude/commands/agent-demo.md` — Claude Code slash command (`/agent-demo`) for AI agent demo
- `SKILL.md` — Agent onboarding doc with curl examples for every endpoint
- `HEARTBEAT.md` — Agent periodic monitoring routine (portfolio-driven action loop)
- `GUIDELINES.md` — GenLayer development patterns reference
- `contracts/solidity/` — Solidity bridge contracts (BridgeSender, BridgeReceiver, BridgeForwarder, VerdictRegistry)
- `contracts/bridge/` — GenLayer bridge contracts (BridgeSender.py, BridgeReceiver.py)
- `relay/` — Node.js relay service (GenLayer → Base Sepolia direct relay)
- `deploy/` — Deployment scripts for bridge contracts across 3 chains
- `frontend/lib/server/base-client.ts` — viem client for Base Sepolia reads (verdict verification)
- `frontend/app/api/cross-chain/` — Cross-chain verdict status API
- `frontend/app/agreements/[id]/CrossChainStatus.tsx` — Cross-chain verdict UI component
- `hardhat.config.ts` — Hardhat v3 + zksolc config for Solidity compilation

## Contract

Deployed on **Bradbury testnet** and **StudioNet**. Contract addresses are in `frontend/lib/config.ts`.

| Network | Contract Address | Chain ID |
|---------|-----------------|----------|
| Bradbury | `0x7Ee4c7B8831cb65424B41163BE3a6808Ab3c95D3` | 4221 |
| StudioNet | `0x0c72b13441d9d1eF7C4aBfE96d7348c0AAcC24f2` | 61999 |

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

## Cross-Chain Bridge (Direct Relay)

AI jury verdicts bridge from GenLayer to Base Sepolia via a relay service, providing verifiable on-chain proof of dispute outcomes.

### Architecture
```
GenLayer Bradbury → Relay Service → Base Sepolia (VerdictRegistry)
```

The relay reads verdict messages from GenLayer's BridgeSender contract, decodes the bridge-format wrapper (extracts JSON inner data), ABI-encodes it as `(string, uint256, string, bytes32)`, and calls `VerdictRegistry.processBridgeMessage` on Base Sepolia directly.

> **Note:** zkSync Era Sepolia contracts are deployed but the zkSync→Base LayerZero hop is inactive — zkSync Era Sepolia only has LayerZero V1 (EID 10248), while Base Sepolia uses V2 (EID 40245). The direct relay achieves the same trust model for the hackathon.

### Deployed Contracts

| Chain | Contract | Address |
|-------|----------|---------|
| GenLayer Bradbury | BridgeSender.py | `0x9C97201e8Cc7788Fd435d37B2F5CBAbC4fc7B220` |
| GenLayer Bradbury | BridgeReceiver.py | `0x47e4FcAb492C3Ad56196f972A993E113535542CF` |
| zkSync Era Sepolia | BridgeReceiver | `0x35df92279eC10bcFF1Ad69ee2e7FB72330ca71B6` |
| zkSync Era Sepolia | BridgeForwarder | `0x59D20faD010702c0248719392421D31C09740212` |
| Base Sepolia | VerdictRegistry | `0x1c9aE798364AE47c2926992811d3406611BDDdc9` |

### Bridge Flow
1. `apply_verdict` on the court API sends the verdict to GenLayer BridgeSender.py
2. Relay service polls BridgeSender for new messages via `get_message_hashes` / `get_message`
3. Relay decodes bridge-format wrapper → extracts JSON inner data → ABI-encodes for VerdictRegistry
4. Relay calls `VerdictRegistry.processBridgeMessage(sourceChainId, relayAddress, abiEncodedVerdict)` on Base Sepolia
5. VerdictRegistry stores verdict on-chain, emits `VerdictRecorded` event
6. Frontend `CrossChainStatus` component fetches from `/api/cross-chain/:id` and shows bridge status

### Configuration
Bridge is enabled when both `BASE_REGISTRY_ADDRESS` and `GL_BRIDGE_SENDER` env vars are set in `frontend/.env.local`. The relay service uses `relay/.env` for its config.

### Compilation
- Base Sepolia contracts: compiled with standard `solc` via Hardhat v3 (`npx hardhat compile`)
- zkSync Era contracts: compiled with `zksolc` + `solc-zksync` (zkSync's LLVM-based compiler). Standard solc bytecode does NOT work on zkSync Era.

## Agent Integration

### REST API (`frontend/app/api/`)
Server holds private keys, executes txs, returns `{ txHash }`. Auth via `x-api-key` header + `x-wallet-id` header for writes. Optional `?wait=true` for synchronous consensus. Network selection via `x-network` header or `agentescrow_network` cookie (defaults to `bradbury`).

**Endpoints:**
- `GET /api/health` — Public. Returns contract address, chain config, RPC status, agent wallets, active network.
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
- `POST /api/agreements/:id/submit-evidence` — Submit evidence (legacy, prefer `/court` with `action: submit_evidence`)
- `POST /api/agreements/:id/resolve` — Apply IC verdict (legacy, prefer `/court` with `action: apply_verdict`)
- `POST /api/agreements/:id/refund` — Refund failed milestone
- `POST /api/agreements/:id/cancel` — Cancel agreement
- `POST /api/agreements/:id/court` — Internet Court actions (`action`: deploy, accept, initiate, submit_evidence, resolve, apply_verdict, status)
- `GET /api/cross-chain/:id?milestone=N` — Cross-chain verdict status (GenLayer + Base Sepolia)

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
- `lib/config.ts` — Dual-network config (`NETWORK_CONFIGS`), `getNetworkConfig()`, `NetworkName` type, status labels, color maps, `BASE_CONFIG` + `BRIDGE_CONFIG` for cross-chain
- `lib/genlayer.ts` — GenLayer integration (reads, writes, deploys, consensus tracking). All functions accept optional `NetworkConfig` parameter for runtime network switching. Dual consensus ABIs for StudioNet (5 params) vs Bradbury (6 params).
- `lib/server/auth.ts` — API auth helpers (`checkApiKey`, `validateMilestoneIndex`, `validateNoPipes`), wallet resolution (env + agents.json)
- `lib/server/genlayer-server.ts` — Server-side contract interaction, consensus tracking, execution error detection, IC deployment/interaction. `resolveNetwork(req)` reads `x-network` header or cookie. All functions accept `network` parameter.
- `lib/server/agentStore.ts` — Agent wallet CRUD (`agents.json`)
- `lib/server/txActivity.ts` — Active transaction tracking (`tx-activity.json`)
- `lib/internetCourtCode.ts` — IC contract source code (deployed from browser or API)
- `lib/errors.ts` — User-friendly error mapping
- `components/ConsensusTracker.tsx` — Live validator progress UI
- `components/TransactionButton.tsx` — Reusable tx button with consensus tracking
- `components/StatusBadge.tsx` — Uses `AGREEMENT_STATUS_COLORS` for agreements, `STATUS_COLORS` for milestones
- `components/AgentBadge.tsx` — Shows agent name badge next to addresses
- `hooks/useNetwork.tsx` — Network context provider + `useNetwork()` hook. Stores active network in localStorage, syncs to cookie for server-side. Handles MetaMask chain switching.
- `hooks/useAgentWallets.tsx` — Context provider for agent wallet lookup (fetched from `/api/health`)
- `hooks/useAgentActivity.ts` — Polls active agent transactions for live consensus display
- `components/NetworkSwitcher.tsx` — UI toggle for switching between Bradbury and StudioNet
- `app/dashboard/page.tsx` — On-chain analytics dashboard (stats, milestone breakdown, SLA performance)
- `app/agents/page.tsx` — Agent wallet management UI
- `app/agreements/[id]/ResolvePanel.tsx` — Internet Court dispute resolution UI
- `app/agreements/[id]/CrossChainStatus.tsx` — Cross-chain verdict bridge status display
- `lib/server/base-client.ts` — viem client for Base Sepolia (verdict reads, cross-chain stats)

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
- `./demo.sh` — Narrated curl-based demo (happy path + dispute + cross-chain verdict bridging, colored output, ~10min)
- `node marketplace-agents.js` — Five autonomous agents using portfolio heartbeat pattern

### Relay Service
```bash
cd relay
cp .env.example .env  # Fill in contract addresses and private key
npx tsx src/index.ts
```
Polls GenLayer BridgeSender and zkSync BridgeReceiver on cron intervals, forwarding messages in both directions.

### Claude Code Slash Command
`/agent-demo` — Claude acts as an AI agent, creating and completing a deal via the REST API.

## Network Switching

The app supports runtime switching between **Bradbury** and **StudioNet** from the frontend UI.

### Key Differences

| Aspect | Bradbury | StudioNet |
|--------|----------|-----------|
| Chain ID | 4221 (`0x107D`) | 61999 (`0xF22F`) |
| RPC | `zksync-os-testnet-genlayer.zksync.dev` | `studio.genlayer.com/api` |
| Consensus ABI | 6 params (`+ _validUntil`), `payable` | 5 params, `nonpayable` |
| Gas (write/deploy) | 5M / 20M | 500K / 500K |
| L1 hash == GL txId | NO (extract from event logs) | YES |
| SDK chain | `testnetBradbury` | `studionet` |

### How It Works
- **Frontend:** `NetworkProvider` context stores active network in `localStorage`. `NetworkSwitcher` pill toggle in header. All GenLayer calls read config from `useNetwork()` context.
- **Server:** API routes resolve network via `resolveNetwork(req)` which checks `x-network` header, then `agentescrow_network` cookie, defaults to `bradbury`.
- **Marketplace data:** Per-network JSON files (`marketplace-bradbury.json`, `marketplace-studionet.json`). Migration from old unscoped files on first read.
- **MetaMask:** On switch, the UI calls `wallet_switchEthereumChain` (or `wallet_addEthereumChain` if needed).

### Agent API Network Selection
Agents pass network via header: `curl -H "x-network: studionet" ...`. Default is `bradbury`.

## GenLayer Patterns
- See `GUIDELINES.md` for contract storage types, LLM patterns, and frontend integration
- **Bradbury testnet** — consensus contract `0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D`
- **StudioNet** — consensus contract `0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575`
- Reads use `genlayer-js` SDK `readContract()` with chain from active network config
- GenLayer SDK returns `Map` and `bigint` — `mapToObject()` converts safely (Number for safe values, string for large bigints)
- L1 tx hash ≠ GenLayer txId on Bradbury — extract from `NewTransaction` event logs. On StudioNet, L1 hash == GL txId.
- Gas: Bradbury ~5M writes / ~20M deploys. StudioNet ~500K for both.
- Don't send rapid-fire txs to same contract — wait for ACCEPTED before next tx
- `ensureCorrectChain()` only catches error code 4902 (chain not added), re-throws user rejections
