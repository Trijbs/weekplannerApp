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
  ProjectBudget,
  SessionRecord,
  TaskHistory,
  ThoughtMessage,
  ThoughtMessageInput,
  ThoughtSummary,
  ThoughtSummaryContent,
  ThoughtThread,
  ThoughtThreadInput,
  TimerStartInput,
  WeekAggregate,
  WeekRecord,
} from "@/lib/db/types";

export type NotesCountBounds = {
  startMs: number | null;
  endMs: number | null;
};

export interface DatabaseRepository {
  getAppSettings(): Promise<AppSettings | null>;
  setPinHash(pinHash: string): Promise<AppSettings>;
  createSession(tokenHash: string, expiresAt: string): Promise<SessionRecord>;
  getSession(tokenHash: string): Promise<SessionRecord | null>;
  revokeSession(tokenHash: string): Promise<void>;
  saveDriveConnection(
    connection: Omit<DriveConnection, "id" | "connectedAt" | "updatedAt">,
  ): Promise<DriveConnection>;
  getDriveConnection(): Promise<DriveConnection | null>;
  startImportJob(
    provider: ImportJob["provider"],
    fileName: string,
    fileId: string | null,
    action: ImportJob["action"],
  ): Promise<ImportJob>;
  finishImportJob(id: string, status: ImportJob["status"], detailsJson: Record<string, unknown>): Promise<void>;
  listImportJobs(limit?: number): Promise<ImportJob[]>;
  getWeekById(weekId: string): Promise<WeekRecord | null>;
  getWeekByKey(weekKey: string): Promise<WeekRecord | null>;
  getWeekBySourceVersion(fileId: string, modifiedAt: string): Promise<WeekRecord | null>;
  upsertWeek(input: {
    weekKey: string;
    weekLabel: string;
    startDate: string;
    endDate: string;
    sourceFileName?: string | null;
    sourceFileId?: string | null;
    sourceModifiedAt?: string | null;
  }): Promise<WeekRecord>;
  listWeeks(): Promise<WeekRecord[]>;
  getCurrentWeek(): Promise<WeekRecord | null>;
  getWeekAggregate(weekId: string): Promise<WeekAggregate | null>;
  countNotesForExport(bounds: NotesCountBounds): Promise<number>;
  createTask(weekId: string, input: DayTaskInput, actor: HistoryActor): Promise<DayTask>;
  getTaskById(taskId: string): Promise<DayTask | null>;
  updateTask(taskId: string, patch: DayTaskPatch, actor: HistoryActor): Promise<DayTask | null>;
  deleteTask(taskId: string, actor: HistoryActor): Promise<boolean>;
  createHourBlock(weekId: string, input: HourBlockInput, actor: HistoryActor): Promise<HourBlock>;
  getHourBlockById(blockId: string): Promise<HourBlock | null>;
  updateHourBlock(blockId: string, patch: HourBlockPatch, actor: HistoryActor): Promise<HourBlock | null>;
  deleteHourBlock(blockId: string, actor: HistoryActor): Promise<boolean>;
  createHourEntry(weekId: string, input: HourEntryInput, actor: HistoryActor): Promise<HourEntry>;
  getHourEntryById(entryId: string): Promise<HourEntry | null>;
  updateHourEntry(entryId: string, patch: HourEntryPatch, actor: HistoryActor): Promise<HourEntry | null>;
  deleteHourEntry(entryId: string, actor: HistoryActor): Promise<boolean>;
  getHoursByWeek(weekId: string): Promise<{ entries: HourEntry[]; summary: HoursSummary }>;
  getHoursSummary(weekId: string): Promise<HoursSummary>;
  getRunningHourEntry(): Promise<HourEntry | null>;
  startHourTimer(weekId: string, input: TimerStartInput, actor: HistoryActor): Promise<HourEntry>;
  stopHourTimer(entryId: string, actor: HistoryActor): Promise<HourEntry | null>;
  listHourEntriesByRange(startDate: string | null, endDate: string | null): Promise<HourEntry[]>;
  listProjectBudgets(): Promise<ProjectBudget[]>;
  upsertProjectBudget(projectName: string, budgetHours: number): Promise<ProjectBudget>;
  deleteProjectBudget(id: string): Promise<boolean>;
  getProjectHourTotals(): Promise<Array<{ projectName: string; totalHours: number }>>;
  listHistory(weekId: string, limit?: number): Promise<TaskHistory[]>;
  listThoughtThreads(limit?: number): Promise<ThoughtThread[]>;
  getThoughtThreadById(threadId: string): Promise<ThoughtThread | null>;
  createThoughtThread(input: ThoughtThreadInput): Promise<ThoughtThread>;
  listThoughtMessages(threadId: string): Promise<ThoughtMessage[]>;
  addThoughtMessage(threadId: string, input: ThoughtMessageInput): Promise<ThoughtMessage>;
  listThoughtSummaries(threadId: string): Promise<ThoughtSummary[]>;
  createThoughtSummary(
    threadId: string,
    content: ThoughtSummaryContent,
    messageCount: number,
  ): Promise<ThoughtSummary>;
  archiveThoughtThread(threadId: string): Promise<ThoughtThread | null>;
  deleteThoughtThread(threadId: string): Promise<boolean>;
  upsertImportedData(
    weekId: string,
    payload: { tasks: DayTaskInput[]; hourBlocks: HourBlockInput[] },
  ): Promise<ImportUpsertResult>;
}
