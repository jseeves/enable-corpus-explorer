import { NextRequest, NextResponse } from "next/server";
import { hybridRetrieve, rerank, type RetrievedChunk } from "@/lib/retrieval";
import {
  generateAnswer,
  generateBibliography,
  streamAnswer,
  streamBibliography,
  rewriteQuery,
  type ConversationTurn,
} from "@/lib/anthropic";
import { logToAirtable } from "@/lib/airtable";
import { notifySlack } from "@/lib/slack";

export const runtime = "nodejs";
export const maxDuration = 60;

interface AskBody {
  question: string;
  mode?: "answer" | "cite";
  stream?: boolean;
  filters?: Record<string, string | string[]>;
  history?: ConversationTurn[];
}

export async function POST(req: NextRequest) {
  let body: AskBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { question, mode = "answer", stream: wantStream = false, filters = {}, history = [] } = body;
  if (!question || typeof question !== "string") {
    return NextResponse.json({ error: "Missing 'question'" }, { status: 400 });
  }

  try {
    const startTime = Date.now();
    const resolvedQuestion = await rewriteQuery(question, history.slice(-3));
    if (resolvedQuestion !== question) {
      console.log(`[rewrite] "${question}" → "${resolvedQuestion}"`);
    }
    const candidates = await hybridRetrieve(resolvedQuestion, { topK: 30, filters });
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
          let fullAnswer = "";
          try {
            for await (const delta of generator) {
              fullAnswer += delta;
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
            // Log after stream completes — fire and forget
            const logEntry = { question, mode, answer: fullAnswer, citations, latencyMs: Date.now() - startTime };
            logToAirtable(logEntry).catch((err) => console.error("[airtable]", err));
            notifySlack(logEntry).catch((err) => console.error("[slack]", err));
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

    // Log non-streaming path too
    const logEntry = { question, mode, answer, citations, latencyMs: Date.now() - startTime };
    logToAirtable(logEntry).catch((err) => console.error("[airtable]", err));
    notifySlack(logEntry).catch((err) => console.error("[slack]", err));

    return NextResponse.json({ mode, answer, citations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/ask error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function dedupeByResourceId(chunks: RetrievedChunk[]) {
  const grouped = new Map<string, RetrievedChunk[]>();
  for (const c of chunks) {
    if (!grouped.has(c.resource_id)) grouped.set(c.resource_id, []);
    grouped.get(c.resource_id)!.push(c);
  }

  return Array.from(grouped.entries()).map(([resource_id, group]) => {
    // Sort by chunk_id (e.g. ks_049_c0042) so text reads in document order
    group.sort((a, b) => a.chunk_id.localeCompare(b.chunk_id));
    const best = group[0];
    // Join all retrieved chunks for this doc, separated where non-adjacent
    const excerpt = group
      .map((c, i) => {
        if (i === 0) return c.text;
        const prevId = group[i - 1].chunk_id;
        const curId = c.chunk_id;
        const prevIdx = parseInt(prevId.split("_c")[1] ?? "0", 10);
        const curIdx = parseInt(curId.split("_c")[1] ?? "0", 10);
        return curIdx - prevIdx <= 2 ? c.text : `[…] ${c.text}`;
      })
      .join(" ");

    return {
      resource_id,
      title: (best.metadata?.title as string) || resource_id,
      page_num: best.page_num,
      score: best.score,
      excerpt,
    };
  });
}
