import { renderToBuffer } from "@react-pdf/renderer";
import { ensureAuth } from "@/lib/api/guards";
import { fail, parseError } from "@/lib/api/http";
import { db } from "@/lib/db/repository";
import {
  buildHoursExport,
  buildHoursExportFilename,
  getHoursExportContentType,
  parseHoursExportFormat,
  renderHoursCsv,
  renderHoursXlsx,
} from "@/lib/export/hours";
import { isIsoDate } from "@/lib/export/notes";
import { buildHoursReport } from "@/lib/export/pdf/HoursReport";
import { nowIso } from "@/lib/db/helpers";

export async function GET(request: Request) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const url = new URL(request.url);
    const format = parseHoursExportFormat(url.searchParams.get("format"));
    if (!format) {
      return fail("Kies een geldig exportformaat (xlsx, csv of pdf).", 400);
    }

    const startDate = url.searchParams.get("from");
    const endDate = url.searchParams.get("to");
    const projectName = url.searchParams.get("project");

    if (startDate && !isIsoDate(startDate)) {
      return fail("Ongeldige startdatum.", 400);
    }
    if (endDate && !isIsoDate(endDate)) {
      return fail("Ongeldige einddatum.", 400);
    }
    if (startDate && endDate && startDate > endDate) {
      return fail("De startdatum mag niet later zijn dan de einddatum.", 400);
    }

    const entries = await db.listHourEntriesByRange(startDate, endDate);
    const data = buildHoursExport(entries, {
      startDate,
      endDate,
      projectName: projectName?.trim() || null,
    });

    const filter = data.filter;
    let body: BodyInit;
    if (format === "csv") {
      body = renderHoursCsv(data);
    } else if (format === "xlsx") {
      body = new Uint8Array(await renderHoursXlsx(data));
    } else {
      const buffer = await renderToBuffer(buildHoursReport({ data, generatedAtIso: nowIso() }));
      body = new Uint8Array(buffer);
    }

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": getHoursExportContentType(format),
        "Content-Disposition": `attachment; filename="${buildHoursExportFilename(format, filter)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return parseError(error);
  }
}
