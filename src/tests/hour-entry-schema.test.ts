import { describe, expect, it } from "vitest";
import { hourEntryCreateSchema, hourEntryPatchSchema } from "@/lib/api/schemas";

describe("hourEntry schemas", () => {
  it("coerces string hour amounts for new hour entries", () => {
    const parsed = hourEntryCreateSchema.parse({
      dayDate: "2026-03-09",
      hoursDecimal: "7.5",
      projectName: "Weekplanner",
      noteText: "Maandag urenregistratie",
    });

    expect(parsed.hoursDecimal).toBe(7.5);
  });

  it("accepts longer project names and reflections within backend storage limits", () => {
    const parsed = hourEntryPatchSchema.parse({
      projectName: "P".repeat(240),
      noteText: "N".repeat(4000),
    });

    expect(parsed.projectName).toHaveLength(240);
    expect(parsed.noteText).toHaveLength(4000);
  });
});
