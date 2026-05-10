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

interface Props {
  onCitations: (ids: string[]) => void;
  onFocusDoc: (id: string) => void;
}


export default function ChatInterface({ onCitations, onFocusDoc }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("answer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [corpus, setCorpus] = useState<Map<string, Doc>>(new Map());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load corpus for citation chip lookups
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
    onCitations([]); // clear citation highlights while new answer is in flight
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
            // Light up the visualization
            onCitations(evt.citations.map((c) => c.resource_id));
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

  // Clicking a citation chip focuses the dot on the visualization
  const openDoc = useCallback(
    (rid: string) => {
      onFocusDoc(rid);
    },
    [onFocusDoc],
  );

  const isEmpty = messages.length === 0 && !loading;
  const canSend = !loading && input.trim().length > 0;

  return (
    <div className="h-full flex flex-col">
      {/* Panel header */}
      <div className="shrink-0 border-b border-stone-200 px-6 py-3 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <span className="text-green-600 text-xs leading-none">✦</span>
          <span className="text-sm font-semibold text-stone-900">Ask the corpus</span>
        </div>
        {/* Mode selector */}
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

      {/* Messages / welcome state */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-5">
        {isEmpty ? (
          <WelcomeState />
        ) : (
          <>
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} onOpenDoc={openDoc} corpus={corpus} />
            ))}
            {loading && messages[messages.length - 1]?.content === "" && (
              <div className="text-sm text-stone-400 italic">Retrieving and generating...</div>
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
      <div className="shrink-0 border-t border-stone-100 px-6 py-4 bg-white">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading}
            rows={2}
            placeholder="Ask a question about the Enable corpus..."
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
          Your conversations are{" "}
          <strong className="font-medium">never</strong> used to train AI models.
        </p>
      </div>
    </div>
  );
}

// ── Welcome state ────────────────────────────────────────────────────────────

function WelcomeState() {
  return (
    <div className="flex flex-col justify-center h-full pb-16">
      <p className="text-xs text-stone-400 uppercase tracking-widest mb-2">
        Restoration Intelligence
      </p>
      <h2 className="text-xl font-semibold text-stone-800 leading-snug mb-2">
        What would you like to know?
      </h2>
      <p className="text-sm text-stone-400 leading-relaxed max-w-sm">
        Ask anything about the Enable corpus. Documents cited in each answer will light up on the map.
      </p>
    </div>
  );
}

// ── Message bubbles ──────────────────────────────────────────────────────────

function MessageBubble({
  message,
  onOpenDoc,
  corpus,
}: {
  message: Message;
  onOpenDoc: (rid: string) => void;
  corpus: Map<string, Doc>;
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
        <BibliographyView
          text={message.content}
          citations={message.citations || []}
          onOpenDoc={onOpenDoc}
        />
      ) : (
        <div className="font-serif text-stone-900 leading-relaxed text-[15px] whitespace-pre-wrap">
          {renderWithCitations(message.content, byId, onOpenDoc, corpus)}
        </div>
      )}
    </div>
  );
}

// ── Citation rendering ───────────────────────────────────────────────────────

function renderWithCitations(
  text: string,
  byId: Map<string, CitationData>,
  onOpenDoc: (rid: string) => void,
  corpus: Map<string, Doc>,
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
      // Use the document title if available, else fall back to resource_id
      const label = corpus.get(rid)?.title ?? rid;
      parts.push(
        <Citation
          key={`c-${key++}`}
          resourceId={rid}
          label={label}
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
    const entryMatch = trimmed.match(/^-\s*\[(ks_\d+)\]\s*[^\w]*(.*)/);
    if (entryMatch) {
      const rid = entryMatch[1];
      const rest = entryMatch[2];
      nodes.push(
        <div key={key++} className="flex gap-2 mb-1.5">
          <span className="flex-shrink-0">
            <Citation
              resourceId={rid}
              data={byId.get(rid)}
              onOpen={() => onOpenDoc(rid)}
            />
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
