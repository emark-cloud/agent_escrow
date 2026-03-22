# Guidelines for Building GenLayer Projects

## Part 1: Building Intelligent Contracts

### 1.1 Contract Structure

Every GenLayer Intelligent Contract follows this structure:

```python
# v0.1.0
# { "Depends": "py-genlayer:latest" }
from genlayer import *
from dataclasses import dataclass

@allow_storage
@dataclass
class MyDataClass:
    """Custom data types for storage must use @allow_storage decorator"""
    field1: str
    field2: u256  # Use u256 for numbers, NOT float

class MyContract(gl.Contract):
    # Storage fields - declared as class attributes with type hints
    items: TreeMap[str, MyDataClass]
    balances: TreeMap[Address, u256]

    def __init__(self, initial_param: str):
        """Constructor - called once during deployment"""
        self.initial_param = initial_param

    @gl.public.view
    def get_data(self, key: str) -> MyDataClass:
        """Read-only method - doesn't modify state"""
        return self.items[key]

    @gl.public.write
    def set_data(self, key: str, value: MyDataClass) -> None:
        """Write method - modifies state, requires transaction"""
        self.items[key] = value
```

**Important:** The first two lines are the contract header. The `Depends` line specifies the py-genlayer version. On **StudioNet/Studio**, use `latest`. On **Bradbury testnet**, use the specific hash (see Part 4).

### 1.2 Storage Types

| Type | Use Case |
|------|----------|
| `TreeMap[K, V]` | Key-value storage (like dict) |
| `DynArray[T]` | Growing list storage |
| `Array[T, N]` | Fixed-size array |
| `u256`, `i256`, `bigint` | Numbers (NO floats allowed) |
| `str`, `bool`, `bytes` | Primitive types |
| `Address` | Wallet/contract addresses |

**Critical Rules:**
- **NO floats** - Use `u256` for timestamps, amounts, etc.
- Custom dataclasses **must** have `@allow_storage` decorator
- Initialize nested TreeMaps explicitly:
  ```python
  self.nested[key] = gl.storage.inmem_allocate(TreeMap[Address, str])
  ```

### 1.3 Method Decorators

```python
@gl.public.view           # Read-only, free to call
@gl.public.write          # Modifies state, requires transaction
@gl.public.write.payable  # Accepts native token payments
```

### 1.4 Accessing Transaction Context

```python
sender = gl.message.sender_address    # Address of caller
value = gl.message.value              # Sent payment (for payable methods)
```

### 1.5 Address Parameters

**Important:** Method parameters that accept addresses should use `str` type, not `Address`. Convert inside the method:

```python
@gl.public.write
def set_provider(self, provider: str) -> None:
    self.provider = Address(provider)
```

### 1.6 LLM Integration (AI Features)

```python
@gl.public.write
def ai_method(self, user_input: str) -> str:
    def make_decision() -> str:
        prompt = f"""Analyze: {user_input}
        Respond with exactly YES or NO."""
        result = gl.nondet.exec_prompt(prompt)
        return result.strip().upper()

    # Wrap non-deterministic AI in equivalence principle
    outcome = gl.eq_principle.strict_eq(make_decision)
    return outcome

@gl.public.write
def ai_evaluation(self, data: str) -> str:
    def evaluate() -> str:
        prompt = f"""Evaluate this data: {data}
        Return a JSON object with your assessment."""
        return gl.nondet.exec_prompt(prompt).strip()

    # Use non-comparative for subjective evaluations
    result = gl.eq_principle.prompt_non_comparative(
        evaluate,
        task="Evaluate the provided data",
        criteria="""
The AI response must:
1. Be valid JSON
2. Contain reasonable assessment based on the input
"""
    )
    return result
```

**Equivalence Principles:**
- `gl.eq_principle.strict_eq(fn)` - Validators must get exact same result
- `gl.eq_principle.prompt_comparative(fn, task, criteria)` - LLM compares leader output
- `gl.eq_principle.prompt_non_comparative(fn, task, criteria)` - LLM validates independently

### 1.7 Web Data Access

```python
@gl.public.write
def fetch_and_evaluate(self, url: str) -> str:
    url_copy = url  # Copy to local var for use in nondet block

    def get_data() -> str:
        # Try rendering first (JS-heavy pages)
        web_data = ""
        try:
            web_data = gl.nondet.web.render(url_copy, mode='text')
        except Exception:
            pass
        # Fallback to simple GET
        if len(web_data.strip()) < 50:
            try:
                response = gl.nondet.web.get(url_copy)
                web_data = response.body.decode("utf-8") if response.body else ""
            except Exception:
                pass
        # Truncate to avoid token limits
        if len(web_data) > 5000:
            web_data = web_data[:5000]

        prompt = f"""Based on this data: {web_data}
        Respond with PASS or FAIL."""
        return gl.nondet.exec_prompt(prompt).strip()

    return gl.eq_principle.prompt_non_comparative(
        get_data,
        task="Evaluate web data",
        criteria="Response must start with PASS or FAIL"
    )
```

### 1.8 Error Handling

```python
@gl.public.write
def guarded_method(self, room_id: str) -> None:
    if room_id not in self.rooms:
        raise gl.vm.UserError("Room not found")

    if self.rooms[room_id].resolved:
        raise gl.vm.UserError("Room already resolved")
```

### 1.9 Contract-to-Contract Calls

```python
other = gl.get_contract_at(Address("0x..."))
result = other.view().some_read_method()  # Read call
other.emit().some_write_method(arg1)      # Write call (transaction)
```

### 1.10 Linting Contracts

Always lint before deploying:

```bash
genvm-lint check contracts/my_contract.py
```

This runs both AST safety checks and SDK semantic validation.

---

## Part 2: Building the Frontend (StudioNet)

This section covers frontend integration with GenLayer Studio (local development).

### 2.1 Project Setup

```bash
npx create-next-app@latest my-genlayer-app --typescript --tailwind
cd my-genlayer-app
npm install genlayer-js viem
```

### 2.2 GenLayer Client Configuration

```typescript
// lib/config.ts
export const GENLAYER_CONFIG = {
  chainId: 61999,
  chainIdHex: "0xF22F",
  rpcUrl: "https://studio.genlayer.com/api",
  contractAddress: "0xYOUR_CONTRACT_ADDRESS" as `0x${string}`,
  consensusContract: "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575" as `0x${string}`,
};

export const GENLAYER_CHAIN = {
  chainId: "0xF22F",
  chainName: "GenLayer StudioNet",
  rpcUrls: ["https://studio.genlayer.com/api"],
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
};

// lib/genlayer.ts
import { createClient, abi } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

export function createReadClient() {
  return createClient({ chain: studionet });
}
```

### 2.3 Reading Contract State

```typescript
import type { CalldataEncodable } from "genlayer-js/types";

// Helper to convert Map/bigint to plain objects recursively
function mapToObject(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    value.forEach((v, k) => { obj[String(k)] = mapToObject(v); });
    return obj;
  }
  if (Array.isArray(value)) return value.map(mapToObject);
  if (typeof value === "bigint") return Number(value);
  return value;
}

export async function readContract<T>(
  functionName: string,
  args: CalldataEncodable[] = []
): Promise<T> {
  const client = createReadClient();
  const result = await client.readContract({
    address: GENLAYER_CONFIG.contractAddress as Address,
    functionName,
    args,
  });
  return mapToObject(result) as T;
}
```

**Important:** GenLayer SDK returns `Map` objects and `bigint` for `u256`. The `mapToObject` helper handles both conversions recursively.

### 2.4 Writing Transactions (StudioNet)

GenLayer writes go through a **consensus contract**, not directly to your contract:

```typescript
import { encodeFunctionData, type Address, type Hex } from "viem";
const { calldata, transactions } = abi;

// StudioNet consensus contract ABI (5 parameters)
const CONSENSUS_ABI = [
  {
    inputs: [
      { name: "_sender", type: "address" },
      { name: "_recipient", type: "address" },
      { name: "_numOfInitialValidators", type: "uint256" },
      { name: "_maxRotations", type: "uint256" },
      { name: "_txData", type: "bytes" },
    ],
    name: "addTransaction",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export async function sendWriteTransaction(
  functionName: string,
  args: CalldataEncodable[]
): Promise<string> {
  const accounts = await window.ethereum.request({
    method: "eth_accounts"
  }) as Address[];
  const senderAddress = accounts[0];

  const calldataObj = calldata.makeCalldataObject(functionName, args, undefined);
  const encodedCalldata = calldata.encode(calldataObj);
  const serializedData = transactions.serialize([encodedCalldata, false]) as Hex;

  const txData = encodeFunctionData({
    abi: CONSENSUS_ABI,
    functionName: "addTransaction",
    args: [
      senderAddress,
      GENLAYER_CONFIG.contractAddress as Address,
      BigInt(5),   // numOfInitialValidators
      BigInt(3),   // maxRotations
      serializedData,
    ],
  });

  const txHash = await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [{
      from: senderAddress,
      to: GENLAYER_CONFIG.consensusContract,
      data: txData,
      gas: "0x7A120",  // 500K gas is enough for StudioNet
    }],
  }) as Hex;

  return txHash;
}
```

### 2.5 Deploying Contracts from Frontend (StudioNet)

```typescript
export async function deployContract(
  code: string,
  args: CalldataEncodable[] = []
): Promise<string> {
  const senderAddress = /* get from eth_accounts */;
  const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;

  const calldataObj = calldata.makeCalldataObject(undefined, args, undefined);
  const encodedCalldata = calldata.encode(calldataObj);
  // Deploy: serialize with [code, calldata, leaderOnly]
  const serializedData = transactions.serialize([
    code,
    encodedCalldata,
    false,
  ]) as Hex;

  const txData = encodeFunctionData({
    abi: CONSENSUS_ABI,
    functionName: "addTransaction",
    args: [senderAddress, zeroAddress, BigInt(5), BigInt(3), serializedData],
  });

  // Send to consensus contract with recipient = zero address
  return await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [{ from: senderAddress, to: CONSENSUS_CONTRACT, data: txData, gas: "0x7A120" }],
  }) as Hex;
}
```

### 2.6 Waiting for Transaction Confirmation (StudioNet)

On StudioNet, the L1 tx hash IS the GenLayer tx hash, so polling is straightforward:

```typescript
export async function waitForTransaction(txHash: string): Promise<{ status: string }> {
  const client = createReadClient();
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    interval: 2000,
    retries: 30,
  });
  const status = receipt.consensus_data?.final?.status ?? "FINALIZED";
  return { status };
}
```

### 2.7 MetaMask Chain Configuration

```typescript
async function ensureCorrectChain(): Promise<void> {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: GENLAYER_CHAIN.chainId }],
    });
  } catch {
    // Catch ALL errors (not just 4902) and try adding the chain
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [GENLAYER_CHAIN],
    });
  }
}
```

**Important:** Call `ensureCorrectChain()` before every write transaction, not just on wallet connect. MetaMask can drift to other networks between interactions.

---

## Part 3: Key Patterns & Best Practices

### 3.1 Transaction Flow

```
Submit Tx → Wait Receipt → Poll Contract State → Verify Change → Update UI
```

Don't trust the receipt alone—poll the contract to confirm state changed.

### 3.2 Consensus Latency

GenLayer transactions take time for consensus:
- **StudioNet:** 1-2 minutes (local validators)
- **Bradbury testnet:** 1-5 minutes for simple writes, longer for AI/web calls

Design your UI accordingly:
- Show loading states with progress indicators
- Disable buttons during pending transactions
- Auto-refresh data after confirmation
- **Don't send multiple transactions to the same contract in rapid succession** — wait for each to finalize before sending the next

### 3.3 BigInt Handling

Always convert `bigint` to `number` at consumption points:

```typescript
const amount = typeof data.amount === 'bigint'
  ? Number(data.amount)
  : data.amount;
```

Or use the `mapToObject()` helper which handles this recursively.

### 3.4 AI Prompt Design

For reliable consensus, write deterministic prompts:

```python
prompt = """You are evaluating a yes/no question.
Question: {question}

Respond with EXACTLY one word: YES or NO.
No explanation. Just the word."""
```

Tips:
- Request structured output (JSON, single words) for better validator agreement
- Truncate web data to avoid token limits (5000 chars is a good max)
- Use `prompt_non_comparative` for subjective evaluations
- Use `strict_eq` only when output should be identical across validators

### 3.5 Testing Contracts

Use GenLayer Studio for rapid iteration:
1. Deploy contract via Studio UI
2. Test methods interactively
3. Copy contract address to frontend config
4. Redeploy as needed during development

Or use the CLI:
```bash
genlayer deploy --contract contracts/my_contract.py --args "arg1" "arg2"
genlayer call <address> get_data --args "key1"
genlayer write <address> set_data --args "value1"
genlayer receipt <txHash> --stdout --stderr  # Debug failures
```

### 3.6 Error Handling

Map technical errors to user-friendly messages:

```typescript
export function mapToUserFriendlyError(error: any): { title: string; message: string } {
  const msg = error?.message || String(error);
  if (msg.includes("User rejected")) return { title: "Cancelled", message: "Transaction rejected in wallet." };
  if (msg.includes("insufficient funds")) return { title: "Insufficient Balance", message: "Not enough tokens." };
  return { title: "Something went wrong", message: msg };
}
```

---

## Part 4: Bradbury Testnet

Bradbury is GenLayer's public testnet. It uses real distributed validators with Optimistic Democracy consensus.

### 4.1 Key Differences from StudioNet

| | StudioNet | Bradbury |
|---|---|---|
| Chain ID | `61999` (`0xF22F`) | `4221` (`0x107D`) |
| RPC URL | `https://studio.genlayer.com/api` | `https://zksync-os-testnet-genlayer.zksync.dev` |
| Consensus contract | `0xb7278A61...` | `0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D` |
| `addTransaction` params | 5 params, `nonpayable` | **6 params** (+ `_validUntil`), `payable` |
| Gas needed | ~500K (`0x7A120`) | **~5M (`0x4C4B40`)** |
| Consensus time | 1-2 min | 1-5+ min |
| py-genlayer | `latest` | Specific hash (see below) |
| L1 tx hash = GL txId | Yes | **No** (must extract from event logs) |
| Transaction ordering | Reliable | Rapid-fire txs can be dropped |

### 4.2 Contract Header for Bradbury

```python
# v0.1.0
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
```

**Do NOT use `latest`** — it doesn't resolve on Bradbury. Use the specific hash above.

### 4.3 Frontend Config for Bradbury

```typescript
export const GENLAYER_CONFIG = {
  chainId: 4221,
  chainIdHex: "0x107D",
  rpcUrl: "https://zksync-os-testnet-genlayer.zksync.dev",
  contractAddress: "0xYOUR_CONTRACT" as `0x${string}`,
  consensusContract: "0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D" as `0x${string}`,
};

export const GENLAYER_CHAIN = {
  chainId: "0x107D",
  chainName: "GenLayer Bradbury Testnet",
  rpcUrls: ["https://zksync-os-testnet-genlayer.zksync.dev"],
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
};
```

```typescript
import { testnetBradbury } from "genlayer-js/chains";

export function createReadClient() {
  return createClient({ chain: testnetBradbury });
}
```

### 4.4 Consensus Contract ABI (Bradbury)

Bradbury's `addTransaction` has **6 parameters** (added `_validUntil`) and is `payable`:

```typescript
const CONSENSUS_ABI = [
  {
    inputs: [
      { name: "_sender", type: "address" },
      { name: "_recipient", type: "address" },
      { name: "_numOfInitialValidators", type: "uint256" },
      { name: "_maxRotations", type: "uint256" },
      { name: "_calldata", type: "bytes" },
      { name: "_validUntil", type: "uint256" },   // NEW on Bradbury
    ],
    name: "addTransaction",
    outputs: [],
    stateMutability: "payable",   // Changed from nonpayable
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "txId", type: "bytes32" },
      { indexed: true, name: "recipient", type: "address" },
      { indexed: true, name: "activator", type: "address" },
    ],
    name: "NewTransaction",
    type: "event",
  },
] as const;
```

Pass `BigInt(0)` for `_validUntil` (no expiry):

```typescript
args: [senderAddress, contractAddress, BigInt(5), BigInt(3), serializedData, BigInt(0)]
```

**Gas must be ~5M** (`0x4C4B40`). Lower values (500K, 1M) will cause out-of-gas reverts.

### 4.5 L1 Tx Hash vs GenLayer TxId (Critical)

On Bradbury, the L1 transaction hash is **NOT** the GenLayer transaction ID. The consensus contract emits a `NewTransaction` event, and the GenLayer txId is in `topics[1]` of that event.

You **must** extract the GenLayer txId from the L1 receipt to poll consensus status:

```typescript
async function getGenLayerTxId(l1TxHash: string): Promise<string | null> {
  const consensusAddr = GENLAYER_CONFIG.consensusContract.toLowerCase();
  for (let i = 0; i < 30; i++) {
    try {
      const resp = await fetch(GENLAYER_CONFIG.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getTransactionReceipt",
          params: [l1TxHash],
          id: 1,
        }),
      });
      const data = await resp.json();
      const receipt = data?.result;
      if (receipt) {
        const log = receipt.logs?.find(
          (l: { address: string }) => l.address.toLowerCase() === consensusAddr
        );
        if (log?.topics?.[1]) return log.topics[1];
        return null;
      }
    } catch { /* not available yet */ }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}
```

### 4.6 Waiting for Transactions (Bradbury)

```typescript
export async function waitForTransaction(
  txHash: string,
  maxRetries = 200,
  interval = 5000
): Promise<{ status: string }> {
  const client = createReadClient();

  // Step 1: Extract GenLayer txId from L1 receipt
  const glTxId = await getGenLayerTxId(txHash);
  if (!glTxId) throw new Error("Could not find GenLayer transaction ID");

  // Step 2: Poll GenLayer consensus with the correct txId
  for (let i = 0; i < maxRetries; i++) {
    try {
      const receipt = await client.waitForTransactionReceipt({
        hash: glTxId,
        interval,
        retries: 1,
      });
      const status = receipt.consensus_data?.final?.status ?? "UNKNOWN";
      // ACCEPTED is usable on Bradbury — state updates are visible
      if (status === "FINALIZED" || status === "ACCEPTED") {
        return { status };
      }
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("Transaction timed out");
}
```

### 4.7 Transaction Lifecycle on Bradbury

```
L1 Submitted → PENDING → COMMITTING → REVEALING → ACCEPTED → FINALIZED
```

- **ACCEPTED** = validators agreed, state is updated, contract is usable
- **FINALIZED** = fully confirmed (can take 10-30 min after ACCEPTED)
- **IDLE result** = transaction was dropped or failed (0 validators processed it)
- **AGREE result** = validators agreed on the outcome

### 4.8 Transaction Ordering

**Do NOT send rapid-fire transactions to the same contract.** If a second tx arrives before the first is processed, it may be dropped (result: IDLE, 0 votes). Always wait for the previous transaction to reach at least ACCEPTED before sending the next one.

### 4.9 Explorers

- **L1 transactions:** `https://zksync-os-testnet-genlayer.explorer.zksync.dev/tx/<l1TxHash>`
- **GenLayer consensus:** `https://explorer-bradbury.genlayer.com/tx/<glTxId>`

Note: These are different explorers for different things. An L1 tx may succeed (`status: 0x1`) while the GenLayer consensus fails (result: IDLE).

### 4.10 Faucet & Tokens

- Faucet: `https://testnet-faucet.genlayer.foundation/`
- Browser-only (Cloudflare Turnstile), once per 24 hours, gives 100 GEN
- Cannot be automated from CLI

### 4.11 CLI on Bradbury

```bash
genlayer network set testnet-bradbury
genlayer deploy --contract contracts/my_contract.py --args "arg1"
genlayer call <address> get_data
genlayer write <address> set_data --args "value1"
genlayer receipt <txHash> --stdout --stderr   # Debug execution errors
```

**Note:** `genlayer account unlock` requires an OS keychain and doesn't work on WSL. Pipe password via stdin instead:

```bash
echo "password" | genlayer deploy --contract contracts/my_contract.py
```

---

## Quick Reference

| Task | Contract | Frontend |
|------|----------|----------|
| Storage | `TreeMap`, `DynArray`, `u256` | N/A |
| Read data | `@gl.public.view` | `client.readContract()` |
| Write data | `@gl.public.write` | `addTransaction` to consensus contract |
| AI call | `gl.nondet.exec_prompt()` | N/A (backend only) |
| Consensus | `gl.eq_principle.prompt_non_comparative(fn, task=, criteria=)` | Wait & poll |
| Sender address | `gl.message.sender_address` | N/A |
| Errors | `raise gl.vm.UserError("msg")` | Map to friendly messages |
| Deploy from frontend | N/A | `serialize([code, calldata, false])` to zero address |
| Read any contract | N/A | `readContractAt(address, method, args)` |

| Config | StudioNet | Bradbury |
|--------|-----------|----------|
| Chain import | `studionet` | `testnetBradbury` |
| `addTransaction` params | 5 | 6 (+ `_validUntil`) |
| Gas (writes) | `0x7A120` (500K) | `0x4C4B40` (5M) |
| Gas (deploys) | `0x7A120` (500K) | `0x1312D00` (20M) |
| Wait for tx | Use L1 hash directly | Extract GL txId from event logs |
| py-genlayer | `latest` | `1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |



### 4.12 Address Comparisons on Bradbury

Direct `==` on Address objects can fail on Bradbury due to checksum casing differences. Always use `.as_hex.lower()`:

```python
# BAD — can fail on Bradbury
if gl.message.sender_address == self.party_a:

# GOOD — reliable across all environments
if gl.message.sender_address.as_hex.lower() == self.party_a.as_hex.lower():
```

### 4.13 Nondet Block Rules

Copy all storage fields to local vars **before** the nondet block. Accessing `self.field` inside `nondet()` is not allowed:

```python
# BAD
def nondet():
    data = self.some_field  # Accessing storage inside nondet

# GOOD
data = self.some_field  # Copy before nondet block
def nondet():
    prompt = f"... {data} ..."  # Use local var
```

### 4.14 LLM Response Parsing

LLMs may wrap JSON in markdown code fences or add extra text. Always extract the JSON object robustly:

```python
raw = str(result_str)
raw = raw.replace("```json", "").replace("```", "").strip()
start = raw.find("{")
end = raw.rfind("}") + 1
if start >= 0 and end > start:
    raw = raw[start:end]
result = json.loads(raw)

# Use .get() with defaults — don't assume all fields exist
verdict = result.get("verdict", "UNKNOWN")
```

Keep prompts short — shorter = faster validators, fewer parsing failures.

### 4.15 Separating LLM Calls from State Changes

If a write method stores data AND runs an LLM call, the LLM failure reverts everything — including the data storage. Split them into separate transactions:

```python
# BAD — if _do_resolve() fails, evidence storage is reverted
@gl.public.write
def submit_evidence(self, evidence: str) -> None:
    self.evidence = evidence
    if both_submitted:
        self._do_resolve()  # LLM call — if this fails, evidence is lost

# GOOD — evidence is stored in one tx, resolution in another
@gl.public.write
def submit_evidence(self, evidence: str) -> None:
    self.evidence = evidence

@gl.public.write
def resolve(self) -> None:
    self._do_resolve()  # LLM call in its own transaction
```

### 4.16 Deploy Gas on Bradbury

Contract deployments with large source code need **~20M gas** (`0x1312D00`). Regular writes need ~5M (`0x4C4B40`).

### 4.17 Transaction Failure with ACCEPTED Status

A transaction can be ACCEPTED (validators agreed) but have `exit_code 1` (contract error). State changes from that transaction are **not applied**. Check `eqBlocksOutputs`:
- `padded` = success
- `exit_code 1` = contract error (ValueError, UserError, etc.)

Use `genlayer receipt <txHash> --stderr` to see the Python traceback.
