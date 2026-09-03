"use client";

import { useState } from "react";
import type { WidgetDefinition, WidgetType, WidgetCategory } from "./types";

interface WidgetLibraryProps {
  widgets: WidgetDefinition[];
  onAddWidget: (type: WidgetType) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  planning: "Planning",
  uren: "Uren",
  taken: "Taken",
  persoonlijk: "Persoonlijk",
};

const CATEGORY_ORDER: WidgetCategory[] = ["planning", "uren", "taken", "persoonlijk"];

export function WidgetLibrary({ widgets, onAddWidget, onClose }: WidgetLibraryProps) {
  const [search, setSearch] = useState("");

  const filtered = widgets.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.description.toLowerCase().includes(search.toLowerCase()),
  );

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: filtered.filter((w) => w.category === cat),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Widget toevoegen</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="px-5 pt-4">
          <input
            type="text"
            placeholder="Zoek widget..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            autoFocus
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {grouped.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">Geen widgets gevonden</p>
          )}

          {grouped.map((group) => (
            <div key={group.category} className="mb-5 last:mb-0">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                {group.label}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((widget) => (
                  <button
                    key={widget.type}
                    type="button"
                    onClick={() => {
                      onAddWidget(widget.type);
                      onClose();
                    }}
                    className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50"
                  >
                    <span className="mt-0.5 text-lg">{widget.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{widget.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">
                        {widget.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
