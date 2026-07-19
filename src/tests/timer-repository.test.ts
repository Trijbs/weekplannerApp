import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { DatabaseRepository } from "@/lib/db/repository.interface";

// LOCAL_DB_PATH moet gezet zijn vóór de module het pad inleest.
process.env.LOCAL_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "weekplanner-test-")), "db.json");

let repo: DatabaseRepository;
let weekId: string;

beforeAll(async () => {
  const { localDb } = await import("@/lib/db/repository.local");
  repo = localDb;
  const week = await repo.upsertWeek({
    weekKey: "week-2026-29",
    weekLabel: "Week 29",
    startDate: "2026-07-13",
    endDate: "2026-07-19",
  });
  weekId = week.id;
});

describe("timer repository flow", () => {
  it("starts a running timer linked to a block", async () => {
    const block = await repo.createHourBlock(
      weekId,
      { weekday: "maandag", timeStart: "09:00", timeEnd: "11:00", taskText: "Logo", projectText: "Branding" },
      "user",
    );

    const started = await repo.startHourTimer(
      weekId,
      { dayDate: "2026-07-13", weekday: "maandag", projectName: "Branding", hourBlockId: block.id },
      "user",
    );

    expect(started.status).toBe("running");
    expect(started.startedAt).toBeTruthy();
    expect(started.hoursDecimal).toBe(0);
    expect(started.hourBlockId).toBe(block.id);

    const running = await repo.getRunningHourEntry();
    expect(running?.id).toBe(started.id);
  });

  it("auto-registers the previous timer when a new one starts", async () => {
    const first = await repo.getRunningHourEntry();
    expect(first).not.toBeNull();

    const second = await repo.startHourTimer(
      weekId,
      { dayDate: "2026-07-13", weekday: "maandag", projectName: "Ander project" },
      "user",
    );

    const previous = await repo.getHourEntryById(first!.id);
    expect(previous?.status).toBe("registered");
    expect(previous?.stoppedAt).toBeTruthy();

    const running = await repo.getRunningHourEntry();
    expect(running?.id).toBe(second.id);
  });

  it("stops a timer and computes the duration", async () => {
    const running = await repo.getRunningHourEntry();
    expect(running).not.toBeNull();

    const stopped = await repo.stopHourTimer(running!.id, "user");
    expect(stopped?.status).toBe("registered");
    expect(stopped?.stoppedAt).toBeTruthy();
    expect(stopped?.hoursDecimal).toBeGreaterThanOrEqual(0);

    expect(await repo.getRunningHourEntry()).toBeNull();
    // Nogmaals stoppen is een no-op.
    expect(await repo.stopHourTimer(running!.id, "user")).toBeNull();
  });

  it("lists entries by date range", async () => {
    const all = await repo.listHourEntriesByRange(null, null);
    expect(all.length).toBeGreaterThanOrEqual(2);

    const none = await repo.listHourEntriesByRange("2030-01-01", null);
    expect(none).toHaveLength(0);
  });
});

describe("project budgets repository flow", () => {
  it("upserts, lists, and deletes budgets", async () => {
    const created = await repo.upsertProjectBudget("Branding", 40);
    expect(created.budgetHours).toBe(40);

    const updated = await repo.upsertProjectBudget("branding", 50);
    expect(updated.id).toBe(created.id);
    expect(updated.budgetHours).toBe(50);

    const budgets = await repo.listProjectBudgets();
    expect(budgets).toHaveLength(1);

    expect(await repo.deleteProjectBudget(created.id)).toBe(true);
    expect(await repo.listProjectBudgets()).toHaveLength(0);
  });

  it("aggregates project hour totals", async () => {
    const totals = await repo.getProjectHourTotals();
    expect(totals.length).toBeGreaterThanOrEqual(1);
    expect(totals.every((item) => item.totalHours >= 0)).toBe(true);
  });
});
