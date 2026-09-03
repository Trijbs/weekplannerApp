"use client";

import type { DayTask, WeekAggregate } from "@/lib/db/types";
import { useWidgetData, fetchJson } from "../hooks/useWidgetData";
import type { WidgetProps } from "../types";

export function DeadlinesWidget({ instance }: WidgetProps) {
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

  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Amsterdam",
  });

  const withDeadlines = data.tasks
    .filter((t) => t.deadlineAt && t.status !== "klaar")
    .sort((a, b) => (a.deadlineAt ?? "").localeCompare(b.deadlineAt ?? ""));

  const overdue = withDeadlines.filter(
    (t) => t.deadlineAt!.slice(0, 10) < today,
  );
  const upcoming = withDeadlines.filter(
    (t) => t.deadlineAt!.slice(0, 10) >= today,
  );

  return (
    <div className="flex h-full flex-col gap-2">
      {overdue.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-red-500">
            Verlopen
          </span>
          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
            {overdue.length}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-1 overflow-auto">
        {overdue.map((task: DayTask) => (
          <div
            key={task.id}
            className="flex items-center gap-2 rounded-lg bg-red-50/50 px-2.5 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-slate-800">{task.title}</p>
              <p className="text-[11px] text-red-500">
                {task.deadlineAt!.slice(5, 10).replace("-", "/")}
              </p>
            </div>
          </div>
        ))}

        {upcoming.length > 0 && (
          <p className="pt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Aankomend
          </p>
        )}

        {upcoming.slice(0, 5).map((task: DayTask) => (
          <div
            key={task.id}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-slate-800">{task.title}</p>
              <p className="text-[11px] text-slate-400">
                {task.deadlineAt!.slice(5, 10).replace("-", "/")}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                task.priority === "hoog"
                  ? "bg-red-100 text-red-700"
                  : task.priority === "middel"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {task.priority}
            </span>
          </div>
        ))}

        {overdue.length === 0 && upcoming.length === 0 && (
          <p className="pt-4 text-center text-xs text-slate-400">
            Geen deadlines
          </p>
        )}
      </div>
    </div>
  );
}
