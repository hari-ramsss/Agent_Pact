import { Indexer, MemData } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

dotenv.config();

const OG_RPC_URL = process.env.OG_RPC_URL || 'https://evmrpc-testnet.0g.ai';
const PRIVATE_KEY = process.env.OG_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  throw new Error('Set OG_PRIVATE_KEY or PRIVATE_KEY in .env');
}

// ── Indexer endpoints — turbo first, standard as fallback ────────────
const INDEXER_TURBO = process.env.OG_INDEXER_RPC || 'https://indexer-storage-testnet-turbo.0g.ai';
const INDEXER_STANDARD = 'https://indexer-storage-testnet-standard.0g.ai';

const provider = new ethers.JsonRpcProvider(OG_RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// ── Types ─────────────────────────────────────────────────────────────

export interface UploadResult {
  rootHash: string;
  uri: string;
  txHash: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

export function serializeContent(content: object | string): string {
  return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
}

export function hashContent(content: object | string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(serializeContent(content)));
}

/**
 * Race a promise against a timeout.
 * Returns the promise result or throws on timeout.
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

// ── Core: upload with timeout + automatic fallback ────────────────────

/**
 * Try to upload via a given indexer URL.
 * Wraps the SDK upload in a timeout so the "Waiting for storage node
 * to sync" infinite loop cannot hang your process forever.
 */
async function tryUpload(
  memData: MemData,
  indexerUrl: string,
  timeoutMs: number,
  label: string,
): Promise<UploadResult> {
  console.log(`[0G Storage] Trying ${label} indexer (${indexerUrl})...`);

  const indexer = new Indexer(indexerUrl);

  const uploadPromise = (async () => {
    const [tx, uploadErr] = await indexer.upload(memData, OG_RPC_URL, signer, {
      skipIfFinalized: true,
    });
    if (uploadErr !== null) {
      throw new Error(`Upload error: ${uploadErr.message}`);
    }
    return tx;
  })();

  const tx = await withTimeout(uploadPromise, timeoutMs, `${label} upload`);

  const txHash = 'txHash' in tx ? tx.txHash : tx.txHashes[0];
  return { rootHash: (tx as any).rootHash ?? '', uri: '', txHash };
}

/**
 * Upload any JSON-serializable object to 0G Storage.
 * Returns the root hash (for on-chain storage) and URI (for contract parameters).
 *
 * Strategy:
 *   1. Try turbo indexer with a 3-minute timeout.
 *   2. If turbo times out (storage node sync lag), fall back to standard indexer.
 *   3. If both fail, throw.
 */
export async function uploadToStorage(
  content: object | string,
  label?: string,
): Promise<UploadResult> {
  const contentString = serializeContent(content);
  console.log(`[0G Storage] Uploading ${label || 'data'} (${contentString.length} bytes)...`);

  const bytes = new TextEncoder().encode(contentString);
  const memData = new MemData(bytes);

  const [tree, treeErr] = await memData.merkleTree();
  if (treeErr !== null || tree === null) {
    throw new Error(`Merkle tree error: ${treeErr?.message || 'unknown error'}`);
  }

  const rootHash = tree.rootHash();
  if (rootHash === null) {
    throw new Error('Merkle tree did not produce a root hash');
  }
  console.log(`[0G Storage] Root hash: ${rootHash}`);

  const UPLOAD_TIMEOUT = 3 * 60 * 1000; // 3 minutes

  let lastError: Error | null = null;

  // Attempt 1: turbo indexer
  try {
    const result = await tryUpload(memData, INDEXER_TURBO, UPLOAD_TIMEOUT, 'turbo');
    const uri = `0g://${rootHash}`;
    console.log('[0G Storage] Upload successful (turbo)');
    console.log(`[0G Storage] URI: ${uri}`);
    console.log(`[0G Storage] TX: ${result.txHash}`);
    return { rootHash, uri, txHash: result.txHash };
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    console.warn(`[0G Storage] Turbo indexer failed: ${lastError.message}`);
  }

  // Attempt 2: standard indexer (different node pool, may be caught up)
  // Need a fresh MemData since the previous one may have been partially consumed
  const memData2 = new MemData(bytes);
  await memData2.merkleTree();

  try {
    const result = await tryUpload(memData2, INDEXER_STANDARD, UPLOAD_TIMEOUT, 'standard');
    const uri = `0g://${rootHash}`;
    console.log('[0G Storage] Upload successful (standard fallback)');
    console.log(`[0G Storage] URI: ${uri}`);
    console.log(`[0G Storage] TX: ${result.txHash}`);
    return { rootHash, uri, txHash: result.txHash };
  } catch (err) {
    const secondError = err instanceof Error ? err : new Error(String(err));
    console.error(`[0G Storage] Standard indexer also failed: ${secondError.message}`);
  }

  throw new Error(
    `Upload failed on both turbo and standard indexers. ` +
    `This usually means the 0G testnet storage nodes are lagging behind the chain. ` +
    `Try again in a few minutes. Last error: ${lastError?.message}`
  );
}

export async function uploadContent(content: object | string, label?: string): Promise<string> {
  const result = await uploadToStorage(content, label);
  return result.uri;
}

// ── Core: download ────────────────────────────────────────────────────

export async function downloadFromStorage(rootHash: string): Promise<string> {
  console.log(`[0G Storage] Downloading ${rootHash}...`);

  // Try turbo first, then standard
  for (const [url, label] of [
    [INDEXER_TURBO, 'turbo'],
    [INDEXER_STANDARD, 'standard'],
  ] as const) {
    try {
      const indexer = new Indexer(url);
      const tempPath = path.join(os.tmpdir(), `agentpact-og-download-${Date.now()}.json`);
      const err = await withTimeout(
        indexer.download(rootHash, tempPath, true),
        2 * 60 * 1000, // 2 minute timeout for downloads
        `${label} download`,
      );
      if (err !== null) {
        console.warn(`[0G Storage] ${label} download error: ${err.message}`);
        continue;
      }

      try {
        const content = fs.readFileSync(tempPath, 'utf-8');
        console.log(`[0G Storage] Download successful via ${label} (${content.length} bytes)`);
        return content;
      } finally {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[0G Storage] ${label} download failed: ${message}`);
    }
  }

  throw new Error(`Download failed for ${rootHash} on both turbo and standard indexers`);
}

export async function downloadContent(uriOrRootHash: string): Promise<string> {
  const rootHash = uriOrRootHash.startsWith('0g://')
    ? uriOrRootHash.slice('0g://'.length)
    : uriOrRootHash;
  return downloadFromStorage(rootHash);
}

// ── Verify chain of custody ───────────────────────────────────────────

export async function verifyChainOfCustody(
  onChainHash: string,
  og0URI: string,
): Promise<{ valid: boolean; content: string }> {
  const rootHash = og0URI.replace('0g://', '');
  const content = await downloadFromStorage(rootHash);
  const contentHash = hashContent(content);
  const valid = contentHash.toLowerCase() === onChainHash.toLowerCase();

  console.log(`[Verify] On-chain hash: ${onChainHash}`);
  console.log(`[Verify] Content hash:  ${contentHash}`);
  console.log(`[Verify] Match: ${valid ? 'VALID' : 'MISMATCH'}`);

  return { valid, content };
}
