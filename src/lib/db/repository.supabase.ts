import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

const weekdayOrder: Record<Weekday, number> = {
  maandag: 1,
  dinsdag: 2,
  woensdag: 3,
  donderdag: 4,
  vrijdag: 5,
};

let supabaseClient: SupabaseClient | null = null;

export function hasSupabaseConfig(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function decodeJwtRole(token: string): string | null {
  if (token.split(".").length !== 3) {
    return null;
  }

  const payloadPart = token.split(".")[1];
  if (!payloadPart) {
    return null;
  }

  try {
    const padded = payloadPart + "=".repeat((4 - (payloadPart.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function validateServerKey(key: string): void {
  if (key.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is ingesteld op een publishable key. Gebruik de server secret/service_role key.",
    );
  }

  const role = decodeJwtRole(key);
  if (role && role !== "service_role") {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY moet role=service_role hebben, maar is role=${role}.`,
    );
  }
}

function getSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase env vars ontbreken: SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY");
  }

  validateServerKey(key);

  if (!supabaseClient) {
    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseClient;
}

async function unwrap<T>(
  input: PromiseLike<{ data: T; error: { message: string } | null }>,
  context: string,
): Promise<T> {
  const { data, error } = await input;
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
  return data;
}

function mapAppSettings(row: Record<string, unknown>): AppSettings {
  return {
    id: String(row.id),
    pinHash: String(row.pin_hash),
    timezone: String(row.timezone ?? "Europe/Amsterdam"),
    weekStartDay: "maandag",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapSession(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    tokenHash: String(row.token_hash),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  };
}

function mapDriveConnection(row: Record<string, unknown>): DriveConnection {
  return {
    id: String(row.id),
    provider: "google-drive",
    accessTokenEnc: String(row.oauth_access_token_enc),
    refreshTokenEnc: String(row.oauth_refresh_token_enc),
    expiresAt: String(row.expires_at),
    folderId: String(row.folder_id),
    connectedAt: String(row.connected_at),
    updatedAt: String(row.updated_at),
  };
}

function mapWeek(row: Record<string, unknown>): WeekRecord {
  return {
    id: String(row.id),
    weekKey: String(row.week_key),
    weekLabel: String(row.week_label),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    sourceFileName: row.source_file_name ? String(row.source_file_name) : null,
    sourceFileId: row.source_file_id ? String(row.source_file_id) : null,
    sourceModifiedAt: row.source_modified_at ? String(row.source_modified_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapTask(row: Record<string, unknown>): DayTask {
  return {
    id: String(row.id),
    weekId: String(row.week_id),
    weekday: String(row.weekday) as DayTask["weekday"],
    title: String(row.title),
    info: String(row.info ?? ""),
    deadlineAt: row.deadline_at ? String(row.deadline_at) : null,
    priority: String(row.priority) as DayTask["priority"],
    status: String(row.status) as DayTask["status"],
    position: Number(row.position ?? 0),
    source: String(row.source ?? "manual") as DayTask["source"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapHourBlock(row: Record<string, unknown>): HourBlock {
  return {
    id: String(row.id),
    weekId: String(row.week_id),
    weekday: String(row.weekday) as HourBlock["weekday"],
    dayDate: row.day_date ? String(row.day_date) : null,
    timeStart: String(row.time_start),
    timeEnd: String(row.time_end),
    taskText: String(row.task_text ?? ""),
    projectText: String(row.project_text ?? ""),
    deadlineAt: row.deadline_at ? String(row.deadline_at) : null,
    status: String(row.status) as HourBlock["status"],
    position: Number(row.position ?? 0),
    source: String(row.source ?? "manual") as HourBlock["source"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapHourEntry(row: Record<string, unknown>): HourEntry {
  return {
    id: String(row.id),
    weekId: String(row.week_id),
    dayDate: String(row.day_date),
    weekday: String(row.weekday) as HourEntry["weekday"],
    hoursDecimal: Number(row.hours_decimal ?? 0),
    projectName: String(row.project_name ?? ""),
    noteText: String(row.note_text ?? ""),
    source: String(row.source ?? "manual") as HourEntry["source"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapHistory(row: Record<string, unknown>): TaskHistory {
  return {
    id: String(row.id),
    weekId: String(row.week_id),
    entityType: String(row.entity_type) as TaskHistory["entityType"],
    entityId: String(row.entity_id),
    eventType: String(row.event_type) as TaskHistory["eventType"],
    actor: String(row.actor) as TaskHistory["actor"],
    noteText: String(row.note_text),
    changedFields: (row.changed_fields as ChangeMap) ?? {},
    createdAt: String(row.created_at),
  };
}

function mapImportJob(row: Record<string, unknown>): ImportJob {
  return {
    id: String(row.id),
    provider: String(row.provider) as ImportJob["provider"],
    fileId: row.file_id ? String(row.file_id) : null,
    fileName: String(row.file_name),
    action: String(row.action) as ImportJob["action"],
    status: String(row.status) as ImportJob["status"],
    detailsJson: (row.details_json as Record<string, unknown>) ?? {},
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : null,
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
  const supabase = getSupabaseClient();
  await unwrap(
    supabase.from("task_history").insert({
      week_id: params.weekId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      event_type: params.eventType,
      actor: params.actor,
      note_text: params.noteText,
      changed_fields: params.changedFields,
    }),
    "Kan historie niet opslaan",
  );
}

async function fetchWeekTasks(weekIds: string[]): Promise<DayTask[]> {
  const supabase = getSupabaseClient();
  if (!weekIds.length) {
    return [];
  }

  const rows = await unwrap(
    supabase
      .from("day_tasks")
      .select("*")
      .in("week_id", weekIds),
    "Kan taken niet laden",
  );

  return sortTasks((rows as Record<string, unknown>[]).map(mapTask));
}

async function fetchWeekBlocks(weekIds: string[]): Promise<HourBlock[]> {
  const supabase = getSupabaseClient();
  if (!weekIds.length) {
    return [];
  }

  const rows = await unwrap(
    supabase
      .from("hour_blocks")
      .select("*")
      .in("week_id", weekIds),
    "Kan uurblokken niet laden",
  );

  return sortBlocks((rows as Record<string, unknown>[]).map(mapHourBlock));
}

async function fetchEquivalentWeeks(week: WeekRecord): Promise<WeekRecord[]> {
  const supabase = getSupabaseClient();
  const rows = await unwrap(
    supabase
      .from("weeks")
      .select("*")
      .eq("start_date", week.startDate)
      .eq("end_date", week.endDate),
    "Kan gerelateerde weken niet laden",
  );

  const mapped = (rows as Record<string, unknown>[]).map(mapWeek);
  return mapped.length ? mapped : [week];
}

export const supabaseDb: DatabaseRepository = {
  async getAppSettings(): Promise<AppSettings | null> {
    const supabase = getSupabaseClient();
    const rows = await unwrap(
      supabase.from("app_settings").select("*").order("created_at", { ascending: true }).limit(1),
      "Kan app settings niet laden",
    );

    const row = (rows as Record<string, unknown>[])[0];
    return row ? mapAppSettings(row) : null;
  },

  async setPinHash(pinHash: string): Promise<AppSettings> {
    const supabase = getSupabaseClient();
    const existing = await this.getAppSettings();

    if (existing) {
      const row = await unwrap(
        supabase
          .from("app_settings")
          .update({
            pin_hash: pinHash,
            updated_at: nowIso(),
          })
          .eq("id", existing.id)
          .select("*")
          .single(),
        "Kan PIN niet updaten",
      );
      return mapAppSettings(row as Record<string, unknown>);
    }

    const row = await unwrap(
      supabase
        .from("app_settings")
        .insert({
          pin_hash: pinHash,
          timezone: "Europe/Amsterdam",
          week_start_day: "maandag",
        })
        .select("*")
        .single(),
      "Kan PIN niet opslaan",
    );

    return mapAppSettings(row as Record<string, unknown>);
  },

  async createSession(tokenHash: string, expiresAt: string): Promise<SessionRecord> {
    const supabase = getSupabaseClient();
    const row = await unwrap(
      supabase
        .from("sessions")
        .insert({
          token_hash: tokenHash,
          expires_at: expiresAt,
        })
        .select("*")
        .single(),
      "Kan sessie niet aanmaken",
    );

    return mapSession(row as Record<string, unknown>);
  },

  async getSession(tokenHash: string): Promise<SessionRecord | null> {
    const supabase = getSupabaseClient();
    const rows = await unwrap(
      supabase.from("sessions").select("*").eq("token_hash", tokenHash).limit(1),
      "Kan sessie niet laden",
    );

    const row = (rows as Record<string, unknown>[])[0];
    return row ? mapSession(row) : null;
  },

  async revokeSession(tokenHash: string): Promise<void> {
    const supabase = getSupabaseClient();
    await unwrap(
      supabase
        .from("sessions")
        .update({ revoked_at: nowIso() })
        .eq("token_hash", tokenHash)
        .is("revoked_at", null),
      "Kan sessie niet intrekken",
    );
  },

  async saveDriveConnection(
    connection: Omit<DriveConnection, "id" | "connectedAt" | "updatedAt">,
  ): Promise<DriveConnection> {
    const supabase = getSupabaseClient();

    const rows = await unwrap(
      supabase.from("drive_connections").select("*").eq("provider", "google-drive").limit(1),
      "Kan Drive connectie niet laden",
    );

    const existing = (rows as Record<string, unknown>[])[0];

    if (existing) {
      const row = await unwrap(
        supabase
          .from("drive_connections")
          .update({
            oauth_access_token_enc: connection.accessTokenEnc,
            oauth_refresh_token_enc: connection.refreshTokenEnc,
            expires_at: connection.expiresAt,
            folder_id: connection.folderId,
            updated_at: nowIso(),
          })
          .eq("id", String(existing.id))
          .select("*")
          .single(),
        "Kan Drive connectie niet updaten",
      );

      return mapDriveConnection(row as Record<string, unknown>);
    }

    const row = await unwrap(
      supabase
        .from("drive_connections")
        .insert({
          provider: "google-drive",
          oauth_access_token_enc: connection.accessTokenEnc,
          oauth_refresh_token_enc: connection.refreshTokenEnc,
          expires_at: connection.expiresAt,
          folder_id: connection.folderId,
        })
        .select("*")
        .single(),
      "Kan Drive connectie niet opslaan",
    );

    return mapDriveConnection(row as Record<string, unknown>);
  },

  async getDriveConnection(): Promise<DriveConnection | null> {
    const supabase = getSupabaseClient();

    const rows = await unwrap(
      supabase.from("drive_connections").select("*").eq("provider", "google-drive").limit(1),
      "Kan Drive connectie niet laden",
    );

    const row = (rows as Record<string, unknown>[])[0];
    return row ? mapDriveConnection(row) : null;
  },

  async startImportJob(
    provider: ImportJob["provider"],
    fileName: string,
    fileId: string | null,
    action: ImportJob["action"],
  ): Promise<ImportJob> {
    const supabase = getSupabaseClient();
    const row = await unwrap(
      supabase
        .from("import_jobs")
        .insert({
          provider,
          file_id: fileId,
          file_name: fileName,
          action,
          status: "running",
          details_json: {},
          started_at: nowIso(),
        })
        .select("*")
        .single(),
      "Kan importjob niet starten",
    );

    return mapImportJob(row as Record<string, unknown>);
  },

  async finishImportJob(id: string, status: ImportJob["status"], detailsJson: Record<string, unknown>): Promise<void> {
    const supabase = getSupabaseClient();

    await unwrap(
      supabase
        .from("import_jobs")
        .update({
          status,
          details_json: detailsJson,
          finished_at: nowIso(),
        })
        .eq("id", id),
      "Kan importjob niet afronden",
    );
  },

  async listImportJobs(limit = 25): Promise<ImportJob[]> {
    const supabase = getSupabaseClient();
    const rows = await unwrap(
      supabase.from("import_jobs").select("*").order("started_at", { ascending: false }).limit(limit),
      "Kan importjobs niet laden",
    );

    return (rows as Record<string, unknown>[]).map(mapImportJob);
  },

  async getWeekById(weekId: string): Promise<WeekRecord | null> {
    const supabase = getSupabaseClient();
    const rows = await unwrap(
      supabase.from("weeks").select("*").eq("id", weekId).limit(1),
      "Kan week niet laden",
    );

    const row = (rows as Record<string, unknown>[])[0];
    return row ? mapWeek(row) : null;
  },

  async getWeekByKey(weekKey: string): Promise<WeekRecord | null> {
    const supabase = getSupabaseClient();
    const rows = await unwrap(
      supabase.from("weeks").select("*").eq("week_key", weekKey).limit(1),
      "Kan week niet laden",
    );

    const row = (rows as Record<string, unknown>[])[0];
    return row ? mapWeek(row) : null;
  },

  async getWeekBySourceVersion(fileId: string, modifiedAt: string): Promise<WeekRecord | null> {
    const supabase = getSupabaseClient();
    const rows = await unwrap(
      supabase
        .from("weeks")
        .select("*")
        .eq("source_file_id", fileId)
        .eq("source_modified_at", modifiedAt)
        .limit(1),
      "Kan weekversie niet laden",
    );

    const row = (rows as Record<string, unknown>[])[0];
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
    const supabase = getSupabaseClient();
    const now = nowIso();

    const existingByKeyRows = await unwrap(
      supabase.from("weeks").select("*").eq("week_key", input.weekKey).limit(1),
      "Kan week op sleutel niet laden",
    );
    const existingByKey = (existingByKeyRows as Record<string, unknown>[])[0];

    if (existingByKey) {
      const row = await unwrap(
        supabase
          .from("weeks")
          .update({
            week_label: input.weekLabel,
            start_date: input.startDate,
            end_date: input.endDate,
            source_file_name: input.sourceFileName ?? null,
            source_file_id: input.sourceFileId ?? null,
            source_modified_at: input.sourceModifiedAt ?? null,
            updated_at: now,
          })
          .eq("id", String(existingByKey.id))
          .select("*")
          .single(),
        "Kan week niet updaten",
      );
      return mapWeek(row as Record<string, unknown>);
    }

    const existingByRangeRows = await unwrap(
      supabase
        .from("weeks")
        .select("*")
        .eq("start_date", input.startDate)
        .eq("end_date", input.endDate),
      "Kan week op datumbereik niet laden",
    );
    const existingByRange = dedupeWeeksByRange((existingByRangeRows as Record<string, unknown>[]).map(mapWeek))[0];

    if (existingByRange) {
      const row = await unwrap(
        supabase
          .from("weeks")
          .update({
            week_key: input.weekKey,
            week_label: input.weekLabel,
            start_date: input.startDate,
            end_date: input.endDate,
            source_file_name: input.sourceFileName ?? null,
            source_file_id: input.sourceFileId ?? null,
            source_modified_at: input.sourceModifiedAt ?? null,
            updated_at: now,
          })
          .eq("id", existingByRange.id)
          .select("*")
          .single(),
        "Kan week op bereik niet bijwerken",
      );
      return mapWeek(row as Record<string, unknown>);
    }

    const row = await unwrap(
      supabase
        .from("weeks")
        .insert({
          week_key: input.weekKey,
          week_label: input.weekLabel,
          start_date: input.startDate,
          end_date: input.endDate,
          source_file_name: input.sourceFileName ?? null,
          source_file_id: input.sourceFileId ?? null,
          source_modified_at: input.sourceModifiedAt ?? null,
          updated_at: now,
        })
        .select("*")
        .single(),
      "Kan week niet aanmaken",
    );

    return mapWeek(row as Record<string, unknown>);
  },

  async listWeeks(): Promise<WeekRecord[]> {
    const supabase = getSupabaseClient();
    const rows = await unwrap(
      supabase.from("weeks").select("*").order("start_date", { ascending: false }),
      "Kan weken niet laden",
    );

    return dedupeWeeksByRange((rows as Record<string, unknown>[]).map(mapWeek));
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
    const supabase = getSupabaseClient();
    const row = await unwrap(
      supabase
        .from("day_tasks")
        .insert({
          week_id: weekId,
          weekday: input.weekday,
          title: input.title.trim(),
          info: input.info?.trim() ?? "",
          deadline_at: input.deadlineAt ?? null,
          priority: input.priority ?? "middel",
          status: input.status ?? "open",
          position: input.position ?? 0,
          source: input.source ?? "manual",
        })
        .select("*")
        .single(),
      "Kan taak niet aanmaken",
    );

    const created = mapTask(row as Record<string, unknown>);
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
    const supabase = getSupabaseClient();
    const rows = await unwrap(
      supabase.from("day_tasks").select("*").eq("id", taskId).limit(1),
      "Kan taak niet laden",
    );

    const row = (rows as Record<string, unknown>[])[0];
    return row ? mapTask(row) : null;
  },

  async updateTask(taskId: string, patch: DayTaskPatch, actor: HistoryActor): Promise<DayTask | null> {
    const supabase = getSupabaseClient();
    const existing = await this.getTaskById(taskId);
    if (!existing) {
      return null;
    }

    const updates: Record<string, unknown> = { updated_at: nowIso() };
    if (patch.weekId !== undefined) updates.week_id = patch.weekId;
    if (patch.weekday) updates.weekday = patch.weekday;
    if (patch.title !== undefined) updates.title = patch.title.trim();
    if (patch.info !== undefined) updates.info = patch.info.trim();
    if (patch.deadlineAt !== undefined) updates.deadline_at = patch.deadlineAt;
    if (patch.priority) updates.priority = patch.priority;
    if (patch.status) updates.status = patch.status;
    if (patch.position !== undefined) updates.position = patch.position;
    if (patch.source) updates.source = patch.source;

    const row = await unwrap(
      supabase
        .from("day_tasks")
        .update(updates)
        .eq("id", taskId)
        .select("*")
        .single(),
      "Kan taak niet bijwerken",
    );

    const updated = mapTask(row as Record<string, unknown>);
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
    const supabase = getSupabaseClient();
    const existing = await this.getTaskById(taskId);
    if (!existing) {
      return false;
    }

    await unwrap(supabase.from("day_tasks").delete().eq("id", taskId), "Kan taak niet verwijderen");

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
    const supabase = getSupabaseClient();

    const row = await unwrap(
      supabase
        .from("hour_blocks")
        .insert({
          week_id: weekId,
          weekday: input.weekday,
          day_date: input.dayDate ?? null,
          time_start: input.timeStart,
          time_end: input.timeEnd,
          task_text: input.taskText?.trim() ?? "",
          project_text: input.projectText?.trim() ?? "",
          deadline_at: input.deadlineAt ?? null,
          status: input.status ?? "open",
          position: input.position ?? 0,
          source: input.source ?? "manual",
        })
        .select("*")
        .single(),
      "Kan uurblok niet aanmaken",
    );

    const created = mapHourBlock(row as Record<string, unknown>);
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
    const supabase = getSupabaseClient();
    const rows = await unwrap(
      supabase.from("hour_blocks").select("*").eq("id", blockId).limit(1),
      "Kan uurblok niet laden",
    );

    const row = (rows as Record<string, unknown>[])[0];
    return row ? mapHourBlock(row) : null;
  },

  async updateHourBlock(blockId: string, patch: HourBlockPatch, actor: HistoryActor): Promise<HourBlock | null> {
    const supabase = getSupabaseClient();
    const existing = await this.getHourBlockById(blockId);
    if (!existing) {
      return null;
    }

    const updates: Record<string, unknown> = { updated_at: nowIso() };
    if (patch.weekId !== undefined) updates.week_id = patch.weekId;
    if (patch.weekday) updates.weekday = patch.weekday;
    if (patch.dayDate !== undefined) updates.day_date = patch.dayDate;
    if (patch.timeStart !== undefined) updates.time_start = patch.timeStart;
    if (patch.timeEnd !== undefined) updates.time_end = patch.timeEnd;
    if (patch.taskText !== undefined) updates.task_text = patch.taskText.trim();
    if (patch.projectText !== undefined) updates.project_text = patch.projectText.trim();
    if (patch.deadlineAt !== undefined) updates.deadline_at = patch.deadlineAt;
    if (patch.status) updates.status = patch.status;
    if (patch.position !== undefined) updates.position = patch.position;
    if (patch.source) updates.source = patch.source;

    const row = await unwrap(
      supabase
        .from("hour_blocks")
        .update(updates)
        .eq("id", blockId)
        .select("*")
        .single(),
      "Kan uurblok niet bijwerken",
    );

    const updated = mapHourBlock(row as Record<string, unknown>);
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
    const supabase = getSupabaseClient();
    const existing = await this.getHourBlockById(blockId);
    if (!existing) {
      return false;
    }

    await unwrap(supabase.from("hour_blocks").delete().eq("id", blockId), "Kan uurblok niet verwijderen");

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
    const supabase = getSupabaseClient();

    const row = await unwrap(
      supabase
        .from("hour_entries")
        .insert({
          week_id: weekId,
          day_date: input.dayDate,
          weekday: input.weekday,
          hours_decimal: clampHours(input.hoursDecimal),
          project_name: input.projectName?.trim() ?? "",
          note_text: input.noteText?.trim() ?? "",
          source: input.source ?? "manual",
        })
        .select("*")
        .single(),
      "Kan urenregel niet aanmaken",
    );

    const created = mapHourEntry(row as Record<string, unknown>);
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
    const supabase = getSupabaseClient();
    const rows = await unwrap(
      supabase.from("hour_entries").select("*").eq("id", entryId).limit(1),
      "Kan urenregel niet laden",
    );

    const row = (rows as Record<string, unknown>[])[0];
    return row ? mapHourEntry(row) : null;
  },

  async updateHourEntry(entryId: string, patch: HourEntryPatch, actor: HistoryActor): Promise<HourEntry | null> {
    const supabase = getSupabaseClient();
    const existing = await this.getHourEntryById(entryId);
    if (!existing) {
      return null;
    }

    const updates: Record<string, unknown> = { updated_at: nowIso() };
    if (patch.weekId !== undefined) updates.week_id = patch.weekId;
    if (patch.dayDate !== undefined) updates.day_date = patch.dayDate;
    if (patch.weekday) updates.weekday = patch.weekday;
    if (patch.hoursDecimal !== undefined) updates.hours_decimal = clampHours(patch.hoursDecimal);
    if (patch.projectName !== undefined) updates.project_name = patch.projectName.trim();
    if (patch.noteText !== undefined) updates.note_text = patch.noteText.trim();
    if (patch.source) updates.source = patch.source;

    const row = await unwrap(
      supabase
        .from("hour_entries")
        .update(updates)
        .eq("id", entryId)
        .select("*")
        .single(),
      "Kan urenregel niet bijwerken",
    );

    const updated = mapHourEntry(row as Record<string, unknown>);
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
    const supabase = getSupabaseClient();
    const existing = await this.getHourEntryById(entryId);
    if (!existing) {
      return false;
    }

    await unwrap(supabase.from("hour_entries").delete().eq("id", entryId), "Kan urenregel niet verwijderen");

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
    const supabase = getSupabaseClient();
    const week = await this.getWeekById(weekId);
    if (!week) {
      return { entries: [], summary: buildHoursSummary([]) };
    }

    const equivalentWeeks = await fetchEquivalentWeeks(week);
    const familyIds = equivalentWeeks.map((candidate) => candidate.id);
    const rows = await unwrap(
      supabase.from("hour_entries").select("*").in("week_id", familyIds),
      "Kan uren niet laden",
    );

    const entries = sortHours((rows as Record<string, unknown>[]).map(mapHourEntry));
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
    const supabase = getSupabaseClient();
    const week = await this.getWeekById(weekId);
    if (!week) {
      return [];
    }

    const equivalentWeeks = await fetchEquivalentWeeks(week);
    const familyIds = equivalentWeeks.map((candidate) => candidate.id);
    const rows = await unwrap(
      supabase
        .from("task_history")
        .select("*")
        .in("week_id", familyIds)
        .order("created_at", { ascending: false })
        .limit(limit),
      "Kan historie niet laden",
    );

    return (rows as Record<string, unknown>[]).map(mapHistory);
  },

  async upsertImportedData(
    weekId: string,
    payload: { tasks: DayTaskInput[]; hourBlocks: HourBlockInput[] },
  ): Promise<ImportUpsertResult> {
    const supabase = getSupabaseClient();

    let taskCreated = 0;
    let taskUpdated = 0;
    let blockCreated = 0;
    let blockUpdated = 0;

    const existingTasks = await fetchWeekTasks([weekId]);

    for (const input of payload.tasks) {
      const normalizedTitle = normalizeText(input.title);
      const match = existingTasks.find(
        (task) => task.weekId === weekId && task.weekday === input.weekday && normalizeText(task.title) === normalizedTitle,
      );

      if (!match) {
        const row = await unwrap(
          supabase
            .from("day_tasks")
            .insert({
              week_id: weekId,
              weekday: input.weekday,
              title: input.title.trim(),
              info: input.info?.trim() ?? "",
              deadline_at: input.deadlineAt ?? null,
              priority: input.priority ?? "middel",
              status: input.status ?? "open",
              position: input.position ?? 0,
              source: "import",
            })
            .select("*")
            .single(),
          "Kan import taak niet aanmaken",
        );

        const created = mapTask(row as Record<string, unknown>);
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

      const updates: Record<string, unknown> = {
        info: input.info?.trim() ?? match.info,
        deadline_at: input.deadlineAt ?? match.deadlineAt,
        priority: input.priority ?? match.priority,
        status: input.status ?? match.status,
        position: input.position ?? match.position,
        source: "import",
        updated_at: nowIso(),
      };

      const row = await unwrap(
        supabase
          .from("day_tasks")
          .update(updates)
          .eq("id", match.id)
          .select("*")
          .single(),
        "Kan import taak niet bijwerken",
      );

      const updated = mapTask(row as Record<string, unknown>);
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

      const idx = existingTasks.findIndex((task) => task.id === updated.id);
      if (idx >= 0) {
        existingTasks[idx] = updated;
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
        const row = await unwrap(
          supabase
            .from("hour_blocks")
            .insert({
              week_id: weekId,
              weekday: input.weekday,
              day_date: input.dayDate ?? null,
              time_start: input.timeStart,
              time_end: input.timeEnd,
              task_text: input.taskText?.trim() ?? "",
              project_text: input.projectText?.trim() ?? "",
              deadline_at: input.deadlineAt ?? null,
              status: input.status ?? "open",
              position: input.position ?? 0,
              source: "import",
            })
            .select("*")
            .single(),
          "Kan import uurblok niet aanmaken",
        );

        const created = mapHourBlock(row as Record<string, unknown>);
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

      const updates: Record<string, unknown> = {
        day_date: input.dayDate ?? match.dayDate,
        task_text: input.taskText?.trim() ?? match.taskText,
        project_text: input.projectText?.trim() ?? match.projectText,
        deadline_at: input.deadlineAt ?? match.deadlineAt,
        status: input.status ?? match.status,
        position: input.position ?? match.position,
        source: "import",
        updated_at: nowIso(),
      };

      const row = await unwrap(
        supabase
          .from("hour_blocks")
          .update(updates)
          .eq("id", match.id)
          .select("*")
          .single(),
        "Kan import uurblok niet bijwerken",
      );

      const updated = mapHourBlock(row as Record<string, unknown>);
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

      const idx = existingBlocks.findIndex((block) => block.id === updated.id);
      if (idx >= 0) {
        existingBlocks[idx] = updated;
      }
    }

    return { taskCreated, taskUpdated, blockCreated, blockUpdated };
  },
};
