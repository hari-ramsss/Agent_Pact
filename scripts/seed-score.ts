import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { readCreditScore, writeCreditScore } from './og-kv';

dotenv.config();

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL;
const AGENTPACT_ADDRESS = process.env.AGENTPACT_ADDRESS;
const PRIVATE_KEY = process.env.AGENT_A_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!SEPOLIA_RPC || !AGENTPACT_ADDRESS || !PRIVATE_KEY) {
  throw new Error('Set SEPOLIA_RPC_URL, AGENTPACT_ADDRESS, and AGENT_A_PRIVATE_KEY or PRIVATE_KEY in .env');
}

const sepoliaRpc = SEPOLIA_RPC;
const agentPactAddress = AGENTPACT_ADDRESS;
const privateKey = PRIVATE_KEY;

const AGENTPACT_ABI = [
  'function seedCreditScore(address agent, int256 score) external',
  'function getBondRequired(address agent) external view returns (uint256)'
];

async function seedScore(agentAddress: string, score: number) {
  console.log(`Seeding score ${score} for ${agentAddress}...`);

  await writeCreditScore(agentAddress, score);

  const provider = new ethers.JsonRpcProvider(sepoliaRpc);
  const signer = new ethers.Wallet(privateKey, provider);
  const agentPact = new ethers.Contract(agentPactAddress, AGENTPACT_ABI, signer);

  const seedTx = await agentPact.seedCreditScore(agentAddress, score);
  await seedTx.wait();

  const bondRequired = await agentPact.getBondRequired(agentAddress);
  const kvScore = await readCreditScore(agentAddress);

  console.log('Score seeded');
  console.log(`Contract bond required: ${ethers.formatUnits(bondRequired, 6)} USDC`);
  console.log(`0G KV score: ${kvScore}`);
}

const address = process.argv[2];
const score = parseInt(process.argv[3] ?? '0', 10);

if (!address) {
  console.error('Usage: npx tsx scripts/seed-score.ts <address> <score>');
  process.exit(1);
}

seedScore(address, score).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
