"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { type ChatMode } from "./ModeToggle";
import Citation from "./Citation";

interface Doc {
  resource_id: string;
  title: string;
  document_type: string;
  phase_of_restoration: string;
  target_audience: string;
  region: string;
  publication_date: string;
  page_count: number;
  short_summary: string;
}

interface CitationData {
  resource_id: string;
  title: string;
  page_num: number;
  score: number;
  excerpt: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  mode?: ChatMode;
  citations?: CitationData[];
}

const SUGGESTED = [
  "What financial returns can investors expect from native-species reforestation?",
  "Which restoration techniques work best in dryland and arid ecosystems?",
  "How should local communities be engaged during restoration planning?",
  "What monitoring indicators does WRI recommend for restoration outcomes?",
  "How do blended finance mechanisms reduce risk for restoration investors?",
  "What are the key differences between passive and active restoration approaches?",
];

const THEME_CHIPS = ["Finance & investment", "Dryland restoration", "Community engagement", "Monitoring & evaluation", "Policy & governance"];

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("answer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [corpus, setCorpus] = useState<Map<string, Doc>>(new Map());
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/corpus")
      .then((r) => r.json())
      .then((d: { docs: Doc[] }) => {
        setCorpus(new Map(d.docs.map((doc) => [doc.resource_id, doc])));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (question?: string) => {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }]);
    setLoading(true);
    setMessages((m) => [...m, { role: "assistant", content: "", mode, citations: [] }]);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, mode, stream: true }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Request failed: ${res.status} ${errText.slice(0, 200)}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let evt: { type: string; text?: string; citations?: CitationData[]; message?: string };
          try {
            evt = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (evt.type === "delta" && evt.text) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, content: last.content + evt.text };
              return next;
            });
          } else if (evt.type === "citations" && evt.citations) {
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], citations: evt.citations };
              return next;
            });
          } else if (evt.type === "error") {
            throw new Error(evt.message || "Stream error");
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content === "") return prev.slice(0, -1);
        return prev;
      });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const openDoc = useCallback(
    (rid: string) => {
      const doc = corpus.get(rid);
      if (doc) setSelectedDoc(doc);
    },
    [corpus],
  );

  const isEmpty = messages.length === 0 && !loading;
  const canSend = !loading && input.trim().length > 0;

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="border-b border-stone-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-green-600 text-xs leading-none">✦</span>
          <span className="text-sm font-semibold text-stone-900">Ask the corpus</span>
        </div>
        {/* Mode selector — underline style */}
        <div className="flex items-center gap-4 text-sm">
          {(["answer", "cite"] as ChatMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={
                "pb-0.5 capitalize transition " +
                (mode === m
                  ? "text-stone-900 font-medium border-b-2 border-stone-800"
                  : "text-stone-400 hover:text-stone-600")
              }
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-12">
        {/* Chat area */}
        <div className="col-span-8 flex flex-col">
          {/* Message list / welcome state */}
          <div className="flex-1 min-h-[480px] max-h-[540px] overflow-y-auto px-6 py-5 space-y-5">
            {isEmpty ? (
              <WelcomeState onSuggest={(q) => send(q)} />
            ) : (
              <>
                {messages.map((m, i) => (
                  <MessageBubble key={i} message={m} onOpenDoc={openDoc} />
                ))}
                {loading && messages[messages.length - 1]?.content === "" && (
                  <div className="text-sm text-stone-400 italic">Retrieving and generating…</div>
                )}
                {error && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                    <span className="font-medium">Error:</span> {error}
                  </div>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input footer */}
          <div className="border-t border-stone-100 px-6 py-4">
            <div className="flex items-end gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={loading}
                rows={2}
                placeholder="Ask a question about restoration…"
                className="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-stone-400 placeholder:text-stone-400"
              />
              <button
                onClick={() => send()}
                disabled={!canSend}
                aria-label="Send"
                className={
                  "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition " +
                  (canSend
                    ? "bg-stone-800 hover:bg-stone-700 text-white"
                    : "bg-stone-200 text-stone-400 cursor-not-allowed")
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4 rotate-90"
                >
                  <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.28 4.486A.75.75 0 0 0 4.273 8.25h5.228a.75.75 0 0 1 0 1.5H4.273a.75.75 0 0 0-.714.526L2.28 14.762a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-[11px] text-stone-400">
              Your conversations are <strong className="font-medium">never</strong> used to train AI models.
            </p>
          </div>
        </div>

        {/* Side panel */}
        <aside className="col-span-4 border-l border-stone-100 px-5 py-5 bg-stone-50/40">
          {selectedDoc ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-mono text-green-800 bg-green-100 px-2 py-0.5 rounded">
                  {selectedDoc.resource_id}
                </span>
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="text-stone-400 hover:text-stone-600 text-lg leading-none transition"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <h3 className="font-semibold text-stone-900 leading-snug text-sm">
                {selectedDoc.title}
              </h3>
              {selectedDoc.short_summary && (
                <p className="text-xs text-stone-600 leading-relaxed border-l-2 border-stone-200 pl-3">
                  {selectedDoc.short_summary}
                </p>
              )}
              <dl className="text-xs space-y-1.5">
                <PanelField label="Type" value={selectedDoc.document_type} />
                <PanelField label="Phase" value={selectedDoc.phase_of_restoration} />
                <PanelField label="Audience" value={selectedDoc.target_audience} />
                <PanelField label="Region" value={selectedDoc.region} />
                <PanelField label="Date" value={selectedDoc.publication_date} />
                <PanelField label="Pages" value={String(selectedDoc.page_count || "")} />
              </dl>
            </div>
          ) : (
            <div className="text-xs text-stone-500 leading-relaxed space-y-4">
              <div>
                <p className="font-semibold text-stone-700 mb-1">About this system</p>
                <p>
                  Answers are grounded in the indexed corpus only. Inline{" "}
                  <span className="font-mono text-[10px] bg-stone-100 border border-stone-200 rounded px-1 py-0.5">
                    [ks_xxx]
                  </span>{" "}
                  citations open document details here.
                </p>
              </div>
              <div>
                <p className="font-semibold text-stone-700 mb-1">Modes</p>
                <p>
                  <strong className="text-stone-700">Answer</strong> — synthesizes a grounded
                  response with inline citations.
                </p>
                <p className="mt-1">
                  <strong className="text-stone-700">Cite</strong> — returns a bibliography
                  organized by relevance.
                </p>
              </div>
              <div>
                <p className="font-semibold text-stone-700 mb-1">If no answer</p>
                <p>The system says so explicitly rather than guessing. That&apos;s a feature.</p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function WelcomeState({ onSuggest }: { onSuggest: (q: string) => void }) {
  return (
    <div className="flex flex-col items-start gap-5 pt-2">
      <div>
        <p className="text-xs text-stone-400 uppercase tracking-widest mb-1">
          Restoration Intelligence
        </p>
        <h2 className="text-lg font-semibold text-stone-900 leading-snug">
          What would you like to know?
        </h2>
      </div>

      <div className="w-full space-y-2">
        {SUGGESTED.map((q) => (
          <button
            key={q}
            onClick={() => onSuggest(q)}
            className="w-full text-left text-sm text-stone-700 border border-stone-200 rounded-lg px-4 py-3 hover:border-stone-400 hover:bg-stone-50 transition"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="w-full flex items-center gap-3">
        <div className="flex-1 h-px bg-stone-200" />
        <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest whitespace-nowrap">
          Or explore by theme
        </span>
        <div className="flex-1 h-px bg-stone-200" />
      </div>

      <div className="flex flex-wrap gap-2">
        {THEME_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => onSuggest(chip)}
            className="text-xs text-stone-600 border border-stone-300 rounded-full px-3 py-1 hover:border-stone-500 hover:text-stone-800 transition"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}

function PanelField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="text-stone-400 w-14 flex-shrink-0">{label}</dt>
      <dd className="text-stone-700">{value}</dd>
    </div>
  );
}

function MessageBubble({
  message,
  onOpenDoc,
}: {
  message: Message;
  onOpenDoc: (rid: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-stone-100 border border-stone-200 rounded-xl rounded-tr-sm px-4 py-3 text-sm max-w-[85%]">
          {message.content}
        </div>
      </div>
    );
  }

  const byId = new Map((message.citations || []).map((c) => [c.resource_id, c]));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-green-600 text-[10px]">✦</span>
        <span className="text-[11px] text-stone-400 uppercase tracking-wide">
          {message.mode === "cite" ? "Bibliography" : "Answer"}
        </span>
      </div>
      {message.mode === "cite" ? (
        <div className="text-sm text-stone-900 leading-relaxed">
          <BibliographyView
            text={message.content}
            citations={message.citations || []}
            onOpenDoc={onOpenDoc}
          />
        </div>
      ) : (
        <div className="font-serif text-stone-900 leading-relaxed text-[15px] whitespace-pre-wrap">
          {renderWithCitations(message.content, byId, onOpenDoc)}
        </div>
      )}
    </div>
  );
}

function renderWithCitations(
  text: string,
  byId: Map<string, CitationData>,
  onOpenDoc: (rid: string) => void,
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\[((?:ks_\d+(?:,\s*)?)+)\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const ids = match[1].split(",").map((s) => s.trim());
    for (let i = 0; i < ids.length; i++) {
      const rid = ids[i];
      parts.push(
        <Citation
          key={`c-${key++}`}
          resourceId={rid}
          data={byId.get(rid)}
          onOpen={() => onOpenDoc(rid)}
        />,
      );
      if (i < ids.length - 1) parts.push(" ");
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function BibliographyView({
  text,
  citations,
  onOpenDoc,
}: {
  text: string;
  citations: CitationData[];
  onOpenDoc: (rid: string) => void;
}) {
  if (!text) return null;
  const byId = new Map(citations.map((c) => [c.resource_id, c]));
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      nodes.push(<div key={key++} className="h-2" />);
      continue;
    }
    if (/^(direct|background)/i.test(trimmed)) {
      nodes.push(
        <p key={key++} className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mt-3 mb-1">
          {trimmed.replace(/:$/, "")}
        </p>,
      );
      continue;
    }
    const entryMatch = trimmed.match(/^-\s*\[(ks_\d+)\]\s*[—–:\-]\s*(.*)/);
    if (entryMatch) {
      const rid = entryMatch[1];
      const rest = entryMatch[2];
      nodes.push(
        <div key={key++} className="flex gap-2 mb-1.5">
          <span className="flex-shrink-0">
            <Citation resourceId={rid} data={byId.get(rid)} onOpen={() => onOpenDoc(rid)} />
          </span>
          <span className="text-stone-700 text-sm">{rest}</span>
        </div>,
      );
      continue;
    }
    nodes.push(<p key={key++} className="text-sm text-stone-700">{trimmed}</p>);
  }

  return <>{nodes}</>;
}
