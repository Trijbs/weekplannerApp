import type { WeekRecord, HourEntry } from "@/lib/db/types";
import { ensureAuth } from "@/lib/api/guards";
import { fail, parseError } from "@/lib/api/http";
import { db } from "@/lib/db/repository";
import {
  buildExportFilename,
  buildNotesDateRangeBounds,
  buildNotesExportPreview,
  filterNotesForExport,
  getExportContentType,
  getTodayInTimezone,
  noteTimestampMs,
  parseNotesExportFormat,
  renderNotesExport,
  validateNotesDateRange,
  type NoteExportItem,
} from "@/lib/export/notes";

const DEFAULT_TIMEZONE = "Europe/Amsterdam";
const EXPORT_TIMEOUT_MS = 30_000;

function translateRangeError(message: string, language: "nl" | "en"): string {
  if (language === "nl") {
    return message;
  }
  if (message === "De startdatum mag niet later zijn dan de einddatum.") {
    return "The start date cannot be later than the end date.";
  }
  if (message === "Ongeldige startdatum.") {
    return "Invalid start date.";
  }
  if (message === "Ongeldige einddatum.") {
    return "Invalid end date.";
  }
  return message;
}

function weeksOverlappingRange(weeks: WeekRecord[], from: string | null, to: string | null): WeekRecord[] {
  if (!from && !to) {
    return weeks;
  }
  return weeks.filter((week) => {
    if (from && week.endDate < from) {
      return false;
    }
    if (to && week.startDate > to) {
      return false;
    }
    return true;
  });
}

function collectNotesFromEntries(week: WeekRecord, entries: HourEntry[]): NoteExportItem[] {
  return entries
    .filter((entry) => entry.noteText.trim().length > 0)
    .map((entry) => ({
      id: entry.id,
      dayDate: entry.dayDate,
      weekday: entry.weekday,
      weekLabel: week.weekLabel,
      weekKey: week.weekKey,
      projectName: entry.projectName.trim(),
      noteText: entry.noteText.trim(),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }))
    .sort(
      (a, b) =>
        a.dayDate.localeCompare(b.dayDate) ||
        a.weekKey.localeCompare(b.weekKey) ||
        a.projectName.localeCompare(b.projectName, "nl") ||
        noteTimestampMs({ createdAt: a.createdAt, updatedAt: a.updatedAt }) -
          noteTimestampMs({ createdAt: b.createdAt, updatedAt: b.updatedAt }),
    );
}

export async function GET(request: Request) {
  const logPrefix = "[EXPORT]";
  const startTime = Date.now();

  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const url = new URL(request.url);
    const preview = url.searchParams.get("preview") === "1";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const timezone = url.searchParams.get("timezone")?.trim() || DEFAULT_TIMEZONE;
    const format = parseNotesExportFormat(url.searchParams.get("format"));
    const language = url.searchParams.get("lang") === "en" ? "en" : "nl";

    console.log(`${logPrefix} Request received: preview=${preview}, format=${format}, from=${from ?? "null"}, to=${to ?? "null"}, timezone=${timezone}, lang=${language}`);

    const range = {
      from: from?.trim() || null,
      to: to?.trim() || null,
    };

    const rangeError = validateNotesDateRange(range);
    if (rangeError) {
      const error = translateRangeError(rangeError, language);
      console.log(`${logPrefix} ERROR Date range validation failed: ${error}`);
      if (preview) {
        return Response.json({ error, count: 0, from: range.from, to: range.to, summary: "" }, { status: 400 });
      }
      return fail(error, 400);
    }

    const bounds = buildNotesDateRangeBounds(range, timezone);
    console.log(`${logPrefix} Date range bounds: startMs=${bounds.startMs ?? "null"}, endMs=${bounds.endMs ?? "null"}`);

    if (preview) {
      const count = await db.countNotesForExport(bounds);
      const previewData = buildNotesExportPreview(count, range, timezone, language);
      console.log(`${logPrefix} Preview count: ${count} (${Date.now() - startTime}ms)`);
      return Response.json(previewData, { status: 200 });
    }

    const timeoutSignal = AbortSignal.timeout(EXPORT_TIMEOUT_MS);

    const exportResult = await Promise.race([
      (async () => {
        const allWeeks = await db.listWeeks();
        const relevantWeeks = weeksOverlappingRange(allWeeks, range.from, range.to);
        console.log(`${logPrefix} Matching notes count: fetching from ${relevantWeeks.length} weeks`);

        const weeklyEntries = await Promise.all(
          relevantWeeks.map((week) =>
            db.getHoursByWeek(week.id).then((result) => ({ week, entries: result.entries })),
          ),
        );
        const allNotes = weeklyEntries.flatMap(({ week, entries }) => collectNotesFromEntries(week, entries));
        const notes = filterNotesForExport(allNotes, bounds);

        console.log(`${logPrefix} Notes fetched successfully: ${notes.length} notes (${Date.now() - startTime}ms)`);

        const today = getTodayInTimezone(timezone);
        const output = renderNotesExport(notes, format, timezone);
        const filename = buildExportFilename(format, today);

        console.log(`${logPrefix} Export file generated: format=${format}, size=${typeof output === "string" ? output.length : output.byteLength} bytes (${Date.now() - startTime}ms)`);

        return new Response(output instanceof Uint8Array ? new Blob([new Uint8Array(output)]) : output, {
          status: 200,
          headers: {
            "Content-Type": getExportContentType(format),
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      })(),
      new Promise<never>((_, reject) => {
        timeoutSignal.addEventListener("abort", () => {
          console.log(`${logPrefix} ERROR Export generation timed out after ${EXPORT_TIMEOUT_MS}ms`);
          reject(new Error(`Export generation timed out after ${EXPORT_TIMEOUT_MS / 1000} seconds.`));
        });
      }),
    ]);

    console.log(`${logPrefix} Export completed successfully (${Date.now() - startTime}ms)`);
    return exportResult;
  } catch (error) {
    console.log(`[EXPORT ERROR] Export generation failed: ${error instanceof Error ? error.message : String(error)}`);
    return parseError(error);
  }
}