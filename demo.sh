#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# AgentEscrow — Narrated End-to-End Demo
# Drives two agents (Alice + Bob) through the full lifecycle using curl.
# Usage: ./demo.sh [--dispute-only] [BASE_URL]
# ============================================================================

SKIP_HAPPY=false
if [ "${1:-}" = "--dispute-only" ]; then
  SKIP_HAPPY=true
  shift
fi

BASE_URL="${1:-http://localhost:3000}"
API_KEY="${API_KEY:-test}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

TOTAL_START=$(date +%s)

# Helpers
narrate() { echo -e "\n${CYAN}▸ $*${RESET}"; }
success() { echo -e "${GREEN}✓ $*${RESET}"; }
fail()    { echo -e "${RED}✗ $*${RESET}"; }
waiting() { echo -e "${YELLOW}⏳ $*${RESET}"; }
header()  { echo -e "\n${BOLD}═══════════════════════════════════════════════${RESET}"; echo -e "${BOLD}  $*${RESET}"; echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"; }
divider() { echo -e "${DIM}───────────────────────────────────────────────${RESET}"; }

# API call wrapper with timing and error detection
MAX_RETRIES=3

# Check if an error is transient and worth retrying
is_retryable() {
  local http_code="$1" response="$2"
  # 500 with leader timeout or transaction timeout
  if [ "$http_code" -eq 500 ]; then
    local err
    err=$(echo "$response" | jq -r '.error // empty' 2>/dev/null || true)
    case "$err" in
      *"Leader timed out"*|*"Transaction timed out"*|*"fetch failed"*|*"ECONNRESET"*|*"ECONNREFUSED"*)
        return 0 ;;
    esac
  fi
  # curl failures (http_code=000)
  [ "$http_code" = "000" ] && return 0
  return 1
}

api() {
  local method="$1" endpoint="$2" label="$3"
  shift 3
  local body_args=("$@")
  local start elapsed http_code response attempt

  for attempt in $(seq 1 $MAX_RETRIES); do
    [ "$attempt" -eq 1 ] && waiting "$label" || echo -e "${YELLOW}  ↻ Retry $attempt/$MAX_RETRIES...${RESET}"
    start=$(date +%s)

    if [ "$method" = "GET" ]; then
      response=$(curl -s -w "\n%{http_code}" \
        -H "x-api-key: $API_KEY" \
        "${BASE_URL}${endpoint}" 2>&1)
    else
      response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "x-api-key: $API_KEY" \
        -H "Content-Type: application/json" \
        "${body_args[@]}" \
        "${BASE_URL}${endpoint}?wait=true" 2>&1)
    fi

    http_code=$(echo "$response" | tail -1)
    response=$(echo "$response" | sed '$d')
    elapsed=$(( $(date +%s) - start ))

    # Success
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 400 ]; then
      success "$label — HTTP $http_code (${elapsed}s)"
      LAST_RESPONSE="$response"
      LAST_HTTP="$http_code"
      return 0
    fi

    # Retryable failure — try again
    if [ "$attempt" -lt "$MAX_RETRIES" ] && is_retryable "$http_code" "$response"; then
      echo -e "${YELLOW}  ⚠ Transient error (HTTP $http_code, ${elapsed}s), will retry...${RESET}"
      continue
    fi

    # Non-retryable or last attempt — report failure
    fail "$label — HTTP $http_code (${elapsed}s)"
    local exec_err
    exec_err=$(echo "$response" | jq -r '.executionError // empty' 2>/dev/null || true)
    if [ -n "$exec_err" ]; then
      echo -e "${RED}  Execution error: $exec_err${RESET}"
    else
      echo -e "${RED}  Response: $(echo "$response" | jq -c '.' 2>/dev/null || echo "$response")${RESET}"
    fi
    LAST_RESPONSE="$response"
    LAST_HTTP="$http_code"
    return 1
  done
}

# Show selected fields from last response
show_field() {
  local field="$1" label="${2:-$1}"
  local val
  val=$(echo "$LAST_RESPONSE" | jq -r ".$field // empty" 2>/dev/null || true)
  if [ -n "$val" ] && [ "$val" != "null" ]; then
    echo -e "  ${DIM}${label}:${RESET} $val"
  fi
}

show_json() {
  echo "$LAST_RESPONSE" | jq '.' 2>/dev/null | head -20 | sed 's/^/  /'
}

# ============================================================================
header "PHASE 0: Health Check"
# ============================================================================

narrate "Checking server health and agent configuration..."

api GET "/api/health" "Health check" || { fail "Server not reachable at $BASE_URL"; exit 1; }

CONTRACT=$(echo "$LAST_RESPONSE" | jq -r '.contractAddress')
AGENTS=$(echo "$LAST_RESPONSE" | jq -r '.agentWallets // empty')
echo -e "  ${DIM}Contract:${RESET} $CONTRACT"
echo -e "  ${DIM}RPC reachable:${RESET} $(echo "$LAST_RESPONSE" | jq -r '.rpcReachable')"

# Extract agent addresses (agentWallets is {name: address} object)
ALICE_ADDR=$(echo "$LAST_RESPONSE" | jq -r '.agentWallets.alice // empty' 2>/dev/null || true)
BOB_ADDR=$(echo "$LAST_RESPONSE" | jq -r '.agentWallets.bob // empty' 2>/dev/null || true)

if [ -z "$ALICE_ADDR" ] || [ -z "$BOB_ADDR" ]; then
  fail "Need agent wallets 'alice' and 'bob' configured. Check .env.local or /agents UI."
  exit 1
fi

success "Alice: $ALICE_ADDR"
success "Bob:   $BOB_ADDR"

# Unique IDs for this demo run
RUN_ID=$(date +%s | tail -c 7)
HAPPY_ID="demo-happy-${RUN_ID}"
DISPUTE_ID="demo-dispute-${RUN_ID}"

if [ "$SKIP_HAPPY" = false ]; then
  echo -e "\n  ${DIM}Happy path ID:${RESET}   $HAPPY_ID"
fi
echo -e "  ${DIM}Dispute path ID:${RESET} $DISPUTE_ID"

if [ "$SKIP_HAPPY" = false ]; then
# ============================================================================
header "PHASE 1: Happy Path"
# ============================================================================

narrate "Alice creates an agreement with Bob for API monitoring."
narrate "Milestone: GitHub API must return HTTP 200 with JSON."

api POST "/api/agreements" "Alice creates agreement '$HAPPY_ID'" \
  -H "x-wallet-id: alice" \
  -d "$(jq -n \
    --arg id "$HAPPY_ID" \
    --arg provider "$BOB_ADDR" \
    '{
      agreement_id: $id,
      provider: $provider,
      description: "API uptime monitoring demo",
      milestones: [{
        description: "GitHub API returns valid JSON",
        monitoring_url: "https://api.github.com",
        sla_criteria: "Response returns HTTP 200 and body is valid JSON",
        amount: "100"
      }]
    }')" || { fail "Create failed"; exit 1; }

show_field "txHash" "Tx Hash"
show_field "status" "Consensus"

divider
narrate "Bob checks his portfolio and discovers the new agreement."

api GET "/api/portfolio?address=$BOB_ADDR" "Bob checks portfolio" || true
PENDING_ACTIONS=$(echo "$LAST_RESPONSE" | jq '.actions | length' 2>/dev/null || echo 0)
echo -e "  ${DIM}Pending actions:${RESET} $PENDING_ACTIONS"

divider
narrate "Bob accepts the agreement."

api POST "/api/agreements/$HAPPY_ID/accept" "Bob accepts agreement" \
  -H "x-wallet-id: bob" \
  -d '{}' || { fail "Accept failed"; exit 1; }

show_field "status" "Consensus"

divider
narrate "Running SLA checks on the GitHub API... (3 rounds)"

for i in 1 2 3; do
  narrate "SLA check round $i/3"
  api POST "/api/agreements/$HAPPY_ID/check-sla" "SLA check #$i" \
    -H "x-wallet-id: alice" \
    -d '{"milestone_index": 0}' || true
  show_field "status" "Consensus"
done

divider
narrate "Alice verifies the milestone after passing SLA checks."

api POST "/api/agreements/$HAPPY_ID/verify" "Alice verifies milestone" \
  -H "x-wallet-id: alice" \
  -d '{"milestone_index": 0}' || { fail "Verify failed — may need more passing checks"; }

show_field "status" "Consensus"

divider
narrate "Alice releases payment for the verified milestone."

api POST "/api/agreements/$HAPPY_ID/release" "Alice releases payment" \
  -H "x-wallet-id: alice" \
  -d '{"milestone_index": 0}' || { fail "Release failed"; }

show_field "status" "Consensus"

divider
narrate "Checking final state via Alice's portfolio..."

api GET "/api/portfolio?address=$ALICE_ADDR" "Alice's final portfolio" || true
echo "$LAST_RESPONSE" | jq '.agreements[] | select(.agreement.agreement_id == "'"$HAPPY_ID"'") | {status: .agreement.statusName, milestones: [.milestones[] | {status: .statusName, passes: .pass_count}]}' 2>/dev/null | sed 's/^/  /'

success "Happy path complete!"
fi  # end SKIP_HAPPY

# ============================================================================
header "PHASE 2: Dispute Path"
# ============================================================================

narrate "Alice creates an agreement with an impossible SLA."
narrate "Criteria: 'Response must contain field nonexistent_xyz_field'"

api POST "/api/agreements" "Alice creates agreement '$DISPUTE_ID'" \
  -H "x-wallet-id: alice" \
  -d "$(jq -n \
    --arg id "$DISPUTE_ID" \
    --arg provider "$BOB_ADDR" \
    '{
      agreement_id: $id,
      provider: $provider,
      description: "Dispute resolution demo - impossible SLA",
      milestones: [{
        description: "API must return nonexistent field",
        monitoring_url: "https://api.github.com",
        sla_criteria: "Response body must contain the field nonexistent_xyz_field with a non-empty value",
        amount: "50"
      }]
    }')" || { fail "Create failed"; exit 1; }

show_field "txHash" "Tx Hash"

divider
narrate "Bob accepts the agreement."

api POST "/api/agreements/$DISPUTE_ID/accept" "Bob accepts agreement" \
  -H "x-wallet-id: bob" \
  -d '{}' || { fail "Accept failed"; exit 1; }

divider
narrate "Running SLA checks (expecting failures)..."

for i in 1 2; do
  narrate "SLA check round $i/2"
  api POST "/api/agreements/$DISPUTE_ID/check-sla" "SLA check #$i" \
    -H "x-wallet-id: alice" \
    -d '{"milestone_index": 0}' || true
  show_field "status" "Consensus"
done

divider
narrate "Alice disputes the failing milestone."

api POST "/api/agreements/$DISPUTE_ID/dispute" "Alice disputes milestone" \
  -H "x-wallet-id: alice" \
  -d '{"milestone_index": 0, "reason": "SLA criteria is impossible to meet - the API does not return the required field"}' || { fail "Dispute failed"; }

show_field "status" "Consensus"

divider
narrate "Deploying Internet Court contract for dispute resolution..."

api POST "/api/agreements/$DISPUTE_ID/court" "Deploy Internet Court" \
  -H "x-wallet-id: alice" \
  -d "{\"action\": \"deploy\", \"milestone_index\": 0, \"claim\": \"Provider failed to meet SLA - API does not return required field nonexistent_xyz_field\"}" || { fail "IC deploy failed"; }

IC_ADDRESS=$(echo "$LAST_RESPONSE" | jq -r '.courtAddress // empty' 2>/dev/null || true)
if [ -n "$IC_ADDRESS" ]; then
  echo -e "  ${DIM}IC Contract:${RESET} $IC_ADDRESS"
fi

divider
narrate "Bob accepts the Internet Court case."

api POST "/api/agreements/$DISPUTE_ID/court" "Bob accepts IC case" \
  -H "x-wallet-id: bob" \
  -d "{\"action\": \"accept\", \"milestone_index\": 0, \"court_address\": \"$IC_ADDRESS\"}" || { fail "IC accept failed"; }

divider
narrate "Alice initiates the dispute in Internet Court."

api POST "/api/agreements/$DISPUTE_ID/court" "Alice initiates IC dispute" \
  -H "x-wallet-id: alice" \
  -d "{\"action\": \"initiate\", \"milestone_index\": 0, \"court_address\": \"$IC_ADDRESS\"}" || { fail "IC initiate failed"; }

divider
narrate "Both parties submit evidence (separate transactions)..."

api POST "/api/agreements/$DISPUTE_ID/court" "Alice submits evidence" \
  -H "x-wallet-id: alice" \
  -d "{\"action\": \"submit_evidence\", \"milestone_index\": 0, \"court_address\": \"$IC_ADDRESS\", \"evidence\": \"The SLA criteria requires field nonexistent_xyz_field which does not exist in the GitHub API response. Multiple SLA checks confirmed this. The provider cannot fulfill this requirement.\"}" || { fail "Alice evidence failed"; }

api POST "/api/agreements/$DISPUTE_ID/court" "Bob submits evidence" \
  -H "x-wallet-id: bob" \
  -d "{\"action\": \"submit_evidence\", \"milestone_index\": 0, \"court_address\": \"$IC_ADDRESS\", \"evidence\": \"The GitHub API returns valid JSON with standard fields. The SLA criteria was unreasonable as it required a field that never existed in the API specification.\"}" || { fail "Bob evidence failed"; }

divider
narrate "Triggering AI jury resolution... (this takes longer)"

api POST "/api/agreements/$DISPUTE_ID/court" "AI jury resolves dispute" \
  -H "x-wallet-id: alice" \
  -d "{\"action\": \"resolve\", \"milestone_index\": 0, \"court_address\": \"$IC_ADDRESS\"}" || { fail "IC resolve failed"; }

VERDICT=$(echo "$LAST_RESPONSE" | jq -r '.verdict // empty' 2>/dev/null || true)
if [ -n "$VERDICT" ]; then
  echo -e "  ${DIM}Verdict:${RESET} $VERDICT"
fi

divider
narrate "Applying verdict back to escrow contract..."

api POST "/api/agreements/$DISPUTE_ID/court" "Apply verdict to escrow" \
  -H "x-wallet-id: alice" \
  -d "{\"action\": \"apply_verdict\", \"milestone_index\": 0, \"court_address\": \"$IC_ADDRESS\"}" || { fail "Apply verdict failed"; }

show_field "status" "Consensus"

divider
narrate "Checking final dispute state..."

api GET "/api/agreements/$DISPUTE_ID" "Final agreement state" || true
echo "$LAST_RESPONSE" | jq '{status: .statusName, milestones: [.milestones[]? | {status: .statusName, passes: .pass_count, fails: .fail_count, dispute_reason: .dispute_reason}]}' 2>/dev/null | sed 's/^/  /'

success "Dispute path complete!"

# ============================================================================
header "DEMO SUMMARY"
# ============================================================================

TOTAL_ELAPSED=$(( $(date +%s) - TOTAL_START ))
MINS=$(( TOTAL_ELAPSED / 60 ))
SECS=$(( TOTAL_ELAPSED % 60 ))

echo -e ""
echo -e "  ${GREEN}✓${RESET} Happy path:   Agreement created → SLA monitored → Verified → Paid"
echo -e "  ${GREEN}✓${RESET} Dispute path: Agreement created → SLA failed → Disputed → IC resolved"
echo -e ""
echo -e "  ${DIM}Total time:${RESET} ${MINS}m ${SECS}s"
echo -e "  ${DIM}Agreements:${RESET} $HAPPY_ID, $DISPUTE_ID"
echo -e "  ${DIM}Agents:${RESET} Alice (client), Bob (provider)"
echo -e ""
echo -e "${BOLD}AgentEscrow — Trustless SLA monitoring for AI agent commerce${RESET}"
echo -e ""
