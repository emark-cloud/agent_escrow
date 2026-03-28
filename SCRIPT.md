# AgentEscrow — Demo Recording Script

## Prerequisites (before hitting Record)

1. `cd frontend && npm run dev` — server running on localhost:3000
2. Wallets `alice` and `bob` configured in `.env.local` with testnet GEN tokens
3. Clear previous demo data: `rm -f frontend/marketplace.json frontend/marketplace-activity.json frontend/agent-profiles.json`
4. Browser open to `http://localhost:3000` (landing page)
5. Terminal open and sized for readable text (font size 16+)
6. Screen recording tool ready (OBS, Loom, or similar)
7. Resolution: 1920x1080 minimum

---

## Scene 1: Landing Page Hero (0:00 - 0:30)

**What's on screen:** Landing page at `/`

**Show:**
- The hero section: "Trustless SLA monitoring for AI agents" with the gradient text
- The "Built on GenLayer" badge with pulsing green dot
- Scroll down slowly to reveal the animated flow diagram
- Toggle between "Happy Path" and "Dispute Path" — let each animate through once

**Narration:**
> "AgentEscrow is trustless SLA monitoring for AI agent-to-agent commerce, built on GenLayer. When AI agents hire each other, the smart contract itself becomes the SLA monitor — fetching live web data, evaluating compliance through AI consensus, and auto-settling payments. If there's a dispute, an AI jury resolves it through Internet Court."

---

## Scene 2: Features Overview (0:30 - 0:50)

**What's on screen:** Continue scrolling the landing page

**Show:**
- The 4 feature cards (Contract-as-Monitor, Internet Court, Autonomous Marketplace, MCP Integration)
- Pause briefly on each

**Narration:**
> "Four key capabilities. The contract fetches live URLs and uses on-chain AI consensus — no external oracles. Internet Court provides AI-powered dispute resolution. An autonomous marketplace lets 5 agents discover and transact independently. And 13 MCP tools let any AI agent integrate natively."

---

## Scene 3: Start the Live Demo (0:50 - 1:30)

**What's on screen:** Navigate to `/demo` page

**Show:**
- The demo page with the two demo panels (2-Agent Demo and 5-Agent Marketplace)
- Click "Start" on the **5-Agent Marketplace Demo**
- Show the terminal output appearing in the embedded viewer (agents bootstrapping, wallets being generated)
- While agents bootstrap, narrate what's happening

**Narration:**
> "Let's see it in action. I'm launching the 5-agent autonomous marketplace. Five AI agents — Sentinel, Oracle, Atlas, Nexus, and Catalyst — each with different roles. Providers create service listings, clients discover and claim deals, and the entire lifecycle plays out autonomously."

---

## Scene 4: Marketplace Coming Alive (1:30 - 3:00)

**What's on screen:** Navigate to `/marketplace` while the demo runs

**Show:**
- The marketplace page — watch it update in real-time every 5 seconds
- Stats bar at top going from zeros to real numbers
- Service listing cards appearing (GitHub API Monitor, CoinGecko Feed, etc.)
- Status badges changing: "available" (green) -> "claimed" (blue)
- Agent roster on the right showing active deal counts incrementing
- Activity feed scrolling with agent actions

**Narration:**
> "Here's the marketplace updating live. Sentinel just listed a GitHub API health monitor for 100 GEN. Atlas — a client agent — discovered and claimed it. The on-chain agreement is now being created automatically. No human involved at any point."
>
> [pause, let the viewer absorb the live updates]
>
> "Each agent polls their portfolio every 25 seconds, discovers actionable items, and executes. The SLA criteria are in plain English — 'Response returns HTTP 200 and body is valid JSON.' GenLayer validators will fetch the actual URL and use LLM consensus to evaluate compliance."

---

## Scene 5: Agreement Deep Dive (3:00 - 4:00)

**What's on screen:** Click on an agreement link from the marketplace (one that's been claimed and has SLA activity)

**Show:**
- The agreement detail page (`/agreements/[id]`)
- Milestone status showing pass/fail counts
- The SLA criteria and monitoring URL
- The parties (client and provider addresses with agent badges)

**Narration:**
> "Drilling into a specific deal — you can see the milestone with its SLA criteria, the monitoring URL, and the live pass/fail count. Each SLA check is an on-chain transaction where validators independently fetch the URL and reach AI consensus on whether the criteria is met."

---

## Scene 6: Run the Scripted Demo (4:00 - 5:00)

**What's on screen:** Open a terminal alongside the browser

**Show:**
- Run `./demo.sh --dispute-only` in the terminal
- Show the narrated output flowing: health check, agreement creation, SLA checks failing, dispute filed

**Narration:**
> "Now let me walk through the dispute resolution path step by step. Alice creates an agreement with an impossible SLA — requiring a field that doesn't exist in the GitHub API. The SLA checks will fail, and we'll see the full Internet Court flow."

---

## Scene 7: Internet Court Resolution (5:00 - 7:00)

**What's on screen:** Terminal showing `demo.sh` output

**Show:**
- The IC deployment step
- Bob accepting the case
- Both parties submitting evidence
- The AI jury resolution step (this takes the longest — show the "waiting" spinner)
- The verdict appearing
- The verdict being applied back to the escrow

**Narration:**
> "Here's what makes AgentEscrow unique. An Internet Court contract is deployed for this specific dispute. Both parties submit their evidence — Alice argues the SLA was impossible, Bob argues the criteria was unreasonable. Now an AI jury of validators deliberates..."
>
> [wait for verdict]
>
> "The verdict is in. The AI jury sided with the client. The verdict is automatically applied back to the escrow contract, settling the funds. No human arbitrator, no waiting weeks — resolved in minutes through AI consensus."

---

## Scene 8: Dashboard Overview (7:00 - 7:30)

**What's on screen:** Navigate to `/dashboard`

**Show:**
- Stats overview (total agreements, active, completed, disputed)
- Milestone breakdown with pass/fail ratios
- SLA performance metrics
- List of all agreements created during the demo

**Narration:**
> "The dashboard aggregates all on-chain activity. You can see our marketplace deals, the completed happy paths, and the disputed agreement that was resolved through Internet Court. Everything is live from the blockchain."

---

## Scene 9: Back to Landing — Live Stats (7:30 - 8:00)

**What's on screen:** Navigate back to `/` (landing page)

**Show:**
- The live stats bar now showing real numbers (listings, active deals, completed, agents online, GenLayer: Live)
- The activity ticker showing recent marketplace events
- Scroll to the "See the autonomous economy in action" CTA

**Narration:**
> "Back on the landing page, you can see the live stats from our autonomous marketplace — real deals created and completed by AI agents, all settled on-chain through GenLayer's intelligent contracts."

---

## Scene 10: Closing (8:00 - 8:30)

**What's on screen:** Landing page hero, or a static title card

**Narration:**
> "AgentEscrow — trustless SLA monitoring for the agentic economy. Built on GenLayer for the Agentic Economy Infrastructure track. The smart contract is the monitor. The AI jury is the court. And the agents are fully autonomous."

---

## Timing Summary

| Scene | Duration | What's Shown |
|-------|----------|-------------|
| 1. Landing Hero | 30s | Hero + animated flow |
| 2. Features | 20s | 4 feature cards |
| 3. Start Demo | 40s | /demo page, start marketplace |
| 4. Marketplace Live | 90s | /marketplace updating in real-time |
| 5. Agreement Detail | 60s | Single agreement deep dive |
| 6. Scripted Demo | 60s | demo.sh dispute path starting |
| 7. Internet Court | 120s | Full IC flow in terminal |
| 8. Dashboard | 30s | Analytics overview |
| 9. Landing Stats | 30s | Live stats populated |
| 10. Closing | 30s | Final pitch |

**Total: ~8-9 minutes** (may stretch to 10 depending on consensus times)

---

## Pro Tips for Recording

1. **Pre-warm the RPC** — Run a quick health check before recording to avoid cold-start delays
2. **Split into segments** — Record scenes 1-5 (marketplace) and 6-7 (dispute) separately, edit together. Consensus times are unpredictable.
3. **Speed up waiting** — In your editor, speed up consensus waiting periods to 2x-4x
4. **Have a backup** — If RPC drops during recording, you can cut and resume. The demo.sh script retries automatically.
5. **Font size** — Terminal font at 16-18px, browser at 100% zoom for readability
6. **Clean browser** — No bookmarks bar, no extensions visible, incognito mode if possible
7. **Start marketplace demo 2-3 minutes before** recording Scene 4 so there's already activity when you navigate to `/marketplace`
