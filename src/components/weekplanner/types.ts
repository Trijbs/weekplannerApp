import type { DayTask, HourBlock, HourEntry, Weekday } from "@/lib/db/types";

export type CompletedTaskLogItem = {
  taskId: string;
  weekId: string;
  title: string;
  info: string;
  weekday: Weekday;
  dayDate: string | null;
  projectText: string;
  deadlineAt: string | null;
  checkedAt: string;
};

export type PlannerDaySummary = {
  key: string;
  weekId: string;
  weekLabel: string;
  weekday: Weekday;
  dayDate: string;
  tasks: DayTask[];
  hourBlocks: HourBlock[];
  hourEntries: HourEntry[];
  taskDone: number;
  blockDone: number;
  hoursTotal: number;
  isToday: boolean;
  isPast: boolean;
};

export type PlannerSearchResult = {
  key: string;
  weekId: string;
  weekLabel: string;
  weekday: Weekday;
  dayDate: string;
  matchCount: number;
  previews: string[];
};

export type HourBlockDisplayGroup = {
  key: string;
  weekId: string;
  weekday: Weekday;
  dayDate: string | null;
  label: string;
  projectText: string;
  taskLabels: string[];
  assignees: string[];
  timeStart: string;
  timeEnd: string;
  totalMinutes: number;
  deadlineAt: string | null;
  primaryStatus: HourBlock["status"];
  hasMixedStatus: boolean;
  blocks: HourBlock[];
};

export type HourEntryDayGroup = {
  key: string;
  weekId: string;
  weekLabel: string;
  dayDate: string;
  weekday: Weekday;
  totalHours: number;
  entries: HourEntry[];
};

export type DetailTaskFormState = {
  title: string;
  info: string;
  scheduleHint: string;
  deadlineAt: string;
  priority: "hoog" | "middel" | "laag";
};
