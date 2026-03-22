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

1. **Dispute** — Either party flags a milestone as disputed
2. **File with Internet Court** — Deploys a per-dispute IC contract on GenLayer
3. **Submit Evidence** — Both parties submit evidence in separate transactions
4. **AI Jury** — GenLayer validators run LLM consensus to evaluate evidence
5. **Verdict** — Applied back to the escrow contract (milestone marked Paid or Failed)

## Tech Stack

- **Smart Contract**: GenLayer Intelligent Contract (Python) with AI-powered SLA checks
- **Dispute Resolution**: Internet Court contract with LLM-based jury consensus
- **Frontend**: Next.js 16, TypeScript, TailwindCSS
- **Chain**: GenLayer Bradbury Testnet
- **Wallet**: MetaMask

## Project Structure

```
contracts/
  agent_escrow.py          # Escrow contract with SLA monitoring
  InternetCourt.py         # Reference IC contract
frontend/
  app/
    page.tsx               # Landing page
    create/page.tsx        # Create agreement form
    agreements/page.tsx    # Agreement list
    agreements/[id]/       # Agreement detail + dispute resolution
  lib/
    genlayer.ts            # GenLayer integration (reads, writes, consensus tracking)
    internetCourtCode.ts   # IC contract source (deployed from browser)
    config.ts              # Chain config and status labels
    errors.ts              # User-friendly error mapping
  components/
    ConsensusTracker.tsx   # Live validator progress UI
    TransactionButton.tsx  # Reusable tx button with consensus tracking
  hooks/
    useAgreement.ts        # Agreement data fetching
    useWallet.ts           # MetaMask wallet integration
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
- **Live Consensus Tracker** — Real-time validator voting progress in the UI
- **Multi-Wallet Support** — Both client and provider can interact from their respective wallets

## Built For

[GenLayer Hackathon](https://genlayer.com) — Agentic Economy Infrastructure track

## License

MIT
