export const WEEKDAYS = [
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
  "zondag",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];
export type Priority = "hoog" | "middel" | "laag";
export type TaskStatus = "open" | "bezig" | "klaar";
export type SourceType = "manual" | "import" | "system";

export interface AppSettings {
  id: string;
  pinHash: string;
  timezone: string;
  weekStartDay: "maandag";
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface DriveConnection {
  id: string;
  provider: "google-drive";
  accessTokenEnc: string;
  refreshTokenEnc: string;
  expiresAt: string;
  folderId: string;
  connectedAt: string;
  updatedAt: string;
}

export interface WeekRecord {
  id: string;
  weekKey: string;
  weekLabel: string;
  startDate: string;
  endDate: string;
  sourceFileName: string | null;
  sourceFileId: string | null;
  sourceModifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DayTask {
  id: string;
  weekId: string;
  weekday: Weekday;
  title: string;
  info: string;
  deadlineAt: string | null;
  priority: Priority;
  status: TaskStatus;
  position: number;
  source: SourceType;
  createdAt: string;
  updatedAt: string;
}

export interface HourBlock {
  id: string;
  weekId: string;
  weekday: Weekday;
  dayDate: string | null;
  timeStart: string;
  timeEnd: string;
  taskText: string;
  projectText: string;
  deadlineAt: string | null;
  status: TaskStatus;
  position: number;
  source: SourceType;
  assignees: string[];
  createdAt: string;
  updatedAt: string;
}

export interface HourEntry {
  id: string;
  weekId: string;
  dayDate: string;
  weekday: Weekday;
  hoursDecimal: number;
  projectName: string;
  noteText: string;
  source: SourceType;
  createdAt: string;
  updatedAt: string;
}

export type HistoryEntityType = "task" | "hour_entry" | "hour_block" | "week";
export type HistoryEventType = "created" | "updated" | "deleted" | "imported";
export type HistoryActor = "user" | "system-import" | "system";

export interface ChangeMap {
  [key: string]: {
    before: unknown;
    after: unknown;
  };
}

export interface TaskHistory {
  id: string;
  weekId: string;
  entityType: HistoryEntityType;
  entityId: string;
  eventType: HistoryEventType;
  actor: HistoryActor;
  noteText: string;
  changedFields: ChangeMap;
  createdAt: string;
}

export interface ImportJob {
  id: string;
  provider: "manual" | "google-drive";
  fileId: string | null;
  fileName: string;
  action: "import" | "sync";
  status: "running" | "success" | "failed";
  detailsJson: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
}

export interface ThoughtThread {
  id: string;
  weekId: string | null;
  dayDate: string | null;
  title: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface ThoughtMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  bodyText: string;
  createdAt: string;
}

export interface ThoughtSummaryContent {
  overview: string;
  ideas: string[];
  tasks: string[];
  planningNotes: string[];
}

export interface ThoughtSummary {
  id: string;
  threadId: string;
  content: ThoughtSummaryContent;
  messageCount: number;
  createdAt: string;
}

export interface LocalDatabaseState {
  appSettings: AppSettings | null;
  sessions: SessionRecord[];
  driveConnection: DriveConnection | null;
  weeks: WeekRecord[];
  dayTasks: DayTask[];
  hourBlocks: HourBlock[];
  hourEntries: HourEntry[];
  taskHistory: TaskHistory[];
  importJobs: ImportJob[];
  thoughtThreads: ThoughtThread[];
  thoughtMessages: ThoughtMessage[];
  thoughtSummaries: ThoughtSummary[];
}

export interface WeekAggregate {
  week: WeekRecord;
  tasks: DayTask[];
  hourBlocks: HourBlock[];
  hourEntries: HourEntry[];
  history: TaskHistory[];
}

export interface HoursSummary {
  weeklyTotalHours: number;
  perProjectTotals: Array<{ projectName: string; totalHours: number }>;
  perDayTotals: Array<{ dayDate: string; weekday: Weekday; totalHours: number }>;
}

export interface DayTaskInput {
  weekday: Weekday;
  title: string;
  info?: string;
  deadlineAt?: string | null;
  priority?: Priority;
  status?: TaskStatus;
  position?: number;
  source?: SourceType;
}

export interface DayTaskPatch extends Partial<DayTaskInput> {
  weekId?: string;
}

export interface HourBlockInput {
  weekday: Weekday;
  dayDate?: string | null;
  timeStart: string;
  timeEnd: string;
  taskText?: string;
  projectText?: string;
  deadlineAt?: string | null;
  status?: TaskStatus;
  position?: number;
  source?: SourceType;
  assignees?: string[];
}

export interface HourBlockPatch extends Partial<HourBlockInput> {
  weekId?: string;
}

export interface HourEntryInput {
  dayDate: string;
  weekday: Weekday;
  hoursDecimal: number;
  projectName?: string;
  noteText?: string;
  source?: SourceType;
}

export interface HourEntryPatch extends Partial<HourEntryInput> {
  weekId?: string;
}

export interface ThoughtThreadInput {
  weekId?: string | null;
  dayDate?: string | null;
  title?: string;
}

export interface ThoughtMessageInput {
  bodyText: string;
}

export interface ImportUpsertResult {
  taskCreated: number;
  taskUpdated: number;
  blockCreated: number;
  blockUpdated: number;
}
