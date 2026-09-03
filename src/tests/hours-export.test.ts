import { describe, expect, it } from "vitest";
import { buildHoursExport, renderHoursCsv } from "@/lib/export/hours";
import type { HourEntry } from "@/lib/db/types";

function entry(partial: Partial<HourEntry>): HourEntry {
  return {
    id: "e1",
    weekId: "w1",
    dayDate: "2026-07-13",
    weekday: "maandag",
    hoursDecimal: 1,
    projectName: "App",
    noteText: "Werk",
    source: "manual",
    startedAt: null,
    stoppedAt: null,
    hourBlockId: null,
    dayTaskId: null,
    status: "registered",
    createdAt: "2026-07-13T08:00:00.000Z",
    updatedAt: "2026-07-13T08:00:00.000Z",
    ...partial,
  };
}

describe("buildHoursExport", () => {
  const entries = [
    entry({ id: "a", dayDate: "2026-07-13", hoursDecimal: 2, projectName: "Website", hourBlockId: "b1" }),
    entry({ id: "b", dayDate: "2026-07-13", hoursDecimal: 1.5, projectName: "App" }),
    entry({ id: "c", dayDate: "2026-07-14", hoursDecimal: 3, projectName: "Website" }),
    entry({ id: "d", dayDate: "2026-07-20", hoursDecimal: 4, projectName: "App" }),
  ];

  it("aggregates totals per day and per project", () => {
    const data = buildHoursExport(entries, { startDate: null, endDate: null, projectName: null });

    expect(data.totalHours).toBe(10.5);
    expect(data.rows).toHaveLength(4);
    expect(data.perDayTotals).toEqual([
      { dayDate: "2026-07-13", totalHours: 3.5 },
      { dayDate: "2026-07-14", totalHours: 3 },
      { dayDate: "2026-07-20", totalHours: 4 },
    ]);
    expect(data.perProjectTotals).toEqual([
      { projectName: "App", totalHours: 5.5 },
      { projectName: "Website", totalHours: 5 },
    ]);
  });

  it("filters by date range", () => {
    const data = buildHoursExport(entries, {
      startDate: "2026-07-13",
      endDate: "2026-07-14",
      projectName: null,
    });

    expect(data.rows.map((row) => row.dayDate)).toEqual(["2026-07-13", "2026-07-13", "2026-07-14"]);
    expect(data.totalHours).toBe(6.5);
  });

  it("filters by project case-insensitively", () => {
    const data = buildHoursExport(entries, { startDate: null, endDate: null, projectName: "website" });

    expect(data.rows).toHaveLength(2);
    expect(data.totalHours).toBe(5);
  });

  it("excludes running timers", () => {
    const data = buildHoursExport(
      [...entries, entry({ id: "run", status: "running", hoursDecimal: 0 })],
      { startDate: null, endDate: null, projectName: null },
    );

    expect(data.rows).toHaveLength(4);
  });

  it("marks planned vs manual source", () => {
    const data = buildHoursExport(entries, { startDate: null, endDate: null, projectName: null });

    expect(data.rows.find((row) => row.id === "a")?.origin).toBe("gepland");
    expect(data.rows.find((row) => row.id === "b")?.origin).toBe("handmatig");
  });
});

describe("renderHoursCsv", () => {
  it("renders header, rows, and total", () => {
    const data = buildHoursExport(
      [entry({ dayDate: "2026-07-13", hoursDecimal: 2.5, projectName: "Web, site", noteText: 'Zei "hoi"' })],
      { startDate: null, endDate: null, projectName: null },
    );

    const csv = renderHoursCsv(data);
    const lines = csv.trim().split("\n");

    expect(lines[0]).toBe("datum,weekdag,taak,project,uren,bron");
    expect(lines[1]).toContain('"Web, site"');
    expect(lines[1]).toContain('"Zei ""hoi"""');
    expect(lines.at(-1)).toContain("2.5");
  });
});
