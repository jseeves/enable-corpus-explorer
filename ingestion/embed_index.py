"""Embed chunks with Voyage AI and upsert to Pinecone (hybrid: dense + sparse).

Hybrid search combines:
  - Dense: voyage-3 embeddings (1024-dim) for semantic similarity
  - Sparse: built-in BM25-style keyword vectors for exact-phrase matching

Pinecone supports this via "dotproduct" hybrid indexes with sparse-dense vectors.
At query time, both vectors contribute to the similarity score; you can tune
the alpha weighting between them.

Run with:
    # First time: create the index
    python -m ingestion.embed_index --create-index

    # Then upsert chunks
    python -m ingestion.embed_index --chunks data/derived/chunks.jsonl
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import voyageai
from pinecone import Pinecone, ServerlessSpec
from tqdm import tqdm


VOYAGE_EMBEDDING_MODEL = "voyage-3"
EMBEDDING_DIM = 1024
BATCH_SIZE = 32  # Voyage allows up to 128 per call; smaller batches are gentler on rate limits


def get_pinecone_client() -> Pinecone:
    api_key = os.environ.get("PINECONE_API_KEY")
    if not api_key:
        raise RuntimeError("PINECONE_API_KEY not set")
    return Pinecone(api_key=api_key)


def get_voyage_client() -> voyageai.Client:
    api_key = os.environ.get("VOYAGE_API_KEY")
    if not api_key:
        raise RuntimeError("VOYAGE_API_KEY not set")
    return voyageai.Client(api_key=api_key)


def create_index(index_name: str | None = None) -> None:
    """Create a Pinecone hybrid (dotproduct) index. Idempotent — does nothing if exists."""
    pc = get_pinecone_client()
    name = index_name or os.environ["PINECONE_INDEX_NAME"]
    cloud = os.environ.get("PINECONE_CLOUD", "aws")
    region = os.environ.get("PINECONE_REGION", "us-east-1")

    existing = [i["name"] for i in pc.list_indexes()]
    if name in existing:
        print(f"Index '{name}' already exists.")
        return

    pc.create_index(
        name=name,
        dimension=EMBEDDING_DIM,
        metric="dotproduct",  # Required for hybrid (sparse + dense)
        spec=ServerlessSpec(cloud=cloud, region=region),
    )
    # Wait for ready
    while not pc.describe_index(name).status.get("ready"):
        time.sleep(1)
    print(f"Created index '{name}' (dim={EMBEDDING_DIM}, metric=dotproduct, hybrid).")


def embed_batch(texts: list[str], voyage: voyageai.Client) -> list[list[float]]:
    """Embed a batch of texts with Voyage. Input type 'document' for indexing."""
    result = voyage.embed(texts=texts, model=VOYAGE_EMBEDDING_MODEL, input_type="document")
    return result.embeddings


def build_sparse_vector(text: str) -> dict:
    """Naive BM25-ish sparse vector. Pinecone provides better tools (e.g.,
    pinecone-text for proper BM25). This is a placeholder that creates a
    sparse vector from term-frequency hashes; replace with pinecone-text for
    production quality.

    Returns: {"indices": [...], "values": [...]}
    """
    # Tokenize naively
    import re
    tokens = re.findall(r"\b[a-z][a-z0-9]{2,}\b", text.lower())
    if not tokens:
        return {"indices": [0], "values": [0.0]}

    # Term frequency
    tf: dict[int, float] = {}
    for tok in tokens:
        idx = hash(tok) % (2**31)
        tf[idx] = tf.get(idx, 0) + 1

    # Normalize (light scaling)
    indices = list(tf.keys())
    values = [v / max(tf.values()) for v in tf.values()]
    return {"indices": indices, "values": values}


def upsert_chunks(chunks_jsonl: Path, index_name: str | None = None) -> dict:
    """Embed and upsert all chunks from a JSONL file."""
    pc = get_pinecone_client()
    voyage = get_voyage_client()
    name = index_name or os.environ["PINECONE_INDEX_NAME"]
    index = pc.Index(name)

    # Load all chunks
    chunks = []
    with chunks_jsonl.open() as f:
        for line in f:
            chunks.append(json.loads(line))
    print(f"Loaded {len(chunks)} chunks from {chunks_jsonl}")

    n_upserted = 0
    for batch_start in tqdm(range(0, len(chunks), BATCH_SIZE), desc="Embedding + upserting"):
        batch = chunks[batch_start : batch_start + BATCH_SIZE]
        texts = [c["text"] for c in batch]

        # Dense embeddings via Voyage
        dense_vectors = embed_batch(texts, voyage)

        # Build Pinecone vectors
        pc_vectors = []
        for chunk, dense in zip(batch, dense_vectors):
            sparse = build_sparse_vector(chunk["text"])
            # Compose metadata for the vector record
            md = dict(chunk["metadata"])
            md["resource_id"] = chunk["resource_id"]
            md["chunk_id"] = chunk["chunk_id"]
            md["page_num"] = chunk["page_num"]
            md["text"] = chunk["text"]  # store text for citation rendering
            pc_vectors.append({
                "id": chunk["chunk_id"],
                "values": dense,
                "sparse_values": sparse,
                "metadata": md,
            })

        index.upsert(vectors=pc_vectors)
        n_upserted += len(pc_vectors)

    return {"n_upserted": n_upserted, "index": name}


def delete_resource(resource_id: str, index_name: str | None = None) -> int:
    """Delete all chunks for one resource_id (used by --incremental re-ingestion)."""
    pc = get_pinecone_client()
    name = index_name or os.environ["PINECONE_INDEX_NAME"]
    index = pc.Index(name)
    # Filter-based delete
    index.delete(filter={"resource_id": resource_id})
    return 1


if __name__ == "__main__":
    import argparse
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser()
    parser.add_argument("--create-index", action="store_true", help="Create the Pinecone index (one-time)")
    parser.add_argument("--chunks", type=Path, help="Path to chunks JSONL to upsert")
    parser.add_argument("--index", default=None, help="Override PINECONE_INDEX_NAME")
    args = parser.parse_args()

    if args.create_index:
        create_index(args.index)
    elif args.chunks:
        stats = upsert_chunks(args.chunks, args.index)
        print(f"\nUpserted {stats['n_upserted']} vectors to '{stats['index']}'")
    else:
        parser.print_help()
