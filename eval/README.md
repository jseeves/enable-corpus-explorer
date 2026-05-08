# Eval

The eval set is the 13 Golden Questions in the metadata workbook's `Golden_Questions` sheet. Each question carries:

- `Phase` — financing | planning | implementation | monitoring | cross_cutting
- `Mode` — Answer | Cite | both
- `Expected key resource_ids` — semicolon-separated list of `ks_xxx` ids that should ideally appear in retrieval

## What we measure

**recall@5 and recall@10.** Of the expected ids, what fraction appear in the top 5 (or top 10) unique resource_ids retrieved? This is the primary retrieval-quality metric.

**did_answer.** Whether the system produced a real answer or fell into the graceful-fallback path ("not in the corpus"). Useful for catching cases where good retrieval failed to translate into a good answer, and vice versa.

**latency.** End-to-end response time, p50 and p95.

**answer_preview.** The first 200 chars of the generated answer, captured for human review.

## How to interpret

A first iteration on a working RAG pipeline typically scores **recall@5 between 0.4 and 0.7** across the eval set. If you see scores below 0.3, retrieval has a real problem (chunking too coarse, embeddings not matching the query domain, hybrid weight wrong). If you see scores above 0.85, suspect overfitting — the eval was probably too easy.

The per-phase breakdown matters more than the overall mean. If `monitoring` scores well but `planning` is poor, look at planning-phase chunks to see what's going wrong (often: planning queries are abstract and need strong rerank).

## Iterating

When a question fails, the diagnostic order is:

1. **Was the right document retrieved at all?** Check `retrieved_top_5`. If the expected id isn't there, retrieval failed — chunking, embeddings, or filters need work.
2. **Was the right chunk retrieved?** If the document was retrieved but the answer is wrong, the right doc-but-wrong-chunk problem means rerank or chunk size needs adjustment.
3. **Did the prompt cause Claude to hedge?** If retrieval was good but the answer is a fallback, the system prompt may be too strict.

## Adding new Golden Questions

Add rows to the `Golden_Questions` sheet in the workbook. The eval script picks them up automatically. Aim for 20-30 total questions over time — enough to give statistically meaningful per-phase scores.
