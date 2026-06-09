import { describe, expect, it } from "vitest";
import {
  buildNotesDateRangeBounds,
  buildNotesExportPreview,
  collectNoteExportItems,
  filterNotesForExport,
  formatNotesCsv,
  formatNotesJson,
  formatNotesTxt,
  isNoteInRange,
  noteTimestampMs,
  resolvePresetRange,
  validateNotesDateRange,
  zonedDayEndUtc,
  zonedDayStartUtc,
  type NoteExportItem,
} from "@/lib/export/notes";
import type { HourEntry, WeekAggregate, WeekRecord } from "@/lib/db/types";

function note(partial: Partial<NoteExportItem>): NoteExportItem {
  return {
    id: "n1",
    dayDate: "2026-03-01",
    weekday: "zondag",
    weekLabel: "Week 9",
    weekKey: "2026-W09",
    projectName: "App",
    noteText: "Reflectie",
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
    ...partial,
  };
}

function hourEntry(partial: Partial<HourEntry>): HourEntry {
  return {
    id: "h1",
    weekId: "w1",
    dayDate: "2026-03-01",
    weekday: "zondag",
    hoursDecimal: 1,
    projectName: "App",
    noteText: "Reflectie",
    source: "manual",
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
    ...partial,
  };
}

function weekAggregate(entries: HourEntry[]): WeekAggregate {
  const week: WeekRecord = {
    id: "w1",
    weekKey: "2026-W09",
    weekLabel: "Week 9",
    startDate: "2026-03-02",
    endDate: "2026-03-08",
    sourceFileName: null,
    sourceFileId: null,
    sourceModifiedAt: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  };

  return {
    week,
    tasks: [],
    hourBlocks: [],
    hourEntries: entries,
    history: [],
  };
}

describe("validateNotesDateRange", () => {
  it("accepts valid ranges and open-ended ranges", () => {
    expect(validateNotesDateRange({ from: "2026-01-01", to: "2026-03-31" })).toBeNull();
    expect(validateNotesDateRange({ from: null, to: null })).toBeNull();
    expect(validateNotesDateRange({ from: "2026-01-01", to: null })).toBeNull();
  });

  it("rejects invalid ranges", () => {
    expect(validateNotesDateRange({ from: "2026-04-01", to: "2026-03-01" })).toBe(
      "De startdatum mag niet later zijn dan de einddatum.",
    );
    expect(validateNotesDateRange({ from: "2026-13-40", to: "2026-03-01" })).toBe("Ongeldige startdatum.");
  });
});

describe("resolvePresetRange", () => {
  const timezone = "Europe/Amsterdam";
  const at = new Date("2026-06-09T12:00:00.000Z");

  it("resolves common presets from timezone-local today", () => {
    expect(resolvePresetRange("today", timezone, null, null, at)).toEqual({
      from: "2026-06-09",
      to: "2026-06-09",
    });
    expect(resolvePresetRange("last_7_days", timezone, null, null, at)).toEqual({
      from: "2026-06-03",
      to: "2026-06-09",
    });
    expect(resolvePresetRange("this_month", timezone, null, null, at)).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(resolvePresetRange("last_month", timezone, null, null, at)).toEqual({
      from: "2026-05-01",
      to: "2026-05-31",
    });
    expect(resolvePresetRange("this_year", timezone, null, null, at)).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });
});

describe("isNoteInRange", () => {
  it("includes notes created or updated inside the range", () => {
    const bounds = buildNotesDateRangeBounds({ from: "2026-03-01", to: "2026-03-31" }, "Europe/Amsterdam");

    expect(
      isNoteInRange(
        { createdAt: "2026-02-20T10:00:00.000Z", updatedAt: "2026-03-02T08:00:00.000Z" },
        bounds,
      ),
    ).toBe(true);
    expect(
      isNoteInRange(
        { createdAt: "2026-02-01T10:00:00.000Z", updatedAt: "2026-02-20T10:00:00.000Z" },
        bounds,
      ),
    ).toBe(false);
  });

  it("returns all notes when no bounds are set", () => {
    const bounds = buildNotesDateRangeBounds({ from: null, to: null }, "Europe/Amsterdam");
    expect(isNoteInRange({ createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z" }, bounds)).toBe(
      true,
    );
  });
});

describe("timezone boundaries", () => {
  it("keeps late-evening Amsterdam updates inside the same local day", () => {
    const bounds = buildNotesDateRangeBounds({ from: "2026-03-31", to: "2026-03-31" }, "Europe/Amsterdam");
    const lateEveningUtc = "2026-03-31T22:30:00.000Z";
    expect(isNoteInRange({ createdAt: lateEveningUtc, updatedAt: lateEveningUtc }, bounds)).toBe(true);
  });

  it("excludes timestamps just before local midnight", () => {
    const start = zonedDayStartUtc("2026-04-01", "Europe/Amsterdam");
    const bounds = { startMs: start, endMs: zonedDayEndUtc("2026-04-01", "Europe/Amsterdam") };
    expect(isNoteInRange({ createdAt: new Date(start - 1).toISOString(), updatedAt: new Date(start - 1).toISOString() }, bounds)).toBe(
      false,
    );
  });
});

describe("filterNotesForExport", () => {
  it("returns empty result sets when nothing matches", () => {
    const notes = [
      note({ createdAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:00.000Z" }),
      note({ id: "n2", createdAt: "2026-01-15T10:00:00.000Z", updatedAt: "2026-01-15T10:00:00.000Z" }),
    ];
    const bounds = buildNotesDateRangeBounds({ from: "2026-06-01", to: "2026-06-30" }, "Europe/Amsterdam");
    expect(filterNotesForExport(notes, bounds)).toEqual([]);
  });

  it("handles large datasets efficiently", () => {
    const notes = Array.from({ length: 5000 }, (_, index) =>
      note({
        id: `n-${index}`,
        createdAt: `2026-02-${String((index % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
        updatedAt: `2026-02-${String((index % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
      }),
    );

    const bounds = buildNotesDateRangeBounds({ from: "2026-02-10", to: "2026-02-20" }, "Europe/Amsterdam");
    const started = performance.now();
    const filtered = filterNotesForExport(notes, bounds);
    const elapsed = performance.now() - started;

    expect(filtered.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });
});

describe("collectNoteExportItems", () => {
  it("collects only hour entries with note text", () => {
    const aggregate = weekAggregate([
      hourEntry({ id: "with-note", noteText: "Echte notitie" }),
      hourEntry({ id: "without-note", noteText: "   " }),
    ]);

    const items = collectNoteExportItems([aggregate.week], [aggregate]);
    expect(items).toHaveLength(1);
    expect(items[0]?.noteText).toBe("Echte notitie");
  });
});

describe("export formatting", () => {
  const notes = [note({ noteText: "Eerste", projectName: "Alpha" }), note({ id: "n2", noteText: "Tweede", projectName: "" })];

  it("preserves txt formatting", () => {
    const txt = formatNotesTxt(notes, "Europe/Amsterdam");
    expect(txt).toContain("Project: Alpha");
    expect(txt).toContain("--------------------");
  });

  it("exports csv and json consistently", () => {
    const csv = formatNotesCsv(notes, "Europe/Amsterdam");
    const json = JSON.parse(formatNotesJson(notes)) as { count: number; notes: NoteExportItem[] };

    expect(csv.split("\n")).toHaveLength(3);
    expect(json.count).toBe(2);
    expect(json.notes[0]?.noteText).toBe("Eerste");
  });
});

describe("buildNotesExportPreview", () => {
  it("builds localized preview summaries", () => {
    const preview = buildNotesExportPreview(142, { from: "2026-01-01", to: "2026-03-31" }, "Europe/Amsterdam", "en");
    expect(preview.summary).toContain("Exporting 142 notes");
    expect(preview.summary).toContain("from");
    expect(preview.summary).toContain("to");
  });
});

describe("noteTimestampMs", () => {
  it("uses the latest created or updated timestamp", () => {
    expect(
      noteTimestampMs({
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      }),
    ).toBe(Date.parse("2026-02-01T00:00:00.000Z"));
  });
});
