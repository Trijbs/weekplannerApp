import { consolidateDuplicateTasksInWeek } from "@/lib/api/deadline-sync";
import { isoWeekNumberFromDate, isoWeekRange } from "@/lib/api/week-target";
import { normalizeText, weekdayFromIsoDate } from "@/lib/db/helpers";
import { db } from "@/lib/db/repository";
import type { WeekRecord, Weekday } from "@/lib/db/types";

const REPAIR_COOLDOWN_MS = 45_000;
const lastRepairByWeek = new Map<string, number>();

function buildWeekKey(week: number, year: number): string {
  return `week-${year}-${String(week).padStart(2, "0")}`;
}

function normalizeTaskKey(value: string): string | null {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}

function taskIndexKey(weekId: string, weekday: Weekday): string {
  return `${weekId}::${weekday}`;
}

export async function repairWeekConsistency(weekId: string): Promise<void> {
  const now = Date.now();
  const lastRepair = lastRepairByWeek.get(weekId);
  if (lastRepair && now - lastRepair < REPAIR_COOLDOWN_MS) {
    return;
  }
  lastRepairByWeek.set(weekId, now);

  try {
    const aggregate = await db.getWeekAggregate(weekId);
    if (!aggregate) {
      return;
    }

    const knownWeeks = await db.listWeeks();
    const weekByDate = new Map<string, WeekRecord>();
    const taskKeysByWeekday = new Map<string, Set<string>>();
    const touchedWeekIds = new Set<string>([weekId]);

    const resolveWeekForDate = async (dateIso: string): Promise<WeekRecord> => {
      const cached = weekByDate.get(dateIso);
      if (cached) {
        return cached;
      }

      const existing = knownWeeks.find((week) => week.startDate <= dateIso && week.endDate >= dateIso);
      if (existing) {
        weekByDate.set(dateIso, existing);
        return existing;
      }

      const { week, year } = isoWeekNumberFromDate(dateIso);
      const range = isoWeekRange(week, year);
      const created = await db.upsertWeek({
        weekKey: buildWeekKey(week, year),
        weekLabel: `Week ${week}`,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      knownWeeks.push(created);
      weekByDate.set(dateIso, created);
      return created;
    };

    const getTaskKeySet = async (targetWeekId: string, targetWeekday: Weekday): Promise<Set<string>> => {
      const key = taskIndexKey(targetWeekId, targetWeekday);
      const cached = taskKeysByWeekday.get(key);
      if (cached) {
        return cached;
      }

      const keySet = new Set<string>();
      const sourceAggregate =
        targetWeekId === aggregate.week.id ? aggregate : await db.getWeekAggregate(targetWeekId);
      if (sourceAggregate) {
        for (const task of sourceAggregate.tasks) {
          if (task.weekday !== targetWeekday) {
            continue;
          }

          const taskKey = normalizeTaskKey(task.title);
          if (taskKey) {
            keySet.add(taskKey);
          }
        }
      }

      taskKeysByWeekday.set(key, keySet);
      return keySet;
    };

    for (const task of aggregate.tasks) {
      const taskKey = normalizeTaskKey(task.title);
      if (taskKey) {
        const key = taskIndexKey(task.weekId, task.weekday);
        const currentSet = taskKeysByWeekday.get(key) ?? new Set<string>();
        currentSet.add(taskKey);
        taskKeysByWeekday.set(key, currentSet);
      }

      if (!task.deadlineAt) {
        continue;
      }

      const deadlineDate = task.deadlineAt.slice(0, 10);
      const derivedWeekday = weekdayFromIsoDate(deadlineDate);
      const targetWeek = await resolveWeekForDate(deadlineDate);

      const patch: { weekId?: string; weekday?: typeof task.weekday } = {};
      if (derivedWeekday && task.weekday !== derivedWeekday) {
        patch.weekday = derivedWeekday;
      }
      if (task.weekId !== targetWeek.id) {
        patch.weekId = targetWeek.id;
      }

      if (patch.weekId || patch.weekday) {
        const updated = await db.updateTask(task.id, patch, "system");
        if (updated) {
          touchedWeekIds.add(updated.weekId);
        }
      }
    }

    for (const block of aggregate.hourBlocks) {
      if (!block.dayDate) {
        continue;
      }

      const derivedWeekday = weekdayFromIsoDate(block.dayDate);
      const targetWeek = await resolveWeekForDate(block.dayDate);
      const patch: { weekId?: string; weekday?: typeof block.weekday } = {};

      if (derivedWeekday && block.weekday !== derivedWeekday) {
        patch.weekday = derivedWeekday;
      }
      if (block.weekId !== targetWeek.id) {
        patch.weekId = targetWeek.id;
      }

      let targetWeekId = patch.weekId ?? block.weekId;
      let targetWeekday = patch.weekday ?? block.weekday;

      if (patch.weekId || patch.weekday) {
        const updated = await db.updateHourBlock(block.id, patch, "system");
        if (updated) {
          targetWeekId = updated.weekId;
          targetWeekday = updated.weekday;
          touchedWeekIds.add(updated.weekId);
        }
      }

      const title = block.taskText.trim();
      const taskKey = normalizeTaskKey(title);
      if (!taskKey) {
        continue;
      }

      const dayTaskKeys = await getTaskKeySet(targetWeekId, targetWeekday);
      if (dayTaskKeys.has(taskKey)) {
        continue;
      }

      const projectText = block.projectText.trim();
      const infoText = projectText ? `Project: ${projectText}` : "";

      await db.createTask(
        targetWeekId,
        {
          weekday: targetWeekday,
          title,
          info: infoText,
          deadlineAt: block.deadlineAt ?? null,
          priority: "middel",
          status: "open",
          source: "system",
        },
        "system",
      );
      dayTaskKeys.add(taskKey);
      touchedWeekIds.add(targetWeekId);
    }

    for (const entry of aggregate.hourEntries) {
      const derivedWeekday = weekdayFromIsoDate(entry.dayDate);
      const targetWeek = await resolveWeekForDate(entry.dayDate);
      const patch: { weekId?: string; weekday?: typeof entry.weekday } = {};

      if (derivedWeekday && entry.weekday !== derivedWeekday) {
        patch.weekday = derivedWeekday;
      }
      if (entry.weekId !== targetWeek.id) {
        patch.weekId = targetWeek.id;
      }

      if (patch.weekId || patch.weekday) {
        const updated = await db.updateHourEntry(entry.id, patch, "system");
        if (updated) {
          touchedWeekIds.add(updated.weekId);
        }
      }
    }

    for (const touchedWeekId of touchedWeekIds) {
      await consolidateDuplicateTasksInWeek(touchedWeekId);
    }
  } catch (error) {
    lastRepairByWeek.delete(weekId);
    throw error;
  }
}

export function repairWeekConsistencyInBackground(weekId: string): void {
  void repairWeekConsistency(weekId).catch((error) => {
    console.error("Week repair background error:", error);
  });
}
