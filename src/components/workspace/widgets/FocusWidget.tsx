"use client";

import { useWidgetData, fetchJson } from "../hooks/useWidgetData";
import type { DayTask, WeekAggregate } from "@/lib/db/types";
import type { WidgetProps } from "../types";

export function FocusWidget({ instance }: WidgetProps) {
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

  const focusTask =
    data.tasks.find(
      (t) => t.status === "bezig" && t.deadlineAt?.slice(0, 10) === today,
    ) ??
    data.tasks.find((t) => t.status === "bezig") ??
    data.tasks.find(
      (t) =>
        t.status !== "klaar" &&
        t.deadlineAt &&
        t.deadlineAt.slice(0, 10) === today,
    );

  const totalToday = data.tasks.filter(
    (t) =>
      t.status !== "klaar" &&
      t.deadlineAt?.slice(0, 10) === today,
  ).length;
  const completedToday = data.tasks.filter(
    (t) =>
      t.status === "klaar" &&
      t.deadlineAt?.slice(0, 10) === today,
  ).length;

  const focusProgress =
    totalToday > 0 ? (completedToday / (completedToday + totalToday)) * 100 : 0;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      {focusTask ? (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <span className="text-2xl">🎯</span>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              Focus taak
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {focusTask.title}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {focusTask.weekday.slice(0, 2)} • {focusTask.priority}
            </p>
          </div>
          <div className="w-full">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Vandaag</span>
              <span className="text-[11px] text-slate-500">
                {completedToday}/{completedToday + totalToday}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${focusProgress}%` }}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <span className="text-2xl">✨</span>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600">
              Geen focus moment
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Markeer een taak als &quot;bezig&quot; om te beginnen
            </p>
          </div>
        </>
      )}
    </div>
  );
}
