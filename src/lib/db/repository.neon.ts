import { neon } from "@netlify/neon";
import { buildHoursSummary } from "@/lib/db/summary";
import { clampHours, computeDiff, hasChanges, isoDateForTimezone, normalizeText, nowIso } from "@/lib/db/helpers";
import type { DatabaseRepository } from "@/lib/db/repository.interface";
import type {
  AppSettings,
  ChangeMap,
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
  SessionRecord,
  TaskHistory,
  WeekAggregate,
  WeekRecord,
  Weekday,
} from "@/lib/db/types";

type SqlRow = Record<string, unknown>;

type NeonQuery = ReturnType<typeof neon>;
type NeonSqlQueryExecutor = { query: (query: string, params?: unknown[]) => Promise<unknown> };

const weekdayOrder: Record<Weekday, number> = {
  maandag: 1,
  dinsdag: 2,
  woensdag: 3,
  donderdag: 4,
  vrijdag: 5,
};

let sqlClient: NeonQuery | null = null;

function resolveDatabaseUrl(): string | null {
  return process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL ?? null;
}

export function hasNeonConfig(): boolean {
  return Boolean(resolveDatabaseUrl());
}

function getSql(): NeonQuery {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("Database env var ontbreekt: DATABASE_URL of NETLIFY_DATABASE_URL");
  }

  if (!sqlClient) {
    sqlClient = neon(databaseUrl);
  }

  return sqlClient;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function queryRows<T extends SqlRow = SqlRow>(
  query: string,
  params: unknown[],
  context: string,
): Promise<T[]> {
  try {
    const executor = getSql() as unknown as NeonSqlQueryExecutor;
    const rows = await executor.query(query, params);
    return rows as T[];
  } catch (error) {
    throw new Error(`${context}: ${errorText(error)}`);
  }
}

async function queryOne<T extends SqlRow = SqlRow>(
  query: string,
  params: unknown[],
  context: string,
): Promise<T | null> {
  const rows = await queryRows<T>(query, params, context);
  return rows[0] ?? null;
}

async function execute(query: string, params: unknown[], context: string): Promise<void> {
  await queryRows(query, params, context);
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function formatDateOnlyAmsterdam(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return value.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function toIsoDateOnly(value: unknown): string {
  if (value instanceof Date) {
    return formatDateOnlyAmsterdam(value);
  }

  return String(value);
}

function toIsoDateTime(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function mapAppSettings(row: SqlRow): AppSettings {
  return {
    id: String(row.id),
    pinHash: String(row.pin_hash),
    timezone: String(row.timezone ?? "Europe/Amsterdam"),
    weekStartDay: "maandag",
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

function mapSession(row: SqlRow): SessionRecord {
  return {
    id: String(row.id),
    tokenHash: String(row.token_hash),
    expiresAt: toIsoDateTime(row.expires_at),
    createdAt: toIsoDateTime(row.created_at),
    revokedAt: row.revoked_at ? toIsoDateTime(row.revoked_at) : null,
  };
}

function mapDriveConnection(row: SqlRow): DriveConnection {
  return {
    id: String(row.id),
    provider: "google-drive",
    accessTokenEnc: String(row.oauth_access_token_enc),
    refreshTokenEnc: String(row.oauth_refresh_token_enc),
    expiresAt: toIsoDateTime(row.expires_at),
    folderId: String(row.folder_id),
    connectedAt: toIsoDateTime(row.connected_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

function mapWeek(row: SqlRow): WeekRecord {
  return {
    id: String(row.id),
    weekKey: String(row.week_key),
    weekLabel: String(row.week_label),
    startDate: toIsoDateOnly(row.start_date),
    endDate: toIsoDateOnly(row.end_date),
    sourceFileName: row.source_file_name ? String(row.source_file_name) : null,
    sourceFileId: row.source_file_id ? String(row.source_file_id) : null,
    sourceModifiedAt: row.source_modified_at ? toIsoDateTime(row.source_modified_at) : null,
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

function mapTask(row: SqlRow): DayTask {
  return {
    id: String(row.id),
    weekId: String(row.week_id),
    weekday: String(row.weekday) as DayTask["weekday"],
    title: String(row.title),
    info: String(row.info ?? ""),
    deadlineAt: row.deadline_at ? toIsoDateTime(row.deadline_at) : null,
    priority: String(row.priority) as DayTask["priority"],
    status: String(row.status) as DayTask["status"],
    position: Number(row.position ?? 0),
    source: String(row.source ?? "manual") as DayTask["source"],
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

function mapHourBlock(row: SqlRow): HourBlock {
  return {
    id: String(row.id),
    weekId: String(row.week_id),
    weekday: String(row.weekday) as HourBlock["weekday"],
    dayDate: row.day_date ? toIsoDateOnly(row.day_date) : null,
    timeStart: String(row.time_start),
    timeEnd: String(row.time_end),
    taskText: String(row.task_text ?? ""),
    projectText: String(row.project_text ?? ""),
    deadlineAt: row.deadline_at ? toIsoDateTime(row.deadline_at) : null,
    status: String(row.status) as HourBlock["status"],
    position: Number(row.position ?? 0),
    source: String(row.source ?? "manual") as HourBlock["source"],
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

function mapHourEntry(row: SqlRow): HourEntry {
  return {
    id: String(row.id),
    weekId: String(row.week_id),
    dayDate: toIsoDateOnly(row.day_date),
    weekday: String(row.weekday) as HourEntry["weekday"],
    hoursDecimal: Number(row.hours_decimal ?? 0),
    projectName: String(row.project_name ?? ""),
    noteText: String(row.note_text ?? ""),
    source: String(row.source ?? "manual") as HourEntry["source"],
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

function mapHistory(row: SqlRow): TaskHistory {
  return {
    id: String(row.id),
    weekId: String(row.week_id),
    entityType: String(row.entity_type) as TaskHistory["entityType"],
    entityId: String(row.entity_id),
    eventType: String(row.event_type) as TaskHistory["eventType"],
    actor: String(row.actor) as TaskHistory["actor"],
    noteText: String(row.note_text),
    changedFields: parseJsonRecord(row.changed_fields) as ChangeMap,
    createdAt: toIsoDateTime(row.created_at),
  };
}

function mapImportJob(row: SqlRow): ImportJob {
  return {
    id: String(row.id),
    provider: String(row.provider) as ImportJob["provider"],
    fileId: row.file_id ? String(row.file_id) : null,
    fileName: String(row.file_name),
    action: String(row.action) as ImportJob["action"],
    status: String(row.status) as ImportJob["status"],
    detailsJson: parseJsonRecord(row.details_json),
    startedAt: toIsoDateTime(row.started_at),
    finishedAt: row.finished_at ? toIsoDateTime(row.finished_at) : null,
  };
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

async function insertHistory(params: {
  weekId: string;
  entityType: TaskHistory["entityType"];
  entityId: string;
  eventType: TaskHistory["eventType"];
  actor: HistoryActor;
  noteText: string;
  changedFields: ChangeMap;
}): Promise<void> {
  await execute(
    `
      insert into task_history (
        week_id,
        entity_type,
        entity_id,
        event_type,
        actor,
        note_text,
        changed_fields
      ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      params.weekId,
      params.entityType,
      params.entityId,
      params.eventType,
      params.actor,
      params.noteText,
      JSON.stringify(params.changedFields ?? {}),
    ],
    "Kan historie niet opslaan",
  );
}

async function fetchEquivalentWeeks(week: WeekRecord): Promise<WeekRecord[]> {
  const rows = await queryRows(
    `select * from weeks where start_date = $1 and end_date = $2`,
    [week.startDate, week.endDate],
    "Kan gerelateerde weken niet laden",
  );

  const mapped = rows.map(mapWeek);
  return mapped.length ? mapped : [week];
}

async function fetchWeekTasks(weekIds: string[]): Promise<DayTask[]> {
  if (!weekIds.length) {
    return [];
  }

  const rows = await queryRows(
    `select * from day_tasks where week_id = any($1::uuid[])`,
    [weekIds],
    "Kan taken niet laden",
  );

  return sortTasks(rows.map(mapTask));
}

async function fetchWeekBlocks(weekIds: string[]): Promise<HourBlock[]> {
  if (!weekIds.length) {
    return [];
  }

  const rows = await queryRows(
    `select * from hour_blocks where week_id = any($1::uuid[])`,
    [weekIds],
    "Kan uurblokken niet laden",
  );

  return sortBlocks(rows.map(mapHourBlock));
}

async function fetchWeekHours(weekIds: string[]): Promise<HourEntry[]> {
  if (!weekIds.length) {
    return [];
  }

  const rows = await queryRows(
    `select * from hour_entries where week_id = any($1::uuid[])`,
    [weekIds],
    "Kan uren niet laden",
  );

  return sortHours(rows.map(mapHourEntry));
}

async function fetchWeekHistory(weekIds: string[], limit = 250): Promise<TaskHistory[]> {
  if (!weekIds.length) {
    return [];
  }

  const rows = await queryRows(
    `
      select *
      from task_history
      where week_id = any($1::uuid[])
      order by created_at desc
      limit $2
    `,
    [weekIds, limit],
    "Kan historie niet laden",
  );

  return rows.map(mapHistory);
}

export const neonDb: DatabaseRepository = {
  async getAppSettings(): Promise<AppSettings | null> {
    const row = await queryOne(
      `select * from app_settings order by created_at asc limit 1`,
      [],
      "Kan app settings niet laden",
    );

    return row ? mapAppSettings(row) : null;
  },

  async setPinHash(pinHash: string): Promise<AppSettings> {
    const existing = await this.getAppSettings();

    if (existing) {
      const row = await queryOne(
        `
          update app_settings
          set pin_hash = $2, updated_at = $3
          where id = $1
          returning *
        `,
        [existing.id, pinHash, nowIso()],
        "Kan PIN niet updaten",
      );

      if (!row) {
        throw new Error("Kan PIN niet updaten: geen resultaat");
      }

      return mapAppSettings(row);
    }

    const row = await queryOne(
      `
        insert into app_settings (pin_hash, timezone, week_start_day)
        values ($1, $2, $3)
        returning *
      `,
      [pinHash, "Europe/Amsterdam", "maandag"],
      "Kan PIN niet opslaan",
    );

    if (!row) {
      throw new Error("Kan PIN niet opslaan: geen resultaat");
    }

    return mapAppSettings(row);
  },

  async createSession(tokenHash: string, expiresAt: string): Promise<SessionRecord> {
    const row = await queryOne(
      `
        insert into sessions (token_hash, expires_at)
        values ($1, $2)
        returning *
      `,
      [tokenHash, expiresAt],
      "Kan sessie niet aanmaken",
    );

    if (!row) {
      throw new Error("Kan sessie niet aanmaken: geen resultaat");
    }

    return mapSession(row);
  },

  async getSession(tokenHash: string): Promise<SessionRecord | null> {
    const row = await queryOne(
      `select * from sessions where token_hash = $1 limit 1`,
      [tokenHash],
      "Kan sessie niet laden",
    );

    return row ? mapSession(row) : null;
  },

  async revokeSession(tokenHash: string): Promise<void> {
    await execute(
      `update sessions set revoked_at = $2 where token_hash = $1`,
      [tokenHash, nowIso()],
      "Kan sessie niet intrekken",
    );
  },

  async saveDriveConnection(
    connection: Omit<DriveConnection, "id" | "connectedAt" | "updatedAt">,
  ): Promise<DriveConnection> {
    const existing = await queryOne(
      `select * from drive_connections where provider = $1 order by connected_at desc limit 1`,
      ["google-drive"],
      "Kan Drive-koppeling niet laden",
    );

    if (existing) {
      const row = await queryOne(
        `
          update drive_connections
          set oauth_access_token_enc = $2,
              oauth_refresh_token_enc = $3,
              expires_at = $4,
              folder_id = $5,
              updated_at = $6
          where id = $1
          returning *
        `,
        [
          String(existing.id),
          connection.accessTokenEnc,
          connection.refreshTokenEnc,
          connection.expiresAt,
          connection.folderId,
          nowIso(),
        ],
        "Kan Drive-koppeling niet updaten",
      );

      if (!row) {
        throw new Error("Kan Drive-koppeling niet updaten: geen resultaat");
      }

      return mapDriveConnection(row);
    }

    const row = await queryOne(
      `
        insert into drive_connections (
          provider,
          oauth_access_token_enc,
          oauth_refresh_token_enc,
          expires_at,
          folder_id
        ) values ($1, $2, $3, $4, $5)
        returning *
      `,
      [
        "google-drive",
        connection.accessTokenEnc,
        connection.refreshTokenEnc,
        connection.expiresAt,
        connection.folderId,
      ],
      "Kan Drive-koppeling niet opslaan",
    );

    if (!row) {
      throw new Error("Kan Drive-koppeling niet opslaan: geen resultaat");
    }

    return mapDriveConnection(row);
  },

  async getDriveConnection(): Promise<DriveConnection | null> {
    const row = await queryOne(
      `select * from drive_connections where provider = $1 order by connected_at desc limit 1`,
      ["google-drive"],
      "Kan Drive-koppeling niet laden",
    );

    return row ? mapDriveConnection(row) : null;
  },

  async startImportJob(
    provider: ImportJob["provider"],
    fileName: string,
    fileId: string | null,
    action: ImportJob["action"],
  ): Promise<ImportJob> {
    const row = await queryOne(
      `
        insert into import_jobs (provider, file_id, file_name, action, status, details_json)
        values ($1, $2, $3, $4, $5, $6::jsonb)
        returning *
      `,
      [provider, fileId, fileName, action, "running", JSON.stringify({})],
      "Kan import job niet starten",
    );

    if (!row) {
      throw new Error("Kan import job niet starten: geen resultaat");
    }

    return mapImportJob(row);
  },

  async finishImportJob(id: string, status: ImportJob["status"], detailsJson: Record<string, unknown>): Promise<void> {
    await execute(
      `
        update import_jobs
        set status = $2,
            details_json = $3::jsonb,
            finished_at = $4
        where id = $1
      `,
      [id, status, JSON.stringify(detailsJson ?? {}), nowIso()],
      "Kan import job niet afronden",
    );
  },

  async listImportJobs(limit = 25): Promise<ImportJob[]> {
    const rows = await queryRows(
      `select * from import_jobs order by started_at desc limit $1`,
      [limit],
      "Kan import jobs niet laden",
    );

    return rows.map(mapImportJob);
  },

  async getWeekById(weekId: string): Promise<WeekRecord | null> {
    const row = await queryOne(
      `select * from weeks where id = $1 limit 1`,
      [weekId],
      "Kan week niet laden",
    );

    return row ? mapWeek(row) : null;
  },

  async getWeekByKey(weekKey: string): Promise<WeekRecord | null> {
    const row = await queryOne(
      `select * from weeks where week_key = $1 limit 1`,
      [weekKey],
      "Kan week niet laden",
    );

    return row ? mapWeek(row) : null;
  },

  async getWeekBySourceVersion(fileId: string, modifiedAt: string): Promise<WeekRecord | null> {
    const row = await queryOne(
      `
        select *
        from weeks
        where source_file_id = $1
          and source_modified_at = $2
        limit 1
      `,
      [fileId, modifiedAt],
      "Kan week niet laden",
    );

    return row ? mapWeek(row) : null;
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
    const row = await queryOne(
      `
        insert into weeks (
          week_key,
          week_label,
          start_date,
          end_date,
          source_file_name,
          source_file_id,
          source_modified_at
        ) values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (week_key)
        do update set
          week_label = excluded.week_label,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          source_file_name = excluded.source_file_name,
          source_file_id = excluded.source_file_id,
          source_modified_at = excluded.source_modified_at,
          updated_at = now()
        returning *
      `,
      [
        input.weekKey,
        input.weekLabel,
        input.startDate,
        input.endDate,
        input.sourceFileName ?? null,
        input.sourceFileId ?? null,
        input.sourceModifiedAt ?? null,
      ],
      "Kan week niet opslaan",
    );

    if (!row) {
      throw new Error("Kan week niet opslaan: geen resultaat");
    }

    return mapWeek(row);
  },

  async listWeeks(): Promise<WeekRecord[]> {
    const rows = await queryRows(
      `select * from weeks order by start_date desc, end_date desc`,
      [],
      "Kan weken niet laden",
    );

    return dedupeWeeksByRange(rows.map(mapWeek));
  },

  async getCurrentWeek(): Promise<WeekRecord | null> {
    const today = isoDateForTimezone("Europe/Amsterdam");
    const weeks = await this.listWeeks();
    return weeks.find((week) => week.startDate <= today && week.endDate >= today) ?? null;
  },

  async getWeekAggregate(weekId: string): Promise<WeekAggregate | null> {
    const week = await this.getWeekById(weekId);
    if (!week) {
      return null;
    }

    const equivalentWeeks = await fetchEquivalentWeeks(week);
    const canonicalWeek = dedupeWeeksByRange(equivalentWeeks)[0] ?? week;
    const familyIds = equivalentWeeks.map((candidate) => candidate.id);

    const [tasks, hourBlocks, hourEntries, history] = await Promise.all([
      fetchWeekTasks(familyIds),
      fetchWeekBlocks(familyIds),
      this.getHoursByWeek(canonicalWeek.id).then((value) => value.entries),
      this.listHistory(canonicalWeek.id, 250),
    ]);

    return {
      week: canonicalWeek,
      tasks,
      hourBlocks,
      hourEntries,
      history,
    };
  },

  async createTask(weekId: string, input: DayTaskInput, actor: HistoryActor): Promise<DayTask> {
    const row = await queryOne(
      `
        insert into day_tasks (
          week_id,
          weekday,
          title,
          info,
          deadline_at,
          priority,
          status,
          position,
          source
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning *
      `,
      [
        weekId,
        input.weekday,
        input.title.trim(),
        input.info?.trim() ?? "",
        input.deadlineAt ?? null,
        input.priority ?? "middel",
        input.status ?? "open",
        input.position ?? 0,
        input.source ?? "manual",
      ],
      "Kan taak niet aanmaken",
    );

    if (!row) {
      throw new Error("Kan taak niet aanmaken: geen resultaat");
    }

    const created = mapTask(row);
    await insertHistory({
      weekId,
      entityType: "task",
      entityId: created.id,
      eventType: "created",
      actor,
      noteText: `Taak aangemaakt: ${created.title}`,
      changedFields: computeDiff({}, created as unknown as Record<string, unknown>),
    });

    return created;
  },

  async getTaskById(taskId: string): Promise<DayTask | null> {
    const row = await queryOne(
      `select * from day_tasks where id = $1 limit 1`,
      [taskId],
      "Kan taak niet laden",
    );

    return row ? mapTask(row) : null;
  },

  async updateTask(taskId: string, patch: DayTaskPatch, actor: HistoryActor): Promise<DayTask | null> {
    const existing = await this.getTaskById(taskId);
    if (!existing) {
      return null;
    }

    const next = {
      weekId: patch.weekId ?? existing.weekId,
      weekday: patch.weekday ?? existing.weekday,
      title: patch.title !== undefined ? patch.title.trim() : existing.title,
      info: patch.info !== undefined ? patch.info.trim() : existing.info,
      deadlineAt: patch.deadlineAt !== undefined ? patch.deadlineAt : existing.deadlineAt,
      priority: patch.priority ?? existing.priority,
      status: patch.status ?? existing.status,
      position: patch.position !== undefined ? patch.position : existing.position,
      source: patch.source ?? existing.source,
    };

    const row = await queryOne(
      `
        update day_tasks
        set week_id = $2,
            weekday = $3,
            title = $4,
            info = $5,
            deadline_at = $6,
            priority = $7,
            status = $8,
            position = $9,
            source = $10,
            updated_at = $11
        where id = $1
        returning *
      `,
      [
        taskId,
        next.weekId,
        next.weekday,
        next.title,
        next.info,
        next.deadlineAt,
        next.priority,
        next.status,
        next.position,
        next.source,
        nowIso(),
      ],
      "Kan taak niet bijwerken",
    );

    if (!row) {
      return null;
    }

    const updated = mapTask(row);
    const changes = computeDiff(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    if (hasChanges(changes)) {
      await insertHistory({
        weekId: updated.weekId,
        entityType: "task",
        entityId: updated.id,
        eventType: "updated",
        actor,
        noteText: `Taak bijgewerkt: ${updated.title}`,
        changedFields: changes,
      });
    }

    return updated;
  },

  async deleteTask(taskId: string, actor: HistoryActor): Promise<boolean> {
    const existing = await this.getTaskById(taskId);
    if (!existing) {
      return false;
    }

    await execute(
      `delete from day_tasks where id = $1`,
      [taskId],
      "Kan taak niet verwijderen",
    );

    await insertHistory({
      weekId: existing.weekId,
      entityType: "task",
      entityId: existing.id,
      eventType: "deleted",
      actor,
      noteText: `Taak verwijderd: ${existing.title}`,
      changedFields: computeDiff(existing as unknown as Record<string, unknown>, {}),
    });

    return true;
  },

  async createHourBlock(weekId: string, input: HourBlockInput, actor: HistoryActor): Promise<HourBlock> {
    const row = await queryOne(
      `
        insert into hour_blocks (
          week_id,
          weekday,
          day_date,
          time_start,
          time_end,
          task_text,
          project_text,
          deadline_at,
          status,
          position,
          source
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        returning *
      `,
      [
        weekId,
        input.weekday,
        input.dayDate ?? null,
        input.timeStart,
        input.timeEnd,
        input.taskText?.trim() ?? "",
        input.projectText?.trim() ?? "",
        input.deadlineAt ?? null,
        input.status ?? "open",
        input.position ?? 0,
        input.source ?? "manual",
      ],
      "Kan uurblok niet aanmaken",
    );

    if (!row) {
      throw new Error("Kan uurblok niet aanmaken: geen resultaat");
    }

    const created = mapHourBlock(row);
    await insertHistory({
      weekId,
      entityType: "hour_block",
      entityId: created.id,
      eventType: "created",
      actor,
      noteText: `Uurblok aangemaakt: ${created.weekday} ${created.timeStart}-${created.timeEnd}`,
      changedFields: computeDiff({}, created as unknown as Record<string, unknown>),
    });

    return created;
  },

  async getHourBlockById(blockId: string): Promise<HourBlock | null> {
    const row = await queryOne(
      `select * from hour_blocks where id = $1 limit 1`,
      [blockId],
      "Kan uurblok niet laden",
    );

    return row ? mapHourBlock(row) : null;
  },

  async updateHourBlock(blockId: string, patch: HourBlockPatch, actor: HistoryActor): Promise<HourBlock | null> {
    const existing = await this.getHourBlockById(blockId);
    if (!existing) {
      return null;
    }

    const next = {
      weekId: patch.weekId ?? existing.weekId,
      weekday: patch.weekday ?? existing.weekday,
      dayDate: patch.dayDate !== undefined ? patch.dayDate : existing.dayDate,
      timeStart: patch.timeStart !== undefined ? patch.timeStart : existing.timeStart,
      timeEnd: patch.timeEnd !== undefined ? patch.timeEnd : existing.timeEnd,
      taskText: patch.taskText !== undefined ? patch.taskText.trim() : existing.taskText,
      projectText: patch.projectText !== undefined ? patch.projectText.trim() : existing.projectText,
      deadlineAt: patch.deadlineAt !== undefined ? patch.deadlineAt : existing.deadlineAt,
      status: patch.status ?? existing.status,
      position: patch.position !== undefined ? patch.position : existing.position,
      source: patch.source ?? existing.source,
    };

    const row = await queryOne(
      `
        update hour_blocks
        set week_id = $2,
            weekday = $3,
            day_date = $4,
            time_start = $5,
            time_end = $6,
            task_text = $7,
            project_text = $8,
            deadline_at = $9,
            status = $10,
            position = $11,
            source = $12,
            updated_at = $13
        where id = $1
        returning *
      `,
      [
        blockId,
        next.weekId,
        next.weekday,
        next.dayDate,
        next.timeStart,
        next.timeEnd,
        next.taskText,
        next.projectText,
        next.deadlineAt,
        next.status,
        next.position,
        next.source,
        nowIso(),
      ],
      "Kan uurblok niet bijwerken",
    );

    if (!row) {
      return null;
    }

    const updated = mapHourBlock(row);
    const changes = computeDiff(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    if (hasChanges(changes)) {
      await insertHistory({
        weekId: updated.weekId,
        entityType: "hour_block",
        entityId: updated.id,
        eventType: "updated",
        actor,
        noteText: `Uurblok bijgewerkt: ${updated.weekday} ${updated.timeStart}-${updated.timeEnd}`,
        changedFields: changes,
      });
    }

    return updated;
  },

  async deleteHourBlock(blockId: string, actor: HistoryActor): Promise<boolean> {
    const existing = await this.getHourBlockById(blockId);
    if (!existing) {
      return false;
    }

    await execute(
      `delete from hour_blocks where id = $1`,
      [blockId],
      "Kan uurblok niet verwijderen",
    );

    await insertHistory({
      weekId: existing.weekId,
      entityType: "hour_block",
      entityId: existing.id,
      eventType: "deleted",
      actor,
      noteText: `Uurblok verwijderd: ${existing.weekday} ${existing.timeStart}-${existing.timeEnd}`,
      changedFields: computeDiff(existing as unknown as Record<string, unknown>, {}),
    });

    return true;
  },

  async createHourEntry(weekId: string, input: HourEntryInput, actor: HistoryActor): Promise<HourEntry> {
    const row = await queryOne(
      `
        insert into hour_entries (
          week_id,
          day_date,
          weekday,
          hours_decimal,
          project_name,
          note_text,
          source
        ) values ($1, $2, $3, $4, $5, $6, $7)
        returning *
      `,
      [
        weekId,
        input.dayDate,
        input.weekday,
        clampHours(input.hoursDecimal),
        input.projectName?.trim() ?? "",
        input.noteText?.trim() ?? "",
        input.source ?? "manual",
      ],
      "Kan urenregel niet aanmaken",
    );

    if (!row) {
      throw new Error("Kan urenregel niet aanmaken: geen resultaat");
    }

    const created = mapHourEntry(row);
    await insertHistory({
      weekId,
      entityType: "hour_entry",
      entityId: created.id,
      eventType: "created",
      actor,
      noteText: `Uren geregistreerd: ${created.hoursDecimal} uur op ${created.dayDate}`,
      changedFields: computeDiff({}, created as unknown as Record<string, unknown>),
    });

    return created;
  },

  async getHourEntryById(entryId: string): Promise<HourEntry | null> {
    const row = await queryOne(
      `select * from hour_entries where id = $1 limit 1`,
      [entryId],
      "Kan urenregel niet laden",
    );

    return row ? mapHourEntry(row) : null;
  },

  async updateHourEntry(entryId: string, patch: HourEntryPatch, actor: HistoryActor): Promise<HourEntry | null> {
    const existing = await this.getHourEntryById(entryId);
    if (!existing) {
      return null;
    }

    const next = {
      weekId: patch.weekId ?? existing.weekId,
      dayDate: patch.dayDate !== undefined ? patch.dayDate : existing.dayDate,
      weekday: patch.weekday ?? existing.weekday,
      hoursDecimal: patch.hoursDecimal !== undefined ? clampHours(patch.hoursDecimal) : existing.hoursDecimal,
      projectName: patch.projectName !== undefined ? patch.projectName.trim() : existing.projectName,
      noteText: patch.noteText !== undefined ? patch.noteText.trim() : existing.noteText,
      source: patch.source ?? existing.source,
    };

    const row = await queryOne(
      `
        update hour_entries
        set week_id = $2,
            day_date = $3,
            weekday = $4,
            hours_decimal = $5,
            project_name = $6,
            note_text = $7,
            source = $8,
            updated_at = $9
        where id = $1
        returning *
      `,
      [
        entryId,
        next.weekId,
        next.dayDate,
        next.weekday,
        next.hoursDecimal,
        next.projectName,
        next.noteText,
        next.source,
        nowIso(),
      ],
      "Kan urenregel niet bijwerken",
    );

    if (!row) {
      return null;
    }

    const updated = mapHourEntry(row);
    const changes = computeDiff(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );

    if (hasChanges(changes)) {
      await insertHistory({
        weekId: updated.weekId,
        entityType: "hour_entry",
        entityId: updated.id,
        eventType: "updated",
        actor,
        noteText: `Urenregel bijgewerkt: ${updated.hoursDecimal} uur op ${updated.dayDate}`,
        changedFields: changes,
      });
    }

    return updated;
  },

  async deleteHourEntry(entryId: string, actor: HistoryActor): Promise<boolean> {
    const existing = await this.getHourEntryById(entryId);
    if (!existing) {
      return false;
    }

    await execute(
      `delete from hour_entries where id = $1`,
      [entryId],
      "Kan urenregel niet verwijderen",
    );

    await insertHistory({
      weekId: existing.weekId,
      entityType: "hour_entry",
      entityId: existing.id,
      eventType: "deleted",
      actor,
      noteText: `Urenregel verwijderd: ${existing.hoursDecimal} uur op ${existing.dayDate}`,
      changedFields: computeDiff(existing as unknown as Record<string, unknown>, {}),
    });

    return true;
  },

  async getHoursByWeek(weekId: string): Promise<{ entries: HourEntry[]; summary: HoursSummary }> {
    const week = await this.getWeekById(weekId);
    if (!week) {
      return { entries: [], summary: buildHoursSummary([]) };
    }

    const equivalentWeeks = await fetchEquivalentWeeks(week);
    const familyIds = equivalentWeeks.map((candidate) => candidate.id);
    const entries = await fetchWeekHours(familyIds);

    return {
      entries,
      summary: buildHoursSummary(entries),
    };
  },

  async getHoursSummary(weekId: string): Promise<HoursSummary> {
    const entries = await this.getHoursByWeek(weekId).then((value) => value.entries);
    return buildHoursSummary(entries);
  },

  async listHistory(weekId: string, limit = 250): Promise<TaskHistory[]> {
    const week = await this.getWeekById(weekId);
    if (!week) {
      return [];
    }

    const equivalentWeeks = await fetchEquivalentWeeks(week);
    const familyIds = equivalentWeeks.map((candidate) => candidate.id);
    return fetchWeekHistory(familyIds, limit);
  },

  async upsertImportedData(
    weekId: string,
    payload: { tasks: DayTaskInput[]; hourBlocks: HourBlockInput[] },
  ): Promise<ImportUpsertResult> {
    let taskCreated = 0;
    let taskUpdated = 0;
    let blockCreated = 0;
    let blockUpdated = 0;

    const existingTasks = await fetchWeekTasks([weekId]);

    for (const input of payload.tasks) {
      const normalizedTitle = normalizeText(input.title);
      const match = existingTasks.find(
        (task) =>
          task.weekId === weekId &&
          task.weekday === input.weekday &&
          normalizeText(task.title) === normalizedTitle,
      );

      if (!match) {
        const row = await queryOne(
          `
            insert into day_tasks (
              week_id,
              weekday,
              title,
              info,
              deadline_at,
              priority,
              status,
              position,
              source
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            returning *
          `,
          [
            weekId,
            input.weekday,
            input.title.trim(),
            input.info?.trim() ?? "",
            input.deadlineAt ?? null,
            input.priority ?? "middel",
            input.status ?? "open",
            input.position ?? 0,
            "import",
          ],
          "Kan import taak niet aanmaken",
        );

        if (!row) {
          throw new Error("Kan import taak niet aanmaken: geen resultaat");
        }

        const created = mapTask(row);
        existingTasks.push(created);
        taskCreated += 1;

        await insertHistory({
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

      const next = {
        weekId: match.weekId,
        weekday: match.weekday,
        title: match.title,
        info: input.info !== undefined ? input.info.trim() : match.info,
        deadlineAt: input.deadlineAt !== undefined ? input.deadlineAt : match.deadlineAt,
        priority: input.priority ?? match.priority,
        status: input.status ?? match.status,
        position: input.position !== undefined ? input.position : match.position,
        source: "import" as DayTask["source"],
      };

      const row = await queryOne(
        `
          update day_tasks
          set week_id = $2,
              weekday = $3,
              title = $4,
              info = $5,
              deadline_at = $6,
              priority = $7,
              status = $8,
              position = $9,
              source = $10,
              updated_at = $11
          where id = $1
          returning *
        `,
        [
          match.id,
          next.weekId,
          next.weekday,
          next.title,
          next.info,
          next.deadlineAt,
          next.priority,
          next.status,
          next.position,
          next.source,
          nowIso(),
        ],
        "Kan import taak niet bijwerken",
      );

      if (!row) {
        throw new Error("Kan import taak niet bijwerken: geen resultaat");
      }

      const updated = mapTask(row);
      const index = existingTasks.findIndex((item) => item.id === match.id);
      if (index >= 0) {
        existingTasks[index] = updated;
      }

      const changes = computeDiff(
        match as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
      );

      if (hasChanges(changes)) {
        taskUpdated += 1;
        await insertHistory({
          weekId,
          entityType: "task",
          entityId: updated.id,
          eventType: "imported",
          actor: "system-import",
          noteText: `Import taak bijgewerkt: ${updated.title}`,
          changedFields: changes,
        });
      }
    }

    const existingBlocks = await fetchWeekBlocks([weekId]);

    for (const input of payload.hourBlocks) {
      const match = existingBlocks.find(
        (block) =>
          block.weekId === weekId &&
          block.weekday === input.weekday &&
          block.timeStart === input.timeStart &&
          block.timeEnd === input.timeEnd,
      );

      if (!match) {
        const row = await queryOne(
          `
            insert into hour_blocks (
              week_id,
              weekday,
              day_date,
              time_start,
              time_end,
              task_text,
              project_text,
              deadline_at,
              status,
              position,
              source
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            returning *
          `,
          [
            weekId,
            input.weekday,
            input.dayDate ?? null,
            input.timeStart,
            input.timeEnd,
            input.taskText?.trim() ?? "",
            input.projectText?.trim() ?? "",
            input.deadlineAt ?? null,
            input.status ?? "open",
            input.position ?? 0,
            "import",
          ],
          "Kan import uurblok niet aanmaken",
        );

        if (!row) {
          throw new Error("Kan import uurblok niet aanmaken: geen resultaat");
        }

        const created = mapHourBlock(row);
        existingBlocks.push(created);
        blockCreated += 1;

        await insertHistory({
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

      const next = {
        weekId: match.weekId,
        weekday: match.weekday,
        dayDate: input.dayDate !== undefined ? input.dayDate : match.dayDate,
        timeStart: match.timeStart,
        timeEnd: match.timeEnd,
        taskText: input.taskText !== undefined ? input.taskText.trim() : match.taskText,
        projectText: input.projectText !== undefined ? input.projectText.trim() : match.projectText,
        deadlineAt: input.deadlineAt !== undefined ? input.deadlineAt : match.deadlineAt,
        status: input.status ?? match.status,
        position: input.position !== undefined ? input.position : match.position,
        source: "import" as HourBlock["source"],
      };

      const row = await queryOne(
        `
          update hour_blocks
          set week_id = $2,
              weekday = $3,
              day_date = $4,
              time_start = $5,
              time_end = $6,
              task_text = $7,
              project_text = $8,
              deadline_at = $9,
              status = $10,
              position = $11,
              source = $12,
              updated_at = $13
          where id = $1
          returning *
        `,
        [
          match.id,
          next.weekId,
          next.weekday,
          next.dayDate,
          next.timeStart,
          next.timeEnd,
          next.taskText,
          next.projectText,
          next.deadlineAt,
          next.status,
          next.position,
          next.source,
          nowIso(),
        ],
        "Kan import uurblok niet bijwerken",
      );

      if (!row) {
        throw new Error("Kan import uurblok niet bijwerken: geen resultaat");
      }

      const updated = mapHourBlock(row);
      const index = existingBlocks.findIndex((item) => item.id === match.id);
      if (index >= 0) {
        existingBlocks[index] = updated;
      }

      const changes = computeDiff(
        match as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
      );

      if (hasChanges(changes)) {
        blockUpdated += 1;
        await insertHistory({
          weekId,
          entityType: "hour_block",
          entityId: updated.id,
          eventType: "imported",
          actor: "system-import",
          noteText: `Import uurblok bijgewerkt: ${updated.weekday} ${updated.timeStart}-${updated.timeEnd}`,
          changedFields: changes,
        });
      }
    }

    return { taskCreated, taskUpdated, blockCreated, blockUpdated };
  },
};
