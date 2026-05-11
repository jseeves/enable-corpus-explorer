"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Doc {
  resource_id: string;
  title: string;
  document_type: string;
  short_summary: string;
  umap_x: number;
  umap_y: number;
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

interface ClusterData {
  generated_at: string;
  k: number;
  doc_cluster_map: Record<string, number>;
  clusters: Cluster[];
}

function renderItemWithCitations(item: string): React.ReactNode {
  const parts = item.split(/(\[ks_\d+(?:,\s*ks_\d+)*\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[(ks_\d+(?:,\s*ks_\d+)*)\]$/);
    if (match) {
      return match[1].split(",").map((id, j) => (
        <span
          key={`${i}-${j}`}
          className="inline-block text-[9px] font-mono text-green-800 bg-green-50 border border-green-200 px-1 py-0.5 rounded mx-0.5 align-middle"
        >
          {id.trim()}
        </span>
      ));
    }
    return part;
  });
}

function wrapText(text: string, maxChars: number): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines.join("<br>");
}

export default function KnowledgeExplorer() {
  const [clusterData, setClusterData] = useState<ClusterData | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [plotReady, setPlotReady] = useState(false);
  const [docMap, setDocMap] = useState<Map<string, Doc>>(new Map());

  useEffect(() => {
    Promise.all([
      fetch("/clusters.json").then(r => r.json()),
      fetch("/api/corpus").then(r => r.json()),
    ]).then(([clusters, corpus]: [ClusterData, { docs: Doc[] }]) => {
      setClusterData(clusters);
      setDocs(corpus.docs);
      setDocMap(new Map(corpus.docs.map(d => [d.resource_id, d])));
      setTimeout(() => setPlotReady(true), 100);
    }).catch(console.error);
  }, []);

  if (!clusterData || !docs.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-stone-400">
        Loading knowledge map...
      </div>
    );
  }

  // ── Plotly traces ────────────────────────────────────────────────────────
  const traces: object[] = clusterData.clusters.map(cluster => {
    const clusterDocs = cluster.doc_ids.map(id => docMap.get(id)).filter(Boolean) as Doc[];
    const isActive = selected === null || selected === cluster.id;
    return {
      x: clusterDocs.map(d => d.umap_x),
      y: clusterDocs.map(d => d.umap_y),
      text: clusterDocs.map(d => wrapText(d.title, 52)),
      customdata: clusterDocs.map(d => cluster.id),
      mode: "markers",
      type: "scatter",
      name: cluster.label,
      showlegend: false,
      marker: {
        size: selected === cluster.id ? 12 : 9,
        color: cluster.color,
        opacity: isActive ? 0.85 : 0.08,
      },
      hoverinfo: "text",
    };
  });

  // Centroid label annotations
  const annotations = clusterData.clusters.map(cluster => ({
    x: cluster.centroid_x,
    y: cluster.centroid_y,
    text: cluster.label,
    showarrow: false,
    font: {
      size: selected === null || selected === cluster.id ? 10 : 8,
      color: selected === null || selected === cluster.id ? cluster.color : "#d4d0cb",
      family: "ui-sans-serif, system-ui, sans-serif",
    },
    bgcolor: "rgba(255,255,255,0.75)",
    borderpad: 3,
  }));

  return (
    <div className="flex h-full min-h-0">
      {/* ── Map ── */}
      <div className="w-[55%] border-r border-stone-200 relative flex flex-col min-h-0">
        <div className="shrink-0 border-b border-stone-100 px-4 py-2.5 flex items-center gap-2">
          <span className="text-green-600 text-xs leading-none">✦</span>
          <span className="text-sm font-semibold text-stone-900">Semantic Map</span>
          {selected !== null && (
            <button
              onClick={() => setSelected(null)}
              className="ml-auto text-xs text-stone-400 hover:text-stone-700 border border-stone-200 rounded-full px-2 py-0.5 transition"
            >
              Show all
            </button>
          )}
        </div>
        <div className="flex-1 relative min-h-0">
          <div className="absolute inset-0">
            <Plot
              data={traces as any}
              useResizeHandler
              layout={{
                autosize: true,
                margin: { l: 8, r: 8, t: 8, b: 8 },
                xaxis: { showgrid: false, zeroline: false, showticklabels: false },
                yaxis: { showgrid: false, zeroline: false, showticklabels: false },
                dragmode: "pan",
                hovermode: "closest",
                annotations,
                hoverlabel: {
                  bgcolor: "#1c1917",
                  bordercolor: "#1c1917",
                  font: { family: "ui-sans-serif, system-ui, sans-serif", size: 12, color: "#fafaf9" },
                  align: "left",
                },
                paper_bgcolor: "white",
                plot_bgcolor: "#fafaf9",
              }}
              config={{ displayModeBar: false, responsive: true, scrollZoom: true }}
              style={{ width: "100%", height: "100%" }}
              onClick={(e: any) => {
                const clusterId = e.points?.[0]?.customdata;
                if (clusterId === undefined) return;
                setSelected(prev => prev === clusterId ? null : clusterId);
              }}
              onLegendClick={() => false}
            />
          </div>
          {!plotReady && (
            <div className="absolute inset-0 bg-white flex items-center justify-center">
              <span className="text-sm text-stone-400">Loading map...</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Cluster cards ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-5 py-4 border-b border-stone-100">
          <p className="text-xs text-stone-400 uppercase tracking-widest mb-0.5">Knowledge Clusters</p>
          <h2 className="text-lg font-semibold text-stone-900">
            {clusterData.k} thematic areas identified
          </h2>
          <p className="text-xs text-stone-400 mt-0.5">
            Click a cluster to highlight it on the map.
          </p>
        </div>

        <div className="px-4 py-4 space-y-3">
          {clusterData.clusters.map(cluster => {
            const isActive = selected === null || selected === cluster.id;
            const isSelected = selected === cluster.id;
            return (
              <button
                key={cluster.id}
                onClick={() => setSelected(prev => prev === cluster.id ? null : cluster.id)}
                className={
                  "w-full text-left rounded-xl border transition-all " +
                  (isSelected
                    ? "border-stone-300 shadow-md bg-white"
                    : isActive
                    ? "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm"
                    : "border-stone-100 bg-stone-50 opacity-40")
                }
              >
                <div className="flex items-stretch">
                  {/* Color bar */}
                  <div
                    className="w-1 rounded-l-xl flex-shrink-0"
                    style={{ backgroundColor: cluster.color }}
                  />
                  <div className="flex-1 px-4 py-3 min-w-0">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold text-stone-900 leading-snug">
                        {cluster.label}
                      </span>
                      <span
                        className="shrink-0 text-[10px] font-medium rounded-full px-2 py-0.5 mt-0.5"
                        style={{ backgroundColor: cluster.color + "22", color: cluster.color }}
                      >
                        {cluster.doc_ids.length} doc{cluster.doc_ids.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {cluster.description && (
                      <p className="text-xs text-stone-500 leading-relaxed mb-2.5">
                        {cluster.description}
                      </p>
                    )}

                    {/* Key items */}
                    {cluster.key_items?.length > 0 && (
                      <ul className="space-y-1 mb-3">
                        {cluster.key_items.map((item, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="mt-[5px] w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: cluster.color }} />
                            <span className="text-[12px] text-stone-700 leading-snug">{renderItemWithCitations(item)}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Collapsible source documents */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setExpanded(prev => {
                          const next = new Set(prev);
                          next.has(cluster.id) ? next.delete(cluster.id) : next.add(cluster.id);
                          return next;
                        });
                      }}
                      className="text-[10px] text-stone-400 hover:text-stone-600 transition flex items-center gap-1"
                    >
                      <span>{expanded.has(cluster.id) ? "▾" : "▸"}</span>
                      {cluster.doc_ids.length} source document{cluster.doc_ids.length !== 1 ? "s" : ""}
                    </button>

                    {expanded.has(cluster.id) && (
                      <ul className="mt-2 space-y-2">
                        {cluster.doc_ids.map(id => {
                          const doc = docMap.get(id);
                          return doc ? (
                            <li key={id} className="space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-mono text-green-800 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded flex-shrink-0">
                                  {doc.resource_id}
                                </span>
                                <span className="text-[11px] font-medium text-stone-800 leading-snug">{doc.title}</span>
                              </div>
                              {doc.short_summary && (
                                <p className="text-[11px] text-stone-500 leading-relaxed pl-0.5">{doc.short_summary}</p>
                              )}
                            </li>
                          ) : null;
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <p className="px-5 pb-4 text-[10px] text-stone-300">
          Clusters generated {new Date(clusterData.generated_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
