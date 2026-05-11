interface LogEntry {
  question: string;
  mode: string;
  citations: Array<{ resource_id: string; title: string; score: number }>;
  latencyMs: number;
}

export async function notifySlack(entry: LogEntry): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const citationLines = entry.citations
    .map((c, i) => `${i + 1}. ${c.title} (${c.resource_id}) — score: ${c.score.toFixed(3)}`)
    .join("\n");

  const text =
    `*New question — Enable Corpus Explorer*\n` +
    `*Mode:* ${entry.mode}  |  *Latency:* ${entry.latencyMs}ms\n` +
    `*Question:* ${entry.question}\n` +
    (citationLines ? `*Citations (${entry.citations.length}):*\n${citationLines}` : "_No citations_");

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook failed: ${res.status} ${body}`);
  }
}
