"use client";

import { useWidgetData, fetchJson } from "../hooks/useWidgetData";
import { weekdayFromIsoDate } from "@/lib/db/helpers";
import type { DayTask, WeekAggregate } from "@/lib/db/types";
import type { WidgetProps } from "../types";

function todayIso(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

export function TodoWidget({ instance }: WidgetProps) {
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

  const weekday = weekdayFromIsoDate(todayIso());
  const openTasks = data.tasks.filter(
    (t) => t.status !== "klaar" && t.weekday === weekday,
  );
  const allOpen = data.tasks.filter((t) => t.status !== "klaar");

  const tasksToShow = openTasks.length > 0 ? openTasks : allOpen;
  const label = openTasks.length > 0 ? "Vandaag" : "Deze week";

  const priorityColor: Record<string, string> = {
    hoog: "border-l-red-400 bg-red-50/50",
    middel: "border-l-blue-400 bg-blue-50/50",
    laag: "border-l-slate-300 bg-slate-50/50",
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          {tasksToShow.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-auto">
        {tasksToShow.length === 0 ? (
          <p className="pt-4 text-center text-xs text-slate-400">
            Geen open taken
          </p>
        ) : (
          tasksToShow.slice(0, 8).map((task: DayTask) => (
            <div
              key={task.id}
              className={`flex items-start gap-2.5 rounded-lg border-l-2 px-3 py-2 ${
                priorityColor[task.priority] ?? "border-l-slate-300"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-800">{task.title}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">
                    {task.weekday.slice(0, 2)}
                  </span>
                  {task.status === "bezig" && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      Bezig
                    </span>
                  )}
                </div>
              </div>
              <span
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                  task.status === "bezig"
                    ? "bg-amber-400"
                    : task.priority === "hoog"
                      ? "bg-red-400"
                      : task.priority === "middel"
                        ? "bg-blue-400"
                        : "bg-slate-300"
                }`}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
