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

    const range = {
      from: from?.trim() || null,
      to: to?.trim() || null,
    };

    const rangeError = validateNotesDateRange(range);
    if (rangeError) {
      const error = translateRangeError(rangeError, language);
      if (preview) {
        return Response.json({ error, count: 0, from: range.from, to: range.to, summary: "" }, { status: 400 });
      }
      return fail(error, 400);
    }

    const allWeeks = await db.listWeeks();
    const relevantWeeks = weeksOverlappingRange(allWeeks, range.from, range.to);
    const weeklyEntries = await Promise.all(
      relevantWeeks.map((week) =>
        db.getHoursByWeek(week.id).then((result) => ({ week, entries: result.entries })),
      ),
    );
    const allNotes = weeklyEntries.flatMap(({ week, entries }) => collectNotesFromEntries(week, entries));
    const bounds = buildNotesDateRangeBounds(range, timezone);
    const notes = filterNotesForExport(allNotes, bounds);

    if (preview) {
      const previewData = buildNotesExportPreview(notes.length, range, timezone, language);
      return Response.json(previewData, { status: 200 });
    }

    const today = getTodayInTimezone(timezone);
    const output = renderNotesExport(notes, format, timezone);
    const filename = buildExportFilename(format, today);

    return new Response(output instanceof Uint8Array ? new Blob([new Uint8Array(output)]) : output, {
      status: 200,
      headers: {
        "Content-Type": getExportContentType(format),
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return parseError(error);
  }
}
