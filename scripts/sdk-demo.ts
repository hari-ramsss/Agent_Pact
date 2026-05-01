import { AgentPactClient } from '../packages/agentpact-sdk/src';
import * as dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} in .env`);
  }
  return value;
}

async function main(): Promise<void> {
  const client = new AgentPactClient({
    rpcUrl: requireEnv('SEPOLIA_RPC_URL'),
    contractAddress: requireEnv('AGENTPACT_ADDRESS'),
    privateKey: process.env.AGENT_A_PRIVATE_KEY || requireEnv('PRIVATE_KEY'),
    usdcAddress: process.env.USDC_ADDRESS || process.env.SEPOLIA_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  });

  console.log('AgentPact SDK Demo');
  console.log(`   Wallet: ${client.address}`);

  const rep = await client.checkRep(client.address);
  console.log('   Reputation:', rep);

  const agentB = process.env.AGENT_B_ADDRESS;
  if (agentB) {
    const bond = await client.getBondRequired(agentB);
    console.log(`   Bond required for agentB: ${bond.toString()} USDC base units`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
