import { Indexer, MemData } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

dotenv.config();

const OG_RPC_URL = process.env.OG_RPC_URL || 'https://evmrpc-testnet.0g.ai';
const INDEXER_RPC = process.env.OG_INDEXER_RPC || 'https://indexer-storage-testnet-turbo.0g.ai';
const PRIVATE_KEY = process.env.OG_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  throw new Error('Set OG_PRIVATE_KEY or PRIVATE_KEY in .env');
}

const provider = new ethers.JsonRpcProvider(OG_RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);
const indexer = new Indexer(INDEXER_RPC);

export interface UploadResult {
  rootHash: string;
  uri: string;
  txHash: string;
}

export function serializeContent(content: object | string): string {
  return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
}

export function hashContent(content: object | string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(serializeContent(content)));
}

export async function uploadToStorage(
  content: object | string,
  label?: string
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

  const [tx, uploadErr] = await indexer.upload(memData, OG_RPC_URL, signer);
  if (uploadErr !== null) {
    throw new Error(`Upload error: ${uploadErr.message}`);
  }

  const txHash = 'txHash' in tx ? tx.txHash : tx.txHashes[0];
  const uri = `0g://${rootHash}`;

  console.log('[0G Storage] Upload successful');
  console.log(`[0G Storage] URI: ${uri}`);
  console.log(`[0G Storage] TX: ${txHash}`);

  return { rootHash, uri, txHash };
}

export async function downloadFromStorage(rootHash: string): Promise<string> {
  console.log(`[0G Storage] Downloading ${rootHash}...`);

  const tempPath = path.join(os.tmpdir(), `agentpact-og-download-${Date.now()}.json`);
  const err = await indexer.download(rootHash, tempPath, true);
  if (err !== null) {
    throw new Error(`Download error: ${err.message}`);
  }

  try {
    const content = fs.readFileSync(tempPath, 'utf-8');
    console.log(`[0G Storage] Download successful (${content.length} bytes)`);
    return content;
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

export async function verifyChainOfCustody(
  onChainHash: string,
  og0URI: string
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
