import { ethers } from 'ethers';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const AGENTPACT_ABI = [
  'event DisputeResolved(uint256 indexed pactId, uint8 verdict, uint256 confidence, string og0VerdictURI)',
  'event PactCreated(uint256 indexed pactId, address indexed agentA, uint256 paymentAmount, uint256 bondRequired, bytes32 taskSpecHash, string og0StorageURI)',
  'event ArbitrationRequested(uint256 indexed pactId, string taskSpecURI, string submissionURI, address agentB)',
  'function getPact(uint256 pactId) external view returns (tuple(uint256,address,address,uint256,uint256,uint8,bytes32,string,bytes32,string,string,uint256,uint256,uint256))',
];

const REGISTRY_ABI = [
  'function recordPact(uint256 pactId, address agentA, address agentB) external',
];

export interface OpenClawJob {
  jobId: string;
  contractAddress: string;
  eventSignature: string;
  webhookURL: string;
  filter?: Record<string, unknown>;
  description: string;
}

export interface KeeperHubTask {
  taskId: string;
  pactId: number;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  triggeredAt: number;
  txHash?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} in .env`);
  }
  return value;
}

function normalizePrivateKey(value: string): string {
  return value.startsWith('0x') ? value : `0x${value}`;
}

export class AgentPactKeeperConnector {
  private provider: ethers.JsonRpcProvider;
  private agentPact: ethers.Contract;
  private registry?: ethers.Contract;
  private activeTasks: Map<string, KeeperHubTask> = new Map();
  private syncedPacts: Set<number> = new Set();

  constructor() {
    this.provider = new ethers.JsonRpcProvider(requireEnv('SEPOLIA_RPC_URL'));
    this.agentPact = new ethers.Contract(
      requireEnv('AGENTPACT_ADDRESS'),
      AGENTPACT_ABI,
      this.provider,
    );

    const registryAddress = process.env.REGISTRY_ADDRESS;
    const ownerKey = process.env.PRIVATE_KEY || process.env.AGENT_A_PRIVATE_KEY;
    if (registryAddress && ownerKey && ethers.isAddress(registryAddress)) {
      const ownerWallet = new ethers.Wallet(normalizePrivateKey(ownerKey), this.provider);
      this.registry = new ethers.Contract(registryAddress, REGISTRY_ABI, ownerWallet);
    } else if (registryAddress && !ethers.isAddress(registryAddress)) {
      console.warn('[OPENCLAW] REGISTRY_ADDRESS is not a valid address; registry sync disabled');
    }
  }

  async registerJobs(): Promise<OpenClawJob[]> {
    const contractAddress = requireEnv('AGENTPACT_ADDRESS');
    const jobs: OpenClawJob[] = [
      {
        jobId: 'agentpact-arbitration-requested',
        contractAddress,
        eventSignature: 'ArbitrationRequested(uint256,string,string,address)',
        webhookURL: process.env.KEEPERHUB_WEBHOOK_URL || '',
        description: 'Trigger Arbitrator Agent when a dispute is raised',
      },
      {
        jobId: 'agentpact-dispute-resolved',
        contractAddress,
        eventSignature: 'DisputeResolved(uint256,uint8,uint256,string)',
        webhookURL: process.env.KEEPERHUB_WEBHOOK_URL || '',
        description: 'Post-resolution hook: update registry, notify agents',
      },
      {
        jobId: 'agentpact-pact-created',
        contractAddress,
        eventSignature: 'PactCreated(uint256,address,uint256,uint256,bytes32,string)',
        webhookURL: process.env.KEEPERHUB_WEBHOOK_URL || '',
        description: 'Index new pacts into AgentPactRegistry',
      },
    ];

    console.log('[OPENCLAW] Registering OpenClaw jobs with KeeperHub...');
    for (const job of jobs) {
      await this.registerSingleJob(job);
    }
    console.log(`[OPENCLAW] ${jobs.length} OpenClaw jobs registered`);
    return jobs;
  }

  private async registerSingleJob(job: OpenClawJob): Promise<void> {
    const keeperHubAPI = process.env.KEEPERHUB_API_URL;
    if (!keeperHubAPI) {
      console.log('[OPENCLAW] Job spec (register manually):', JSON.stringify(job, null, 2));
      return;
    }

    try {
      await axios.post(`${keeperHubAPI}/jobs`, job, {
        headers: { Authorization: `Bearer ${process.env.KEEPERHUB_API_KEY || ''}` },
      });
      console.log(`[OPENCLAW] Registered: ${job.jobId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[OPENCLAW] Could not register ${job.jobId}: ${message}`);
    }
  }

  async startListening(): Promise<void> {
    console.log('[OPENCLAW] Connector listening...');

    this.agentPact.on(
      'ArbitrationRequested',
      async (pactId, taskSpecURI, submissionURI, agentB) => {
        const task: KeeperHubTask = {
          taskId: `task-pact-${pactId}-${Date.now()}`,
          pactId: Number(pactId),
          status: 'pending',
          triggeredAt: Date.now(),
        };
        this.activeTasks.set(task.taskId, task);
        console.log(`[OPENCLAW] Task created for pact ${pactId}: ${task.taskId}`);

        await this.deliverWebhook('arbitration_requested', {
          pactId: Number(pactId),
          taskSpecURI,
          submissionURI,
          agentB,
          taskId: task.taskId,
        });
      },
    );

    this.agentPact.on(
      'DisputeResolved',
      async (pactId, verdict, confidence, og0VerdictURI, event) => {
        console.log(`[OPENCLAW] DisputeResolved for pact ${pactId}: ${verdict === 0n ? 'Pass' : 'Fail'}`);
        await this.updateRegistry(Number(pactId));

        await this.deliverWebhook('dispute_resolved', {
          pactId: Number(pactId),
          verdict: verdict === 0n ? 'Pass' : 'Fail',
          confidence: Number(confidence),
          verdictURI: og0VerdictURI,
          txHash: event.log.transactionHash,
        });
      },
    );

    this.agentPact.on(
      'PactCreated',
      async (pactId, agentA, paymentAmount, bondRequired, taskSpecHash, og0StorageURI) => {
        console.log(`[OPENCLAW] New pact created: #${pactId} by ${agentA}`);
        await this.deliverWebhook('pact_created', {
          pactId: Number(pactId),
          agentA,
          paymentAmount: paymentAmount.toString(),
          bondRequired: bondRequired.toString(),
          taskSpecHash,
          og0StorageURI,
        });
      },
    );
  }

  private async deliverWebhook(event: string, data: unknown): Promise<void> {
    const webhookURL = process.env.KEEPERHUB_WEBHOOK_URL;
    if (!webhookURL) {
      console.log(`[OPENCLAW] Webhook payload (${event}):`, JSON.stringify(data, null, 2));
      return;
    }

    try {
      await axios.post(webhookURL, { event, data, timestamp: Date.now() });
      console.log(`[OPENCLAW] Webhook delivered: ${event}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[OPENCLAW] Webhook failed for ${event}: ${message}`);
    }
  }

  private async updateRegistry(pactId: number): Promise<void> {
    try {
      if (this.syncedPacts.has(pactId)) {
        return;
      }

      const pact = await this.agentPact.getPact(pactId);
      const agentA = pact[1] as string;
      const agentB = pact[2] as string;
      if (agentB === ethers.ZeroAddress) {
        console.warn(`[OPENCLAW] Registry sync skipped for pact ${pactId}: worker not assigned`);
        return;
      }

      if (!this.registry) {
        console.log(`[OPENCLAW] Registry not configured, would sync pact ${pactId}: ${agentA}, ${agentB}`);
        return;
      }

      const tx = await this.registry.recordPact(pactId, agentA, agentB);
      await tx.wait();
      this.syncedPacts.add(pactId);
      console.log(`[OPENCLAW] Registry sync complete for pact ${pactId} (tx: ${tx.hash})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[OPENCLAW] Registry sync failed: ${message}`);
    }
  }

  getActiveTasks(): KeeperHubTask[] {
    return Array.from(this.activeTasks.values());
  }

  getTaskStatus(taskId: string): KeeperHubTask | undefined {
    return this.activeTasks.get(taskId);
  }
}

async function main(): Promise<void> {
  console.log('AgentPact OpenClaw KeeperHub Connector');
  const connector = new AgentPactKeeperConnector();
  await connector.registerJobs();
  await connector.startListening();

  process.on('SIGINT', () => {
    console.log('\n[OPENCLAW] Shutting down...');
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

export default AgentPactKeeperConnector;
