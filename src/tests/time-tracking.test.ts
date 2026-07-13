import { describe, expect, it } from "vitest";
import {
  budgetStatus,
  computeDurationHours,
  deriveTimeReminders,
  formatHoursAsDuration,
} from "@/lib/time/tracking";
import type { DayTask, HourBlock, HourEntry } from "@/lib/db/types";

function entry(partial: Partial<HourEntry>): HourEntry {
  return {
    id: "e1",
    weekId: "w1",
    dayDate: "2026-07-13",
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
    createdAt: "2026-07-13T08:00:00.000Z",
    updatedAt: "2026-07-13T08:00:00.000Z",
    ...partial,
  };
}

function task(partial: Partial<DayTask>): DayTask {
  return {
    id: "t1",
    weekId: "w1",
    weekday: "maandag",
    title: "Logo ontwerpen",
    info: "",
    deadlineAt: null,
    priority: "middel",
    status: "open",
    position: 0,
    source: "manual",
    threadId: null,
    createdAt: "2026-07-13T08:00:00.000Z",
    updatedAt: "2026-07-13T08:00:00.000Z",
    ...partial,
  };
}

function block(partial: Partial<HourBlock>): HourBlock {
  return {
    id: "b1",
    weekId: "w1",
    weekday: "maandag",
    dayDate: "2026-07-13",
    timeStart: "09:00",
    timeEnd: "11:00",
    taskText: "Homepage ontwerpen",
    projectText: "Nieuwe Website",
    deadlineAt: null,
    status: "open",
    position: 0,
    source: "manual",
    assignees: [],
    createdAt: "2026-07-13T08:00:00.000Z",
    updatedAt: "2026-07-13T08:00:00.000Z",
    ...partial,
  };
}

describe("computeDurationHours", () => {
  it("computes decimal hours between start and stop", () => {
    expect(
      computeDurationHours("2026-07-13T09:00:00.000Z", "2026-07-13T11:17:00.000Z"),
    ).toBe(2.28);
  });

  it("rounds to two decimals", () => {
    expect(
      computeDurationHours("2026-07-13T09:00:00.000Z", "2026-07-13T09:10:00.000Z"),
    ).toBe(0.17);
  });

  it("returns 0 when stop is before start", () => {
    expect(
      computeDurationHours("2026-07-13T11:00:00.000Z", "2026-07-13T09:00:00.000Z"),
    ).toBe(0);
  });

  it("clamps to 24 hours", () => {
    expect(
      computeDurationHours("2026-07-10T00:00:00.000Z", "2026-07-13T09:00:00.000Z"),
    ).toBe(24);
  });

  it("returns 0 for invalid dates", () => {
    expect(computeDurationHours("niet-een-datum", "2026-07-13T09:00:00.000Z")).toBe(0);
  });
});

describe("formatHoursAsDuration", () => {
  it("formats decimal hours as Xu Ym", () => {
    expect(formatHoursAsDuration(2.28)).toBe("2u 17m");
  });

  it("omits minutes when whole hours", () => {
    expect(formatHoursAsDuration(3)).toBe("3u");
  });

  it("shows only minutes below one hour", () => {
    expect(formatHoursAsDuration(0.5)).toBe("30m");
  });

  it("formats zero as 0m", () => {
    expect(formatHoursAsDuration(0)).toBe("0m");
  });
});

describe("budgetStatus", () => {
  it("is groen below 85% usage", () => {
    const status = budgetStatus(18, 40);
    expect(status.level).toBe("groen");
    expect(status.remainingHours).toBe(22);
  });

  it("is geel between 85% and 100%", () => {
    const status = budgetStatus(35, 40);
    expect(status.level).toBe("geel");
    expect(status.remainingHours).toBe(5);
  });

  it("is geel at exactly 100%", () => {
    expect(budgetStatus(40, 40).level).toBe("geel");
  });

  it("is rood above 100% with overshoot", () => {
    const status = budgetStatus(47, 40);
    expect(status.level).toBe("rood");
    expect(status.overHours).toBe(7);
  });
});

describe("deriveTimeReminders", () => {
  const today = "2026-07-13";
  const now = "2026-07-13T14:00:00.000Z";

  it("flags a completed task without any linked time entry", () => {
    const reminders = deriveTimeReminders({
      tasks: [task({ id: "t-done", status: "klaar", title: "Homepage ontwerpen" })],
      hourBlocks: [],
      entries: [],
      todayIso: today,
      nowIso: now,
    });

    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      kind: "task-zonder-uren",
      entityId: "t-done",
      title: "Homepage ontwerpen",
    });
  });

  it("does not flag a completed task that has a linked entry", () => {
    const reminders = deriveTimeReminders({
      tasks: [task({ id: "t-done", status: "klaar" })],
      hourBlocks: [],
      entries: [entry({ dayTaskId: "t-done" })],
      todayIso: today,
      nowIso: now,
    });

    expect(reminders).toHaveLength(0);
  });

  it("does not flag open tasks", () => {
    const reminders = deriveTimeReminders({
      tasks: [task({ status: "open" })],
      hourBlocks: [],
      entries: [],
      todayIso: today,
      nowIso: now,
    });

    expect(reminders).toHaveLength(0);
  });

  it("flags an hour block whose end time has passed today without entry", () => {
    const reminders = deriveTimeReminders({
      tasks: [],
      hourBlocks: [block({ id: "b-past", dayDate: today, timeEnd: "11:00" })],
      entries: [],
      todayIso: today,
      nowIso: now,
    });

    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ kind: "blok-zonder-uren", entityId: "b-past" });
  });

  it("does not flag an hour block that is still in the future", () => {
    const reminders = deriveTimeReminders({
      tasks: [],
      hourBlocks: [block({ dayDate: today, timeEnd: "23:45" })],
      entries: [],
      todayIso: today,
      nowIso: now,
    });

    expect(reminders).toHaveLength(0);
  });

  it("does not flag an hour block with a linked entry", () => {
    const reminders = deriveTimeReminders({
      tasks: [],
      hourBlocks: [block({ id: "b-past", dayDate: today, timeEnd: "11:00" })],
      entries: [entry({ hourBlockId: "b-past" })],
      todayIso: today,
      nowIso: now,
    });

    expect(reminders).toHaveLength(0);
  });

  it("ignores a running timer as registration", () => {
    const reminders = deriveTimeReminders({
      tasks: [task({ id: "t-done", status: "klaar" })],
      hourBlocks: [],
      entries: [entry({ dayTaskId: "t-done", status: "running", hoursDecimal: 0 })],
      todayIso: today,
      nowIso: now,
    });

    // Een lopende timer telt als registratie-in-uitvoering: geen melding.
    expect(reminders).toHaveLength(0);
  });
});
