"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolvePresetRange,
  validateNotesDateRange,
  type NotesExportFormat,
  type NotesExportPreset,
} from "@/lib/export/notes";
import type { AppLanguage } from "@/lib/i18n";
import { translateStatic } from "@/lib/i18n";

const SESSION_KEY = "weekplanner.notesExport.session";

const PREVIEW_DEBOUNCE_MS = 300;
const PREVIEW_TIMEOUT_MS = 15_000;

type StoredSession = {
  preset: NotesExportPreset;
  from: string;
  to: string;
  format: NotesExportFormat;
};

type NotesExportModalProps = {
  language: AppLanguage;
  timezone: string;
  onClose: () => void;
};

type PreviewState = {
  count: number;
  summary: string;
  loading: boolean;
  error: string | null;
};

const PRESET_OPTIONS: Array<{ id: NotesExportPreset; labelNl: string; labelEn: string }> = [
  { id: "all", labelNl: "Alle notities", labelEn: "All notes" },
  { id: "today", labelNl: "Vandaag", labelEn: "Today" },
  { id: "last_7_days", labelNl: "Laatste 7 dagen", labelEn: "Last 7 days" },
  { id: "last_30_days", labelNl: "Laatste 30 dagen", labelEn: "Last 30 days" },
  { id: "this_month", labelNl: "Deze maand", labelEn: "This month" },
  { id: "last_month", labelNl: "Vorige maand", labelEn: "Last month" },
  { id: "this_year", labelNl: "Dit jaar", labelEn: "This year" },
  { id: "custom", labelNl: "Aangepast bereik", labelEn: "Custom range" },
];

const FORMAT_OPTIONS: Array<{ id: NotesExportFormat; label: string }> = [
  { id: "txt", label: "TXT" },
  { id: "csv", label: "CSV" },
  { id: "json", label: "JSON" },
  { id: "pdf", label: "PDF" },
];

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(value: StoredSession) {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
}

function translateRangeError(message: string, language: AppLanguage): string {
  if (language === "en") {
    if (message === "De startdatum mag niet later zijn dan de einddatum.") {
      return "The start date cannot be later than the end date.";
    }
    if (message === "Ongeldige startdatum.") {
      return "Invalid start date.";
    }
    if (message === "Ongeldige einddatum.") {
      return "Invalid end date.";
    }
  }
  return message;
}

export function NotesExportModal({ language, timezone, onClose }: NotesExportModalProps) {
  const stored = useMemo(() => readStoredSession(), []);
  const t = useCallback((text: string) => translateStatic(language, text), [language]);

  const [format, setFormat] = useState<NotesExportFormat>(stored?.format ?? "txt");
  const [preset, setPreset] = useState<NotesExportPreset>(stored?.preset ?? "all");
  const [fromDate, setFromDate] = useState(stored?.from ?? "");
  const [toDate, setToDate] = useState(stored?.to ?? "");
  const [preview, setPreview] = useState<PreviewState>({
    count: 0,
    summary: "",
    loading: true,
    error: null,
  });

  const lastPreviewUrlRef = useRef<string | null>(null);

  const resolvedRange = useMemo(
    () => resolvePresetRange(preset, timezone, fromDate, toDate),
    [fromDate, preset, timezone, toDate],
  );

  const rangeValidationError = useMemo(() => validateNotesDateRange(resolvedRange), [resolvedRange]);

  const buildQueryParams = useCallback(
    (includePreview: boolean) => {
      const params = new URLSearchParams({
        timezone,
        lang: language,
      });
      if (includePreview) {
        params.set("preview", "1");
      } else {
        params.set("format", format);
      }
      if (resolvedRange.from) {
        params.set("from", resolvedRange.from);
      }
      if (resolvedRange.to) {
        params.set("to", resolvedRange.to);
      }
      return params;
    },
    [format, language, resolvedRange.from, resolvedRange.to, timezone],
  );

  const buildPreviewUrl = useCallback(() => `/api/export/notes?${buildQueryParams(true).toString()}`, [buildQueryParams]);
  const buildExportUrl = useCallback(() => `/api/export/notes?${buildQueryParams(false).toString()}`, [buildQueryParams]);

  useEffect(() => {
    writeStoredSession({
      preset,
      from: fromDate,
      to: toDate,
      format,
    });
  }, [format, fromDate, preset, toDate]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutController = new AbortController();

    async function loadPreview() {
      if (rangeValidationError) {
        const message = translateRangeError(rangeValidationError, language);
        setPreview({
          count: 0,
          summary: "",
          loading: false,
          error: message,
        });
        lastPreviewUrlRef.current = null;
        return;
      }

      const url = buildPreviewUrl();

      if (url === lastPreviewUrlRef.current) {
        console.log("[EXPORT] Preview URL unchanged, skipping fetch");
        setPreview((prev) => ({ ...prev, loading: false }));
        return;
      }

      console.log("[EXPORT] Preview fetch started:", url);
      setPreview((prev) => ({ ...prev, loading: true, error: null }));

      const timeoutId = window.setTimeout(() => {
        timeoutController.abort();
      }, PREVIEW_TIMEOUT_MS);

      try {
        const response = await fetch(url, { signal: AbortSignal.any([controller.signal, timeoutController.signal]) });
        const payload = (await response.json()) as {
          count?: number;
          summary?: string;
          error?: string;
        };

        if (cancelled) {
          return;
        }

        window.clearTimeout(timeoutId);

        if (!response.ok) {
          console.log("[EXPORT ERROR] Preview fetch failed:", payload.error ?? "Unknown error");
          setPreview({
            count: 0,
            summary: "",
            loading: false,
            error: payload.error ?? t("Voorbeeld laden mislukt."),
          });
          lastPreviewUrlRef.current = null;
          return;
        }

        console.log("[EXPORT] Preview fetch completed: count =", payload.count);
        lastPreviewUrlRef.current = url;
        setPreview({
          count: payload.count ?? 0,
          summary: payload.summary ?? "",
          loading: false,
          error: null,
        });
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        window.clearTimeout(timeoutId);
        const isTimeout = timeoutController.signal.aborted;
        console.log(
          isTimeout ? "[EXPORT ERROR] Preview fetch timeout" : "[EXPORT ERROR] Preview fetch failed",
          error instanceof Error ? error.message : String(error),
        );
        setPreview({
          count: 0,
          summary: "",
          loading: false,
          error: isTimeout
            ? (language === "en" ? "Preview timed out. Please try again." : "Voorbeeld laden duurde te lang. Probeer opnieuw.")
            : t("Voorbeeld laden mislukt."),
        });
        lastPreviewUrlRef.current = null;
      }
    }

    const debounceTimeout = window.setTimeout(() => {
      void loadPreview();
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(debounceTimeout);
    };
  }, [buildPreviewUrl, language, rangeValidationError, t]);

  const canExport = !rangeValidationError && !preview.error;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/65 p-4" onClick={onClose}>
      <div
        className="mx-auto max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{t("Export notities")}</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">{t("Notities exporteren")}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {t("Kies een formaat en datumbereik. Alleen notities binnen het bereik worden geëxporteerd.")}
            </p>
          </div>
          <button
            type="button"
            className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
            onClick={onClose}
          >
            {t("Sluiten")}
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{t("Formaat")}</p>
            <div className="grid grid-cols-4 gap-2">
              {FORMAT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`rounded-xl px-3 py-2 text-sm font-medium ${
                    format === option.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                  onClick={() => setFormat(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{t("Datumbereik")}</p>
            <select
              value={preset}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              onChange={(event) => setPreset(event.target.value as NotesExportPreset)}
            >
              {PRESET_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {language === "en" ? option.labelEn : option.labelNl}
                </option>
              ))}
            </select>
          </div>

          {preset === "custom" ? (
            <div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  {t("Van")}
                  <input
                    type="date"
                    value={fromDate}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    onChange={(event) => setFromDate(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  {t("Tot")}
                  <input
                    type="date"
                    value={toDate}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    onChange={(event) => setToDate(event.target.value)}
                  />
                </label>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {language === "en" ? "Format: MM/DD/YYYY" : "Formaat: DD/MM/JJJJ"}
              </p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {preview.loading ? (
              <p>{t("Aantal notities berekenen...")}</p>
            ) : preview.error ? (
              <p className="text-red-700">{preview.error}</p>
            ) : (
              <>
                <p className="font-medium text-slate-900">{preview.summary}</p>
                <p className="mt-1 text-slate-600">
                  {language === "en"
                    ? `${preview.count} matching ${preview.count === 1 ? "note" : "notes"}`
                    : `${preview.count} ${preview.count === 1 ? "overeenkomende notitie" : "overeenkomende notities"}`}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700"
            onClick={onClose}
          >
            {t("Annuleer")}
          </button>
          <a
            href={canExport ? buildExportUrl() : undefined}
            download={canExport ? undefined : undefined}
            className={`inline-block rounded-xl px-4 py-2 text-center text-sm font-medium ${
              canExport ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-slate-200 text-slate-400"
            }`}
            onClick={() => {
              if (canExport) {
                console.log("[EXPORT] Export button clicked");
                onClose();
              }
            }}
          >
            {t("Exporteren")}
          </a>
        </div>
      </div>
    </div>
  );
}