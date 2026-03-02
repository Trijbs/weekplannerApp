import type { DayTask, Weekday } from "@/lib/db/types";
import { normalizeText } from "@/lib/db/helpers";
import { db } from "@/lib/db/repository";

function normalizeKey(value: string | null | undefined): string | null {
  const normalized = normalizeText(value ?? "");
  return normalized.length ? normalized : null;
}

function collectTaskProjectKeys(input: {
  title?: string | null;
  info?: string | null;
  taskText?: string | null;
  projectText?: string | null;
}): Set<string> {
  const keys = new Set<string>();
  const title = normalizeKey(input.title);
  const info = normalizeKey(input.info);
  const taskText = normalizeKey(input.taskText);
  const projectText = normalizeKey(input.projectText);

  if (title) keys.add(title);
  if (info) keys.add(info);
  if (taskText) keys.add(taskText);
  if (projectText) keys.add(projectText);
  return keys;
}

function hasOverlap(keys: Set<string>, candidate: Set<string>): boolean {
  for (const key of keys) {
    if (candidate.has(key)) {
      return true;
    }
  }
  return false;
}

export async function syncDeadlineAcrossTaskProject(params: {
  weekId: string;
  sourceType: "task" | "hour_block";
  sourceId: string;
  deadlineAt: string | null;
  title?: string | null;
  info?: string | null;
  taskText?: string | null;
  projectText?: string | null;
}): Promise<{ updatedTasks: number; updatedHourBlocks: number }> {
  if (!params.deadlineAt) {
    return { updatedTasks: 0, updatedHourBlocks: 0 };
  }

  const sourceKeys = collectTaskProjectKeys(params);
  if (sourceKeys.size === 0) {
    return { updatedTasks: 0, updatedHourBlocks: 0 };
  }

  const aggregate = await db.getWeekAggregate(params.weekId);
  if (!aggregate) {
    return { updatedTasks: 0, updatedHourBlocks: 0 };
  }

  let updatedTasks = 0;
  let updatedHourBlocks = 0;

  for (const task of aggregate.tasks) {
    if (params.sourceType === "task" && task.id === params.sourceId) {
      continue;
    }

    const taskKeys = collectTaskProjectKeys({
      title: task.title,
      info: task.info,
    });

    if (!hasOverlap(sourceKeys, taskKeys)) {
      continue;
    }

    if (task.deadlineAt === params.deadlineAt) {
      continue;
    }

    const updated = await db.updateTask(task.id, { deadlineAt: params.deadlineAt }, "system");
    if (updated) {
      updatedTasks += 1;
    }
  }

  for (const block of aggregate.hourBlocks) {
    if (params.sourceType === "hour_block" && block.id === params.sourceId) {
      continue;
    }

    const blockKeys = collectTaskProjectKeys({
      taskText: block.taskText,
      projectText: block.projectText,
    });

    if (!hasOverlap(sourceKeys, blockKeys)) {
      continue;
    }

    if (block.deadlineAt === params.deadlineAt) {
      continue;
    }

    const updated = await db.updateHourBlock(block.id, { deadlineAt: params.deadlineAt }, "system");
    if (updated) {
      updatedHourBlocks += 1;
    }
  }

  return { updatedTasks, updatedHourBlocks };
}

export async function syncTaskLabelAcrossWeek(params: {
  weekId: string;
  sourceType: "task" | "hour_block";
  sourceId: string;
  previousLabel?: string | null;
  nextLabel?: string | null;
}): Promise<{ updatedTasks: number; updatedHourBlocks: number }> {
  const nextText = (params.nextLabel ?? "").trim();
  const nextKey = normalizeKey(nextText);
  if (!nextKey) {
    return { updatedTasks: 0, updatedHourBlocks: 0 };
  }

  const keyCandidates = new Set<string>([nextKey]);
  const previousKey = normalizeKey(params.previousLabel);
  if (previousKey) {
    keyCandidates.add(previousKey);
  }

  const aggregate = await db.getWeekAggregate(params.weekId);
  if (!aggregate) {
    return { updatedTasks: 0, updatedHourBlocks: 0 };
  }

  let updatedTasks = 0;
  let updatedHourBlocks = 0;

  if (params.sourceType === "task") {
    for (const block of aggregate.hourBlocks) {
      const blockKey = normalizeKey(block.taskText);
      if (!blockKey || !keyCandidates.has(blockKey)) {
        continue;
      }
      if (block.taskText.trim() === nextText) {
        continue;
      }

      const updated = await db.updateHourBlock(block.id, { taskText: nextText }, "system");
      if (updated) {
        updatedHourBlocks += 1;
      }
    }
  } else {
    for (const task of aggregate.tasks) {
      const taskKey = normalizeKey(task.title);
      if (!taskKey || !keyCandidates.has(taskKey)) {
        continue;
      }
      if (task.title.trim() === nextText) {
        continue;
      }

      const updated = await db.updateTask(task.id, { title: nextText }, "system");
      if (updated) {
        updatedTasks += 1;
      }
    }
  }

  return { updatedTasks, updatedHourBlocks };
}

export async function ensureTaskFromHourBlock(params: {
  weekId: string;
  weekday: Weekday;
  taskText: string;
  projectText?: string | null;
  deadlineAt?: string | null;
}): Promise<DayTask | null> {
  const title = (params.taskText ?? "").trim();
  if (!title) {
    return null;
  }

  const aggregate = await db.getWeekAggregate(params.weekId);
  if (!aggregate) {
    return null;
  }

  const titleKey = normalizeKey(title);
  if (!titleKey) {
    return null;
  }

  const existing = aggregate.tasks.find(
    (task) => task.weekday === params.weekday && normalizeKey(task.title) === titleKey,
  );

  if (existing) {
    return null;
  }

  const projectText = (params.projectText ?? "").trim();
  const infoText = projectText ? `Project: ${projectText}` : "";

  return db.createTask(
    params.weekId,
    {
      weekday: params.weekday,
      title,
      info: infoText,
      deadlineAt: params.deadlineAt ?? null,
      priority: "middel",
      status: "open",
      source: "system",
    },
    "system",
  );
}

function priorityRank(priority: DayTask["priority"]): number {
  if (priority === "hoog") return 3;
  if (priority === "middel") return 2;
  return 1;
}

function statusRank(status: DayTask["status"]): number {
  if (status === "klaar") return 3;
  if (status === "bezig") return 2;
  return 1;
}

function sourceRank(source: DayTask["source"]): number {
  if (source === "manual") return 3;
  if (source === "import") return 2;
  return 1;
}

export async function consolidateDuplicateTasksInWeek(weekId: string): Promise<number> {
  const aggregate = await db.getWeekAggregate(weekId);
  if (!aggregate) {
    return 0;
  }

  const groups = new Map<string, DayTask[]>();
  for (const task of aggregate.tasks) {
    const titleKey = normalizeKey(task.title);
    if (!titleKey) {
      continue;
    }

    const groupKey = `${task.weekday}__${titleKey}`;
    const current = groups.get(groupKey) ?? [];
    current.push(task);
    groups.set(groupKey, current);
  }

  let removedCount = 0;

  for (const tasks of groups.values()) {
    if (tasks.length <= 1) {
      continue;
    }

    const sorted = tasks
      .slice()
      .sort(
        (a, b) =>
          sourceRank(b.source) - sourceRank(a.source) ||
          statusRank(b.status) - statusRank(a.status) ||
          priorityRank(b.priority) - priorityRank(a.priority) ||
          a.createdAt.localeCompare(b.createdAt),
      );
    const keeper = sorted[0];
    if (!keeper) {
      continue;
    }

    const mergedInfoParts = new Set<string>();
    let mergedDeadlineAt = keeper.deadlineAt;
    let mergedPriority = keeper.priority;
    let mergedStatus = keeper.status;

    for (const task of sorted) {
      const info = task.info.trim();
      if (info) {
        mergedInfoParts.add(info);
      }
      if (!mergedDeadlineAt && task.deadlineAt) {
        mergedDeadlineAt = task.deadlineAt;
      } else if (mergedDeadlineAt && task.deadlineAt && task.deadlineAt < mergedDeadlineAt) {
        mergedDeadlineAt = task.deadlineAt;
      }
      if (priorityRank(task.priority) > priorityRank(mergedPriority)) {
        mergedPriority = task.priority;
      }
      if (statusRank(task.status) > statusRank(mergedStatus)) {
        mergedStatus = task.status;
      }
    }

    const mergedInfo = Array.from(mergedInfoParts).join(" | ").slice(0, 600);
    await db.updateTask(
      keeper.id,
      {
        info: mergedInfo,
        deadlineAt: mergedDeadlineAt ?? null,
        priority: mergedPriority,
        status: mergedStatus,
      },
      "system",
    );

    for (const duplicate of sorted.slice(1)) {
      await db.deleteTask(duplicate.id, "system");
      removedCount += 1;
    }
  }

  return removedCount;
}
