import { Batcher, Indexer, KvClient, getFlowContract } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

const OG_RPC_URL = process.env.OG_RPC_URL || 'https://evmrpc-testnet.0g.ai';
const INDEXER_RPC = process.env.OG_INDEXER_RPC || 'https://indexer-storage-testnet-turbo.0g.ai';
const KV_RPC = process.env.OG_KV_RPC || 'http://3.101.147.150:6789';
const STREAM_ID = process.env.OG_STREAM_ID;
const FLOW_CONTRACT = process.env.OG_FLOW_CONTRACT || '0x22E03a6A89B950F1c82ec5e74F8eCa321a105296';
const PRIVATE_KEY = process.env.OG_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!STREAM_ID) {
  throw new Error('Set OG_STREAM_ID in .env');
}

if (!PRIVATE_KEY) {
  throw new Error('Set OG_PRIVATE_KEY or PRIVATE_KEY in .env');
}

const streamId = STREAM_ID;
const provider = new ethers.JsonRpcProvider(OG_RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);
const indexer = new Indexer(INDEXER_RPC);
const kvClient = new KvClient(KV_RPC);
const flowContract = getFlowContract(FLOW_CONTRACT, signer);

function scoreKey(agentAddress: string): string {
  return `agentpact:score:${agentAddress.toLowerCase()}`;
}

function historyKey(agentAddress: string): string {
  return `agentpact:history:${agentAddress.toLowerCase()}`;
}

function utf8Bytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'utf-8'));
}

function encodedKey(value: string) {
  return ethers.encodeBase64(utf8Bytes(value)) as unknown as Parameters<KvClient['getValue']>[1];
}

async function writeValue(key: string, value: string): Promise<string> {
  const [nodes, nodeErr] = await indexer.selectNodes(1);
  if (nodeErr !== null) {
    throw new Error(`Node selection error: ${nodeErr.message}`);
  }

  const batcher = new Batcher(1, nodes, flowContract, OG_RPC_URL);
  batcher.streamDataBuilder.set(streamId, utf8Bytes(key), utf8Bytes(value));

  const [tx, batchErr] = await batcher.exec({ skipIfFinalized: false });
  if (batchErr !== null) {
    throw new Error(`KV write error: ${batchErr.message}`);
  }

  return tx.txHash;
}

export async function readCreditScore(agentAddress: string): Promise<number> {
  console.log(`[0G KV] Reading credit score for ${agentAddress}...`);

  try {
    const value = await kvClient.getValue(streamId, encodedKey(scoreKey(agentAddress)));
    if (value === null || value === undefined) {
      console.log('[0G KV] No score found, returning 0');
      return 0;
    }

    const score = parseInt(Buffer.from(value.data, 'base64').toString('utf-8'), 10);
    console.log(`[0G KV] Score: ${score}`);
    return Number.isNaN(score) ? 0 : score;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[0G KV] No score key found, returning 0 (${message})`);
    return 0;
  }
}

export async function writeCreditScore(agentAddress: string, score: number): Promise<void> {
  console.log(`[0G KV] Writing credit score ${score} for ${agentAddress}...`);
  const txHash = await writeValue(scoreKey(agentAddress), score.toString());
  console.log(`[0G KV] Score written. TX: ${txHash}`);
}

export async function readAgentHistory(agentAddress: string): Promise<object[]> {
  console.log(`[0G KV] Reading history for ${agentAddress}...`);

  try {
    const value = await kvClient.getValue(streamId, encodedKey(historyKey(agentAddress)));
    if (value === null || value === undefined) {
      return [];
    }

    return JSON.parse(Buffer.from(value.data, 'base64').toString('utf-8'));
  } catch {
    return [];
  }
}

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

  const txHash = await writeValue(historyKey(agentAddress), JSON.stringify(existing));
  console.log(`[0G KV] History updated. TX: ${txHash}`);
}
