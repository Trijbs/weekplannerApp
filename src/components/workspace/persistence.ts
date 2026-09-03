import type { WorkspaceState } from "./types";

const STORAGE_KEY = "weekplanner.workspace";

export function loadWorkspaceState(): WorkspaceState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const state = parsed as WorkspaceState;
    if (!Array.isArray(state.layouts) || !state.activeLayoutId) return null;

    return state;
  } catch {
    return null;
  }
}

export function saveWorkspaceState(state: WorkspaceState): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage vol of geblokkeerd.
  }
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export function debouncedSave(state: WorkspaceState): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveWorkspaceState(state), 500);
}
