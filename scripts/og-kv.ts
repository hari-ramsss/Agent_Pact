import { Batcher, Indexer, KvClient, getFlowContract } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

const OG_RPC_URL = process.env.OG_RPC_URL || 'https://evmrpc-testnet.0g.ai';
const INDEXER_RPC = process.env.OG_INDEXER_RPC || 'https://indexer-storage-testnet-turbo.0g.ai';
const INDEXER_STANDARD = 'https://indexer-storage-testnet-standard.0g.ai';
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
const flowContract = getFlowContract(FLOW_CONTRACT, signer);

// ── KV Client with extended timeout ──────────────────────────────────
// The default KvClient uses open-jsonrpc-provider with a 30s timeout.
// The 0G KV node at 3.101.147.150 is often slow, so we bump to 120s.
// KvClient → StorageKv → HttpProvider({ url }). We can't pass timeout
// through the public API, so we patch the inner client after creation.

function createKvClient(rpc: string, timeoutMs = 120_000): KvClient {
  const client = new KvClient(rpc);
  // Patch timeout on the inner StorageKv (which extends HttpProvider)
  const inner = (client as any).inner;
  if (inner && typeof inner.timeout !== 'undefined') {
    inner.timeout = timeoutMs;
  }
  return client;
}

const kvClient = createKvClient(KV_RPC, 120_000);

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

/**
 * Race a promise against a timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout after ${ms / 1000}s: ${label}`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

const KV_WRITE_TIMEOUT = 3 * 60 * 1000; // 3 minutes

/**
 * Try writing a KV pair via a specific indexer.
 */
async function tryWriteValue(
  key: string,
  value: string,
  indexerUrl: string,
  label: string,
): Promise<string> {
  console.log(`[0G KV] Trying ${label} indexer for write...`);
  const indexer = new Indexer(indexerUrl);

  const writePromise = (async () => {
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
  })();

  return withTimeout(writePromise, KV_WRITE_TIMEOUT, `${label} KV write`);
}

/**
 * Write a KV value with turbo→standard fallback and timeout protection.
 */
async function writeValue(key: string, value: string): Promise<string> {
  let lastError: Error | null = null;

  // Attempt 1: turbo indexer
  try {
    return await tryWriteValue(key, value, INDEXER_RPC, 'turbo');
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    console.warn(`[0G KV] Turbo write failed: ${lastError.message}`);
  }

  // Attempt 2: standard indexer
  try {
    return await tryWriteValue(key, value, INDEXER_STANDARD, 'standard');
  } catch (err) {
    const secondError = err instanceof Error ? err : new Error(String(err));
    console.error(`[0G KV] Standard write also failed: ${secondError.message}`);
  }

  throw new Error(
    `KV write failed on both indexers. ` +
    `Storage nodes may be syncing. Try again in a few minutes. ` +
    `Last error: ${lastError?.message}`
  );
}

export async function readCreditScore(agentAddress: string): Promise<number> {
  console.log(`[0G KV] Reading credit score for ${agentAddress}...`);

  try {
    const value = await kvClient.getValue(streamId, encodedKey(scoreKey(agentAddress)));

    // Debug: log the raw response to understand the KV node's response shape
    console.log(`[0G KV] Raw response:`, JSON.stringify(value, null, 2));

    if (value === null || value === undefined) {
      console.log('[0G KV] No score found, returning 0');
      return 0;
    }

    // Check if there's actually data
    if (!value.data || value.size === 0) {
      console.log('[0G KV] Empty data, returning 0');
      return 0;
    }

    const decoded = Buffer.from(value.data, 'base64').toString('utf-8');
    console.log(`[0G KV] Decoded value: "${decoded}" (length: ${decoded.length})`);

    const score = parseInt(decoded, 10);
    console.log(`[0G KV] Parsed score: ${score}`);
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
  },
): Promise<void> {
  const existing = await readAgentHistory(agentAddress);
  existing.push(verdict);

  const txHash = await writeValue(historyKey(agentAddress), JSON.stringify(existing));
  console.log(`[0G KV] History updated. TX: ${txHash}`);
}

export async function getAgentHistory(agentAddress: string): Promise<any | null> {
  console.log(`[0G KV] Reading arbitrator history for ${agentAddress}...`);

  try {
    const value = await kvClient.getValue(streamId, encodedKey(historyKey(agentAddress)));
    if (value === null || value === undefined || !value.data || value.size === 0) {
      return null;
    }

    return JSON.parse(Buffer.from(value.data, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

export async function writeAgentHistory(agentAddress: string, data: any): Promise<void> {
  console.log(`[0G KV] Writing arbitrator history for ${agentAddress}...`);
  const txHash = await writeValue(historyKey(agentAddress), JSON.stringify(data));
  console.log(`[0G KV] Arbitrator history written. TX: ${txHash}`);
}
