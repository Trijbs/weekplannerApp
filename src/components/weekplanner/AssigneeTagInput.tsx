"use client";

import { useRef, useState } from "react";

type AssigneeTagInputProps = {
  assignees: string[];
  placeholder?: string;
  onChange: (assignees: string[]) => void;
};

export function AssigneeTagInput({ assignees, placeholder = "Naam teamlid + Enter", onChange }: AssigneeTagInputProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addAssignee(name: string) {
    const trimmed = name.trim();
    if (!trimmed || assignees.includes(trimmed)) return;
    onChange([...assignees, trimmed]);
    setDraft("");
  }

  function removeAssignee(name: string) {
    onChange(assignees.filter((a) => a !== name));
  }

  return (
    <div
      className="flex min-h-[2.5rem] flex-wrap gap-1.5 rounded-xl border border-slate-300 px-2 py-1.5 cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {assignees.map((name) => (
        <span
          key={name}
          className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
        >
          {name}
          <button
            type="button"
            aria-label={`Verwijder ${name}`}
            className="ml-0.5 text-blue-500 hover:text-blue-700"
            onClick={(event) => { event.stopPropagation(); removeAssignee(name); }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        placeholder={assignees.length === 0 ? placeholder : ""}
        className="min-w-[6rem] flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            addAssignee(draft);
          } else if (event.key === "Backspace" && !draft && assignees.length > 0) {
            onChange(assignees.slice(0, -1));
          }
        }}
      />
    </div>
  );
}
