import { NextRequest, NextResponse } from 'next/server';
import { Indexer } from '@0gfoundation/0g-ts-sdk';
import fs from 'fs';
import path from 'path';
import os from 'os';

const INDEXER_TURBO = process.env.OG_INDEXER_RPC || 'https://indexer-storage-testnet-turbo.0g.ai';
const INDEXER_STANDARD = 'https://indexer-storage-testnet-standard.0g.ai';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rootHash = searchParams.get('rootHash');

  if (!rootHash) {
    return NextResponse.json({ error: 'Missing rootHash' }, { status: 400 });
  }

  console.log(`[API] Downloading ${rootHash} from 0G...`);

  // Try turbo first, then standard
  for (const url of [INDEXER_TURBO, INDEXER_STANDARD]) {
    try {
      const indexer = new Indexer(url);
      const tempPath = path.join(os.tmpdir(), `web-og-download-${Date.now()}.json`);
      
      // Download to temp file
      const err = await indexer.download(rootHash, tempPath, true);
      
      if (err !== null) {
        console.warn(`[API] Download error via ${url}: ${err.message}`);
        continue;
      }

      const content = fs.readFileSync(tempPath, 'utf-8');
      
      // Clean up
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }

      try {
        const json = JSON.parse(content);
        return NextResponse.json(json);
      } catch (e) {
        return NextResponse.json({ content });
      }
    } catch (err) {
      console.warn(`[API] Failed to download from ${url}:`, err);
    }
  }

  return NextResponse.json({ error: 'Failed to download from both indexers' }, { status: 500 });
}
