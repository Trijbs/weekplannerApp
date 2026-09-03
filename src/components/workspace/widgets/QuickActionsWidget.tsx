"use client";

import type { WidgetProps } from "../types";

export function QuickActionsWidget({ instance }: WidgetProps) {
  return (
    <div className="flex h-full flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        Acties
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center transition-colors hover:border-blue-200 hover:bg-blue-50/50"
        >
          <span className="text-lg">📋</span>
          <span className="text-xs font-medium text-slate-700">+ Taak</span>
        </button>

        <button
          type="button"
          className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center transition-colors hover:border-blue-200 hover:bg-blue-50/50"
        >
          <span className="text-lg">⏱️</span>
          <span className="text-xs font-medium text-slate-700">+ Uren</span>
        </button>

        <button
          type="button"
          className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center transition-colors hover:border-blue-200 hover:bg-blue-50/50"
        >
          <span className="text-lg">📝</span>
          <span className="text-xs font-medium text-slate-700">+ Notitie</span>
        </button>

        <button
          type="button"
          className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center transition-colors hover:border-blue-200 hover:bg-blue-50/50"
        >
          <span className="text-lg">🧠</span>
          <span className="text-xs font-medium text-slate-700">Gedachte</span>
        </button>
      </div>
    </div>
  );
}
