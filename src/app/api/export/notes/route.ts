import { ensureAuth } from "@/lib/api/guards";
import { fail, parseError } from "@/lib/api/http";
import { db } from "@/lib/db/repository";
import {
  buildExportFilename,
  buildNotesDateRangeBounds,
  buildNotesExportPreview,
  collectNoteExportItems,
  filterNotesForExport,
  getExportContentType,
  getTodayInTimezone,
  parseNotesExportFormat,
  renderNotesExport,
  validateNotesDateRange,
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

    const weeks = await db.listWeeks();
    const aggregates = await Promise.all(weeks.map((week) => db.getWeekAggregate(week.id)));
    const allNotes = collectNoteExportItems(weeks, aggregates);
    const bounds = buildNotesDateRangeBounds(range, timezone);
    const notes = filterNotesForExport(allNotes, bounds);

    if (preview) {
      const previewData = buildNotesExportPreview(notes.length, range, timezone, language);
      return Response.json(previewData, { status: 200 });
    }

    const today = getTodayInTimezone(timezone);
    const output = renderNotesExport(notes, format, timezone);
    const filename = buildExportFilename(format, today);

    return new Response(output, {
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
