import type { DayTask, HourBlock, HourEntry } from "@/lib/db/types";

const MAX_HOURS = 24;

export function computeDurationHours(startedAtIso: string, stoppedAtIso: string): number {
  const startMs = Date.parse(startedAtIso);
  const stopMs = Date.parse(stoppedAtIso);

  if (!Number.isFinite(startMs) || !Number.isFinite(stopMs) || stopMs <= startMs) {
    return 0;
  }

  const hours = (stopMs - startMs) / 3_600_000;
  return Math.min(MAX_HOURS, Number(hours.toFixed(2)));
}

export function formatHoursAsDuration(hoursDecimal: number): string {
  const totalMinutes = Math.max(0, Math.round(hoursDecimal * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}u`;
  }

  return `${hours}u ${minutes}m`;
}

export type BudgetLevel = "groen" | "geel" | "rood";

export interface BudgetStatus {
  level: BudgetLevel;
  usedHours: number;
  budgetHours: number;
  remainingHours: number;
  overHours: number;
  usagePct: number;
}

const BUDGET_WARN_THRESHOLD = 0.85;

export function budgetStatus(usedHours: number, budgetHours: number): BudgetStatus {
  const used = Math.max(0, usedHours);
  const budget = Math.max(0, budgetHours);
  const usagePct = budget > 0 ? Number(((used / budget) * 100).toFixed(1)) : 0;

  let level: BudgetLevel = "groen";
  if (budget > 0 && used > budget) {
    level = "rood";
  } else if (budget > 0 && used / budget >= BUDGET_WARN_THRESHOLD) {
    level = "geel";
  }

  return {
    level,
    usedHours: Number(used.toFixed(2)),
    budgetHours: Number(budget.toFixed(2)),
    remainingHours: Number(Math.max(0, budget - used).toFixed(2)),
    overHours: Number(Math.max(0, used - budget).toFixed(2)),
    usagePct,
  };
}

export type TimeReminderKind = "task-zonder-uren" | "blok-zonder-uren";

export interface TimeReminder {
  kind: TimeReminderKind;
  entityId: string;
  title: string;
  projectName: string;
  dayDate: string | null;
  suggestedHours: number | null;
}

export interface DeriveTimeRemindersInput {
  tasks: DayTask[];
  hourBlocks: HourBlock[];
  entries: HourEntry[];
  /** ISO-datum (YYYY-MM-DD) van vandaag in de tijdzone van de planning. */
  todayIso: string;
  /**
   * Tijdstip "nu" als ISO-string in dezelfde tijdreferentie als de bloktijden
   * (wandkloktijd van de planning), zodat timeEnd ermee vergeleken kan worden.
   */
  nowIso: string;
}

function blockDurationHours(blockItem: HourBlock): number | null {
  const [startHour, startMin] = blockItem.timeStart.split(":").map(Number);
  const [endHour, endMin] = blockItem.timeEnd.split(":").map(Number);

  if ([startHour, startMin, endHour, endMin].some((value) => !Number.isFinite(value))) {
    return null;
  }

  const minutes = endHour * 60 + endMin - (startHour * 60 + startMin);
  if (minutes <= 0) {
    return null;
  }

  return Number((minutes / 60).toFixed(2));
}

function blockEndHasPassed(blockItem: HourBlock, todayIso: string, nowIso: string): boolean {
  if (!blockItem.dayDate) {
    return false;
  }

  if (blockItem.dayDate < todayIso) {
    return true;
  }

  if (blockItem.dayDate > todayIso) {
    return false;
  }

  const endIso = `${blockItem.dayDate}T${blockItem.timeEnd}:00.000Z`;
  const endMs = Date.parse(endIso);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(endMs) || !Number.isFinite(nowMs)) {
    return false;
  }

  return nowMs >= endMs;
}

export function deriveTimeReminders(input: DeriveTimeRemindersInput): TimeReminder[] {
  const { tasks, hourBlocks, entries, todayIso, nowIso } = input;

  const linkedTaskIds = new Set(
    entries.map((item) => item.dayTaskId).filter((value): value is string => Boolean(value)),
  );
  const linkedBlockIds = new Set(
    entries.map((item) => item.hourBlockId).filter((value): value is string => Boolean(value)),
  );

  const reminders: TimeReminder[] = [];

  for (const taskItem of tasks) {
    if (taskItem.status !== "klaar" || linkedTaskIds.has(taskItem.id)) {
      continue;
    }

    reminders.push({
      kind: "task-zonder-uren",
      entityId: taskItem.id,
      title: taskItem.title,
      projectName: "",
      dayDate: null,
      suggestedHours: null,
    });
  }

  for (const blockItem of hourBlocks) {
    if (linkedBlockIds.has(blockItem.id)) {
      continue;
    }

    const isDone = blockItem.status === "klaar";
    if (!isDone && !blockEndHasPassed(blockItem, todayIso, nowIso)) {
      continue;
    }

    reminders.push({
      kind: "blok-zonder-uren",
      entityId: blockItem.id,
      title: blockItem.taskText || `${blockItem.timeStart}–${blockItem.timeEnd}`,
      projectName: blockItem.projectText,
      dayDate: blockItem.dayDate,
      suggestedHours: blockDurationHours(blockItem),
    });
  }

  return reminders;
}
