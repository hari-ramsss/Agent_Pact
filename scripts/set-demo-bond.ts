import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

const AGENTPACT_ABI = [
  'function setBaseBond(uint256 _baseBond) external',
  'function baseBond() external view returns (uint256)',
  'function getBondRequired(address agent) external view returns (uint256)',
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} in .env`);
  }
  return value;
}

async function main(): Promise<void> {
  const baseBondUsdc = process.argv[2] || '2';
  const agentAddress = process.argv[3] || process.env.AGENT_B_ADDRESS;

  const provider = new ethers.JsonRpcProvider(requireEnv('SEPOLIA_RPC_URL'));
  const ownerWallet = new ethers.Wallet(process.env.AGENT_A_PRIVATE_KEY || requireEnv('PRIVATE_KEY'), provider);
  const agentPact = new ethers.Contract(requireEnv('AGENTPACT_ADDRESS'), AGENTPACT_ABI, ownerWallet);
  const baseBond = ethers.parseUnits(baseBondUsdc, 6);

  console.log(`[Demo Bond] Setting baseBond to ${baseBondUsdc} USDC...`);
  const tx = await agentPact.setBaseBond(baseBond);
  const receipt = await tx.wait();
  console.log(`[Demo Bond] setBaseBond confirmed: ${receipt?.hash || tx.hash}`);

  const currentBaseBond = await agentPact.baseBond();
  console.log(`[Demo Bond] Current baseBond: ${ethers.formatUnits(currentBaseBond, 6)} USDC`);

  if (agentAddress) {
    const required = await agentPact.getBondRequired(agentAddress);
    console.log(`[Demo Bond] Bond required for ${agentAddress}: ${ethers.formatUnits(required, 6)} USDC`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
