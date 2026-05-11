"use client";

import { useState } from "react";
import CorpusExplorer from "@/components/CorpusExplorer";
import ChatInterface from "@/components/ChatInterface";

export default function Home() {
  const [citedIds, setCitedIds] = useState<Set<string>>(new Set());
  const [focusedDocId, setFocusedDocId] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [explanationTrigger] = useState(1);

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
        </div>
      </header>

      {/* Two-panel split — fills remaining viewport */}
      <div className="flex flex-1 min-h-0">
        {/* Left: visualization */}
        <div className="w-[58%] border-r border-stone-200 flex flex-col min-h-0">
          <CorpusExplorer
            citedIds={citedIds}
            focusedDocId={focusedDocId}
            onFocusDoc={setFocusedDocId}
            lastQuery={lastQuery}
          />
        </div>

        {/* Right: chat */}
        <div className="flex-1 flex flex-col min-h-0">
          <ChatInterface
            onCitations={(ids, question) => {
              setCitedIds(new Set(ids));
              setFocusedDocId(null);
              if (question) setLastQuery(question);
            }}
            onFocusDoc={setFocusedDocId}
            explanationTrigger={explanationTrigger}
          />
        </div>
      </div>
    </div>
  );
}
