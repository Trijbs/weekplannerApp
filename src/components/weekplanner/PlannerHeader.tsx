import type { Weekday } from "@/lib/db/types";
import type { PlannerSearchResult } from "@/components/weekplanner/types";

type PlannerWeekOption = {
  id: string;
  label: string;
  rangeText: string;
};

type PlannerHeaderProps = {
  currentWeekLabel: string;
  currentRangeText: string;
  weekOptions: PlannerWeekOption[];
  currentWeekId: string | null;
  hasPreviousWeek: boolean;
  hasNextWeek: boolean;
  exportHref: string | null;
  queueCount: number;
  isOnline: boolean;
  daySearchDate: string;
  plannerSearchQuery: string;
  plannerSearchResults: PlannerSearchResult[];
  weekdayLabels: Record<Weekday, string>;
  formatDayDateLabel: (isoDate: string) => string;
  onPreviousWeek: () => void;
  onWeekSelect: (weekId: string) => void;
  onNextWeek: () => void;
  onCurrentWeek: () => void;
  onUploadExcel: (file: File) => void;
  onRunDriveSync: () => void;
  onConnectDrive: () => void;
  onLogout: () => void;
  onDaySearchDateChange: (value: string) => void;
  onGoToDay: () => void;
  onPlannerSearchQueryChange: (value: string) => void;
  onOpenSearchResult: (result: PlannerSearchResult) => void;
};

export function PlannerHeader({
  currentWeekLabel,
  currentRangeText,
  weekOptions,
  currentWeekId,
  hasPreviousWeek,
  hasNextWeek,
  exportHref,
  queueCount,
  isOnline,
  daySearchDate,
  plannerSearchQuery,
  plannerSearchResults,
  weekdayLabels,
  formatDayDateLabel,
  onPreviousWeek,
  onWeekSelect,
  onNextWeek,
  onCurrentWeek,
  onUploadExcel,
  onRunDriveSync,
  onConnectDrive,
  onLogout,
  onDaySearchDateChange,
  onGoToDay,
  onPlannerSearchQueryChange,
  onOpenSearchResult,
}: PlannerHeaderProps) {
  return (
    <header className="rounded-3xl bg-[linear-gradient(135deg,#0f172a,#1d4ed8)] px-6 py-8 text-white shadow-2xl shadow-blue-900/30">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-blue-100">Weekplanner</p>
          <h1 className="mt-1 text-3xl font-semibold">{currentWeekLabel}</h1>
          <p className="mt-1 text-sm text-blue-100">{currentRangeText}</p>
          {weekOptions.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onPreviousWeek}
                disabled={!hasPreviousWeek}
              >
                Vorige
              </button>
              <select
                value={currentWeekId ?? ""}
                className="rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-xs text-white"
                onChange={(event) => onWeekSelect(event.target.value)}
              >
                {weekOptions.map((week) => (
                  <option key={week.id} value={week.id} className="text-slate-900">
                    {week.label} ({week.rangeText})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onNextWeek}
                disabled={!hasNextWeek}
              >
                Volgende
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-xs"
                onClick={onCurrentWeek}
              >
                Naar huidige week
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-xl bg-white/10 px-3 py-2 text-sm backdrop-blur hover:bg-white/20">
            Excel import
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onUploadExcel(file);
                }
              }}
            />
          </label>
          <button type="button" className="rounded-xl bg-white/10 px-3 py-2 text-sm" onClick={onRunDriveSync}>
            Sync Drive
          </button>
          <button type="button" className="rounded-xl bg-white/10 px-3 py-2 text-sm" onClick={onConnectDrive}>
            Koppel Drive
          </button>
          {exportHref ? (
            <a href={exportHref} className="rounded-xl bg-amber-300 px-3 py-2 text-sm font-medium text-slate-900">
              Export CSV
            </a>
          ) : null}
          <button type="button" className="rounded-xl bg-white/10 px-3 py-2 text-sm" onClick={onLogout}>
            Uitloggen
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-blue-100">
        <span className="rounded-full border border-white/30 px-2 py-1">{isOnline ? "Online" : "Offline"}</span>
        <span className="rounded-full border border-white/30 px-2 py-1">Wachtrij: {queueCount}</span>
        <span className="rounded-full border border-white/30 px-2 py-1">Tijdzone: Europe/Amsterdam</span>
      </div>

      <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-blue-100">Zoek Dag</p>
          <p className="mt-1 text-sm text-blue-50">
            Kies een datum en open direct het dagdetail om oude of aankomende informatie terug te vinden.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <input
            type="date"
            value={daySearchDate}
            className="rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white"
            onChange={(event) => onDaySearchDateChange(event.target.value)}
          />
          <button
            type="button"
            className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-900"
            onClick={onGoToDay}
          >
            Ga naar dag
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-blue-100">Zoek Project Of Taak</p>
            <p className="mt-1 text-sm text-blue-50">
              Zoek op projectnaam, taaknaam of reflectietekst en open direct de juiste dag.
            </p>
          </div>
          <input
            value={plannerSearchQuery}
            className="w-full rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white sm:max-w-md"
            placeholder="Bijv. portfolio, reflectie, logo..."
            onChange={(event) => onPlannerSearchQueryChange(event.target.value)}
          />
        </div>

        {plannerSearchQuery.trim().length >= 2 ? (
          <div className="mt-3 space-y-2">
            {plannerSearchResults.length ? (
              plannerSearchResults.map((result) => (
                <div key={result.key} className="rounded-xl border border-white/15 bg-slate-950/20 p-3 text-sm text-white">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">
                        {weekdayLabels[result.weekday]} ({formatDayDateLabel(result.dayDate)})
                      </p>
                      <p className="text-xs text-blue-100">
                        {result.weekLabel} • {result.matchCount} match{result.matchCount === 1 ? "" : "es"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {result.previews.map((preview) => (
                          <span
                            key={`${result.key}-${preview}`}
                            className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[11px] text-blue-50"
                          >
                            {preview}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-900"
                      onClick={() => onOpenSearchResult(result)}
                    >
                      Open dag
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-white/15 bg-slate-950/20 px-3 py-3 text-sm text-blue-50">
                Geen resultaten gevonden.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </header>
  );
}
