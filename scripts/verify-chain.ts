import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { verifyChainOfCustody } from './og-storage';

dotenv.config();

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL;
const AGENTPACT_ADDRESS = process.env.AGENTPACT_ADDRESS;

if (!SEPOLIA_RPC || !AGENTPACT_ADDRESS) {
  throw new Error('Set SEPOLIA_RPC_URL and AGENTPACT_ADDRESS in .env');
}

const sepoliaRpc = SEPOLIA_RPC;
const agentPactAddress = AGENTPACT_ADDRESS;

const AGENTPACT_ABI = [
  'function getPact(uint256 pactId) external view returns (tuple(uint256 id, address agentA, address agentB, uint256 paymentAmount, uint256 bondAmount, uint8 status, bytes32 taskSpecHash, string og0StorageURI, bytes32 submissionHash, string og0SubmissionURI, string og0VerdictURI, uint256 createdAt, uint256 disputeOpenedAt, uint256 timeoutBlocks))'
];

async function verifyCustody(pactId: number) {
  console.log(`\n== Verifying chain of custody for Pact ${pactId} ==\n`);

  const provider = new ethers.JsonRpcProvider(sepoliaRpc);
  const agentPact = new ethers.Contract(agentPactAddress, AGENTPACT_ABI, provider);
  const pact = await agentPact.getPact(pactId);

  console.log('On-chain data:');
  console.log(`  taskSpecHash:  ${pact.taskSpecHash}`);
  console.log(`  og0StorageURI: ${pact.og0StorageURI}`);

  const result = await verifyChainOfCustody(pact.taskSpecHash, pact.og0StorageURI);

  if (result.valid) {
    console.log('\nCHAIN OF CUSTODY VERIFIED');
    console.log('The task spec on 0G Storage matches the hash on Sepolia.');
  } else {
    console.log('\nCHAIN OF CUSTODY BROKEN');
    console.log('The 0G content hash does not match the on-chain hash.');
  }

  console.log('\nTask spec preview:');
  console.log(`${result.content.slice(0, 200)}...`);
}

const pactId = parseInt(process.argv[2] ?? '0', 10);
verifyCustody(pactId).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
