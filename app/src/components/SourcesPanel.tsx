"use client";

import { useEffect, useRef, useState } from "react";

interface Doc {
  resource_id: string;
  title: string;
  document_type: string;
  organization: string;
  source_url: string | null;
  short_summary: string;
}

interface CitationData {
  resource_id: string;
  title: string;
  page_num: number;
  score: number;
  excerpt: string;
  reason?: string | null;
}

interface Props {
  citations: CitationData[];
  focusedDocId: string | null;
  hoveredDocId: string | null;
  onHoverSource: (id: string | null) => void;
}

const ORG_COLORS: Record<string, { bg: string; text: string }> = {
  "World Resources Institute": { bg: "bg-green-700", text: "text-white" },
  "WRI Brasil":                { bg: "bg-green-700", text: "text-white" },
  "FAO":                       { bg: "bg-blue-700",  text: "text-white" },
  "Initiative 20x20":          { bg: "bg-emerald-600", text: "text-white" },
  "ANR Alliance":              { bg: "bg-teal-700",  text: "text-white" },
};

function orgBadgeClasses(org: string) {
  const c = ORG_COLORS[org];
  return c ? `${c.bg} ${c.text}` : "bg-stone-200 text-stone-700";
}

function orgShortName(org: string) {
  const map: Record<string, string> = {
    "World Resources Institute": "WRI",
    "WRI Brasil": "WRI Brasil",
    "PROFOR / World Bank": "World Bank",
    "Peer-Reviewed Journal": "Journal",
    "Academic (arXiv)": "arXiv",
  };
  return map[org] ?? org;
}

function docTypeLabel(t: string) {
  return t.replace(/_/g, " ");
}

export default function SourcesPanel({ citations, focusedDocId, hoveredDocId, onHoverSource }: Props) {
  const [corpus, setCorpus] = useState<Map<string, Doc>>(new Map());

  useEffect(() => {
    fetch("/api/corpus")
      .then((r) => r.json())
      .then((d: { docs: Doc[] }) => {
        setCorpus(new Map(d.docs.map((doc) => [doc.resource_id, doc])));
      })
      .catch(() => {});
  }, []);

  const isEmpty = citations.length === 0;

  return (
    <div className="h-full flex flex-col border-l border-stone-200 bg-stone-50">
      {/* Header */}
      <div className="shrink-0 border-b border-stone-200 px-4 py-3 flex items-center gap-2 bg-white">
        <span className="text-sm font-semibold text-stone-900">Sources</span>
        {!isEmpty && (
          <span className="text-[11px] bg-green-100 text-green-800 font-medium px-1.5 py-0.5 rounded-full">
            {citations.length}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-3">
        {isEmpty ? (
          <EmptyState />
        ) : (
          (() => {
            const maxScore = Math.max(...citations.map((c) => c.score), 0.001);
            return citations.map((c, i) => {
              const doc = corpus.get(c.resource_id);
              return (
                <SourceCard
                  key={c.resource_id}
                  citation={c}
                  doc={doc ?? null}
                  relevance={c.score / maxScore}
                  entryIndex={i}
                  isHovered={hoveredDocId === c.resource_id}
                  isFocused={focusedDocId === c.resource_id}
                  onHover={() => onHoverSource(c.resource_id)}
                  onUnhover={() => onHoverSource(null)}
                />
              );
            });
          })()
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full pb-16 px-4 text-center">
      <div className="w-8 h-8 rounded-full border-2 border-dashed border-stone-300 flex items-center justify-center mb-3">
        <span className="text-stone-300 text-xs">✦</span>
      </div>
      <p className="text-xs text-stone-400 leading-relaxed">
        Sources cited in each answer will appear here with links to the original documents.
      </p>
    </div>
  );
}

const TEASER_LENGTH = 180;

function PassageSegments({ text }: { text: string }) {
  const segments = text.split(/\s*\[…\]\s*/);
  return (
    <div className="space-y-2">
      {segments.map((seg, i) => (
        <div key={i}>
          {i > 0 && (
            <div className="flex items-center gap-2 my-2">
              <div className="flex-1 border-t border-dashed border-stone-200" />
              <span className="text-[10px] text-stone-300 font-mono">gap in document</span>
              <div className="flex-1 border-t border-dashed border-stone-200" />
            </div>
          )}
          <p className="text-[12px] text-stone-600 leading-relaxed">{seg.trim()}</p>
        </div>
      ))}
    </div>
  );
}

function SourceCard({
  citation, doc, relevance, entryIndex, isHovered, isFocused, onHover, onUnhover,
}: {
  citation: CitationData;
  doc: Doc | null;
  relevance: number;
  entryIndex: number;
  isHovered: boolean;
  isFocused: boolean;
  onHover: () => void;
  onUnhover: () => void;
}) {
  const [passageOpen, setPassageOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const org = doc?.organization ?? "World Resources Institute";
  const title = doc?.title ?? citation.title;
  const docType = doc?.document_type ?? "";
  const sourceUrl = doc?.source_url ?? null;
  const excerpt = citation.excerpt ?? "";

  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isFocused]);

  const borderClass = isFocused
    ? "border-green-500 shadow-sm"
    : isHovered
    ? "border-green-300"
    : "border-stone-200";

  return (
    <div
      ref={cardRef}
      className={`source-card-enter relative bg-white rounded-lg border overflow-hidden transition-colors duration-150 ${borderClass}`}
      style={{ animationDelay: `${entryIndex * 60}ms` }}
      onMouseEnter={onHover}
      onMouseLeave={onUnhover}
    >
      {/* Relevance bar — left edge, opacity proportional to normalized score */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg bg-green-600 pointer-events-none"
        style={{ opacity: 0.25 + relevance * 0.65 }}
      />
      {/* Org + type badges */}
      <div className="px-3 pt-3 pb-2 flex items-center gap-1.5 flex-wrap">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${orgBadgeClasses(org)}`}>
          {orgShortName(org)}
        </span>
        {docType && (
          <span className="text-[10px] text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full capitalize">
            {docTypeLabel(docType)}
          </span>
        )}
      </div>

      {/* Title */}
      <div className="px-3 pb-2">
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-medium text-stone-900 leading-snug hover:text-green-700 hover:underline transition-colors"
          >
            {title}
          </a>
        ) : (
          <p className="text-[13px] font-medium text-stone-900 leading-snug">{title}</p>
        )}
      </div>

      {/* Why retrieved */}
      <div className="px-3 pb-3">
        <p className="text-[11px] font-bold text-green-700 mb-1">Why this source?</p>
        {citation.reason ? (
          <p className="text-[12px] text-stone-500 leading-relaxed">{citation.reason}</p>
        ) : (
          <p className="text-[12px] text-stone-300 italic">Analyzing relevance…</p>
        )}
      </div>

      {/* Footer: passage toggle + source link */}
      <div className="px-3 pb-3 border-t border-stone-100 pt-2.5 flex items-center justify-between">
        {excerpt ? (
          <button
            onClick={() => setPassageOpen(!passageOpen)}
            className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
          >
            {passageOpen ? "Hide passage ▲" : "View passage ▼"}
          </button>
        ) : <span />}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-green-700 hover:text-green-800 font-medium flex items-center gap-1"
          >
            View source
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" className="w-2.5 h-2.5">
              <path d="M6.5 1.5h4v4M10.5 1.5 5 7M3 2.5H1.5v9h9V10" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        )}
      </div>

      {/* Passage (hidden by default) */}
      {passageOpen && excerpt && (
        <div className="px-3 pb-3 border-t border-stone-100 pt-3">
          <p className="text-[10px] text-stone-400 uppercase tracking-wider mb-2">
            p.{citation.page_num} · Retrieved passage
          </p>
          <div className="bg-stone-50 rounded-md p-2.5">
            <PassageSegments text={excerpt} />
          </div>
        </div>
      )}
    </div>
  );
}
