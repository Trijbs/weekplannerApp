"use client";

import { useEffect, useMemo, useState } from "react";
import type { DayTask, HourBlock, HourEntry, Weekday } from "@/lib/db/types";
import { computeDurationHours, formatHoursAsDuration } from "@/lib/time/tracking";

export type TimerStartRequest = {
  hourBlockId?: string;
  dayTaskId?: string;
  projectName?: string;
  noteText?: string;
};

type TimerSectionProps = {
  todayIso: string | null;
  todayWeekday: Weekday | null;
  tasks: DayTask[];
  hourBlocks: HourBlock[];
  entries: HourEntry[];
  runningEntry: HourEntry | null;
  onStart: (input: TimerStartRequest) => void;
  onStop: () => void;
  t: (text: string) => string;
};

function useNowMs(active: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);

  return nowMs;
}

function runningElapsedHours(entry: HourEntry, nowMs: number): number {
  if (!entry.startedAt) {
    return 0;
  }
  return computeDurationHours(entry.startedAt, new Date(nowMs).toISOString());
}

export function TimerSection({
  todayIso,
  todayWeekday,
  tasks,
  hourBlocks,
  entries,
  runningEntry,
  onStart,
  onStop,
  t,
}: TimerSectionProps) {
  const nowMs = useNowMs(Boolean(runningEntry));
  const [quickProject, setQuickProject] = useState("");
  const [quickNote, setQuickNote] = useState("");

  const todayBlocks = useMemo(
    () =>
      hourBlocks.filter(
        (block) =>
          (block.dayDate ? block.dayDate === todayIso : block.weekday === todayWeekday),
      ),
    [hourBlocks, todayIso, todayWeekday],
  );

  const todayTasks = useMemo(
    () => tasks.filter((task) => task.weekday === todayWeekday),
    [tasks, todayWeekday],
  );

  const registeredByBlock = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      if (entry.hourBlockId && entry.status === "registered") {
        map.set(entry.hourBlockId, Number(((map.get(entry.hourBlockId) ?? 0) + entry.hoursDecimal).toFixed(2)));
      }
    }
    return map;
  }, [entries]);

  const registeredByTask = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      if (entry.dayTaskId && entry.status === "registered") {
        map.set(entry.dayTaskId, Number(((map.get(entry.dayTaskId) ?? 0) + entry.hoursDecimal).toFixed(2)));
      }
    }
    return map;
  }, [entries]);

  const workedTodayHours = useMemo(() => {
    const registered = entries
      .filter((entry) => entry.status === "registered" && entry.dayDate === todayIso)
      .reduce((sum, entry) => sum + entry.hoursDecimal, 0);
    const running =
      runningEntry && runningEntry.dayDate === todayIso ? runningElapsedHours(runningEntry, nowMs) : 0;
    return Number((registered + running).toFixed(2));
  }, [entries, nowMs, runningEntry, todayIso]);

  const runningLabel = runningEntry
    ? runningEntry.noteText || runningEntry.projectName || t("Losse timer")
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Vandaag")}</p>
        <p className="text-xs text-slate-500">
          {t("Vandaag gewerkt")}:{" "}
          <span className="font-semibold text-slate-900">{formatHoursAsDuration(workedTodayHours)}</span>
        </p>
      </div>

      {runningEntry ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              {t("Timer loopt")}
            </p>
            <p className="truncate text-sm text-emerald-800">
              {runningLabel}
              {runningEntry.projectName && runningEntry.noteText ? ` · ${runningEntry.projectName}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="font-mono text-lg font-semibold tabular-nums text-emerald-900">
              {formatHoursAsDuration(runningElapsedHours(runningEntry, nowMs))}
            </p>
            <button
              type="button"
              className="rounded-xl bg-emerald-900 px-4 py-2 text-sm text-white hover:bg-emerald-800"
              onClick={onStop}
            >
              ⏹ {t("Stop timer")}
            </button>
          </div>
        </div>
      ) : null}

      {todayBlocks.length === 0 && todayTasks.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {t("Geen geplande items voor vandaag.")}
        </p>
      ) : (
        <ul className="space-y-2">
          {todayBlocks.map((block) => {
            const registeredHours = registeredByBlock.get(block.id);
            const isRunning = runningEntry?.hourBlockId === block.id;
            return (
              <li
                key={`blok-${block.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {block.taskText || `${block.timeStart}–${block.timeEnd}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {block.timeStart}–{block.timeEnd}
                    {block.projectText ? ` · ${block.projectText}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {registeredHours ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      {formatHoursAsDuration(registeredHours)} · ✓ {t("Geregistreerd")}
                    </span>
                  ) : null}
                  {isRunning ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      {t("Timer loopt")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-700"
                      onClick={() =>
                        onStart({
                          hourBlockId: block.id,
                          projectName: block.projectText,
                          noteText: block.taskText,
                        })
                      }
                    >
                      ▶ {t("Start timer")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {todayTasks.map((task) => {
            const registeredHours = registeredByTask.get(task.id);
            const isRunning = runningEntry?.dayTaskId === task.id;
            return (
              <li
                key={`taak-${task.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{task.title}</p>
                  <p className="text-xs text-slate-500">{t("Taak")}</p>
                </div>
                <div className="flex items-center gap-2">
                  {registeredHours ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      {formatHoursAsDuration(registeredHours)} · ✓ {t("Geregistreerd")}
                    </span>
                  ) : null}
                  {isRunning ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      {t("Timer loopt")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-700"
                      onClick={() => onStart({ dayTaskId: task.id, noteText: task.title })}
                    >
                      ▶ {t("Start timer")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2">
        <label className="flex min-w-[140px] flex-1 flex-col gap-1">
          <span className="text-xs text-slate-500">{t("Losse timer")}</span>
          <input
            value={quickNote}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            placeholder={t("Waar werk je aan?")}
            onChange={(event) => setQuickNote(event.target.value)}
          />
        </label>
        <label className="flex min-w-[120px] flex-col gap-1">
          <span className="text-xs text-slate-500">{t("Project")}</span>
          <input
            value={quickProject}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            placeholder={t("Project / categorie")}
            onChange={(event) => setQuickProject(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white hover:bg-slate-700"
          onClick={() => {
            onStart({ projectName: quickProject, noteText: quickNote });
            setQuickProject("");
            setQuickNote("");
          }}
        >
          ▶ {t("Start timer")}
        </button>
      </div>
    </div>
  );
}
