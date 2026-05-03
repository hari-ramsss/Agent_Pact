export interface Pact {
  id: number;
  task: string;
  agentA: string;
  agentB: string;
  agentAAddress?: string;
  agentBAddress?: string;
  payment: number;
  bond: number;
  status: "Created" | "Active" | "Submitted" | "Disputed" | "Resolved";
  verdict: "Pass" | "Fail" | null;
  created: string;
  disputed: string | null;
  resolved: string | null;
  taskSpec: string;
  submission: string | null;
  verdictURI: string | null;
  confidence: number | null;
  score_delta: number | null;
}

export interface Agent {
  addr: string;
  type: "employer" | "worker" | "both";
  score: number;
  goodRep: string;
  badRep: string;
  pacts: number;
  metaURI: string;
  active: boolean;
}

export const MOCK_PACTS: Pact[] = [
  { id: 0, task: "Sort algorithm impl.", agentA: "0xA1b2...", agentB: "0xC3d4...", payment: 50, bond: 50, status: "Resolved", verdict: "Pass", created: "2026-04-28", disputed: "2026-04-29", resolved: "2026-04-30", taskSpec: "0g://abc123", submission: "0g://def456", verdictURI: "0g://ghi789", confidence: 88, score_delta: 10 },
  { id: 1, task: "Compound interest fn.", agentA: "0xE5f6...", agentB: "0xC3d4...", payment: 30, bond: 50, status: "Disputed", verdict: null, created: "2026-05-01", disputed: "2026-05-01", resolved: null, taskSpec: "0g://jkl012", submission: "0g://mno345", verdictURI: null, confidence: null, score_delta: null },
  { id: 2, task: "REST API scaffolding", agentA: "0xA1b2...", agentB: "0xG7h8...", payment: 80, bond: 75, status: "Submitted", verdict: null, created: "2026-04-30", disputed: null, resolved: null, taskSpec: "0g://pqr678", submission: "0g://stu901", verdictURI: null, confidence: null, score_delta: null },
  { id: 3, task: "Token price feed", agentA: "0xI9j0...", agentB: "0xK1l2...", payment: 40, bond: 50, status: "Active", verdict: null, created: "2026-05-01", disputed: null, resolved: null, taskSpec: "0g://vwx234", submission: null, verdictURI: null, confidence: null, score_delta: null },
  { id: 4, task: "On-chain data parser", agentA: "0xM3n4...", agentB: "0xC3d4...", payment: 60, bond: 75, status: "Resolved", verdict: "Fail", created: "2026-04-25", disputed: "2026-04-26", resolved: "2026-04-27", taskSpec: "0g://yza567", submission: "0g://bcd890", verdictURI: "0g://efg123", confidence: 91, score_delta: -20 },
  { id: 5, task: "ERC-20 integration test", agentA: "0xE5f6...", agentB: "0xG7h8...", payment: 25, bond: 50, status: "Created", verdict: null, created: "2026-05-02", disputed: null, resolved: null, taskSpec: "0g://hij456", submission: null, verdictURI: null, confidence: null, score_delta: null },
  { id: 6, task: "GraphQL schema design", agentA: "0xA1b2...", agentB: "0xK1l2...", payment: 55, bond: 50, status: "Resolved", verdict: "Pass", created: "2026-04-20", disputed: "2026-04-21", resolved: "2026-04-22", taskSpec: "0g://klm789", submission: "0g://nop012", verdictURI: "0g://qrs345", confidence: 76, score_delta: 10 },
];

export const MOCK_AGENTS: Agent[] = [
  { addr: "0xA1b2...C3D4", type: "employer", score: 30, goodRep: "0", badRep: "0", pacts: 3, metaURI: "0g://meta-a1b2", active: true },
  { addr: "0xC3d4...E5F6", type: "worker", score: -10, goodRep: "60000000000000000000", badRep: "60000000000000000000", pacts: 3, metaURI: "0g://meta-c3d4", active: true },
  { addr: "0xE5f6...G7H8", type: "employer", score: 20, goodRep: "0", badRep: "0", pacts: 2, metaURI: "0g://meta-e5f6", active: true },
  { addr: "0xG7h8...I9J0", type: "worker", score: 10, goodRep: "30000000000000000000", badRep: "0", pacts: 2, metaURI: "0g://meta-g7h8", active: true },
  { addr: "0xI9j0...K1L2", type: "both", score: 0, goodRep: "0", badRep: "0", pacts: 1, metaURI: "0g://meta-i9j0", active: true },
  { addr: "0xK1l2...M3N4", type: "worker", score: 10, goodRep: "30000000000000000000", badRep: "0", pacts: 2, metaURI: "0g://meta-k1l2", active: true },
];

export const ARB_LOG = [
  { tag: "STEP1", msg: "Parsing requirements for pact #1...", type: "info" as const },
  { tag: "STEP1", msg: "Found 5 requirements in task spec", type: "info" as const },
  { tag: "STEP2", msg: "Fetching submission from 0G Storage (0g://mno345)", type: "info" as const },
  { tag: "STEP2", msg: "Mapping requirements → YES/PARTIAL/NO", type: "info" as const },
  { tag: "STEP3", msg: "Req 1: formula correctness → NO (critical)", type: "warn" as const },
  { tag: "STEP3", msg: "Req 2: edge case handling → NO (critical)", type: "warn" as const },
  { tag: "STEP4", msg: "Confidence self-assessment: 91/100", type: "info" as const },
  { tag: "STEP5", msg: "Verdict: FAIL — 2 critical requirements unmet", type: "warn" as const },
  { tag: "0G-LOG", msg: "Writing verdict to 0G Storage...", type: "info" as const },
  { tag: "KEEPER", msg: "Triggering KeeperHub → resolveDispute(1)", type: "info" as const },
];
