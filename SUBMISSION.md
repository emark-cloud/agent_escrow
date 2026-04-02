# AgentEscrow — Trustless SLA Monitoring for AI Agent Commerce

**Track:** Agentic Economy Infrastructure
**Live Demo:** https://agentescrow-nu.vercel.app
**GitHub:** https://github.com/emark-cloud/agent_escrow

## The Problem

As AI agents become economic actors — hiring other agents, purchasing services, delegating tasks — a fundamental question emerges: **who enforces the contract?**

Today's agent-to-agent transactions rely on trust, reputation scores, or centralized platforms. The agentic economy needs infrastructure — not just for making deals, but for enforcing them.

## What AgentEscrow Does

AgentEscrow is a complete trustless enforcement layer for AI agent commerce, built on GenLayer. The intelligent contract itself is the SLA monitor — it fetches live web data, reasons about compliance through LLM consensus, and auto-settles payments. When things go wrong, an AI jury resolves disputes through Internet Court, and the verdict is bridged cross-chain to Base Sepolia as verifiable proof.

**The full lifecycle, fully autonomous:**

1. **Deal Creation** — Client agent creates a multi-milestone escrow with natural-language SLA criteria
2. **SLA Monitoring** — GenLayer validators independently fetch live URLs and reach AI consensus on compliance
3. **Settlement** — After passing checks, milestones are verified and payment released automatically
4. **Dispute Resolution** — Internet Court deploys a per-dispute contract where an AI jury evaluates evidence and delivers a binding verdict
5. **Cross-Chain Proof** — Verdicts bridge from GenLayer to Base Sepolia, stored in a VerdictRegistry as verifiable on-chain proof

No human in the loop at any step.

## Why This Matters

- **Natural-language SLAs** — Agents write criteria in plain English ("API returns HTTP 200 with valid JSON"). GenLayer validators fetch and reason about real data. Only possible because of GenLayer's non-deterministic LLM consensus.
- **AI jury dispute resolution** — Not a DAO vote or multisig. Internet Court deploys a per-dispute contract, both parties submit evidence, and an AI jury reaches consensus on a binding verdict.
- **Cross-chain accountability** — Verdicts bridge to Base Sepolia where anyone can verify them. Permanent, cross-chain proof of fair dispute resolution.
- **Agent-first design** — 22 REST API endpoints, 13 MCP tools, portfolio heartbeat pattern. Five autonomous agents run an entire marketplace without human input.

## Technical Scope

**Intelligent Contract** — Multi-milestone escrow with independent SLA monitoring, full dispute state machine (multi-milestone independence), evidence submission, verdict application, refund flows. AI-powered SLA checks using `gl.eq_principle.prompt_non_comparative` for validator consensus.

**Internet Court** — Per-dispute contract deployed at runtime. Full state machine (created → active → disputed → resolving → resolved). Separate evidence and resolution transactions to prevent LLM failure from reverting evidence. Portfolio-driven — agents execute the full court flow without knowing the state machine.

**Cross-Chain Bridge** — GenLayer BridgeSender → Relay Service (Railway) → Base Sepolia VerdictRegistry. Relay decodes bridge-format wrapper, extracts JSON, ABI-encodes for Solidity registry. Verified end-to-end with verdicts confirmed on Base Sepolia.

**Agent Integration** — 22 REST endpoints with server-side signing. 13 MCP tools. Portfolio heartbeat for autonomous action discovery. SKILL.md with curl examples. HEARTBEAT.md for autonomous monitoring. Timing-safe auth.

**Frontend** — Next.js 16 + TypeScript + TailwindCSS. Landing page, agreement CRUD, Internet Court UI, cross-chain verdict status, live consensus tracker, analytics dashboard, agent wallet management, marketplace dashboard, live demo page. Deployed on Vercel.

**Testing** — 44 direct-mode contract tests (lifecycle, SLA, disputes, access control, input validation). Runs in ~3s with no server needed.

**Demos** — `demo.sh` (narrated e2e, ~10 min), `marketplace-agents.js` (5 autonomous agents), `/agent-demo` Claude Code slash command, `/demo` live UI.

## What We Built on GenLayer

1. **Non-deterministic contract execution** — SLA checks fetch live web data and use LLM reasoning
2. **Optimistic Democracy consensus** — Both the escrow contract and Internet Court use GenLayer's Optimistic Democracy via `prompt_non_comparative`. A leader validator runs the non-deterministic function (web fetch + LLM evaluation), then other validators independently verify the result. This prevents single-LLM gaming while keeping consensus efficient.
3. **Equivalence principle** — `prompt_non_comparative` for independent validator verification of SLA compliance and jury verdicts
4. **Internet Court pattern** — Multi-step AI workflows with evidence phases and jury consensus
5. **Bridge primitives** — GenLayer BridgeSender/Receiver integrated with EVM chains (Base Sepolia)

## Architecture

| Component | Technology | Deployment |
|-----------|-----------|------------|
| Intelligent Contract | GenLayer Python | Bradbury Testnet |
| Internet Court | GenLayer Python (per-dispute) | Bradbury Testnet |
| Bridge Contracts | Solidity 0.8.28 | Base Sepolia + zkSync Era Sepolia |
| Frontend + API | Next.js 16, TypeScript, TailwindCSS | Vercel |
| Relay Service | Node.js, genlayer-js, ethers.js | Railway |
| MCP Server | TypeScript, 13 tools | Local |
| Tests | pytest, genlayer-test, 44 tests | CI-ready |

---

*The intelligent contract is the monitor. The AI jury is the court. And the agents are fully autonomous.*
