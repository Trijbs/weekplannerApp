"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { WEEKDAYS } from "@/lib/db/types";
import type { Weekday } from "@/lib/db/types";
import type { AppLanguage } from "@/lib/i18n";
import { translateStatic } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "hoog" | "middel" | "laag";

export interface WeekEntry {
  weekOffset: number; // 0 = current, 1 = next, …
  weekdays: Set<Weekday>;
}

export interface MultiWeekFormState {
  title: string;
  info: string;
  priority: Priority;
  weekEntries: WeekEntry[];
}

type TaskSubmitPayload = {
  title: string;
  info: string;
  priority: Priority;
  entries: Array<{ weekOffset: number; weekdays: Weekday[] }>;
};

type BlockSubmitPayload = {
  taskText: string;
  projectText: string;
  timeStart: string;
  timeEnd: string;
  status: "open" | "bezig" | "klaar";
  entries: Array<{ weekOffset: number; weekdays: Weekday[] }>;
};

export type MultiWeekPlanModalProps =
  | {
      mode?: "task";
      language: AppLanguage;
      currentWeekMonday: string;
      onClose: () => void;
      onSubmit: (payload: TaskSubmitPayload) => Promise<void>;
    }
  | {
      mode: "block";
      language: AppLanguage;
      currentWeekMonday: string;
      onClose: () => void;
      onSubmit: (payload: BlockSubmitPayload) => Promise<void>;
    };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NL_WEEKDAY_SHORT: Record<Weekday, string> = {
  maandag: "Ma",
  dinsdag: "Di",
  woensdag: "Wo",
  donderdag: "Do",
  vrijdag: "Vr",
  zaterdag: "Za",
  zondag: "Zo",
};

const EN_WEEKDAY_SHORT: Record<Weekday, string> = {
  maandag: "Mo",
  dinsdag: "Tu",
  woensdag: "We",
  donderdag: "Th",
  vrijdag: "Fr",
  zaterdag: "Sa",
  zondag: "Su",
};

type Preset =
  | "werkdagen"
  | "weekend"
  | "hele_week"
  | "maandag_vrijdag"
  | "elke_dag"
  | "dinsdag_donderdag"
  | "begin_week"
  | "einde_week"
  | "geen";

interface PresetDef {
  id: Preset;
  labelNl: string;
  labelEn: string;
  days: Weekday[];
}

const PRESETS: PresetDef[] = [
  {
    id: "werkdagen",
    labelNl: "Werkdagen (ma–vr)",
    labelEn: "Weekdays (mo–fri)",
    days: ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag"],
  },
  {
    id: "weekend",
    labelNl: "Weekend (za + zo)",
    labelEn: "Weekend (sat + sun)",
    days: ["zaterdag", "zondag"],
  },
  {
    id: "hele_week",
    labelNl: "Hele week (alle 7 dagen)",
    labelEn: "Full week (all 7 days)",
    days: ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"],
  },
  {
    id: "maandag_vrijdag",
    labelNl: "Maandag + vrijdag",
    labelEn: "Monday + Friday",
    days: ["maandag", "vrijdag"],
  },
  {
    id: "dinsdag_donderdag",
    labelNl: "Dinsdag + donderdag",
    labelEn: "Tuesday + Thursday",
    days: ["dinsdag", "donderdag"],
  },
  {
    id: "begin_week",
    labelNl: "Begin week (ma–wo)",
    labelEn: "Start of week (mo–we)",
    days: ["maandag", "dinsdag", "woensdag"],
  },
  {
    id: "einde_week",
    labelNl: "Einde week (wo–vr)",
    labelEn: "End of week (we–fri)",
    days: ["woensdag", "donderdag", "vrijdag"],
  },
  {
    id: "geen",
    labelNl: "Vrije keuze",
    labelEn: "Custom",
    days: [],
  },
];

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoWeekNumberFromMonday(mondayIso: string): number {
  const date = new Date(`${mondayIso}T00:00:00Z`);
  const tmp = new Date(date);
  tmp.setUTCDate(tmp.getUTCDate() + 3); // Thursday of this week
  const year = tmp.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function weekLabelFromMonday(mondayIso: string, language: AppLanguage): string {
  const weekNr = isoWeekNumberFromMonday(mondayIso);
  const sundayIso = addDaysIso(mondayIso, 6);
  const [, monMonth, monDay] = mondayIso.split("-");
  const [, sunMonth, sunDay] = sundayIso.split("-");

  const monStr = `${Number(monDay)} ${monthShort(Number(monMonth), language)}`;
  const sunStr = `${Number(sunDay)} ${monthShort(Number(sunMonth), language)}`;

  return language === "en"
    ? `Wk ${weekNr} (${monStr} – ${sunStr})`
    : `Wk ${weekNr} (${monStr} – ${sunStr})`;
}

const NL_MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthShort(monthNumber: number, language: AppLanguage): string {
  const idx = (monthNumber - 1 + 12) % 12;
  return language === "en" ? (EN_MONTHS[idx] ?? "") : (NL_MONTHS[idx] ?? "");
}

function detectPreset(days: Set<Weekday>): Preset {
  for (const preset of PRESETS) {
    if (preset.id === "geen") continue;
    const presetSet = new Set(preset.days);
    if (presetSet.size === days.size && preset.days.every((d) => days.has(d))) {
      return preset.id;
    }
  }
  return "geen";
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type: "SET_TITLE"; value: string }
  | { type: "SET_INFO"; value: string }
  | { type: "SET_PRIORITY"; value: Priority }
  | { type: "TOGGLE_WEEK"; weekOffset: number }
  | { type: "TOGGLE_DAY"; weekOffset: number; weekday: Weekday }
  | { type: "APPLY_PRESET_TO_WEEK"; weekOffset: number; days: Weekday[] }
  | { type: "APPLY_PRESET_TO_ALL"; days: Weekday[] }
  | { type: "SET_WEEK_ENTRIES"; entries: WeekEntry[] };

function reducer(state: MultiWeekFormState, action: Action): MultiWeekFormState {
  switch (action.type) {
    case "SET_TITLE":
      return { ...state, title: action.value };
    case "SET_INFO":
      return { ...state, info: action.value };
    case "SET_PRIORITY":
      return { ...state, priority: action.value };

    case "TOGGLE_WEEK": {
      const exists = state.weekEntries.some((e) => e.weekOffset === action.weekOffset);
      if (exists) {
        return {
          ...state,
          weekEntries: state.weekEntries.filter((e) => e.weekOffset !== action.weekOffset),
        };
      }
      return {
        ...state,
        weekEntries: [...state.weekEntries, { weekOffset: action.weekOffset, weekdays: new Set<Weekday>(["maandag"]) }].sort(
          (a, b) => a.weekOffset - b.weekOffset,
        ),
      };
    }

    case "TOGGLE_DAY": {
      return {
        ...state,
        weekEntries: state.weekEntries.map((entry) => {
          if (entry.weekOffset !== action.weekOffset) return entry;
          const next = new Set(entry.weekdays);
          if (next.has(action.weekday)) {
            next.delete(action.weekday);
          } else {
            next.add(action.weekday);
          }
          return { ...entry, weekdays: next };
        }),
      };
    }

    case "APPLY_PRESET_TO_WEEK": {
      return {
        ...state,
        weekEntries: state.weekEntries.map((entry) => {
          if (entry.weekOffset !== action.weekOffset) return entry;
          return { ...entry, weekdays: new Set(action.days) };
        }),
      };
    }

    case "APPLY_PRESET_TO_ALL": {
      const next = new Set(action.days);
      return {
        ...state,
        weekEntries: state.weekEntries.map((entry) => ({
          ...entry,
          weekdays: next,
        })),
      };
    }

    case "SET_WEEK_ENTRIES":
      return { ...state, weekEntries: action.entries };

    default:
      return state;
  }
}

function buildInitialState(): MultiWeekFormState {
  return {
    title: "",
    info: "",
    priority: "middel",
    weekEntries: [{ weekOffset: 0, weekdays: new Set(["maandag"]) }],
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WeekRow({
  language,
  entry,
  label,
  isFirst,
  onToggleDay,
  onApplyPreset,
}: {
  language: AppLanguage;
  entry: WeekEntry;
  label: string;
  isFirst: boolean;
  onToggleDay: (weekday: Weekday) => void;
  onApplyPreset: (days: Weekday[]) => void;
}) {
  const shortLabels = language === "en" ? EN_WEEKDAY_SHORT : NL_WEEKDAY_SHORT;
  const activePreset = detectPreset(entry.weekdays);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">
          {isFirst
            ? (language === "en" ? "This week" : "Deze week")
            : label}
        </p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
          {entry.weekdays.size} {language === "en" ? "day(s)" : "dag(en)"}
        </span>
      </div>

      {/* Day toggles */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {WEEKDAYS.map((weekday) => {
          const active = entry.weekdays.has(weekday);
          return (
            <button
              key={weekday}
              type="button"
              onClick={() => onToggleDay(weekday)}
              className={`flex h-8 w-[38px] items-center justify-center rounded-lg text-xs font-semibold transition-all ${
                active
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {shortLabels[weekday]}
            </button>
          );
        })}
      </div>

      {/* Preset pills for this week */}
      <div className="mt-2 flex flex-wrap gap-1">
        {PRESETS.map((preset) => {
          const isActive = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApplyPreset(preset.days)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                isActive
                  ? "bg-amber-400 text-amber-900"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {language === "en" ? preset.labelEn : preset.labelNl}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return `${h}:${m}`;
});

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// ─── Main component ───────────────────────────────────────────────────────────

const MAX_WEEKS = 9; // current + 8 future

export function MultiWeekPlanModal(props: MultiWeekPlanModalProps) {
  const { language, currentWeekMonday, onClose, onSubmit } = props;
  const mode = props.mode ?? "task";

  const t = (text: string) => translateStatic(language, text);
  const [form, dispatch] = useReducer(reducer, undefined, buildInitialState);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [globalPreset, setGlobalPreset] = useState<Preset>("geen");
  const titleRef = useRef<HTMLInputElement>(null);

  // Block-specific state
  const [blockTaskText, setBlockTaskText] = useState("");
  const [blockProjectText, setBlockProjectText] = useState("");
  const [blockTimeStart, setBlockTimeStart] = useState("09:00");
  const [blockTimeEnd, setBlockTimeEnd] = useState("10:00");
  const [blockStatus, setBlockStatus] = useState<"open" | "bezig" | "klaar">("open");

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Compute the Monday for each available week slot
  const weekMondayByOffset = useMemo(() => {
    return Array.from({ length: MAX_WEEKS }, (_, i) => ({
      offset: i,
      monday: addDaysIso(currentWeekMonday, i * 7),
    }));
  }, [currentWeekMonday]);

  const activeOffsets = useMemo(
    () => new Set(form.weekEntries.map((e) => e.weekOffset)),
    [form.weekEntries],
  );

  const totalTasks = useMemo(
    () => form.weekEntries.reduce((sum, entry) => sum + entry.weekdays.size, 0),
    [form.weekEntries],
  );

  const blockTimeValid = timeToMinutes(blockTimeEnd) > timeToMinutes(blockTimeStart);

  const canSubmit =
    totalTasks > 0 &&
    (mode === "task" ? form.title.trim().length > 0 : blockTimeValid);

  function handleToggleWeek(offset: number) {
    dispatch({ type: "TOGGLE_WEEK", weekOffset: offset });
  }

  function handleApplyGlobalPreset(preset: PresetDef) {
    setGlobalPreset(preset.id);
    if (preset.days.length > 0) {
      dispatch({ type: "APPLY_PRESET_TO_ALL", days: preset.days });
    }
  }

  const entriesPayload = form.weekEntries
    .filter((e) => e.weekdays.size > 0)
    .map((e) => ({
      weekOffset: e.weekOffset,
      weekdays: WEEKDAYS.filter((d) => e.weekdays.has(d)),
    }));

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (mode === "block") {
        await (onSubmit as (p: BlockSubmitPayload) => Promise<void>)({
          taskText: blockTaskText.trim(),
          projectText: blockProjectText.trim(),
          timeStart: blockTimeStart,
          timeEnd: blockTimeEnd,
          status: blockStatus,
          entries: entriesPayload,
        });
      } else {
        await (onSubmit as (p: TaskSubmitPayload) => Promise<void>)({
          title: form.title.trim(),
          info: form.info.trim(),
          priority: form.priority,
          entries: entriesPayload,
        });
      }
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Opslaan mislukt. Probeer opnieuw.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="mx-auto flex min-h-screen w-full max-w-2xl flex-col bg-white sm:min-h-0 sm:rounded-2xl sm:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-slate-500">
              {language === "en" ? "Multi-week planner" : "Meerdere weken inplannen"}
            </p>
            <h2 className="text-xl font-semibold text-slate-900">
              {mode === "block"
                ? (language === "en" ? "Add hour block across weeks" : "Uurblok inplannen over meerdere weken")
                : (language === "en" ? "Add task across weeks" : "Taak inplannen over meerdere weken")}
            </h2>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            {t("Sluiten")}
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto p-4 sm:p-6">
          {/* Detail fields — task or block */}
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">
              {mode === "block"
                ? (language === "en" ? "Block details" : "Uurblokgegevens")
                : (language === "en" ? "Task details" : "Taakgegevens")}
            </h3>

            {mode === "block" ? (
              <div className="grid gap-2.5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    ref={titleRef}
                    value={blockTaskText}
                    onChange={(e) => setBlockTaskText(e.target.value)}
                    placeholder={language === "en" ? "Task label (optional)" : "Taaklabel (optioneel)"}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
                  />
                  <input
                    value={blockProjectText}
                    onChange={(e) => setBlockProjectText(e.target.value)}
                    placeholder={language === "en" ? "Project (optional)" : "Project (optioneel)"}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      {language === "en" ? "Start time" : "Begintijd"}
                    </label>
                    <select
                      value={blockTimeStart}
                      onChange={(e) => {
                        const start = e.target.value;
                        setBlockTimeStart(start);
                        // auto-advance end time to +1h if it hasn't been manually changed
                        const startIdx = TIME_OPTIONS.indexOf(start);
                        const autoEnd = startIdx >= 0 ? (TIME_OPTIONS[Math.min(startIdx + 4, TIME_OPTIONS.length - 1)] ?? blockTimeEnd) : blockTimeEnd;
                        if (timeToMinutes(blockTimeEnd) <= timeToMinutes(start)) {
                          setBlockTimeEnd(autoEnd);
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
                    >
                      {TIME_OPTIONS.map((t) => (
                        <option key={`start-${t}`} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      {language === "en" ? "End time" : "Eindtijd"}
                    </label>
                    <select
                      value={blockTimeEnd}
                      onChange={(e) => setBlockTimeEnd(e.target.value)}
                      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-1 ${
                        blockTimeValid
                          ? "border-slate-300 focus:border-amber-400 focus:ring-amber-300"
                          : "border-red-400 focus:border-red-400 focus:ring-red-200"
                      }`}
                    >
                      {TIME_OPTIONS.map((t) => (
                        <option key={`end-${t}`} value={t}>{t}</option>
                      ))}
                    </select>
                    {!blockTimeValid && (
                      <p className="mt-1 text-xs text-red-600">
                        {language === "en" ? "End must be after start" : "Eindtijd moet later zijn dan begintijd"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-600">
                    {language === "en" ? "Status:" : "Status:"}
                  </label>
                  {(["open", "bezig", "klaar"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setBlockStatus(s)}
                      className={`rounded-full px-3 py-0.5 text-xs font-semibold transition-colors ${
                        blockStatus === s
                          ? s === "klaar"
                            ? "bg-green-500 text-white"
                            : s === "bezig"
                            ? "bg-blue-500 text-white"
                            : "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {language === "en"
                        ? s === "klaar" ? "Done" : s === "bezig" ? "In progress" : "Open"
                        : s === "klaar" ? "Klaar" : s === "bezig" ? "Bezig" : "Open"}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-2.5">
                <input
                  ref={titleRef}
                  value={form.title}
                  onChange={(e) => dispatch({ type: "SET_TITLE", value: e.target.value })}
                  placeholder={language === "en" ? "Task title (required)" : "Taaknaam (verplicht)"}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                />
                <input
                  value={form.info}
                  onChange={(e) => dispatch({ type: "SET_INFO", value: e.target.value })}
                  placeholder={language === "en" ? "Extra info or project" : "Info of project (optioneel)"}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-300"
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-600">
                    {language === "en" ? "Priority:" : "Prioriteit:"}
                  </label>
                  {(["hoog", "middel", "laag"] as Priority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => dispatch({ type: "SET_PRIORITY", value: p })}
                      className={`rounded-full px-3 py-0.5 text-xs font-semibold transition-colors ${
                        form.priority === p
                          ? p === "hoog"
                            ? "bg-red-500 text-white"
                            : p === "middel"
                            ? "bg-amber-400 text-amber-900"
                            : "bg-slate-400 text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {language === "en"
                        ? p === "hoog" ? "High" : p === "middel" ? "Medium" : "Low"
                        : p === "hoog" ? "Hoog" : p === "middel" ? "Middel" : "Laag"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Global preset strip */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">
                {language === "en" ? "Schedule pattern" : "Inplanpatroon"}
              </h3>
              <span className="text-xs text-slate-500">
                {language === "en" ? "Apply to all selected weeks" : "Toepassen op alle geselecteerde weken"}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyGlobalPreset(preset)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    globalPreset === preset.id
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {language === "en" ? preset.labelEn : preset.labelNl}
                </button>
              ))}
            </div>
          </section>

          {/* Week selector */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">
                {language === "en" ? "Select weeks & days" : "Kies weken en dagen"}
              </h3>
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                {totalTasks}{" "}
                {mode === "block"
                  ? (language === "en" ? (totalTasks === 1 ? "block" : "blocks") : (totalTasks === 1 ? "blok" : "blokken"))
                  : (language === "en" ? (totalTasks === 1 ? "task" : "tasks") : (totalTasks === 1 ? "taak" : "taken"))}
              </span>
            </div>

            {/* Week toggle row */}
            <div className="mb-3 flex flex-wrap gap-2">
              {weekMondayByOffset.map(({ offset, monday }) => {
                const weekNr = isoWeekNumberFromMonday(monday);
                const active = activeOffsets.has(offset);
                return (
                  <button
                    key={offset}
                    type="button"
                    onClick={() => handleToggleWeek(offset)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                      active
                        ? "bg-slate-900 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    Wk {weekNr}
                    {offset === 0 ? (
                      <span className="ml-1 text-[9px] opacity-70">●</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Per-week day rows */}
            {form.weekEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
                <p className="text-sm text-slate-500">
                  {language === "en"
                    ? "Select at least one week above to start planning."
                    : "Selecteer hierboven minimaal één week om te beginnen."}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {form.weekEntries.map((entry) => {
                  const weekInfo = weekMondayByOffset.find((w) => w.offset === entry.weekOffset);
                  const label = weekInfo
                    ? weekLabelFromMonday(weekInfo.monday, language)
                    : `Week +${entry.weekOffset}`;
                  return (
                    <WeekRow
                      key={entry.weekOffset}
                      language={language}
                      entry={entry}
                      label={label}
                      isFirst={entry.weekOffset === 0}
                      onToggleDay={(weekday) =>
                        dispatch({ type: "TOGGLE_DAY", weekOffset: entry.weekOffset, weekday })
                      }
                      onApplyPreset={(days) =>
                        dispatch({ type: "APPLY_PRESET_TO_WEEK", weekOffset: entry.weekOffset, days })
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* Summary bar */}
          {totalTasks > 0 && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{totalTasks}</span>{" "}
              {mode === "block"
                ? (language === "en"
                    ? `hour block${totalTasks === 1 ? "" : "s"} will be created across `
                    : `uurblok${totalTasks === 1 ? "" : "ken"} worden aangemaakt, verdeeld over `)
                : (language === "en"
                    ? `task${totalTasks === 1 ? "" : "s"} will be created across `
                    : `taak${totalTasks === 1 ? "" : "en"} worden aangemaakt, verdeeld over `)}
              <span className="font-semibold text-slate-900">{form.weekEntries.length}</span>{" "}
              {language === "en"
                ? `week${form.weekEntries.length === 1 ? "" : "s"}.`
                : `week${form.weekEntries.length === 1 ? "" : "en"}.`}
            </div>
          )}

          {submitError && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {submitError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            {t("Annuleer")}
          </button>
          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={() => void handleSubmit()}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:enabled:bg-slate-700"
          >
            {submitting
              ? (language === "en" ? "Saving…" : "Opslaan…")
              : mode === "block"
              ? (language === "en"
                  ? `Add ${totalTasks} block${totalTasks === 1 ? "" : "s"}`
                  : `${totalTasks} blok${totalTasks === 1 ? "" : "ken"} aanmaken`)
              : (language === "en"
                  ? `Add ${totalTasks} task${totalTasks === 1 ? "" : "s"}`
                  : `${totalTasks} taak${totalTasks === 1 ? "" : "en"} aanmaken`)}
          </button>
        </div>
      </div>
    </div>
  );
}
