import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseWeekplanningWorkbook } from "@/lib/import/excel-parser";

describe("parseWeekplanningWorkbook", () => {
  it("extracts week data, planner tasks, and hour blocks", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");

    ws.getCell("A4").value = "Week: 5 Maart t/m 11 Maart";

    ws.getCell("A8").value = "Dag";
    ws.getCell("B8").value = "Taken / Werkzaamheden";
    ws.getCell("C8").value = "Deadline";
    ws.getCell("D8").value = "Prioriteit";
    ws.getCell("E8").value = "Status";

    ws.getCell("A9").value = "Maandag";
    ws.getCell("B9").value = "Sprintplanning";
    ws.getCell("C9").value = "2026-03-05T12:00:00Z";
    ws.getCell("D9").value = "Hoog";
    ws.getCell("E9").value = "Bezig";

    ws.getCell("D16").value = "Tijd / Dag 26 Feb Do";
    ws.getCell("D17").value = "09:00 – 10:00";
    ws.getCell("E17").value = "Standup";
    ws.getCell("F17").value = "Weekplanner";
    ws.getCell("H17").value = "☐";

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const parsed = await parseWeekplanningWorkbook(buffer, "Weekplanning Week 10.xlsx");

    expect(parsed.weekKey).toBe("week-2026-10");
    expect(parsed.startDate).toBe("2026-03-02");
    expect(parsed.endDate).toBe("2026-03-06");
    expect(parsed.tasks.length).toBe(1);
    expect(parsed.tasks[0]?.weekday).toBe("maandag");
    expect(parsed.tasks[0]?.priority).toBe("hoog");
    expect(parsed.hourBlocks.length).toBe(1);
    expect(parsed.hourBlocks[0]?.weekday).toBe("donderdag");
    expect(parsed.hourBlocks[0]?.timeStart).toBe("09:00");
  });

  it("parses richText cells and derives week key when filename has no week number", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");

    ws.getCell("A4").value = {
      richText: [{ text: "Week:" }, { text: " 5 Maart t/m 11 Maart" }],
    };

    ws.getCell("A8").value = "Dag";
    ws.getCell("B8").value = "Taken / Werkzaamheden";
    ws.getCell("C8").value = "Deadline";
    ws.getCell("D8").value = "Prioriteit";
    ws.getCell("E8").value = "Status";

    ws.getCell("A12").value = "Donderdag";
    ws.getCell("B12").value = "Gesprek en weekplanning";
    ws.getCell("E12").value = "☐";

    ws.getCell("D16").value = {
      richText: [{ text: "Tijd / Dag " }, { text: "26 Feb Do" }],
    };
    ws.getCell("D17").value = "09:00 – 10:00";
    ws.getCell("E17").value = "Focuswerk";
    ws.getCell("F17").value = "Planning";

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const parsed = await parseWeekplanningWorkbook(buffer, "Weekplanning.xlsx");

    expect(parsed.weekKey).toBe("week-2026-10");
    expect(parsed.startDate).toBe("2026-03-02");
    expect(parsed.endDate).toBe("2026-03-06");
    expect(parsed.tasks.length).toBe(1);
    expect(parsed.tasks[0]?.weekday).toBe("donderdag");
    expect(parsed.tasks[0]?.title).toContain("Gesprek");
    expect(parsed.hourBlocks.length).toBe(1);
    expect(parsed.hourBlocks[0]?.weekday).toBe("donderdag");
  });

  it("normalizes weekday dates from first valid anchor and uses real block date range", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");

    ws.getCell("A8").value = "Dag";
    ws.getCell("B8").value = "Taken / Werkzaamheden";
    ws.getCell("C8").value = "Deadline";
    ws.getCell("D8").value = "Prioriteit";
    ws.getCell("E8").value = "Status";

    ws.getCell("A12").value = "Donderdag";
    ws.getCell("B12").value = "Gesprek";
    ws.getCell("E12").value = "☐";

    ws.getCell("D16").value = "Tijd / Dag 26 Feb Do";
    ws.getCell("D17").value = "09:00 – 10:00";
    ws.getCell("E17").value = "Do taak";

    ws.getCell("D27").value = "Tijd / Dag 27 Feb Vrij";
    ws.getCell("D28").value = "09:00 – 10:00";
    ws.getCell("E28").value = "Vrij taak";

    ws.getCell("D38").value = "Tijd / Dag 26 Feb Ma";
    ws.getCell("D39").value = "09:00 – 10:00";
    ws.getCell("E39").value = "Ma taak";

    ws.getCell("D49").value = "Tijd / Dag 26 Feb Di";
    ws.getCell("D50").value = "09:00 – 10:00";
    ws.getCell("E50").value = "Di taak";

    ws.getCell("D60").value = "Tijd / Dag 26 Feb Woe";
    ws.getCell("D61").value = "09:00 – 10:00";
    ws.getCell("E61").value = "Woe taak";

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const parsed = await parseWeekplanningWorkbook(buffer, "Weekplanning Week 10.xlsx");

    const datesByWeekday = new Map(parsed.hourBlocks.map((block) => [block.weekday, block.dayDate]));

    expect(parsed.startDate).toBe("2026-02-26");
    expect(parsed.endDate).toBe("2026-03-04");
    expect(datesByWeekday.get("donderdag")).toBe("2026-02-26");
    expect(datesByWeekday.get("vrijdag")).toBe("2026-02-27");
    expect(datesByWeekday.get("maandag")).toBe("2026-03-02");
    expect(datesByWeekday.get("dinsdag")).toBe("2026-03-03");
    expect(datesByWeekday.get("woensdag")).toBe("2026-03-04");
  });

  it("parses template style sheets with project, deadline and start/end times", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Template");

    ws.getCell("A1").value = "Week: 17 Maart t/m 21 Maart";
    ws.getCell("A4").value = "Datum";
    ws.getCell("B4").value = "Dag";
    ws.getCell("C4").value = "Project";
    ws.getCell("D4").value = "Taak";
    ws.getCell("E4").value = "Starttijd";
    ws.getCell("F4").value = "Eindtijd";
    ws.getCell("G4").value = "Deadline";

    ws.getCell("A5").value = "2026-03-19";
    ws.getCell("B5").value = "Donderdag";
    ws.getCell("C5").value = "Printdiscount";
    ws.getCell("D5").value = "Catalogus opmaak";
    ws.getCell("E5").value = "09:00";
    ws.getCell("F5").value = "11:00";
    ws.getCell("G5").value = "2026-03-20 17:00";

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const parsed = await parseWeekplanningWorkbook(buffer, "Weekplanning Week 12.xlsx");

    expect(parsed.tasks.length).toBeGreaterThanOrEqual(1);
    expect(parsed.tasks[0]?.title).toContain("Catalogus");
    expect(parsed.tasks[0]?.deadlineAt).toContain("2026-03-20");
    expect(parsed.hourBlocks.length).toBeGreaterThanOrEqual(1);
    expect(parsed.hourBlocks[0]?.timeStart).toBe("09:00");
    expect(parsed.hourBlocks[0]?.timeEnd).toBe("11:00");
    expect(parsed.hourBlocks[0]?.projectText).toBe("Printdiscount");
  });
});
