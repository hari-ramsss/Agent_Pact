import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import http from 'http';
import { ArbitrationCase, AgentHistory, Verdict } from './types';
import { appendAuditEntry, writeVerdictToStorage } from './og-log';
import { pingCompute } from './og-compute';
import { runReasoningLoop } from './reasoning';
import { triggerKeeperHub } from './keeperhub-trigger';
import { downloadContent } from '../og-storage';
import { getAgentHistory, writeAgentHistory } from '../og-kv';

dotenv.config();

const AGENTPACT_ABI = [
  'event ArbitrationRequested(uint256 indexed pactId, string taskSpecURI, string submissionURI, address agentB)',
];

const processedPacts = new Set<number>();

async function processCase(cas: ArbitrationCase): Promise<void> {
  if (processedPacts.has(cas.pactId)) {
    console.log(`[Arbitrator] Pact ${cas.pactId} already processed, skipping`);
    return;
  }
  processedPacts.add(cas.pactId);

  console.log('');
  console.log('='.repeat(60));
  console.log(`[Arbitrator] New case: Pact #${cas.pactId}`);
  console.log(`  Task Spec URI:  ${cas.taskSpecURI}`);
  console.log(`  Submission URI: ${cas.submissionURI}`);
  console.log(`  Worker agentB:  ${cas.agentB}`);
  console.log('='.repeat(60));

  try {
    await appendAuditEntry({
      pactId: cas.pactId,
      type: 'case_opened',
      timestamp: Date.now(),
      blockNumber: cas.requestedAt,
      data: cas,
    });

    const agentHistory = await getAgentHistory(cas.agentB).catch(() => null);
    if (agentHistory) {
      console.log(`[Arbitrator] Agent history: ${JSON.stringify(agentHistory)}`);
    }

    console.log('[Arbitrator] Fetching task spec from 0G Storage...');
    const taskSpec = await downloadContent(cas.taskSpecURI);
    console.log('[Arbitrator] Fetching submission from 0G Storage...');
    const submission = await downloadContent(cas.submissionURI);

    const { decision, confidence, steps } = await runReasoningLoop(cas, taskSpec, submission);
    const verdictRecord: Verdict = {
      pactId: cas.pactId,
      decision,
      confidence,
      reasoning: steps,
      taskSpec,
      submission,
      verdictURI: '',
      timestamp: Date.now(),
    };

    verdictRecord.verdictURI = await writeVerdictToStorage(verdictRecord);

    // CRITICAL: Trigger KeeperHub FIRST — don't let slow KV writes block on-chain resolution
    const dispatchId = await triggerKeeperHub(verdictRecord);
    console.log(`[Arbitrator] Pact ${cas.pactId} verdict submitted to KeeperHub: ${decision} (${dispatchId})`);

    // KV history write is non-blocking — fire and forget
    writeUpdatedHistory(cas.agentB, agentHistory, verdictRecord).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[Arbitrator] Agent history update failed (non-critical): ${message}`);
    });

    // Audit entry is also non-blocking
    appendAuditEntry({
      pactId: cas.pactId,
      type: 'verdict_final',
      timestamp: Date.now(),
      data: {
        decision,
        confidence,
        verdictURI: verdictRecord.verdictURI,
        keeperHubDispatchId: dispatchId,
      },
    }).catch(() => {});
  } catch (err) {
    processedPacts.delete(cas.pactId);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Arbitrator] Error processing pact ${cas.pactId}: ${message}`);
  }
}

async function writeUpdatedHistory(
  agentAddress: string,
  current: AgentHistory | null,
  verdict: Verdict,
): Promise<void> {
  const verdicts = current?.verdicts ?? [];
  verdicts.push({
    pactId: verdict.pactId,
    decision: verdict.decision,
    confidence: verdict.confidence,
    timestamp: verdict.timestamp,
  });

  await writeAgentHistory(agentAddress, {
    ...current,
    lastPactId: verdict.pactId,
    lastVerdict: verdict.decision,
    totalCases: (current?.totalCases || 0) + 1,
    verdicts,
  });
}

async function replayRecentEvents(
  contract: ethers.Contract,
  provider: ethers.JsonRpcProvider,
): Promise<void> {
  try {
    const currentBlock = await provider.getBlockNumber();
    const lookback = parseInt(process.env.ARBITRATOR_REPLAY_BLOCKS || '500', 10);
    const fromBlock = Math.max(0, currentBlock - lookback);
    console.log(`[Arbitrator] Replaying events from block ${fromBlock} to ${currentBlock}...`);

    const events = await contract.queryFilter(
      contract.filters.ArbitrationRequested(),
      fromBlock,
      currentBlock,
    );
    console.log(`[Arbitrator] Found ${events.length} past event(s)`);

    for (const event of events) {
      if (!(event instanceof ethers.EventLog)) {
        continue;
      }
      const [pactId, taskSpecURI, submissionURI, agentB] = event.args;
      await processCase({
        pactId: Number(pactId),
        taskSpecURI,
        submissionURI,
        agentB,
        requestedAt: event.blockNumber,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Arbitrator] Replay error: ${message}`);
  }
}

function startHealthCheck(): void {
  const port = process.env.PORT || 10000;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('AgentPact Arbitrator is ONLINE\n');
  });
  server.listen(port, () => {
    console.log(`[Arbitrator] Health check server listening on port ${port}`);
  });
}

async function setupListener(rpcUrl: string, address: string): Promise<void> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const agentPact = new ethers.Contract(address, AGENTPACT_ABI, provider);

    agentPact.on('ArbitrationRequested', async (pactId, taskSpecURI, submissionURI, agentB, event) => {
      await processCase({
        pactId: Number(pactId),
        taskSpecURI,
        submissionURI,
        agentB,
        requestedAt: event.log.blockNumber,
      });
    });

    console.log(`[Arbitrator] Listening on ${address}`);
    await replayRecentEvents(agentPact, provider);

    provider.on('error', (err) => {
      console.error('[Arbitrator] Provider error, attempting reconnect...', err);
      setTimeout(() => void setupListener(rpcUrl, address), 10000);
    });
  } catch (err) {
    console.error('[Arbitrator] Setup failed, retrying in 10s...', err);
    setTimeout(() => void setupListener(rpcUrl, address), 10000);
  }
}

async function main(): Promise<void> {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const agentPactAddress = process.env.AGENTPACT_ADDRESS;
  if (!rpcUrl || !agentPactAddress) {
    throw new Error('Set SEPOLIA_RPC_URL and AGENTPACT_ADDRESS in .env');
  }

  console.log('AgentPact Arbitrator Agent starting...');
  startHealthCheck();
  
  const computeReady = await pingCompute();
  console.log(`[Arbitrator] 0G Compute: ${computeReady ? 'READY' : 'not ready yet'}`);

  await setupListener(rpcUrl, agentPactAddress);

  process.on('SIGINT', () => {
    console.log('\n[Arbitrator] Shutting down...');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
