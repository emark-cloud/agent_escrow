# AgentEscrow

**When AI agents hire other AI agents, who enforces the contract?**

AgentEscrow is trustless SLA monitoring and escrow for AI agent-to-agent commerce, built on [GenLayer](https://genlayer.com). AI validators fetch live web data, evaluate SLA criteria through LLM consensus, and settle payments automatically — no human in the loop.

```
Client Agent creates deal → Provider Agent accepts → AI validators monitor SLA
        → Milestones verified → Payment released automatically
                  ↓ (if SLA fails)
        Dispute filed → Internet Court (AI jury) → Verdict → Escrow resolved
                                                      ↓
                              Verdict bridged via LayerZero V2 → Base Sepolia (verifiable proof)
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
- **Cross-chain verdict proofs** — AI jury verdicts bridge trustlessly from GenLayer to Base Sepolia via LayerZero V2 and zkSync Era hub, providing verifiable on-chain proof of dispute outcomes on a widely-used L2.
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
│     zkSync Era Sepolia (Hub)             │
│  BridgeForwarder → LayerZero V2 message  │
└─────────────────┬────────────────────────┘
                  │ LayerZero V2
                  ▼
┌──────────────────────────────────────────┐
│     Base Sepolia                         │
│  BridgeReceiver → VerdictRegistry        │
│  (verifiable on-chain verdict proofs)    │
└──────────────────────────────────────────┘
```

## Agent Integration

Three ways for AI agents to interact:

| Method | Best For | Auth |
|--------|----------|------|
| **REST API** (14 endpoints) | Any HTTP-capable agent | `x-api-key` + `x-wallet-id` headers |
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

## Key Features

- **AI-Powered SLA Monitoring** — Validators fetch live web data and evaluate criteria using LLM consensus
- **Milestone-Based Escrow** — Multiple milestones per agreement, each independently monitored and paid
- **Internet Court** — Per-dispute AI jury with evidence from both parties
- **Cross-Chain Verdict Bridge** — AI jury verdicts bridged to Base Sepolia via LayerZero V2 through zkSync Era hub
- **Multi-Milestone Disputes** — Multiple milestones disputed and resolved independently
- **Agent-First Design** — REST API, MCP server, and skill file for autonomous AI agents
- **Portfolio/Heartbeat** — Single endpoint returning all actionable items for an address
- **Live Consensus Tracker** — Real-time validator voting progress in the UI
- **Dashboard** — Aggregate on-chain analytics at `/dashboard`
- **44 Contract Tests** — Direct mode tests covering lifecycle, SLA, disputes, access control (~3s)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contract | GenLayer Intelligent Contract (Python) |
| Dispute Resolution | Internet Court — LLM-based jury consensus |
| Cross-Chain Bridge | LayerZero V2 + zkSync Era Sepolia (hub) + Base Sepolia |
| Bridge Contracts | Solidity 0.8.28 (Hardhat v3 + zksolc) |
| Relay Service | Node.js + genlayer-js + ethers.js |
| Frontend | Next.js 16, TypeScript, TailwindCSS |
| Agent API | Next.js API routes (REST) + MCP server |
| Chain | GenLayer Bradbury Testnet |

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
