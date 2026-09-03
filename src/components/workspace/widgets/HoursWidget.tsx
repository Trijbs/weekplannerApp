"use client";

import { useWidgetData, fetchJson } from "../hooks/useWidgetData";
import type { WeekAggregate, HoursSummary } from "@/lib/db/types";
import type { WidgetProps } from "../types";

interface HoursCombined {
  aggregate: WeekAggregate;
  summary: HoursSummary | null;
}

export function HoursWidget({ instance }: WidgetProps) {
  const { data, loading, error } = useWidgetData<HoursCombined>(
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
  const totalHours = summary?.weeklyTotalHours ?? 0;
  const perProject = summary?.perProjectTotals ?? [];
  const perDay = summary?.perDayTotals ?? [];

  const runningEntry = aggregate.hourEntries.find((e) => e.status === "running");

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Total + running indicator */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold text-slate-900">
            {totalHours.toFixed(1)}
            <span className="ml-1 text-sm font-normal text-slate-400">u</span>
          </p>
          <p className="text-xs text-slate-500">Totaal deze week</p>
        </div>
        {runningEntry && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Actief
          </span>
        )}
      </div>

      {/* Per day bars */}
      <div className="space-y-1.5">
        {perDay.map((day) => {
          const maxDayHours = Math.max(...perDay.map((d) => d.totalHours), 1);
          return (
            <div key={day.dayDate} className="flex items-center gap-2">
              <span className="w-10 text-[11px] text-slate-500">
                {day.weekday.slice(0, 2)}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{
                    width: `${(day.totalHours / maxDayHours) * 100}%`,
                  }}
                />
              </div>
              <span className="w-8 text-right text-[11px] text-slate-500">
                {day.totalHours.toFixed(1)}u
              </span>
            </div>
          );
        })}
      </div>

      {/* Per project breakdown */}
      {perProject.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Per project
          </p>
          {perProject.map((proj) => (
            <div
              key={proj.projectName}
              className="flex items-center justify-between rounded-lg px-2 py-1"
            >
              <span className="truncate text-sm text-slate-700">
                {proj.projectName || "Geen project"}
              </span>
              <span className="ml-2 shrink-0 text-sm font-medium text-slate-900">
                {proj.totalHours.toFixed(1)}u
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
