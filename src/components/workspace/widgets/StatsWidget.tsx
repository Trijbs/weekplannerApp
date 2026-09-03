"use client";

import { useWidgetData, fetchJson } from "../hooks/useWidgetData";
import type { WeekAggregate, HoursSummary } from "@/lib/db/types";
import type { WidgetProps } from "../types";

interface StatsCombined {
  aggregate: WeekAggregate;
  summary: HoursSummary | null;
}

export function StatsWidget({ instance }: WidgetProps) {
  const { data, loading, error } = useWidgetData<StatsCombined>(
    async (signal) => {
      const aggregate = await fetchJson<WeekAggregate>(
        "/api/weeks/current",
        signal,
      );
      const summary = await fetchJson<HoursSummary>(
        `/api/weeks/${aggregate.week.id}/hours/summary`,
        signal,
      ).catch(() => null);
      return { aggregate, summary };
    },
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

  const { aggregate, summary } = data;
  const totalTasks = aggregate.tasks.length;
  const completedTasks = aggregate.tasks.filter((t) => t.status === "klaar").length;
  const totalHours = summary?.weeklyTotalHours ?? 0;
  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const hoursPerDay = summary?.perDayTotals ?? [];
  const avgHours =
    hoursPerDay.length > 0
      ? totalHours / hoursPerDay.filter((d) => d.totalHours > 0).length
      : 0;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-emerald-50 px-3 py-3 text-center">
          <p className="text-2xl font-bold text-emerald-600">
            {completedTasks}/{totalTasks}
          </p>
          <p className="text-[11px] text-emerald-600">Taken afgerond</p>
        </div>
        <div className="rounded-lg bg-blue-50 px-3 py-3 text-center">
          <p className="text-2xl font-bold text-blue-600">
            {totalHours.toFixed(1)}
          </p>
          <p className="text-[11px] text-blue-600">Uren gewerkt</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-50 px-3 py-3 text-center">
          <p className="text-2xl font-bold text-slate-900">
            {Math.round(completionRate)}%
          </p>
          <p className="text-[11px] text-slate-500">Voortgang</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-3 text-center">
          <p className="text-2xl font-bold text-slate-900">
            {avgHours.toFixed(1)}
          </p>
          <p className="text-[11px] text-slate-500">Gem. u/dag</p>
        </div>
      </div>

      {/* Completion bar */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">Weekvoortgang</span>
          <span className="text-[11px] font-medium text-slate-600">
            {Math.round(completionRate)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${completionRate}%` }}
          />
        </div>
      </div>
    </div>
  );
}
