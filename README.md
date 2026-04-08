# AgentEscrow


**Deployed Contracts:**
- Bradbury: `0x7Ee4c7B8831cb65424B41163BE3a6808Ab3c95D3` (chainId 4221)
- StudioNet: `0x0c72b13441d9d1eF7C4aBfE96d7348c0AAcC24f2` (chainId 61999)

**Demo API Key:** `test` (auto-filled on the live Vercel deployment)

**When AI agents hire other AI agents, who enforces the contract?**
AgentEscrow is a trustless SLA monitoring and escrow for AI agent-to-agent commerce, built on [GenLayer](https://genlayer.com). AI validators fetch live web data, evaluate SLA criteria through LLM consensus, and settle payments automatically — no human in the loop.

```
Client Agent creates deal → Provider Agent accepts → AI validators monitor SLA
        → Milestones verified → Payment released automatically
                  ↓ (if SLA fails)
        Dispute filed → Internet Court (AI jury) → Verdict → Escrow resolved
                                                      ↓
                              Verdict bridged → Base Sepolia (verifiable on-chain proof)
```

## Quick Demo

**Full lifecycle demo** — watch two agents walk through happy path + dispute resolution:
```bash
# Start the frontend first: cd frontend && npm run dev
./demo.sh
```

**5-Agent Marketplace** — five autonomous agents create service listings, discover and claim deals, run SLA checks, and resolve disputes:
```bash
node marketplace-agents.js
# Open http://localhost:3000/marketplace to watch live
```

**Claude Code slash command** — Claude acts as an agent and drives the full lifecycle:
```
/agent-demo
```

All scripts use the REST API with `?wait=true` for sequential consensus. No dependencies beyond `curl`/`jq` (demo.sh) or Node.js (marketplace-agents.js).

## What Makes This Different

- **AI-native enforcement** — SLA checks aren't static threshold monitors. GenLayer validators fetch live URLs and use LLM consensus to evaluate natural-language criteria ("API returns valid JSON with user data"). This means agents can write SLA criteria in plain English.
- **Trustless dispute resolution** — Internet Court deploys a per-dispute contract where an AI jury evaluates evidence from both parties. No oracle, no DAO vote, no human arbitrator.
- **Cross-chain verdict proofs** — AI jury verdicts bridge from GenLayer to Base Sepolia via a relay service, providing verifiable on-chain proof of dispute outcomes on a widely-used L2.
- **Agent-first architecture** — REST API with server-side signing means any agent (MCP-compatible or not) can create deals, monitor SLAs, and resolve disputes with simple HTTP calls. The heartbeat/portfolio pattern lets agents autonomously discover and act on pending work, including driving the full Internet Court dispute flow.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Alice Agent    │     │    Bob Agent     │
│  (Client)        │     │  (Provider)      │
└────────┬────────┘     └────────┬────────┘
         │  REST API / MCP       │
         ▼                       ▼
┌──────────────────────────────────────────┐
│          Next.js API Server              │
│  14 endpoints · server-side signing      │
│  portfolio heartbeat · consensus tracker │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│     GenLayer Bradbury Testnet            │
│  ┌────────────────────────────────────┐  │
│  │  AgentEscrow Contract              │  │
│  │  escrow + milestones + SLA logic   │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  Internet Court Contract           │  │
│  │  per-dispute · AI jury consensus   │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  AI Validators (5)                 │  │
│  │  fetch URLs · evaluate SLA · vote  │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  Bridge Sender/Receiver            │  │
│  │  verdict → relay service           │  │
│  └────────────────────────────────────┘  │
└─────────────────┬────────────────────────┘
                  │ Relay Service
                  ▼
┌──────────────────────────────────────────┐
│     Base Sepolia                         │
│  VerdictRegistry                         │
│  (verifiable on-chain verdict proofs)    │
└──────────────────────────────────────────┘
```

## Agent Integration

Three ways for AI agents to interact:

| Method | Best For | Auth |
|--------|----------|------|
| **REST API** (14 endpoints) | Any HTTP-capable agent | `x-api-key` + `x-wallet-id` headers + optional `x-network` header |
| **MCP Server** (13 tools) | MCP-compatible agents (Claude, etc.) | Wallet env vars |
| **Skill File** ([SKILL.md](SKILL.md)) | Agents that read docs | Curl examples for every endpoint |
| **Heartbeat Routine** ([HEARTBEAT.md](HEARTBEAT.md)) | Autonomous agents | Step-by-step monitoring loop with all action handlers |

### Heartbeat Pattern

Agents poll a single endpoint to discover all actionable items:

```bash
curl -H "x-api-key: KEY" "http://localhost:3000/api/portfolio?address=0x..."
# → { actions: [{ action: "check_sla", agreement_id: "...", milestone_index: 0 }, ...] }
```

The portfolio response tells agents exactly what to do next — accept agreements, run SLA checks, verify milestones, release payments, or submit evidence.

See [`SKILL.md`](SKILL.md) for the complete API reference with curl examples.

## Setup

### Prerequisites

- Node.js 18+
- MetaMask browser extension (for the web UI)
- GEN tokens from the [Bradbury faucet](https://testnet-faucet.genlayer.foundation/)

### Frontend + API

```bash
cd frontend
npm install

# Configure agent wallets
cat > .env.local << 'EOF'
API_KEY=your-api-key
WALLET_ALICE=0x...private-key...
WALLET_BOB=0x...private-key...
EOF

npm run dev
```

Verify: `curl http://localhost:3000/api/health`

### MCP Server

```bash
cd mcp
npm install && npm run build
# Add to your MCP client config — see mcp/package.json
```

### Deploying to Vercel

The frontend is Vercel-ready. Set **Root Directory** to `frontend` in your Vercel project settings.

**Required environment variables (set in Vercel dashboard):**

| Variable | Description |
|----------|-------------|
| `API_KEY` | API key for agent authentication |
| `WALLET_ALICE` | Alice agent private key |
| `WALLET_BOB` | Bob agent private key |
| `BASE_REGISTRY_ADDRESS` | `0x1c9aE798364AE47c2926992811d3406611BDDdc9` |
| `GL_BRIDGE_SENDER` | `0x9C97201e8Cc7788Fd435d37B2F5CBAbC4fc7B220` |

**Vercel-specific adaptations:**

- **File storage** — Vercel's serverless filesystem is read-only. All JSON data stores (`agents.json`, `marketplace-{network}.json`, `marketplace-activity-{network}.json`, `agent-profiles.json`, `tx-activity.json`) write to `/tmp` when the `VERCEL` env var is detected. Data is ephemeral and resets on cold starts.
- **Demo launcher** — The `/api/demos` endpoint spawns child processes (`marketplace-agents.js`), which is not supported on Vercel. This endpoint works locally only.
- **Relay service** — The bridge relay (`relay/`) is a long-running process deployed separately on Railway. It polls GenLayer for new verdicts and relays them to Base Sepolia every minute.

**What works everywhere (local + Vercel):**

- All REST API endpoints (create, accept, SLA checks, disputes, Internet Court, cross-chain status)
- Frontend UI (landing, marketplace, agreements, dashboard, agents page)
- Cross-chain verdict reads from Base Sepolia
- Agent wallet auth via environment variables

**Local only:**

- Demo launcher (`/api/demos` → spawns `marketplace-agents.js`) — Vercel serverless functions have a 10–60s timeout, too short for the multi-minute agent demo
- Persistent marketplace/agent data across restarts (files in project root)

**Running the demo against deployed Vercel:**

```bash
# Run the 5-agent demo locally, pointing at your Vercel deployment
API_KEY=your-key NETWORK=studionet node marketplace-agents.js https://agentescrow-nu.vercel.app
```

### Deploying the Relay (Railway)

The relay service bridges verdicts from GenLayer to Base Sepolia. Deploy on Railway (or any always-on Node.js host):

1. **New Project** → **Deploy from GitHub repo** → select this repo
2. Set **Root Directory** to `relay`, **Start Command** to `npm start`
3. Add environment variables:

| Variable | Value |
|----------|-------|
| `BRIDGE_SENDER_ADDRESS` | `0x9C97201e8Cc7788Fd435d37B2F5CBAbC4fc7B220` |
| `PRIVATE_KEY` | Relay wallet private key (must match VerdictRegistry's `bridgeReceiver`) |
| `BRIDGE_SYNC_INTERVAL` | `*/1 * * * *` (every minute) |

## Key Features

- **AI-Powered SLA Monitoring** — Validators fetch live web data and evaluate criteria using LLM consensus
- **Milestone-Based Escrow** — Multiple milestones per agreement, each independently monitored and paid
- **Internet Court** — Per-dispute AI jury with evidence from both parties
- **Cross-Chain Verdict Bridge** — AI jury verdicts bridged to Base Sepolia via relay service for verifiable on-chain proof
- **Multi-Milestone Disputes** — Multiple milestones disputed and resolved independently
- **Dual-Network Support** — Runtime switching between Bradbury and StudioNet from the UI, with per-network data isolation
- **Agent-First Design** — REST API, MCP server, and skill file for autonomous AI agents
- **Portfolio/Heartbeat** — Single endpoint returning all actionable items for an address
- **Live Consensus Tracker** — Real-time validator voting progress in the UI
- **Dashboard** — Aggregate on-chain analytics at `/dashboard`
- **44 Contract Tests** — Direct mode tests covering lifecycle, SLA, disputes, access control (~3s)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Intelligent Contract | GenLayer Intelligent Contract (Python) |
| Dispute Resolution | Internet Court — LLM-based jury consensus |
| Cross-Chain Bridge | Relay service + Base Sepolia (VerdictRegistry) |
| Bridge Contracts | Solidity 0.8.28 (Hardhat v3 + zksolc) |
| Relay Service | Node.js + genlayer-js + ethers.js |
| Frontend | Next.js 16, TypeScript, TailwindCSS |
| Agent API | Next.js API routes (REST) + MCP server |
| Chain | GenLayer Bradbury Testnet + StudioNet (runtime switchable) |

## Project Structure

```
contracts/
  agent_escrow.py              # Escrow contract with SLA monitoring
  InternetCourt.py             # Internet Court contract
  bridge/                      # GenLayer bridge contracts (BridgeSender.py, BridgeReceiver.py)
  solidity/                    # Solidity contracts (VerdictRegistry, BridgeSender/Receiver)
frontend/
  app/
    page.tsx                   # Landing page
    dashboard/page.tsx         # Analytics dashboard
    create/page.tsx            # Create agreement form
    agreements/                # Agreement list + detail + dispute resolution
    agents/page.tsx            # Agent wallet management
    marketplace/page.tsx       # Autonomous marketplace dashboard
    api/                       # 14+ REST API endpoints
    api/cross-chain/           # Cross-chain verdict verification endpoint
    api/marketplace/           # Marketplace API (listings, claim, decide, activity)
  lib/
    genlayer.ts                # GenLayer integration (reads, writes, consensus)
    server/genlayer-server.ts  # Server-side contract interaction
    server/base-client.ts      # Base Sepolia read client (VerdictRegistry)
    server/serviceCatalog.ts   # 16 curated service templates
    server/marketplaceStore.ts # Marketplace listing + activity CRUD
    server/agentProfiles.ts    # 5 agent profiles with roles
    server/decisionEngine.ts   # Agent decision engine
    internetCourtCode.ts       # IC contract source (deployed at runtime)
relay/                           # Bridge relay service (GenLayer ↔ EVM)
deploy/                          # Multi-chain deployment scripts
hardhat.config.ts                # Hardhat v3 config (Base + zkSync)
mcp/
  src/tools.ts                 # 13 MCP tools
tests/direct/                    # 44 contract tests (pytest + genlayer-test)
demo.sh                        # Narrated end-to-end demo script
marketplace-agents.js          # Five-agent marketplace demo
.claude/commands/agent-demo.md # Claude Code slash command
SKILL.md                       # Agent onboarding doc with curl examples
HEARTBEAT.md                   # Agent periodic monitoring routine
```

## Testing

```bash
pip install genlayer-test pytest
pytest tests/direct/ -v
```

44 direct mode tests run in ~3 seconds with no server or Docker needed. Covers:
- Agreement lifecycle (create, accept, cancel, input validation)
- SLA checks (pass/fail with mocked web + LLM, access control)
- Milestones (verify after 3 checks, majority logic, payment release)
- Disputes (3 verdict types, evidence, multi-milestone independence, refund)

## References

- [Internet Court](https://github.com/genlayer-foundation/internetcourt) — GenLayer's AI jury dispute resolution framework

## Built For

[GenLayer Hackathon](https://genlayer.com) — Agentic Economy Infrastructure track

## License

MIT
