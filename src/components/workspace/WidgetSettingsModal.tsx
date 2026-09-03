"use client";

import { useState } from "react";
import type { WidgetInstance } from "./types";
import { useWorkspace } from "./WorkspaceContext";
import { getWidgetDefinition } from "./registry";

interface WidgetSettingsModalProps {
  widget: WidgetInstance;
  onClose: () => void;
}

export function WidgetSettingsModal({
  widget,
  onClose,
}: WidgetSettingsModalProps) {
  const { updateWidgetConfig, updateWidgetPosition } = useWorkspace();
  const definition = getWidgetDefinition(widget.type);

  // Local editing state so we don't write on every keystroke.
  const [title, setTitle] = useState(
    typeof widget.config.title === "string" ? widget.config.title : "",
  );

  if (!definition) return null;

  const handleSave = () => {
    updateWidgetConfig(widget.id, { title });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">{definition.icon}</span>
            <h2 className="text-base font-semibold text-slate-900">
              {definition.name} instellingen
            </h2>
          </div>
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

        {/* Generic per-widget settings */}
        <div className="space-y-4 px-5 py-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-slate-600">Titel</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={definition.name}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {definition.description}
          </div>

          {/* Size info */}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              Afmeting: {widget.w} × {widget.h}
            </span>
            <span>
              Min: {definition.minSize.w} × {definition.minSize.h} • Max:{" "}
              {definition.maxSize.w} × {definition.maxSize.h}
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}
