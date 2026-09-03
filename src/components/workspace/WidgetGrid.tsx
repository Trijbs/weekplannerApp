"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
} from "react-grid-layout";
import type { Layout, LayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useWorkspace } from "./WorkspaceContext";
import { WidgetContainer } from "./WidgetContainer";
import { WidgetSettingsModal } from "./WidgetSettingsModal";
import { getWidgetDefinition } from "./registry";
import type { WidgetConfig, WidgetInstance } from "./types";

const BREAKPOINTS = { lg: 1200, md: 768, sm: 0 };
const COLS = { lg: 12, md: 8, sm: 1 };
const ROW_HEIGHT = 80;
const MARGIN: [number, number] = [12, 12];

export function WidgetGrid() {
  const {
    activeLayout,
    isEditMode,
    updateWidgetPosition,
    updateWidgetConfig,
    removeWidget,
    duplicateWidget,
    toggleWidgetLock,
  } = useWorkspace();

  const { width, mounted, containerRef } = useContainerWidth({
    initialWidth: 1280,
  });

  const [settingsWidgetId, setSettingsWidgetId] = useState<string | null>(null);

  const layout = useMemo((): Layout => {
    return activeLayout.widgets
      .filter((w) => w.visible)
      .map(
        (w): LayoutItem => ({
          i: w.id,
          x: w.x,
          y: w.y,
          w: w.w,
          h: w.h,
          minW: w.minW ?? 2,
          minH: w.minH ?? 2,
          maxW: w.maxW,
          maxH: w.maxH,
          static: !isEditMode || w.locked,
        }),
      );
  }, [activeLayout.widgets, isEditMode]);

  const handleLayoutChange = (newLayout: Layout) => {
    for (const item of newLayout) {
      const widget = activeLayout.widgets.find((w) => w.id === item.i);
      if (widget && !widget.locked) {
        updateWidgetPosition(item.i, {
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
        });
      }
    }
  };

  if (activeLayout.widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 text-center">
        <span className="text-4xl">📊</span>
        <p className="mt-3 text-sm font-medium text-slate-600">
          Je workspace is leeg
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Klik op + Widget om te beginnen
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      {mounted && (
        <ResponsiveGridLayout
          width={width}
          className="layout"
          layouts={{ lg: layout, md: layout, sm: layout }}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          margin={MARGIN}
          compactor={verticalCompactor}
          dragConfig={{ handle: ".widget-drag-handle", enabled: isEditMode }}
          resizeConfig={{ enabled: isEditMode }}
          onLayoutChange={handleLayoutChange}
        >
          {activeLayout.widgets
            .filter((w) => w.visible)
            .map((widget) => {
              const definition = getWidgetDefinition(widget.type);
              if (!definition) return null;

              const WidgetComponent = definition.component;

              return (
                <div key={widget.id} className="widget-grid-item">
                  <WidgetContainer
                    instance={widget}
                    isEditMode={isEditMode}
                    onRemove={() => removeWidget(widget.id)}
                    onDuplicate={() => duplicateWidget(widget.id)}
                    onToggleLock={() => toggleWidgetLock(widget.id)}
                    onOpenSettings={() => setSettingsWidgetId(widget.id)}
                  >
                    <WidgetComponent
                      instance={widget}
                      isEditMode={isEditMode}
                      onUpdateConfig={(config: WidgetConfig) => {
                        updateWidgetConfig(widget.id, config);
                      }}
                    />
                  </WidgetContainer>
                </div>
              );
            })}
        </ResponsiveGridLayout>
      )}

      {settingsWidgetId
        ? (() => {
            const settingsWidget = activeLayout.widgets.find(
              (w) => w.id === settingsWidgetId,
            );
            if (!settingsWidget) return null;
            return (
              <WidgetSettingsModal
                widget={settingsWidget}
                onClose={() => setSettingsWidgetId(null)}
              />
            );
          })()
        : null}
    </div>
  );
}
