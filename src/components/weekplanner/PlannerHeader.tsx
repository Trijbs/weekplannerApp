"use client";

import { useState } from "react";
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
  notesExportHref: string | null;
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

type MobileSearchOverlay = "day" | "planner" | null;

function CalendarIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function SearchIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
    </svg>
  );
}

function CloseIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}

export function PlannerHeader({
  currentWeekLabel,
  currentRangeText,
  weekOptions,
  currentWeekId,
  hasPreviousWeek,
  hasNextWeek,
  exportHref,
  notesExportHref,
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
  const [mobileOverlay, setMobileOverlay] = useState<MobileSearchOverlay>(null);

  return (
    <header className="rounded-[2rem] bg-[linear-gradient(135deg,#0f172a,#1d4ed8)] px-4 py-5 text-white shadow-2xl shadow-blue-900/30 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-blue-100">Weekplanner</p>
          <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{currentWeekLabel}</h1>
          <p className="mt-1 text-sm text-blue-100">{currentRangeText}</p>
          {weekOptions.length ? (
            <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
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

        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
          <label className="flex cursor-pointer items-center justify-center rounded-xl bg-white/10 px-3 py-2 text-center text-sm backdrop-blur hover:bg-white/20">
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
          <button
            type="button"
            className="rounded-xl bg-white/10 px-3 py-2 text-sm"
            onClick={onRunDriveSync}
          >
            Sync Drive
          </button>
          <button
            type="button"
            className="rounded-xl bg-white/10 px-3 py-2 text-sm"
            onClick={onConnectDrive}
          >
            Koppel Drive
          </button>
          {exportHref ? (
            <a
              href={exportHref}
              className="flex items-center justify-center rounded-xl bg-amber-300 px-3 py-2 text-sm font-medium text-slate-900"
            >
              Export CSV
            </a>
          ) : null}
          {notesExportHref ? (
            <a
              href={notesExportHref}
              className="flex items-center justify-center rounded-xl bg-emerald-300 px-3 py-2 text-sm font-medium text-slate-900"
            >
              Export notities
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

      <div className="mt-4 grid grid-cols-2 gap-2 md:hidden">
        <button
          type="button"
          className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-3 py-3 text-left backdrop-blur transition hover:bg-white/15"
          onClick={() => setMobileOverlay("day")}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-900">
            <CalendarIcon />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-white">Zoek dag</span>
            <span className="block text-xs text-blue-100">Open overlay</span>
          </span>
        </button>
        <button
          type="button"
          className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-3 py-3 text-left backdrop-blur transition hover:bg-white/15"
          onClick={() => setMobileOverlay("planner")}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-900">
            <SearchIcon />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-white">Zoek taak</span>
            <span className="block text-xs text-blue-100">Project of taak</span>
          </span>
        </button>
      </div>

      <div className="mt-4 hidden flex-col gap-2 rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur md:flex md:flex-row md:items-end md:justify-between">
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

      <div className="mt-3 hidden rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur md:block">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-blue-100">Zoek Project Of Taak</p>
            <p className="mt-1 text-sm text-blue-50">
              Zoek op projectnaam, taaknaam of reflectietekst en open direct de juiste dag.
            </p>
          </div>
          <input
            value={plannerSearchQuery}
            className="w-full rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white md:max-w-md"
            placeholder="Bijv. portfolio, reflectie, logo..."
            onChange={(event) => onPlannerSearchQueryChange(event.target.value)}
          />
        </div>

        {plannerSearchQuery.trim().length >= 2 ? (
          <div className="mt-3 space-y-2">
            {plannerSearchResults.length ? (
              plannerSearchResults.map((result) => (
                <div key={result.key} className="rounded-xl border border-white/15 bg-slate-950/20 p-3 text-sm text-white">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
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

      {mobileOverlay ? (
        <div className="fixed inset-0 z-50 bg-slate-950/65 p-4 md:hidden" onClick={() => setMobileOverlay(null)}>
          <div
            className="mx-auto max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-[2rem] border border-white/15 bg-[linear-gradient(180deg,rgba(29,78,216,0.98),rgba(15,23,42,0.98))] p-4 shadow-2xl shadow-slate-950/60"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-blue-100">
                  {mobileOverlay === "day" ? "Zoek dag" : "Zoek project of taak"}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {mobileOverlay === "day" ? "Ga direct naar een dag" : "Open snel de juiste dag"}
                </h2>
              </div>
              <button
                type="button"
                className="rounded-2xl border border-white/20 bg-white/10 p-2 text-white"
                onClick={() => setMobileOverlay(null)}
                aria-label="Sluiten"
              >
                <CloseIcon />
              </button>
            </div>

            {mobileOverlay === "day" ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-blue-50">
                  Kies een datum en open direct het dagdetail om oude of aankomende informatie terug te vinden.
                </p>
                <input
                  type="date"
                  value={daySearchDate}
                  className="w-full rounded-2xl border border-white/25 bg-white/10 px-3 py-3 text-sm text-white"
                  onChange={(event) => onDaySearchDateChange(event.target.value)}
                />
                <button
                  type="button"
                  className="w-full rounded-2xl bg-white px-3 py-3 text-sm font-medium text-slate-900"
                  onClick={() => {
                    onGoToDay();
                    setMobileOverlay(null);
                  }}
                >
                  Ga naar dag
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-blue-50">
                  Zoek op projectnaam, taaknaam of reflectietekst en open direct de juiste dag.
                </p>
                <input
                  value={plannerSearchQuery}
                  className="w-full rounded-2xl border border-white/25 bg-white/10 px-3 py-3 text-sm text-white placeholder:text-blue-100/60"
                  placeholder="Bijv. portfolio, reflectie, logo..."
                  onChange={(event) => onPlannerSearchQueryChange(event.target.value)}
                />

                {plannerSearchQuery.trim().length >= 2 ? (
                  <div className="space-y-2">
                    {plannerSearchResults.length ? (
                      plannerSearchResults.map((result) => (
                        <div key={result.key} className="rounded-2xl border border-white/15 bg-slate-950/20 p-3 text-sm text-white">
                          <div className="flex flex-col gap-2">
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
                              className="rounded-2xl bg-white px-3 py-2 text-sm font-medium text-slate-900"
                              onClick={() => {
                                onOpenSearchResult(result);
                                setMobileOverlay(null);
                              }}
                            >
                              Open dag
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-white/15 bg-slate-950/20 px-3 py-3 text-sm text-blue-50">
                        Geen resultaten gevonden.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/15 bg-slate-950/20 px-3 py-3 text-sm text-blue-50">
                    Typ minimaal 2 letters om te zoeken.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
