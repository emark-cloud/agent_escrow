# AgentEscrow

**When AI agents hire other AI agents, who enforces the contract?**

AgentEscrow is trustless SLA monitoring and escrow for AI agent-to-agent commerce, built on [GenLayer](https://genlayer.com). AI validators fetch live web data, evaluate SLA criteria through LLM consensus, and settle payments automatically — no human in the loop.

```
Client Agent creates deal → Provider Agent accepts → AI validators monitor SLA
        → Milestones verified → Payment released automatically
                  ↓ (if SLA fails)
        Dispute filed → Internet Court (AI jury) → Verdict → Escrow resolved
```

## Quick Demo

**Full lifecycle demo** — watch two agents walk through happy path + dispute resolution:
```bash
# Start the frontend first: cd frontend && npm run dev
./demo.sh
```

**Autonomous agents** — two agents discover work and complete a deal without human input. Randomly selects a pass or fail SLA scenario each run, including full Internet Court dispute resolution:
```bash
node demo-agents.js
```

**Claude Code slash command** — Claude acts as an agent and drives the full lifecycle:
```
/agent-demo
```

Both scripts use the REST API with `?wait=true` for sequential consensus. No dependencies beyond `curl`/`jq` (demo.sh) or Node.js (demo-agents.js).

## What Makes This Different

- **AI-native enforcement** — SLA checks aren't static threshold monitors. GenLayer validators fetch live URLs and use LLM consensus to evaluate natural-language criteria ("API returns valid JSON with user data"). This means agents can write SLA criteria in plain English.
- **Trustless dispute resolution** — Internet Court deploys a per-dispute contract where an AI jury evaluates evidence from both parties. No oracle, no DAO vote, no human arbitrator.
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
| Frontend | Next.js 16, TypeScript, TailwindCSS |
| Agent API | Next.js API routes (REST) + MCP server |
| Chain | GenLayer Bradbury Testnet |

## Project Structure

```
contracts/
  agent_escrow.py              # Escrow contract with SLA monitoring
  InternetCourt.py             # Internet Court contract
frontend/
  app/
    page.tsx                   # Landing page
    dashboard/page.tsx         # Analytics dashboard
    create/page.tsx            # Create agreement form
    agreements/                # Agreement list + detail + dispute resolution
    agents/page.tsx            # Agent wallet management
    api/                       # 14 REST API endpoints
  lib/
    genlayer.ts                # GenLayer integration (reads, writes, consensus)
    server/genlayer-server.ts  # Server-side contract interaction
    internetCourtCode.ts       # IC contract source (deployed at runtime)
mcp/
  src/tools.ts                 # 13 MCP tools
tests/direct/                    # 44 contract tests (pytest + genlayer-test)
demo.sh                        # Narrated end-to-end demo script
demo-agents.js                 # Two-agent autonomy demo
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
