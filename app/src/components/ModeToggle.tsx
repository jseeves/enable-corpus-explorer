"use client";

export type ChatMode = "answer" | "cite";

interface Props {
  mode: ChatMode;
  onChange: (m: ChatMode) => void;
}

export default function ModeToggle({ mode, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Response mode"
      className="inline-flex bg-stone-100 rounded p-0.5 text-xs"
    >
      <Option active={mode === "answer"} onClick={() => onChange("answer")}>
        Answer
      </Option>
      <Option active={mode === "cite"} onClick={() => onChange("cite")}>
        Cite
      </Option>
    </div>
  );
}

function Option({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={
        "px-3 py-1 rounded transition " +
        (active
          ? "bg-white text-stone-900 shadow-sm"
          : "text-stone-500 hover:text-stone-700")
      }
    >
      {children}
    </button>
  );
}
