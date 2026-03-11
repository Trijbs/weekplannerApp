import { describe, expect, it } from "vitest";
import { parseWeekplanningCsv } from "@/lib/import/csv-parser";

describe("parseWeekplanningCsv", () => {
  it("imports the app export format with tasks and hour blocks", async () => {
    const csv = [
      "type,week_key,week_label,weekday,datum,start,einde,titel,info,project,deadline,prioriteit,status,uren,notitie",
      "task,week-2026-10,Week 10,maandag,,,,Sprintplanning,Team afstemmen,,2026-03-03T09:00:00.000Z,hoog,bezig,,",
      "hour_block,week-2026-10,Week 10,dinsdag,2026-03-03,09:00,11:00,Focusblok,,Website,2026-03-04T12:00:00.000Z,,open,,",
      "hour_entry,week-2026-10,Week 10,dinsdag,2026-03-03,,,,,Website,,,,2,Reflectie van de dag",
    ].join("\n");

    const parsed = await parseWeekplanningCsv(Buffer.from(csv, "utf-8"), "weekplanner-2026-10.csv");

    expect(parsed.weekKey).toBe("week-2026-10");
    expect(parsed.weekLabel).toBe("Week 10");
    expect(parsed.startDate).toBe("2026-03-02");
    expect(parsed.endDate).toBe("2026-03-06");
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0]).toMatchObject({
      weekday: "maandag",
      title: "Sprintplanning",
      info: "Team afstemmen",
      priority: "hoog",
      status: "bezig",
    });
    expect(parsed.hourBlocks).toHaveLength(1);
    expect(parsed.hourBlocks[0]).toMatchObject({
      weekday: "dinsdag",
      dayDate: "2026-03-03",
      timeStart: "09:00",
      timeEnd: "11:00",
      taskText: "Focusblok",
      projectText: "Website",
      status: "open",
    });
  });

  it("supports quoted commas and multi-line note rows without importing hour entries", async () => {
    const csv = [
      "type,week_key,week_label,weekday,datum,start,einde,titel,info,project,deadline,prioriteit,status,uren,notitie",
      "\"task\",week-2026-12,Week 12,woensdag,,,,\"Ontwerp, review\",\"Bespreek homepage, footer\",,,middel,klaar,,",
      "\"hour_entry\",week-2026-12,Week 12,woensdag,2026-03-18,,,,,Project X,,,,3,\"Regel 1",
      "Regel 2\"",
    ].join("\n");

    const parsed = await parseWeekplanningCsv(Buffer.from(csv, "utf-8"), "weekplanner-2026-12.csv");

    expect(parsed.startDate).toBe("2026-03-16");
    expect(parsed.endDate).toBe("2026-03-20");
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0]).toMatchObject({
      title: "Ontwerp, review",
      info: "Bespreek homepage, footer",
      priority: "middel",
      status: "klaar",
    });
    expect(parsed.hourBlocks).toHaveLength(0);
  });
});
