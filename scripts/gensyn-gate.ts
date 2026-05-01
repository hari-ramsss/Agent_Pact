import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const GENSYN_API_URL = process.env.GENSYN_API_URL || 'https://api.gensyn.ai/v1';
const GENSYN_API_KEY = process.env.GENSYN_API_KEY || '';
const SIMILARITY_THRESHOLD = Number(process.env.GENSYN_SIMILARITY_THRESHOLD || '0.65');

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

export interface RelevanceCheckResult {
  similarity: number;
  passed: boolean;
  threshold: number;
  warning?: string;
}

export async function getEmbedding(text: string): Promise<number[]> {
  if (!GENSYN_API_KEY) {
    console.warn('[GENSYN] GENSYN_API_KEY not set; using fallback similarity');
    return mockEmbedding(text);
  }

  try {
    const response = await axios.post(
      `${GENSYN_API_URL}/embeddings`,
      { input: text, model: process.env.GENSYN_EMBEDDING_MODEL || 'text-embedding-ada-002' },
      {
        headers: {
          Authorization: `Bearer ${GENSYN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      },
    );
    return response.data.data[0].embedding;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[GENSYN] Embedding API unavailable; using fallback similarity (${message})`);
    return mockEmbedding(text);
  }
}

function mockEmbedding(text: string): number[] {
  const vec = new Array(128).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % 128] += text.charCodeAt(i) / 1000;
  }
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vec.map((value) => value / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

export async function checkRelevance(
  taskSpec: string,
  submission: string,
): Promise<RelevanceCheckResult> {
  console.log('[GENSYN] Running relevance gate...');

  const [taskEmbedding, submissionEmbedding] = await Promise.all([
    getEmbedding(taskSpec),
    getEmbedding(submission),
  ]);

  const similarity = cosineSimilarity(taskEmbedding, submissionEmbedding);
  const rounded = Math.round(similarity * 1000) / 1000;
  const passed = rounded >= SIMILARITY_THRESHOLD;

  const result: RelevanceCheckResult = {
    similarity: rounded,
    passed,
    threshold: SIMILARITY_THRESHOLD,
  };

  if (!passed) {
    result.warning = `Submission similarity ${rounded} is below threshold ${SIMILARITY_THRESHOLD}. Submission may be irrelevant to the task.`;
    console.warn(`[GENSYN] Relevance gate FAILED: similarity=${rounded}`);
  } else {
    console.log(`[GENSYN] Relevance gate PASSED: similarity=${rounded}`);
  }

  return result;
}
