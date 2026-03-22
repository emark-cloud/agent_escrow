# AgentEscrow

Trustless SLA monitoring for AI agent-to-agent commerce, built on GenLayer.

## Project Structure

- `contracts/agent_escrow.py` — GenLayer Intelligent Contract (escrow + SLA logic)
- `frontend/` — Next.js 16 + TypeScript + TailwindCSS app
- `frontend/lib/internetCourtCode.ts` — Internet Court contract (embedded, deployed from frontend)
- `GUIDELINES.md` — GenLayer development patterns reference

## Contract

Deployed on **Bradbury testnet**. Contract address is in `frontend/lib/config.ts`.

### Key Contract Methods
- `create_agreement(agreement_id, provider, description, ms_descriptions, ms_urls, ms_criteria, ms_amounts)` — Client creates escrow (pipe-separated milestone fields)
- `accept_agreement(agreement_id)` — Provider accepts
- `check_sla(agreement_id, milestone_index)` — AI-powered live SLA check
- `verify_milestone` / `release_payment` — Settlement flow
- `dispute_milestone(agreement_id, milestone_index, reason)` — Flag milestone as disputed
- `resolve_dispute(agreement_id, milestone_index, verdict, court_address)` — Apply IC verdict to escrow

### Internet Court (IC) Contract
Deployed from frontend at runtime. Resolves disputes via AI jury consensus.

**Flow:** Deploy IC → Accept (other party) → Initiate Dispute → Submit Evidence (both parties, separate txs) → Resolve (triggers AI jury) → Apply Verdict to Escrow

**Critical:** Evidence submission and AI resolution must be separate transactions. If combined, LLM failure reverts the evidence storage.

**Address comparison:** Always use `.as_hex.lower()` for address comparisons in contracts. Direct `==` on Address objects can fail on Bradbury due to checksum differences.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

### Key Frontend Files
- `lib/config.ts` — Chain config, contract addresses, status labels
- `lib/genlayer.ts` — GenLayer integration (reads, writes, deploys, consensus tracking)
- `lib/internetCourtCode.ts` — IC contract source code (deployed from browser)
- `lib/errors.ts` — User-friendly error mapping
- `components/ConsensusTracker.tsx` — Live validator progress UI
- `components/TransactionButton.tsx` — Reusable tx button with consensus tracking
- `app/agreements/[id]/ResolvePanel.tsx` — Internet Court dispute resolution UI

## GenLayer Patterns
- See `GUIDELINES.md` for contract storage types, LLM patterns, and frontend integration
- **Bradbury testnet** — consensus contract `0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D`
- Reads use `genlayer-js` SDK `readContract()` with `testnetBradbury` chain
- GenLayer SDK returns `Map` and `bigint` — use `mapToObject()` helper
- L1 tx hash ≠ GenLayer txId on Bradbury — extract from `NewTransaction` event logs
- Gas: ~5M for writes (`0x4C4B40`), ~20M for contract deployments (`0x1312D00`)
- Don't send rapid-fire txs to same contract — wait for ACCEPTED before next tx
