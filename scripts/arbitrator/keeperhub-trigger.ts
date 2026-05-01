import { ethers } from 'ethers';
import { Verdict, VerdictEnum } from './types';

const AGENTPACT_ABI = [
  'function resolveDispute(uint256 pactId, uint8 verdict, uint256 confidence, string calldata og0VerdictURI) external',
];

export async function triggerKeeperHub(verdict: Verdict): Promise<string> {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.KEEPER_PRIVATE_KEY;
  const agentPactAddress = process.env.AGENTPACT_ADDRESS;

  if (!rpcUrl || !privateKey || !agentPactAddress) {
    throw new Error('Set SEPOLIA_RPC_URL, KEEPER_PRIVATE_KEY, and AGENTPACT_ADDRESS in .env');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const agentPact = new ethers.Contract(agentPactAddress, AGENTPACT_ABI, wallet);
  const verdictEnum = verdict.decision === 'Pass' ? VerdictEnum.Pass : VerdictEnum.Fail;

  console.log(`[KeeperHub] Submitting verdict for pact ${verdict.pactId}: ${verdict.decision}`);
  const tx = await agentPact.resolveDispute(
    verdict.pactId,
    verdictEnum,
    verdict.confidence,
    verdict.verdictURI,
  );

  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error(`resolveDispute transaction was not mined: ${tx.hash}`);
  }

  console.log(`[KeeperHub] resolveDispute confirmed: ${receipt.hash}`);
  return receipt.hash;
}
