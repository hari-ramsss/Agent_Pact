import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { uploadToStorage, hashContent, downloadContent } from './og-storage';
import { readCreditScore } from './og-kv';
import { checkRelevance } from './gensyn-gate';

dotenv.config();

const AGENTPACT_ABI = [
  'function createPact(bytes32 taskSpecHash, uint256 paymentAmount, address workerAgent, string calldata og0StorageURI) external returns (uint256)',
  'function acceptPact(uint256 pactId) external',
  'function submitWork(uint256 pactId, bytes32 submissionHash, string calldata og0SubmissionURI) external',
  'function getPact(uint256 pactId) external view returns (tuple(uint256 id, address agentA, address agentB, uint256 paymentAmount, uint256 bondAmount, uint8 status, bytes32 taskSpecHash, string og0StorageURI, bytes32 submissionHash, string og0SubmissionURI, string og0VerdictURI, uint256 createdAt, uint256 disputeOpenedAt, uint256 timeoutBlocks))',
  'function getBondRequired(address agent) external view returns (uint256)',
  'event PactCreated(uint256 indexed pactId, address indexed agentA, uint256 paymentAmount, uint256 bondRequired, bytes32 taskSpecHash, string og0StorageURI)'
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)'
];

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL;
const AGENTPACT_ADDRESS = process.env.AGENTPACT_ADDRESS;
const AGENT_A_PRIVATE_KEY = process.env.AGENT_A_PRIVATE_KEY || process.env.PRIVATE_KEY;
const AGENT_B_PRIVATE_KEY = process.env.AGENT_B_PRIVATE_KEY;
const AGENT_B_ADDRESS = process.env.AGENT_B_ADDRESS;
const SEPOLIA_USDC = process.env.SEPOLIA_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const DEMO_SUBMISSION = process.env.DEMO_SUBMISSION;

if (!SEPOLIA_RPC || !AGENTPACT_ADDRESS || !AGENT_A_PRIVATE_KEY || !AGENT_B_ADDRESS) {
  throw new Error('Set SEPOLIA_RPC_URL, AGENTPACT_ADDRESS, AGENT_A_PRIVATE_KEY or PRIVATE_KEY, and AGENT_B_ADDRESS in .env');
}

const sepoliaRpc = SEPOLIA_RPC;
const agentPactAddress = AGENTPACT_ADDRESS;
const agentAPrivateKey = AGENT_A_PRIVATE_KEY;
const agentBAddress = AGENT_B_ADDRESS;

const TASK_SPEC = {
  title: 'Write a Solidity escrow contract',
  description: 'Write a Solidity smart contract that implements a basic escrow. The employer deposits funds, the worker completes the task, and an arbiter releases or refunds the funds.',
  requirements: [
    'Must use Solidity ^0.8.20',
    'Must emit Deposited, Released, and Refunded events',
    'Must have a deposit() function payable',
    'Must have a release() function callable only by arbiter',
    'Must have a refund() function callable only by arbiter'
  ],
  testSuite: {
    tests: [
      'test_deposit_locks_funds',
      'test_release_sends_to_worker',
      'test_refund_returns_to_employer',
      'test_only_arbiter_can_release',
      'test_only_arbiter_can_refund'
    ],
    passingThreshold: 5
  },
  paymentUsdc: 100,
  deadline: '72 hours from acceptance'
};

async function createPactWithRealStorage() {
  console.log('\n========== AgentPact: createPact with 0G Storage ==========\n');

  console.log('Step 1: Uploading task spec to 0G Storage...');
  const uploadResult = await uploadToStorage(TASK_SPEC, 'task-spec');

  const taskSpecHash = hashContent(TASK_SPEC);
  console.log(`\nStep 2: Task spec hash: ${taskSpecHash}`);

  console.log(`\nStep 3: Reading credit score for Agent B (${agentBAddress})...`);
  const creditScore = await readCreditScore(agentBAddress);
  console.log(`Credit score: ${creditScore}`);

  const provider = new ethers.JsonRpcProvider(sepoliaRpc);
  const agentASigner = new ethers.Wallet(agentAPrivateKey, provider);
  const agentPact = new ethers.Contract(agentPactAddress, AGENTPACT_ABI, agentASigner);
  const usdc = new ethers.Contract(SEPOLIA_USDC, ERC20_ABI, agentASigner);

  const bondRequired = await agentPact.getBondRequired(agentBAddress);
  console.log(`\nStep 4: Bond required: ${ethers.formatUnits(bondRequired, 6)} USDC`);

  const paymentAmount = ethers.parseUnits('100', 6);
  const balance = await usdc.balanceOf(agentASigner.address);
  if (balance < paymentAmount) {
    throw new Error(`Agent A needs 100 test USDC, current balance is ${ethers.formatUnits(balance, 6)} USDC`);
  }

  console.log(`\nStep 5: Approving ${ethers.formatUnits(paymentAmount, 6)} USDC...`);
  const approveTx = await usdc.approve(agentPactAddress, paymentAmount);
  await approveTx.wait();
  console.log(`USDC approved. TX: ${approveTx.hash}`);

  console.log('\nStep 6: Calling createPact() on Sepolia...');
  const createTx = await agentPact.createPact(
    taskSpecHash,
    paymentAmount,
    agentBAddress,
    uploadResult.uri
  );

  const receipt = await createTx.wait();
  console.log(`createPact() executed. TX: ${createTx.hash}`);

  const event = receipt.logs
    .map((log: ethers.Log) => {
      try {
        return agentPact.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed: ethers.LogDescription | null) => parsed?.name === 'PactCreated');

  const pactIdRaw = event?.args?.pactId;
  const pactId = pactIdRaw !== undefined ? BigInt(pactIdRaw.toString()) : null;
  console.log(`\nPact created. Pact ID: ${pactId !== null ? pactId.toString() : 'unknown'}`);

  if (pactId !== null) {
    const pact = await agentPact.getPact(pactId);
    const storedTaskSpecHash = (pact.taskSpecHash ?? pact[6]) as string;
    const storedTaskSpecUri = (pact.og0StorageURI ?? pact[7]) as string;
    const storedBondAmount = (pact.bondAmount ?? pact[4]) as bigint;
    const storedStatus = Number(pact.status ?? pact[5]);
    const uriMatch = storedTaskSpecUri === uploadResult.uri;
    const hashMatch = storedTaskSpecHash.toLowerCase() === taskSpecHash.toLowerCase();

    console.log('\n========== Summary ==========');
    console.log(`Pact ID:          ${pactId.toString()}`);
    console.log(`Task spec on 0G:  ${uploadResult.uri}`);
    console.log(`Hash on Sepolia:  ${taskSpecHash}`);
    console.log(`Bond required:    ${ethers.formatUnits(bondRequired, 6)} USDC`);
    console.log(`Agent B score:    ${creditScore}`);
    console.log(`Chain of custody: ${uriMatch && hashMatch ? 'VERIFIED' : 'BROKEN'}`);

    if (DEMO_SUBMISSION && AGENT_B_PRIVATE_KEY) {
      console.log('\nStep 7: Running submitWork flow with Gensyn relevance gate...');

      const taskSpec = await downloadContent(uploadResult.uri);
      const relevance = await checkRelevance(taskSpec, DEMO_SUBMISSION);
      if (!relevance.passed) {
        throw new Error(`[GENSYN] Relevance gate FAILED: ${relevance.warning}. Submission blocked!`);
      }

      const agentBSigner = new ethers.Wallet(AGENT_B_PRIVATE_KEY, provider);
      const agentPactB = agentPact.connect(agentBSigner) as ethers.Contract;
      const usdcB = usdc.connect(agentBSigner) as ethers.Contract;
      const pactStatus = storedStatus;

      if (pactStatus === 0) {
        console.log(`Step 7a: Agent B approving bond (${ethers.formatUnits(storedBondAmount, 6)} USDC)...`);
        const approveBondTx = await usdcB.approve(agentPactAddress, storedBondAmount);
        await approveBondTx.wait();

        console.log('Step 7b: Agent B accepting pact...');
        const acceptTx = await agentPactB.acceptPact(pactId);
        await acceptTx.wait();
      }

      console.log('Step 7c: Uploading submission to 0G Storage...');
      const submissionUpload = await uploadToStorage(DEMO_SUBMISSION, 'demo-submission');
      const submissionHash = hashContent(DEMO_SUBMISSION);

      console.log('Step 7d: Calling submitWork()...');
      const submitTx = await agentPactB.submitWork(pactId, submissionHash, submissionUpload.uri);
      await submitTx.wait();
      console.log(`submitWork() executed. TX: ${submitTx.hash}`);
    }
  }
}

createPactWithRealStorage().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
