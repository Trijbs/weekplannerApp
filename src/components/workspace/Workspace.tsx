"use client";

import { useState } from "react";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WidgetGrid } from "./WidgetGrid";
import { WidgetLibrary } from "./WidgetLibrary";
import { getAllWidgetDefinitions } from "./registry";
import type { WidgetType } from "./types";

function WorkspaceInner() {
  const { addWidget, isEditMode } = useWorkspace();
  const [showLibrary, setShowLibrary] = useState(false);
  const allWidgets = getAllWidgetDefinitions();

  const handleAddWidget = (type: WidgetType) => {
    const def = allWidgets.find((w) => w.type === type);
    if (def) {
      addWidget(type, { ...def.defaultConfig });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <WorkspaceHeader />

      <div className="relative min-h-[400px]">
        <WidgetGrid />

        {/* Floating add button — visible in edit mode */}
        {isEditMode && (
          <button
            type="button"
            onClick={() => setShowLibrary(true)}
            className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-colors hover:bg-blue-700"
            title="Widget toevoegen"
          >
            <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
          </button>
        )}
      </div>

      {showLibrary && (
        <WidgetLibrary
          widgets={allWidgets}
          onAddWidget={handleAddWidget}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  );
}

export function Workspace() {
  return (
    <WorkspaceProvider>
      <WorkspaceInner />
    </WorkspaceProvider>
  );
}
