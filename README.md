# Restoration Intelligence — Starter Kit

A code scaffold for deploying a grounded RAG (retrieval-augmented generation) system over a curated document corpus. Designed to be handed to Claude Code for iteration. Built around the architecture you and I worked through:

- **Stack:** Next.js + Vercel (frontend + serverless functions) + Pinecone (hybrid vector + sparse index) + Voyage AI (embeddings + reranker) + Claude Sonnet (generation).
- **Ingestion:** Python pipeline — page-aware PDF extraction, ~400-character chunks with 80-character overlap, optional LLM-driven metadata enrichment (Track 2 from our chat), Voyage embeddings, Pinecone upsert, UMAP coordinates for the corpus map.
- **App:** Two-tab Next.js interface — corpus explorer (Plotly UMAP scatter, faceted filters) and chat (Answer mode + Cite mode toggle, strict-with-graceful-fallback).
- **Eval:** Script that runs the 13 Golden Questions through the deployed endpoint and reports recall@k per phase, per mode.

This is a **starter kit**, not a production app. The ingestion pipeline and `/api/ask` route are written to work; the React components are scaffolds for Claude Code to flesh out.

---

## Prerequisites

- Python 3.11+ (`uv` recommended for env management)
- Node 20+ (`pnpm` or `npm`)
- Accounts and API keys for: Anthropic, Voyage AI, Pinecone, Vercel
- The classified metadata workbook (`Enable_Stocktake_v6.xlsx` or your team's equivalent)
- The corpus of PDFs

## Quickstart (local)

```bash
# 1. Clone or unzip this folder, then cd into it.
cd restoration-intelligence-starter

# 2. Set up environment.
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY, VOYAGE_API_KEY, PINECONE_API_KEY, PINECONE_INDEX_NAME

# 3. Drop your corpus into data/raw_pdfs/ and the metadata workbook into data/metadata/
cp ~/Downloads/Enable_Stocktake_v6.xlsx data/metadata/
unzip ~/Downloads/Knowledge_Stocktake.zip -d data/raw_pdfs/

# 4. Set up Python env and install ingestion deps.
uv venv && source .venv/bin/activate
uv pip install -e ".[ingest]"

# 5. Create the Pinecone index (one-time).
python -m ingestion.embed_index --create-index

# 6. Run the full ingestion pipeline.
# Reads PDFs → extracts text → chunks → (optional: enriches metadata) → embeds → upserts to Pinecone → builds UMAP coords.
python -m ingestion.pipeline --metadata data/metadata/Enable_Stocktake_v6.xlsx --pdf-dir data/raw_pdfs --enrich

# 7. Run the app locally.
cd app
cp .env.local.example .env.local   # Fill same values as parent .env
pnpm install
pnpm dev
# Open http://localhost:3000
```

## Deploy to Vercel

```bash
cd app
vercel link        # Link to a Vercel project (or create one)
vercel env add ANTHROPIC_API_KEY    # Repeat for VOYAGE_API_KEY, PINECONE_API_KEY, PINECONE_INDEX_NAME
vercel deploy --prod
```

The deployed app calls Pinecone, Voyage, and Anthropic from the serverless function in `/api/ask`. The Pinecone index is the single source of truth for retrieval; redeployment doesn't reindex.

## Re-ingesting after corpus changes

```bash
# Add new PDFs to data/raw_pdfs/, update the metadata workbook, then:
python -m ingestion.pipeline --metadata data/metadata/Enable_Stocktake_v7.xlsx --pdf-dir data/raw_pdfs --enrich --incremental
# --incremental skips files whose resource_id is already in the index.
```

## Run the eval

```bash
# Against local app:
python -m eval.run_golden --endpoint http://localhost:3000/api/ask --workbook data/metadata/Enable_Stocktake_v6.xlsx

# Against deployed app:
python -m eval.run_golden --endpoint https://your-app.vercel.app/api/ask --workbook data/metadata/Enable_Stocktake_v6.xlsx
```

Outputs a CSV with per-question recall@5, recall@10, latency, and the actual generated answer for each Golden Question. Open in Excel, sort by recall, audit the failures.

---

## File structure

```
restoration-intelligence-starter/
├── README.md                            (this file)
├── .env.example                         API keys template
├── .gitignore
├── pyproject.toml                       Python deps (ingestion + eval)
├── ingestion/
│   ├── extract.py                       PDF → text with page tracking (PyMuPDF)
│   ├── chunk.py                         Text → ~400-char chunks with overlap and metadata propagation
│   ├── enrich.py                        Track 2: Claude API call per doc to refine summary, tags, vintage, etc.
│   ├── embed_index.py                   Voyage embeddings → Pinecone hybrid (dense + sparse) upsert
│   ├── build_visualization.py           UMAP projection of doc embeddings → JSON for the explorer tab
│   └── pipeline.py                      Orchestrator: chains the steps end-to-end
├── eval/
│   ├── run_golden.py                    Runs Golden Questions, scores recall@k against expected_key_resource_ids
│   └── README.md                        Notes on the eval methodology
├── app/                                 Next.js 14 app (App Router, TypeScript)
│   ├── package.json
│   ├── next.config.js
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── .env.local.example
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx                 Tab switcher (Explorer | Chat)
│       │   ├── globals.css
│       │   └── api/
│       │       ├── ask/route.ts         Core RAG: hybrid retrieve → rerank → generate
│       │       └── corpus/route.ts      Returns metadata + UMAP coords for explorer
│       ├── components/
│       │   ├── CorpusExplorer.tsx       Tab 1 (Plotly UMAP, facet filters)  [scaffold]
│       │   ├── ChatInterface.tsx        Tab 2 (chat + mode toggle)          [scaffold]
│       │   ├── Citation.tsx             Renders inline citations             [scaffold]
│       │   └── ModeToggle.tsx           Answer | Cite mode switch            [scaffold]
│       └── lib/
│           ├── pinecone.ts              Pinecone client wrapper
│           ├── voyage.ts                Voyage embeddings + reranker client
│           ├── anthropic.ts             Anthropic streaming client
│           └── prompt.ts                Strict-RAG system prompts (Answer + Cite modes)
└── data/                                (gitignored; populate locally)
    ├── metadata/                        Drop the v6 workbook here
    ├── raw_pdfs/                        Drop the corpus PDFs here
    └── derived/                         Outputs: chunks.jsonl, umap.json, enriched_metadata.xlsx
```

---

## Suggested Claude Code prompts

The pieces this kit deliberately leaves for Claude Code to build out:

**1. The corpus explorer (Tab 1).**

> Open `app/src/components/CorpusExplorer.tsx`. The component receives an array of doc objects from `/api/corpus`, each with `{resource_id, title, document_type, phase_of_restoration, target_audience, region, short_summary, umap_x, umap_y, page_count}`. Build a Plotly scatter chart where each point is a document positioned at (umap_x, umap_y), colored by `document_type`. On hover, show title + short_summary. On click, open a side panel with full metadata. Add a faceted filter sidebar with checkboxes for phase_of_restoration, target_audience, region, and document_type — selecting a filter dims unmatched points. Use the design tokens in `globals.css`. Make it clean and dense, not flashy.

**2. The chat interface (Tab 2).**

> Open `app/src/components/ChatInterface.tsx`. It calls `/api/ask` (POST, body `{ question, mode }` where mode is "answer" or "cite") and streams the response back. The response is plain text with citations in the form `[ks_080]` inline. Render the streaming text. When citations appear, look up the corresponding doc's title from the corpus metadata (already loaded into a context) and render the citation as a clickable chip that opens the side panel with that doc's metadata. Add the Answer/Cite mode toggle at the top — it changes the API request and the response shape (Cite returns a bibliography, Answer returns prose).

**3. Track 2 metadata enrichment.**

> Open `ingestion/enrich.py`. It already has a stub function `enrich_document(doc_text, current_metadata)` that calls Claude Sonnet with a structured prompt to refine the document's metadata. Improve the prompt: it should produce a JSON object with refined `long_summary` (300–500 words, grounded in full doc text), refined `thematic_tags` (full vocabulary scan), refined `programs_referenced` and `frameworks_referenced`, refined `countries_covered` (all countries actually discussed, not just the front pages), refined `key_metrics_present` (matched against the controlled vocab), and refined `data_vintage` (with evidence). Output goes into a v7 workbook alongside the chunks.

**4. Eval improvements.**

> Open `eval/run_golden.py`. Currently it computes recall@k by checking whether retrieved chunks come from `expected_key_resource_ids`. Add: (a) MRR (mean reciprocal rank) across all questions, (b) per-phase breakdown, (c) latency p50/p95, (d) a "spot-check" mode where it prints the actual generated answer alongside the expected docs for human review.

---

## Notes on the architecture

**Why hybrid retrieval (dense + sparse) and not just vector?** Pure vector search misses exact-phrase queries ("ANR Alliance", "Initiative 20x20", specific author names). Sparse (BM25-like) catches those. Pinecone supports hybrid natively via sparse-dense indexes — see `ingestion/embed_index.py` for the index config.

**Why Voyage rerank?** A two-stage retrieval (initial recall over many candidates, then precise rerank of the top ~30) reliably beats single-stage retrieval for grounded RAG. Voyage's `rerank-2` is the model used; it's the same provider as embeddings, so one API key covers both.

**Why ~400-char chunks?** Matches Ask WRI's parameters (informed by their experience). Smaller chunks → finer-grained retrieval and tighter citations; the trade-off is more chunks per doc and more tokens at retrieval time, both of which are cheap. The 80-char overlap prevents semantic boundaries from cutting between chunks.

**Why is the metadata workbook separate from the index?** The workbook is the human-editable source of truth. The index is rebuilt from the workbook on each re-ingestion. This means you can fix metadata errors in the workbook (in Excel, by hand) and re-ingest, without losing edits. The workbook also doubles as the corpus map data source for the explorer and the eval anchor for the Golden Questions.

**Strict-with-graceful-fallback.** The system prompt in `lib/prompt.ts` instructs Claude to answer only from the retrieved chunks, cite by `[resource_id]` inline, and explicitly say "this is not in the indexed corpus" if the retrieved chunks don't contain the answer. The pattern is enforced by the prompt structure (we hand Claude only the retrieved chunks; nothing else); the prompt itself reinforces it.

---

## What's intentionally out of scope (for now)

- **Authentication.** The deployed app is publicly accessible. If you need access controls, add Vercel Password Protection or a Vercel-friendly auth provider (Clerk, Auth.js).
- **Multi-corpus support.** This kit assumes one corpus per Pinecone index. To run multiple corpora, deploy multiple Vercel projects pointing at separate Pinecone indexes.
- **Document-level access controls.** All retrieved chunks are visible to all users. If different users should see different documents, that's a tag-based filter in `/api/ask` plus an auth layer.
- **Conversation history.** The chat is single-turn (each question is independent). Multi-turn memory is a Claude Code task.

---

Built with the architecture worked out in conversation with the Restoration Intelligence team. See `Enable_Stocktake_v6.xlsx` for the worked-example metadata schema.
