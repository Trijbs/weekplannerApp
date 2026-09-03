"use client";

import { useState } from "react";
import { useWorkspace } from "./WorkspaceContext";

export function WorkspaceHeader() {
  const {
    state,
    activeLayout,
    isEditMode,
    setEditMode,
    switchLayout,
    createLayout,
    deleteLayout,
    renameLayout,
    resetLayout,
  } = useWorkspace();

  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showNewLayout, setShowNewLayout] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [editingLayoutId, setEditingLayoutId] = useState<string | null>(null);
  const [editingLayoutName, setEditingLayoutName] = useState("");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {/* Layout selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowLayoutMenu(!showLayoutMenu)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h6.879a1.5 1.5 0 0 1 1.06.44l4.122 4.12A1.5 1.5 0 0 1 17 7.622V16.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 16.5v-13Z" />
            </svg>
            <span className="font-medium">{activeLayout.name}</span>
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>

          {showLayoutMenu && (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              {state.layouts.map((layout) => (
                <div key={layout.id} className="group flex items-center px-3 py-2">
                  {editingLayoutId === layout.id ? (
                    <input
                      type="text"
                      value={editingLayoutName}
                      onChange={(e) => setEditingLayoutName(e.target.value)}
                      onBlur={() => {
                        if (editingLayoutName.trim()) {
                          renameLayout(layout.id, editingLayoutName.trim());
                        }
                        setEditingLayoutId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (editingLayoutName.trim()) {
                            renameLayout(layout.id, editingLayoutName.trim());
                          }
                          setEditingLayoutId(null);
                        }
                        if (e.key === "Escape") setEditingLayoutId(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-blue-300 px-2 py-0.5 text-sm"
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        switchLayout(layout.id);
                        setShowLayoutMenu(false);
                      }}
                      className={`min-w-0 flex-1 truncate text-left text-sm ${
                        layout.id === state.activeLayoutId
                          ? "font-medium text-blue-600"
                          : "text-slate-700 hover:text-slate-900"
                      }`}
                    >
                      {layout.name}
                      {layout.isDefault && (
                        <span className="ml-1 text-xs text-slate-400">(standaard)</span>
                      )}
                    </button>
                  )}

                  <div className="ml-2 flex gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLayoutId(layout.id);
                        setEditingLayoutName(layout.name);
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      title="Naam wijzigen"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885l9.328-9.329a2.121 2.121 0 0 0-3-3L3.58 13.07a4 4 0 0 0-.885 1.343ZM17.5 3.5a2.121 2.121 0 0 1 3 3L11.5 15l-4 1 1-4 9.5-9.5Z" />
                      </svg>
                    </button>
                    {state.layouts.length > 1 && !layout.isDefault && (
                      <button
                        type="button"
                        onClick={() => {
                          deleteLayout(layout.id);
                          setShowLayoutMenu(false);
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        title="Verwijderen"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5Z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <div className="border-t border-slate-100 px-3 pt-2 pb-1">
                {showNewLayout ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Naam workspace..."
                      value={newLayoutName}
                      onChange={(e) => setNewLayoutName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newLayoutName.trim()) {
                          createLayout(newLayoutName.trim());
                          setNewLayoutName("");
                          setShowNewLayout(false);
                          setShowLayoutMenu(false);
                        }
                        if (e.key === "Escape") setShowNewLayout(false);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newLayoutName.trim()) {
                          createLayout(newLayoutName.trim());
                          setNewLayoutName("");
                          setShowNewLayout(false);
                          setShowLayoutMenu(false);
                        }
                      }}
                      className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-medium text-white"
                    >
                      Maak
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNewLayout(true)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-blue-600 hover:bg-blue-50"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                    </svg>
                    Nieuwe workspace
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Reset layout */}
        {isEditMode && activeLayout.widgets.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Reset layout
            </button>

            {showResetConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowResetConfirm(false)}>
                <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-base font-semibold text-slate-900">Reset layout?</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Je huidige Workspace-layout wordt teruggezet naar een leeg canvas.
                  </p>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(false)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Annuleren
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetLayout();
                        setShowResetConfirm(false);
                        setEditMode(false);
                      }}
                      className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Edit toggle */}
        <button
          type="button"
          onClick={() => setEditMode(!isEditMode)}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            isEditMode
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {isEditMode ? "Klaar" : "Bewerken"}
        </button>
      </div>
    </div>
  );
}
