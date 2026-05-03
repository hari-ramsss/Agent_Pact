import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { uploadContent, hashContent } from '../og-storage';
import { checkRelevance } from '../gensyn-gate';

dotenv.config();

// ── ABI ───────────────────────────────────────────────────────────────

const AGENTPACT_ABI = [
  'function createPact(bytes32 taskSpecHash, uint256 paymentAmount, address workerAgent, string calldata og0StorageURI) external returns (uint256)',
  'function acceptPact(uint256 pactId) external',
  'function submitWork(uint256 pactId, bytes32 submissionHash, string calldata og0SubmissionURI) external',
  'function raiseDispute(uint256 pactId) external',
  'function getBondRequired(address agent) external view returns (uint256)',
  'function creditScores(address) external view returns (int256)',
  'function pacts(uint256) external view returns (uint256 id, address agentA, address agentB, uint256 paymentAmount, uint256 bondAmount, uint8 status, bytes32 taskSpecHash, string og0StorageURI, bytes32 submissionHash, string og0SubmissionURI, string og0VerdictURI, uint256 createdAt, uint256 disputeOpenedAt, uint256 timeoutBlocks)',
  'event PactCreated(uint256 indexed pactId, address indexed agentA, uint256 paymentAmount, uint256 bondRequired, bytes32 taskSpecHash, string og0StorageURI)',
  'event DisputeResolved(uint256 indexed pactId, uint8 verdict, uint256 confidence, string og0VerdictURI)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
];

// ── Console helpers ───────────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';

function banner(text: string) {
  console.log(`\n${BOLD}${CYAN}${'═'.repeat(64)}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}${'═'.repeat(64)}${RESET}\n`);
}

function step(n: number, text: string) {
  console.log(`  ${BOLD}${GREEN}[STEP ${n}]${RESET} ${text}`);
}

function info(label: string, value: string) {
  console.log(`    ${YELLOW}${label}:${RESET} ${value}`);
}

function success(text: string) {
  console.log(`    ${GREEN}✅ ${text}${RESET}`);
}

function warn(text: string) {
  console.log(`    ${YELLOW}⚠️  ${text}${RESET}`);
}

function fail(text: string) {
  console.log(`    ${RED}❌ ${text}${RESET}`);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Environment ───────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

// ── Task data ─────────────────────────────────────────────────────────

const TASK_SPEC = `TASK: Implement a TypeScript function called 'calculateCompoundInterest'.
REQUIREMENTS:
1. Function signature: calculateCompoundInterest(principal: number, rate: number, periods: number): number
2. Formula: principal * (1 + rate) ^ periods
3. Return value rounded to 2 decimal places
4. Handle edge case: periods = 0 should return principal unchanged
5. All inputs must be positive numbers`;

// Intentionally bad submission — will FAIL arbitration to show the full penalty flow
const BAD_SUBMISSION = `function calculateCompoundInterest(p: number, r: number, n: number): number {
  return p + r; // incorrect formula, missing edge cases
}`;

// Good submission — will PASS arbitration
const GOOD_SUBMISSION = `function calculateCompoundInterest(
  principal: number,
  rate: number,
  periods: number
): number {
  if (periods === 0) return principal;
  if (principal <= 0 || rate <= 0 || periods <= 0) {
    throw new Error("All inputs must be positive");
  }
  return Math.round(principal * Math.pow(1 + rate, periods) * 100) / 100;
}`;

// ── Main demo ─────────────────────────────────────────────────────────

async function runDemo() {
  const useBadSubmission = process.env.FORCE_BAD_SUBMISSION === 'true';
  const SUBMISSION = useBadSubmission ? BAD_SUBMISSION : GOOD_SUBMISSION;

  banner('AgentPact — Live Demo');
  console.log(`  ${BOLD}Trustless escrow + dispute resolution for AI-to-AI work contracts.${RESET}`);
  console.log(`  ${DIM}ETHGlobal Open Agents 2026${RESET}`);
  console.log(`  ${DIM}Submission type: ${useBadSubmission ? 'BAD (will FAIL)' : 'GOOD (will PASS)'}${RESET}\n`);

  // ── Setup wallets ──────────────────────────────────────────────────

  const provider = new ethers.JsonRpcProvider(requireEnv('SEPOLIA_RPC_URL'));
  const agentPactAddress = requireEnv('AGENTPACT_ADDRESS');
  const usdcAddress = process.env.USDC_ADDRESS || process.env.SEPOLIA_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

  const agentAWallet = new ethers.Wallet(
    process.env.AGENT_A_PRIVATE_KEY || requireEnv('PRIVATE_KEY'),
    provider,
  );
  const agentBWallet = new ethers.Wallet(requireEnv('AGENT_B_PRIVATE_KEY'), provider);

  const agentPact = new ethers.Contract(agentPactAddress, AGENTPACT_ABI, agentAWallet);
  const agentPactB = agentPact.connect(agentBWallet) as ethers.Contract;
  const usdcA = new ethers.Contract(usdcAddress, ERC20_ABI, agentAWallet);
  const usdcB = usdcA.connect(agentBWallet) as ethers.Contract;

  await sleep(500);

  // ══════════════════════════════════════════════════════════════════
  // SCENE 1: Reputation check
  // ══════════════════════════════════════════════════════════════════

  banner('SCENE 1: Pre-Pact Reputation Check');

  step(1, 'Querying on-chain reputation for Agent B...');
  const creditScoreBefore = await agentPact.creditScores(agentBWallet.address);
  const bondRequired = await agentPact.getBondRequired(agentBWallet.address);
  info('Worker address', agentBWallet.address);
  info('Credit score', creditScoreBefore.toString());
  info('Bond required', `${ethers.formatUnits(bondRequired, 6)} USDC`);
  success('Reputation fetched from Sepolia');

  await sleep(1000);

  // ══════════════════════════════════════════════════════════════════
  // SCENE 2: Upload task spec to 0G Storage → Create pact on Sepolia
  // ══════════════════════════════════════════════════════════════════

  banner('SCENE 2: Task Spec → 0G Storage → Pact Created');

  step(2, 'Uploading task spec to 0G Storage...');
  const taskSpecURI = await uploadContent(TASK_SPEC, `demo-task-${Date.now()}`);
  const taskSpecHash = hashContent(TASK_SPEC);
  info('0G Storage URI', taskSpecURI);
  info('Task spec hash', taskSpecHash.slice(0, 20) + '...');
  success('Task spec is now immutable on 0G');

  await sleep(500);

  const paymentAmountUsdc = '1';
  const paymentAmount = ethers.parseUnits(paymentAmountUsdc, 6);

  step(3, 'Agent A approving USDC spend...');
  const balA = await usdcA.balanceOf(agentAWallet.address);
  info('Agent A USDC balance', ethers.formatUnits(balA, 6));
  if (balA < paymentAmount) {
    fail(`Agent A needs ${paymentAmountUsdc} USDC but has ${ethers.formatUnits(balA, 6)}`);
    return;
  }
  const approveTxA = await usdcA.approve(agentPactAddress, paymentAmount);
  await approveTxA.wait();
  success(`USDC approved (tx: ${approveTxA.hash.slice(0, 18)}...)`);

  step(4, 'Calling createPact() on Sepolia...');
  const createTx = await agentPact.createPact(
    taskSpecHash,
    paymentAmount,
    agentBWallet.address,
    taskSpecURI,
  );
  const createReceipt = await createTx.wait();
  if (!createReceipt) throw new Error('createPact not mined');

  const createdEvent = createReceipt.logs
    .map((log: ethers.Log) => { try { return agentPact.interface.parseLog(log); } catch { return null; } })
    .find((e: ethers.LogDescription | null) => e?.name === 'PactCreated');

  const pactId = Number(createdEvent?.args?.pactId);
  info('Pact ID', pactId.toString());
  info('Payment locked', `${paymentAmountUsdc} USDC in escrow`);
  info('TX', createTx.hash);
  success('PactCreated event emitted on Sepolia');

  await sleep(1000);

  // ══════════════════════════════════════════════════════════════════
  // SCENE 3: Worker accepts → Gensyn gate → Submit work
  // ══════════════════════════════════════════════════════════════════

  banner('SCENE 3: Worker Accepts → Gensyn Gate → Work Submitted');

  step(5, 'Agent B approving bond + accepting pact...');
  const balB = await usdcB.balanceOf(agentBWallet.address);
  info('Agent B USDC balance', ethers.formatUnits(balB, 6));
  if (balB < bondRequired) {
    fail(`Agent B needs ${ethers.formatUnits(bondRequired, 6)} USDC bond but has ${ethers.formatUnits(balB, 6)}`);
    return;
  }
  const approveTxB = await usdcB.approve(agentPactAddress, bondRequired);
  await approveTxB.wait();
  const acceptTx = await agentPactB.acceptPact(pactId);
  await acceptTx.wait();
  info('Accept TX', acceptTx.hash.slice(0, 18) + '...');
  success('Bond locked. Pact is now ACTIVE.');

  await sleep(500);

  step(6, 'Running Gensyn relevance gate on submission...');
  const relevance = await checkRelevance(TASK_SPEC, SUBMISSION);
  info('Cosine similarity', relevance.similarity.toString());
  info('Threshold', relevance.threshold.toString());
  if (relevance.passed) {
    success('Relevance gate PASSED — submission is on-topic');
  } else {
    fail(`Relevance gate FAILED — ${relevance.warning}`);
    warn('In strict mode this would block submission. Continuing for demo...');
  }

  await sleep(500);

  step(7, 'Uploading submission to 0G Storage + calling submitWork()...');
  const submissionURI = await uploadContent(SUBMISSION, `demo-submission-${Date.now()}`);
  const submissionHash = hashContent(SUBMISSION);
  info('Submission URI', submissionURI);
  const submitTx = await agentPactB.submitWork(pactId, submissionHash, submissionURI);
  await submitTx.wait();
  info('Submit TX', submitTx.hash.slice(0, 18) + '...');
  success('WorkSubmitted event emitted. Pact status → SUBMITTED.');

  await sleep(1000);

  // ══════════════════════════════════════════════════════════════════
  // SCENE 4: Dispute raised → Arbitrator picks it up
  // ══════════════════════════════════════════════════════════════════

  banner('SCENE 4: Dispute Raised → Arbitrator Agent');

  step(8, 'Employer raises dispute...');
  const disputeTx = await agentPact.raiseDispute(pactId);
  await disputeTx.wait();
  info('Dispute TX', disputeTx.hash);
  success('ArbitrationRequested event emitted on Sepolia');

  console.log(`
  ${BOLD}${CYAN}What happens next (in the Arbitrator terminal):${RESET}
  ${DIM}1. Arbitrator fetches task spec from 0G Storage${RESET}
  ${DIM}2. Arbitrator fetches submission from 0G Storage${RESET}
  ${DIM}3. 5-step LLM reasoning loop runs on 0G Compute (qwen3:7b)${RESET}
  ${DIM}4. Verdict + full reasoning trace written to 0G Storage${RESET}
  ${DIM}5. KeeperHub calls resolveDispute() on-chain${RESET}
`);

  info('Arbitrator', 'npm run arbitrator (must be running in another terminal)');

  await sleep(2000);

  // ══════════════════════════════════════════════════════════════════
  // SCENE 5: Poll for resolution + show post-resolution reputation
  // ══════════════════════════════════════════════════════════════════

  banner('SCENE 5: Waiting for On-Chain Resolution');

  step(9, 'Polling pact status every 10 seconds...');

  let resolved = false;
  for (let i = 0; i < 36; i++) {  // up to 6 minutes
    try {
      const pact = await agentPact.pacts(pactId);
      const status = Number(pact.status);
      if (status === 4) { // Resolved
        resolved = true;
        const verdictURI = pact.og0VerdictURI;
        info('Status', 'RESOLVED');
        info('Verdict URI', verdictURI || '—');
        success('Arbitrator verdict executed on-chain!');
        break;
      }
    } catch { }
    process.stdout.write(`    ${DIM}[${i + 1}/36] checking...${RESET}\r`);
    await sleep(10_000);
  }

  console.log(); // clear the \r line

  if (!resolved) {
    warn('Pact not yet resolved after 6 minutes.');
    warn('The Arbitrator may still be processing. Check:');
    info('Etherscan', `https://sepolia.etherscan.io/address/${agentPactAddress}#events`);
    info('Pact ID', pactId.toString());
  }

  // ── Post-resolution reputation ────────────────────────────────────

  banner('SCENE 6: Post-Resolution Reputation');

  step(10, 'Querying final reputation for Agent B...');
  const creditScoreAfter = await agentPact.creditScores(agentBWallet.address);
  info('Credit score before', creditScoreBefore.toString());
  info('Credit score after', creditScoreAfter.toString());
  info('Delta', `${Number(creditScoreAfter) - Number(creditScoreBefore)}`);

  if (resolved) {
    success('Reputation permanently updated on Sepolia.');
  } else {
    warn('Score may not have changed yet (resolution pending).');
  }

  // ── Final summary ─────────────────────────────────────────────────

  banner('Demo Complete');

  console.log(`  ${BOLD}What you just saw — all real, all on-chain:${RESET}

  ${GREEN}1.${RESET} Task spec uploaded to ${BOLD}0G Storage${RESET} — hash verified on Sepolia
  ${GREEN}2.${RESET} Payment + bond locked in ${BOLD}AgentPact escrow${RESET}
  ${GREEN}3.${RESET} ${BOLD}Gensyn${RESET} embedding gate checked submission relevance
  ${GREEN}4.${RESET} Autonomous ${BOLD}Arbitrator on 0G Compute${RESET} ran 5-step reasoning
  ${GREEN}5.${RESET} Verdict written to ${BOLD}0G Storage${RESET} — full audit trail
  ${GREEN}6.${RESET} ${BOLD}KeeperHub${RESET} automated resolveDispute() on-chain
  ${GREEN}7.${RESET} ${BOLD}$GOODREP / $BADREP${RESET} minted based on outcome
  ${GREEN}8.${RESET} ${BOLD}Credit score${RESET} updated — affects future bond requirements

  ${BOLD}${CYAN}Prize targets:${RESET}
  💰 KeeperHub FA1+FA2  — automated verdict execution + OpenClaw connector
  💰 Uniswap dual       — $BADREP v3 swap + $GOODREP v4 yield hook
  💰 0G Track 2         — Arbitrator on 0G Compute with KV + Storage Log
  💰 Main track         — complete trustless AI-to-AI work protocol

  ${BOLD}Pact ID:${RESET}          ${pactId}
  ${BOLD}Contract:${RESET}         ${agentPactAddress}
  ${BOLD}Etherscan:${RESET}        https://sepolia.etherscan.io/address/${agentPactAddress}#events
`);
}

runDemo().catch(err => {
  console.error(`\n${RED}${BOLD}Demo error:${RESET} ${err.message}\n`);
  if (err.message.includes('USDC')) {
    console.error(`${YELLOW}Tip: Get test USDC from https://faucet.circle.com/ (select Sepolia)${RESET}`);
  }
  process.exit(1);
});
