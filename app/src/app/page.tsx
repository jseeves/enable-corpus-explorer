"use client";

import { useState } from "react";
import CorpusExplorer from "@/components/CorpusExplorer";
import ChatInterface from "@/components/ChatInterface";
import KnowledgeExplorer from "@/components/KnowledgeExplorer";
import SourcesPanel from "@/components/SourcesPanel";

interface CitationData {
  resource_id: string;
  title: string;
  page_num: number;
  score: number;
  excerpt: string;
  reason?: string | null;
}

type View = "explorer" | "knowledge";

export default function Home() {
  const [citedIds, setCitedIds] = useState<Set<string>>(new Set());
  const [citationsFull, setCitationsFull] = useState<CitationData[]>([]);
  const [focusedDocId, setFocusedDocId] = useState<string | null>(null);
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const [mapCollapsed, setMapCollapsed] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const [explanationTrigger] = useState(1);
  const [view, setView] = useState<View>("explorer");

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* Sticky header */}
      <header className="shrink-0 bg-white border-b border-stone-200 h-12 flex items-center">
        <div className="w-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-px h-5 bg-green-700" />
            <span className="font-semibold text-stone-900 text-[15px] tracking-tight">
              Restoration Intelligence: Enable Corpus Explorer
            </span>
            <span className="text-[11px] text-stone-400 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-full font-medium">
              v0 prototype
            </span>
          </div>
          {/* Tab toggle */}
          <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1">
            {(["explorer", "knowledge"] as View[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={
                  "px-3 py-1 rounded-md text-xs font-medium transition " +
                  (view === v
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-500 hover:text-stone-700")
                }
              >
                {v === "explorer" ? "Corpus Explorer" : "Knowledge Map"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {view === "explorer" ? (
          <>
            {/* Left: visualization (collapsible) */}
            <div className={`${mapCollapsed ? "w-8" : "w-[48%]"} transition-[width] duration-300 ease-in-out border-r border-stone-200 flex flex-col min-h-0 shrink-0 overflow-hidden`}>
              {mapCollapsed ? (
                <button
                  onClick={() => setMapCollapsed(false)}
                  title="Expand map"
                  className="flex-1 flex flex-col items-center justify-start pt-4 gap-3 w-full text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0">
                    <path d="M6 3l5 5-5 5" />
                  </svg>
                  <span className="text-[10px] uppercase tracking-widest font-medium text-stone-300" style={{ writingMode: "vertical-rl" }}>
                    Map
                  </span>
                </button>
              ) : (
                <CorpusExplorer
                  citedIds={citedIds}
                  focusedDocId={focusedDocId}
                  hoveredDocId={hoveredDocId}
                  onFocusDoc={setFocusedDocId}
                  onHoverDoc={setHoveredDocId}
                  onCollapse={() => setMapCollapsed(true)}
                  lastQuery={lastQuery}
                />
              )}
            </div>
            {/* Middle: chat */}
            <div className="flex-1 flex flex-col min-h-0 border-r border-stone-200">
              <ChatInterface
                onCitations={(ids, question) => {
                  setCitedIds(new Set(ids));
                  setFocusedDocId(null);
                  if (question) setLastQuery(question);
                }}
                onCitationsFull={setCitationsFull}
                onFocusDoc={setFocusedDocId}
                explanationTrigger={explanationTrigger}
              />
            </div>
            {/* Right: sources (widens when map is collapsed) */}
            <div className={`${mapCollapsed ? "w-96" : "w-72"} transition-[width] duration-300 ease-in-out flex flex-col min-h-0 shrink-0`}>
              <SourcesPanel
                citations={citationsFull}
                focusedDocId={focusedDocId}
                hoveredDocId={hoveredDocId}
                onHoverSource={setHoveredDocId}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <KnowledgeExplorer />
          </div>
        )}
      </div>
    </div>
  );
}
