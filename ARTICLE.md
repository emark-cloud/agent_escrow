# What I Learned Building on GenLayer — Lessons for Other Builders

I built [AgentEscrow](https://agentescrow-nu.vercel.app) on GenLayer's Bradbury testnet — a trustless SLA monitoring and escrow system for AI agent-to-agent commerce. The intelligent contract itself fetches live web data, reasons about compliance through LLM consensus, and auto-settles payments. When disputes arise, an AI jury resolves them through Internet Court.

This article is the field manual I wish I had when I started. If you're building on GenLayer — or thinking about it — these lessons will save you days.

---

## Bradbury: Where AI Meets Blockchain Consensus

GenLayer's journey has two phases so far. During the Asimov testnet, the team laid the infrastructure foundations — connecting all the different parts of the system. Bradbury is where they added the final ingredient: **real LLM inference inside the consensus loop**.

This is not simulated. Validators on Bradbury run actual LLMs. When your intelligent contract makes an LLM call, multiple validators independently execute it, each potentially using different models, and reach consensus on the result. GenLayer calls this **Optimistic Democracy** — a leader validator runs the non-deterministic function first, then other validators independently verify the output. If they agree, the transaction proceeds. If not, appeals can escalate the validator count from 5 up to 1,000.

The GenLayer team describes Bradbury as a "scholar's gym" — a sandbox for research and experimentation. That framing is accurate. Performance varies, history gets reset, and you'll discover things the docs haven't caught up with yet. But the core primitive — LLM inference inside blockchain consensus — is real and working.

Before you start, know that these concepts exist even if you don't need to deeply understand them yet: **greyboxing** (validators can apply arbitrary transformations before each LLM call), **model routing** (validators can use different LLMs for different contracts), **universal prompt injection defense** (Optimistic Democracy requires attacking the majority of LLMs, not just one), and **model diversity** (different LLMs and configurations reduce correlation, improving consensus accuracy). These are active areas of research happening on Bradbury right now.

---

## StudioNet to Bradbury: What Changes

If you've been developing on StudioNet (GenLayer Studio), your first Bradbury deployment will surprise you. Almost everything about the chain interaction layer is different.

**The contract header matters.** On Bradbury, you must pin `py-genlayer` to a specific hash — `latest` won't resolve:

```python
# v0.1.0
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
```

**The consensus contract is different.** On Bradbury, `addTransaction` takes 6 parameters (not 5), is `payable` (not `nonpayable`), and requires approximately 5 million gas for writes:

```typescript
const CONSENSUS_ABI = [{
  inputs: [
    { name: "_sender", type: "address" },
    { name: "_recipient", type: "address" },
    { name: "_numOfInitialValidators", type: "uint256" },
    { name: "_maxRotations", type: "uint256" },
    { name: "_calldata", type: "bytes" },
    { name: "_validUntil", type: "uint256" },  // NEW — pass BigInt(0)
  ],
  name: "addTransaction",
  stateMutability: "payable",  // NOT nonpayable
  type: "function",
}]
```

**L1 tx hash is not the GenLayer txId.** This is the most confusing aspect for newcomers. On Bradbury, you submit a transaction to the L1 (ZKsync OS), but the GenLayer transaction ID is different — you must extract it from the `NewTransaction` event's `topics[1]` in the L1 receipt logs. If you're using the `genlayer-js` SDK, it handles this for you. If you're going direct, you'll need to poll the receipt and parse the logs.

**Gas is much higher.** Writes need approximately 5M (`0x4C4B40`). Contract deployments need approximately 20M (`0x1312D00`) for large contracts. 500K and 1M both fail silently.

**Deployment takes time.** A contract deployment can take up to 30 minutes to reach FINALIZED status, but you can start interacting with it at ACCEPTED status — reads immediately reflect the updated state.

---

## The Bugs That Cost Me Hours

These are the lessons that took real debugging time. Each one caused silent failures or confusing behavior that wasn't covered in any documentation I could find.

### 1. Address comparison: `.as_hex.lower()`, not `==`

Direct `==` on Address objects can fail on Bradbury due to checksum casing differences. This caused a bug where `submit_evidence` in our Internet Court appeared to succeed (consensus ACCEPTED), but the evidence was never stored — because the address comparison silently returned false.

```python
# WRONG — can fail on Bradbury
if gl.message.sender_address == self.party_a:

# RIGHT — reliable across all environments
if gl.message.sender_address.as_hex.lower() == self.party_a.as_hex.lower():
```

Every address comparison in your contract must use this pattern. No exceptions.

### 2. TreeMap mutations don't auto-persist

When you read a value from a TreeMap and mutate it, the change exists only on the local reference. You must write it back explicitly:

```python
ms = self.milestones[key]
ms.status = MS_MONITORING
self.milestones[key] = ms  # MUST reassign — mutation doesn't auto-persist

self.agreements[agreement_id] = existing  # Same for the parent object
```

If you forget the reassignment, your state changes silently disappear. No error, no warning.

### 3. Cannot access `self.field` inside nondet blocks

Non-deterministic blocks (the functions you pass to equivalence principles) cannot access contract storage. Copy everything to local variables first:

```python
# Copy storage to locals BEFORE the nondet block
stmt = self.statement
guide = self.guidelines
ev_a = self.evidence_a

def nondet():
    # Use local vars, NOT self.field
    prompt = f"""... {stmt} ... {guide} ... {ev_a} ..."""
    result = gl.nondet.exec_prompt(prompt)
    return result

result_str = gl.eq_principle.prompt_non_comparative(nondet, ...)
```

### 4. Separate LLM calls from state changes

This one cost me the most time. If a write method stores data AND runs an LLM call in the same transaction, an LLM failure reverts everything — including the data storage.

In our Internet Court, evidence submission and AI resolution were originally one transaction. When the LLM occasionally failed to produce valid JSON, it reverted the entire transaction — losing the evidence that had been stored. The fix: make them separate `@gl.public.write` methods, called in separate transactions.

### 5. Rapid-fire transactions get dropped

If you send a second transaction to the same contract before the first reaches ACCEPTED, the second can be silently dropped (result: IDLE, 0 validator votes). Always wait for the previous transaction to complete before sending the next one. Our marketplace agents demo uses a poll-then-act pattern: check portfolio, execute one action, wait for consensus, repeat.

### 6. ACCEPTED does not mean succeeded

A transaction can be ACCEPTED by consensus but have execution errors — all validators agreed that the contract raised an error. State changes are NOT applied. Check for `exit_code 1` in the receipt, or look for all validators voting "DISAGREE". We surface this as HTTP 422 in our API to distinguish "your input was wrong" (422) from "infrastructure error, retry" (500).

### 7. LLM output parsing: expect the unexpected

LLMs frequently wrap JSON in markdown code fences, add preamble text, or include extra whitespace. Our parsing is deliberately defensive:

```python
raw = str(result_str)
raw = raw.replace("```json", "").replace("```", "").strip()
start = raw.find("{")
end = raw.rfind("}") + 1
if start >= 0 and end > start:
    raw = raw[start:end]
result = json.loads(raw)

# Always use .get() with defaults
verdict = result.get("verdict", "UNDETERMINED")
```

### 8. Web data fetching: render, then fallback

GenLayer validators can fetch web data two ways: `render()` (browser rendering, handles JavaScript) and `get()` (raw HTTP). Some endpoints need one, some the other. We try render first, check if we got meaningful data, then fall back:

```python
web_data = ""
try:
    web_data = gl.nondet.web.render(url, mode='text')
except Exception:
    pass
if len(web_data.strip()) < 50:
    try:
        response = gl.nondet.web.get(url)
        web_data = response.body.decode("utf-8") if response.body else ""
    except Exception:
        pass
if len(web_data) > 5000:
    web_data = web_data[:5000]  # Cap to avoid blowing up prompts
```

The 5000-character cap is important — large web responses cause validator divergence and token limit issues.

### 9. genlayer-js returns Map and bigint

The JavaScript SDK returns `Map` objects for TreeMap data and `bigint` for `u256` values. You need a recursive conversion helper before JSON serialization. Convert safe integers to `Number`, large bigints to strings to avoid precision loss.

### 10. Frontend and CLI gotchas

A few more that are quick to mention but painful to discover: the `genlayer` CLI `write` command doesn't properly encode arguments into calldata on Bradbury — use `genlayer-js` for writes instead. `genlayer account unlock` fails on WSL due to missing keychain. And call `ensureCorrectChain()` before every write transaction, not just on wallet connect — MetaMask drifts between interactions.

---

## Patterns Worth Stealing

These are the patterns that worked well and that I'd use again.

### prompt_non_comparative for consensus decisions

This is the core of Optimistic Democracy for subjective evaluations. Both our SLA checks and AI jury verdicts use `gl.eq_principle.prompt_non_comparative`:

```python
result = gl.eq_principle.prompt_non_comparative(
    perform_check,
    task="Evaluate whether a service meets its SLA criteria based on live web data",
    criteria="""The response must:
1. Start with exactly PASS or FAIL
2. Include a colon and a brief explanation
3. Be based on the actual web data, not assumptions"""
)
```

The key insight: **focus the criteria on output format, not reasoning**. Validators need to agree on the verdict (PASS/FAIL), not the explanation. Trying to get consensus on reasoning text will fail.

### Composite string keys for flat storage

GenLayer TreeMaps are flat key-value stores. To store milestones per agreement, we use composite keys: `f"{agreement_id}:{milestone_index}"`. Simple, debuggable, no nested allocation needed. Just validate that user input doesn't contain your delimiter characters.

### Direct mode testing with gl_call_hook

You can test GenLayer contracts locally — 44 tests in approximately 3 seconds, no server, no chain, no LLM calls. The key trick: `prompt_non_comparative` dispatches as `ExecPromptTemplate` in direct mode, which needs a hook to intercept:

```python
def mock_sla_pass(direct_vm):
    direct_vm.mock_web(r".*", {"status": 200, "body": '{"status": "ok"}'})
    direct_vm.mock_llm(r".*", "PASS: Service meets all SLA criteria")

    def hook(vm, request):
        if isinstance(request, dict) and "ExecPromptTemplate" in request:
            return {"ok": "PASS: Service meets all SLA criteria"}
        return None
    direct_vm._gl_call_hook = hook
```

Three layers of mocking: `mock_web()` for HTTP, `mock_llm()` for basic LLM calls, and `_gl_call_hook` for template-based prompts. If you only mock the first two, your SLA checks will silently return None.

### Server-side signing for agent integration

AI agents can't easily prepare GenLayer calldata (6-param `addTransaction`, custom encoding, consensus contract interaction). The right pattern: a REST API server holds private keys and signs on behalf of agents. Agents send simple JSON; the server does the heavy lifting. We have 22 endpoints and 13 MCP tools, all using server-side signing.

### Portfolio/heartbeat pattern for autonomous agents

A single `/api/portfolio` endpoint returns all agreements, milestones, and actionable items for an address. Agents poll it periodically, process one action per cycle, wait for consensus, then repeat. They drive the entire lifecycle — including the full Internet Court dispute flow — without knowing the state machine. The server tells them what to do next.

---

## Bridging to Base Sepolia

We bridged AI jury verdicts from GenLayer to Base Sepolia as verifiable on-chain proof. A few lessons from that process.

**zkSync requires its own compiler.** Standard `solc` bytecode deploys to zkSync Era but transactions fail silently at runtime. You need `zksolc` (zkSync's LLVM-based compiler). This is not obvious from error messages — the deployment succeeds, but every function call returns `status: 0x0`.

**LayerZero version incompatibility.** Our original architecture routed through zkSync Era Sepolia as a hub between GenLayer and Base. But zkSync Era Sepolia only has LayerZero V1 (EID 10248), while Base Sepolia uses V2 (EID 40245). They can't talk to each other.

**Bridge message format is layered.** GenLayer's BridgeSender wraps messages in an outer format `(uint32 srcChainId, address srcSender, address targetContract, bytes innerData)`. The relay must decode this wrapper, extract the inner JSON data, parse it, then re-encode as ABI-encoded `(string, uint256, string, bytes32)` for the Solidity VerdictRegistry on Base.

**Pragmatic solution: direct relay.** When the full decentralized bridge path has infrastructure gaps, a direct relay service with clear documentation of trust assumptions is better than a broken decentralized bridge. Our relay polls GenLayer, decodes, re-encodes, and calls Base Sepolia directly. It achieves the same verification goal for a hackathon context, and we're honest about the trust model.

---

## Why This Could Only Be Built on GenLayer

The core of AgentEscrow — an intelligent contract that fetches live web data, reasons about SLA compliance through AI consensus, and auto-settles payments — is only possible because of GenLayer's unique architecture.

**Natural-language SLAs enforced by consensus.** Agents write criteria in plain English ("API returns HTTP 200 with valid JSON within 500ms"). Validators independently fetch the URL and evaluate compliance through LLM inference. No oracle network, no off-chain monitoring service.

**AI jury dispute resolution.** Internet Court deploys a per-dispute contract where both parties submit evidence and an AI jury reaches consensus on a binding verdict. Not a DAO vote, not a multisig, not a human arbitrator.

**Optimistic Democracy prevents gaming.** A single rogue validator cannot determine the outcome. The leader proposes, others verify independently, and appeals can escalate to 1,000 validators. You'd need to compromise the majority of participating LLMs to manipulate a verdict.

The intelligent contract is the monitor, the jury, and the enforcer. GenLayer collapses an entire trust stack into a single on-chain primitive.

---

## Go Build

Bradbury is early. Things break. The docs lag behind the chain. But the core primitive — LLM inference inside blockchain consensus — is real, working, and unlike anything else in crypto.

The patterns in this article (address comparison, TreeMap reassignment, separate LLM calls from state, direct mode testing, portfolio heartbeat) will save you real debugging time. I learned them the hard way so you don't have to.

AgentEscrow is [open source](https://github.com/emark-cloud/agent_escrow). Read the contracts, read the tests, steal the patterns. The [live demo](https://agentescrow-nu.vercel.app) is running on Bradbury right now.

See you on GenLayer.
