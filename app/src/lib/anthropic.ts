/**
 * Generation: send retrieved chunks to Claude with a strict-RAG system prompt.
 *
 * Two modes:
 *   - generateAnswer / streamAnswer: synthesizes a 2-4 sentence answer with inline [ks_xxx] citations
 *   - generateBibliography / streamBibliography: returns a Cite-mode bibliography list
 *
 * Both modes enforce the strict-with-graceful-fallback contract:
 *   - Answer ONLY from the retrieved chunks
 *   - Cite by [resource_id] inline
 *   - If chunks don't contain the answer, say so explicitly and stop
 */

import Anthropic from "@anthropic-ai/sdk";
import type { RetrievedChunk } from "./retrieval";
import { ANSWER_SYSTEM, CITE_SYSTEM, formatChunks } from "./prompt";

let client: Anthropic | null = null;
function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";

export async function generateAnswer(question: string, chunks: RetrievedChunk[]): Promise<string> {
  if (chunks.length === 0) {
    return "I don't have relevant information about this in the indexed corpus.";
  }
  const context = formatChunks(chunks);
  const userMessage = `QUESTION: ${question}\n\nRETRIEVED PASSAGES:\n${context}`;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 600,
    system: ANSWER_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

export async function generateBibliography(
  question: string,
  chunks: RetrievedChunk[],
): Promise<string> {
  if (chunks.length === 0) {
    return "No relevant documents in the indexed corpus.";
  }
  const context = formatChunks(chunks);
  const userMessage = `QUESTION: ${question}\n\nRETRIEVED PASSAGES:\n${context}`;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: CITE_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

export async function* streamAnswer(
  question: string,
  chunks: RetrievedChunk[],
): AsyncGenerator<string> {
  if (chunks.length === 0) {
    yield "I don't have relevant information about this in the indexed corpus.";
    return;
  }
  const context = formatChunks(chunks);
  const userMessage = `QUESTION: ${question}\n\nRETRIEVED PASSAGES:\n${context}`;

  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 600,
    system: ANSWER_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      yield chunk.delta.text;
    }
  }
}

export async function* streamBibliography(
  question: string,
  chunks: RetrievedChunk[],
): AsyncGenerator<string> {
  if (chunks.length === 0) {
    yield "No relevant documents in the indexed corpus.";
    return;
  }
  const context = formatChunks(chunks);
  const userMessage = `QUESTION: ${question}\n\nRETRIEVED PASSAGES:\n${context}`;

  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 1200,
    system: CITE_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      yield chunk.delta.text;
    }
  }
}
