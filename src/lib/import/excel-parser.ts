import ExcelJS from "exceljs";
import { parseWeekday } from "@/lib/db/helpers";
import { WEEKDAYS, type DayTaskInput, type HourBlockInput, type TaskStatus, type Weekday } from "@/lib/db/types";

interface PlannerHeader {
  row: number;
  dayCol: number;
  taskCol: number;
  deadlineCol: number;
  priorityCol: number;
  statusCol: number;
}

interface TemplateHeader {
  row: number;
  dayCol?: number;
  dateCol?: number;
  taskCol?: number;
  projectCol?: number;
  deadlineCol?: number;
  timeStartCol?: number;
  timeEndCol?: number;
  timeRangeCol?: number;
}

export interface ParsedWorkbook {
  weekKey: string;
  weekLabel: string;
  startDate: string;
  endDate: string;
  tasks: DayTaskInput[];
  hourBlocks: HourBlockInput[];
  warnings: string[];
}

const dutchMonths: Record<string, number> = {
  januari: 1,
  jan: 1,
  februari: 2,
  feb: 2,
  maart: 3,
  mrt: 3,
  maa: 3,
  april: 4,
  apr: 4,
  mei: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  augustus: 8,
  aug: 8,
  september: 9,
  sep: 9,
  oktober: 10,
  okt: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

function amsterdamYear(): number {
  const yearText = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
  }).format(new Date());
  const year = Number(yearText);
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

function buildWeekKey(weekNumber: number, year: number): string {
  return `week-${year}-${String(weekNumber).padStart(2, "0")}`;
}

function normalize(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\w\s/:-]/g, "")
    .trim();
}

function asText(value: ExcelJS.CellValue | null | undefined): string {
  if (value == null) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if ("text" in value && typeof value.text === "string") {
    return value.text;
  }

  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((segment) => String(segment?.text ?? "")).join("");
  }

  if ("result" in value && value.result != null) {
    return String(value.result);
  }

  return "";
}

function excelSerialToDate(serial: number): Date {
  const serialEpochUtc = Date.UTC(1899, 11, 30);
  const millis = Math.round(serial * 24 * 60 * 60 * 1000);
  return new Date(serialEpochUtc + millis);
}

function parseDateString(raw: string): Date | null {
  const cleaned = raw.trim();
  if (!cleaned) {
    return null;
  }

  const nativeParsed = new Date(cleaned);
  if (!Number.isNaN(nativeParsed.getTime())) {
    return nativeParsed;
  }

  const numeric = cleaned.match(
    /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/,
  );
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const rawYear = Number(numeric[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const hour = Number(numeric[4] ?? "0");
    const minute = Number(numeric[5] ?? "0");
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return new Date(Date.UTC(year, month - 1, day, hour, minute));
    }
  }

  const monthName = normalize(cleaned).match(
    /^(\d{1,2})\s+([a-z]+)(?:\s+(\d{2,4}))?(?:[ T](\d{1,2}):(\d{2}))?$/,
  );
  if (monthName) {
    const day = Number(monthName[1]);
    const month = dutchMonths[monthName[2]];
    const rawYear = Number(monthName[3] ?? `${amsterdamYear()}`);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const hour = Number(monthName[4] ?? "0");
    const minute = Number(monthName[5] ?? "0");
    if (month && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, hour, minute));
    }
  }

  return null;
}

function parseDateCellToDate(value: ExcelJS.CellValue | null | undefined): Date | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialToDate(value);
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return parseDateString(String(value));
  }

  if (typeof value === "object" && value !== null && "result" in value && value.result != null) {
    return parseDateCellToDate(value.result as ExcelJS.CellValue);
  }

  if (typeof value === "object" && value !== null && "text" in value && typeof value.text === "string") {
    return parseDateString(value.text);
  }

  if (typeof value === "object" && value !== null && "richText" in value && Array.isArray(value.richText)) {
    const text = value.richText.map((segment) => String(segment?.text ?? "")).join("");
    return parseDateString(text);
  }

  return null;
}

function parseDateCellToIso(value: ExcelJS.CellValue | null | undefined): string | null {
  const parsed = parseDateCellToDate(value);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function parseTimeToMinutes(time: string): number | null {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function toTimeText(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseTimeValue(value: ExcelJS.CellValue | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return toTimeText(value.getUTCHours(), value.getUTCMinutes());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const fraction = ((value % 1) + 1) % 1;
    const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return toTimeText(hours, minutes);
  }

  if (typeof value === "string" || typeof value === "boolean") {
    const text = String(value).trim();
    const hm = text.match(/^(\d{1,2})[:.](\d{2})$/);
    if (hm) {
      return toTimeText(Number(hm[1]), Number(hm[2]));
    }

    const hOnly = text.match(/^(\d{1,2})\s*(?:u|uur)?$/i);
    if (hOnly) {
      return toTimeText(Number(hOnly[1]), 0);
    }
  }

  if (typeof value === "object" && value !== null && "result" in value && value.result != null) {
    return parseTimeValue(value.result as ExcelJS.CellValue);
  }

  if (typeof value === "object" && value !== null && "text" in value && typeof value.text === "string") {
    return parseTimeValue(value.text);
  }

  if (typeof value === "object" && value !== null && "richText" in value && Array.isArray(value.richText)) {
    const text = value.richText.map((segment) => String(segment?.text ?? "")).join("");
    return parseTimeValue(text);
  }

  return null;
}

function parseTimeRange(raw: string): { start: string; end: string } | null {
  const cleaned = raw.trim();
  const match = cleaned.match(/^(\d{1,2}[:.]\d{2})\s*[–-]\s*(\d{1,2}[:.]\d{2})$/);
  if (!match) {
    return null;
  }

  const start = match[1].replace(".", ":").padStart(5, "0");
  const end = match[2].replace(".", ":").padStart(5, "0");
  return { start, end };
}

function parsePriority(raw: string): "hoog" | "middel" | "laag" {
  const normalized = normalize(raw);
  if (normalized.includes("hoog")) {
    return "hoog";
  }
  if (normalized.includes("laag")) {
    return "laag";
  }
  return "middel";
}

function parseStatus(raw: string): TaskStatus {
  const normalized = normalize(raw);

  if (
    normalized.includes("klaar") ||
    normalized.includes("done") ||
    normalized.includes("af") ||
    normalized.includes("☑") ||
    normalized.includes("✓")
  ) {
    return "klaar";
  }

  if (normalized.includes("bezig") || normalized.includes("in uitvoering") || normalized.includes("doing")) {
    return "bezig";
  }

  return "open";
}

function parseRangeFromLabel(value: string): { startDate: string; endDate: string } | null {
  const normalized = normalize(value);
  const match = normalized.match(/week\s*:\s*(\d{1,2})\s+([a-z]+)\s+t\/?m\s*(\d{1,2})\s+([a-z]+)/i);

  if (!match) {
    return null;
  }

  const [, d1, m1, d2, m2] = match;
  const month1 = dutchMonths[m1];
  const month2 = dutchMonths[m2];
  if (!month1 || !month2) {
    return null;
  }

  const year = amsterdamYear();
  const endYear = month2 < month1 || (month2 === month1 && Number(d2) < Number(d1)) ? year + 1 : year;
  const startDate = `${year}-${String(month1).padStart(2, "0")}-${String(Number(d1)).padStart(2, "0")}`;
  const endDate = `${endYear}-${String(month2).padStart(2, "0")}-${String(Number(d2)).padStart(2, "0")}`;

  return { startDate, endDate };
}

function weekNumberFromDate(dateStr: string): number {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const dayNr = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diff = date.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / 604800000);
}

function isoWeekRange(weekNumber: number, year = amsterdamYear()): { startDate: string; endDate: string } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));

  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (weekNumber - 1) * 7);

  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);

  return {
    startDate: monday.toISOString().slice(0, 10),
    endDate: friday.toISOString().slice(0, 10),
  };
}

function extractWeekNumber(fileName: string): number | null {
  const match = fileName.match(/week\s*(\d{1,2})/i);
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function findPlannerHeader(sheet: ExcelJS.Worksheet): PlannerHeader | null {
  for (let row = 1; row <= Math.min(sheet.rowCount, 100); row += 1) {
    const headers: Record<string, number> = {};

    for (let col = 1; col <= 12; col += 1) {
      const value = normalize(asText(sheet.getRow(row).getCell(col).value));
      if (!value) {
        continue;
      }

      if (value === "dag") headers.dayCol = col;
      if (value.includes("taken") || value.includes("werkzaamheden")) headers.taskCol = col;
      if (value.includes("deadline")) headers.deadlineCol = col;
      if (value.includes("prioriteit")) headers.priorityCol = col;
      if (value.includes("status")) headers.statusCol = col;
    }

    if (headers.dayCol && headers.taskCol && headers.deadlineCol && headers.priorityCol && headers.statusCol) {
      return {
        row,
        dayCol: headers.dayCol,
        taskCol: headers.taskCol,
        deadlineCol: headers.deadlineCol,
        priorityCol: headers.priorityCol,
        statusCol: headers.statusCol,
      };
    }
  }

  return null;
}

function parsePlannerTasks(sheet: ExcelJS.Worksheet, header: PlannerHeader): DayTaskInput[] {
  const results: DayTaskInput[] = [];
  const positionByDay = new Map<Weekday, number>();
  let currentWeekday: Weekday | null = null;

  for (let row = header.row + 1; row <= Math.min(sheet.rowCount, header.row + 40); row += 1) {
    const rowRef = sheet.getRow(row);
    const dayLabel = asText(rowRef.getCell(header.dayCol).value).trim();

    if (dayLabel) {
      const parsed = parseWeekday(dayLabel);
      if (!parsed) {
        break;
      }
      currentWeekday = parsed;
    }

    if (!currentWeekday) {
      continue;
    }

    const title = asText(rowRef.getCell(header.taskCol).value).trim();
    const deadlineRaw = rowRef.getCell(header.deadlineCol).value;
    const priorityRaw = asText(rowRef.getCell(header.priorityCol).value);
    const statusRaw = asText(rowRef.getCell(header.statusCol).value);

    if (!title) {
      continue;
    }

    const weekday = currentWeekday;
    const currentPosition = positionByDay.get(weekday) ?? 0;
    positionByDay.set(weekday, currentPosition + 1);

    results.push({
      weekday,
      title: title || "Onbenoemde taak",
      info: title,
      deadlineAt: parseDateCellToIso(deadlineRaw),
      priority: parsePriority(priorityRaw),
      status: parseStatus(statusRaw),
      position: currentPosition,
      source: "import",
    });
  }

  return results;
}

function parseDayDate(sectionHeader: string, yearHint: number): { dayDate: string | null; weekday: Weekday | null } {
  const normalized = normalize(sectionHeader);
  const weekday =
    parseWeekday(normalized.split(" ").at(-1) ?? "") ||
    parseWeekday(normalized.replace("tijd / dag", "").trim());

  const dateMatch = normalized.match(/(\d{1,2})\s+([a-z]+)/i);
  if (!dateMatch) {
    return { dayDate: null, weekday: weekday ?? null };
  }

  const day = Number(dateMatch[1]);
  const month = dutchMonths[dateMatch[2]];
  if (!month) {
    return { dayDate: null, weekday: weekday ?? null };
  }

  const year = Number.isFinite(yearHint) ? yearHint : amsterdamYear();
  return {
    dayDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    weekday: weekday ?? null,
  };
}

function weekdayFromIsoDate(isoDate: string): Weekday | null {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const day = date.getUTCDay();
  if (day === 1) return "maandag";
  if (day === 2) return "dinsdag";
  if (day === 3) return "woensdag";
  if (day === 4) return "donderdag";
  if (day === 5) return "vrijdag";
  if (day === 6) return "zaterdag";
  if (day === 0) return "zondag";
  return null;
}

function addBusinessDays(baseIsoDate: string, businessDays: number): string {
  const date = new Date(`${baseIsoDate}T00:00:00Z`);
  let remaining = businessDays;

  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day >= 1 && day <= 5) {
      remaining -= 1;
    }
  }

  return date.toISOString().slice(0, 10);
}

function normalizeHourBlockDates(blocks: HourBlockInput[]): HourBlockInput[] {
  const validAnchors = blocks
    .filter((block) => block.dayDate)
    .filter((block) => weekdayFromIsoDate(block.dayDate as string) === block.weekday)
    .sort((a, b) => (a.dayDate ?? "").localeCompare(b.dayDate ?? ""));

  const anchor = validAnchors[0];
  if (!anchor?.dayDate) {
    return blocks;
  }

  const anchorIndex = WEEKDAYS.indexOf(anchor.weekday);
  if (anchorIndex < 0) {
    return blocks;
  }

  return blocks.map((block) => {
    const blockIndex = WEEKDAYS.indexOf(block.weekday);
    if (blockIndex < 0) {
      return block;
    }

    const diff = (blockIndex - anchorIndex + WEEKDAYS.length) % WEEKDAYS.length;
    const normalizedDayDate = addBusinessDays(anchor.dayDate as string, diff);

    return {
      ...block,
      dayDate: normalizedDayDate,
    };
  });
}

function parseHourBlocks(sheet: ExcelJS.Worksheet, yearHint: number): HourBlockInput[] {
  const rawResults: HourBlockInput[] = [];

  for (let row = 1; row <= sheet.rowCount; row += 1) {
    const sectionHeader = asText(sheet.getRow(row).getCell(4).value);
    if (!normalize(sectionHeader).startsWith("tijd / dag")) {
      continue;
    }

    const { dayDate, weekday } = parseDayDate(sectionHeader, yearHint);
    if (!weekday) {
      continue;
    }

    let position = 0;
    let blankCount = 0;

    for (let scan = row + 1; scan <= Math.min(sheet.rowCount, row + 24); scan += 1) {
      const rowRef = sheet.getRow(scan);
      const timeRaw = asText(rowRef.getCell(4).value).trim();
      const range = parseTimeRange(timeRaw);

      if (!range) {
        blankCount += 1;
        if (blankCount >= 2) {
          break;
        }
        continue;
      }

      blankCount = 0;

      rawResults.push({
        weekday,
        dayDate,
        timeStart: range.start,
        timeEnd: range.end,
        taskText: asText(rowRef.getCell(5).value).trim(),
        projectText: asText(rowRef.getCell(6).value).trim(),
        deadlineAt: parseDateCellToIso(rowRef.getCell(7).value),
        status: parseStatus(asText(rowRef.getCell(8).value)),
        position,
        source: "import",
      });

      position += 1;
    }
  }

  return normalizeHourBlockDates(rawResults);
}

function findTemplateHeader(sheet: ExcelJS.Worksheet): TemplateHeader | null {
  for (let row = 1; row <= Math.min(sheet.rowCount, 140); row += 1) {
    const header: TemplateHeader = { row };

    for (let col = 1; col <= 20; col += 1) {
      const label = normalize(asText(sheet.getRow(row).getCell(col).value));
      if (!label) {
        continue;
      }

      if (label === "dag" || label.includes("weekdag") || label.includes("weekday")) {
        header.dayCol = col;
      }
      if (label.includes("datum") || label === "date") {
        header.dateCol = col;
      }
      if (label.includes("project") || label.includes("categorie") || label.includes("category")) {
        header.projectCol = col;
      }
      if (
        label.includes("taak") ||
        label.includes("taken") ||
        label.includes("werkzaam") ||
        label.includes("activiteit") ||
        label.includes("omschrijving")
      ) {
        header.taskCol = col;
      }
      if (label.includes("deadline") || label.includes("due")) {
        header.deadlineCol = col;
      }
      if ((label.includes("start") || label.includes("begin") || label === "van") && (label.includes("tijd") || label.includes("uur") || label === "start")) {
        header.timeStartCol = col;
      }
      if ((label.includes("eind") || label === "tot") && (label.includes("tijd") || label.includes("uur") || label === "eind")) {
        header.timeEndCol = col;
      }
      if (label === "tijd" || label.includes("tijdblok") || label.includes("tijd van")) {
        header.timeRangeCol = col;
      }
    }

    const hasCoreContent = Boolean(header.taskCol || header.projectCol);
    const hasScheduleSignal = Boolean(
      header.deadlineCol ||
      header.dateCol ||
      header.dayCol ||
      header.timeRangeCol ||
      (header.timeStartCol && header.timeEndCol),
    );

    if (hasCoreContent && hasScheduleSignal) {
      return header;
    }
  }

  return null;
}

function weekdayDateMapForRange(range: { startDate: string; endDate: string }): Partial<Record<Weekday, string>> {
  const map: Partial<Record<Weekday, string>> = {};
  let cursor = range.startDate;

  while (cursor <= range.endDate) {
    const weekday = weekdayFromIsoDate(cursor);
    if (weekday && !map[weekday]) {
      map[weekday] = cursor;
    }

    const date = new Date(`${cursor}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    cursor = date.toISOString().slice(0, 10);
  }

  return map;
}

function parseTemplateRows(
  sheet: ExcelJS.Worksheet,
  header: TemplateHeader,
  range: { startDate: string; endDate: string },
): { tasks: DayTaskInput[]; hourBlocks: HourBlockInput[] } {
  const tasks: DayTaskInput[] = [];
  const hourBlocks: HourBlockInput[] = [];
  const taskPositionByDay = new Map<Weekday, number>();
  const blockPositionByDay = new Map<Weekday, number>();
  const fallbackDatesByDay = weekdayDateMapForRange(range);

  let emptyStreak = 0;
  for (let row = header.row + 1; row <= Math.min(sheet.rowCount, header.row + 600); row += 1) {
    const rowRef = sheet.getRow(row);
    const rawTask = header.taskCol ? asText(rowRef.getCell(header.taskCol).value).trim() : "";
    const rawProject = header.projectCol ? asText(rowRef.getCell(header.projectCol).value).trim() : "";
    const deadlineAt = header.deadlineCol ? parseDateCellToIso(rowRef.getCell(header.deadlineCol).value) : null;
    const dayDateFromCell = header.dateCol ? parseDateCellToIso(rowRef.getCell(header.dateCol).value) : null;
    let dayDate = dayDateFromCell?.slice(0, 10) ?? null;
    if (!dayDate && deadlineAt) {
      dayDate = deadlineAt.slice(0, 10);
    }

    let weekday = header.dayCol ? parseWeekday(asText(rowRef.getCell(header.dayCol).value).trim()) : null;
    if (!weekday && dayDate) {
      weekday = weekdayFromIsoDate(dayDate);
    }
    if (!dayDate && weekday) {
      dayDate = fallbackDatesByDay[weekday] ?? null;
    }

    let timeStart = header.timeStartCol ? parseTimeValue(rowRef.getCell(header.timeStartCol).value) : null;
    let timeEnd = header.timeEndCol ? parseTimeValue(rowRef.getCell(header.timeEndCol).value) : null;

    if ((!timeStart || !timeEnd) && header.timeRangeCol) {
      const rangeMatch = parseTimeRange(asText(rowRef.getCell(header.timeRangeCol).value));
      if (rangeMatch) {
        timeStart = rangeMatch.start;
        timeEnd = rangeMatch.end;
      }
    }

    const hasAnyData = Boolean(rawTask || rawProject || deadlineAt || dayDate || timeStart || timeEnd);
    if (!hasAnyData) {
      emptyStreak += 1;
      if (emptyStreak >= 25) {
        break;
      }
      continue;
    }
    emptyStreak = 0;

    if (weekday && (rawTask || rawProject)) {
      const title = rawTask || rawProject;
      const info = rawProject && rawProject !== title ? `Project: ${rawProject}` : "";
      const nextPosition = taskPositionByDay.get(weekday) ?? 0;
      taskPositionByDay.set(weekday, nextPosition + 1);

      tasks.push({
        weekday,
        title,
        info,
        deadlineAt,
        priority: "middel",
        status: "open",
        position: nextPosition,
        source: "import",
      });
    }

    if (weekday && timeStart && timeEnd) {
      const startMinutes = parseTimeToMinutes(timeStart);
      const endMinutes = parseTimeToMinutes(timeEnd);
      if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
        continue;
      }

      const nextPosition = blockPositionByDay.get(weekday) ?? 0;
      blockPositionByDay.set(weekday, nextPosition + 1);

      hourBlocks.push({
        weekday,
        dayDate,
        timeStart,
        timeEnd,
        taskText: rawTask || rawProject,
        projectText: rawProject,
        deadlineAt,
        status: "open",
        position: nextPosition,
        source: "import",
      });
    }
  }

  return { tasks, hourBlocks };
}

function taskMergeKey(input: DayTaskInput): string {
  return `${input.weekday}|${normalize(input.title)}|${(input.deadlineAt ?? "").slice(0, 16)}`;
}

function blockMergeKey(input: HourBlockInput): string {
  return [
    input.weekday,
    input.dayDate ?? "",
    input.timeStart,
    input.timeEnd,
    normalize(input.taskText ?? ""),
    normalize(input.projectText ?? ""),
  ].join("|");
}

function mergeTasks(primary: DayTaskInput[], secondary: DayTaskInput[]): DayTaskInput[] {
  const merged = primary.slice();
  const seen = new Set(merged.map(taskMergeKey));

  for (const item of secondary) {
    const key = taskMergeKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function mergeHourBlocks(primary: HourBlockInput[], secondary: HourBlockInput[]): HourBlockInput[] {
  const merged = primary.slice();
  const seen = new Set(merged.map(blockMergeKey));

  for (const item of secondary) {
    const key = blockMergeKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function weekFallback(fileName: string): {
  weekNumber: number;
  weekKey: string;
  weekLabel: string;
  startDate: string;
  endDate: string;
} {
  const weekNumber = extractWeekNumber(fileName) ?? 1;
  const range = isoWeekRange(weekNumber);
  const year = Number(range.startDate.slice(0, 4));

  return {
    weekNumber,
    weekKey: buildWeekKey(weekNumber, year),
    weekLabel: `Week ${weekNumber}`,
    ...range,
  };
}

export async function parseWeekplanningWorkbook(buffer: Buffer, fileName: string): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("Werkblad ontbreekt in het Excel-bestand.");
  }

  const warnings: string[] = [];
  const fallback = weekFallback(fileName);
  const explicitWeekNumber = extractWeekNumber(fileName);

  let weekLabel = explicitWeekNumber ? `Week ${explicitWeekNumber}` : fallback.weekLabel;
  let weekKey = explicitWeekNumber
    ? buildWeekKey(explicitWeekNumber, Number(fallback.startDate.slice(0, 4)))
    : fallback.weekKey;
  let startDate = fallback.startDate;
  let endDate = fallback.endDate;
  let rangeDetected = false;

  for (let row = 1; row <= Math.min(sheet.rowCount, 40); row += 1) {
    const label = asText(sheet.getRow(row).getCell(1).value).trim();
    if (!label) {
      continue;
    }

    if (normalize(label).startsWith("week:")) {
      if (!explicitWeekNumber) {
        weekLabel = label.replace(/^week:\s*/i, "Week ").trim();
      }
      const parsed = parseRangeFromLabel(label);
      if (parsed && !explicitWeekNumber) {
        startDate = parsed.startDate;
        endDate = parsed.endDate;
        rangeDetected = true;
      }
    }
  }

  if (!explicitWeekNumber && rangeDetected) {
    const derivedWeek = weekNumberFromDate(startDate);
    weekKey = buildWeekKey(derivedWeek, Number(startDate.slice(0, 4)));
    weekLabel = `Week ${derivedWeek}`;
    const alignedRange = isoWeekRange(derivedWeek, Number(startDate.slice(0, 4)));
    startDate = alignedRange.startDate;
    endDate = alignedRange.endDate;
  }

  if (explicitWeekNumber) {
    const alignedRange = isoWeekRange(explicitWeekNumber, Number(startDate.slice(0, 4)));
    startDate = alignedRange.startDate;
    endDate = alignedRange.endDate;
    weekKey = buildWeekKey(explicitWeekNumber, Number(startDate.slice(0, 4)));
  }

  if (!weekKey) {
    warnings.push("Weeknummer niet gevonden in bestandsnaam; fallback gebruikt.");
    weekKey = fallback.weekKey;
  }

  const plannerHeader = findPlannerHeader(sheet);
  const plannerTasks = plannerHeader ? parsePlannerTasks(sheet, plannerHeader) : [];
  if (!plannerHeader) {
    warnings.push("Planner-kopregel niet gevonden (Dag/Taken/Deadline/Prioriteit/Status).");
  }

  const parsedHourBlocks = parseHourBlocks(sheet, Number(startDate.slice(0, 4)));
  const templateHeader = findTemplateHeader(sheet);
  const templateParsed = templateHeader
    ? parseTemplateRows(sheet, templateHeader, { startDate, endDate })
    : { tasks: [] as DayTaskInput[], hourBlocks: [] as HourBlockInput[] };

  const tasks = mergeTasks(plannerTasks, templateParsed.tasks);
  const hourBlocks = mergeHourBlocks(parsedHourBlocks, templateParsed.hourBlocks);

  if (templateHeader && (templateParsed.tasks.length > 0 || templateParsed.hourBlocks.length > 0)) {
    warnings.push("Template-import toegepast (projecten/deadlines/tijden).");
  }

  if (hourBlocks.length === 0) {
    warnings.push("Geen uurblokken gevonden onder 'Tijd / Dag' of template-kolommen.");
  } else {
    const datedBlocks = hourBlocks
      .map((block) => block.dayDate)
      .filter((value): value is string => Boolean(value))
      .sort();
    const uniqueWeekdays = new Set(hourBlocks.map((block) => block.weekday));

    if (datedBlocks.length > 0 && uniqueWeekdays.size >= 2) {
      startDate = datedBlocks[0];
      endDate = datedBlocks[datedBlocks.length - 1];
    }
  }

  const finalWeekNumber = explicitWeekNumber ?? weekNumberFromDate(startDate);
  weekKey = buildWeekKey(finalWeekNumber, Number(startDate.slice(0, 4)));
  if (!explicitWeekNumber) {
    weekLabel = `Week ${finalWeekNumber}`;
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
