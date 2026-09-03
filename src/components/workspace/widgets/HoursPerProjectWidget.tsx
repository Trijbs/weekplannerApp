"use client";

import type { HoursSummary, WeekAggregate } from "@/lib/db/types";
import { useWidgetData, fetchJson } from "../hooks/useWidgetData";
import type { WidgetProps } from "../types";

export function HoursPerProjectWidget({ instance }: WidgetProps) {
  const { data, loading, error } = useWidgetData<HoursSummary>(
    async (signal) => {
      const aggregate = await fetchJson<WeekAggregate>(
        "/api/weeks/current",
        signal,
      );
      return fetchJson<HoursSummary>(
        `/api/weeks/${aggregate.week.id}/hours/summary`,
        signal,
      );
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

  const sorted = [...data.perProjectTotals].sort(
    (a, b) => b.totalHours - a.totalHours,
  );
  const maxHours = Math.max(...sorted.map((p) => p.totalHours), 1);
  const total = data.weeklyTotalHours;

  const colors = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-purple-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-indigo-500",
    "bg-teal-500",
  ];

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-2xl font-bold text-slate-900">
          {total.toFixed(1)}
          <span className="ml-1 text-sm font-normal text-slate-400">u totaal</span>
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto">
        {sorted.length === 0 ? (
          <p className="pt-4 text-center text-xs text-slate-400">
            Nog geen uren geregistreerd
          </p>
        ) : (
          sorted.map((proj, i) => (
            <div key={proj.projectName} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="truncate text-sm text-slate-700">
                  {proj.projectName || "Geen project"}
                </span>
                <span className="ml-2 shrink-0 text-xs font-medium text-slate-500">
                  {proj.totalHours.toFixed(1)}u
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all ${colors[i % colors.length]}`}
                  style={{
                    width: `${(proj.totalHours / maxHours) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
