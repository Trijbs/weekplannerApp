import { parseDateMaybe, parseWeekday } from "@/lib/db/helpers";
import type { DayTaskInput, HourBlockInput, Priority, TaskStatus } from "@/lib/db/types";
import type { ParsedWorkbook } from "@/lib/import/excel-parser";
import { isoWeekRange } from "@/lib/api/week-target";

type CsvRow = Record<string, string>;

const REQUIRED_HEADERS = [
  "type",
  "week_key",
  "week_label",
  "weekday",
  "datum",
  "start",
  "einde",
  "titel",
  "info",
  "project",
  "deadline",
  "prioriteit",
  "status",
  "uren",
  "notitie",
] as const;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        value += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(value);
      value = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }

      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows.filter((currentRow) => currentRow.some((cell) => cell.trim().length > 0));
}

function rowsToObjects(rows: string[][]): CsvRow[] {
  const [headerRow, ...bodyRows] = rows;
  if (!headerRow) {
    throw new Error("CSV-bestand is leeg.");
  }

  const normalizedHeaders = headerRow.map((header) => header.trim());
  for (const requiredHeader of REQUIRED_HEADERS) {
    if (!normalizedHeaders.includes(requiredHeader)) {
      throw new Error(`CSV mist verplichte kolom: ${requiredHeader}`);
    }
  }

  return bodyRows.map((row) =>
    Object.fromEntries(normalizedHeaders.map((header, index) => [header, row[index]?.trim() ?? ""])),
  );
}

function parsePriority(value: string): Priority {
  return value === "hoog" || value === "laag" ? value : "middel";
}

function parseStatus(value: string): TaskStatus {
  return value === "bezig" || value === "klaar" ? value : "open";
}

function deriveWeekRange(weekKey: string, rows: CsvRow[]): { startDate: string; endDate: string } {
  const weekMatch = weekKey.match(/^week-(\d{4})-(\d{2})$/);
  if (weekMatch) {
    return isoWeekRange(Number(weekMatch[2]), Number(weekMatch[1]));
  }

  const dates = rows
    .map((row) => row.datum)
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();

  if (!dates.length) {
    throw new Error("CSV bevat geen week_key of datum om de weekrange te bepalen.");
  }

  return {
    startDate: dates[0] ?? "",
    endDate: dates[dates.length - 1] ?? "",
  };
}

export async function parseWeekplanningCsv(buffer: Buffer, fileName: string): Promise<ParsedWorkbook> {
  const text = buffer.toString("utf-8").replace(/^\uFEFF/, "");
  const rows = rowsToObjects(parseCsv(text));
  if (!rows.length) {
    throw new Error(`CSV-bestand ${fileName} bevat geen regels.`);
  }

  const firstRow = rows[0];
  const weekKey = firstRow?.week_key?.trim();
  if (!weekKey) {
    throw new Error("CSV bevat geen week_key.");
  }

  const weekLabel = firstRow.week_label?.trim() || weekKey;
  const { startDate, endDate } = deriveWeekRange(weekKey, rows);
  const tasks: DayTaskInput[] = [];
  const hourBlocks: HourBlockInput[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const rowType = row.type.trim().toLowerCase();

    if (rowType === "task") {
      const weekday = parseWeekday(row.weekday);
      const title = row.titel.trim();

      if (!weekday || !title) {
        warnings.push(`Taakregel overgeslagen in ${fileName}: ontbrekende dag of titel.`);
        continue;
      }

      tasks.push({
        weekday,
        title,
        info: row.info.trim(),
        deadlineAt: parseDateMaybe(row.deadline),
        priority: parsePriority(row.prioriteit.trim().toLowerCase()),
        status: parseStatus(row.status.trim().toLowerCase()),
      });
      continue;
    }

    if (rowType === "hour_block") {
      const weekday = parseWeekday(row.weekday);
      const taskText = row.titel.trim();
      const start = row.start.trim();
      const end = row.einde.trim();

      if (!weekday || !taskText || !start || !end) {
        warnings.push(`Uurblokregel overgeslagen in ${fileName}: onvolledige data.`);
        continue;
      }

      hourBlocks.push({
        weekday,
        dayDate: /^\d{4}-\d{2}-\d{2}$/.test(row.datum.trim()) ? row.datum.trim() : null,
        timeStart: start,
        timeEnd: end,
        taskText,
        projectText: row.project.trim(),
        deadlineAt: parseDateMaybe(row.deadline),
        status: parseStatus(row.status.trim().toLowerCase()),
      });
    }
  }

  return {
    weekKey,
    weekLabel,
    startDate,
    endDate,
    tasks,
    hourBlocks,
    warnings,
  };
}
