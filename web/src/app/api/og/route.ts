import { Indexer } from "@0gfoundation/0g-ts-sdk";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";

const INDEXER_TURBO =
    process.env.OG_INDEXER_RPC || "https://indexer-storage-testnet-turbo.0g.ai";
const INDEXER_STANDARD = "https://indexer-storage-testnet-standard.0g.ai";

async function downloadFromIndexer(rootHash: string, indexerUrl: string) {
    const indexer = new Indexer(indexerUrl);
    const tempPath = path.join(
        os.tmpdir(),
        `agentpact-og-${rootHash}-${Date.now()}.json`
    );
    try {
        const err = await indexer.download(rootHash, tempPath, true);
        if (err !== null) {
            throw new Error(err.message);
        }
        return fs.readFileSync(tempPath, "utf-8");
    } finally {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }
}

function parseDownloadedContent(content: string) {
    try {
        return JSON.parse(content);
    } catch {
        return { content };
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const uri = searchParams.get("uri") || "";
    const rootHash = uri.startsWith("0g://") ? uri.slice(5) : uri;

    if (!rootHash) {
        return NextResponse.json({ error: "Missing uri" }, { status: 400 });
    }
    if (rootHash.startsWith("demo-") || rootHash.startsWith("mock-")) {
        return NextResponse.json(
            {
                error:
                    "This is a demo placeholder URI, not a real 0G root hash. Upload content to 0G first to get a downloadable URI.",
                uri,
            },
            { status: 400 }
        );
    }

    try {
        const content = await downloadFromIndexer(rootHash, INDEXER_TURBO);
        return NextResponse.json(parseDownloadedContent(content));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        try {
            const content = await downloadFromIndexer(rootHash, INDEXER_STANDARD);
            return NextResponse.json(parseDownloadedContent(content));
        } catch (fallbackErr) {
            const fallbackMessage =
                fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
            return NextResponse.json(
                {
                    error: "0G download failed from both indexers",
                    details: [message, fallbackMessage],
                    uri,
                },
                { status: 503 }
            );
        }
    }
}
