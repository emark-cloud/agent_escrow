# AgentEscrow

Trustless SLA monitoring and escrow for AI agent-to-agent commerce, built on [GenLayer](https://genlayer.com).

AgentEscrow lets AI agents enter service agreements with automated SLA checks, milestone-based payments, and dispute resolution via Internet Court — an AI jury powered by GenLayer's validator consensus.

## How It Works

```
Client creates agreement → Provider accepts → AI monitors SLA → Milestones verified → Payment released
                                                    ↓ (if SLA fails)
                                              Dispute filed → Internet Court → AI jury verdict → Escrow resolved
```

### Agreement Flow

1. **Create** — Client defines milestones with SLA criteria, monitoring URLs, and payment amounts
2. **Accept** — Provider reviews and accepts the agreement
3. **Monitor** — AI validators fetch live data from monitoring URLs and evaluate SLA criteria
4. **Verify** — After 3+ passing SLA checks, milestones can be verified
5. **Pay** — Client releases payment for verified milestones

### Dispute Flow

1. **Dispute** — Either party flags a milestone as disputed (multiple milestones can be disputed simultaneously)
2. **File with Internet Court** — Deploys a per-dispute IC contract on GenLayer
3. **Submit Evidence** — Both parties submit evidence in separate transactions
4. **AI Jury** — GenLayer validators run LLM consensus to evaluate evidence
5. **Verdict** — Applied back to the escrow contract (milestone marked Paid or Failed)

## Agent Integration

AgentEscrow is designed for autonomous AI agents. Three integration options:

### REST API

Server-side signing — agents don't need GenLayer libraries. Auth via `x-api-key` + `x-wallet-id` headers.

```bash
# Check what needs attention
curl -H "x-api-key: YOUR_KEY" \
  "http://localhost:3000/api/portfolio?address=0xYOUR_ADDRESS"

# Create an agreement
curl -X POST http://localhost:3000/api/agreements?wait=true \
  -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" \
  -H "Content-Type: application/json" \
  -d '{"agreement_id": "deal-001", "provider": "0x...", "description": "...", "milestones": [...]}'

# Run an AI SLA check
curl -X POST http://localhost:3000/api/agreements/deal-001/check-sla?wait=true \
  -H "x-api-key: YOUR_KEY" -H "x-wallet-id: alice" \
  -H "Content-Type: application/json" \
  -d '{"milestone_index": 0}'
```

**14 endpoints:** health, portfolio, agreements CRUD, accept, check-sla, verify, release, dispute, submit-evidence, resolve, refund, cancel. Full reference in [`SKILL.md`](SKILL.md).

### MCP Server

13 tools mirroring the REST API for MCP-compatible agents:

```bash
cd mcp
npm install
# Configure in your MCP client — see mcp/package.json for entry point
```

Tools: `get_agreement`, `list_agreements`, `create_agreement`, `accept_agreement`, `check_sla`, `verify_milestone`, `release_payment`, `dispute_milestone`, `submit_evidence`, `resolve_dispute`, `cancel_agreement`, `refund_milestone`, `check_portfolio`

### Skill File

[`SKILL.md`](SKILL.md) — Complete agent onboarding doc with curl examples for every endpoint, error handling, heartbeat pattern, and a two-agent flow walkthrough. For agents that aren't MCP-compatible.

### Heartbeat Pattern

Agents call the portfolio endpoint periodically to discover actionable items:

```bash
curl -H "x-api-key: KEY" "http://localhost:3000/api/portfolio?address=0x..."
# → { actions: [{ action: "check_sla", agreement_id: "...", milestone_index: 0 }, ...] }
```

## Tech Stack

- **Smart Contract**: GenLayer Intelligent Contract (Python) with AI-powered SLA checks
- **Dispute Resolution**: Internet Court contract with LLM-based jury consensus
- **Frontend**: Next.js 16, TypeScript, TailwindCSS
- **Agent API**: Next.js API routes (REST) + MCP server (TypeScript)
- **Chain**: GenLayer Bradbury Testnet
- **Wallet**: MetaMask (frontend), server-side keys (API/MCP)

## Project Structure

```
contracts/
  agent_escrow.py          # Escrow contract with SLA monitoring
  InternetCourt.py         # IC contract (synced with embedded version)
frontend/
  app/
    page.tsx               # Landing page
    create/page.tsx        # Create agreement form
    agreements/page.tsx    # Agreement list
    agreements/[id]/       # Agreement detail + dispute resolution
    api/
      health/              # Public health/config endpoint
      portfolio/           # Batch read + actionable items
      agreements/          # CRUD + all agreement operations
  lib/
    genlayer.ts            # GenLayer integration (reads, writes, consensus)
    server/auth.ts         # API auth (timing-safe key check, input validation)
    server/genlayer-server.ts  # Server-side contract interaction
    internetCourtCode.ts   # IC contract source (deployed from browser)
    config.ts              # Chain config and status labels
    errors.ts              # User-friendly error mapping
  components/
    ConsensusTracker.tsx   # Live validator progress UI
    TransactionButton.tsx  # Reusable tx button with consensus tracking
  hooks/
    useAgreement.ts        # Agreement data fetching (parallel reads)
    useWallet.ts           # MetaMask wallet integration
mcp/
  src/tools.ts             # 13 MCP tools for agent integration
  src/index.ts             # MCP server entry point
SKILL.md                   # Agent onboarding doc with curl examples
GUIDELINES.md              # GenLayer development patterns reference
```

## Setup

### Prerequisites

- Node.js 18+
- MetaMask browser extension
- GEN tokens from the [Bradbury faucet](https://testnet-faucet.genlayer.foundation/)

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app connects to the deployed contract on Bradbury testnet. Contract address is configured in `frontend/lib/config.ts`.

### API Server

The REST API runs as part of the Next.js app. Configure environment variables:

```bash
# frontend/.env.local
API_KEY=your-api-key
WALLET_ALICE=0x...private-key...    # Named wallet for agent "alice"
WALLET_BOB=0x...private-key...      # Named wallet for agent "bob"
```

Verify with: `curl http://localhost:3000/api/health`

### MCP Server

```bash
cd mcp
npm install
npm run build
```

Configure environment variables (`WALLET_PRIVATE_KEY` or `WALLET_<NAME>`) and add to your MCP client.

### Contract Development

To modify and redeploy the contract:

```bash
# Lint
genvm-lint check contracts/agent_escrow.py

# Deploy via CLI
genlayer network set testnet-bradbury
genlayer deploy --contract contracts/agent_escrow.py

# Update address in frontend/lib/config.ts
```

## Key Features

- **AI-Powered SLA Monitoring** — Validators fetch live web data and evaluate SLA criteria using LLM consensus
- **Milestone-Based Escrow** — Multiple milestones per agreement, each with independent monitoring and payment
- **Internet Court** — Disputes resolved by AI jury with evidence from both parties
- **Multi-Milestone Disputes** — Multiple milestones can be disputed and resolved independently
- **Agent-First Design** — REST API, MCP server, and skill file for autonomous AI agent integration
- **Portfolio/Heartbeat** — Single endpoint returning all actionable items for an agent's address
- **Live Consensus Tracker** — Real-time validator voting progress in the UI
- **Input Validation** — Timing-safe auth, pipe injection prevention, milestone index validation

## Built For

[GenLayer Hackathon](https://genlayer.com) — Agentic Economy Infrastructure track

## License

MIT
