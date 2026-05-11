#!/usr/bin/env tsx
/**
 * Regenerates key_items for each cluster with inline citations.
 * Reads the existing clusters.json (preserving cluster structure) and umap.json,
 * then rewrites key_items in place.
 *
 * Usage (from app/ directory):
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/enrich-key-items.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Doc {
  resource_id: string;
  title: string;
  short_summary: string;
}

interface Cluster {
  id: number;
  label: string;
  description: string;
  key_items: string[];
  color: string;
  centroid_x: number;
  centroid_y: number;
  doc_ids: string[];
}

interface ClusterFile {
  generated_at: string;
  k: number;
  doc_cluster_map: Record<string, number>;
  clusters: Cluster[];
}

async function enrichCluster(client: Anthropic, cluster: Cluster, docs: Doc[]): Promise<string[]> {
  const entries = docs.map(d =>
    `[${d.resource_id}] "${d.title}": ${d.short_summary || "(no summary)"}`
  ).join("\n");

  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{
      role: "user",
      content:
        `The following documents form the cluster "${cluster.label}" in a landscape restoration knowledge corpus.\n\n` +
        `Documents:\n${entries}\n\n` +
        `List the specific cases, instruments, mechanisms, tools, programs, or approaches discussed across these documents. ` +
        `Be concrete — name the actual things. After each item, cite the relevant document(s) using their ID in square brackets.\n\n` +
        `Format exactly: Item description [ks_xxx]\n` +
        `Or for multiple sources: Item description [ks_xxx, ks_yyy]\n\n` +
        `One item per line. No bullets, numbers, or headers. 8–14 items.`,
    }],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  return text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
}

async function main() {
  const clusterPath = join(__dirname, "../public/clusters.json");
  const clusterFile: ClusterFile = JSON.parse(readFileSync(clusterPath, "utf-8"));

  const { docs }: { docs: Doc[] } = JSON.parse(
    readFileSync(join(__dirname, "../public/umap.json"), "utf-8")
  );
  const docMap = new Map(docs.map(d => [d.resource_id, d]));

  console.log(`Enriching ${clusterFile.clusters.length} clusters with citations...`);
  const client = new Anthropic();

  const updated = await Promise.all(
    clusterFile.clusters.map(async cluster => {
      const clusterDocs = cluster.doc_ids.map(id => docMap.get(id)).filter(Boolean) as Doc[];
      const items = await enrichCluster(client, cluster, clusterDocs);
      console.log(`  "${cluster.label}": ${items.length} items`);
      return { ...cluster, key_items: items };
    })
  );

  clusterFile.clusters = updated;
  clusterFile.generated_at = new Date().toISOString();
  writeFileSync(clusterPath, JSON.stringify(clusterFile, null, 2));
  console.log(`\n✓ Wrote ${clusterPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
