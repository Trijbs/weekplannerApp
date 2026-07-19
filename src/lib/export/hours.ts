import ExcelJS from "exceljs";
import type { HourEntry, Weekday } from "@/lib/db/types";

export type HoursExportFormat = "xlsx" | "csv" | "pdf";

export type HoursExportFilter = {
  startDate: string | null;
  endDate: string | null;
  projectName: string | null;
};

export type HoursExportOrigin = "gepland" | "handmatig";

export type HoursExportRow = {
  id: string;
  dayDate: string;
  weekday: Weekday;
  title: string;
  projectName: string;
  hoursDecimal: number;
  origin: HoursExportOrigin;
};

export type HoursExportData = {
  rows: HoursExportRow[];
  perDayTotals: Array<{ dayDate: string; totalHours: number }>;
  perProjectTotals: Array<{ projectName: string; totalHours: number }>;
  totalHours: number;
  filter: HoursExportFilter;
};

export function parseHoursExportFormat(value: string | null): HoursExportFormat | null {
  if (value === "xlsx" || value === "csv" || value === "pdf") {
    return value;
  }
  return null;
}

export function buildHoursExport(entries: HourEntry[], filter: HoursExportFilter): HoursExportData {
  const projectFilter = filter.projectName?.trim().toLowerCase() ?? null;

  const rows: HoursExportRow[] = entries
    .filter((entry) => {
      if (entry.status !== "registered") {
        return false;
      }
      if (filter.startDate && entry.dayDate < filter.startDate) {
        return false;
      }
      if (filter.endDate && entry.dayDate > filter.endDate) {
        return false;
      }
      if (projectFilter && entry.projectName.trim().toLowerCase() !== projectFilter) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.dayDate.localeCompare(b.dayDate) || a.createdAt.localeCompare(b.createdAt))
    .map((entry) => ({
      id: entry.id,
      dayDate: entry.dayDate,
      weekday: entry.weekday,
      title: entry.noteText,
      projectName: entry.projectName.trim() || "Onbekend",
      hoursDecimal: entry.hoursDecimal,
      origin: entry.hourBlockId || entry.dayTaskId ? "gepland" : "handmatig",
    }));

  const dayTotals = new Map<string, number>();
  const projectTotals = new Map<string, number>();
  let totalHours = 0;

  for (const row of rows) {
    dayTotals.set(row.dayDate, Number(((dayTotals.get(row.dayDate) ?? 0) + row.hoursDecimal).toFixed(2)));
    projectTotals.set(
      row.projectName,
      Number(((projectTotals.get(row.projectName) ?? 0) + row.hoursDecimal).toFixed(2)),
    );
    totalHours = Number((totalHours + row.hoursDecimal).toFixed(2));
  }

  return {
    rows,
    perDayTotals: [...dayTotals.entries()]
      .map(([dayDate, value]) => ({ dayDate, totalHours: value }))
      .sort((a, b) => a.dayDate.localeCompare(b.dayDate)),
    perProjectTotals: [...projectTotals.entries()]
      .map(([projectName, value]) => ({ projectName, totalHours: value }))
      .sort((a, b) => b.totalHours - a.totalHours || a.projectName.localeCompare(b.projectName)),
    totalHours,
    filter,
  };
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function renderHoursCsv(data: HoursExportData): string {
  const lines = ["datum,weekdag,taak,project,uren,bron"];

  for (const row of data.rows) {
    lines.push(
      [
        row.dayDate,
        row.weekday,
        csvEscape(row.title),
        csvEscape(row.projectName),
        String(row.hoursDecimal),
        row.origin,
      ].join(","),
    );
  }

  lines.push(["totaal", "", "", "", String(data.totalHours), ""].join(","));
  return `${lines.join("\n")}\n`;
}

export async function renderHoursXlsx(data: HoursExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Tijdregistratie");

  sheet.columns = [
    { header: "Datum", key: "dayDate", width: 12 },
    { header: "Weekdag", key: "weekday", width: 12 },
    { header: "Taak", key: "title", width: 40 },
    { header: "Project", key: "projectName", width: 24 },
    { header: "Uren", key: "hoursDecimal", width: 8 },
    { header: "Bron", key: "origin", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of data.rows) {
    sheet.addRow(row);
  }

  const totalRow = sheet.addRow({ title: "Totaal", hoursDecimal: data.totalHours });
  totalRow.font = { bold: true };

  const projectSheet = workbook.addWorksheet("Per project");
  projectSheet.columns = [
    { header: "Project", key: "projectName", width: 24 },
    { header: "Uren", key: "totalHours", width: 8 },
  ];
  projectSheet.getRow(1).font = { bold: true };
  for (const item of data.perProjectTotals) {
    projectSheet.addRow(item);
  }

  const daySheet = workbook.addWorksheet("Per dag");
  daySheet.columns = [
    { header: "Datum", key: "dayDate", width: 12 },
    { header: "Uren", key: "totalHours", width: 8 },
  ];
  daySheet.getRow(1).font = { bold: true };
  for (const item of data.perDayTotals) {
    daySheet.addRow(item);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function buildHoursExportFilename(format: HoursExportFormat, filter: HoursExportFilter): string {
  const range =
    filter.startDate || filter.endDate
      ? `-${filter.startDate ?? "begin"}-tm-${filter.endDate ?? "nu"}`
      : "";
  const project = filter.projectName ? `-${filter.projectName.replaceAll(/[^\w-]+/g, "_")}` : "";
  return `tijdregistratie${range}${project}.${format}`;
}

export function getHoursExportContentType(format: HoursExportFormat): string {
  if (format === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (format === "pdf") {
    return "application/pdf";
  }
  return "text/csv; charset=utf-8";
}
