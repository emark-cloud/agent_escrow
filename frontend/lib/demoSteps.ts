// Demo step definitions — mirrors demo.sh flows

export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface DemoStep {
  id: string;
  phase: "health" | "happy" | "dispute";
  label: string;
  narration: string;
  agent: "alice" | "bob" | "system";
  method: "GET" | "POST";
  endpoint: string; // template with {happyId}, {disputeId}, {bobAddr}, {aliceAddr}, {icAddress}
  body?: Record<string, unknown> | ((ctx: DemoContext) => Record<string, unknown>);
  walletId?: string; // x-wallet-id header
  wait?: boolean; // append ?wait=true (default true for POST)
  extractors?: Record<string, (response: any) => string>;
  displayFields?: string[];
  canFail?: boolean;
}

export interface DemoContext {
  happyId: string;
  disputeId: string;
  aliceAddr: string;
  bobAddr: string;
  icAddress: string;
  [key: string]: string;
}

export interface StepResult {
  status: StepStatus;
  httpCode?: number;
  response?: any;
  elapsed?: number;
  error?: string;
  retries?: number;
}

function interpolate(template: string, ctx: DemoContext): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => ctx[key] || `{${key}}`);
}

export function resolveEndpoint(step: DemoStep, ctx: DemoContext): string {
  return interpolate(step.endpoint, ctx);
}

export function resolveBody(step: DemoStep, ctx: DemoContext): Record<string, unknown> | undefined {
  if (!step.body) return undefined;
  if (typeof step.body === "function") return step.body(ctx);
  // Deep interpolate string values
  const resolved: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(step.body)) {
    resolved[k] = typeof v === "string" ? interpolate(v, ctx) : v;
  }
  return resolved;
}

// ── Health check ──

export const HEALTH_STEP: DemoStep = {
  id: "health",
  phase: "health",
  label: "Health Check",
  narration: "Checking server health and agent configuration...",
  agent: "system",
  method: "GET",
  endpoint: "/api/health",
  displayFields: ["contractAddress", "rpcReachable"],
  extractors: {
    aliceAddr: (r) => r.agentWallets?.alice || "",
    bobAddr: (r) => r.agentWallets?.bob || "",
  },
};

// ── Happy path ──

export const HAPPY_STEPS: DemoStep[] = [
  {
    id: "happy-create",
    phase: "happy",
    label: "Alice creates agreement",
    narration: "Alice creates an escrow agreement with Bob for API monitoring. Milestone: GitHub API must return HTTP 200 with valid JSON.",
    agent: "alice",
    method: "POST",
    endpoint: "/api/agreements",
    walletId: "alice",
    body: (ctx) => ({
      agreement_id: ctx.happyId,
      provider: ctx.bobAddr,
      description: "API uptime monitoring demo",
      milestones: [{
        description: "GitHub API returns valid JSON",
        monitoring_url: "https://api.github.com",
        sla_criteria: "Response returns HTTP 200 and body is valid JSON",
        amount: "100",
      }],
    }),
    displayFields: ["txHash", "status"],
  },
  {
    id: "happy-portfolio",
    phase: "happy",
    label: "Bob checks portfolio",
    narration: "Bob discovers the new agreement in his portfolio.",
    agent: "bob",
    method: "GET",
    endpoint: "/api/portfolio?address={bobAddr}",
    displayFields: [],
    extractors: {
      _pendingActions: (r) => String(r.actions?.length || 0),
    },
  },
  {
    id: "happy-accept",
    phase: "happy",
    label: "Bob accepts agreement",
    narration: "Bob accepts the escrow agreement. The contract is now active.",
    agent: "bob",
    method: "POST",
    endpoint: "/api/agreements/{happyId}/accept",
    walletId: "bob",
    body: {},
    displayFields: ["status"],
  },
  {
    id: "happy-sla-1",
    phase: "happy",
    label: "SLA check #1",
    narration: "The contract fetches live data from GitHub API and AI evaluates SLA compliance.",
    agent: "alice",
    method: "POST",
    endpoint: "/api/agreements/{happyId}/check-sla",
    walletId: "alice",
    body: { milestone_index: 0 },
    displayFields: ["status"],
    canFail: true,
  },
  {
    id: "happy-sla-2",
    phase: "happy",
    label: "SLA check #2",
    narration: "Running second SLA check round...",
    agent: "alice",
    method: "POST",
    endpoint: "/api/agreements/{happyId}/check-sla",
    walletId: "alice",
    body: { milestone_index: 0 },
    displayFields: ["status"],
    canFail: true,
  },
  {
    id: "happy-sla-3",
    phase: "happy",
    label: "SLA check #3",
    narration: "Running third SLA check round...",
    agent: "alice",
    method: "POST",
    endpoint: "/api/agreements/{happyId}/check-sla",
    walletId: "alice",
    body: { milestone_index: 0 },
    displayFields: ["status"],
    canFail: true,
  },
  {
    id: "happy-verify",
    phase: "happy",
    label: "Alice verifies milestone",
    narration: "After passing SLA checks, Alice verifies the milestone for payment.",
    agent: "alice",
    method: "POST",
    endpoint: "/api/agreements/{happyId}/verify",
    walletId: "alice",
    body: { milestone_index: 0 },
    displayFields: ["status"],
  },
  {
    id: "happy-release",
    phase: "happy",
    label: "Alice releases payment",
    narration: "Alice releases the escrow payment to Bob. The agreement is now complete.",
    agent: "alice",
    method: "POST",
    endpoint: "/api/agreements/{happyId}/release",
    walletId: "alice",
    body: { milestone_index: 0 },
    displayFields: ["status"],
  },
  {
    id: "happy-final",
    phase: "happy",
    label: "Final portfolio check",
    narration: "Checking the final state of the completed agreement.",
    agent: "alice",
    method: "GET",
    endpoint: "/api/agreements/{happyId}",
    displayFields: [],
  },
];

// ── Dispute path ──

export const DISPUTE_STEPS: DemoStep[] = [
  {
    id: "dispute-create",
    phase: "dispute",
    label: "Alice creates agreement (impossible SLA)",
    narration: "Alice creates an agreement with an impossible SLA criteria: the API must return a field that doesn't exist.",
    agent: "alice",
    method: "POST",
    endpoint: "/api/agreements",
    walletId: "alice",
    body: (ctx) => ({
      agreement_id: ctx.disputeId,
      provider: ctx.bobAddr,
      description: "Dispute resolution demo - impossible SLA",
      milestones: [{
        description: "API must return nonexistent field",
        monitoring_url: "https://api.github.com",
        sla_criteria: "Response body must contain the field nonexistent_xyz_field with a non-empty value",
        amount: "50",
      }],
    }),
    displayFields: ["txHash", "status"],
  },
  {
    id: "dispute-accept",
    phase: "dispute",
    label: "Bob accepts agreement",
    narration: "Bob accepts the agreement, unaware the SLA criteria is impossible to meet.",
    agent: "bob",
    method: "POST",
    endpoint: "/api/agreements/{disputeId}/accept",
    walletId: "bob",
    body: {},
    displayFields: ["status"],
  },
  {
    id: "dispute-sla-1",
    phase: "dispute",
    label: "SLA check #1 (expecting failure)",
    narration: "Running SLA check — the impossible criteria should cause this to fail.",
    agent: "alice",
    method: "POST",
    endpoint: "/api/agreements/{disputeId}/check-sla",
    walletId: "alice",
    body: { milestone_index: 0 },
    displayFields: ["status"],
    canFail: true,
  },
  {
    id: "dispute-sla-2",
    phase: "dispute",
    label: "SLA check #2 (expecting failure)",
    narration: "Second SLA check confirms the failure pattern.",
    agent: "alice",
    method: "POST",
    endpoint: "/api/agreements/{disputeId}/check-sla",
    walletId: "alice",
    body: { milestone_index: 0 },
    displayFields: ["status"],
    canFail: true,
  },
  {
    id: "dispute-dispute",
    phase: "dispute",
    label: "Alice disputes milestone",
    narration: "Alice flags the milestone as disputed after SLA failures.",
    agent: "alice",
    method: "POST",
    endpoint: "/api/agreements/{disputeId}/dispute",
    walletId: "alice",
    body: { milestone_index: 0, reason: "SLA criteria is impossible to meet - the API does not return the required field" },
    displayFields: ["status"],
  },
  {
    id: "dispute-ic-deploy",
    phase: "dispute",
    label: "Deploy Internet Court",
    narration: "Alice deploys an Internet Court contract to resolve the dispute. An AI jury will evaluate the evidence.",
    agent: "alice",
    method: "POST",
    endpoint: "/api/agreements/{disputeId}/court",
    walletId: "alice",
    body: { action: "deploy", milestone_index: 0, claim: "Provider failed to meet SLA - API does not return required field nonexistent_xyz_field" },
    displayFields: ["courtAddress", "status"],
    extractors: {
      icAddress: (r) => r.courtAddress || "",
    },
  },
  {
    id: "dispute-ic-accept",
    phase: "dispute",
    label: "Bob accepts IC case",
    narration: "Bob accepts the Internet Court case to participate in dispute resolution.",
    agent: "bob",
    method: "POST",
    endpoint: "/api/agreements/{disputeId}/court",
    walletId: "bob",
    body: (ctx) => ({ action: "accept", milestone_index: 0, court_address: ctx.icAddress }),
    displayFields: ["status"],
  },
  {
    id: "dispute-ic-initiate",
    phase: "dispute",
    label: "Alice initiates IC dispute",
    narration: "Alice initiates the formal dispute process in Internet Court.",
    agent: "alice",
    method: "POST",
    endpoint: "/api/agreements/{disputeId}/court",
    walletId: "alice",
    body: (ctx) => ({ action: "initiate", milestone_index: 0, court_address: ctx.icAddress }),
    displayFields: ["status"],
  },
  {
    id: "dispute-evidence-alice",
    phase: "dispute",
    label: "Alice submits evidence",
    narration: "Alice presents her case: the SLA criteria requires a field that doesn't exist in the API.",
    agent: "alice",
    method: "POST",
    endpoint: "/api/agreements/{disputeId}/court",
    walletId: "alice",
    body: (ctx) => ({
      action: "submit_evidence",
      milestone_index: 0,
      court_address: ctx.icAddress,
      evidence: "The SLA criteria requires field nonexistent_xyz_field which does not exist in the GitHub API response. Multiple SLA checks confirmed this. The provider cannot fulfill this requirement.",
    }),
    displayFields: ["status"],
  },
  {
    id: "dispute-evidence-bob",
    phase: "dispute",
    label: "Bob submits evidence",
    narration: "Bob presents his defense: the SLA criteria was unreasonable.",
    agent: "bob",
    method: "POST",
    endpoint: "/api/agreements/{disputeId}/court",
    walletId: "bob",
    body: (ctx) => ({
      action: "submit_evidence",
      milestone_index: 0,
      court_address: ctx.icAddress,
      evidence: "The GitHub API returns valid JSON with standard fields. The SLA criteria was unreasonable as it required a field that never existed in the API specification.",
    }),
    displayFields: ["status"],
  },
  {
    id: "dispute-ic-resolve",
    phase: "dispute",
    label: "AI jury resolves dispute",
    narration: "The AI jury evaluates both parties' evidence and delivers a binding verdict. This is the longest step.",
    agent: "alice",
    method: "POST",
    endpoint: "/api/agreements/{disputeId}/court",
    walletId: "alice",
    body: (ctx) => ({ action: "resolve", milestone_index: 0, court_address: ctx.icAddress }),
    displayFields: ["verdict", "status"],
  },
  {
    id: "dispute-apply-verdict",
    phase: "dispute",
    label: "Apply verdict to escrow",
    narration: "The Internet Court verdict is applied back to the escrow contract, settling the dispute.",
    agent: "alice",
    method: "POST",
    endpoint: "/api/agreements/{disputeId}/court",
    walletId: "alice",
    body: (ctx) => ({ action: "apply_verdict", milestone_index: 0, court_address: ctx.icAddress }),
    displayFields: ["status"],
  },
  {
    id: "dispute-final",
    phase: "dispute",
    label: "Final dispute state",
    narration: "Checking the final state of the disputed agreement.",
    agent: "system",
    method: "GET",
    endpoint: "/api/agreements/{disputeId}",
    displayFields: [],
  },
];
