/**
 * Hybrid retrieval (dense + sparse) over Pinecone, with Voyage rerank.
 *
 * Stage 1: Embed the query with Voyage (input_type: 'query'), build a sparse vector
 *          (naive BM25-ish; matches the indexer in ingestion/embed_index.py),
 *          and query Pinecone for top-K candidates.
 * Stage 2: Rerank the candidates with Voyage's rerank-2 model. Returns the top N.
 */

import { Pinecone } from "@pinecone-database/pinecone";

export interface RetrievedChunk {
  chunk_id: string;
  resource_id: string;
  text: string;
  page_num: number;
  score: number;
  metadata: Record<string, unknown>;
}

const VOYAGE_API = "https://api.voyageai.com/v1";
const VOYAGE_EMBED_MODEL = "voyage-3";
const VOYAGE_RERANK_MODEL = "rerank-2";

let pineconeClient: Pinecone | null = null;
function getPinecone() {
  if (!pineconeClient) {
    pineconeClient = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  }
  return pineconeClient;
}

/** Embed a query with Voyage. Note input_type='query' (different from indexing time). */
async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch(`${VOYAGE_API}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: [text],
      model: VOYAGE_EMBED_MODEL,
      input_type: "query",
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage embed failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

/** Build a naive BM25-ish sparse vector. Mirrors ingestion/embed_index.py's logic.
 * For production, swap to a proper BM25 implementation (e.g., a JS port of pinecone-text). */
function buildSparseVector(text: string): { indices: number[]; values: number[] } {
  const tokens = text.toLowerCase().match(/\b[a-z][a-z0-9]{2,}\b/g) || [];
  if (tokens.length === 0) return { indices: [0], values: [0] };
  const tf = new Map<number, number>();
  for (const tok of tokens) {
    const idx = simpleHash(tok) % (2 ** 31);
    tf.set(idx, (tf.get(idx) || 0) + 1);
  }
  const max = Math.max(...tf.values());
  const indices = Array.from(tf.keys());
  const values = indices.map((i) => tf.get(i)! / max);
  return { indices, values };
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Hybrid retrieve: combines dense (semantic) and sparse (keyword) Pinecone query. */
export async function hybridRetrieve(
  question: string,
  opts: { topK?: number; filters?: Record<string, string | string[]>; alpha?: number } = {},
): Promise<RetrievedChunk[]> {
  const topK = opts.topK ?? 30;
  const alpha = opts.alpha ?? 0.6; // dense weight; sparse = 1 - alpha

  const dense = await embedQuery(question);
  const sparse = buildSparseVector(question);

  // Apply alpha weighting (Pinecone hybrid convention)
  const weightedDense = dense.map((v) => v * alpha);
  const weightedSparse = {
    indices: sparse.indices,
    values: sparse.values.map((v) => v * (1 - alpha)),
  };

  const indexName = process.env.PINECONE_INDEX_NAME!;
  const index = getPinecone().Index(indexName);

  const queryRes = await index.query({
    vector: weightedDense,
    sparseVector: weightedSparse,
    topK,
    includeMetadata: true,
    filter: buildFilter(opts.filters),
  });

  return (queryRes.matches || []).map((m) => {
    const md = (m.metadata || {}) as Record<string, unknown>;
    return {
      chunk_id: m.id,
      resource_id: (md.resource_id as string) || "",
      text: (md.text as string) || "",
      page_num: (md.page_num as number) || 1,
      score: m.score || 0,
      metadata: md,
    };
  });
}

function buildFilter(filters?: Record<string, string | string[]>) {
  if (!filters) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (Array.isArray(v)) {
      out[k] = { $in: v };
    } else {
      out[k] = { $eq: v };
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** Rerank candidates with Voyage rerank-2. Returns top N. */
export async function rerank(
  question: string,
  candidates: RetrievedChunk[],
  topN: number,
): Promise<RetrievedChunk[]> {
  if (candidates.length === 0) return [];

  const res = await fetch(`${VOYAGE_API}/rerank`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      query: question,
      documents: candidates.map((c) => c.text),
      model: VOYAGE_RERANK_MODEL,
      top_k: topN,
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage rerank failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();

  // data.data is an array of { index, relevance_score }, sorted by relevance
  return (data.data as Array<{ index: number; relevance_score: number }>).map((r) => ({
    ...candidates[r.index],
    score: r.relevance_score,
  }));
}
