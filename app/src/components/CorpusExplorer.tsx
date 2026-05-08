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

const FACET_FIELDS: Array<{ key: keyof Doc; label: string }> = [
  { key: "document_type", label: "Document type" },
  { key: "phase_of_restoration", label: "Phase" },
  { key: "target_audience", label: "Audience" },
  { key: "region", label: "Region" },
];

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

export default function CorpusExplorer() {
  const [data, setData] = useState<CorpusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Doc | null>(null);
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  const [search, setSearch] = useState("");
  const [plotVisible, setPlotVisible] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    fetch("/api/corpus")
      .then((r) => {
        if (!r.ok) throw new Error(`Corpus load failed: ${r.status}`);
        return r.json();
      })
      .then((d: CorpusData) => {
        setData(d);
        setTimeout(() => setPlotVisible(true), 80);
      })
      .catch((e) => setError(e.message));
  }, []);

  const facetOptions = useMemo(() => {
    if (!data) return {};
    const out: Record<string, string[]> = {};
    for (const { key } of FACET_FIELDS) {
      const set = new Set<string>();
      for (const d of data.docs) {
        const v = d[key];
        if (v) set.add(String(v).split("|")[0].trim());
      }
      out[key] = Array.from(set).sort();
    }
    return out;
  }, [data]);

  const hasFilters = useMemo(
    () => Object.values(filters).some((s) => s.size > 0),
    [filters],
  );

  const searchTerm = search.trim().toLowerCase();
  const hasSearch = searchTerm.length > 0;
  const hasHighlight = hasFilters || hasSearch;

  // Combined filter + search matching
  const highlighted = useMemo(() => {
    if (!data || !hasHighlight) return null;
    const matched = new Set<string>();
    for (const doc of data.docs) {
      let passesFilter = true;
      if (hasFilters) {
        for (const [key, allowed] of Object.entries(filters)) {
          if (allowed.size === 0) continue;
          const v = String(doc[key as keyof Doc] || "").split("|")[0].trim();
          if (!allowed.has(v)) { passesFilter = false; break; }
        }
      }
      const passesSearch = hasSearch
        ? doc.title.toLowerCase().includes(searchTerm)
        : true;
      if (passesFilter && passesSearch) matched.add(doc.resource_id);
    }
    return matched;
  }, [data, filters, hasFilters, hasSearch, searchTerm]);

  const matchedCount = highlighted ? highlighted.size : (data?.n_docs ?? 0);


  const toggleFilter = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      const set = new Set(next[key] || []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      next[key] = set;
      return next;
    });
  };

  const clearAll = () => {
    setFilters({});
    setSearch("");
  };

  if (error) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Could not load the corpus map.</p>
        <p className="mt-1">{error}</p>
        <p className="mt-2 text-xs">
          Run the ingestion pipeline and copy <code>data/derived/umap.json</code> to{" "}
          <code>app/public/umap.json</code>.
        </p>
      </div>
    );
  }

  if (!data) {
    return <div className="text-sm text-stone-500">Loading corpus map...</div>;
  }

  const types = Array.from(
    new Set(data.docs.map((d) => d.document_type || "unknown")),
  ).sort();

  const traces = types.flatMap((t, ti) => {
    const color = PALETTE[ti % PALETTE.length];
    const docs = data.docs.filter((d) => (d.document_type || "unknown") === t);
    const makeHover = (d: Doc) => wrapText(d.title, 48);

    if (!hasHighlight) {
      return [{
        x: docs.map((d) => d.umap_x),
        y: docs.map((d) => d.umap_y),
        text: docs.map(makeHover),
        customdata: docs.map((d) => d.resource_id),
        mode: "markers" as const,
        type: "scatter" as const,
        name: t,
        marker: { size: 9, color, opacity: 0.82 },
        hoverinfo: "text" as const,
      }];
    }

    const matched = docs.filter((d) => highlighted!.has(d.resource_id));
    const dimmed = docs.filter((d) => !highlighted!.has(d.resource_id));
    const out = [];

    if (matched.length > 0) {
      out.push({
        x: matched.map((d) => d.umap_x),
        y: matched.map((d) => d.umap_y),
        text: matched.map(makeHover),
        customdata: matched.map((d) => d.resource_id),
        mode: "markers" as const,
        type: "scatter" as const,
        name: t,
        marker: { size: 9, color, opacity: 0.85 },
        hoverinfo: "text" as const,
      });
    }

    if (dimmed.length > 0) {
      out.push({
        x: dimmed.map((d) => d.umap_x),
        y: dimmed.map((d) => d.umap_y),
        text: dimmed.map(makeHover),
        customdata: dimmed.map((d) => d.resource_id),
        mode: "markers" as const,
        type: "scatter" as const,
        name: t,
        showlegend: false,
        marker: { size: 7, color, opacity: 0.07 },
        hoverinfo: "text" as const,
      });
    }

    return out;
  });

  // Selection ring
  if (selected) {
    traces.push({
      x: [selected.umap_x],
      y: [selected.umap_y],
      text: [wrapText(selected.title, 48)],
      customdata: [selected.resource_id],
      mode: "markers" as const,
      type: "scatter" as const,
      name: "_selected",
      showlegend: false,
      marker: {
        size: 18,
        color: "rgba(0,0,0,0)",
        opacity: 1,
        line: { color: "#1c1917", width: 2 },
      } as any,
      hoverinfo: "text" as const,
    } as any);
  }

  const hasAnyActive = hasHighlight || !!selected;

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="border-b border-stone-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-green-600 text-xs leading-none">✦</span>
          <span className="text-sm font-semibold text-stone-900">Corpus Map</span>
        </div>
        {hasAnyActive && (
          <button
            onClick={clearAll}
            className="text-[11px] text-stone-400 hover:text-stone-600 transition"
          >
            clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-12 gap-0">
        {/* Filter sidebar */}
        <aside className="col-span-2 border-r border-stone-100 px-4 py-5 space-y-5 bg-stone-50/40">
          <div className="text-[11px] text-stone-500 leading-relaxed border-b border-stone-100 pb-4">
            Each dot represents a document in the corpus. Positioning is preserved from embedding,
            which chunks documents and puts those chunks in 1024-dimension vector space.
            Hover or click to see metadata.
          </div>

          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-medium text-stone-700">
              Filters{" "}
              <span className="text-stone-400 font-normal">
                {hasHighlight ? `${matchedCount}/${data.n_docs}` : `${data.n_docs}`}
              </span>
            </h2>
          </div>

          {FACET_FIELDS.map(({ key, label }) => (
            <div key={key as string}>
              <h3 className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1.5">
                {label}
              </h3>
              <div className="space-y-0.5">
                {(facetOptions[key as string] || []).map((opt) => {
                  const checked = filters[key as string]?.has(opt) || false;
                  return (
                    <label
                      key={opt}
                      className={
                        "flex items-center gap-1.5 text-[11px] cursor-pointer rounded px-1 py-0.5 transition " +
                        (checked
                          ? "bg-green-50 text-green-900"
                          : "hover:bg-stone-100 text-stone-600")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFilter(key as string, opt)}
                        className="rounded accent-green-700 flex-shrink-0"
                      />
                      <span className="truncate leading-tight">{opt}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* Plot column */}
        <div className="col-span-7 flex flex-col">
          {/* Search bar */}
          <div className="px-4 pt-3 pb-2.5 border-b border-stone-100">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7 7 0 1 0 6.65 6.65a7 7 0 0 0 10 10Z" />
              </svg>
              <input
                type="text"
                placeholder="Search by title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-[12px] bg-stone-50 border border-stone-200 rounded-lg pl-8 pr-8 py-1.5 focus:outline-none focus:ring-1 focus:ring-stone-400 placeholder:text-stone-400"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-sm leading-none"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Plot with onboarding overlay */}
          <div className="relative">
            {!hasInteracted && (
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-white border border-stone-200 rounded-full px-3 py-1.5 text-[11px] text-stone-500 shadow-sm pointer-events-none select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                Click any dot to explore
              </div>
            )}
            <div
              className="transition-all duration-700 ease-out"
              style={{
                opacity: plotVisible ? 1 : 0,
                transform: plotVisible ? "scale(1)" : "scale(0.985)",
              }}
            >
              <Plot
                data={traces as any}
                layout={{
                  autosize: true,
                  height: 620,
                  margin: { l: 12, r: 12, t: 12, b: 12 },
                  xaxis: { showgrid: false, zeroline: false, showticklabels: false },
                  yaxis: { showgrid: false, zeroline: false, showticklabels: false },
                  legend: {
                    orientation: "h",
                    y: -0.02,
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
                config={{ displayModeBar: false, responsive: true, scrollZoom: true }}
                style={{ width: "100%" }}
                onClick={(e: any) => {
                  setHasInteracted(true);
                  const rid = e.points?.[0]?.customdata;
                  if (rid && rid !== selected?.resource_id) {
                    const doc = data.docs.find((d) => d.resource_id === rid);
                    if (doc) setSelected(doc);
                  } else {
                    setSelected(null);
                  }
                }}
                onLegendClick={(e: any) => {
                  const name = e.data?.[e.curveNumber]?.name;
                  if (name && name !== "_selected") {
                    toggleFilter("document_type", name);
                  }
                  return false;
                }}
                onHover={() => {
                  if (!hasInteracted) setHasInteracted(true);
                }}
              />
            </div>
          </div>
        </div>

        {/* Detail panel */}
        <aside className="col-span-3 border-l border-stone-100 bg-stone-50/30">
          {selected ? (
            <div className="sticky top-[88px] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-green-800 bg-green-100 px-2 py-0.5 rounded">
                  {selected.resource_id}
                </span>
                <button
                  onClick={() => setSelected(null)}
                  className="text-stone-400 hover:text-stone-700 text-lg leading-none transition"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <h3 className="font-semibold text-stone-900 leading-snug text-sm">
                {selected.title}
              </h3>

              <div className="flex flex-wrap gap-1">
                {selected.document_type && <Badge>{selected.document_type}</Badge>}
                {selected.phase_of_restoration && (
                  <Badge variant="green">{selected.phase_of_restoration}</Badge>
                )}
                {selected.region && <Badge variant="blue">{selected.region}</Badge>}
              </div>

              {selected.short_summary && (
                <p className="text-[11px] text-stone-600 leading-relaxed border-l-2 border-stone-200 pl-2.5">
                  {selected.short_summary}
                </p>
              )}

              <dl className="text-[11px] space-y-1.5">
                <MetaField label="Audience" value={selected.target_audience} />
                <MetaField label="Date" value={selected.publication_date} />
                <MetaField label="Pages" value={selected.page_count ? String(selected.page_count) : ""} />
              </dl>
            </div>
          ) : (
            <div className="p-4 pt-6 space-y-3 text-[11px] text-stone-500 leading-relaxed">
              <p>
                <strong className="text-stone-700">Hover</strong> a dot to see its title.
              </p>
              <p>
                <strong className="text-stone-700">Click</strong> to open full metadata here.
              </p>
              <p>
                <strong className="text-stone-700">Search</strong> by title to highlight matches.
              </p>
              <p>
                <strong className="text-stone-700">Click a legend label</strong> to filter by document type.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Badge({
  children,
  variant = "stone",
}: {
  children: React.ReactNode;
  variant?: "stone" | "green" | "blue";
}) {
  const styles = {
    stone: "bg-stone-100 text-stone-700",
    green: "bg-green-50 text-green-800",
    blue: "bg-sky-50 text-sky-800",
  };
  return (
    <span
      className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="text-stone-400 w-14 flex-shrink-0">{label}</dt>
      <dd className="text-stone-700">{value}</dd>
    </div>
  );
}
