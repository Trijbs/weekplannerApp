"use client";

import type { DayTask, WeekAggregate } from "@/lib/db/types";
import { useWidgetData, fetchJson } from "../hooks/useWidgetData";
import type { WidgetProps } from "../types";

export function PrioritiesWidget({ instance }: WidgetProps) {
  const { data, loading, error } = useWidgetData<WeekAggregate>(
    (signal) => fetchJson<WeekAggregate>("/api/weeks/current", signal),
    [],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-xs text-red-400">{error ?? "Geen data"}</p>;
  }

  const openTasks = data.tasks.filter((t) => t.status !== "klaar");

  const groups = {
    hoog: openTasks.filter((t) => t.priority === "hoog"),
    middel: openTasks.filter((t) => t.priority === "middel"),
    laag: openTasks.filter((t) => t.priority === "laag"),
  };

  const labels: Record<string, { label: string; color: string; bg: string }> = {
    hoog: {
      label: "Hoog",
      color: "text-red-600",
      bg: "bg-red-50",
    },
    middel: {
      label: "Middel",
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    laag: {
      label: "Laag",
      color: "text-slate-500",
      bg: "bg-slate-50",
    },
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {(Object.keys(groups) as Array<keyof typeof groups>).map((priority) => {
        const tasks = groups[priority];
        const meta = labels[priority];
        if (tasks.length === 0) return null;

        return (
          <div key={priority} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-medium uppercase tracking-wide ${meta.color}`}>
                {meta.label}
              </span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${meta.bg} ${meta.color}`}
              >
                {tasks.length}
              </span>
            </div>
            <div className="space-y-0.5">
              {tasks.slice(0, 3).map((task: DayTask) => (
                <p key={task.id} className="truncate text-sm text-slate-700">
                  {task.title}
                </p>
              ))}
              {tasks.length > 3 && (
                <p className="text-[11px] text-slate-400">
                  +{tasks.length - 3} meer
                </p>
              )}
            </div>
          </div>
        );
      })}

      {openTasks.length === 0 && (
        <p className="pt-4 text-center text-xs text-slate-400">
          Geen open taken
        </p>
      )}
    </div>
  );
}
