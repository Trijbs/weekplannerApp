import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  clampHours,
  computeDiff,
  createId,
  hasChanges,
  isoDateForTimezone,
  normalizeText,
  nowIso,
} from "@/lib/db/helpers";
import { buildHoursSummary } from "@/lib/db/summary";
import type { DatabaseRepository, NotesCountBounds } from "@/lib/db/repository.interface";
import type {
  AppSettings,
  DayTask,
  DayTaskInput,
  DayTaskPatch,
  DriveConnection,
  HistoryActor,
  HourBlock,
  HourBlockInput,
  HourBlockPatch,
  HourEntry,
  HourEntryInput,
  HourEntryPatch,
  HoursSummary,
  ImportJob,
  ImportUpsertResult,
  LocalDatabaseState,
  SessionRecord,
  TaskHistory,
  ThoughtMessage,
  ThoughtMessageInput,
  ThoughtSummary,
  ThoughtSummaryContent,
  ThoughtThread,
  ThoughtThreadInput,
  WeekAggregate,
  WeekRecord,
  Weekday,
} from "@/lib/db/types";

const DEFAULT_SUMMARY_CONTENT: ThoughtSummaryContent = {
  overview: "",
  ideas: [],
  tasks: [],
  planningNotes: [],
  concerns: [],
  questions: [],
  decisions: [],
  blocked: [],
  mood: "neutraal",
  priority: "middel",
  tags: [],
};

function normalizeSummaryContent(content: Partial<ThoughtSummaryContent> & Record<string, unknown>): ThoughtSummaryContent {
  const validMoods: ThoughtSummaryContent["mood"][] = ["positief", "neutraal", "gestrest", "negatief"];
  const validPriorities: ThoughtSummaryContent["priority"][] = ["hoog", "middel", "laag"];
  return {
    overview: typeof content.overview === "string" ? content.overview : DEFAULT_SUMMARY_CONTENT.overview,
    ideas: Array.isArray(content.ideas) ? content.ideas.map(String) : DEFAULT_SUMMARY_CONTENT.ideas,
    tasks: Array.isArray(content.tasks) ? content.tasks.map(String) : DEFAULT_SUMMARY_CONTENT.tasks,
    planningNotes: Array.isArray(content.planningNotes) ? content.planningNotes.map(String) : DEFAULT_SUMMARY_CONTENT.planningNotes,
    concerns: Array.isArray(content.concerns) ? content.concerns.map(String) : DEFAULT_SUMMARY_CONTENT.concerns,
    questions: Array.isArray(content.questions) ? content.questions.map(String) : DEFAULT_SUMMARY_CONTENT.questions,
    decisions: Array.isArray(content.decisions) ? content.decisions.map(String) : DEFAULT_SUMMARY_CONTENT.decisions,
    blocked: Array.isArray(content.blocked) ? content.blocked.map(String) : DEFAULT_SUMMARY_CONTENT.blocked,
    mood: validMoods.includes(content.mood as ThoughtSummaryContent["mood"]) ? content.mood as ThoughtSummaryContent["mood"] : DEFAULT_SUMMARY_CONTENT.mood,
    priority: validPriorities.includes(content.priority as ThoughtSummaryContent["priority"]) ? content.priority as ThoughtSummaryContent["priority"] : DEFAULT_SUMMARY_CONTENT.priority,
    tags: Array.isArray(content.tags) ? content.tags.map(String) : DEFAULT_SUMMARY_CONTENT.tags,
  };
}

const DB_FILE = process.env.LOCAL_DB_PATH ?? path.join(process.cwd(), "data", "local-db.json");

const EMPTY_STATE: LocalDatabaseState = {
  appSettings: null,
  sessions: [],
  driveConnection: null,
  weeks: [],
  dayTasks: [],
  hourBlocks: [],
  hourEntries: [],
  taskHistory: [],
  importJobs: [],
  thoughtThreads: [],
  thoughtMessages: [],
  thoughtSummaries: [],
};

const weekdayOrder: Record<Weekday, number> = {
  maandag: 1,
  dinsdag: 2,
  woensdag: 3,
  donderdag: 4,
  vrijdag: 5,
  zaterdag: 6,
  zondag: 7,
};

let writeQueue: Promise<unknown> = Promise.resolve();

function cloneEmptyState(): LocalDatabaseState {
  return JSON.parse(JSON.stringify(EMPTY_STATE));
}

async function ensureDbFile(): Promise<void> {
  await mkdir(path.dirname(DB_FILE), { recursive: true });

  try {
    await readFile(DB_FILE, "utf-8");
  } catch {
    await writeFile(DB_FILE, JSON.stringify(cloneEmptyState(), null, 2), "utf-8");
  }
}

async function readState(): Promise<LocalDatabaseState> {
  await ensureDbFile();

  try {
    const raw = await readFile(DB_FILE, "utf-8");
    const parsed = JSON.parse(raw) as LocalDatabaseState;

return {
      ...cloneEmptyState(),
      ...parsed,
      sessions: parsed.sessions ?? [],
      weeks: parsed.weeks ?? [],
      dayTasks: parsed.dayTasks ?? [],
      hourBlocks: parsed.hourBlocks ?? [],
      hourEntries: parsed.hourEntries ?? [],
      taskHistory: parsed.taskHistory ?? [],
      importJobs: parsed.importJobs ?? [],
      thoughtThreads: parsed.thoughtThreads ?? [],
      thoughtMessages: parsed.thoughtMessages ?? [],
      thoughtSummaries: (parsed.thoughtSummaries ?? []).map(
        (summary: ThoughtSummary) => ({
          ...summary,
          content: normalizeSummaryContent(summary.content as Record<string, unknown> & Partial<ThoughtSummaryContent>),
        }),
      ),
    };
  } catch {
    return cloneEmptyState();
  }
}

async function writeState(state: LocalDatabaseState): Promise<void> {
  await ensureDbFile();
  await writeFile(DB_FILE, JSON.stringify(state, null, 2), "utf-8");
}

async function mutate<T>(fn: (state: LocalDatabaseState) => T): Promise<T> {
  const run = writeQueue.then(async () => {
    const state = await readState();
    const result = fn(state);
    await writeState(state);
    return result;
  });

  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

async function query<T>(fn: (state: LocalDatabaseState) => T): Promise<T> {
  const state = await readState();
  return fn(state);
}

function pushHistory(
  state: LocalDatabaseState,
  params: {
    weekId: string;
    entityType: TaskHistory["entityType"];
    entityId: string;
    eventType: TaskHistory["eventType"];
    actor: HistoryActor;
    noteText: string;
    changedFields: TaskHistory["changedFields"];
  },
): void {
  state.taskHistory.unshift({
    id: createId(),
    weekId: params.weekId,
    entityType: params.entityType,
    entityId: params.entityId,
    eventType: params.eventType,
    actor: params.actor,
    noteText: params.noteText,
    changedFields: params.changedFields,
    createdAt: nowIso(),
  });

  if (state.taskHistory.length > 4000) {
    state.taskHistory = state.taskHistory.slice(0, 4000);
  }
}

function sortTasks(tasks: DayTask[]): DayTask[] {
  return tasks
    .slice()
    .sort((a, b) => weekdayOrder[a.weekday] - weekdayOrder[b.weekday] || a.position - b.position);
}

function sortBlocks(blocks: HourBlock[]): HourBlock[] {
  return blocks
    .slice()
    .sort((a, b) => weekdayOrder[a.weekday] - weekdayOrder[b.weekday] || a.position - b.position);
}

function sortHours(hours: HourEntry[]): HourEntry[] {
  return hours.slice().sort((a, b) => a.dayDate.localeCompare(b.dayDate) || a.createdAt.localeCompare(b.createdAt));
}

function weekKeyRank(weekKey: string): number {
  if (/^week-\d{4}-\d{2}$/i.test(weekKey)) {
    return 3;
  }
  if (/^week-\d{1,2}$/i.test(weekKey)) {
    return 2;
  }
  return 1;
}

function isPreferredWeek(candidate: WeekRecord, current: WeekRecord): boolean {
  const candidateRank = weekKeyRank(candidate.weekKey);
  const currentRank = weekKeyRank(current.weekKey);
  if (candidateRank !== currentRank) {
    return candidateRank > currentRank;
  }

  if (candidate.updatedAt !== current.updatedAt) {
    return candidate.updatedAt > current.updatedAt;
  }

  if (candidate.createdAt !== current.createdAt) {
    return candidate.createdAt > current.createdAt;
  }

  return candidate.id > current.id;
}

function dedupeWeeksByRange(weeks: WeekRecord[]): WeekRecord[] {
  const byRange = new Map<string, WeekRecord>();

  for (const week of weeks) {
    const key = `${week.startDate}|${week.endDate}`;
    const existing = byRange.get(key);
    if (!existing || isPreferredWeek(week, existing)) {
      byRange.set(key, week);
    }
  }

  return Array.from(byRange.values()).sort(
    (a, b) => b.startDate.localeCompare(a.startDate) || b.endDate.localeCompare(a.endDate),
  );
}

function equivalentWeekIds(state: LocalDatabaseState, week: WeekRecord): Set<string> {
  const ids = new Set(
    state.weeks
      .filter((candidate) => candidate.startDate === week.startDate && candidate.endDate === week.endDate)
      .map((candidate) => candidate.id),
  );

  ids.add(week.id);
  return ids;
}

export const localDb: DatabaseRepository = {
  async getAppSettings(): Promise<AppSettings | null> {
    return query((state) => state.appSettings);
  },

  async setPinHash(pinHash: string): Promise<AppSettings> {
    return mutate((state) => {
      const now = nowIso();
      const current = state.appSettings;

      if (current) {
        current.pinHash = pinHash;
        current.updatedAt = now;
        return current;
      }

      const created: AppSettings = {
        id: createId(),
        pinHash,
        timezone: "Europe/Amsterdam",
        weekStartDay: "maandag",
        createdAt: now,
        updatedAt: now,
      };

      state.appSettings = created;
      return created;
    });
  },

  async createSession(tokenHash: string, expiresAt: string): Promise<SessionRecord> {
    return mutate((state) => {
      const created: SessionRecord = {
        id: createId(),
        tokenHash,
        expiresAt,
        createdAt: nowIso(),
        revokedAt: null,
      };

      state.sessions.push(created);
      return created;
    });
  },

  async getSession(tokenHash: string): Promise<SessionRecord | null> {
    return query((state) => state.sessions.find((session) => session.tokenHash === tokenHash) ?? null);
  },

  async revokeSession(tokenHash: string): Promise<void> {
    await mutate((state) => {
      const session = state.sessions.find((item) => item.tokenHash === tokenHash);
      if (session && !session.revokedAt) {
        session.revokedAt = nowIso();
      }
    });
  },

  async saveDriveConnection(connection: Omit<DriveConnection, "id" | "connectedAt" | "updatedAt">): Promise<DriveConnection> {
    return mutate((state) => {
      const now = nowIso();
      const current = state.driveConnection;

      if (current) {
        current.provider = connection.provider;
        current.accessTokenEnc = connection.accessTokenEnc;
        current.refreshTokenEnc = connection.refreshTokenEnc;
        current.expiresAt = connection.expiresAt;
        current.folderId = connection.folderId;
        current.updatedAt = now;
        return current;
      }

      const created: DriveConnection = {
        id: createId(),
        provider: connection.provider,
        accessTokenEnc: connection.accessTokenEnc,
        refreshTokenEnc: connection.refreshTokenEnc,
        expiresAt: connection.expiresAt,
        folderId: connection.folderId,
        connectedAt: now,
        updatedAt: now,
      };

      state.driveConnection = created;
      return created;
    });
  },

  async getDriveConnection(): Promise<DriveConnection | null> {
    return query((state) => state.driveConnection);
  },

  async startImportJob(provider: ImportJob["provider"], fileName: string, fileId: string | null, action: ImportJob["action"]): Promise<ImportJob> {
    return mutate((state) => {
      const job: ImportJob = {
        id: createId(),
        provider,
        fileId,
        fileName,
        action,
        status: "running",
        detailsJson: {},
        startedAt: nowIso(),
        finishedAt: null,
      };

      state.importJobs.unshift(job);
      return job;
    });
  },

  async finishImportJob(id: string, status: ImportJob["status"], detailsJson: Record<string, unknown>): Promise<void> {
    await mutate((state) => {
      const job = state.importJobs.find((item) => item.id === id);
      if (!job) {
        return;
      }

      job.status = status;
      job.detailsJson = detailsJson;
      job.finishedAt = nowIso();
    });
  },

  async listImportJobs(limit = 25): Promise<ImportJob[]> {
    return query((state) => state.importJobs.slice(0, limit));
  },

  async getWeekById(weekId: string): Promise<WeekRecord | null> {
    return query((state) => state.weeks.find((week) => week.id === weekId) ?? null);
  },

  async getWeekByKey(weekKey: string): Promise<WeekRecord | null> {
    return query((state) => state.weeks.find((week) => week.weekKey === weekKey) ?? null);
  },

  async getWeekBySourceVersion(fileId: string, modifiedAt: string): Promise<WeekRecord | null> {
    return query(
      (state) =>
        state.weeks.find((week) => week.sourceFileId === fileId && week.sourceModifiedAt === modifiedAt) ?? null,
    );
  },

  async upsertWeek(input: {
    weekKey: string;
    weekLabel: string;
    startDate: string;
    endDate: string;
    sourceFileName?: string | null;
    sourceFileId?: string | null;
    sourceModifiedAt?: string | null;
  }): Promise<WeekRecord> {
    return mutate((state) => {
      const now = nowIso();
      const existingByKey = state.weeks.find((week) => week.weekKey === input.weekKey);
      const existingByRange = state.weeks.find(
        (week) => week.startDate === input.startDate && week.endDate === input.endDate,
      );
      const existing = existingByKey ?? existingByRange;

      if (existing) {
        existing.weekKey = input.weekKey;
        existing.weekLabel = input.weekLabel;
        existing.startDate = input.startDate;
        existing.endDate = input.endDate;
        existing.sourceFileName = input.sourceFileName ?? existing.sourceFileName;
        existing.sourceFileId = input.sourceFileId ?? existing.sourceFileId;
        existing.sourceModifiedAt = input.sourceModifiedAt ?? existing.sourceModifiedAt;
        existing.updatedAt = now;
        return existing;
      }

      const created: WeekRecord = {
        id: createId(),
        weekKey: input.weekKey,
        weekLabel: input.weekLabel,
        startDate: input.startDate,
        endDate: input.endDate,
        sourceFileName: input.sourceFileName ?? null,
        sourceFileId: input.sourceFileId ?? null,
        sourceModifiedAt: input.sourceModifiedAt ?? null,
        createdAt: now,
        updatedAt: now,
      };

      state.weeks.push(created);
      return created;
    });
  },

  async listWeeks(): Promise<WeekRecord[]> {
    return query((state) => dedupeWeeksByRange(state.weeks));
  },

  async getCurrentWeek(): Promise<WeekRecord | null> {
    return query((state) => {
      const iso = isoDateForTimezone("Europe/Amsterdam");
      const current = dedupeWeeksByRange(state.weeks).find((week) => week.startDate <= iso && week.endDate >= iso);
      if (current) {
        return current;
      }
      return null;
    });
  },

  async getWeekAggregate(weekId: string): Promise<WeekAggregate | null> {
    return query((state) => {
      const week = state.weeks.find((item) => item.id === weekId);
      if (!week) {
        return null;
      }

      const canonicalWeek =
        dedupeWeeksByRange(
          state.weeks.filter((candidate) => candidate.startDate === week.startDate && candidate.endDate === week.endDate),
        )[0] ?? week;
      const familyIds = equivalentWeekIds(state, week);

      return {
        week: canonicalWeek,
        tasks: sortTasks(state.dayTasks.filter((task) => familyIds.has(task.weekId))),
        hourBlocks: sortBlocks(state.hourBlocks.filter((block) => familyIds.has(block.weekId))),
        hourEntries: sortHours(state.hourEntries.filter((entry) => familyIds.has(entry.weekId))),
        history: state.taskHistory.filter((item) => familyIds.has(item.weekId)).slice(0, 250),
      };
    });
  },

  async countNotesForExport(bounds: NotesCountBounds): Promise<number> {
    return query((state) => {
      if (bounds.startMs == null && bounds.endMs == null) {
        return state.hourEntries.filter((e) => e.noteText.trim().length > 0).length;
      }
      return state.hourEntries.filter((entry) => {
        if (entry.noteText.trim().length === 0) {
          return false;
        }
        const createdMs = Date.parse(entry.createdAt);
        const updatedMs = Date.parse(entry.updatedAt);
        const timestamps = [createdMs, updatedMs].filter((value) => Number.isFinite(value));
        if (!timestamps.length) {
          return false;
        }
        return timestamps.some((value) => {
          if (bounds.startMs != null && value < bounds.startMs) {
            return false;
          }
          if (bounds.endMs != null && value > bounds.endMs) {
            return false;
          }
          return true;
        });
      }).length;
    });
  },

  async createTask(weekId: string, input: DayTaskInput, actor: HistoryActor): Promise<DayTask> {
    return mutate((state) => {
      const created: DayTask = {
        id: createId(),
        weekId,
        weekday: input.weekday,
        title: input.title.trim(),
        info: input.info?.trim() ?? "",
        deadlineAt: input.deadlineAt ?? null,
        priority: input.priority ?? "middel",
        status: input.status ?? "open",
        position: input.position ?? 0,
        source: input.source ?? "manual",
        threadId: input.threadId ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      state.dayTasks.push(created);

      pushHistory(state, {
        weekId,
        entityType: "task",
        entityId: created.id,
        eventType: "created",
        actor,
        noteText: `Taak aangemaakt: ${created.title}`,
        changedFields: computeDiff({}, created as unknown as Record<string, unknown>),
      });

      return created;
    });
  },

  async getTaskById(taskId: string): Promise<DayTask | null> {
    return query((state) => state.dayTasks.find((item) => item.id === taskId) ?? null);
  },

  async updateTask(taskId: string, patch: DayTaskPatch, actor: HistoryActor): Promise<DayTask | null> {
    return mutate((state) => {
      const task = state.dayTasks.find((item) => item.id === taskId);
      if (!task) {
        return null;
      }

      const before = { ...task };
      if (patch.weekId !== undefined) task.weekId = patch.weekId;
      if (patch.weekday) task.weekday = patch.weekday;
      if (patch.title !== undefined) task.title = patch.title.trim();
      if (patch.info !== undefined) task.info = patch.info.trim();
      if (patch.deadlineAt !== undefined) task.deadlineAt = patch.deadlineAt;
      if (patch.priority) task.priority = patch.priority;
      if (patch.status) task.status = patch.status;
      if (patch.position !== undefined) task.position = patch.position;
      if (patch.source) task.source = patch.source;
      if (patch.threadId !== undefined) task.threadId = patch.threadId;
      task.updatedAt = nowIso();

      const changes = computeDiff(before as unknown as Record<string, unknown>, task as unknown as Record<string, unknown>);
      if (hasChanges(changes)) {
        pushHistory(state, {
          weekId: task.weekId,
          entityType: "task",
          entityId: task.id,
          eventType: "updated",
          actor,
          noteText: `Taak bijgewerkt: ${task.title}`,
          changedFields: changes,
        });
      }

      return task;
    });
  },

  async deleteTask(taskId: string, actor: HistoryActor): Promise<boolean> {
    return mutate((state) => {
      const index = state.dayTasks.findIndex((item) => item.id === taskId);
      if (index < 0) {
        return false;
      }

      const [removed] = state.dayTasks.splice(index, 1);
      pushHistory(state, {
        weekId: removed.weekId,
        entityType: "task",
        entityId: removed.id,
        eventType: "deleted",
        actor,
        noteText: `Taak verwijderd: ${removed.title}`,
        changedFields: computeDiff(removed as unknown as Record<string, unknown>, {}),
      });

      return true;
    });
  },

  async createHourBlock(weekId: string, input: HourBlockInput, actor: HistoryActor): Promise<HourBlock> {
    return mutate((state) => {
      const created: HourBlock = {
        id: createId(),
        weekId,
        weekday: input.weekday,
        dayDate: input.dayDate ?? null,
        timeStart: input.timeStart,
        timeEnd: input.timeEnd,
        taskText: input.taskText?.trim() ?? "",
        projectText: input.projectText?.trim() ?? "",
        deadlineAt: input.deadlineAt ?? null,
        status: input.status ?? "open",
        position: input.position ?? 0,
        source: input.source ?? "manual",
        assignees: input.assignees ?? [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      state.hourBlocks.push(created);
      pushHistory(state, {
        weekId,
        entityType: "hour_block",
        entityId: created.id,
        eventType: "created",
        actor,
        noteText: `Uurblok aangemaakt: ${created.weekday} ${created.timeStart}-${created.timeEnd}`,
        changedFields: computeDiff({}, created as unknown as Record<string, unknown>),
      });

      return created;
    });
  },

  async getHourBlockById(blockId: string): Promise<HourBlock | null> {
    return query((state) => state.hourBlocks.find((item) => item.id === blockId) ?? null);
  },

  async updateHourBlock(blockId: string, patch: HourBlockPatch, actor: HistoryActor): Promise<HourBlock | null> {
    return mutate((state) => {
      const block = state.hourBlocks.find((item) => item.id === blockId);
      if (!block) {
        return null;
      }

      const before = { ...block };
      if (patch.weekId !== undefined) block.weekId = patch.weekId;
      if (patch.weekday) block.weekday = patch.weekday;
      if (patch.dayDate !== undefined) block.dayDate = patch.dayDate;
      if (patch.timeStart !== undefined) block.timeStart = patch.timeStart;
      if (patch.timeEnd !== undefined) block.timeEnd = patch.timeEnd;
      if (patch.taskText !== undefined) block.taskText = patch.taskText.trim();
      if (patch.projectText !== undefined) block.projectText = patch.projectText.trim();
      if (patch.deadlineAt !== undefined) block.deadlineAt = patch.deadlineAt;
      if (patch.status) block.status = patch.status;
      if (patch.position !== undefined) block.position = patch.position;
      if (patch.source) block.source = patch.source;
      if (patch.assignees !== undefined) block.assignees = patch.assignees;
      block.updatedAt = nowIso();

      const changes = computeDiff(before as unknown as Record<string, unknown>, block as unknown as Record<string, unknown>);
      if (hasChanges(changes)) {
        pushHistory(state, {
          weekId: block.weekId,
          entityType: "hour_block",
          entityId: block.id,
          eventType: "updated",
          actor,
          noteText: `Uurblok bijgewerkt: ${block.weekday} ${block.timeStart}-${block.timeEnd}`,
          changedFields: changes,
        });
      }

      return block;
    });
  },

  async deleteHourBlock(blockId: string, actor: HistoryActor): Promise<boolean> {
    return mutate((state) => {
      const index = state.hourBlocks.findIndex((item) => item.id === blockId);
      if (index < 0) {
        return false;
      }

      const [removed] = state.hourBlocks.splice(index, 1);
      pushHistory(state, {
        weekId: removed.weekId,
        entityType: "hour_block",
        entityId: removed.id,
        eventType: "deleted",
        actor,
        noteText: `Uurblok verwijderd: ${removed.weekday} ${removed.timeStart}-${removed.timeEnd}`,
        changedFields: computeDiff(removed as unknown as Record<string, unknown>, {}),
      });

      return true;
    });
  },

  async createHourEntry(weekId: string, input: HourEntryInput, actor: HistoryActor): Promise<HourEntry> {
    return mutate((state) => {
      const created: HourEntry = {
        id: createId(),
        weekId,
        dayDate: input.dayDate,
        weekday: input.weekday,
        hoursDecimal: clampHours(input.hoursDecimal),
        projectName: input.projectName?.trim() ?? "",
        noteText: input.noteText?.trim() ?? "",
        source: input.source ?? "manual",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      state.hourEntries.push(created);
      pushHistory(state, {
        weekId,
        entityType: "hour_entry",
        entityId: created.id,
        eventType: "created",
        actor,
        noteText: `Uren geregistreerd: ${created.hoursDecimal} uur op ${created.dayDate}`,
        changedFields: computeDiff({}, created as unknown as Record<string, unknown>),
      });

      return created;
    });
  },

  async getHourEntryById(entryId: string): Promise<HourEntry | null> {
    return query((state) => state.hourEntries.find((item) => item.id === entryId) ?? null);
  },

  async updateHourEntry(entryId: string, patch: HourEntryPatch, actor: HistoryActor): Promise<HourEntry | null> {
    return mutate((state) => {
      const entry = state.hourEntries.find((item) => item.id === entryId);
      if (!entry) {
        return null;
      }

      const before = { ...entry };
      if (patch.weekId !== undefined) entry.weekId = patch.weekId;
      if (patch.dayDate !== undefined) entry.dayDate = patch.dayDate;
      if (patch.weekday) entry.weekday = patch.weekday;
      if (patch.hoursDecimal !== undefined) entry.hoursDecimal = clampHours(patch.hoursDecimal);
      if (patch.projectName !== undefined) entry.projectName = patch.projectName.trim();
      if (patch.noteText !== undefined) entry.noteText = patch.noteText.trim();
      if (patch.source) entry.source = patch.source;
      entry.updatedAt = nowIso();

      const changes = computeDiff(before as unknown as Record<string, unknown>, entry as unknown as Record<string, unknown>);
      if (hasChanges(changes)) {
        pushHistory(state, {
          weekId: entry.weekId,
          entityType: "hour_entry",
          entityId: entry.id,
          eventType: "updated",
          actor,
          noteText: `Urenregel bijgewerkt: ${entry.hoursDecimal} uur op ${entry.dayDate}`,
          changedFields: changes,
        });
      }

      return entry;
    });
  },

  async deleteHourEntry(entryId: string, actor: HistoryActor): Promise<boolean> {
    return mutate((state) => {
      const index = state.hourEntries.findIndex((item) => item.id === entryId);
      if (index < 0) {
        return false;
      }

      const [removed] = state.hourEntries.splice(index, 1);
      pushHistory(state, {
        weekId: removed.weekId,
        entityType: "hour_entry",
        entityId: removed.id,
        eventType: "deleted",
        actor,
        noteText: `Urenregel verwijderd: ${removed.hoursDecimal} uur op ${removed.dayDate}`,
        changedFields: computeDiff(removed as unknown as Record<string, unknown>, {}),
      });

      return true;
    });
  },

  async getHoursByWeek(weekId: string): Promise<{ entries: HourEntry[]; summary: HoursSummary }> {
    return query((state) => {
      const week = state.weeks.find((item) => item.id === weekId);
      if (!week) {
        return { entries: [], summary: buildHoursSummary([]) };
      }

      const familyIds = equivalentWeekIds(state, week);
      const entries = sortHours(state.hourEntries.filter((entry) => familyIds.has(entry.weekId)));
      return { entries, summary: buildHoursSummary(entries) };
    });
  },

  async getHoursSummary(weekId: string): Promise<HoursSummary> {
    return query((state) => {
      const week = state.weeks.find((item) => item.id === weekId);
      if (!week) {
        return buildHoursSummary([]);
      }

      const familyIds = equivalentWeekIds(state, week);
      return buildHoursSummary(state.hourEntries.filter((entry) => familyIds.has(entry.weekId)));
    });
  },

  async listHistory(weekId: string, limit = 250): Promise<TaskHistory[]> {
    return query((state) => {
      const week = state.weeks.find((item) => item.id === weekId);
      if (!week) {
        return [];
      }

      const familyIds = equivalentWeekIds(state, week);
      return state.taskHistory.filter((item) => familyIds.has(item.weekId)).slice(0, limit);
    });
  },

  async listThoughtThreads(limit = 30): Promise<ThoughtThread[]> {
    return query((state) =>
      state.thoughtThreads
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit),
    );
  },

  async getThoughtThreadById(threadId: string): Promise<ThoughtThread | null> {
    return query((state) => state.thoughtThreads.find((thread) => thread.id === threadId) ?? null);
  },

  async createThoughtThread(input: ThoughtThreadInput): Promise<ThoughtThread> {
    return mutate((state) => {
      const now = nowIso();
      const title = input.title?.trim() || "Nieuwe gedachten";
      const created: ThoughtThread = {
        id: createId(),
        weekId: input.weekId ?? null,
        dayDate: input.dayDate ?? null,
        title: title.slice(0, 140),
        status: "active",
        createdAt: now,
        updatedAt: now,
      };

      state.thoughtThreads.unshift(created);
      return created;
    });
  },

  async listThoughtMessages(threadId: string): Promise<ThoughtMessage[]> {
    return query((state) =>
      state.thoughtMessages
        .filter((message) => message.threadId === threadId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  },

  async addThoughtMessage(threadId: string, input: ThoughtMessageInput): Promise<ThoughtMessage> {
    return mutate((state) => {
      const thread = state.thoughtThreads.find((item) => item.id === threadId);
      if (!thread) {
        throw new Error("Gesprek niet gevonden.");
      }

      const created: ThoughtMessage = {
        id: createId(),
        threadId,
        role: "user",
        bodyText: input.bodyText.trim(),
        createdAt: nowIso(),
      };

      state.thoughtMessages.push(created);
      thread.updatedAt = created.createdAt;
      if (thread.title === "Nieuwe gedachten") {
        thread.title = created.bodyText.split(/\s+/).slice(0, 8).join(" ").slice(0, 140);
      }

      return created;
    });
  },

  async listThoughtSummaries(threadId: string): Promise<ThoughtSummary[]> {
    return query((state) =>
      state.thoughtSummaries
        .filter((summary) => summary.threadId === threadId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  },

  async createThoughtSummary(
    threadId: string,
    content: ThoughtSummaryContent,
    messageCount: number,
  ): Promise<ThoughtSummary> {
    return mutate((state) => {
      const thread = state.thoughtThreads.find((item) => item.id === threadId);
      if (!thread) {
        throw new Error("Gesprek niet gevonden.");
      }

      const created: ThoughtSummary = {
        id: createId(),
        threadId,
        content,
        messageCount,
        createdAt: nowIso(),
      };

      state.thoughtSummaries.unshift(created);
      thread.updatedAt = created.createdAt;
      return created;
    });
  },

  async archiveThoughtThread(threadId: string): Promise<ThoughtThread | null> {
    return mutate((state) => {
      const thread = state.thoughtThreads.find((item) => item.id === threadId);
      if (!thread) {
        return null;
      }
      thread.status = "archived";
      thread.updatedAt = nowIso();
      return thread;
    });
  },

  async deleteThoughtThread(threadId: string): Promise<boolean> {
    return mutate((state) => {
      const index = state.thoughtThreads.findIndex((item) => item.id === threadId);
      if (index < 0) {
        return false;
      }
      state.thoughtThreads.splice(index, 1);
      state.thoughtMessages = state.thoughtMessages.filter((item) => item.threadId !== threadId);
      state.thoughtSummaries = state.thoughtSummaries.filter((item) => item.threadId !== threadId);
      return true;
    });
  },

  async upsertImportedData(
    weekId: string,
    payload: { tasks: DayTaskInput[]; hourBlocks: HourBlockInput[] },
  ): Promise<ImportUpsertResult> {
    return mutate((state) => {
      let taskCreated = 0;
      let taskUpdated = 0;
      let blockCreated = 0;
      let blockUpdated = 0;

      for (const input of payload.tasks) {
        const normalizedTitle = normalizeText(input.title);
        const existing = state.dayTasks.find(
          (task) =>
            task.weekId === weekId &&
            task.weekday === input.weekday &&
            normalizeText(task.title) === normalizedTitle,
        );

        if (!existing) {
          const created: DayTask = {
            id: createId(),
            weekId,
            weekday: input.weekday,
            title: input.title.trim(),
            info: input.info?.trim() ?? "",
            deadlineAt: input.deadlineAt ?? null,
            priority: input.priority ?? "middel",
            status: input.status ?? "open",
            position: input.position ?? 0,
            source: "import",
            threadId: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };
          state.dayTasks.push(created);
          taskCreated += 1;

          pushHistory(state, {
            weekId,
            entityType: "task",
            entityId: created.id,
            eventType: "imported",
            actor: "system-import",
            noteText: `Import taak toegevoegd: ${created.title}`,
            changedFields: computeDiff({}, created as unknown as Record<string, unknown>),
          });
          continue;
        }

        const before = { ...existing };
        existing.info = input.info?.trim() ?? existing.info;
        existing.deadlineAt = input.deadlineAt ?? existing.deadlineAt;
        existing.priority = input.priority ?? existing.priority;
        existing.status = input.status ?? existing.status;
        existing.position = input.position ?? existing.position;
        existing.source = "import";
        existing.updatedAt = nowIso();

        const changes = computeDiff(before as unknown as Record<string, unknown>, existing as unknown as Record<string, unknown>);
        if (hasChanges(changes)) {
          taskUpdated += 1;
          pushHistory(state, {
            weekId,
            entityType: "task",
            entityId: existing.id,
            eventType: "imported",
            actor: "system-import",
            noteText: `Import taak bijgewerkt: ${existing.title}`,
            changedFields: changes,
          });
        }
      }

      for (const input of payload.hourBlocks) {
        const existing = state.hourBlocks.find(
          (block) =>
            block.weekId === weekId &&
            block.weekday === input.weekday &&
            block.timeStart === input.timeStart &&
            block.timeEnd === input.timeEnd,
        );

        if (!existing) {
          const created: HourBlock = {
            id: createId(),
            weekId,
            weekday: input.weekday,
            dayDate: input.dayDate ?? null,
            timeStart: input.timeStart,
            timeEnd: input.timeEnd,
            taskText: input.taskText?.trim() ?? "",
            projectText: input.projectText?.trim() ?? "",
            deadlineAt: input.deadlineAt ?? null,
            status: input.status ?? "open",
            position: input.position ?? 0,
            source: "import",
            assignees: input.assignees ?? [],
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };

          state.hourBlocks.push(created);
          blockCreated += 1;

          pushHistory(state, {
            weekId,
            entityType: "hour_block",
            entityId: created.id,
            eventType: "imported",
            actor: "system-import",
            noteText: `Import uurblok toegevoegd: ${created.weekday} ${created.timeStart}-${created.timeEnd}`,
            changedFields: computeDiff({}, created as unknown as Record<string, unknown>),
          });
          continue;
        }

        const before = { ...existing };
        existing.dayDate = input.dayDate ?? existing.dayDate;
        existing.taskText = input.taskText?.trim() ?? existing.taskText;
        existing.projectText = input.projectText?.trim() ?? existing.projectText;
        existing.deadlineAt = input.deadlineAt ?? existing.deadlineAt;
        existing.status = input.status ?? existing.status;
        existing.position = input.position ?? existing.position;
        existing.source = "import";
        existing.updatedAt = nowIso();

        const changes = computeDiff(before as unknown as Record<string, unknown>, existing as unknown as Record<string, unknown>);
        if (hasChanges(changes)) {
          blockUpdated += 1;
          pushHistory(state, {
            weekId,
            entityType: "hour_block",
            entityId: existing.id,
            eventType: "imported",
            actor: "system-import",
            noteText: `Import uurblok bijgewerkt: ${existing.weekday} ${existing.timeStart}-${existing.timeEnd}`,
            changedFields: changes,
          });
        }
      }

      return { taskCreated, taskUpdated, blockCreated, blockUpdated };
    });
  },
};
