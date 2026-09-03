"use client";

import { WEEKDAYS } from "@/lib/db/types";
import type { DayTask, WeekAggregate } from "@/lib/db/types";
import { weekdayFromIsoDate } from "@/lib/db/helpers";
import { useWidgetData, fetchJson } from "../hooks/useWidgetData";
import type { WidgetProps } from "../types";

function todayIso(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

function currentWeekday() {
  return weekdayFromIsoDate(todayIso());
}

export function TodayWidget({ instance }: WidgetProps) {
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

  const weekday = currentWeekday();
  const todayTasks = data.tasks.filter((t) => t.weekday === weekday);
  const completed = todayTasks.filter((t) => t.status === "klaar").length;
  const total = todayTasks.length;
  const open = todayTasks.filter((t) => t.status !== "klaar");

  const todayEntries = data.hourEntries.filter((e) => e.dayDate === todayIso());
  const totalHours = todayEntries.reduce((sum, e) => sum + e.hoursDecimal, 0);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
          <p className="text-lg font-bold text-slate-900">{total}</p>
          <p className="text-[11px] text-slate-500">Taken</p>
        </div>
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center">
          <p className="text-lg font-bold text-emerald-600">{completed}</p>
          <p className="text-[11px] text-emerald-600">Klaar</p>
        </div>
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-center">
          <p className="text-lg font-bold text-blue-600">{totalHours.toFixed(1)}</p>
          <p className="text-[11px] text-blue-600">Uren</p>
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${(completed / total) * 100}%` }}
          />
        </div>
      )}

      {/* Open tasks */}
      <div className="min-h-0 flex-1 space-y-1 overflow-auto">
        {open.length === 0 ? (
          <p className="pt-2 text-center text-xs text-slate-400">
            {total === 0 ? "Geen taken gepland" : "Alles afgerond!"}
          </p>
        ) : (
          open.slice(0, 6).map((task: DayTask) => (
            <div
              key={task.id}
              className="flex items-start gap-2 rounded-lg px-2 py-1.5"
            >
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  task.status === "bezig"
                    ? "bg-amber-400"
                    : task.priority === "hoog"
                      ? "bg-red-400"
                      : task.priority === "middel"
                        ? "bg-blue-400"
                        : "bg-slate-300"
                }`}
              />
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-800">{task.title}</p>
                {task.info && (
                  <p className="truncate text-xs text-slate-400">{task.info}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
