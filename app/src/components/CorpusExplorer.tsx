"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Doc {
  resource_id: string;
  title: string;
  file_name: string;
  document_type: string;
  phase_of_restoration: string;
  target_audience: string;
  region: string;
  publication_date: string;
  page_count: number;
  short_summary: string;
  canonical_reference: string;
  umap_x: number;
  umap_y: number;
}

interface CorpusData {
  docs: Doc[];
  n_docs: number;
}

interface Props {
  citedIds: Set<string>;
  focusedDocId: string | null;
  onFocusDoc: (id: string | null) => void;
}

const PALETTE = [
  "#166534", "#0c4a6e", "#7c2d12", "#4c1d95",
  "#831843", "#0f3460", "#155e21", "#92400e",
];

function wrapText(text: string, maxChars: number): string {
  if (!text) return "";
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

export default function CorpusExplorer({ citedIds, focusedDocId, onFocusDoc }: Props) {
  const [data, setData] = useState<CorpusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [plotReady, setPlotReady] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    fetch("/api/corpus")
      .then((r) => {
        if (!r.ok) throw new Error(`Corpus load failed: ${r.status}`);
        return r.json();
      })
      .then((d: CorpusData) => {
        setData(d);
        setTimeout(() => setPlotReady(true), 100);
      })
      .catch((e) => setError(e.message));
  }, []);

  const searchTerm = search.trim().toLowerCase();
  const hasSearch = searchTerm.length > 0;
  const hasCitations = citedIds.size > 0;

  // Search-matched set (only used when no citations active)
  const searchMatched = useMemo(() => {
    if (!data || !hasSearch) return null;
    const matched = new Set<string>();
    for (const doc of data.docs) {
      if (doc.title.toLowerCase().includes(searchTerm)) matched.add(doc.resource_id);
    }
    return matched;
  }, [data, hasSearch, searchTerm]);

  const focusedDoc = useMemo(() => {
    if (!data || !focusedDocId) return null;
    return data.docs.find((d) => d.resource_id === focusedDocId) ?? null;
  }, [data, focusedDocId]);

  if (error) {
    return (
      <div className="m-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Could not load the corpus map.</p>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-stone-400">
        Loading corpus map...
      </div>
    );
  }

  const types = Array.from(
    new Set(data.docs.map((d) => d.document_type || "unknown")),
  ).sort();
  const typeIndex = (t: string) => types.indexOf(t);

  // ── Per-point opacity and size ────────────────────────────────────────────
  const dotOpacity = (d: Doc): number => {
    if (hasCitations) return citedIds.has(d.resource_id) ? 1.0 : 0.04;
    if (searchMatched) return searchMatched.has(d.resource_id) ? 0.88 : 0.06;
    return 0.82;
  };
  const dotSize = (d: Doc): number => {
    if (hasCitations && citedIds.has(d.resource_id)) return 13;
    return 9;
  };

  // ── Main dot traces (one per doc type) ───────────────────────────────────
  const traces: object[] = types.map((t, ti) => {
    const color = PALETTE[ti % PALETTE.length];
    const docs = data.docs.filter((d) => (d.document_type || "unknown") === t);
    return {
      x: docs.map((d) => d.umap_x),
      y: docs.map((d) => d.umap_y),
      text: docs.map((d) => wrapText(d.title, 52)),
      customdata: docs.map((d) => d.resource_id),
      mode: "markers",
      type: "scatter",
      name: t,
      marker: {
        size: docs.map(dotSize),
        color,
        opacity: docs.map(dotOpacity),
      },
      hoverinfo: "text",
    };
  });

  // ── Citation halo rings ───────────────────────────────────────────────────
  if (hasCitations) {
    const citedDocs = data.docs.filter((d) => citedIds.has(d.resource_id));
    if (citedDocs.length > 0) {
      const haloColors = citedDocs.map(
        (d) => PALETTE[typeIndex(d.document_type || "unknown") % PALETTE.length],
      );
      traces.push({
        x: citedDocs.map((d) => d.umap_x),
        y: citedDocs.map((d) => d.umap_y),
        text: citedDocs.map((d) => wrapText(d.title, 52)),
        customdata: citedDocs.map((d) => d.resource_id),
        mode: "markers",
        type: "scatter",
        name: "_halos",
        showlegend: false,
        marker: {
          size: 24,
          color: haloColors.map(() => "rgba(0,0,0,0)"),
          opacity: 1,
          line: { color: haloColors, width: 2 },
        },
        hoverinfo: "text",
      });
    }
  }

  // ── Focused doc selection ring ────────────────────────────────────────────
  if (focusedDoc) {
    traces.push({
      x: [focusedDoc.umap_x],
      y: [focusedDoc.umap_y],
      text: [wrapText(focusedDoc.title, 52)],
      customdata: [focusedDoc.resource_id],
      mode: "markers",
      type: "scatter",
      name: "_focused",
      showlegend: false,
      marker: {
        size: 30,
        color: "rgba(0,0,0,0)",
        opacity: 1,
        line: { color: "#1c1917", width: 2.5 },
      },
      hoverinfo: "text",
    });
  }

  return (
    <div className="flex flex-col h-full min-h-0">
        {/* Search bar + explain chip */}
        <div className="shrink-0 border-b border-stone-100 px-3 py-2 flex items-center gap-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-stone-400 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M21 21l-4.35-4.35m0 0A7 7 0 1 0 6.65 6.65a7 7 0 0 0 10 10Z" />
            </svg>
            <input
              type="text"
              placeholder="Search by title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-[12px] bg-stone-50 border border-stone-200 rounded-lg pl-7 pr-7 py-1.5 focus:outline-none focus:ring-1 focus:ring-stone-400 placeholder:text-stone-400"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Plot + overlays */}
        <div className="flex-1 relative min-h-0">
          {/* Plot fills the container */}
          <div className="absolute inset-0">
            <Plot
              data={traces as any}
              useResizeHandler={true}
              layout={{
                autosize: true,
                margin: { l: 8, r: 8, t: 8, b: 8 },
                xaxis: { showgrid: false, zeroline: false, showticklabels: false },
                yaxis: { showgrid: false, zeroline: false, showticklabels: false },
                dragmode: "pan",
                legend: {
                  orientation: "h",
                  y: -0.01,
                  font: {
                    size: 10,
                    family: "ui-sans-serif, system-ui, sans-serif",
                  },
                },
                hovermode: "closest",
                hoverlabel: {
                  bgcolor: "#1c1917",
                  bordercolor: "#1c1917",
                  font: {
                    family: "ui-sans-serif, system-ui, sans-serif",
                    size: 12,
                    color: "#fafaf9",
                  },
                  align: "left",
                },
                paper_bgcolor: "white",
                plot_bgcolor: "#fafaf9",
              }}
              config={{
                displayModeBar: false,
                responsive: true,
                scrollZoom: true,
              }}
              style={{ width: "100%", height: "100%" }}
              onClick={(e: any) => {
                setHasInteracted(true);
                const rid = e.points?.[0]?.customdata;
                if (!rid || rid.startsWith("_")) return;
                onFocusDoc(rid === focusedDocId ? null : rid);
              }}
              onLegendClick={() => false}
              onHover={() => {
                if (!hasInteracted) setHasInteracted(true);
              }}
            />
          </div>

          {/* Onboarding cue — disappears after first interaction */}
          {!hasInteracted && (
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-white border border-stone-200 rounded-full px-3 py-1.5 text-[11px] text-stone-500 shadow-sm pointer-events-none select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
              Click any dot to explore
            </div>
          )}

          {/* Citation mode badge */}
          {hasCitations && (
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-white border border-stone-200 rounded-full px-3 py-1.5 text-[11px] text-stone-600 shadow-sm select-none">
              <span className="text-green-600 text-[10px]">✦</span>
              {citedIds.size} source{citedIds.size !== 1 ? "s" : ""} cited in last answer
            </div>
          )}

          {/* Fade-in on load */}
          {!plotReady && (
            <div className="absolute inset-0 bg-white flex items-center justify-center">
              <span className="text-sm text-stone-400">Loading map...</span>
            </div>
          )}

          {/* Focused doc detail card — slides up from bottom */}
          {focusedDoc && (
            <div className="absolute bottom-0 left-0 right-0 z-20 bg-white border-t border-stone-200 shadow-lg px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-mono text-green-800 bg-green-100 px-1.5 py-0.5 rounded shrink-0">
                      {focusedDoc.resource_id}
                    </span>
                    {focusedDoc.document_type && (
                      <span className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded-full shrink-0">
                        {focusedDoc.document_type}
                      </span>
                    )}
                    {focusedDoc.phase_of_restoration && (
                      <span className="text-[10px] bg-green-50 text-green-800 px-1.5 py-0.5 rounded-full shrink-0">
                        {focusedDoc.phase_of_restoration}
                      </span>
                    )}
                    {focusedDoc.region && (
                      <span className="text-[10px] bg-sky-50 text-sky-800 px-1.5 py-0.5 rounded-full shrink-0">
                        {focusedDoc.region}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-stone-900 leading-snug mb-1.5">
                    {focusedDoc.title}
                  </h3>
                  {focusedDoc.short_summary && (
                    <p className="text-[11px] text-stone-500 leading-relaxed line-clamp-2">
                      {focusedDoc.short_summary}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onFocusDoc(null)}
                  className="text-stone-400 hover:text-stone-700 text-xl leading-none mt-0.5 shrink-0 transition"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}
