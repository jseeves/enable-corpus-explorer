#!/usr/bin/env tsx
/**
 * One-time script: cluster the corpus by UMAP position, label clusters via Claude Haiku,
 * and write app/public/clusters.json.
 *
 * Usage (from app/ directory):
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/generate-clusters.ts
 *
 * Re-run whenever the corpus changes.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Doc {
  resource_id: string;
  title: string;
  document_type: string;
  phase_of_restoration: string;
  target_audience: string;
  region: string;
  short_summary: string;
  umap_x: number;
  umap_y: number;
}

type Point = [number, number];

function dist2(a: Point, b: Point): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function kmeansInit(points: Point[], k: number): Point[] {
  const centroids: Point[] = [points[Math.floor(Math.random() * points.length)]];
  while (centroids.length < k) {
    const dists = points.map(p => Math.min(...centroids.map(c => dist2(p, c))));
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < points.length; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push(points[i]); break; }
    }
    if (centroids.length < k) centroids.push(points[Math.floor(Math.random() * points.length)]);
  }
  return centroids.slice(0, k);
}

function runKmeans(points: Point[], k: number, runs = 8): { labels: number[]; centroids: Point[] } {
  let best = { labels: [] as number[], centroids: [] as Point[], inertia: Infinity };
  for (let run = 0; run < runs; run++) {
    let centroids = kmeansInit(points, k);
    let labels = new Array(points.length).fill(0);
    for (let iter = 0; iter < 300; iter++) {
      const newLabels = points.map(p => {
        let minD = Infinity, minK = 0;
        for (let j = 0; j < k; j++) {
          const d = dist2(p, centroids[j]);
          if (d < minD) { minD = d; minK = j; }
        }
        return minK;
      });
      if (newLabels.every((l, i) => l === labels[i])) break;
      labels = newLabels;
      centroids = Array.from({ length: k }, (_, j) => {
        const pts = points.filter((_, i) => labels[i] === j);
        if (!pts.length) return centroids[j];
        return [
          pts.reduce((s, p) => s + p[0], 0) / pts.length,
          pts.reduce((s, p) => s + p[1], 0) / pts.length,
        ] as Point;
      });
    }
    const inertia = points.reduce((s, p, i) => s + dist2(p, centroids[labels[i]]), 0);
    if (inertia < best.inertia) best = { labels, centroids, inertia };
  }
  return best;
}

function silhouetteScore(points: Point[], labels: number[], k: number): number {
  const scores = points.map((p, i) => {
    const myCluster = labels[i];
    const same = points.filter((_, j) => j !== i && labels[j] === myCluster);
    if (!same.length) return 0;
    const a = same.reduce((s, q) => s + Math.sqrt(dist2(p, q)), 0) / same.length;
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === myCluster) continue;
      const other = points.filter((_, j) => labels[j] === c);
      if (!other.length) continue;
      const avg = other.reduce((s, q) => s + Math.sqrt(dist2(p, q)), 0) / other.length;
      b = Math.min(b, avg);
    }
    return (b - a) / Math.max(a, b);
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

const COLORS = [
  "#166534", "#0c4a6e", "#7c2d12", "#4c1d95",
  "#065f46", "#92400e", "#0f3460", "#831843",
  "#1e3a5f", "#3d1a78",
];

async function labelCluster(client: Anthropic, docs: Doc[], idx: number) {
  const entries = docs.slice(0, 10).map((d, i) =>
    `${i + 1}. "${d.title}": ${d.short_summary || "(no summary)"}`
  ).join("\n");

  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 160,
    messages: [{
      role: "user",
      content:
        `These ${docs.length} documents form a thematic cluster in a landscape restoration knowledge corpus.\n\n` +
        `Documents:\n${entries}\n\n` +
        `Give this cluster:\n` +
        `1. A concise label (3–6 words, title case) capturing its core theme\n` +
        `2. A single sentence describing what knowledge this cluster represents\n\n` +
        `Respond exactly:\nLABEL: ...\nDESCRIPTION: ...`,
    }],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  return {
    label: text.match(/LABEL:\s*(.+)/)?.[1]?.trim() ?? `Cluster ${idx + 1}`,
    description: text.match(/DESCRIPTION:\s*(.+)/)?.[1]?.trim() ?? "",
  };
}

async function extractKeyItems(client: Anthropic, docs: Doc[], clusterLabel: string): Promise<string[]> {
  const entries = docs.map((d, i) =>
    `${i + 1}. "${d.title}": ${d.short_summary || "(no summary)"}`
  ).join("\n");

  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [{
      role: "user",
      content:
        `The following documents are grouped under the theme "${clusterLabel}" in a landscape restoration knowledge corpus.\n\n` +
        `Documents:\n${entries}\n\n` +
        `List the specific cases, examples, instruments, mechanisms, or approaches that are actually discussed across these documents. ` +
        `Be concrete and named — not general categories, but the actual things: specific programs, tools, methods, policies, or examples. ` +
        `One item per line. No bullets, numbers, or headers. 8–14 items.`,
    }],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  return text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
}

async function main() {
  const { docs }: { docs: Doc[] } = JSON.parse(
    readFileSync(join(__dirname, "../public/umap.json"), "utf-8")
  );
  console.log(`Loaded ${docs.length} documents`);

  const points: Point[] = docs.map(d => [d.umap_x, d.umap_y]);

  // Find optimal k (silhouette score, k=4–10)
  console.log("\nFinding optimal cluster count...");
  let bestK = 6, bestScore = -1;
  for (let k = 4; k <= 10; k++) {
    const { labels } = runKmeans(points, k, 5);
    const score = silhouetteScore(points, labels, k);
    const marker = score > bestScore ? " ◀ best so far" : "";
    console.log(`  k=${k}  silhouette=${score.toFixed(3)}${marker}`);
    if (score > bestScore) { bestScore = score; bestK = k; }
  }
  console.log(`\nUsing k=${bestK} (silhouette=${bestScore.toFixed(3)})`);

  const { labels, centroids } = runKmeans(points, bestK, 10);

  // Group docs by cluster, sorted by proximity to centroid
  const clusterDocs: Doc[][] = Array.from({ length: bestK }, (_, i) =>
    docs
      .filter((_, j) => labels[j] === i)
      .sort((a, b) => dist2([a.umap_x, a.umap_y], centroids[i]) - dist2([b.umap_x, b.umap_y], centroids[i]))
  );

  // Label and extract key items via Haiku (parallel)
  console.log("\nLabeling clusters and extracting key items...");
  const client = new Anthropic();
  const labelResults = await Promise.all(clusterDocs.map((d, i) => labelCluster(client, d, i)));
  labelResults.forEach((r, i) => console.log(`  Cluster ${i}: "${r.label}"`));

  console.log("\nExtracting key items...");
  const keyItemResults = await Promise.all(
    clusterDocs.map((d, i) => extractKeyItems(client, d, labelResults[i].label))
  );
  keyItemResults.forEach((items, i) => console.log(`  Cluster ${i}: ${items.length} items`));

  const clusters = clusterDocs.map((docList, i) => ({
    id: i,
    label: labelResults[i].label,
    description: labelResults[i].description,
    key_items: keyItemResults[i],
    color: COLORS[i % COLORS.length],
    centroid_x: centroids[i][0],
    centroid_y: centroids[i][1],
    doc_ids: docList.map(d => d.resource_id),
  }));

  const output = {
    generated_at: new Date().toISOString(),
    k: bestK,
    doc_cluster_map: Object.fromEntries(docs.map((d, i) => [d.resource_id, labels[i]])),
    clusters,
  };

  const outPath = join(__dirname, "../public/clusters.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✓ Wrote ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
