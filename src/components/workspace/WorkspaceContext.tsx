"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  WidgetConfig,
  WidgetInstance,
  WidgetType,
  WorkspaceLayout,
  WorkspaceState,
} from "./types";
import { loadWorkspaceState, debouncedSave } from "./persistence";

function createId(): string {
  return `w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultLayout(): WorkspaceLayout {
  return {
    id: createId(),
    name: "Mijn dashboard",
    isDefault: true,
    widgets: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

interface WorkspaceContextValue {
  state: WorkspaceState;
  activeLayout: WorkspaceLayout;
  isEditMode: boolean;
  addWidget: (type: WidgetType, defaultConfig?: WidgetConfig) => void;
  removeWidget: (id: string) => void;
  updateWidgetPosition: (
    id: string,
    pos: { x: number; y: number; w: number; h: number },
  ) => void;
  updateWidgetConfig: (id: string, config: WidgetConfig) => void;
  toggleWidgetLock: (id: string) => void;
  duplicateWidget: (id: string) => void;
  setEditMode: (edit: boolean) => void;
  switchLayout: (layoutId: string) => void;
  createLayout: (name: string) => void;
  deleteLayout: (id: string) => void;
  renameLayout: (id: string, name: string) => void;
  resetLayout: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(() => {
    const saved = loadWorkspaceState();
    if (saved && saved.layouts.length > 0) return saved;

    const defaultLayout = createDefaultLayout();
    return {
      layouts: [defaultLayout],
      activeLayoutId: defaultLayout.id,
      isEditMode: false,
    };
  });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    debouncedSave(state);
  }, [state]);

  const activeLayout = useMemo(() => {
    return (
      state.layouts.find((l) => l.id === state.activeLayoutId) ??
      state.layouts[0]!
    );
  }, [state.layouts, state.activeLayoutId]);

  const addWidget = useCallback(
    (type: WidgetType, defaultConfig?: WidgetConfig) => {
      setState((prev) => {
        const layout = prev.layouts.find((l) => l.id === prev.activeLayoutId);
        if (!layout) return prev;

        const id = createId();
        const maxY = layout.widgets.reduce(
          (max, w) => Math.max(max, w.y + w.h),
          0,
        );

        const newWidget: WidgetInstance = {
          id,
          type,
          x: 0,
          y: maxY,
          w: 4,
          h: 3,
          locked: false,
          visible: true,
          config: defaultConfig ?? {},
        };

        const updatedLayout: WorkspaceLayout = {
          ...layout,
          widgets: [...layout.widgets, newWidget],
          updatedAt: new Date().toISOString(),
        };

        return {
          ...prev,
          layouts: prev.layouts.map((l) =>
            l.id === prev.activeLayoutId ? updatedLayout : l,
          ),
        };
      });
    },
    [],
  );

  const removeWidget = useCallback((id: string) => {
    setState((prev) => {
      const layout = prev.layouts.find((l) => l.id === prev.activeLayoutId);
      if (!layout) return prev;

      const updatedLayout: WorkspaceLayout = {
        ...layout,
        widgets: layout.widgets.filter((w) => w.id !== id),
        updatedAt: new Date().toISOString(),
      };

      return {
        ...prev,
        layouts: prev.layouts.map((l) =>
          l.id === prev.activeLayoutId ? updatedLayout : l,
        ),
      };
    });
  }, []);

  const updateWidgetPosition = useCallback(
    (id: string, pos: { x: number; y: number; w: number; h: number }) => {
      setState((prev) => {
        const layout = prev.layouts.find((l) => l.id === prev.activeLayoutId);
        if (!layout) return prev;

        const updatedLayout: WorkspaceLayout = {
          ...layout,
          widgets: layout.widgets.map((w) =>
            w.id === id ? { ...w, ...pos } : w,
          ),
          updatedAt: new Date().toISOString(),
        };

        return {
          ...prev,
          layouts: prev.layouts.map((l) =>
            l.id === prev.activeLayoutId ? updatedLayout : l,
          ),
        };
      });
    },
    [],
  );

  const updateWidgetConfig = useCallback((id: string, config: WidgetConfig) => {
    setState((prev) => {
      const layout = prev.layouts.find((l) => l.id === prev.activeLayoutId);
      if (!layout) return prev;

      const updatedLayout: WorkspaceLayout = {
        ...layout,
        widgets: layout.widgets.map((w) =>
          w.id === id ? { ...w, config: { ...w.config, ...config } } : w,
        ),
        updatedAt: new Date().toISOString(),
      };

      return {
        ...prev,
        layouts: prev.layouts.map((l) =>
          l.id === prev.activeLayoutId ? updatedLayout : l,
        ),
      };
    });
  }, []);

  const toggleWidgetLock = useCallback((id: string) => {
    setState((prev) => {
      const layout = prev.layouts.find((l) => l.id === prev.activeLayoutId);
      if (!layout) return prev;

      const updatedLayout: WorkspaceLayout = {
        ...layout,
        widgets: layout.widgets.map((w) =>
          w.id === id ? { ...w, locked: !w.locked } : w,
        ),
        updatedAt: new Date().toISOString(),
      };

      return {
        ...prev,
        layouts: prev.layouts.map((l) =>
          l.id === prev.activeLayoutId ? updatedLayout : l,
        ),
      };
    });
  }, []);

  const duplicateWidget = useCallback((id: string) => {
    setState((prev) => {
      const layout = prev.layouts.find((l) => l.id === prev.activeLayoutId);
      if (!layout) return prev;

      const original = layout.widgets.find((w) => w.id === id);
      if (!original) return prev;

      const maxY = layout.widgets.reduce(
        (max, w) => Math.max(max, w.y + w.h),
        0,
      );

      const duplicate: WidgetInstance = {
        ...original,
        id: createId(),
        x: 0,
        y: maxY,
        locked: false,
      };

      const updatedLayout: WorkspaceLayout = {
        ...layout,
        widgets: [...layout.widgets, duplicate],
        updatedAt: new Date().toISOString(),
      };

      return {
        ...prev,
        layouts: prev.layouts.map((l) =>
          l.id === prev.activeLayoutId ? updatedLayout : l,
        ),
      };
    });
  }, []);

  const setEditMode = useCallback((edit: boolean) => {
    setState((prev) => ({ ...prev, isEditMode: edit }));
  }, []);

  const switchLayout = useCallback((layoutId: string) => {
    setState((prev) => ({ ...prev, activeLayoutId: layoutId, isEditMode: false }));
  }, []);

  const createLayout = useCallback((name: string) => {
    const newLayout = createDefaultLayout();
    newLayout.name = name;
    newLayout.isDefault = false;

    setState((prev) => ({
      ...prev,
      layouts: [...prev.layouts, newLayout],
      activeLayoutId: newLayout.id,
      isEditMode: false,
    }));
  }, []);

  const deleteLayout = useCallback((id: string) => {
    setState((prev) => {
      if (prev.layouts.length <= 1) return prev;

      const filtered = prev.layouts.filter((l) => l.id !== id);
      const newActiveId =
        prev.activeLayoutId === id ? filtered[0]!.id : prev.activeLayoutId;

      return {
        ...prev,
        layouts: filtered,
        activeLayoutId: newActiveId,
        isEditMode: false,
      };
    });
  }, []);

  const renameLayout = useCallback((id: string, name: string) => {
    setState((prev) => ({
      ...prev,
      layouts: prev.layouts.map((l) =>
        l.id === id ? { ...l, name, updatedAt: new Date().toISOString() } : l,
      ),
    }));
  }, []);

  const resetLayout = useCallback(() => {
    setState((prev) => {
      const layout = prev.layouts.find((l) => l.id === prev.activeLayoutId);
      if (!layout) return prev;

      const updatedLayout: WorkspaceLayout = {
        ...layout,
        widgets: [],
        updatedAt: new Date().toISOString(),
      };

      return {
        ...prev,
        layouts: prev.layouts.map((l) =>
          l.id === prev.activeLayoutId ? updatedLayout : l,
        ),
      };
    });
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state,
      activeLayout,
      isEditMode: state.isEditMode,
      addWidget,
      removeWidget,
      updateWidgetPosition,
      updateWidgetConfig,
      toggleWidgetLock,
      duplicateWidget,
      setEditMode,
      switchLayout,
      createLayout,
      deleteLayout,
      renameLayout,
      resetLayout,
    }),
    [
      state,
      activeLayout,
      addWidget,
      removeWidget,
      updateWidgetPosition,
      updateWidgetConfig,
      toggleWidgetLock,
      duplicateWidget,
      setEditMode,
      switchLayout,
      createLayout,
      deleteLayout,
      renameLayout,
      resetLayout,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
