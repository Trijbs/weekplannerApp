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
export type SourceType = "manual" | "import" | "system" | "thought";

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
  threadId: string | null;
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

export type HourEntryStatus = "running" | "registered";

export interface HourEntry {
  id: string;
  weekId: string;
  dayDate: string;
  weekday: Weekday;
  hoursDecimal: number;
  projectName: string;
  noteText: string;
  source: SourceType;
  startedAt: string | null;
  stoppedAt: string | null;
  hourBlockId: string | null;
  dayTaskId: string | null;
  status: HourEntryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectBudget {
  id: string;
  projectName: string;
  budgetHours: number;
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

export type ThoughtMood = "positief" | "neutraal" | "gestrest" | "negatief";
export type ThoughtPriority = "hoog" | "middel" | "laag";

export interface ThoughtSummaryContent {
  overview: string;
  tasks: string[];
  ideas: string[];
  planningNotes: string[];
  concerns: string[];
  questions: string[];
  decisions: string[];
  blocked: string[];
  mood: ThoughtMood;
  priority: ThoughtPriority;
  tags: string[];
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
  projectBudgets: ProjectBudget[];
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
  threadId?: string | null;
}

export interface DayTaskPatch extends Partial<DayTaskInput> {
  weekId?: string;
  threadId?: string | null;
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
  startedAt?: string | null;
  stoppedAt?: string | null;
  hourBlockId?: string | null;
  dayTaskId?: string | null;
  status?: HourEntryStatus;
}

export interface HourEntryPatch extends Partial<HourEntryInput> {
  weekId?: string;
}

export interface TimerStartInput {
  dayDate: string;
  weekday: Weekday;
  projectName?: string;
  noteText?: string;
  hourBlockId?: string | null;
  dayTaskId?: string | null;
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
