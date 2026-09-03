"use client";

import { useCallback, useRef, useState } from "react";
import type { WidgetProps } from "../types";

const STORAGE_PREFIX = "weekplanner.notes.";

function getStorageKey(widgetId: string): string {
  return `${STORAGE_PREFIX}${widgetId}`;
}

export function NotesWidget({ instance }: WidgetProps) {
  const [text, setText] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(getStorageKey(instance.id)) ?? "";
  });
  const [saved, setSaved] = useState(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    (value: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      setSaved(false);
      saveTimeoutRef.current = setTimeout(() => {
        localStorage.setItem(getStorageKey(instance.id), value);
        setSaved(true);
      }, 500);
    },
    [instance.id],
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    persist(value);
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Notitie
        </p>
        <span
          className={`text-[11px] ${
            saved ? "text-slate-300" : "text-amber-500"
          }`}
        >
          {saved ? "Opgeslagen" : "Opslaan..."}
        </span>
      </div>

      <textarea
        value={text}
        onChange={handleChange}
        placeholder="Schrijf hier je notitie..."
        className="min-h-0 flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-800 placeholder-slate-300 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
      />
    </div>
  );
}
