"use client";

import { useState } from "react";
import CorpusExplorer from "@/components/CorpusExplorer";
import ChatInterface from "@/components/ChatInterface";

type Tab = "explorer" | "chat";

export default function Home() {
  const [tab, setTab] = useState<Tab>("explorer");

  return (
    <div className="min-h-screen bg-stone-100">
      <div className="sticky top-0 z-50">
      {/* Global header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-7 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-px h-5 bg-green-700" />
            <span className="font-semibold text-stone-900 text-[15px] tracking-tight">
              Restoration Intelligence: Enable Corpus Explorer
            </span>
            <span className="text-[11px] text-stone-400 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-full font-medium">
              v0 prototype
            </span>
          </div>
          <p className="text-xs text-stone-400">
            powered by{" "}
            <span className="text-green-700 font-semibold">Restoration Works</span>
          </p>
        </div>
      </header>

      {/* Tab nav */}
      <div className="bg-white border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-7">
          <nav className="flex items-center gap-2 h-11">
            <TabLink active={tab === "explorer"} onClick={() => setTab("explorer")}>
              Corpus Map
            </TabLink>
            <TabLink active={tab === "chat"} onClick={() => setTab("chat")} showIcon>
              Ask the Corpus
            </TabLink>
          </nav>
        </div>
      </div>

      </div>
      {/* Content */}
      <main className="max-w-7xl mx-auto px-7 py-7">
        {tab === "explorer" && <CorpusExplorer />}
        {tab === "chat" && <ChatInterface />}
      </main>
    </div>
  );
}

function TabLink({
  active,
  children,
  onClick,
  showIcon = false,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  showIcon?: boolean;
}) {
  if (active) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1.5 px-3.5 py-1 text-sm font-medium text-stone-900 border border-stone-800 rounded-full transition"
      >
        {showIcon && <span className="text-green-600 text-xs leading-none">✦</span>}
        {children}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="px-3.5 py-1 text-sm text-stone-500 hover:text-stone-800 transition"
    >
      {children}
    </button>
  );
}
