import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { uploadContent, hashContent } from '../og-storage';
import { checkRelevance } from '../gensyn-gate';

dotenv.config();

const AGENTPACT_ABI = [
  'function createPact(bytes32 taskSpecHash, uint256 paymentAmount, address workerAgent, string calldata og0StorageURI) external returns (uint256)',
  'function acceptPact(uint256 pactId) external',
  'function submitWork(uint256 pactId, bytes32 submissionHash, string calldata og0SubmissionURI) external',
  'function raiseDispute(uint256 pactId) external',
  'function getBondRequired(address agent) external view returns (uint256)',
  'event PactCreated(uint256 indexed pactId, address indexed agentA, uint256 paymentAmount, uint256 bondRequired, bytes32 taskSpecHash, string og0StorageURI)',
  'event ArbitrationRequested(uint256 indexed pactId, string taskSpecURI, string submissionURI, address agentB)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} in .env`);
  }
  return value;
}

async function approveIfFunded(
  token: ethers.Contract,
  owner: string,
  spender: string,
  amount: bigint,
  label: string,
): Promise<void> {
  const balance = await token.balanceOf(owner);
  if (balance < amount) {
    throw new Error(`${label} needs ${ethers.formatUnits(amount, 6)} USDC, current balance is ${ethers.formatUnits(balance, 6)}`);
  }

  const tx = await token.approve(spender, amount);
  await tx.wait();
}

async function runE2ETest(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(requireEnv('SEPOLIA_RPC_URL'));
  const agentPactAddress = requireEnv('AGENTPACT_ADDRESS');
  const usdcAddress = process.env.USDC_ADDRESS || process.env.SEPOLIA_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  const agentAWallet = new ethers.Wallet(process.env.AGENT_A_PRIVATE_KEY || requireEnv('PRIVATE_KEY'), provider);
  const agentBWallet = new ethers.Wallet(requireEnv('AGENT_B_PRIVATE_KEY'), provider);

  const agentPact = new ethers.Contract(agentPactAddress, AGENTPACT_ABI, agentAWallet);
  const agentPactB = agentPact.connect(agentBWallet) as ethers.Contract;
  const usdcA = new ethers.Contract(usdcAddress, ERC20_ABI, agentAWallet);
  const usdcB = usdcA.connect(agentBWallet) as ethers.Contract;

  const taskSpec = `TASK: Write a TypeScript function that sorts numbers ascending.
REQUIREMENTS:
1. Function name must be sortNumbers.
2. Input must be number[].
3. Output must be number[] sorted ascending.
4. Must handle empty arrays.
5. Must not mutate the original array.`;

  console.log('[E2E] Uploading task spec...');
  const taskSpecURI = await uploadContent(taskSpec, 'e2e-task-spec');
  const taskSpecHash = hashContent(taskSpec);

  const paymentAmount = ethers.parseUnits('10', 6);
  console.log('[E2E] Approving Agent A payment...');
  await approveIfFunded(usdcA, agentAWallet.address, agentPactAddress, paymentAmount, 'Agent A');

  console.log('[E2E] Creating pact...');
  const createTx = await agentPact.createPact(
    taskSpecHash,
    paymentAmount,
    agentBWallet.address,
    taskSpecURI,
  );
  const createReceipt = await createTx.wait();
  if (!createReceipt) {
    throw new Error(`createPact was not mined: ${createTx.hash}`);
  }

  const createdEvent = createReceipt.logs
    .map((log: ethers.Log) => {
      try {
        return agentPact.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((event: ethers.LogDescription | null) => event?.name === 'PactCreated');

  const pactId = Number(createdEvent?.args?.pactId);
  if (!Number.isInteger(pactId)) {
    throw new Error('Could not parse PactCreated.pactId');
  }
  console.log(`[E2E] Pact created: ${pactId}`);

  const bondRequired = await agentPact.getBondRequired(agentBWallet.address);
  console.log('[E2E] Approving Agent B bond...');
  await approveIfFunded(usdcB, agentBWallet.address, agentPactAddress, bondRequired, 'Agent B');

  console.log('[E2E] Agent B accepting pact...');
  await (await agentPactB.acceptPact(pactId)).wait();

  const submission = `function sortNumbers(arr: number[]): number[] {
  return arr;
}`;

  console.log('[E2E] Uploading intentionally bad submission...');
  const submissionURI = await uploadContent(submission, 'e2e-submission');
  const submissionHash = hashContent(submission);

  const relevance = await checkRelevance(taskSpec, submission);
  if (!relevance.passed) {
    throw new Error(`[E2E] Gensyn Relevance gate FAILED: ${relevance.warning}. Submission blocked!`);
  }

  console.log('[E2E] Submitting work...');
  await (await agentPactB.submitWork(pactId, submissionHash, submissionURI)).wait();

  console.log('[E2E] Raising dispute...');
  const disputeTx = await agentPact.raiseDispute(pactId);
  await disputeTx.wait();

  console.log(`[E2E] Dispute raised for pact ${pactId}. The arbitrator listener should pick it up and return Fail.`);
}

runE2ETest().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
