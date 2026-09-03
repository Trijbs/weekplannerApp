"use client";

import { WEEKDAYS } from "@/lib/db/types";
import type { DayTask, WeekAggregate } from "@/lib/db/types";
import { useWidgetData, fetchJson } from "../hooks/useWidgetData";
import type { WidgetProps } from "../types";

const SHORT_DAYS: Record<string, string> = {
  maandag: "Ma",
  dinsdag: "Di",
  woensdag: "Wo",
  donderdag: "Do",
  vrijdag: "Vr",
  zaterdag: "Za",
  zondag: "Zo",
};

export function WeekOverviewWidget({ instance }: WidgetProps) {
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

  const statusCounts = (tasks: DayTask[]) => ({
    total: tasks.length,
    done: tasks.filter((t) => t.status === "klaar").length,
    open: tasks.filter((t) => t.status !== "klaar").length,
  });

  const hoursByDay = (weekday: string) => {
    return data.hourEntries
      .filter((e) => e.weekday === weekday)
      .reduce((sum, e) => sum + e.hoursDecimal, 0);
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {data.week.weekLabel}
      </p>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-auto">
        {WEEKDAYS.filter((d) => !["zaterdag", "zondag"].includes(d)).map(
          (weekday) => {
            const dayTasks = data.tasks.filter((t) => t.weekday === weekday);
            const counts = statusCounts(dayTasks);
            const hours = hoursByDay(weekday);
            const isToday =
              new Date()
                .toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" })
                .slice(0, 10) ===
              data.week.startDate; // approximation

            return (
              <div
                key={weekday}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                  counts.total > 0
                    ? "bg-slate-50"
                    : "bg-transparent opacity-60"
                }`}
              >
                <span className="w-6 text-xs font-bold text-slate-500">
                  {SHORT_DAYS[weekday]}
                </span>

                <div className="min-w-0 flex-1">
                  {counts.total === 0 ? (
                    <p className="text-xs text-slate-400">—</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{
                            width: `${counts.total > 0 ? (counts.done / counts.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {counts.done}/{counts.total}
                      </span>
                    </div>
                  )}
                </div>

                <span className="w-10 text-right text-xs text-slate-400">
                  {hours > 0 ? `${hours.toFixed(1)}u` : ""}
                </span>
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}
