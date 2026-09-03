"use client";

import type { ReactNode } from "react";
import type { WidgetInstance } from "./types";
import { WidgetMenu } from "./WidgetMenu";
import { getWidgetDefinition } from "./registry";

interface WidgetContainerProps {
  instance: WidgetInstance;
  isEditMode: boolean;
  children: ReactNode;
  onRemove: () => void;
  onDuplicate: () => void;
  onToggleLock: () => void;
  onOpenSettings: () => void;
}

export function WidgetContainer({
  instance,
  isEditMode,
  children,
  onRemove,
  onDuplicate,
  onToggleLock,
  onOpenSettings,
}: WidgetContainerProps) {
  const definition = getWidgetDefinition(instance.type);
  const title =
    typeof instance.config.title === "string" && instance.config.title.trim()
      ? instance.config.title
      : definition?.name ?? "";

  return (
    <div
      className={`group flex h-full flex-col overflow-hidden rounded-2xl border bg-white transition-shadow ${
        isEditMode
          ? "border-blue-200 shadow-sm hover:shadow-md"
          : "border-slate-200 shadow-sm"
      } ${instance.locked && isEditMode ? "ring-2 ring-blue-100" : ""}`}
    >
      {/* Header — drag handle */}
      <div
        className={`flex items-center justify-between px-4 py-2.5 ${
          isEditMode ? "cursor-grab active:cursor-grabbing" : ""
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {isEditMode && (
            <span className="select-none text-slate-300" title="Sleep om te verplaatsen">
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="5" cy="3" r="1" />
                <circle cx="11" cy="3" r="1" />
                <circle cx="5" cy="8" r="1" />
                <circle cx="11" cy="8" r="1" />
                <circle cx="5" cy="13" r="1" />
                <circle cx="11" cy="13" r="1" />
              </svg>
            </span>
          )}
          <span className="mr-1 shrink-0 text-sm">{definition?.icon}</span>
          <span className="truncate text-sm font-semibold text-slate-800">{title}</span>
          {instance.locked && isEditMode && (
            <span className="text-blue-400" title="Vergrendeld">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          )}
        </div>

        {/* Menu — visible on hover or in edit mode */}
        <div
          className={`transition-opacity ${
            isEditMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <WidgetMenu
            widgetId={instance.id}
            isLocked={instance.locked}
            onRemove={onRemove}
            onDuplicate={onDuplicate}
            onToggleLock={onToggleLock}
            onOpenSettings={onOpenSettings}
          />
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {children}
      </div>
    </div>
  );
}
