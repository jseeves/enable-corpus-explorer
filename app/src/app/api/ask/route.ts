import { NextRequest, NextResponse } from "next/server";
import { hybridRetrieve, rerank, type RetrievedChunk } from "@/lib/retrieval";
import {
  generateAnswer,
  generateBibliography,
  streamAnswer,
  streamBibliography,
} from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

interface AskBody {
  question: string;
  mode?: "answer" | "cite";
  stream?: boolean;
  filters?: Record<string, string | string[]>;
}

export async function POST(req: NextRequest) {
  let body: AskBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { question, mode = "answer", stream: wantStream = false, filters = {} } = body;
  if (!question || typeof question !== "string") {
    return NextResponse.json({ error: "Missing 'question'" }, { status: 400 });
  }

  try {
    const candidates = await hybridRetrieve(question, { topK: 30, filters });
    const topN = mode === "cite" ? 20 : 8;
    const reranked = await rerank(question, candidates, topN);
    const citations = dedupeByResourceId(reranked);

    if (wantStream) {
      const generator = mode === "cite"
        ? streamBibliography(question, reranked)
        : streamAnswer(question, reranked);

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const delta of generator) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "delta", text: delta })}\n\n`),
              );
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "citations", citations })}\n\n`),
            );
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`),
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`),
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Non-streaming JSON path (used by eval script)
    let answer: string;
    if (mode === "cite") {
      answer = await generateBibliography(question, reranked);
    } else {
      answer = await generateAnswer(question, reranked);
    }

    return NextResponse.json({ mode, answer, citations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/ask error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function dedupeByResourceId(chunks: RetrievedChunk[]) {
  const seen = new Set<string>();
  const out: Array<{
    resource_id: string;
    title: string;
    page_num: number;
    score: number;
    excerpt: string;
  }> = [];
  for (const c of chunks) {
    if (seen.has(c.resource_id)) continue;
    seen.add(c.resource_id);
    out.push({
      resource_id: c.resource_id,
      title: (c.metadata?.title as string) || c.resource_id,
      page_num: c.page_num,
      score: c.score,
      excerpt: c.text.slice(0, 200),
    });
  }
  return out;
}
