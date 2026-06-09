import type { HourEntry, WeekAggregate, WeekRecord } from "@/lib/db/types";

export type NotesExportFormat = "txt" | "csv" | "json" | "pdf";

export type NotesExportPreset =
  | "all"
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_month"
  | "this_year"
  | "custom";

export type NoteExportItem = {
  id: string;
  dayDate: string;
  weekday: string;
  weekLabel: string;
  weekKey: string;
  projectName: string;
  noteText: string;
  createdAt: string;
  updatedAt: string;
};

export type NotesDateRange = {
  from: string | null;
  to: string | null;
};

export type NotesDateRangeBounds = {
  startMs: number | null;
  endMs: number | null;
};

export type NotesExportPreview = {
  count: number;
  from: string | null;
  to: string | null;
  summary: string;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

export function validateNotesDateRange(range: NotesDateRange): string | null {
  if (range.from && !isIsoDate(range.from)) {
    return "Ongeldige startdatum.";
  }
  if (range.to && !isIsoDate(range.to)) {
    return "Ongeldige einddatum.";
  }
  if (range.from && range.to && range.from > range.to) {
    return "De startdatum mag niet later zijn dan de einddatum.";
  }
  return null;
}

export function getTodayInTimezone(timezone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day + days));
  const y = probe.getUTCFullYear();
  const m = String(probe.getUTCMonth() + 1).padStart(2, "0");
  const d = String(probe.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfMonth(isoDate: string): string {
  const [year, month] = isoDate.split("-");
  return `${year}-${month}-01`;
}

function endOfMonth(isoDate: string): string {
  const [year, month] = isoDate.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month, 0));
  const y = probe.getUTCFullYear();
  const m = String(probe.getUTCMonth() + 1).padStart(2, "0");
  const d = String(probe.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfYear(isoDate: string): string {
  const year = isoDate.split("-")[0];
  return `${year}-01-01`;
}

function endOfYear(isoDate: string): string {
  const year = isoDate.split("-")[0];
  return `${year}-12-31`;
}

export function resolvePresetRange(
  preset: NotesExportPreset,
  timezone: string,
  customFrom?: string | null,
  customTo?: string | null,
  at: Date = new Date(),
): NotesDateRange {
  const today = getTodayInTimezone(timezone, at);

  switch (preset) {
    case "all":
      return { from: null, to: null };
    case "today":
      return { from: today, to: today };
    case "last_7_days":
      return { from: addDays(today, -6), to: today };
    case "last_30_days":
      return { from: addDays(today, -29), to: today };
    case "this_month":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "last_month": {
      const previousMonthAnchor = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(previousMonthAnchor), to: endOfMonth(previousMonthAnchor) };
    }
    case "this_year":
      return { from: startOfYear(today), to: endOfYear(today) };
    case "custom":
      return {
        from: customFrom?.trim() || null,
        to: customTo?.trim() || null,
      };
    default:
      return { from: null, to: null };
  }
}

function getZonedOffsetMs(at: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(at).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.second) === 60 ? 59 : Number(parts.second),
    0,
  );
  return asUtc - at.getTime();
}

export function zonedDayStartUtc(isoDate: string, timezone: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  const offset = getZonedOffsetMs(new Date(utcGuess), timezone);
  const start = utcGuess - offset - 12 * 60 * 60 * 1000;
  return start;
}

export function zonedDayEndUtc(isoDate: string, timezone: string): number {
  return zonedDayStartUtc(isoDate, timezone) + 24 * 60 * 60 * 1000 - 1;
}

export function buildNotesDateRangeBounds(range: NotesDateRange, timezone: string): NotesDateRangeBounds {
  return {
    startMs: range.from ? zonedDayStartUtc(range.from, timezone) : null,
    endMs: range.to ? zonedDayEndUtc(range.to, timezone) : null,
  };
}

export function noteTimestampMs(entry: Pick<HourEntry, "createdAt" | "updatedAt">): number {
  const created = Date.parse(entry.createdAt);
  const updated = Date.parse(entry.updatedAt);
  const safeCreated = Number.isFinite(created) ? created : 0;
  const safeUpdated = Number.isFinite(updated) ? updated : safeCreated;
  return Math.max(safeCreated, safeUpdated);
}

export function isNoteInRange(
  entry: Pick<HourEntry, "createdAt" | "updatedAt">,
  bounds: NotesDateRangeBounds,
): boolean {
  if (bounds.startMs == null && bounds.endMs == null) {
    return true;
  }

  const createdMs = Date.parse(entry.createdAt);
  const updatedMs = Date.parse(entry.updatedAt);
  const timestamps = [createdMs, updatedMs].filter((value) => Number.isFinite(value));

  if (!timestamps.length) {
    return false;
  }

  return timestamps.some((value) => {
    if (bounds.startMs != null && value < bounds.startMs) {
      return false;
    }
    if (bounds.endMs != null && value > bounds.endMs) {
      return false;
    }
    return true;
  });
}

export function collectNoteExportItems(
  _weeks: WeekRecord[],
  aggregates: Array<WeekAggregate | null>,
): NoteExportItem[] {
  return aggregates
    .filter((aggregate): aggregate is WeekAggregate => Boolean(aggregate))
    .flatMap((aggregate) =>
      aggregate.hourEntries
        .filter((entry) => entry.noteText.trim().length > 0)
        .map<NoteExportItem>((entry) => ({
          id: entry.id,
          dayDate: entry.dayDate,
          weekday: entry.weekday,
          weekLabel: aggregate.week.weekLabel,
          weekKey: aggregate.week.weekKey,
          projectName: entry.projectName.trim(),
          noteText: entry.noteText.trim(),
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        })),
    )
    .sort(
      (a, b) =>
        a.dayDate.localeCompare(b.dayDate) ||
        a.weekKey.localeCompare(b.weekKey) ||
        a.projectName.localeCompare(b.projectName, "nl") ||
        noteTimestampMs({ createdAt: a.createdAt, updatedAt: a.updatedAt }) -
          noteTimestampMs({ createdAt: b.createdAt, updatedAt: b.updatedAt }),
    );
}

export function filterNotesForExport(notes: NoteExportItem[], bounds: NotesDateRangeBounds): NoteExportItem[] {
  return notes.filter((note) => isNoteInRange(note, bounds));
}

export function formatExportDate(date: string, timezone: string, locale = "nl-NL"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function formatRangeLabel(
  range: NotesDateRange,
  timezone: string,
  locale = "nl-NL",
): { fromLabel: string | null; toLabel: string | null } {
  return {
    fromLabel: range.from ? formatExportDate(range.from, timezone, locale) : null,
    toLabel: range.to ? formatExportDate(range.to, timezone, locale) : null,
  };
}

export function buildNotesExportPreview(
  count: number,
  range: NotesDateRange,
  timezone: string,
  language: "nl" | "en" = "nl",
): NotesExportPreview {
  const locale = language === "en" ? "en-GB" : "nl-NL";
  const { fromLabel, toLabel } = formatRangeLabel(range, timezone, locale);

  let summary: string;
  if (!range.from && !range.to) {
    summary =
      language === "en"
        ? `Exporting ${count} ${count === 1 ? "note" : "notes"} (all dates).`
        : `Exporteren van ${count} ${count === 1 ? "notitie" : "notities"} (alle datums).`;
  } else if (fromLabel && toLabel) {
    summary =
      language === "en"
        ? `Exporting ${count} ${count === 1 ? "note" : "notes"} from ${fromLabel} to ${toLabel}.`
        : `Exporteren van ${count} ${count === 1 ? "notitie" : "notities"} van ${fromLabel} t/m ${toLabel}.`;
  } else if (fromLabel) {
    summary =
      language === "en"
        ? `Exporting ${count} ${count === 1 ? "note" : "notes"} from ${fromLabel}.`
        : `Exporteren van ${count} ${count === 1 ? "notitie" : "notities"} vanaf ${fromLabel}.`;
  } else {
    summary =
      language === "en"
        ? `Exporting ${count} ${count === 1 ? "note" : "notes"} until ${toLabel}.`
        : `Exporteren van ${count} ${count === 1 ? "notitie" : "notities"} t/m ${toLabel}.`;
  }

  return {
    count,
    from: range.from,
    to: range.to,
    summary,
  };
}

function escCsv(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function formatNotesTxt(
  notes: NoteExportItem[],
  timezone: string,
  emptyMessage = "Geen reflecties of notities gevonden.",
): string {
  if (!notes.length) {
    return emptyMessage;
  }

  return notes
    .map((item) =>
      [
        `${formatExportDate(item.dayDate, timezone)} (${item.weekday})`,
        item.projectName ? `Project: ${item.projectName}` : null,
        `Week: ${item.weekLabel}`,
        item.noteText,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n--------------------\n\n");
}

export function formatNotesCsv(notes: NoteExportItem[], timezone: string): string {
  const rows = [
    ["day_date", "weekday", "week_label", "week_key", "project_name", "note_text", "created_at", "updated_at"].join(","),
    ...notes.map((item) =>
      [
        escCsv(item.dayDate),
        escCsv(item.weekday),
        escCsv(item.weekLabel),
        escCsv(item.weekKey),
        escCsv(item.projectName),
        escCsv(item.noteText),
        escCsv(item.createdAt),
        escCsv(item.updatedAt),
      ].join(","),
    ),
  ];
  return rows.join("\n");
}

export function formatNotesJson(notes: NoteExportItem[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: notes.length,
      notes,
    },
    null,
    2,
  );
}

function toPdfSafeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}

export function formatNotesPdf(notes: NoteExportItem[], timezone: string, title = "Reflecties en notities"): Uint8Array {
  const lines: string[] = [title, ""];
  if (!notes.length) {
    lines.push("Geen reflecties of notities gevonden.");
  } else {
    for (const item of notes) {
      lines.push(`${formatExportDate(item.dayDate, timezone)} (${item.weekday})`);
      if (item.projectName) {
        lines.push(`Project: ${item.projectName}`);
      }
      lines.push(`Week: ${item.weekLabel}`);
      lines.push(item.noteText);
      lines.push("");
      lines.push("--------------------");
      lines.push("");
    }
  }

  const contentLines = ["BT", "/F1 11 Tf", "50 780 Td", "14 TL"];
  for (const line of lines) {
    contentLines.push(`(${toPdfSafeText(line)}) Tj`);
    contentLines.push("T*");
  }
  contentLines.push("ET");
  const stream = contentLines.join("\n");
  const streamLength = new TextEncoder().encode(stream).length;

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export function parseNotesExportFormat(value: string | null): NotesExportFormat {
  if (value === "csv" || value === "json" || value === "pdf") {
    return value;
  }
  return "txt";
}

export function buildExportFilename(format: NotesExportFormat, today: string): string {
  const base = `reflecties-notities-${today}`;
  switch (format) {
    case "csv":
      return `${base}.csv`;
    case "json":
      return `${base}.json`;
    case "pdf":
      return `${base}.pdf`;
    default:
      return `${base}.txt`;
  }
}

export function getExportContentType(format: NotesExportFormat): string {
  switch (format) {
    case "csv":
      return "text/csv; charset=utf-8";
    case "json":
      return "application/json; charset=utf-8";
    case "pdf":
      return "application/pdf";
    default:
      return "text/plain; charset=utf-8";
  }
}

export function renderNotesExport(
  notes: NoteExportItem[],
  format: NotesExportFormat,
  timezone: string,
): string | Uint8Array {
  switch (format) {
    case "csv":
      return formatNotesCsv(notes, timezone);
    case "json":
      return formatNotesJson(notes);
    case "pdf":
      return formatNotesPdf(notes, timezone);
    default:
      return formatNotesTxt(notes, timezone);
  }
}
