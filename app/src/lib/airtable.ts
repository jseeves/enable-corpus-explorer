/**
 * Non-blocking Airtable logger for Q&A evaluation.
 * Silently skips if AIRTABLE_API_KEY or AIRTABLE_BASE_ID are not set.
 *
 * Expected table name: "Questions"
 * Expected fields:
 *   Timestamp        (Single line text or Date)
 *   Question         (Long text)
 *   Mode             (Single line text)
 *   Answer           (Long text)
 *   Citation Count   (Number)
 *   Citations        (Long text  — one title per line)
 *   Citation IDs     (Single line text)
 *   Scores           (Single line text)
 *   Latency (ms)     (Number)
 *   Model            (Single line text)
 */

interface LogEntry {
  question: string;
  mode: string;
  answer: string;
  citations: Array<{
    resource_id: string;
    title: string;
    score: number;
  }>;
  latencyMs: number;
}

export async function logToAirtable(entry: LogEntry): Promise<void> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) return;

  const res = await fetch(`https://api.airtable.com/v0/${baseId}/Questions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        Timestamp: new Date().toISOString(),
        Question: entry.question,
        Mode: entry.mode,
        Answer: entry.answer.slice(0, 100_000),
        "Citation Count": entry.citations.length,
        Citations: entry.citations.map((c) => c.title).join("\n"),
        "Citation IDs": entry.citations.map((c) => c.resource_id).join(", "),
        Scores: entry.citations.map((c) => c.score.toFixed(3)).join(", "),
        "Latency (ms)": entry.latencyMs,
        Model: process.env.CLAUDE_MODEL || "unknown",
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable logging failed: ${res.status} ${text}`);
  }
}
