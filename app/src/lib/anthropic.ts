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
const REWRITE_MODEL = "claude-haiku-4-5-20251001";

export interface ConversationTurn {
  question: string;
  answer: string;
}

export async function rewriteQuery(
  question: string,
  history: ConversationTurn[],
): Promise<string> {
  if (history.length === 0) return question;

  const turns = history
    .map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`)
    .join("\n\n");

  const prompt =
    `Recent conversation:\n${turns}\n\n` +
    `New question: "${question}"\n\n` +
    `Rewrite the new question as a fully self-contained search query, resolving any pronouns or vague references (like "here", "this", "these", "it") using the conversation context. ` +
    `If the question is already self-contained, return it unchanged. Return ONLY the rewritten query, no explanation.`;

  const response = await getClient().messages.create({
    model: REWRITE_MODEL,
    max_tokens: 150,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  return block.type === "text" ? block.text.trim() : question;
}

export async function generateAnswer(question: string, chunks: RetrievedChunk[]): Promise<string> {
  if (chunks.length === 0) {
    return "I don't have relevant information about this in the indexed corpus.";
  }
  const context = formatChunks(chunks);
  const userMessage = `QUESTION: ${question}\n\nRETRIEVED PASSAGES:\n${context}`;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1500,
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
    max_tokens: 1500,
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

export async function generateReasons(
  question: string,
  docs: Array<{ resource_id: string; title: string; excerpt: string }>,
): Promise<Array<{ resource_id: string; reason: string }>> {
  if (docs.length === 0) return [];
  const docList = docs
    .map((d, i) => `${i + 1}. ${d.resource_id} | ${d.title}\n${d.excerpt.slice(0, 300)}`)
    .join("\n\n");

  const prompt =
    `Question: "${question}"\n\n` +
    `For each document below, write one short phrase explaining why it was retrieved for this question — not what it says, but what makes it relevant. ` +
    `Start with a strong verb. Focus on the connection to the question, not the document's content.\n\n` +
    `Good: "Quantifies government subsidy reform costs across three country case studies."\n` +
    `Bad: "Governments should remove subsidies that incentivize land degradation." (that's a summary, not a relevance explanation)\n\n` +
    `Under 20 words. Return ONLY a JSON array, no other text:\n[{"resource_id": "ks_001", "reason": "..."}, ...]\n\n` +
    `Documents:\n${docList}`;

  try {
    const response = await getClient().messages.create({
      model: REWRITE_MODEL,
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content[0];
    if (block.type !== "text") return [];
    const json = block.text.match(/\[[\s\S]*\]/)?.[0];
    if (!json) return [];
    return JSON.parse(json) as Array<{ resource_id: string; reason: string }>;
  } catch {
    return [];
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
