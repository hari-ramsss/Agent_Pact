# AgentPact — Day 4 Storage Wiring Manual
Everything you need to wire 0G Storage and 0G KV into the contracts you already deployed.

## What you're doing today and why
Your contracts already accept URIs and hashes as parameters — you built that on Days 1–3. Today you're making those URIs and hashes real. Right now when you call createPact(), you pass placeholder strings. After today, the task spec will actually live on 0G Storage, the hash stored on-chain will be the real cryptographic hash of that content, and createPact() will read Agent B's credit score from 0G KV before computing their bond.
The Solidity contracts do not change today. Everything you write today is TypeScript — off-chain scripts that call the contracts you already deployed. This is an important mindset: Foundry owns contracts, TypeScript owns everything else. They meet at the ABI.

## Step 1 — Set up the TypeScript environment
Inside your project root (in WSL2):
```bash
# If you don't have a package.json yet at root level
npm init -y

# Install everything you need for Day 4
npm install @0gfoundation/0g-ts-sdk ethers dotenv tsx typescript

# Install types
npm install --save-dev @types/node

# Create tsconfig
npx tsc --init


```
Open tsconfig.json and make sure these are set:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./scripts"
  }
}



```
Create your scripts directory:
```bash
mkdir -p scripts
touch scripts/og-storage.ts
touch scripts/og-kv.ts
touch scripts/create-pact.ts
touch scripts/verify-chain.ts



```
## Step 2 — Update your .env file
Add these 0G-specific variables to your existing .env:
```env
# ── 0G Network (Galileo Testnet) ──────────────────────────────
# EVM RPC for signing transactions
OG_RPC_URL=https://evmrpc-testnet.0g.ai

# Turbo indexer — recommended, faster
OG_INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai

# KV node endpoint
OG_KV_RPC=http://3.101.147.150:6789

# Flow contract on Galileo testnet — do not change this
OG_FLOW_CONTRACT=0x22E03a6A89B950F1c82ec5e74F8eCa321a105296

# Your deployer private key (same one used in Foundry — no 0x prefix)
# This wallet pays gas for 0G storage transactions
OG_PRIVATE_KEY=your_private_key_here

# Stream ID for AgentPact KV namespace
# This is a bytes32 hex string that namespaces all your KV keys
# Generate one: just make up a unique hex string for your project
OG_STREAM_ID=0xAgentPactStream000000000000000000000000000000000000000000000001

# ── Your deployed contracts (from Day 3) ──────────────────────
AGENTPACT_ADDRESS=0x...
BADREP_TOKEN_ADDRESS=0x...
GOODREP_TOKEN_ADDRESS=0x...
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_key



```
Important about OG_STREAM_ID: This is like a namespace for all your KV keys. All credit scores and agent histories live under this stream ID. Use any unique bytes32 hex value. The one in the example above is fine for testing.


## Step 3 — Get 0G testnet tokens
You need 0G tokens to pay for storage transactions. Go to faucet.0g.ai and request tokens for your deployer wallet. You get 0.1 0G per day — that's enough for dozens of storage operations during testing.

Check your balance:
```bash
# Should show a non-zero balance after faucet
cast balance YOUR_DEPLOYER_ADDRESS --rpc-url https://evmrpc-testnet.0g.ai



```
## Step 4 — Write the 0G Storage utility
This is the core utility that everything else calls. Write it carefully — every other script imports from here.
```typescript
// scripts/og-storage.ts

import { ZgFile, Indexer, MemData } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

dotenv.config();

// ── Network config ────────────────────────────────────────────
const OG_RPC_URL    = process.env.OG_RPC_URL    || 'https://evmrpc-testnet.0g.ai';
const INDEXER_RPC   = process.env.OG_INDEXER_RPC || 'https://indexer-storage-testnet-turbo.0g.ai';
const PRIVATE_KEY   = process.env.OG_PRIVATE_KEY!;

if (!PRIVATE_KEY) throw new Error('OG_PRIVATE_KEY not set in .env');

// ── Shared instances — initialize once, reuse everywhere ──────
const provider = new ethers.JsonRpcProvider(OG_RPC_URL);
const signer   = new ethers.Wallet(PRIVATE_KEY, provider);
const indexer  = new Indexer(INDEXER_RPC);

// ── Types ─────────────────────────────────────────────────────

export interface UploadResult {
  rootHash: string;       // The content hash — store this on-chain
  uri: string;            // Full 0G URI — pass to contract as og0StorageURI
  txHash: string;         // 0G chain transaction hash
}

// ── Core: upload any string as in-memory data ─────────────────

/**
 * Upload any JSON-serializable object to 0G Storage.
 * Returns the root hash (for on-chain storage) and URI (for contract parameters).
 *
 * This is the function you call before createPact() and submitWork().
 */
export async function uploadToStorage(
  content: object | string,
  label?: string
): Promise<UploadResult> {

  const contentString = typeof content === 'string'
    ? content
    : JSON.stringify(content, null, 2);

  console.log(`[0G Storage] Uploading ${label || 'data'} (${contentString.length} bytes)...`);

  // Encode to bytes and create MemData — no temp file needed
  const bytes   = new TextEncoder().encode(contentString);
  const memData = new MemData(bytes);

  // Must call merkleTree() before upload
  const [tree, treeErr] = await memData.merkleTree();
  if (treeErr !== null) {
    throw new Error(`Merkle tree error: ${treeErr}`);
  }

  const rootHash = tree!.rootHash();
  console.log(`[0G Storage] Root hash: ${rootHash}`);

  // Upload to 0G Storage
  const [tx, uploadErr] = await indexer.upload(memData, OG_RPC_URL, signer);
  if (uploadErr !== null) {
    throw new Error(`Upload error: ${uploadErr}`);
  }

  // Handle response — single upload returns rootHash + txHash
  const txHash = 'txHash' in tx ? tx.txHash : tx.txHashes[0];

  const uri = `0g://${rootHash}`;

  console.log(`[0G Storage] Upload successful!`);
  console.log(`[0G Storage] URI: ${uri}`);
  console.log(`[0G Storage] TX:  ${txHash}`);

  return { rootHash, uri, txHash };
}

// ── Core: download and parse content by root hash ─────────────

/**
 * Download content from 0G Storage by root hash.
 * Writes to a temp file (0G SDK requirement for Node.js downloads),
 * reads it back, deletes it.
 */
export async function downloadFromStorage(rootHash: string): Promise<string> {
  console.log(`[0G Storage] Downloading ${rootHash}...`);

  const tempPath = path.join('/tmp', `og-download-${Date.now()}.json`);

  const err = await indexer.download(rootHash, tempPath, true); // true = verify merkle proof
  if (err !== null) {
    throw new Error(`Download error: ${err}`);
  }

  const content = fs.readFileSync(tempPath, 'utf-8');
  fs.unlinkSync(tempPath); // clean up

  console.log(`[0G Storage] Download successful (${content.length} bytes)`);
  return content;
}

// ── Verify: confirm on-chain hash matches 0G content ──────────

/**
 * The chain of custody verification function.
 * Takes the root hash stored on-chain, fetches the content from 0G,
 * and confirms the hash of the content matches.
 *
 * This is what proves the task spec hasn't been tampered with.
 */
export async function verifyChainOfCustody(
  onChainHash: string,   // the bytes32 stored in pacts[id].taskSpecHash
  og0URI: string         // the 0G URI stored in pacts[id].og0StorageURI
): Promise<{ valid: boolean; content: string }> {

  // Extract root hash from URI
  const rootHash = og0URI.replace('0g://', '');

  // Fetch from 0G
  const content = await downloadFromStorage(rootHash);

  // Hash the fetched content the same way the contract does
  // Contract uses keccak256(abi.encodePacked(taskSpec))
  const contentHash = ethers.keccak256(ethers.toUtf8Bytes(content));

  const valid = contentHash.toLowerCase() === onChainHash.toLowerCase();

  console.log(`[Verify] On-chain hash:  ${onChainHash}`);
  console.log(`[Verify] Content hash:   ${contentHash}`);
  console.log(`[Verify] Match: ${valid ? '✅ VALID' : '❌ MISMATCH'}`);

  return { valid, content };
}

// ── Helper: compute keccak256 hash of content ─────────────────
// Use this to generate the taskSpecHash before calling createPact()

export function hashContent(content: object | string): string {
  const contentString = typeof content === 'string'
    ? content
    : JSON.stringify(content, null, 2);
  return ethers.keccak256(ethers.toUtf8Bytes(contentString));
}



```
## Step 5 — Write the 0G KV utility
The KV store is where credit scores live. The Arbitrator Agent will read and write here on Days 7–8. Today you wire the read side into createPact().
```typescript
// scripts/og-kv.ts

import { KvClient, Batcher, Indexer } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

const OG_RPC_URL  = process.env.OG_RPC_URL    || 'https://evmrpc-testnet.0g.ai';
const INDEXER_RPC = process.env.OG_INDEXER_RPC || 'https://indexer-storage-testnet-turbo.0g.ai';
const KV_RPC      = process.env.OG_KV_RPC      || 'http://3.101.147.150:6789';
const STREAM_ID   = process.env.OG_STREAM_ID!;
const FLOW_CONTRACT = process.env.OG_FLOW_CONTRACT!;
const PRIVATE_KEY = process.env.OG_PRIVATE_KEY!;

if (!STREAM_ID)    throw new Error('OG_STREAM_ID not set');
if (!PRIVATE_KEY)  throw new Error('OG_PRIVATE_KEY not set');

const provider = new ethers.JsonRpcProvider(OG_RPC_URL);
const signer   = new ethers.Wallet(PRIVATE_KEY, provider);
const indexer  = new Indexer(INDEXER_RPC);
const kvClient = new KvClient(KV_RPC);

// ── Key naming convention ─────────────────────────────────────
// All keys follow: agentpact:TYPE:ADDRESS
// e.g.  agentpact:score:0x1234...
//       agentpact:history:0x1234...

function scoreKey(agentAddress: string): string {
  return `agentpact:score:${agentAddress.toLowerCase()}`;
}

function historyKey(agentAddress: string): string {
  return `agentpact:history:${agentAddress.toLowerCase()}`;
}

// ── Read credit score ─────────────────────────────────────────

/**
 * Read an agent's credit score from 0G KV.
 * Returns 0 if no score exists (new agent).
 * Called by createPact() before computing bond.
 */
export async function readCreditScore(agentAddress: string): Promise<number> {
  console.log(`[0G KV] Reading credit score for ${agentAddress}...`);

  try {
    const key      = scoreKey(agentAddress);
    const keyBytes = Uint8Array.from(Buffer.from(key, 'utf-8'));

    const value = await kvClient.getValue(
      STREAM_ID,
      ethers.encodeBase64(keyBytes)
    );

    if (value === null || value === undefined) {
      console.log(`[0G KV] No score found — new agent, returning 0`);
      return 0;
    }

    const score = parseInt(Buffer.from(value, 'base64').toString('utf-8'), 10);
    console.log(`[0G KV] Score: ${score}`);
    return isNaN(score) ? 0 : score;

  } catch (err) {
    // Key doesn't exist yet — new agent
    console.log(`[0G KV] No score key found — new agent, returning 0`);
    return 0;
  }
}

// ── Write credit score ────────────────────────────────────────

/**
 * Write an agent's credit score to 0G KV.
 * Called by the Arbitrator Agent after each verdict (Days 7-8).
 * Also available here for seeding test scores.
 */
export async function writeCreditScore(
  agentAddress: string,
  score: number
): Promise<void> {
  console.log(`[0G KV] Writing credit score ${score} for ${agentAddress}...`);

  const [nodes, err] = await indexer.selectNodes(1);
  if (err !== null) throw new Error(`Node selection error: ${err}`);

  const batcher = new Batcher(1, nodes, FLOW_CONTRACT, OG_RPC_URL);

  const key      = scoreKey(agentAddress);
  const keyBytes   = Uint8Array.from(Buffer.from(key, 'utf-8'));
  const valueBytes = Uint8Array.from(Buffer.from(score.toString(), 'utf-8'));

  batcher.streamDataBuilder.set(STREAM_ID, keyBytes, valueBytes);

  const [tx, batchErr] = await batcher.exec();
  if (batchErr !== null) throw new Error(`KV write error: ${batchErr}`);

  console.log(`[0G KV] Score written. TX: ${tx}`);
}

// ── Read full agent history ───────────────────────────────────

/**
 * Read an agent's full case history from 0G KV.
 * Returns an empty array for new agents.
 * The Arbitrator reads this on Days 7-8 to calibrate its verdict.
 */
export async function readAgentHistory(agentAddress: string): Promise<object[]> {
  console.log(`[0G KV] Reading history for ${agentAddress}...`);

  try {
    const key      = historyKey(agentAddress);
    const keyBytes = Uint8Array.from(Buffer.from(key, 'utf-8'));

    const value = await kvClient.getValue(
      STREAM_ID,
      ethers.encodeBase64(keyBytes)
    );

    if (value === null || value === undefined) return [];

    const historyString = Buffer.from(value, 'base64').toString('utf-8');
    return JSON.parse(historyString);

  } catch {
    return [];
  }
}

// ── Append to agent history ───────────────────────────────────

/**
 * Append a verdict to an agent's history in 0G KV.
 * Called by Arbitrator Agent on Days 7-8.
 * Writing it here so the structure is established.
 */
export async function appendAgentHistory(
  agentAddress: string,
  verdict: {
    pactId: number;
    outcome: 'pass' | 'fail' | 'partial';
    confidence: number;
    timestamp: number;
  }
): Promise<void> {
  const existing = await readAgentHistory(agentAddress);
  existing.push(verdict);

  const [nodes, err] = await indexer.selectNodes(1);
  if (err !== null) throw new Error(`Node selection: ${err}`);

  const batcher = new Batcher(1, nodes, FLOW_CONTRACT, OG_RPC_URL);

  const key        = historyKey(agentAddress);
  const keyBytes   = Uint8Array.from(Buffer.from(key, 'utf-8'));
  const valueBytes = Uint8Array.from(
    Buffer.from(JSON.stringify(existing), 'utf-8')
  );

  batcher.streamDataBuilder.set(STREAM_ID, keyBytes, valueBytes);

  const [tx, batchErr] = await batcher.exec();
  if (batchErr !== null) throw new Error(`History append error: ${batchErr}`);

  console.log(`[0G KV] History updated. TX: ${tx}`);
}



```
## Step 6 — Write the full createPact script
This replaces your manual cast send calls. This is the script that does the complete flow: upload task spec to 0G → read credit score from 0G KV → call createPact() on-chain with real hashes.
```typescript
// scripts/create-pact.ts

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { uploadToStorage, hashContent } from './og-storage';
import { readCreditScore } from './og-kv';

dotenv.config();

// ── ABI — only the functions we need ─────────────────────────
const AGENTPACT_ABI = [
  'function createPact(bytes32 taskSpecHash, uint256 paymentAmount, address workerAgent, string calldata og0StorageURI) external returns (uint256)',
  'function acceptPact(uint256 pactId) external',
  'function submitWork(uint256 pactId, bytes32 submissionHash, string calldata og0SubmissionURI) external',
  'function raiseDispute(uint256 pactId) external',
  'function getPact(uint256 pactId) external view returns (tuple(uint256 id, address agentA, address agentB, uint256 paymentAmount, uint256 bondAmount, uint8 status, bytes32 taskSpecHash, string og0StorageURI, bytes32 submissionHash, string og0SubmissionURI, string og0VerdictURI, uint256 createdAt, uint256 disputeOpenedAt, uint256 timeoutBlocks))',
  'function getBondRequired(address agent) external view returns (uint256)',
  'function checkRep(address agent) external view returns (int256, uint256, uint256, uint256)',
  'event PactCreated(uint256 indexed pactId, address indexed agentA, uint256 paymentAmount, uint256 bondRequired, bytes32 taskSpecHash, string og0StorageURI)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
];

// ── Config ────────────────────────────────────────────────────
const SEPOLIA_RPC        = process.env.SEPOLIA_RPC_URL!;
const AGENTPACT_ADDRESS  = process.env.AGENTPACT_ADDRESS!;
const AGENT_A_PRIVATE_KEY = process.env.PRIVATE_KEY!;  // employer
const AGENT_B_ADDRESS    = process.env.AGENT_B_ADDRESS!;

// Sepolia USDC
const SEPOLIA_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
const agentASigner = new ethers.Wallet(AGENT_A_PRIVATE_KEY, provider);

const agentPact = new ethers.Contract(AGENTPACT_ADDRESS, AGENTPACT_ABI, agentASigner);
const usdc      = new ethers.Contract(SEPOLIA_USDC, ERC20_ABI, agentASigner);

// ── Task spec definition ──────────────────────────────────────
// This is what gets uploaded to 0G Storage and hashed on-chain

const TASK_SPEC = {
  title: "Write a Solidity escrow contract",
  description: "Write a Solidity smart contract that implements a basic escrow. The employer deposits funds, the worker completes the task, a trusted third party releases the funds.",
  requirements: [
    "Must use Solidity ^0.8.20",
    "Must emit Deposited, Released, and Refunded events",
    "Must have a deposit() function payable",
    "Must have a release() function callable only by arbiter",
    "Must have a refund() function callable only by arbiter",
  ],
  testSuite: {
    tests: [
      "test_deposit_locks_funds",
      "test_release_sends_to_worker",
      "test_refund_returns_to_employer",
      "test_only_arbiter_can_release",
      "test_only_arbiter_can_refund",
    ],
    passingThreshold: 5,
  },
  paymentUsdc: 100,
  deadline: "72 hours from acceptance",
};

// ── Main function ─────────────────────────────────────────────

async function createPactWithRealStorage() {
  console.log('\n========== AgentPact: createPact with 0G Storage ==========\n');

  // ── Step 1: Upload task spec to 0G Storage ────────────────
  console.log('Step 1: Uploading task spec to 0G Storage...');
  const uploadResult = await uploadToStorage(TASK_SPEC, 'task-spec');
  console.log(`✅ Task spec uploaded`);
  console.log(`   URI:      ${uploadResult.uri}`);
  console.log(`   RootHash: ${uploadResult.rootHash}`);

  // ── Step 2: Compute the hash to store on-chain ────────────
  // This is what goes into createPact() as taskSpecHash
  // It's keccak256 of the JSON content — same computation the Arbitrator uses
  const taskSpecHash = hashContent(TASK_SPEC);
  console.log(`\nStep 2: Task spec hash (on-chain): ${taskSpecHash}`);

  // ── Step 3: Read Agent B's credit score from 0G KV ───────
  console.log(`\nStep 3: Reading credit score for Agent B (${AGENT_B_ADDRESS})...`);
  const creditScore = await readCreditScore(AGENT_B_ADDRESS);
  console.log(`   Credit score: ${creditScore}`);

  // ── Step 4: Check what bond will be required ──────────────
  const bondRequired = await agentPact.getBondRequired(AGENT_B_ADDRESS);
  console.log(`\nStep 4: Bond required for Agent B: ${ethers.formatUnits(bondRequired, 6)} USDC`);
  console.log(`   (Based on ${creditScore >= 150 ? '0.5x — trusted agent' : creditScore >= 50 ? '1x — standard' : '1.5x — new/low-score agent'} multiplier)`);

  // ── Step 5: Approve USDC spend ────────────────────────────
  const paymentAmount = ethers.parseUnits('100', 6); // 100 USDC
  console.log(`\nStep 5: Approving ${ethers.formatUnits(paymentAmount, 6)} USDC for AgentPact...`);

  const approveTx = await usdc.approve(AGENTPACT_ADDRESS, paymentAmount);
  await approveTx.wait();
  console.log(`✅ USDC approved. TX: ${approveTx.hash}`);

  // ── Step 6: Call createPact() on-chain ────────────────────
  console.log(`\nStep 6: Calling createPact() on Sepolia...`);
  console.log(`   taskSpecHash:  ${taskSpecHash}`);
  console.log(`   paymentAmount: ${ethers.formatUnits(paymentAmount, 6)} USDC`);
  console.log(`   workerAgent:   ${AGENT_B_ADDRESS}`);
  console.log(`   og0StorageURI: ${uploadResult.uri}`);

  const createTx = await agentPact.createPact(
    taskSpecHash,
    paymentAmount,
    AGENT_B_ADDRESS,
    uploadResult.uri
  );

  const receipt = await createTx.wait();
  console.log(`✅ createPact() executed. TX: ${createTx.hash}`);

  // Parse pact ID from event
  const event = receipt.logs
    .map((log: any) => {
      try { return agentPact.interface.parseLog(log); } catch { return null; }
    })
    .find((e: any) => e?.name === 'PactCreated');

  const pactId = event?.args?.pactId?.toString() ?? 'unknown';
  console.log(`\n✅ Pact created! Pact ID: ${pactId}`);

  // ── Step 7: Verify chain of custody ──────────────────────
  console.log(`\nStep 7: Verifying chain of custody...`);
  console.log(`   Reading pact from contract...`);

  const pact = await agentPact.getPact(pactId);
  console.log(`   On-chain taskSpecHash: ${pact.taskSpecHash}`);
  console.log(`   On-chain og0StorageURI: ${pact.og0StorageURI}`);

  // Confirm the URI stored on-chain matches what we uploaded
  const uriMatch = pact.og0StorageURI === uploadResult.uri;
  console.log(`   URI match: ${uriMatch ? '✅' : '❌'}`);

  // Confirm the hash stored on-chain matches the hash we computed
  const hashMatch = pact.taskSpecHash.toLowerCase() === taskSpecHash.toLowerCase();
  console.log(`   Hash match: ${hashMatch ? '✅' : '❌'}`);

  console.log('\n========== Summary ==========');
  console.log(`Pact ID:           ${pactId}`);
  console.log(`Task spec on 0G:   ${uploadResult.uri}`);
  console.log(`Hash on Sepolia:   ${taskSpecHash}`);
  console.log(`Bond required:     ${ethers.formatUnits(bondRequired, 6)} USDC`);
  console.log(`Agent B score:     ${creditScore}`);
  console.log(`Chain of custody:  ${uriMatch && hashMatch ? '✅ VERIFIED' : '❌ BROKEN'}`);

  return { pactId, uploadResult, taskSpecHash };
}

createPactWithRealStorage().catch(console.error);


```
Add your Agent B address to .env:
```env
AGENT_B_ADDRESS=0xYourAgentBWalletAddress




```
## Step 7 — Write the chain of custody verification script
This is a standalone script you run to prove the chain of custody to yourself — and later to judges.
```typescript
// scripts/verify-chain.ts

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { downloadFromStorage, verifyChainOfCustody } from './og-storage';

dotenv.config();

const SEPOLIA_RPC       = process.env.SEPOLIA_RPC_URL!;
const AGENTPACT_ADDRESS = process.env.AGENTPACT_ADDRESS!;

const AGENTPACT_ABI = [
  'function getPact(uint256 pactId) external view returns (tuple(uint256 id, address agentA, address agentB, uint256 paymentAmount, uint256 bondAmount, uint8 status, bytes32 taskSpecHash, string og0StorageURI, bytes32 submissionHash, string og0SubmissionURI, string og0VerdictURI, uint256 createdAt, uint256 disputeOpenedAt, uint256 timeoutBlocks))',
];

async function verifyCustody(pactId: number) {
  console.log(`\n== Verifying chain of custody for Pact ${pactId} ==\n`);

  const provider  = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const agentPact = new ethers.Contract(AGENTPACT_ADDRESS, AGENTPACT_ABI, provider);

  // Read from contract
  const pact = await agentPact.getPact(pactId);

  console.log('On-chain data:');
  console.log(`  taskSpecHash:  ${pact.taskSpecHash}`);
  console.log(`  og0StorageURI: ${pact.og0StorageURI}`);

  // Fetch from 0G and verify
  const result = await verifyChainOfCustody(pact.taskSpecHash, pact.og0StorageURI);

  if (result.valid) {
    console.log('\n✅ CHAIN OF CUSTODY VERIFIED');
    console.log('The task spec on 0G Storage matches the hash on Sepolia.');
    console.log('Neither party can alter this spec retroactively.');
  } else {
    console.log('\n❌ CHAIN OF CUSTODY BROKEN');
    console.log('Hash mismatch — content may have been tampered with.');
  }

  console.log('\nTask spec content:');
  console.log(result.content.slice(0, 200) + '...');
}

// Run: npx tsx scripts/verify-chain.ts 0
const pactId = parseInt(process.argv[2] ?? '0', 10);
verifyCustody(pactId).catch(console.error);



```
## Step 8 — Add scripts to package.json
```json
{
  "scripts": {
    "create-pact":    "npx tsx scripts/create-pact.ts",
    "verify-chain":   "npx tsx scripts/verify-chain.ts",
    "test-storage":   "npx tsx scripts/test-storage.ts",
    "seed-score":     "npx tsx scripts/seed-score.ts"
  }
}




```
## Step 9 — Write a quick test script first
Before running the full createPact flow, test 0G Storage in isolation. This saves you debugging time if there's a network or credential issue.
```typescript
// scripts/test-storage.ts

import { uploadToStorage, downloadFromStorage, hashContent } from './og-storage';
import { readCreditScore, writeCreditScore } from './og-kv';

async function runTests() {
  console.log('\n===== 0G Storage isolation test =====\n');

  // Test 1: Upload and download round-trip
  console.log('Test 1: Upload/download round-trip...');
  const testContent = { test: true, message: 'AgentPact storage test', timestamp: Date.now() };
  const uploadResult = await uploadToStorage(testContent, 'test');

  const downloaded = await downloadFromStorage(uploadResult.rootHash);
  const parsed = JSON.parse(downloaded);

  const roundTripOk = parsed.message === testContent.message;
  console.log(`Round-trip: ${roundTripOk ? '✅ PASS' : '❌ FAIL'}`);

  // Test 2: Hash consistency
  console.log('\nTest 2: Hash consistency...');
  const hash1 = hashContent(testContent);
  const hash2 = hashContent(testContent);
  console.log(`Hash stable: ${hash1 === hash2 ? '✅ PASS' : '❌ FAIL'}`);

  // Test 3: KV write and read
  console.log('\nTest 3: KV write and read...');
  const testAddress = '0x1234567890123456789012345678901234567890';
  await writeCreditScore(testAddress, 42);
  const readScore = await readCreditScore(testAddress);
  console.log(`KV round-trip: ${readScore === 42 ? '✅ PASS' : '❌ FAIL'} (wrote 42, read ${readScore})`);

  // Test 4: Missing key returns 0
  console.log('\nTest 4: Missing key returns 0...');
  const newAgent = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  const score = await readCreditScore(newAgent);
  console.log(`New agent score = 0: ${score === 0 ? '✅ PASS' : '❌ FAIL'} (got ${score})`);

  console.log('\n===== All tests complete =====');
}

runTests().catch(console.error);


```
Run it:
```bash
npm run test-storage


```
All four tests must pass before you run create-pact. If Test 3 (KV write/read) fails, the KV endpoint might be down — check http://3.101.147.150:6789 is reachable, or check the 0G Discord for updated KV node addresses.


## Step 10 — Write the seed-score utility
You need this to test the bond multiplier logic with different credit scores without running a full dispute flow.
```typescript
// scripts/seed-score.ts
// Usage: npx tsx scripts/seed-score.ts <address> <score>
// Example: npx tsx scripts/seed-score.ts 0xAgentB... 200

import { writeCreditScore, readCreditScore } from './og-kv';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

const SEPOLIA_RPC       = process.env.SEPOLIA_RPC_URL!;
const AGENTPACT_ADDRESS = process.env.AGENTPACT_ADDRESS!;

const AGENTPACT_ABI = [
  'function seedCreditScore(address agent, int256 score) external',
  'function getBondRequired(address agent) external view returns (uint256)',
];

async function seedScore(agentAddress: string, score: number) {
  console.log(`Seeding score ${score} for ${agentAddress}...`);

  // Write to 0G KV (authoritative)
  await writeCreditScore(agentAddress, score);

  // Also seed in the contract's local cache (for bond calculation)
  const provider  = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const signer    = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const agentPact = new ethers.Contract(AGENTPACT_ADDRESS, AGENTPACT_ABI, signer);

  const seedTx = await agentPact.seedCreditScore(agentAddress, score);
  await seedTx.wait();

  // Verify
  const bondRequired = await agentPact.getBondRequired(agentAddress);
  const kvScore      = await readCreditScore(agentAddress);

  console.log(`✅ Score seeded`);
  console.log(`   Contract bond required: ${ethers.formatUnits(bondRequired, 6)} USDC`);
  console.log(`   0G KV score: ${kvScore}`);
}

const address = process.argv[2];
const score   = parseInt(process.argv[3] ?? '0', 10);
if (!address) { console.error('Usage: seed-score.ts <address> <score>'); process.exit(1); }

seedScore(address, score).catch(console.error);



```
## Step 11 — Run the full flow
With tests passing, run the complete Day 4 flow:
```bash
# 1. Test 0G connections in isolation first
npm run test-storage

# 2. Seed a test score so you can see bond multiplier in action
npx tsx scripts/seed-score.ts 0xYourAgentBAddress 200
# Then run again with a low score
npx tsx scripts/seed-score.ts 0xYourAgentBAddress 0

# 3. Run the full createPact with real 0G storage
npm run create-pact

# 4. Verify the chain of custody using the pact ID from step 3
npm run verify-chain 0

```
## End of Day 4 checklist
Every one of these must be true before you start Day 5:
Task spec content actually lives on 0G Storage — you have a 0g:// URI with a real root hash. The hash stored on Sepolia is the real keccak256 of the task spec content. The verify-chain script prints ✅ CHAIN OF CUSTODY VERIFIED. Reading a new agent's score from 0G KV returns 0. Writing and reading a score round-trips correctly. createPact() on Sepolia uses the real 0G URI and hash — not a placeholder. Bond multiplier changes when you seed different scores. The full create-pact script runs end to end without errors.


