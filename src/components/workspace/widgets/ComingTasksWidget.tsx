"use client";

import type { DayTask, WeekAggregate } from "@/lib/db/types";
import { useWidgetData, fetchJson } from "../hooks/useWidgetData";
import type { WidgetProps } from "../types";

export function ComingTasksWidget({ instance }: WidgetProps) {
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

  const upcoming = data.tasks
    .filter((t) => t.status !== "klaar")
    .sort((a, b) => {
      if (a.deadlineAt && b.deadlineAt) return a.deadlineAt.localeCompare(b.deadlineAt);
      if (a.deadlineAt) return -1;
      if (b.deadlineAt) return 1;
      return 0;
    })
    .slice(0, 8);

  const priorityBadge: Record<string, string> = {
    hoog: "bg-red-100 text-red-700",
    middel: "bg-blue-100 text-blue-700",
    laag: "bg-slate-100 text-slate-500",
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        Aankomend
      </p>

      <div className="min-h-0 flex-1 space-y-1 overflow-auto">
        {upcoming.length === 0 ? (
          <p className="pt-4 text-center text-xs text-slate-400">
            Geen komende taken
          </p>
        ) : (
          upcoming.map((task: DayTask) => {
            const isOverdue =
              task.deadlineAt && task.deadlineAt.slice(0, 10) < today;

            return (
              <div
                key={task.id}
                className={`flex items-start gap-2 rounded-lg px-2.5 py-2 ${
                  isOverdue ? "bg-red-50/50" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800">
                    {task.title}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">
                      {task.weekday.slice(0, 2)}
                    </span>
                    {task.deadlineAt && (
                      <span
                        className={`text-[11px] ${
                          isOverdue
                            ? "font-medium text-red-500"
                            : "text-slate-400"
                        }`}
                      >
                        {task.deadlineAt.slice(5, 10).replace("-", "/")}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    priorityBadge[task.priority] ?? "bg-slate-100 text-slate-500"
                  }`}
                >
                  {task.priority}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
