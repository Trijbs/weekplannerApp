import { describe, expect, it } from "vitest";
import { buildHoursSummary } from "@/lib/db/summary";
import type { HourEntry } from "@/lib/db/types";

function entry(partial: Partial<HourEntry>): HourEntry {
  return {
    id: "id",
    weekId: "w1",
    dayDate: "2026-02-23",
    weekday: "maandag",
    hoursDecimal: 1,
    projectName: "",
    noteText: "",
    source: "manual",
    startedAt: null,
    stoppedAt: null,
    hourBlockId: null,
    dayTaskId: null,
    status: "registered",
    createdAt: "2026-02-26T00:00:00.000Z",
    updatedAt: "2026-02-26T00:00:00.000Z",
    ...partial,
  };
}

describe("buildHoursSummary", () => {
  it("calculates totals per week, day, and project", () => {
    const summary = buildHoursSummary([
      entry({ dayDate: "2026-02-23", weekday: "maandag", hoursDecimal: 2.5, projectName: "App" }),
      entry({ dayDate: "2026-02-24", weekday: "dinsdag", hoursDecimal: 1.25, projectName: "App" }),
      entry({ dayDate: "2026-02-24", weekday: "dinsdag", hoursDecimal: 3.0, projectName: "Marketing" }),
    ]);

    expect(summary.weeklyTotalHours).toBe(6.75);
    expect(summary.perProjectTotals).toEqual([
      { projectName: "App", totalHours: 3.75 },
      { projectName: "Marketing", totalHours: 3 },
    ]);
    expect(summary.perDayTotals).toEqual([
      { dayDate: "2026-02-23", weekday: "maandag", totalHours: 2.5 },
      { dayDate: "2026-02-24", weekday: "dinsdag", totalHours: 4.25 },
    ]);
  });
});
