"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DayTask,
  HourBlock,
  HourEntry,
  HoursSummary,
  ImportJob,
  TaskHistory,
  WeekAggregate,
  WeekRecord,
  Weekday,
} from "@/lib/db/types";
import { WEEKDAYS } from "@/lib/db/types";
import { formatIsoToLocalInput } from "@/lib/db/helpers";
import { DayDetailModal } from "@/components/weekplanner/DayDetailModal";
import { PlannerHeader } from "@/components/weekplanner/PlannerHeader";
import { WeekScrollStrip } from "@/components/weekplanner/WeekScrollStrip";
import { ProjectCombobox } from "@/components/weekplanner/ProjectCombobox";
import { AssigneeTagInput } from "@/components/weekplanner/AssigneeTagInput";
import { ThoughtInbox } from "@/components/weekplanner/ThoughtInbox";
import { AnimatedDeleteButton } from "@/components/weekplanner/AnimatedDeleteButton";
import { MultiWeekPlanModal } from "@/components/weekplanner/MultiWeekPlanModal";
import { NotesExportModal } from "@/components/weekplanner/NotesExportModal";
import { TimerSection, type TimerStartRequest } from "@/components/tijdregistratie/TimerSection";
import { RemindersBanner } from "@/components/tijdregistratie/RemindersBanner";
import { ProjectBudgets } from "@/components/tijdregistratie/ProjectBudgets";
import { ExportCenter } from "@/components/tijdregistratie/ExportCenter";
import {
  deriveTimeReminders,
  wallClockNowPseudoIso,
  type TimeReminder,
} from "@/lib/time/tracking";
import {
  getLocale,
  getMonthLabels,
  getWeekdayLabels,
  translateStatus,
  translateStatic,
  type AppLanguage,
} from "@/lib/i18n";
import type {
  CompletedTaskLogItem,
  DetailTaskFormState,
  HourBlockDisplayGroup,
  HourEntryDayGroup,
  PlannerDaySummary,
  PlannerSearchResult,
} from "@/components/weekplanner/types";
import {
  flushMutationQueue,
  getQueuedCount,
  mutationFetch,
} from "@/lib/client/offline-queue";

type Tab = "planner" | "hours" | "blocks" | "past" | "log" | "thoughts";

type DashboardPayload = WeekAggregate & {
  hourSummary: HoursSummary;
  importJobs: ImportJob[];
  weeks: WeekRecord[];
};

type WeekDetailPayload = WeekAggregate & {
  hourSummary: HoursSummary;
};

type PinStatus = {
  configured: boolean;
  authenticated: boolean;
};

type WeekplannerAppProps = {
  initialPinStatus?: PinStatus | null;
};

type MutationResultData = {
  weekId?: string;
  task?: DayTask;
  block?: HourBlock;
  entry?: HourEntry;
  summary?: HoursSummary;
};

type MutationOptions = {
  localUpdate?: boolean;
  silent?: boolean;
  keepCurrentWeek?: boolean;
};

type MutationOutcome = {
  ok: boolean;
  queued: boolean;
  data?: MutationResultData;
};

type InlineFeedbackState = {
  status: "saving" | "saved" | "queued" | "error";
  message: string;
};

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hours = String(Math.floor(index / 4)).padStart(2, "0");
  const minutes = String((index % 4) * 15).padStart(2, "0");
  return `${hours}:${minutes}`;
});

const HOUR_DECIMAL_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const value = Number(((index + 1) * 0.25).toFixed(2));
  return value.toString();
});

function hourOptionsWithValue(value: number | string): string[] {
  const normalized = Number(value);
  if (Number.isNaN(normalized) || normalized <= 0) {
    return HOUR_DECIMAL_OPTIONS;
  }

  const asText = normalized.toString();
  if (HOUR_DECIMAL_OPTIONS.includes(asText)) {
    return HOUR_DECIMAL_OPTIONS;
  }

  return [...HOUR_DECIMAL_OPTIONS, asText].sort((a, b) => Number(a) - Number(b));
}

function addDaysIso(baseIsoDate: string, days: number): string {
  const base = new Date(`${baseIsoDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function isoWeekStartEnd(weekNumber: number, year: number): { startDate: string; endDate: string } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));

  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (weekNumber - 1) * 7);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    startDate: monday.toISOString().slice(0, 10),
    endDate: sunday.toISOString().slice(0, 10),
  };
}

function formatDayDateLabel(isoDate: string, monthLabels: string[]): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) {
    return isoDate;
  }

  const monthIndex = Number(month) - 1;
  const monthLabel = monthLabels[monthIndex] ?? month;
  return `${Number(day)} ${monthLabel}`;
}

function formatDateTimeAmsterdam(value: string | null, locale: string): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString(locale, {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatIsoDateAmsterdam(isoDate: string | null, locale: string): string {
  if (!isoDate) {
    return "-";
  }

  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }

  return parsed.toLocaleDateString(locale, {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function isoDateFromDateTimeAmsterdam(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

function normalizeTaskKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase();
}

function extractProjectFromInfo(info: string): string | null {
  const segments = info
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const match = segment.match(/^project\s*:\s*(.+)$/i);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return null;
}

function isPauseLabel(value: string): boolean {
  return /pauze/i.test(value);
}

function levenshteinSimilarity(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  const m = la.length;
  const n = lb.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = la[i - 1] === lb[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[m][n] / Math.max(m, n, 1);
}

function projectNameForTask(task: DayTask, hourBlocks: HourBlock[]): string | null {
  const fromInfo = extractProjectFromInfo(task.info);
  if (fromInfo) {
    return fromInfo;
  }

  const taskKey = normalizeTaskKey(task.title);
  if (!taskKey) {
    return null;
  }

  for (const block of hourBlocks) {
    if (normalizeTaskKey(block.taskText) !== taskKey) {
      continue;
    }
    const project = block.projectText.trim();
    if (project) {
      return project;
    }
  }

  return null;
}

function todayIsoForTimezone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function nowLabelForTimezone(timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function minutesNowForTimezone(timeZone: string): number | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const hourPart = parts.find((part) => part.type === "hour")?.value;
  const minutePart = parts.find((part) => part.type === "minute")?.value;
  if (!hourPart || !minutePart) {
    return null;
  }

  const hour = Number(hourPart);
  const minute = Number(minutePart);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return hour * 60 + minute;
}

function isNowInsideBlock(timeStart: string, timeEnd: string, nowMinutes: number | null): boolean {
  if (nowMinutes == null) {
    return false;
  }

  const start = parseTimeToMinutes(timeStart);
  const end = parseTimeToMinutes(timeEnd);
  if (start == null || end == null || end <= start) {
    return false;
  }

  return nowMinutes >= start && nowMinutes < end;
}

function plannerTaskStatusRank(status: DayTask["status"]): number {
  if (status === "open") return 0;
  if (status === "bezig") return 1;
  return 2;
}

function sortPlannerTasks(tasks: DayTask[]): DayTask[] {
  return tasks.slice().sort((a, b) => {
    const statusDiff = plannerTaskStatusRank(a.status) - plannerTaskStatusRank(b.status);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    const createdDiff = b.createdAt.localeCompare(a.createdAt);
    if (createdDiff !== 0) {
      return createdDiff;
    }

    const updatedDiff = b.updatedAt.localeCompare(a.updatedAt);
    if (updatedDiff !== 0) {
      return updatedDiff;
    }

    return a.title.localeCompare(b.title, "nl");
  });
}

function dedupeTaskKeyForDisplay(task: DayTask): string {
  const titleKey = normalizeTaskKey(task.title) || `id:${task.id}`;
  const projectKey = normalizeTaskKey(extractProjectFromInfo(task.info) ?? "");
  const deadlineKey = task.deadlineAt ? isoDateFromDateTimeAmsterdam(task.deadlineAt) ?? task.deadlineAt : "";
  return `${titleKey}|${projectKey}|${deadlineKey}`;
}

function dedupeTasksForDisplay(tasks: DayTask[]): DayTask[] {
  const byKey = new Map<string, DayTask>();

  for (const task of tasks) {
    const key = dedupeTaskKeyForDisplay(task);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, task);
      continue;
    }

    const chooseCurrent =
      task.updatedAt > existing.updatedAt ||
      (task.updatedAt === existing.updatedAt && task.createdAt > existing.createdAt);
    if (chooseCurrent) {
      byKey.set(key, task);
    }
  }

  return sortPlannerTasks(Array.from(byKey.values()));
}

function mergeDayTasksWithHourBlocks(
  tasks: DayTask[],
  blocks: HourBlock[],
  weekId: string,
  weekday: Weekday,
  dayDate: string,
): DayTask[] {
  const merged = new Map<string, DayTask>();

  for (const task of tasks) {
    const taskKey = normalizeTaskKey(task.title) || `id:${task.id}`;
    if (!merged.has(taskKey)) {
      merged.set(taskKey, task);
    }
  }

  const syntheticTimestamp = `${dayDate}T00:00:00.000Z`;
  for (const block of blocks) {
    const title = block.taskText.trim();
    const taskKey = normalizeTaskKey(title);
    if (!taskKey || merged.has(taskKey)) {
      continue;
    }

    merged.set(taskKey, {
      id: `virtual:${weekId}:${weekday}:${taskKey}`,
      weekId,
      weekday,
      title,
      info: block.projectText.trim() ? `Project: ${block.projectText.trim()}` : "",
      deadlineAt: block.deadlineAt ?? null,
      priority: "middel",
      status: block.status,
      position: block.position,
      source: "system",
      threadId: null,
      createdAt: syntheticTimestamp,
      updatedAt: syntheticTimestamp,
    });
  }

  return sortPlannerTasks(Array.from(merged.values()));
}

function formatHourAmount(hours: number): string {
  const rounded = Number(hours.toFixed(2));
  return Number.isInteger(rounded) ? `${rounded}u` : `${rounded.toFixed(2).replace(".", ",")}u`;
}

function blockGroupingIdentity(block: HourBlock): { key: string; label: string } | null {
  const project = block.projectText.trim();
  const task = block.taskText.trim();
  const projectKey = normalizeTaskKey(project);
  const taskKey = normalizeTaskKey(task);

  if (projectKey) {
    return { key: `project:${projectKey}`, label: project };
  }

  if (taskKey) {
    return { key: `task:${taskKey}`, label: task };
  }

  return null;
}

function createHourBlockDisplayGroup(block: HourBlock): HourBlockDisplayGroup {
  const startMinutes = parseTimeToMinutes(block.timeStart) ?? 0;
  const endMinutes = parseTimeToMinutes(block.timeEnd) ?? startMinutes;
  const duration = Math.max(0, endMinutes - startMinutes);
  const identity = blockGroupingIdentity(block);
  const taskLabel = block.taskText.trim();

  return {
    key: `${block.id}:${block.dayDate ?? block.weekday}:${identity?.key ?? "single"}`,
    weekId: block.weekId,
    weekday: block.weekday,
    dayDate: block.dayDate,
    label: identity?.label || taskLabel || "Los uurblok",
    projectText: block.projectText.trim(),
    taskLabels: taskLabel ? [taskLabel] : [],
    assignees: block.assignees.filter((a) => a.trim().length > 0),
    timeStart: block.timeStart,
    timeEnd: block.timeEnd,
    totalMinutes: duration,
    deadlineAt: block.deadlineAt,
    primaryStatus: block.status,
    hasMixedStatus: false,
    blocks: [block],
  };
}

function groupHourBlocksForDisplay(blocks: HourBlock[]): HourBlockDisplayGroup[] {
  const sorted = blocks
    .slice()
    .sort(
      (a, b) =>
        (a.dayDate ?? "").localeCompare(b.dayDate ?? "") ||
        a.timeStart.localeCompare(b.timeStart) ||
        a.timeEnd.localeCompare(b.timeEnd) ||
        a.position - b.position,
    );

  const groups: HourBlockDisplayGroup[] = [];

  for (const block of sorted) {
    const identity = blockGroupingIdentity(block);
    const previous = groups[groups.length - 1];
    const canMerge =
      Boolean(previous) &&
      Boolean(identity) &&
      previous.dayDate === block.dayDate &&
      previous.timeEnd === block.timeStart &&
      blockGroupingIdentity(previous.blocks[0])?.key === identity?.key;

    if (!canMerge || !previous) {
      groups.push(createHourBlockDisplayGroup(block));
      continue;
    }

    previous.blocks.push(block);
    previous.timeEnd = block.timeEnd;
    previous.totalMinutes += Math.max(
      0,
      (parseTimeToMinutes(block.timeEnd) ?? 0) - (parseTimeToMinutes(block.timeStart) ?? 0),
    );
    previous.hasMixedStatus = previous.hasMixedStatus || previous.primaryStatus !== block.status;
    if (!previous.deadlineAt && block.deadlineAt) {
      previous.deadlineAt = block.deadlineAt;
    }
    const taskLabel = block.taskText.trim();
    if (taskLabel && !previous.taskLabels.includes(taskLabel)) {
      previous.taskLabels.push(taskLabel);
    }
    const seenAssignees = new Set(previous.assignees.map((a) => a.toLowerCase()));
    for (const assignee of block.assignees) {
      if (assignee && !seenAssignees.has(assignee.toLowerCase())) {
        previous.assignees.push(assignee);
        seenAssignees.add(assignee.toLowerCase());
      }
    }
  }

  return groups;
}

function shouldDisplayBlockForDay(
  block: HourBlock,
  weekday: Weekday,
  dayDate: string | null,
  range?: { startDate: string; endDate: string } | null,
): boolean {
  if (block.weekday !== weekday) {
    return false;
  }

  if (!dayDate || !block.dayDate || block.dayDate === dayDate) {
    return true;
  }

  const inferredWeekday = weekdayFromIsoDate(block.dayDate);
  const inRange = range ? block.dayDate >= range.startDate && block.dayDate <= range.endDate : true;

  // Keep inconsistent/out-of-range records visible under their weekday instead of hiding them.
  if (inferredWeekday !== block.weekday || !inRange) {
    return true;
  }

  return false;
}

function timezoneOffsetMinutesAt(date: Date, timeZone: string): number | null {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")
    ?.value;

  if (!name) {
    return null;
  }

  const normalized = name.replace("UTC", "GMT");
  if (normalized === "GMT") {
    return 0;
  }

  const match = normalized.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) {
    return null;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return sign * (hours * 60 + minutes);
}

function localInputToTimezoneIso(localValue: string, timeZone: string): string | null {
  const match = localValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const offsetInitial = timezoneOffsetMinutesAt(new Date(naiveUtcMs), timeZone);
  if (offsetInitial == null) {
    return null;
  }

  let utcMs = naiveUtcMs - offsetInitial * 60_000;
  const offsetRecheck = timezoneOffsetMinutesAt(new Date(utcMs), timeZone);
  if (offsetRecheck != null && offsetRecheck !== offsetInitial) {
    utcMs = naiveUtcMs - offsetRecheck * 60_000;
  }

  const result = new Date(utcMs);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(result);

  const checkYear = parts.find((part) => part.type === "year")?.value;
  const checkMonth = parts.find((part) => part.type === "month")?.value;
  const checkDay = parts.find((part) => part.type === "day")?.value;
  const checkHour = parts.find((part) => part.type === "hour")?.value;
  const checkMinute = parts.find((part) => part.type === "minute")?.value;
  const targetDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const targetTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  if (!checkYear || !checkMonth || !checkDay || !checkHour || !checkMinute) {
    return null;
  }
  if (`${checkYear}-${checkMonth}-${checkDay}` !== targetDate || `${checkHour}:${checkMinute}` !== targetTime) {
    return null;
  }

  return result.toISOString();
}

function datePartFromLocalInput(localValue: string): string | null {
  const match = localValue.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}$/);
  return match?.[1] ?? null;
}

function timePartFromLocalInput(localValue: string): string {
  const match = localValue.match(/T(\d{2}:\d{2})$/);
  return match?.[1] ?? "";
}

function applyTimeToLocalInput(localValue: string, timeValue: string, fallbackDate: string | null): string {
  if (parseTimeToMinutes(timeValue) == null) {
    return localValue;
  }

  const datePart = datePartFromLocalInput(localValue) ?? fallbackDate ?? todayIsoForTimezone("Europe/Amsterdam");
  return `${datePart}T${timeValue}`;
}

function parseTimeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }

  return false;
}

async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 12000,
): Promise<{ response: Response; json: T }> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });

    const text = await response.text();
    let json: T;
    try {
      json = (text ? JSON.parse(text) : {}) as T;
    } catch {
      throw new Error("Ongeldige serverresponse ontvangen.");
    }

    return { response, json };
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("Netwerk-timeout. Controleer of de app server draait.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function normalizedWeekRange(week: WeekRecord): { startDate: string; endDate: string } {
  if (week.startDate && week.endDate && week.startDate <= week.endDate) {
    return {
      startDate: week.startDate,
      endDate: week.endDate,
    };
  }

  const keyMatch = week.weekKey.match(/^week-(?:(\d{4})-)?(\d{1,2})$/i);
  const year = Number(keyMatch?.[1] ?? week.startDate.slice(0, 4));

  if (keyMatch && Number.isFinite(year)) {
    const weekNumber = Number(keyMatch[2]);
    if (weekNumber >= 1 && weekNumber <= 53) {
      return isoWeekStartEnd(weekNumber, year);
    }
  }

  return {
    startDate: week.startDate,
    endDate: week.endDate,
  };
}

function weekdayFromIsoDate(isoDate: string): Weekday | null {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const day = date.getUTCDay();
  if (day === 1) return "maandag";
  if (day === 2) return "dinsdag";
  if (day === 3) return "woensdag";
  if (day === 4) return "donderdag";
  if (day === 5) return "vrijdag";
  if (day === 6) return "zaterdag";
  if (day === 0) return "zondag";
  return null;
}

function weekdayDatesFromRange(startDate: string, endDate: string): Record<Weekday, string> {
  const computed = {
    maandag: "",
    dinsdag: "",
    woensdag: "",
    donderdag: "",
    vrijdag: "",
    zaterdag: "",
    zondag: "",
  } satisfies Record<Weekday, string>;

  if (!startDate || !endDate || startDate > endDate) {
    return computed;
  }

  let cursor = startDate;
  while (cursor <= endDate) {
    const day = weekdayFromIsoDate(cursor);
    if (day && !computed[day]) {
      computed[day] = cursor;
    }
    cursor = addDaysIso(cursor, 1);
  }

  return computed;
}

function weekdayDatesForWeek(week: WeekRecord, hourBlocks: HourBlock[]): Record<Weekday, string> {
  const range = normalizedWeekRange(week);
  const computed = weekdayDatesFromRange(range.startDate, range.endDate);

  for (const block of hourBlocks) {
    if (!block.dayDate) {
      continue;
    }
    if (weekdayFromIsoDate(block.dayDate) !== block.weekday) {
      continue;
    }
    if (block.dayDate < range.startDate || block.dayDate > range.endDate) {
      continue;
    }
    if (!computed[block.weekday]) {
      computed[block.weekday] = block.dayDate;
    }
  }

  return computed;
}

function ApiError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

export function WeekplannerApp({ initialPinStatus = null }: WeekplannerAppProps) {
  const initOnceRef = useRef(false);
  const [language, setLanguage] = useState<AppLanguage>("nl");
  const [tab, setTab] = useState<Tab>("planner");
  const [pinStatus, setPinStatus] = useState<PinStatus | null>(initialPinStatus);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(!initialPinStatus);
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [activeWeekId, setActiveWeekId] = useState<string | null>(null);
  const [todayIsoAmsterdam, setTodayIsoAmsterdam] = useState<string | null>(null);
  const [liveNowAmsterdam, setLiveNowAmsterdam] = useState("");
  const [todoDay, setTodoDay] = useState<Weekday>("maandag");
  const [plannerDayDetailRef, setPlannerDayDetailRef] = useState<{ weekId: string; dayDate: string } | null>(null);
  const [daySearchDate, setDaySearchDate] = useState("");
  const [plannerSearchQuery, setPlannerSearchQuery] = useState("");
  const [logDateFilter, setLogDateFilter] = useState<"all" | "today" | "week">("all");
  const [logProjectFilter, setLogProjectFilter] = useState<string>("all");
  const [hiddenLogTaskIds, setHiddenLogTaskIds] = useState<string[]>([]);
  const [hoursNotesExpanded, setHoursNotesExpanded] = useState(false);
  const [timezone, setTimezone] = useState("Europe/Amsterdam");
  // Hours tab filters
  const [hoursPeriodFilter, setHoursPeriodFilter] = useState<"all" | "week" | "day">("all");
  const [hoursDayFilter, setHoursDayFilter] = useState("");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [mergeModalProject, setMergeModalProject] = useState<string | null>(null);
  const [mergeTargets, setMergeTargets] = useState<Set<string>>(new Set());
  const [renameModalProject, setRenameModalProject] = useState<string | null>(null);
  const [renameModalValue, setRenameModalValue] = useState("");
  // Block form extra fields
  const [blockAssignees, setBlockAssignees] = useState<string[]>([]);
  const [blockMultiDay, setBlockMultiDay] = useState(false);
  const [blockMultiDaySelection, setBlockMultiDaySelection] = useState<Set<Weekday>>(new Set());
  const [showMultiWeekModal, setShowMultiWeekModal] = useState(false);
  const [showMultiWeekBlockModal, setShowMultiWeekBlockModal] = useState(false);
  const [showNotesExportModal, setShowNotesExportModal] = useState(false);
  const [highlightThreadId, setHighlightThreadId] = useState<string | null>(null);

  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [weekSnapshots, setWeekSnapshots] = useState<Record<string, WeekDetailPayload>>({});

  const [taskForm, setTaskForm] = useState({
    weekday: "maandag" as Weekday,
    title: "",
    info: "",
    deadlineAt: "",
    priority: "middel",
    status: "open",
  });
  const [detailTaskForm, setDetailTaskForm] = useState<DetailTaskFormState>({
    title: "",
    info: "",
    scheduleHint: "",
    deadlineAt: "",
    priority: "middel",
  });
  const [detailTaskComposerExpanded, setDetailTaskComposerExpanded] = useState(false);
  const [showMoreTaskOptions, setShowMoreTaskOptions] = useState(false);

  const [hourForm, setHourForm] = useState(() => {
    const dayDate = todayIsoForTimezone("Europe/Amsterdam");
    return {
      dayDate,
      weekday: weekdayFromIsoDate(dayDate) ?? ("maandag" as Weekday),
      hoursDecimal: "1",
      projectName: "",
      noteText: "",
    };
  });
  const [hoursCalcForm, setHoursCalcForm] = useState({
    startAt: "09:00",
    endAt: "17:00",
    breakMinutes: "0",
  });
  const [hourEntryHoursEditing, setHourEntryHoursEditing] = useState<Record<string, boolean>>({});
  const [hourEntryHoursDrafts, setHourEntryHoursDrafts] = useState<Record<string, string>>({});

  // Tijdregistratie: lopende timer, herinneringen en koppeling voor voorgevulde registratie
  const [runningEntry, setRunningEntry] = useState<HourEntry | null>(null);
  const [dismissedReminders, setDismissedReminders] = useState<Set<string>>(() => new Set());
  const [reminderMinuteTick, setReminderMinuteTick] = useState(0);
  const [hourFormLink, setHourFormLink] = useState<{ hourBlockId?: string; dayTaskId?: string } | null>(null);

  const [blockForm, setBlockForm] = useState(() => {
    const dayDate = todayIsoForTimezone("Europe/Amsterdam");
    return {
      weekday: weekdayFromIsoDate(dayDate) ?? ("maandag" as Weekday),
      dayDate,
      timeStart: "09:00",
      timeEnd: "10:00",
      taskText: "",
      projectText: "",
      deadlineAt: "",
      status: "open",
    };
  });
  const [blockEndTimeAutoSet, setBlockEndTimeAutoSet] = useState(true);
  const [inlineFeedback, setInlineFeedback] = useState<InlineFeedbackState | null>(null);
  const weekdayLabels = useMemo(() => getWeekdayLabels(language), [language]);
  const monthLabels = useMemo(() => getMonthLabels(language), [language]);
  const locale = useMemo(() => getLocale(language), [language]);
  const t = useCallback((text: string) => translateStatic(language, text), [language]);
  const formatDayDateLabelForLanguage = useCallback(
    (isoDate: string) => formatDayDateLabel(isoDate, monthLabels),
    [monthLabels],
  );
  const formatDateTimeForLanguage = useCallback(
    (value: string | null) => formatDateTimeAmsterdam(value, locale),
    [locale],
  );
  const formatIsoDateForLanguage = useCallback(
    (value: string | null) => formatIsoDateAmsterdam(value, locale),
    [locale],
  );

  const refreshQueueCount = useCallback(async () => {
    const count = await getQueuedCount();
    setQueueCount(count);
  }, []);

  const fetchPinStatus = useCallback(async (): Promise<PinStatus> => {
    const { response, json } = await fetchJsonWithTimeout<{ data?: PinStatus; error?: string }>(
      "/api/auth/pin/status",
      { cache: "no-store" },
    );

    if (!response.ok || !json.data) {
      throw new Error(json.error ?? "PIN-status laden mislukt.");
    }

    return json.data;
  }, []);

  const loadWeekSnapshots = useCallback(async (weeks: WeekRecord[], current: DashboardPayload | null) => {
    if (!weeks.length) {
      setWeekSnapshots({});
      return;
    }

    const next: Record<string, WeekDetailPayload> = {};
    if (current) {
      next[current.week.id] = {
        week: current.week,
        tasks: current.tasks,
        hourBlocks: current.hourBlocks,
        hourEntries: current.hourEntries,
        history: current.history,
        hourSummary: current.hourSummary,
      };
    }

    await Promise.all(
      weeks.map(async (week) => {
        if (next[week.id]) {
          return;
        }

        try {
          const { response, json } = await fetchJsonWithTimeout<{ data?: WeekDetailPayload; error?: string }>(
            `/api/weeks/${week.id}`,
            { cache: "no-store" },
          );

          if (response.ok && json.data) {
            next[week.id] = json.data;
          }
        } catch {
          // Ignore a single week fetch failure; planner can still render available weeks.
        }
      }),
    );

    setWeekSnapshots(next);
  }, []);

  const loadData = useCallback(async (weekIdOverride: string | null = null) => {
    const requestedWeekId = weekIdOverride;
    const query = requestedWeekId ? `?weekId=${encodeURIComponent(requestedWeekId)}` : "";
    const { response, json } = await fetchJsonWithTimeout<{ data?: DashboardPayload; error?: string }>(
      `/api/weeks/current${query}`,
      { cache: "no-store" },
    );

    if (response.status === 401) {
      setPayload(null);
      return false;
    }

    if (!response.ok || !json.data) {
      throw new Error(json.error ?? "Data laden mislukt");
    }

    setPayload(json.data);
    setActiveWeekId(json.data.week.id);
    void loadWeekSnapshots(json.data.weeks, json.data);
    return true;
  }, [loadWeekSnapshots]);

  const init = useCallback(
    async (forceStatusRefresh = false) => {
      setError(null);
      try {
        let status = pinStatus;
        if (!status || forceStatusRefresh) {
          setBusy(true);
          status = await fetchPinStatus();
          setPinStatus(status);
          setBusy(false);
        }

        if (status?.authenticated) {
          await loadData(null);
        }
      } catch (initError) {
        setError(initError instanceof Error ? initError.message : "Initialisatie mislukt");
      } finally {
        setBusy(false);
      }
    },
    [fetchPinStatus, loadData, pinStatus],
  );

  useEffect(() => {
    if (initOnceRef.current) {
      return;
    }

    initOnceRef.current = true;
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    void init();
    void refreshQueueCount();
  }, [init, refreshQueueCount]);

  useEffect(() => {
    const onlineHandler = () => {
      setIsOnline(true);
      void (async () => {
        await flushMutationQueue();
        await refreshQueueCount();
        await loadData(activeWeekId);
      })();
    };

    const offlineHandler = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
    };
  }, [activeWeekId, loadData, refreshQueueCount]);

  useEffect(() => {
    const updateToday = () => setTodayIsoAmsterdam(todayIsoForTimezone("Europe/Amsterdam"));
    updateToday();
    const timer = window.setInterval(updateToday, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Keep queue count in sync: poll every 3 s when online, and refresh on tab focus
  useEffect(() => {
    const tick = () => { if (navigator.onLine) void refreshQueueCount(); };
    const onVisible = () => { if (document.visibilityState === "visible") void refreshQueueCount(); };
    const timer = window.setInterval(tick, 3_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshQueueCount]);

  useEffect(() => {
    const updateNow = () => setLiveNowAmsterdam(nowLabelForTimezone("Europe/Amsterdam", locale));
    updateNow();
    const timer = window.setInterval(updateNow, 1_000);
    return () => window.clearInterval(timer);
  }, [locale]);

  // Lopende timer laden zodra weekdata ververst (timer overleeft zo een refresh).
  useEffect(() => {
    if (!payload) {
      return;
    }
    let cancelled = false;
    void fetch("/api/hours/timer", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { data?: { running: HourEntry | null } } | null) => {
        if (!cancelled) {
          setRunningEntry(json?.data?.running ?? null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [payload]);

  // Herinneringen herberekenen per minuut (uurblok-eindtijden verstrijken).
  useEffect(() => {
    const timer = window.setInterval(() => setReminderMinuteTick((prev) => prev + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Weggeklikte herinneringen bewaren over sessies heen.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("tijdregistratie-dismissed");
      if (stored) {
        setDismissedReminders(new Set(JSON.parse(stored) as string[]));
      }
    } catch {
      // Ongeldige opslag negeren.
    }
  }, []);

  useEffect(() => {
    if (!inlineFeedback || inlineFeedback.status === "saving") {
      return;
    }

    const timeout = window.setTimeout(
      () => setInlineFeedback(null),
      inlineFeedback.status === "error" ? 3500 : 1400,
    );
    return () => window.clearTimeout(timeout);
  }, [inlineFeedback]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const savedLanguage = window.localStorage.getItem("weekplanner.language");
      if (savedLanguage === "nl" || savedLanguage === "en") {
        setLanguage(savedLanguage);
      }
      const savedTimezone = window.localStorage.getItem("weekplanner.timezone");
      if (savedTimezone) {
        setTimezone(savedTimezone);
      }
    } catch {
      // Ignore unavailable local storage.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("weekplanner.language", language);
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("weekplanner.timezone", timezone);
  }, [timezone]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem("weekplanner.hiddenLogTaskIds");
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }

      const ids = parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
      setHiddenLogTaskIds(ids);
    } catch {
      // Ignore broken local storage payload.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("weekplanner.hiddenLogTaskIds", JSON.stringify(hiddenLogTaskIds));
  }, [hiddenLogTaskIds]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const driveState = params.get("drive");
    if (!driveState) {
      return;
    }

    if (driveState === "connected") {
      setNotice(t("Google Drive is gekoppeld."));
    } else if (driveState.startsWith("error_google_")) {
      const reason = driveState.replace("error_google_", "");
      setError(
        language === "en"
          ? `Drive connection failed (${reason}). Check the redirect URI in Google Cloud Console.`
          : `Drive koppeling mislukt (${reason}). Controleer redirect URI in Google Cloud Console.`,
      );
    } else {
      setError(t("Drive koppeling mislukt. Controleer OAuth redirect URI en folder-id."));
    }

    params.delete("drive");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, [language, t]);

  const groupedTasks = useMemo(() => {
    if (!payload) {
      return {} as Record<Weekday, DayTask[]>;
    }

    const group = {
      maandag: [] as DayTask[],
      dinsdag: [] as DayTask[],
      woensdag: [] as DayTask[],
      donderdag: [] as DayTask[],
      vrijdag: [] as DayTask[],
      zaterdag: [] as DayTask[],
      zondag: [] as DayTask[],
    };

    for (const task of payload.tasks) {
      group[task.weekday].push(task);
    }

    for (const day of WEEKDAYS) {
      group[day] = dedupeTasksForDisplay(group[day]);
    }

    return group;
  }, [payload]);

  const weekdayIsoMap = useMemo(() => {
    if (!payload?.week) {
      return {
        maandag: "",
        dinsdag: "",
        woensdag: "",
        donderdag: "",
        vrijdag: "",
        zaterdag: "",
        zondag: "",
      } satisfies Record<Weekday, string>;
    }

    return weekdayDatesForWeek(payload.week, payload.hourBlocks ?? []);
  }, [payload?.hourBlocks, payload?.week]);

  const weekdayDateMap = useMemo(
    () =>
      ({
        maandag: weekdayIsoMap.maandag ? formatDayDateLabelForLanguage(weekdayIsoMap.maandag) : "",
        dinsdag: weekdayIsoMap.dinsdag ? formatDayDateLabelForLanguage(weekdayIsoMap.dinsdag) : "",
        woensdag: weekdayIsoMap.woensdag ? formatDayDateLabelForLanguage(weekdayIsoMap.woensdag) : "",
        donderdag: weekdayIsoMap.donderdag ? formatDayDateLabelForLanguage(weekdayIsoMap.donderdag) : "",
        vrijdag: weekdayIsoMap.vrijdag ? formatDayDateLabelForLanguage(weekdayIsoMap.vrijdag) : "",
        zaterdag: weekdayIsoMap.zaterdag ? formatDayDateLabelForLanguage(weekdayIsoMap.zaterdag) : "",
        zondag: weekdayIsoMap.zondag ? formatDayDateLabelForLanguage(weekdayIsoMap.zondag) : "",
      }) satisfies Record<Weekday, string>,
    [formatDayDateLabelForLanguage, weekdayIsoMap],
  );

  const orderedWeekdays = useMemo(() => {
    const dated = WEEKDAYS.filter((day) => Boolean(weekdayIsoMap[day])).sort((a, b) =>
      weekdayIsoMap[a].localeCompare(weekdayIsoMap[b]),
    );

    if (dated.length === 0) {
      return WEEKDAYS;
    }

    const undated = WEEKDAYS.filter((day) => !dated.includes(day));
    return [...dated, ...undated];
  }, [weekdayIsoMap]);

  const todayWeekdayInWeek = useMemo(() => {
    if (!todayIsoAmsterdam) {
      return null;
    }

    return orderedWeekdays.find((day) => weekdayIsoMap[day] === todayIsoAmsterdam) ?? null;
  }, [orderedWeekdays, todayIsoAmsterdam, weekdayIsoMap]);
  const visiblePlannerDays = useMemo(() => {
    if (!orderedWeekdays.length) {
      return [] as Weekday[];
    }

    const datedDays = orderedWeekdays.filter((day) => Boolean(weekdayIsoMap[day]));
    if (datedDays.length > 0) {
      return datedDays;
    }

    return orderedWeekdays;
  }, [orderedWeekdays, weekdayIsoMap]);
  const plannerDayOptions = useMemo(() => visiblePlannerDays, [visiblePlannerDays]);

  const orderedHourBlocks = useMemo(() => {
    const blocks = payload?.hourBlocks ?? [];
    if (blocks.length === 0) {
      return [] as HourBlock[];
    }

    const baseOrder = [...orderedWeekdays];
    const rotatedOrder =
      todayWeekdayInWeek && baseOrder.includes(todayWeekdayInWeek)
        ? [...baseOrder.slice(baseOrder.indexOf(todayWeekdayInWeek)), ...baseOrder.slice(0, baseOrder.indexOf(todayWeekdayInWeek))]
        : baseOrder;
    const dayRank = new Map(rotatedOrder.map((day, index) => [day, index]));

    return blocks.slice().sort((a, b) => {
      const dayDiff = (dayRank.get(a.weekday) ?? 999) - (dayRank.get(b.weekday) ?? 999);
      if (dayDiff !== 0) {
        return dayDiff;
      }

      const dateDiff = (a.dayDate ?? "").localeCompare(b.dayDate ?? "");
      if (dateDiff !== 0) {
        return dateDiff;
      }

      const startDiff = a.timeStart.localeCompare(b.timeStart);
      if (startDiff !== 0) {
        return startDiff;
      }

      const endDiff = a.timeEnd.localeCompare(b.timeEnd);
      if (endDiff !== 0) {
        return endDiff;
      }

      return a.position - b.position;
    });
  }, [orderedWeekdays, payload?.hourBlocks, todayWeekdayInWeek]);

  const activeRange = useMemo(() => {
    if (!payload?.week) {
      return null;
    }

    const dates = Object.values(weekdayIsoMap).filter(Boolean).sort();
    if (dates.length > 0) {
      return {
        startDate: dates[0],
        endDate: dates[dates.length - 1],
      };
    }

    return normalizedWeekRange(payload.week);
  }, [payload?.week, weekdayIsoMap]);
  const orderedWeeksByDate = useMemo(() => {
    const weeks = payload?.weeks ?? [];
    return weeks.slice().sort((a, b) => {
      const aRange = normalizedWeekRange(a);
      const bRange = normalizedWeekRange(b);
      return aRange.startDate.localeCompare(bRange.startDate);
    });
  }, [payload?.weeks]);
  const allWeekDetails = useMemo(() => {
    const byId = new Map<string, WeekDetailPayload>();

    for (const detail of Object.values(weekSnapshots)) {
      byId.set(detail.week.id, detail);
    }

    if (payload) {
      byId.set(payload.week.id, {
        week: payload.week,
        tasks: payload.tasks,
        hourBlocks: payload.hourBlocks,
        hourEntries: payload.hourEntries,
        history: payload.history,
        hourSummary: payload.hourSummary,
      });
    }

    const ordered: WeekDetailPayload[] = [];
    for (const week of orderedWeeksByDate) {
      const detail = byId.get(week.id);
      if (detail) {
        ordered.push(detail);
      }
    }

    for (const detail of byId.values()) {
      if (ordered.some((item) => item.week.id === detail.week.id)) {
        continue;
      }
      ordered.push(detail);
    }

    return ordered;
  }, [orderedWeeksByDate, payload, weekSnapshots]);
  const allTasks = useMemo(() => allWeekDetails.flatMap((detail) => detail.tasks), [allWeekDetails]);
  const allHourBlocks = useMemo(() => allWeekDetails.flatMap((detail) => detail.hourBlocks), [allWeekDetails]);
  const allHourEntries = useMemo(() => allWeekDetails.flatMap((detail) => detail.hourEntries), [allWeekDetails]);
  const allHistory = useMemo(() => allWeekDetails.flatMap((detail) => detail.history), [allWeekDetails]);

  const filteredHourEntries = useMemo(() => {
    if (hoursPeriodFilter === "week" && payload?.week) {
      const { id: weekId } = payload.week;
      return allHourEntries.filter((e) => e.weekId === weekId);
    }
    if (hoursPeriodFilter === "day" && hoursDayFilter) {
      return allHourEntries.filter((e) => e.dayDate === hoursDayFilter);
    }
    return allHourEntries;
  }, [allHourEntries, hoursPeriodFilter, hoursDayFilter, payload?.week]);

  const allProjectNames = useMemo(
    () => Array.from(new Set(allHourEntries.map((e) => e.projectName.trim()).filter(Boolean))).sort(),
    [allHourEntries],
  );

  const allBlockProjectNames = useMemo(
    () => Array.from(new Set(allHourBlocks.map((b) => b.projectText.trim()).filter(Boolean))).sort(),
    [allHourBlocks],
  );
  const weekMetaById = useMemo(() => {
    const weekMap = new Map<string, { weekLabel: string; startDate: string; endDate: string }>();

    for (const detail of allWeekDetails) {
      const range = normalizedWeekRange(detail.week);
      weekMap.set(detail.week.id, {
        weekLabel: detail.week.weekLabel,
        startDate: range.startDate,
        endDate: range.endDate,
      });
    }

    return weekMap;
  }, [allWeekDetails]);
  const dayDateByWeekAndWeekday = useMemo(() => {
    const dateMap = new Map<string, string>();

    for (const detail of allWeekDetails) {
      const weekdayMap = weekdayDatesForWeek(detail.week, detail.hourBlocks);
      for (const weekday of WEEKDAYS) {
        const dayDate = weekdayMap[weekday];
        if (dayDate) {
          dateMap.set(`${detail.week.id}:${weekday}`, dayDate);
        }
      }
    }

    return dateMap;
  }, [allWeekDetails]);
  const plannerDaySummaries = useMemo(() => {
    const rows: PlannerDaySummary[] = [];

    for (const detail of allWeekDetails) {
      const range = normalizedWeekRange(detail.week);
      const weekdayMap = weekdayDatesForWeek(detail.week, detail.hourBlocks);

      for (const weekday of WEEKDAYS) {
        const dayDate = weekdayMap[weekday];
        if (!dayDate) {
          continue;
        }

        const tasks = dedupeTasksForDisplay(detail.tasks.filter((task) => task.weekday === weekday));
        const hourBlocks = detail.hourBlocks.filter((block) =>
          shouldDisplayBlockForDay(block, weekday, dayDate, range),
        );
        const hourEntries = detail.hourEntries.filter((entry) => entry.dayDate === dayDate);
        if (tasks.length === 0 && hourBlocks.length === 0 && hourEntries.length === 0) {
          continue;
        }

        rows.push({
          key: `${detail.week.id}:${dayDate}:${weekday}`,
          weekId: detail.week.id,
          weekLabel: detail.week.weekLabel,
          weekday,
          dayDate,
          tasks,
          hourBlocks,
          hourEntries,
          taskDone: tasks.filter((task) => task.status === "klaar").length,
          blockDone: hourBlocks.filter((block) => block.status === "klaar").length,
          hoursTotal: Number(hourEntries.reduce((sum, entry) => sum + entry.hoursDecimal, 0).toFixed(2)),
          isToday: todayIsoAmsterdam === dayDate,
          isPast: Boolean(todayIsoAmsterdam && dayDate < todayIsoAmsterdam),
        });
      }
    }

    return rows.sort(
      (a, b) =>
        a.dayDate.localeCompare(b.dayDate) ||
        WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday) ||
        a.weekLabel.localeCompare(b.weekLabel, "nl"),
    );
  }, [allWeekDetails, todayIsoAmsterdam]);
  const plannerUpcomingDays = useMemo(() => {
    const upcoming = plannerDaySummaries.filter((day) => !day.isPast);
    const todayDays = upcoming.filter((day) => day.isToday);
    const otherDays = upcoming.filter((day) => !day.isToday);
    return [...todayDays, ...otherDays];
  }, [plannerDaySummaries]);
  const plannerPastDays = useMemo(
    () => plannerDaySummaries.filter((day) => day.isPast).sort((a, b) => b.dayDate.localeCompare(a.dayDate)),
    [plannerDaySummaries],
  );
  const plannerDayByRef = useMemo(() => {
    const byRef = new Map<string, PlannerDaySummary>();
    for (const day of plannerDaySummaries) {
      byRef.set(`${day.weekId}:${day.dayDate}`, day);
    }
    return byRef;
  }, [plannerDaySummaries]);
  const selectedPlannerDayDetail = useMemo(() => {
    if (!plannerDayDetailRef) {
      return null;
    }
    return plannerDayByRef.get(`${plannerDayDetailRef.weekId}:${plannerDayDetailRef.dayDate}`) ?? null;
  }, [plannerDayByRef, plannerDayDetailRef]);
  const plannerSearchResults = useMemo(() => {
    const query = normalizeTaskKey(plannerSearchQuery);
    if (!query || query.length < 2) {
      return [] as PlannerSearchResult[];
    }

    return plannerDaySummaries
      .map((day) => {
        const previews = new Set<string>();

        for (const task of day.tasks) {
          const fields = [task.title, task.info];
          if (fields.some((value) => normalizeTaskKey(value).includes(query))) {
            previews.add(`Taak: ${task.title}`);
          }
        }

        for (const block of day.hourBlocks) {
          const fields = [block.taskText, block.projectText];
          if (fields.some((value) => normalizeTaskKey(value).includes(query))) {
            previews.add(`Uurblok: ${block.taskText || block.projectText || `${block.timeStart}-${block.timeEnd}`}`);
          }
        }

        for (const entry of day.hourEntries) {
          const fields = [entry.projectName, entry.noteText];
          if (fields.some((value) => normalizeTaskKey(value).includes(query))) {
            previews.add(`Uren: ${entry.projectName || entry.noteText || `${entry.hoursDecimal}u`}`);
          }
        }

        const previewList = Array.from(previews).slice(0, 4);
        if (!previewList.length) {
          return null;
        }

        return {
          key: `${day.key}:search`,
          weekId: day.weekId,
          weekLabel: day.weekLabel,
          weekday: day.weekday,
          dayDate: day.dayDate,
          matchCount: previews.size,
          previews: previewList,
        } satisfies PlannerSearchResult;
      })
      .filter((item): item is PlannerSearchResult => Boolean(item))
      .sort((a, b) => b.dayDate.localeCompare(a.dayDate) || a.weekLabel.localeCompare(b.weekLabel, "nl"))
      .slice(0, 12);
  }, [plannerDaySummaries, plannerSearchQuery]);
  const upcomingBlockGroups = useMemo(
    () =>
      plannerUpcomingDays
        .map((day) => {
          const blocks = day.hourBlocks
            .slice()
            .sort(
              (a, b) =>
                a.timeStart.localeCompare(b.timeStart) ||
                a.timeEnd.localeCompare(b.timeEnd) ||
                a.position - b.position,
            );
          const mergedTasks = mergeDayTasksWithHourBlocks(
            day.tasks,
            blocks,
            day.weekId,
            day.weekday,
            day.dayDate,
          );

          return {
            ...day,
            blocks,
            blockGroups: groupHourBlocksForDisplay(blocks),
            tasks: mergedTasks,
            taskDone: mergedTasks.filter((task) => task.status === "klaar").length,
          };
        })
        .filter((day) => day.blocks.length > 0 || day.tasks.length > 0),
    [plannerUpcomingDays],
  );
  const upcomingBlocksTotal = useMemo(
    () => upcomingBlockGroups.reduce((sum, day) => sum + day.blocks.length, 0),
    [upcomingBlockGroups],
  );
  const upcomingBlocksDoneTotal = useMemo(
    () =>
      upcomingBlockGroups.reduce(
        (sum, day) => sum + day.blocks.filter((block) => block.status === "klaar").length,
        0,
      ),
    [upcomingBlockGroups],
  );
  const activeWeekIndex = useMemo(
    () => orderedWeeksByDate.findIndex((week) => week.id === payload?.week.id),
    [orderedWeeksByDate, payload?.week.id],
  );
  const previousWeek = activeWeekIndex > 0 ? orderedWeeksByDate[activeWeekIndex - 1] : null;
  const nextWeek =
    activeWeekIndex >= 0 && activeWeekIndex < orderedWeeksByDate.length - 1
      ? orderedWeeksByDate[activeWeekIndex + 1]
      : null;
  const headerWeekOptions = useMemo(
    () =>
      orderedWeeksByDate.map((week) => {
        const weekRange = normalizedWeekRange(week);
        return {
          id: week.id,
          label: week.weekLabel,
          rangeText: `${weekRange.startDate} t/m ${weekRange.endDate}`,
        };
      }),
    [orderedWeeksByDate],
  );
  const currentRangeText = payload?.week
    ? `${activeRange?.startDate ?? payload.week.startDate} t/m ${activeRange?.endDate ?? payload.week.endDate}`
    : "Weekgegevens laden...";

  useEffect(() => {
    if (!orderedWeekdays.length) {
      return;
    }

    setTodoDay(todayWeekdayInWeek ?? orderedWeekdays[0]);
  }, [payload?.week?.id, orderedWeekdays, todayWeekdayInWeek]);

  useEffect(() => {
    if (!payload?.week?.id || !orderedWeekdays.length) {
      return;
    }

    const preferredWeekday = todayWeekdayInWeek ?? orderedWeekdays[0];
    if (!preferredWeekday) {
      return;
    }

    const preferredDayIso = weekdayIsoMap[preferredWeekday];
    if (!preferredDayIso) {
      return;
    }

    setTaskForm((prev) => ({ ...prev, weekday: preferredWeekday }));
    setHourForm((prev) => ({ ...prev, weekday: preferredWeekday, dayDate: preferredDayIso }));
    setBlockForm((prev) => ({ ...prev, weekday: preferredWeekday, dayDate: preferredDayIso }));
  }, [payload?.week?.id, orderedWeekdays, todayWeekdayInWeek, weekdayIsoMap]);
  useEffect(() => {
    if (!plannerDayOptions.length) {
      return;
    }

    setTaskForm((prev) => {
      if (plannerDayOptions.includes(prev.weekday)) {
        return prev;
      }
      return {
        ...prev,
        weekday: plannerDayOptions[0],
      };
    });
  }, [plannerDayOptions]);

  const todayTasks = useMemo(() => groupedTasks[todoDay] ?? [], [groupedTasks, todoDay]);
  const todayDoneCount = useMemo(
    () => todayTasks.filter((task) => task.status === "klaar").length,
    [todayTasks],
  );
  const selectedDayIso = useMemo(() => weekdayIsoMap[todoDay] || null, [todoDay, weekdayIsoMap]);
  const nowMinutesAmsterdam = minutesNowForTimezone("Europe/Amsterdam");
  const selectedDayIsToday = useMemo(() => {
    if (!todayIsoAmsterdam) {
      return false;
    }
    if (selectedDayIso) {
      return selectedDayIso === todayIsoAmsterdam;
    }
    return todayWeekdayInWeek === todoDay;
  }, [selectedDayIso, todayIsoAmsterdam, todayWeekdayInWeek, todoDay]);
  const dayHourBlocks = useMemo(
    () =>
      orderedHourBlocks.filter(
        (block) =>
          shouldDisplayBlockForDay(block, todoDay, selectedDayIso, activeRange),
      ),
    [activeRange, orderedHourBlocks, selectedDayIso, todoDay],
  );
  const dayHourEntries = useMemo(
    () =>
      (payload?.hourEntries ?? []).filter((entry) =>
        selectedDayIso ? entry.dayDate === selectedDayIso : entry.weekday === todoDay,
      ),
    [payload?.hourEntries, selectedDayIso, todoDay],
  );
  const dayHoursTotal = useMemo(
    () => Number(dayHourEntries.reduce((sum, entry) => sum + entry.hoursDecimal, 0).toFixed(2)),
    [dayHourEntries],
  );
  const groupedHourEntriesByDay = useMemo(() => {
    const dayMap = new Map<string, HourEntryDayGroup>();

    for (const entry of filteredHourEntries) {
      const weekMeta = weekMetaById.get(entry.weekId);
      const key = `${entry.weekId}:${entry.dayDate}:${entry.weekday}`;
      const existing = dayMap.get(key);
      if (!existing) {
        dayMap.set(key, {
          key,
          weekId: entry.weekId,
          weekLabel: weekMeta?.weekLabel ?? "Week",
          dayDate: entry.dayDate,
          weekday: entry.weekday,
          totalHours: Number(entry.hoursDecimal.toFixed(2)),
          entries: [entry],
        });
        continue;
      }

      existing.totalHours = Number((existing.totalHours + entry.hoursDecimal).toFixed(2));
      existing.entries.push(entry);
    }

    return Array.from(dayMap.values())
      .map((group) => ({
        ...group,
        entries: group.entries
          .slice()
          .sort(
            (a, b) =>
              a.projectName.localeCompare(b.projectName, "nl") ||
              a.noteText.localeCompare(b.noteText, "nl") ||
              a.updatedAt.localeCompare(b.updatedAt),
          ),
      }))
      .sort((a, b) => {
        const aStart = weekMetaById.get(a.weekId)?.startDate ?? a.dayDate;
        const bStart = weekMetaById.get(b.weekId)?.startDate ?? b.dayDate;
        return bStart.localeCompare(aStart) || b.dayDate.localeCompare(a.dayDate);
      });
  }, [filteredHourEntries, weekMetaById]);
  const visibleHoursSummary = useMemo(() => {
    const projectTotals = new Map<string, number>();
    const weekTotals = new Map<string, { weekId: string; weekLabel: string; totalHours: number; startDate: string }>();
    let totalHours = 0;

    for (const entry of filteredHourEntries) {
      totalHours += entry.hoursDecimal;

      const projectName = entry.projectName.trim() || "Zonder project";
      projectTotals.set(projectName, Number(((projectTotals.get(projectName) ?? 0) + entry.hoursDecimal).toFixed(2)));

      const weekMeta = weekMetaById.get(entry.weekId);
      const currentWeek = weekTotals.get(entry.weekId) ?? {
        weekId: entry.weekId,
        weekLabel: weekMeta?.weekLabel ?? "Week",
        totalHours: 0,
        startDate: weekMeta?.startDate ?? entry.dayDate,
      };
      currentWeek.totalHours = Number((currentWeek.totalHours + entry.hoursDecimal).toFixed(2));
      weekTotals.set(entry.weekId, currentWeek);
    }

    return {
      totalHours: Number(totalHours.toFixed(2)),
      perProjectTotals: Array.from(projectTotals.entries())
        .map(([projectName, total]) => ({ projectName, totalHours: Number(total.toFixed(2)) }))
        .sort((a, b) => b.totalHours - a.totalHours || a.projectName.localeCompare(b.projectName, "nl")),
      perWeekTotals: Array.from(weekTotals.values()).sort(
        (a, b) => a.startDate.localeCompare(b.startDate) || a.weekLabel.localeCompare(b.weekLabel, "nl"),
      ),
    };
  }, [filteredHourEntries, weekMetaById]);
  useEffect(() => {
    const validIds = new Set(allHourEntries.map((entry) => entry.id));

    setHourEntryHoursEditing((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [entryId, isEditing] of Object.entries(prev)) {
        if (!validIds.has(entryId)) {
          changed = true;
          continue;
        }
        next[entryId] = isEditing;
      }
      return changed ? next : prev;
    });

    setHourEntryHoursDrafts((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [entryId, draftValue] of Object.entries(prev)) {
        if (!validIds.has(entryId)) {
          changed = true;
          continue;
        }
        next[entryId] = draftValue;
      }
      return changed ? next : prev;
    });
  }, [allHourEntries]);
  const dayOverviewCardClass = "p-3.5 sm:p-5";
  const dayOverviewBodyClass = "mt-3 space-y-3";
  const hourSelectOptions = useMemo(
    () => hourOptionsWithValue(hourForm.hoursDecimal),
    [hourForm.hoursDecimal],
  );
  const hourFormDerivedWeekday = useMemo(
    () => weekdayFromIsoDate(hourForm.dayDate),
    [hourForm.dayDate],
  );
  useEffect(() => {
    if (!hourFormDerivedWeekday || hourForm.weekday === hourFormDerivedWeekday) {
      return;
    }

    setHourForm((prev) => ({
      ...prev,
      weekday: hourFormDerivedWeekday,
    }));
  }, [hourForm.weekday, hourFormDerivedWeekday]);
  useEffect(() => {
    if (!payload?.week?.id) {
      return;
    }

    const suggestedDate = weekdayIsoMap[blockForm.weekday];
    if (!suggestedDate) {
      return;
    }

    setBlockForm((prev) => {
      if (prev.dayDate === suggestedDate) {
        return prev;
      }
      return {
        ...prev,
        dayDate: suggestedDate,
      };
    });
  }, [blockForm.weekday, payload?.week?.id, weekdayIsoMap]);

  const hoursCalculated = useMemo(() => {
    const startMinutes = parseTimeToMinutes(hoursCalcForm.startAt);
    const endMinutes = parseTimeToMinutes(hoursCalcForm.endAt);
    const breakMinutes = Number(hoursCalcForm.breakMinutes || "0");

    if (startMinutes == null || endMinutes == null || Number.isNaN(breakMinutes) || breakMinutes < 0) {
      return null;
    }

    const endWithMidnightWrap = endMinutes >= startMinutes ? endMinutes : endMinutes + 24 * 60;
    const totalMinutes = Math.max(0, endWithMidnightWrap - startMinutes - breakMinutes);
    const hours = Number((totalMinutes / 60).toFixed(2));

    if (hours <= 0 || hours > 24) {
      return null;
    }

    return hours;
  }, [hoursCalcForm.breakMinutes, hoursCalcForm.endAt, hoursCalcForm.startAt]);
  const taskDeadlineTimeValue = useMemo(() => timePartFromLocalInput(taskForm.deadlineAt), [taskForm.deadlineAt]);
  const applyTaskDeadlineTime = useCallback(
    (timeValue: string) => {
      if (!timeValue) {
        return;
      }

      setTaskForm((prev) => {
        const fallbackDate = weekdayIsoMap[prev.weekday] || todayIsoAmsterdam;
        return {
          ...prev,
          deadlineAt: applyTimeToLocalInput(prev.deadlineAt, timeValue, fallbackDate),
        };
      });
    },
    [todayIsoAmsterdam, weekdayIsoMap],
  );
  const detailDay = selectedPlannerDayDetail?.weekday ?? todoDay;
  const detailDayIso = selectedPlannerDayDetail?.dayDate ?? selectedDayIso;
  const detailDayIsToday = useMemo(() => {
    if (!todayIsoAmsterdam) {
      return false;
    }
    return Boolean(detailDayIso && detailDayIso === todayIsoAmsterdam);
  }, [detailDayIso, todayIsoAmsterdam]);
  const detailTasks = useMemo(() => {
    if (!selectedPlannerDayDetail) {
      return groupedTasks[detailDay] ?? [];
    }

    const blocks = selectedPlannerDayDetail.hourBlocks
      .slice()
      .sort(
        (a, b) =>
          a.timeStart.localeCompare(b.timeStart) ||
          a.timeEnd.localeCompare(b.timeEnd) ||
          a.position - b.position,
      );

    return mergeDayTasksWithHourBlocks(
      selectedPlannerDayDetail.tasks,
      blocks,
      selectedPlannerDayDetail.weekId,
      selectedPlannerDayDetail.weekday,
      selectedPlannerDayDetail.dayDate,
    );
  }, [detailDay, groupedTasks, selectedPlannerDayDetail]);
  const detailDoneCount = useMemo(
    () => detailTasks.filter((task) => task.status === "klaar").length,
    [detailTasks],
  );
  const detailHourBlocks = useMemo(
    () => {
      if (selectedPlannerDayDetail) {
        return selectedPlannerDayDetail.hourBlocks
          .slice()
          .sort(
            (a, b) =>
              a.timeStart.localeCompare(b.timeStart) ||
              a.timeEnd.localeCompare(b.timeEnd) ||
              a.position - b.position,
          );
      }

      return orderedHourBlocks.filter(
        (block) => shouldDisplayBlockForDay(block, detailDay, detailDayIso, activeRange),
      );
    },
    [activeRange, detailDay, detailDayIso, orderedHourBlocks, selectedPlannerDayDetail],
  );
  const detailGroupedHourBlocks = useMemo(
    () => groupHourBlocksForDisplay(detailHourBlocks),
    [detailHourBlocks],
  );
  const detailHourEntries = useMemo(
    () => selectedPlannerDayDetail?.hourEntries ?? (payload?.hourEntries ?? []).filter((entry) =>
      detailDayIso ? entry.dayDate === detailDayIso : entry.weekday === detailDay,
    ),
    [detailDay, detailDayIso, payload?.hourEntries, selectedPlannerDayDetail],
  );
  const detailHoursTotal = useMemo(
    () => Number(detailHourEntries.reduce((sum, entry) => sum + entry.hoursDecimal, 0).toFixed(2)),
    [detailHourEntries],
  );
  const detailSuggestedSlots = useMemo(() => {
    const slots = detailHourBlocks
      .filter((block) => !block.taskText.trim() || block.status !== "klaar")
      .map((block) => `${block.timeStart}-${block.timeEnd}`);
    return [...new Set(slots)];
  }, [detailHourBlocks]);
  const detailScheduleOptions = useMemo(() => {
    const options = [...detailSuggestedSlots];
    const customValue = detailTaskForm.scheduleHint.trim();
    if (customValue && !options.includes(customValue)) {
      options.unshift(customValue);
    }
    return options;
  }, [detailSuggestedSlots, detailTaskForm.scheduleHint]);
  const detailTaskDeadlineTimeValue = useMemo(
    () => timePartFromLocalInput(detailTaskForm.deadlineAt),
    [detailTaskForm.deadlineAt],
  );
  const applyDetailTaskDeadlineTime = useCallback(
    (timeValue: string) => {
      if (!timeValue) {
        return;
      }

      setDetailTaskForm((prev) => ({
        ...prev,
        deadlineAt: applyTimeToLocalInput(prev.deadlineAt, timeValue, detailDayIso || todayIsoAmsterdam),
      }));
    },
    [detailDayIso, todayIsoAmsterdam],
  );
  const blockFormRangeValid = useMemo(() => {
    const start = parseTimeToMinutes(blockForm.timeStart);
    const end = parseTimeToMinutes(blockForm.timeEnd);
    if (start == null || end == null) {
      return false;
    }
    return end > start;
  }, [blockForm.timeEnd, blockForm.timeStart]);
  const pastDaysSummary = useMemo(
    () =>
      plannerPastDays.map((day) => ({
        weekId: day.weekId,
        weekLabel: day.weekLabel,
        weekday: day.weekday,
        dayDate: day.dayDate,
        taskTotal: day.tasks.length,
        taskDone: day.taskDone,
        blockTotal: day.hourBlocks.length,
        blockDone: day.blockDone,
        hoursTotal: day.hoursTotal,
      })),
    [plannerPastDays],
  );
  const completedTaskLog = useMemo(() => {
    if (!allTasks.length) {
      return [] as CompletedTaskLogItem[];
    }

    const doneAtByTaskId = new Map<string, string>();
    for (const item of allHistory) {
      if (item.entityType !== "task") {
        continue;
      }

      const statusAfter = item.changedFields.status?.after;
      if (statusAfter !== "klaar") {
        continue;
      }

      const existing = doneAtByTaskId.get(item.entityId);
      if (!existing || item.createdAt > existing) {
        doneAtByTaskId.set(item.entityId, item.createdAt);
      }
    }

    const projectSetByTaskKey = new Map<string, Set<string>>();
    for (const block of allHourBlocks) {
      const taskKey = normalizeTaskKey(block.taskText);
      if (!taskKey) {
        continue;
      }

      const project = block.projectText.trim();
      if (!project) {
        continue;
      }

      const scopedTaskKey = `${block.weekId}:${block.weekday}:${taskKey}`;
      const currentSet = projectSetByTaskKey.get(scopedTaskKey) ?? new Set<string>();
      currentSet.add(project);
      projectSetByTaskKey.set(scopedTaskKey, currentSet);
    }

    return allTasks
      .filter((task) => task.status === "klaar")
      .map((task) => {
        const taskKey = normalizeTaskKey(task.title);
        const scopedTaskKey = `${task.weekId}:${task.weekday}:${taskKey}`;
        const projects = taskKey ? Array.from(projectSetByTaskKey.get(scopedTaskKey) ?? []) : [];
        return {
          taskId: task.id,
          weekId: task.weekId,
          title: task.title,
          info: task.info,
          weekday: task.weekday,
          dayDate: dayDateByWeekAndWeekday.get(`${task.weekId}:${task.weekday}`) ?? null,
          projectText: projects.join(", "),
          deadlineAt: task.deadlineAt,
          checkedAt: doneAtByTaskId.get(task.id) ?? task.updatedAt,
        } satisfies CompletedTaskLogItem;
      })
      .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
  }, [allHistory, allHourBlocks, allTasks, dayDateByWeekAndWeekday]);
  const completedTaskLogProjects = useMemo(() => {
    const projects = new Set<string>();
    for (const item of completedTaskLog) {
      const chunks = item.projectText
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      for (const project of chunks) {
        projects.add(project);
      }
    }
    return Array.from(projects).sort((a, b) => a.localeCompare(b, "nl"));
  }, [completedTaskLog]);
  useEffect(() => {
    if (!hiddenLogTaskIds.length) {
      return;
    }

    const validTaskIds = new Set(completedTaskLog.map((item) => item.taskId));
    setHiddenLogTaskIds((prev) => {
      const next = prev.filter((taskId) => validTaskIds.has(taskId));
      return next.length === prev.length ? prev : next;
    });
  }, [completedTaskLog, hiddenLogTaskIds.length]);
  const filteredCompletedTaskLog = useMemo(() => {
    const hiddenSet = new Set(hiddenLogTaskIds);
    return completedTaskLog.filter((item) => {
      if (hiddenSet.has(item.taskId)) {
        return false;
      }

      if (logDateFilter === "today") {
        const checkedDate = isoDateFromDateTimeAmsterdam(item.checkedAt);
        if (!checkedDate || !todayIsoAmsterdam || checkedDate !== todayIsoAmsterdam) {
          return false;
        }
      }

      if (logDateFilter === "week" && activeRange) {
        const checkedDate = isoDateFromDateTimeAmsterdam(item.checkedAt);
        if (!checkedDate || checkedDate < activeRange.startDate || checkedDate > activeRange.endDate) {
          return false;
        }
      }

      if (logProjectFilter !== "all") {
        const projectChunks = item.projectText
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
        if (!projectChunks.includes(logProjectFilter)) {
          return false;
        }
      }

      return true;
    });
  }, [activeRange, completedTaskLog, hiddenLogTaskIds, logDateFilter, logProjectFilter, todayIsoAmsterdam]);
  const hiddenCompletedLogCount = useMemo(() => {
    if (!hiddenLogTaskIds.length) {
      return 0;
    }

    const taskIds = new Set(completedTaskLog.map((item) => item.taskId));
    return hiddenLogTaskIds.filter((taskId) => taskIds.has(taskId)).length;
  }, [completedTaskLog, hiddenLogTaskIds]);
  const hideCompletedLogItem = useCallback((taskId: string) => {
    setHiddenLogTaskIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]));
  }, []);
  const restoreHiddenLogItems = useCallback(() => {
    setHiddenLogTaskIds([]);
  }, []);
  useEffect(() => {
    if (logProjectFilter === "all") {
      return;
    }
    if (completedTaskLogProjects.includes(logProjectFilter)) {
      return;
    }
    setLogProjectFilter("all");
  }, [completedTaskLogProjects, logProjectFilter]);

  const openPlannerDayDetail = useCallback(
    (day: Weekday, dayDate?: string | null, weekId?: string | null) => {
      const dayIso = dayDate || weekdayIsoMap[day] || "";
      const targetWeekId = weekId || payload?.week.id || "";
      setTodoDay(day);
      if (targetWeekId && dayIso) {
        setPlannerDayDetailRef({ weekId: targetWeekId, dayDate: dayIso });
      }
      setTaskForm((prev) => ({ ...prev, weekday: day }));
      setHourForm((prev) => ({ ...prev, weekday: day, dayDate: dayIso || prev.dayDate }));
      setBlockForm((prev) => ({ ...prev, weekday: day, dayDate: dayIso || prev.dayDate }));
    },
    [payload?.week.id, weekdayIsoMap],
  );

  const openPlannerDayDetailForWeek = useCallback(
    async (weekId: string, day: Weekday, dayDate?: string | null) => {
      if (!weekId) {
        return;
      }

      if (payload?.week.id !== weekId) {
        const loaded = await loadData(weekId);
        if (!loaded) {
          return;
        }
      }

      openPlannerDayDetail(day, dayDate, weekId);
    },
    [loadData, openPlannerDayDetail, payload?.week.id],
  );
  const goToPlannerDate = useCallback(
    async (dateIso: string) => {
      if (!dateIso) {
        setError(language === "en" ? "Choose a date first." : "Kies eerst een datum om naartoe te gaan.");
        return;
      }

      const weekday = weekdayFromIsoDate(dateIso);
      if (!weekday) {
        setError(language === "en" ? "Choose a valid day for this action." : "Kies een geldige dag voor deze actie.");
        return;
      }

      const targetWeek = orderedWeeksByDate.find((week) => {
        const range = normalizedWeekRange(week);
        return dateIso >= range.startDate && dateIso <= range.endDate;
      });

      if (!targetWeek) {
        setError(language === "en" ? "No week or planning is available for this date yet." : "Voor deze datum is nog geen week of planning beschikbaar.");
        return;
      }

      setTab("planner");
      if (payload?.week.id !== targetWeek.id) {
        const loaded = await loadData(targetWeek.id);
        if (!loaded) {
          return;
        }
      }

      openPlannerDayDetail(weekday, dateIso, targetWeek.id);
      setNotice(`${language === "en" ? "Opened day" : "Dag geopend"}: ${formatIsoDateForLanguage(dateIso)}.`);
    },
    [formatIsoDateForLanguage, language, loadData, openPlannerDayDetail, orderedWeeksByDate, payload?.week.id],
  );

  const closePlannerDayDetail = useCallback(() => {
    setPlannerDayDetailRef(null);
  }, []);

  useEffect(() => {
    if (!plannerDayDetailRef) {
      return;
    }

    if (selectedPlannerDayDetail) {
      return;
    }

    setPlannerDayDetailRef(null);
  }, [plannerDayDetailRef, selectedPlannerDayDetail]);

  useEffect(() => {
    if (!plannerDayDetailRef) {
      return;
    }

    setDetailTaskComposerExpanded(false);
    setDetailTaskForm({
      title: "",
      info: "",
      scheduleHint: "",
      deadlineAt: "",
      priority: "middel",
    });
  }, [plannerDayDetailRef]);

  useEffect(() => {
    if (!plannerDayDetailRef) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlannerDayDetailRef(null);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [plannerDayDetailRef]);

  const handlePinSubmit = async () => {
    setError(null);
    setNotice(null);

    if (!pinStatus) {
      return;
    }

    const endpoint = pinStatus.configured ? "/api/auth/pin/login" : "/api/auth/pin/setup";

    try {
      setPinSubmitting(true);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? (language === "en" ? "PIN request failed" : "PIN-verzoek mislukt"));
      }

      setPin("");
      const status = await fetchPinStatus();
      setPinStatus(status);
      if (status.authenticated) {
        await loadData(activeWeekId);
      }
      setNotice(language === "en" ? (pinStatus.configured ? "Signed in." : "PIN saved.") : (pinStatus.configured ? "Ingelogd." : "PIN ingesteld."));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : (language === "en" ? "PIN error" : "PIN-fout"));
    } finally {
      setPinSubmitting(false);
    }
  };

  const applyLocalMutation = useCallback(
    (url: string, method: "POST" | "PATCH" | "DELETE", resultData?: MutationResultData): boolean => {
      const targetWeekId = typeof resultData?.weekId === "string" ? resultData.weekId : activeWeekId;
      if (!targetWeekId || targetWeekId !== activeWeekId) {
        return false;
      }

      const taskDeleteMatch = method === "DELETE" ? url.match(/^\/api\/tasks\/([^/]+)$/) : null;
      const blockDeleteMatch = method === "DELETE" ? url.match(/^\/api\/hour-blocks\/([^/]+)$/) : null;
      const hourDeleteMatch = method === "DELETE" ? url.match(/^\/api\/hours\/([^/]+)$/) : null;

      const hasDirectPayloadUpdate =
        Boolean(resultData?.task) ||
        Boolean(resultData?.block) ||
        Boolean(resultData?.entry) ||
        Boolean(resultData?.summary);
      const hasDirectDelete = Boolean(taskDeleteMatch || blockDeleteMatch || hourDeleteMatch);
      if (!hasDirectPayloadUpdate && !hasDirectDelete) {
        return false;
      }

      setPayload((prev) => {
        if (!prev || prev.week.id !== targetWeekId) {
          return prev;
        }

        const next: DashboardPayload = {
          ...prev,
          tasks: prev.tasks.slice(),
          hourBlocks: prev.hourBlocks.slice(),
          hourEntries: prev.hourEntries.slice(),
          hourSummary: prev.hourSummary,
        };

        if (taskDeleteMatch) {
          next.tasks = next.tasks.filter((item) => item.id !== taskDeleteMatch[1]);
        }
        if (blockDeleteMatch) {
          next.hourBlocks = next.hourBlocks.filter((item) => item.id !== blockDeleteMatch[1]);
        }
        if (hourDeleteMatch) {
          next.hourEntries = next.hourEntries.filter((item) => item.id !== hourDeleteMatch[1]);
        }

        if (resultData?.task) {
          const index = next.tasks.findIndex((item) => item.id === resultData.task?.id);
          if (index >= 0) {
            next.tasks[index] = resultData.task;
          } else {
            next.tasks.push(resultData.task);
          }
          next.tasks.sort(
            (a, b) =>
              WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday) ||
              a.position - b.position ||
              a.title.localeCompare(b.title),
          );
        }

        if (resultData?.block) {
          const index = next.hourBlocks.findIndex((item) => item.id === resultData.block?.id);
          if (index >= 0) {
            next.hourBlocks[index] = resultData.block;
          } else {
            next.hourBlocks.push(resultData.block);
          }
          next.hourBlocks.sort(
            (a, b) =>
              WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday) ||
              (a.dayDate ?? "").localeCompare(b.dayDate ?? "") ||
              a.timeStart.localeCompare(b.timeStart) ||
              a.timeEnd.localeCompare(b.timeEnd) ||
              a.position - b.position,
          );
        }

        if (resultData?.entry) {
          const index = next.hourEntries.findIndex((item) => item.id === resultData.entry?.id);
          if (index >= 0) {
            next.hourEntries[index] = resultData.entry;
          } else {
            next.hourEntries.push(resultData.entry);
          }
          next.hourEntries.sort(
            (a, b) =>
              a.dayDate.localeCompare(b.dayDate) ||
              WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday) ||
              a.projectName.localeCompare(b.projectName),
          );
        }

        if (resultData?.summary) {
          next.hourSummary = resultData.summary;
        }

        return next;
      });

      return true;
    },
    [activeWeekId],
  );

  const sendMutation = useCallback(
    async (
      url: string,
      method: "POST" | "PATCH" | "DELETE",
      body: unknown,
      successNotice: string,
      options?: MutationOptions,
    ): Promise<MutationOutcome> => {
      try {
        setError(null);
        if (options?.localUpdate) {
          setInlineFeedback({ status: "saving", message: language === "en" ? "Saving..." : "Opslaan..." });
        }
        const result = await mutationFetch<MutationResultData>(url, { method, body });
        await refreshQueueCount();

        if (result.queued) {
          setNotice(t("Offline: actie in wachtrij gezet."));
          if (options?.localUpdate) {
            setInlineFeedback({ status: "queued", message: t("Offline: in wachtrij gezet.") });
          }
          return { ok: true, queued: true };
        }

        const locallyUpdated = options?.localUpdate ? applyLocalMutation(url, method, result.data) : false;
        if (!options?.silent) {
          setNotice(successNotice);
        }
        if (options?.localUpdate) {
          setInlineFeedback({ status: "saved", message: language === "en" ? "Saved." : "Opgeslagen." });
        }
        const serverWeekId = typeof result.data?.weekId === "string" ? result.data.weekId : null;
        const shouldKeepCurrentWeek = options?.keepCurrentWeek ?? false;
        const targetWeekId = shouldKeepCurrentWeek ? activeWeekId : serverWeekId ?? activeWeekId;
        if (locallyUpdated) {
          await loadData(targetWeekId ?? null);
          return { ok: true, queued: false, data: result.data };
        }

        await loadData(targetWeekId ?? null);
        return { ok: true, queued: false, data: result.data };
      } catch (mutationError) {
        const message = mutationError instanceof Error ? mutationError.message : language === "en" ? "Action failed." : "Actie mislukt.";
        if (options?.localUpdate) {
          setInlineFeedback({
            status: "error",
            message: message.trim() || (language === "en" ? "Save failed." : "Opslaan mislukt."),
          });
        }
        if (message.toLowerCase().includes("conflict")) {
          setError(`${message} ${language === "en" ? "Refresh the page and try again." : "Ververs de pagina en probeer opnieuw."}`);
          return { ok: false, queued: false };
        }
        setError(message);
        return { ok: false, queued: false };
      }
    },
    [activeWeekId, applyLocalMutation, language, loadData, refreshQueueCount, t],
  );

  const refreshRunningTimer = useCallback(async () => {
    try {
      const response = await fetch("/api/hours/timer", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const json = (await response.json()) as { data?: { running: HourEntry | null } };
      setRunningEntry(json.data?.running ?? null);
    } catch {
      // Offline: lopende timer-status blijft zoals hij was.
    }
  }, []);

  const startTimer = useCallback(
    async (input: TimerStartRequest) => {
      const dayDate = todayIsoAmsterdam ?? todayIsoForTimezone("Europe/Amsterdam");
      const outcome = await sendMutation(
        "/api/hours/timer",
        "POST",
        { dayDate, ...input },
        t("Timer gestart."),
        { keepCurrentWeek: true },
      );
      if (outcome.ok && !outcome.queued) {
        await refreshRunningTimer();
      }
    },
    [refreshRunningTimer, sendMutation, t, todayIsoAmsterdam],
  );

  const stopTimer = useCallback(async () => {
    const outcome = await sendMutation("/api/hours/timer/stop", "POST", {}, t("Timer gestopt."), {
      keepCurrentWeek: true,
    });
    if (outcome.ok && !outcome.queued) {
      setRunningEntry(null);
    }
  }, [sendMutation, t]);

  const timeReminders = useMemo<TimeReminder[]>(() => {
    if (!payload || !todayIsoAmsterdam) {
      return [];
    }
    // reminderMinuteTick forceert een herberekening per minuut.
    void reminderMinuteTick;
    const all = deriveTimeReminders({
      tasks: payload.tasks,
      hourBlocks: payload.hourBlocks,
      entries: payload.hourEntries,
      todayIso: todayIsoAmsterdam,
      nowIso: wallClockNowPseudoIso("Europe/Amsterdam"),
    });
    return all.filter((reminder) => !dismissedReminders.has(`${reminder.kind}:${reminder.entityId}`));
  }, [dismissedReminders, payload, reminderMinuteTick, todayIsoAmsterdam]);

  const dismissReminder = useCallback((reminder: TimeReminder) => {
    setDismissedReminders((prev) => {
      const next = new Set(prev);
      next.add(`${reminder.kind}:${reminder.entityId}`);
      try {
        window.localStorage.setItem("tijdregistratie-dismissed", JSON.stringify([...next]));
      } catch {
        // Opslag vol of geblokkeerd: alleen sessie-status.
      }
      return next;
    });
  }, []);

  const registerReminder = useCallback(
    (reminder: TimeReminder) => {
      const dayDate = reminder.dayDate ?? todayIsoAmsterdam ?? todayIsoForTimezone("Europe/Amsterdam");
      setHourForm({
        dayDate,
        weekday: weekdayFromIsoDate(dayDate) ?? "maandag",
        hoursDecimal: reminder.suggestedHours ? String(reminder.suggestedHours) : "1",
        projectName: reminder.projectName,
        noteText: reminder.title,
      });
      setHourFormLink(
        reminder.kind === "blok-zonder-uren"
          ? { hourBlockId: reminder.entityId }
          : { dayTaskId: reminder.entityId },
      );
      setTab("hours");
    },
    [todayIsoAmsterdam],
  );

  const createTaskFromThought = useCallback(
    async (title: string, weekday: Weekday, threadId?: string, scheduleTime?: string): Promise<boolean> => {
      if (!payload?.week.id) {
        setError(language === "en" ? "Week data is not loaded yet." : "Weekgegevens zijn nog niet geladen.");
        return false;
      }

      const taskOutcome = await sendMutation(
        `/api/weeks/${payload.week.id}/tasks`,
        "POST",
        {
          weekday,
          title,
          info: "Aangemaakt vanuit gedachten.",
          priority: "middel",
          status: "open",
          source: "thought",
          ...(threadId ? { threadId } : {}),
        },
        t("Taak toegevoegd."),
        { localUpdate: true, keepCurrentWeek: false },
      );

      const taskOk = taskOutcome.ok && !taskOutcome.queued;

      if (taskOk && scheduleTime) {
        const [h, m] = scheduleTime.split(":").map(Number);
        const timeStart = scheduleTime;
        const endHour = m >= 30 ? h + 1 : h;
        const endMinute = m >= 30 ? m - 30 : m + 30;
        const timeEnd = `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;

        await sendMutation(
          `/api/weeks/${payload.week.id}/hour-blocks`,
          "POST",
          {
            weekday,
            dayDate: null,
            timeStart,
            timeEnd,
            taskText: title,
            projectText: "",
            deadlineAt: null,
            status: "open",
            source: "thought",
          },
          "",
          { localUpdate: true, keepCurrentWeek: false, silent: true },
        );
      }

      return taskOk;
    },
    [language, payload?.week.id, sendMutation, t],
  );

  const navigateToThought = useCallback(
    (threadId: string) => {
      setHighlightThreadId(threadId);
      setTab("thoughts");
    },
    [],
  );

  const updateHourBlockDeadlineWithTaskSync = useCallback(
    async (block: HourBlock, localDeadlineValue: string) => {
      const normalizedTask = block.taskText.trim().toLowerCase();
      const deadlineAt = localDeadlineValue
        ? localInputToTimezoneIso(localDeadlineValue, "Europe/Amsterdam")
        : null;

      if (localDeadlineValue && !deadlineAt) {
        setError(language === "en" ? "Invalid deadline date." : "Ongeldige deadline datum.");
        return;
      }

      const matchingBlocks = normalizedTask
        ? (payload?.hourBlocks ?? []).filter(
            (item) =>
              item.id !== block.id &&
              item.taskText.trim().toLowerCase() === normalizedTask,
          )
        : [];

      try {
        setError(null);
        setInlineFeedback({ status: "saving", message: language === "en" ? "Saving deadline..." : "Deadline opslaan..." });
        const result = await mutationFetch(`/api/hour-blocks/${block.id}`, {
          method: "PATCH",
          body: {
            deadlineAt,
            expectedUpdatedAt: block.updatedAt,
          },
        });

        await refreshQueueCount();
        if (result.queued) {
          setNotice(t("Offline: deadline-updates in wachtrij gezet."));
          setInlineFeedback({ status: "queued", message: t("Offline: deadline in wachtrij.") });
          return;
        }

        setNotice(
          matchingBlocks.length > 0
            ? (language === "en" ? "Deadline updated for all matching time-block tasks." : "Deadline bijgewerkt voor alle gelijke uurbloktaken.")
            : t("Deadline bijgewerkt."),
        );
        setInlineFeedback({ status: "saved", message: language === "en" ? "Deadline saved." : "Deadline opgeslagen." });
        await loadData(activeWeekId);
      } catch (mutationError) {
        const message = mutationError instanceof Error ? mutationError.message : language === "en" ? "Updating deadline failed." : "Deadline bijwerken mislukt.";
        setInlineFeedback({ status: "error", message: language === "en" ? "Saving deadline failed." : "Deadline opslaan mislukt." });
        if (message.toLowerCase().includes("conflict")) {
          setError(`${message} ${language === "en" ? "Refresh the page and try again." : "Ververs de pagina en probeer opnieuw."}`);
          return;
        }
        setError(message);
      }
    },
    [activeWeekId, language, loadData, payload?.hourBlocks, refreshQueueCount, t],
  );

  const addDetailTask = useCallback(async () => {
    if (!payload?.week?.id) {
      return;
    }

    const title = detailTaskForm.title.trim();
    if (!title) {
      setError(language === "en" ? "Enter a task title first." : "Vul eerst een taaktitel in.");
      return;
    }

    const infoText = detailTaskForm.info.trim();
    const scheduleHint = detailTaskForm.scheduleHint.trim();
    const infoCombined = [infoText, scheduleHint ? `Beste uren: ${scheduleHint}` : ""]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 600);
    const deadlineAt = detailTaskForm.deadlineAt
      ? localInputToTimezoneIso(detailTaskForm.deadlineAt, "Europe/Amsterdam")
      : null;
    if (detailTaskForm.deadlineAt && !deadlineAt) {
      setError(language === "en" ? "Invalid deadline date." : "Ongeldige deadline datum.");
      return;
    }

    const outcome = await sendMutation(
      `/api/weeks/${payload.week.id}/tasks`,
      "POST",
      {
        weekday: detailDay,
        title,
        info: infoCombined,
        deadlineAt,
        priority: detailTaskForm.priority,
        status: "open",
      },
      t("Taak toegevoegd."),
      { localUpdate: true, keepCurrentWeek: false },
    );

    if (!outcome.ok || outcome.queued) {
      return;
    }

    if (outcome.data?.task) {
      const nextDayDate =
        outcome.data.task.deadlineAt?.slice(0, 10) ??
        detailDayIso ??
        selectedPlannerDayDetail?.dayDate ??
        "";
      setTodoDay(outcome.data.task.weekday);
      if (nextDayDate) {
        setPlannerDayDetailRef({
          weekId: outcome.data.task.weekId,
          dayDate: nextDayDate,
        });
      }
    }

    setDetailTaskForm((prev) => ({
      ...prev,
      title: "",
      info: "",
      scheduleHint: "",
      deadlineAt: "",
    }));
    setDetailTaskComposerExpanded(false);
  }, [detailDay, detailDayIso, detailTaskForm, language, payload?.week?.id, selectedPlannerDayDetail?.dayDate, sendMutation, t]);

  const patchDetailTask = useCallback(
    (taskId: string, body: Record<string, unknown>, successMessage: string) =>
      sendMutation(`/api/tasks/${taskId}`, "PATCH", body, successMessage, {
        localUpdate: true,
        silent: true,
      }),
    [sendMutation],
  );

  const deleteDetailTask = useCallback(
    (taskId: string) => sendMutation(`/api/tasks/${taskId}`, "DELETE", {}, t("Taak verwijderd.")),
    [sendMutation, t],
  );
  const startHourEntryHoursEdit = useCallback((entry: HourEntry) => {
    setHourEntryHoursEditing((prev) => ({ ...prev, [entry.id]: true }));
    setHourEntryHoursDrafts((prev) => ({ ...prev, [entry.id]: String(entry.hoursDecimal) }));
  }, []);
  const cancelHourEntryHoursEdit = useCallback((entryId: string) => {
    setHourEntryHoursEditing((prev) => {
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
    setHourEntryHoursDrafts((prev) => {
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
  }, []);
  const saveHourEntryHours = useCallback(
    async (entryId: string) => {
      const draftValue = hourEntryHoursDrafts[entryId];
      const parsedValue = Number(draftValue);
      if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        setError(language === "en" ? "Invalid number of hours." : "Ongeldig aantal uren.");
        return;
      }

      const outcome = await sendMutation(
        `/api/hours/${entryId}`,
        "PATCH",
        { hoursDecimal: parsedValue },
        t("Urenregel bijgewerkt."),
        { localUpdate: true, silent: true },
      );

      if (!outcome.ok) {
        return;
      }

      cancelHourEntryHoursEdit(entryId);
    },
    [cancelHourEntryHoursEdit, hourEntryHoursDrafts, language, sendMutation, t],
  );

  const uploadExcel = async (file: File) => {
    setError(null);

    try {
      const formData = new FormData();
      formData.set("file", file);

      const response = await fetch("/api/import/manual", {
        method: "POST",
        body: formData,
      });

      const json = (await response.json()) as { data?: { weekId?: string }; error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? (language === "en" ? "Import failed" : "Import mislukt"));
      }

      setNotice(language === "en" ? "Excel import completed." : "Excel import voltooid.");
      await loadData(json.data?.weekId ?? activeWeekId);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : (language === "en" ? "Import failed" : "Import mislukt"));
    }
  };

  const runDriveSync = async () => {
    try {
      const response = await fetch("/api/import/sync", {
        method: "POST",
      });

      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? t("Drive sync mislukt"));
      }

      setNotice(t("Drive sync gestart."));
      await loadData(activeWeekId);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : (language === "en" ? "Sync failed" : "Sync fout"));
    }
  };

  const connectDrive = async () => {
    try {
      const response = await fetch("/api/integrations/google-drive/connect", { method: "POST" });
      const json = (await response.json()) as { data?: { url: string }; error?: string };
      if (!response.ok || !json.data?.url) {
        throw new Error(json.error ?? t("Drive koppeling mislukt"));
      }

      window.location.href = json.data.url;
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : t("Drive koppeling mislukt"));
    }
  };

  const logout = async () => {
    await fetch("/api/auth/pin/logout", { method: "POST" });
    setPayload(null);
    setActiveWeekId(null);
    setPinStatus({ configured: true, authenticated: false });
  };

  if (busy && !pinStatus) {
    const dayLetters = language === "en" ? ["M", "T", "W", "T", "F"] : ["M", "D", "W", "D", "V"];
    const barHeights = [36, 52, 64, 48, 32];
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4 py-16">
        <div className="flex flex-col items-center gap-8">
          {/* Five animated day-columns, like a mini week being built */}
          <div className="flex items-end gap-2">
            {dayLetters.map((letter, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div
                  className="w-10 rounded-t-xl bg-slate-900 animate-pulse"
                  style={{
                    height: `${barHeights[i]}px`,
                    animationDelay: `${i * 0.18}s`,
                    animationDuration: "1.4s",
                  }}
                />
                <span
                  className="text-xs font-semibold text-slate-400"
                  style={{ opacity: 0.4 + i * 0.12 }}
                >
                  {letter}
                </span>
              </div>
            ))}
          </div>
          <p className="text-sm font-medium tracking-wide text-slate-500">
            {language === "en" ? "Loading your week…" : "Je week laden…"}
          </p>
        </div>
      </div>
    );
  }

  if (!pinStatus) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-12">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50">
          <h1 className="text-2xl font-semibold text-slate-900">{language === "en" ? "Initialization failed" : "Initialisatie mislukt"}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {language === "en"
              ? "The app could not connect to the backend configuration."
              : "De app kon geen verbinding maken met de backend-configuratie."}
          </p>
          {error ? <div className="mt-4"><ApiError message={error} /></div> : null}
          <button
            type="button"
            className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 text-white"
            onClick={() => void init(true)}
          >
            {language === "en" ? "Try again" : "Opnieuw proberen"}
          </button>
        </div>
      </div>
    );
  }

  if (!pinStatus.authenticated) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-12">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50">
          <h1 className="text-2xl font-semibold text-slate-900">
            {pinStatus.configured ? t("Inloggen") : t("PIN instellen")}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {pinStatus.configured
              ? t("Voer je 6-cijferige PIN in om je weekplanner te openen.")
              : t("Kies een 6-cijferige PIN voor deze planner.")}
          </p>

          <div className="mt-6 space-y-3">
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="123456"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg tracking-[0.3em]"
            />

            <button
              type="button"
              onClick={handlePinSubmit}
              disabled={pin.length !== 6 || pinSubmitting}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pinSubmitting ? t("Bezig...") : pinStatus.configured ? t("Inloggen") : t("PIN opslaan")}
            </button>
          </div>

          {error ? <div className="mt-4"><ApiError message={error} /></div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <PlannerHeader
        language={language}
        currentWeekLabel={payload?.week.weekLabel ?? "Week"}
        currentRangeText={currentRangeText}
        weekOptions={headerWeekOptions}
        currentWeekId={payload?.week.id ?? null}
        hasPreviousWeek={Boolean(previousWeek)}
        hasNextWeek={Boolean(nextWeek)}
        exportHref={payload?.week.id ? `/api/export/csv?weekId=${payload.week.id}` : null}
        onOpenNotesExport={() => setShowNotesExportModal(true)}
        queueCount={queueCount}
        isOnline={isOnline}
        daySearchDate={daySearchDate}
        plannerSearchQuery={plannerSearchQuery}
        plannerSearchResults={plannerSearchResults}
        weekdayLabels={weekdayLabels}
        formatDayDateLabel={formatDayDateLabelForLanguage}
        onPreviousWeek={() => previousWeek && void loadData(previousWeek.id)}
        onWeekSelect={(weekId) => void loadData(weekId)}
        onNextWeek={() => nextWeek && void loadData(nextWeek.id)}
        onCurrentWeek={() => void loadData(null)}
        onUploadExcel={(file) => {
          void uploadExcel(file);
        }}
        onRunDriveSync={() => {
          void runDriveSync();
        }}
        onConnectDrive={() => {
          void connectDrive();
        }}
        onLogout={() => {
          void logout();
        }}
        onDaySearchDateChange={setDaySearchDate}
        onGoToDay={() => {
          void goToPlannerDate(daySearchDate);
        }}
        onPlannerSearchQueryChange={setPlannerSearchQuery}
        onOpenSearchResult={(result) => {
          void openPlannerDayDetailForWeek(result.weekId, result.weekday, result.dayDate);
        }}
        onLanguageChange={setLanguage}
        timezone={timezone}
        onTimezoneChange={setTimezone}
      />

      <div className="mt-4">
        <WeekScrollStrip
          weekOptions={headerWeekOptions}
          currentWeekId={payload?.week.id ?? null}
          onWeekSelect={(weekId) => void loadData(weekId)}
        />
      </div>

      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          className={`shrink-0 rounded-xl px-4 py-2 text-sm whitespace-nowrap ${tab === "planner" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          onClick={() => setTab("planner")}
        >
          {t("Week planner")}
        </button>
        <button
          type="button"
          className={`shrink-0 rounded-xl px-4 py-2 text-sm whitespace-nowrap ${tab === "hours" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          onClick={() => setTab("hours")}
        >
          {t("Tijdregistratie")}
          {timeReminders.length > 0 ? (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-semibold text-white">
              {timeReminders.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className={`shrink-0 rounded-xl px-4 py-2 text-sm whitespace-nowrap ${tab === "blocks" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          onClick={() => setTab("blocks")}
        >
          {t("Uurblokken")}
        </button>
        <button
          type="button"
          className={`shrink-0 rounded-xl px-4 py-2 text-sm whitespace-nowrap ${tab === "past" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          onClick={() => setTab("past")}
        >
          {t("Verlopen dagen")}
        </button>
        <button
          type="button"
          className={`shrink-0 rounded-xl px-4 py-2 text-sm whitespace-nowrap ${tab === "log" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          onClick={() => setTab("log")}
        >
          {t("Afgevinkt log")}
        </button>
        <button
          type="button"
          className={`rounded-xl px-4 py-2 text-sm ${tab === "thoughts" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
          onClick={() => setTab("thoughts")}
        >
          {t("Gedachten")}
        </button>
      </nav>

      <div className={`mt-4 grid gap-4 ${tab === "thoughts" ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_320px]"}`}>
        <section
          className={`order-2 lg:order-1 ${
            tab === "thoughts"
              ? "rounded-2xl border-0 bg-transparent p-0 shadow-none"
              : "rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-6"
          }`}
        >
          {!payload ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {t("Weekgegevens laden...")}
            </div>
          ) : null}
          {tab === "planner" && payload ? (
            <div className="space-y-6">
              {/* Task form — primary row always visible */}
              <div className="flex flex-wrap gap-2">
                <select
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  value={taskForm.weekday}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, weekday: event.target.value as Weekday }))}
                >
                  {plannerDayOptions.map((day) => (
                    <option key={day} value={day}>
                      {weekdayLabels[day]}
                    </option>
                  ))}
                </select>
                <input
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  placeholder={t("Taaktitel")}
                  value={taskForm.title}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))}
                />
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
                  onClick={() => setShowMoreTaskOptions((v) => !v)}
                  title={showMoreTaskOptions ? t("Minder opties") : t("Meer opties")}
                >
                  <svg
                    className={`h-4 w-4 transition-transform duration-200 ${showMoreTaskOptions ? "rotate-45" : ""}`}
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!plannerDayOptions.length}
                  onClick={() => {
                    if (!plannerDayOptions.length) {
                      setError(language === "en" ? "No days available in this week." : "Geen dagen beschikbaar in deze week.");
                      return;
                    }

                    const title = taskForm.title.trim();
                    if (!title) {
                      setError(language === "en" ? "Enter a task title first." : "Vul eerst een taaktitel in.");
                      return;
                    }

                    const deadlineAt = taskForm.deadlineAt
                      ? localInputToTimezoneIso(taskForm.deadlineAt, "Europe/Amsterdam")
                      : null;
                    if (taskForm.deadlineAt && !deadlineAt) {
                      setError(language === "en" ? "Invalid deadline date." : "Ongeldige deadline datum.");
                      return;
                    }

                    void (async () => {
                      const outcome = await sendMutation(
                        `/api/weeks/${payload.week.id}/tasks`,
                        "POST",
                        {
                          ...taskForm,
                          title,
                          info: taskForm.info.trim(),
                          deadlineAt,
                        },
                        t("Taak toegevoegd."),
                        { localUpdate: true, keepCurrentWeek: false },
                      );

                      if (!outcome.ok || outcome.queued) {
                        return;
                      }

                      if (outcome.data?.task) {
                        setTodoDay(outcome.data.task.weekday);
                      }

                      setTaskForm((prev) => ({
                        ...prev,
                        title: "",
                        info: "",
                      }));
                    })();
                  }}
                >
                  {t("Taak toevoegen")}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  title={language === "en" ? "Plan across multiple weeks" : "Inplannen over meerdere weken"}
                  onClick={() => setShowMultiWeekModal(true)}
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="1" y="2" width="14" height="13" rx="2" />
                    <path d="M1 6h14M5 1v2M11 1v2M4.5 9.5h2M9.5 9.5h2M4.5 12h2M9.5 12h2" />
                  </svg>
                </button>
              </div>

              {/* Extra options — collapsible */}
              <div
                className={`overflow-hidden transition-all duration-200 ${
                  showMoreTaskOptions ? "mt-2 max-h-40 opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <input
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    placeholder={t("Info")}
                    value={taskForm.info}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, info: event.target.value }))}
                  />
                  <input
                    type="datetime-local"
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    value={taskForm.deadlineAt}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, deadlineAt: event.target.value }))}
                  />
                  <select
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    value={taskDeadlineTimeValue}
                    onChange={(event) => applyTaskDeadlineTime(event.target.value)}
                  >
                    <option value="">{t("Sneltijd deadline")}</option>
                    {TIME_OPTIONS.map((time) => (
                      <option key={`task-deadline-${time}`} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    value={taskForm.priority}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, priority: event.target.value as "hoog" | "middel" | "laag" }))}
                  >
                    <option value="hoog">{t("Hoog")}</option>
                    <option value="middel">{t("Middel")}</option>
                    <option value="laag">{t("Laag")}</option>
                  </select>
                </div>
              </div>

              {plannerUpcomingDays.map((day) => {
                const doneCount = day.tasks.filter((task) => task.status === "klaar").length;
                const totalCount = day.tasks.length;
                const allDone = totalCount > 0 && doneCount === totalCount;
                return (
                  <div
                    key={day.key}
                    className={`rounded-xl border p-4 transition-colors ${
                      day.isToday
                        ? "border-blue-400 bg-blue-50/60 shadow-sm shadow-blue-100"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        className="flex-1 text-left"
                        onClick={() => void openPlannerDayDetailForWeek(day.weekId, day.weekday, day.dayDate)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-semibold ${day.isToday ? "text-blue-700" : "text-slate-900"} hover:text-blue-700`}>
                            {weekdayLabels[day.weekday]}
                          </span>
                          {day.dayDate ? (
                            <span className="text-sm text-slate-500">
                              {formatDayDateLabelForLanguage(day.dayDate)}
                            </span>
                          ) : null}
                          {day.isToday ? (
                            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                              {t("Vandaag")}
                            </span>
                          ) : (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                              {day.weekLabel}
                            </span>
                          )}
                          {allDone && totalCount > 0 ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                              ✓ {t("Klaar")}
                            </span>
                          ) : null}
                        </div>
                        {day.isToday ? (
                          <p className="mt-1 text-xs text-blue-600">{liveNowAmsterdam}</p>
                        ) : null}
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        {totalCount > 0 ? (
                          <span className="text-xs text-slate-500">
                            {doneCount}/{totalCount}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className={`rounded-lg border px-2 py-1 text-xs ${day.isToday ? "border-blue-300 bg-white text-blue-700 hover:bg-blue-50" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
                          onClick={() => void openPlannerDayDetailForWeek(day.weekId, day.weekday, day.dayDate)}
                        >
                          {t("Open dag")}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(() => {
                        const labels = Array.from(
                          new Set(
                            day.tasks
                              .map((task) => {
                                const project = projectNameForTask(task, day.hourBlocks);
                                if (project) {
                                  return project;
                                }
                                return task.title.trim();
                              })
                              .filter((label): label is string => Boolean(label))
                              .filter((label) => !isPauseLabel(label)),
                          ),
                        );

                        if (!labels.length) {
                          return <p className="text-sm text-slate-400 italic">{t("Geen taken gepland.")}</p>;
                        }

                        return labels.map((label) => (
                          <span
                            key={`${day.key}-project-${label}`}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"
                          >
                            {label}
                          </span>
                        ));
                      })()}
                    </div>
                  </div>
                );
              })}
              {plannerUpcomingDays.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  {t("Geen aankomende dagen gevonden. Bekijk eerdere dagen in het tabblad ")}
                  <strong>{t("Verlopen dagen")}</strong>.
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "thoughts" && payload ? (
            <ThoughtInbox
              currentWeek={payload.week}
              weekdayLabels={weekdayLabels}
              translate={t}
              onCreateTask={createTaskFromThought}
              highlightThreadId={highlightThreadId}
            />
          ) : null}

          {tab === "hours" && payload ? (
            <div className="space-y-5">
              <RemindersBanner
                reminders={timeReminders}
                onRegister={registerReminder}
                onDismiss={dismissReminder}
                t={t}
              />
              <TimerSection
                todayIso={todayIsoAmsterdam}
                todayWeekday={todayIsoAmsterdam ? weekdayFromIsoDate(todayIsoAmsterdam) : null}
                tasks={payload.tasks}
                hourBlocks={payload.hourBlocks}
                entries={payload.hourEntries}
                runningEntry={runningEntry}
                onStart={(input) => void startTimer(input)}
                onStop={() => void stopTimer()}
                t={t}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Uren toevoegen")}</p>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50"
                  onClick={() => setHoursNotesExpanded((prev) => !prev)}
                >
                  {hoursNotesExpanded ? t("Compacte notities") : t("Uitgebreide notities")}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">{t("Datum")}</span>
                  <input
                    type="date"
                    value={hourForm.dayDate}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    onChange={(event) => {
                      const dayDate = event.target.value;
                      const derivedWeekday = weekdayFromIsoDate(dayDate);
                      setHourForm((prev) => ({
                        ...prev,
                        dayDate,
                        weekday: derivedWeekday ?? prev.weekday,
                      }));
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">{t("Dag")}</span>
                  <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {hourFormDerivedWeekday ? weekdayLabels[hourFormDerivedWeekday] : t("Geen werkdag")}
                  </div>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">{t("Uren")}</span>
                  <select
                    value={hourForm.hoursDecimal}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    onChange={(event) => setHourForm((prev) => ({ ...prev, hoursDecimal: event.target.value }))}
                    onWheel={(event) => {
                      event.preventDefault();
                      const direction = event.deltaY > 0 ? 1 : -1;
                      setHourForm((prev) => {
                        const currentIndex = Math.max(0, hourSelectOptions.indexOf(prev.hoursDecimal));
                        const nextIndex = Math.min(
                          hourSelectOptions.length - 1,
                          Math.max(0, currentIndex + direction),
                        );
                        return {
                          ...prev,
                          hoursDecimal: hourSelectOptions[nextIndex] ?? prev.hoursDecimal,
                        };
                      });
                    }}
                  >
                    {hourSelectOptions.map((value) => (
                      <option key={`hours-${value}`} value={value}>
                        {value}u
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">{t("Project")}</span>
                  <input
                    value={hourForm.projectName}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    placeholder={t("Project / categorie")}
                    onChange={(event) => setHourForm((prev) => ({ ...prev, projectName: event.target.value }))}
                  />
                </label>
                <label className={`flex flex-col gap-1 ${hoursNotesExpanded ? "sm:col-span-2 lg:col-span-2" : "sm:col-span-2 lg:col-span-2"}`}>
                  <span className="text-xs text-slate-500">{t("Reflectie")}</span>
                  <textarea
                    value={hourForm.noteText}
                    rows={hoursNotesExpanded ? 5 : 2}
                    className="resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    placeholder={t("Notitie of reflectie over deze dag")}
                    onChange={(event) => setHourForm((prev) => ({ ...prev, noteText: event.target.value }))}
                  />
                </label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2 lg:col-span-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("Uren calculator")}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <input
                      type="time"
                      value={hoursCalcForm.startAt}
                      className="rounded-lg border border-slate-300 px-3 py-2"
                      onChange={(event) => setHoursCalcForm((prev) => ({ ...prev, startAt: event.target.value }))}
                    />
                    <input
                      type="time"
                      value={hoursCalcForm.endAt}
                      className="rounded-lg border border-slate-300 px-3 py-2"
                      onChange={(event) => setHoursCalcForm((prev) => ({ ...prev, endAt: event.target.value }))}
                    />
                    <input
                      type="number"
                      min="0"
                      step="15"
                      value={hoursCalcForm.breakMinutes}
                      className="rounded-lg border border-slate-300 px-3 py-2"
                      placeholder={t("Pauze (min)")}
                      onChange={(event) => setHoursCalcForm((prev) => ({ ...prev, breakMinutes: event.target.value }))}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-600">
                      {t("Berekend")}: {hoursCalculated != null ? `${hoursCalculated}u` : t("ongeldige tijd")}
                    </p>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() =>
                        setHourForm((prev) => ({
                          ...prev,
                          hoursDecimal: hoursCalculated != null ? String(hoursCalculated) : prev.hoursDecimal,
                        }))
                      }
                      disabled={hoursCalculated == null}
                    >
                      {t("Gebruik berekening")}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50 lg:col-span-3"
                  disabled={!hourFormDerivedWeekday || Number(hourForm.hoursDecimal) <= 0}
                  onClick={() => {
                    if (!hourFormDerivedWeekday) {
                      setError(t("Kies een geldige dag voor urenregistratie."));
                      return;
                    }

                    void sendMutation(
                      `/api/weeks/${payload.week.id}/hours`,
                      "POST",
                      {
                        ...hourForm,
                        ...(hourFormLink ?? {}),
                        weekday: hourFormDerivedWeekday,
                        hoursDecimal: Number(hourForm.hoursDecimal),
                      },
                      t("Uren toegevoegd."),
                      { localUpdate: true, keepCurrentWeek: false },
                    );
                    setHourFormLink(null);
                  }}
                >
                  {t("Uren toevoegen")}
                </button>
                <p className="text-xs text-slate-500 lg:col-span-3">
                  {t("Tip: scrol met muis/trackpad op het urenveld om snel te wijzigen.")}
                </p>
              </div>

              {/* Period filter */}
              <div className="flex flex-wrap gap-2">
                {(["all", "week", "day"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`rounded-xl px-3 py-1.5 text-sm ${
                      hoursPeriodFilter === filter
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                    onClick={() => setHoursPeriodFilter(filter)}
                  >
                    {filter === "all" ? t("Alles") : filter === "week" ? t("Deze week") : t("Specifieke dag")}
                  </button>
                ))}
                <div
                  className={`overflow-hidden transition-all duration-200 ${
                    hoursPeriodFilter === "day" ? "max-w-[180px] opacity-100" : "max-w-0 opacity-0"
                  }`}
                >
                  <input
                    type="date"
                    value={hoursDayFilter}
                    className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
                    onChange={(event) => setHoursDayFilter(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-600">{t("Totaal zichtbaar")}</p>
                  <p className="text-2xl font-semibold text-slate-900">{visibleHoursSummary.totalHours}u</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-600">{t("Actieve week")}</p>
                  <p className="text-2xl font-semibold text-slate-900">{payload.hourSummary.weeklyTotalHours}u</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-600">{t("Weken met uren")}</p>
                  <p className="text-2xl font-semibold text-slate-900">{visibleHoursSummary.perWeekTotals.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-3">
                  <p className="text-xs text-slate-600">{t("Per week")}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-sm">
                    {visibleHoursSummary.perWeekTotals.length ? (
                      visibleHoursSummary.perWeekTotals.map((item) => (
                        <span key={item.weekId} className="rounded-full bg-slate-200 px-2 py-1 text-slate-800">
                          {item.weekLabel}: {item.totalHours}u
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500">{t("Nog geen data")}</span>
                    )}
                  </div>
                </div>
              </div>

              <ProjectBudgets refreshToken={`${payload.week.id}-${payload.hourEntries.length}`} t={t} />

              <ExportCenter
                todayIso={todayIsoAmsterdam}
                weekStartDate={payload.week.startDate}
                weekEndDate={payload.week.endDate}
                projectNames={payload.hourSummary.perProjectTotals.map((item) => item.projectName)}
                t={t}
              />

              {/* Per project — collapsible accordion cards */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("Per project")}</p>
                {visibleHoursSummary.perProjectTotals.length ? (
                  visibleHoursSummary.perProjectTotals.map((item) => {
                    const isExpanded = expandedProjects.has(item.projectName);
                    const projectEntries = filteredHourEntries.filter(
                      (e) => (e.projectName.trim() || "Zonder project") === item.projectName,
                    );
                    return (
                      <div key={item.projectName} className="rounded-xl border border-slate-200 bg-white">
                        <div className="flex items-center justify-between gap-2 px-4 py-3">
                          <button
                            type="button"
                            className="flex flex-1 items-center gap-2 text-left"
                            onClick={() => {
                              setExpandedProjects((prev) => {
                                const next = new Set(prev);
                                if (next.has(item.projectName)) {
                                  next.delete(item.projectName);
                                } else {
                                  next.add(item.projectName);
                                }
                                return next;
                              });
                            }}
                          >
                            <span className="font-medium text-slate-900">{item.projectName}</span>
                            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">
                              {item.totalHours}u
                            </span>
                            <svg
                              className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M4 6l4 4 4-4" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
                            onClick={() => {
                              setRenameModalProject(item.projectName);
                              setRenameModalValue(item.projectName);
                            }}
                          >
                            {t("Hernoemen")}
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
                            onClick={() => {
                              setMergeModalProject(item.projectName);
                              setMergeTargets(new Set());
                            }}
                          >
                            {t("Samenvoegen")}
                          </button>
                        </div>
                        {isExpanded ? (
                          <div className="border-t border-slate-100 px-4 py-3 space-y-2">
                            {projectEntries.map((entry) => (
                              <div key={entry.id} className="flex items-center justify-between text-sm text-slate-700">
                                <span className="text-slate-500 text-xs w-24 shrink-0">
                                  {weekdayLabels[entry.weekday]} {formatDayDateLabelForLanguage(entry.dayDate)}
                                </span>
                                <span className="flex-1 truncate px-2">{entry.noteText || "-"}</span>
                                <span className="font-medium shrink-0">{entry.hoursDecimal}u</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500">{t("Nog geen data")}</p>
                )}
              </div>

              {/* Rename modal */}
              {renameModalProject ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
                  <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
                    <h3 className="font-semibold text-slate-900">{t("Project hernoemen")}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {t("Alle uren onder")} <strong>{renameModalProject}</strong> {t("krijgen de nieuwe naam.")}
                    </p>
                    <input
                      type="text"
                      className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      value={renameModalValue}
                      autoFocus
                      onChange={(event) => setRenameModalValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setRenameModalProject(null);
                      }}
                    />
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        className="flex-1 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                        disabled={!renameModalValue.trim() || renameModalValue.trim() === renameModalProject}
                        onClick={() => {
                          const oldName = renameModalProject;
                          const newName = renameModalValue.trim();
                          void (async () => {
                            for (const entry of allHourEntries) {
                              if (entry.projectName.trim() === oldName) {
                                await sendMutation(
                                  `/api/hours/${entry.id}`,
                                  "PATCH",
                                  { projectName: newName },
                                  "",
                                  { silent: true },
                                );
                              }
                            }
                            for (const block of allHourBlocks) {
                              if (block.projectText.trim() === oldName) {
                                await sendMutation(
                                  `/api/hour-blocks/${block.id}`,
                                  "PATCH",
                                  { projectText: newName },
                                  "",
                                  { silent: true },
                                );
                              }
                            }
                            setRenameModalProject(null);
                            setRenameModalValue("");
                          })();
                        }}
                      >
                        {t("Opslaan")}
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700"
                        onClick={() => setRenameModalProject(null)}
                      >
                        {t("Annuleren")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Merge modal */}
              {mergeModalProject ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
                  <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
                    <h3 className="font-semibold text-slate-900">{t("Projecten samenvoegen")}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {t("Kies welke namen samengevoegd worden naar")} <strong>{mergeModalProject}</strong>
                    </p>
                    <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                      {allProjectNames
                        .filter((name) => name !== mergeModalProject)
                        .sort((a, b) => {
                          const scoreA = levenshteinSimilarity(mergeModalProject, a);
                          const scoreB = levenshteinSimilarity(mergeModalProject, b);
                          return scoreB - scoreA;
                        })
                        .map((name) => (
                          <label key={name} className="flex items-center gap-2 text-sm text-slate-800">
                            <input
                              type="checkbox"
                              checked={mergeTargets.has(name)}
                              onChange={() => {
                                setMergeTargets((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(name)) next.delete(name);
                                  else next.add(name);
                                  return next;
                                });
                              }}
                            />
                            {name}
                          </label>
                        ))}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        className="flex-1 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                        disabled={mergeTargets.size === 0}
                        onClick={() => {
                          const canonical = mergeModalProject;
                          const targets = Array.from(mergeTargets);
                          void (async () => {
                            for (const entry of allHourEntries) {
                              if (targets.includes(entry.projectName.trim())) {
                                await sendMutation(
                                  `/api/hours/${entry.id}`,
                                  "PATCH",
                                  { projectName: canonical },
                                  "",
                                  { silent: true },
                                );
                              }
                            }
                            setMergeModalProject(null);
                            setMergeTargets(new Set());
                          })();
                        }}
                      >
                        {t("Samenvoegen")}
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700"
                        onClick={() => setMergeModalProject(null)}
                      >
                        {t("Annuleren")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                {groupedHourEntriesByDay.length ? (
                  groupedHourEntriesByDay.map((group) => (
                    <section key={group.key} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">
                          {weekdayLabels[group.weekday]}
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            ({formatDayDateLabelForLanguage(group.dayDate)})
                          </span>
                          <span className="ml-2 rounded bg-white px-2 py-0.5 text-[11px] font-normal text-slate-600">
                            {group.weekLabel}
                          </span>
                        </h3>
                        <span className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                          {formatHourAmount(group.totalHours)}
                        </span>
                      </div>

                      <div className="mt-3 space-y-2">
                        {group.entries.map((entry: HourEntry) => {
                          const isEditingHours = Boolean(hourEntryHoursEditing[entry.id]);
                          const hoursDraft = hourEntryHoursDrafts[entry.id] ?? String(entry.hoursDecimal);

                          return (
                            <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
                              <input
                                key={`${entry.id}-${entry.updatedAt}-day`}
                                type="date"
                                defaultValue={entry.dayDate}
                                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                onBlur={(event) =>
                                  void sendMutation(
                                    `/api/hours/${entry.id}`,
                                    "PATCH",
                                    { dayDate: event.target.value },
                                    t("Urenregel bijgewerkt."),
                                    { localUpdate: true, silent: true, keepCurrentWeek: false },
                                  )
                                }
                              />
                              <div className="rounded-lg border border-slate-300 px-3 py-2">
                                {isEditingHours ? (
                                  <div className="space-y-2">
                                    <select
                                      value={hoursDraft}
                                      className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                      onChange={(event) =>
                                        setHourEntryHoursDrafts((prev) => ({
                                          ...prev,
                                          [entry.id]: event.target.value,
                                        }))
                                      }
                                    >
                                      {hourOptionsWithValue(hoursDraft).map((value) => (
                                        <option key={`${entry.id}-hours-${value}`} value={value}>
                                          {value}u
                                        </option>
                                      ))}
                                    </select>
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white"
                                        onClick={() => void saveHourEntryHours(entry.id)}
                                      >
                                        {t("Opslaan")}
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                                        onClick={() => cancelHourEntryHoursEdit(entry.id)}
                                      >
                                        {t("Annuleer")}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <p className="text-2xl font-semibold text-slate-900">{entry.hoursDecimal}u</p>
                                    <button
                                      type="button"
                                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                                      onClick={() => startHourEntryHoursEdit(entry)}
                                    >
                                        {t("Corrigeer uren")}
                                    </button>
                                  </div>
                                )}
                              </div>
                              <input
                                key={`${entry.id}-${entry.updatedAt}-project`}
                                defaultValue={entry.projectName}
                                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                placeholder={t("Project")}
                                onBlur={(event) =>
                                  void sendMutation(
                                    `/api/hours/${entry.id}`,
                                    "PATCH",
                                    { projectName: event.target.value },
                                    t("Urenregel bijgewerkt."),
                                    { localUpdate: true, silent: true },
                                  )
                                }
                              />
                              <textarea
                                key={`${entry.id}-${entry.updatedAt}-note`}
                                rows={hoursNotesExpanded ? 5 : 2}
                                defaultValue={entry.noteText}
                                className={`rounded-lg border border-slate-300 px-2 py-1 text-sm resize-y lg:col-span-2 ${
                                  hoursNotesExpanded ? "min-h-[8rem]" : "min-h-[5.5rem]"
                                }`}
                                placeholder={t("Reflectie of notitie")}
                                onBlur={(event) =>
                                  void sendMutation(
                                    `/api/hours/${entry.id}`,
                                    "PATCH",
                                    { noteText: event.target.value },
                                    t("Urenregel bijgewerkt."),
                                    { localUpdate: true, silent: true },
                                  )
                                }
                              />
                              <AnimatedDeleteButton
                                onConfirm={() => void sendMutation(`/api/hours/${entry.id}`, "DELETE", {}, t("Urenregel verwijderd."))}
                                label={t("Verwijder")}
                                confirmLabel={t("Zeker?")}
                                size="sm"
                                className="lg:col-span-1"
                              />
                              </div>
                              <p className="mt-2 text-xs text-slate-500">{weekdayLabels[entry.weekday]}</p>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    {t("Nog geen uren geregistreerd voor deze week.")}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {tab === "past" && payload ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                {t("Overzicht van alle werkdagen die al voorbij zijn op basis van vandaag ({date}).").replace(
                  "{date}",
                  todayIsoAmsterdam ?? "-",
                )}
              </div>

              {pastDaysSummary.length ? (
                pastDaysSummary.map((day) => (
                  <article key={`${day.weekId}-${day.weekday}-${day.dayDate}`} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {weekdayLabels[day.weekday]} ({formatDayDateLabelForLanguage(day.dayDate)})
                        <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-normal text-slate-600">
                          {day.weekLabel}
                        </span>
                      </h3>
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        onClick={() => void openPlannerDayDetailForWeek(day.weekId, day.weekday, day.dayDate)}
                      >
                        {t("Open dag")}
                      </button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
                        Taken: {day.taskDone}/{day.taskTotal}
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
                        Uurblokken: {day.blockDone}/{day.blockTotal}
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
                        Uren: {day.hoursTotal}u
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <p className="text-sm text-slate-500">{t("Nog geen verlopen werkdagen.")}</p>
              )}
            </div>
          ) : null}

          {tab === "log" && payload ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                {t("Alle afgevinkte taken met project, info en exacte datum/tijd van afvinken.")}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      logDateFilter === "all"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                    onClick={() => setLogDateFilter("all")}
                  >
                    {t("Alles")}
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      logDateFilter === "today"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                    onClick={() => setLogDateFilter("today")}
                  >
                    {t("Vandaag")}
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      logDateFilter === "week"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                    onClick={() => setLogDateFilter("week")}
                  >
                    {t("Deze week")}
                  </button>
                </div>
                <select
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={logProjectFilter}
                  onChange={(event) => setLogProjectFilter(event.target.value)}
                >
                  <option value="all">{t("Alle projecten")}</option>
                  {completedTaskLogProjects.map((projectName) => (
                    <option key={`log-project-${projectName}`} value={projectName}>
                      {projectName}
                    </option>
                  ))}
                </select>
              </div>
              {hiddenCompletedLogCount ? (
                <div className="flex">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    onClick={restoreHiddenLogItems}
                  >
                    {t("Herstel verborgen logs")} ({hiddenCompletedLogCount})
                  </button>
                </div>
              ) : null}
              <p className="text-xs text-slate-500">
                {t("Resultaten")}: {filteredCompletedTaskLog.length}
                {hiddenCompletedLogCount ? ` • ${t("Verborgen")}: ${hiddenCompletedLogCount}` : ""}
              </p>

              {filteredCompletedTaskLog.length ? (
                <div className="space-y-3">
                  {filteredCompletedTaskLog.map((item) => (
                    <article key={item.taskId} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-slate-900">{item.title}</h3>
                          <p className="text-xs text-slate-500">
                            {weekdayLabels[item.weekday]} • {formatIsoDateForLanguage(item.dayDate)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                            onClick={() =>
                              void openPlannerDayDetailForWeek(item.weekId, item.weekday, item.dayDate)
                            }
                          >
                            {t("Open dag")}
                          </button>
                          <AnimatedDeleteButton
                            onConfirm={() => hideCompletedLogItem(item.taskId)}
                            label={t("Verwijder uit log")}
                            confirmLabel={t("Zeker?")}
                            size="sm"
                          />
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg bg-slate-50 p-2">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">Project</p>
                          <p className="text-sm text-slate-800">{item.projectText || t("Geen project gekoppeld")}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">{t("Afgevinkt op")}</p>
                          <p className="text-sm text-slate-800">{formatDateTimeForLanguage(item.checkedAt)}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">Deadline</p>
                          <p className="text-sm text-slate-800">{formatDateTimeForLanguage(item.deadlineAt)}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">Info</p>
                          <p className="text-sm text-slate-800">{item.info || t("Geen extra info")}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">{t("Geen afgevinkte taken voor de gekozen filters.")}</p>
              )}
            </div>
          ) : null}

          {tab === "blocks" && payload ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {/* Day selector — single day or multi-day toggle */}
                <div className="col-span-2 flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={blockMultiDay}
                      onChange={(event) => {
                        setBlockMultiDay(event.target.checked);
                        setBlockMultiDaySelection(new Set());
                      }}
                    />
                    {t("Meerdere dagen")}
                  </label>
                </div>

                {blockMultiDay ? (
                  <div className="col-span-2 flex flex-wrap gap-2">
                    {(WEEKDAYS as unknown as Weekday[]).map((day) => (
                      <button
                        key={day}
                        type="button"
                        className={`rounded-xl border px-3 py-1.5 text-sm ${
                          blockMultiDaySelection.has(day)
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-300 text-slate-700 hover:bg-slate-50"
                        }`}
                        onClick={() => {
                          setBlockMultiDaySelection((prev) => {
                            const next = new Set(prev);
                            if (next.has(day)) next.delete(day);
                            else next.add(day);
                            return next;
                          });
                        }}
                      >
                        {weekdayLabels[day]}
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <select
                      className="col-span-2 rounded-xl border border-slate-300 px-3 py-2 sm:col-span-1"
                      value={blockForm.weekday}
                      onChange={(event) => {
                        const weekday = event.target.value as Weekday;
                        const suggestedDate = weekdayIsoMap[weekday];
                        setBlockForm((prev) => ({
                          ...prev,
                          weekday,
                          dayDate: suggestedDate || prev.dayDate,
                        }));
                      }}
                    >
                      {orderedWeekdays.map((day) => (
                        <option key={day} value={day}>
                          {weekdayLabels[day]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      className="col-span-2 rounded-xl border border-slate-300 px-3 py-2 sm:col-span-1"
                      value={blockForm.dayDate}
                      onChange={(event) => {
                        const dayDate = event.target.value;
                        const derivedWeekday = weekdayFromIsoDate(dayDate);
                        setBlockForm((prev) => ({
                          ...prev,
                          dayDate,
                          weekday: derivedWeekday ?? prev.weekday,
                        }));
                      }}
                    />
                  </>
                )}

                {/* Start time — auto-updates end time */}
                <select
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  value={blockForm.timeStart}
                  onChange={(event) => {
                    const timeStart = event.target.value;
                    setBlockForm((prev) => {
                      const startIdx = TIME_OPTIONS.indexOf(timeStart);
                      const endIdx = startIdx >= 0 ? Math.min(startIdx + 4, TIME_OPTIONS.length - 1) : -1;
                      const autoEnd = blockEndTimeAutoSet && endIdx >= 0 ? TIME_OPTIONS[endIdx] : prev.timeEnd;
                      return { ...prev, timeStart, timeEnd: autoEnd ?? prev.timeEnd };
                    });
                    setBlockEndTimeAutoSet(true);
                  }}
                >
                  {TIME_OPTIONS.map((time) => (
                    <option key={`start-${time}`} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  value={blockForm.timeEnd}
                  onChange={(event) => {
                    setBlockEndTimeAutoSet(false);
                    setBlockForm((prev) => ({ ...prev, timeEnd: event.target.value }));
                  }}
                >
                  {TIME_OPTIONS.map((time) => (
                    <option key={`end-${time}`} value={time}>
                      {time}
                    </option>
                  ))}
                </select>

                <input
                  className="col-span-2 rounded-xl border border-slate-300 px-3 py-2 lg:col-span-1"
                  value={blockForm.taskText}
                  placeholder={t("Taak")}
                  onChange={(event) => setBlockForm((prev) => ({ ...prev, taskText: event.target.value }))}
                />

                {/* Project combobox with past suggestions */}
                <ProjectCombobox
                  value={blockForm.projectText}
                  suggestions={allBlockProjectNames}
                  placeholder={t("Project")}
                  className="col-span-2 lg:col-span-1"
                  onChange={(value) => setBlockForm((prev) => ({ ...prev, projectText: value }))}
                />

                <input
                  type="datetime-local"
                  className="col-span-2 rounded-xl border border-slate-300 px-3 py-2 sm:col-span-1"
                  value={blockForm.deadlineAt}
                  onChange={(event) => setBlockForm((prev) => ({ ...prev, deadlineAt: event.target.value }))}
                />

                {/* Team assignees */}
                <div className="col-span-2 lg:col-span-4">
                  <p className="mb-1 text-xs text-slate-500">{t("Teamleden")}</p>
                  <AssigneeTagInput
                    assignees={blockAssignees}
                    onChange={setBlockAssignees}
                  />
                </div>

                <button
                  type="button"
                  className="col-span-2 rounded-xl bg-slate-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-1"
                  disabled={!blockFormRangeValid || (blockMultiDay && blockMultiDaySelection.size === 0)}
                  onClick={() => {
                    if (!blockFormRangeValid) {
                      setError(t("Eindtijd moet later zijn dan begintijd."));
                      return;
                    }
                    const deadlineAt = blockForm.deadlineAt
                      ? localInputToTimezoneIso(blockForm.deadlineAt, "Europe/Amsterdam")
                      : null;
                    if (blockForm.deadlineAt && !deadlineAt) {
                      setError("Ongeldige deadline datum.");
                      return;
                    }

                    const daysToCreate = blockMultiDay
                      ? Array.from(blockMultiDaySelection)
                      : [blockForm.weekday];

                    for (const day of daysToCreate) {
                      const suggestedDate = weekdayIsoMap[day];
                      void sendMutation(
                        `/api/weeks/${payload.week.id}/hour-blocks`,
                        "POST",
                        {
                          ...blockForm,
                          weekday: day,
                          dayDate: suggestedDate || blockForm.dayDate,
                          deadlineAt,
                          assignees: blockAssignees,
                        },
                        daysToCreate.length === 1 ? t("Uurblok toegevoegd.") : "",
                        { localUpdate: true, keepCurrentWeek: false, silent: daysToCreate.length > 1 },
                      );
                    }
                    if (daysToCreate.length > 1) {
                      setNotice(t("Uurblokken toegevoegd."));
                    }
                  }}
                >
                  {t("Uurblok toevoegen")}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  title={language === "en" ? "Plan block across multiple weeks" : "Uurblok over meerdere weken inplannen"}
                  onClick={() => setShowMultiWeekBlockModal(true)}
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="1" y="2" width="14" height="13" rx="2" />
                    <path d="M1 6h14M5 1v2M11 1v2M4.5 9.5h2M9.5 9.5h2M4.5 12h2M9.5 12h2" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {t("Eindtijd wordt automatisch 1 uur na begintijd ingesteld. Aanpassen mag altijd.")}
              </p>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-600">{t("Aankomende uurblokken")}</p>
                  <p className="text-2xl font-semibold text-slate-900">{upcomingBlocksTotal}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-600">{t("Klaar")}</p>
                  <p className="text-2xl font-semibold text-slate-900">{upcomingBlocksDoneTotal}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-600">{t("Aankomende dagen")}</p>
                  <p className="text-2xl font-semibold text-slate-900">{upcomingBlockGroups.length}</p>
                </div>
              </div>

              <div className="space-y-4">
                {upcomingBlockGroups.length ? (
                  upcomingBlockGroups.map((group) => (
                    <section
                      key={group.key}
                      className={`rounded-xl border p-3 sm:p-4 ${
                        group.isToday ? "border-blue-300 bg-blue-50/30" : "border-slate-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold text-slate-900">
                          {weekdayLabels[group.weekday]}
                          <span className="ml-2 text-sm font-normal text-slate-500">
                            ({formatDayDateLabelForLanguage(group.dayDate)})
                          </span>
                          <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-normal text-slate-600">
                            {group.weekLabel}
                          </span>
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-600">
                            {group.blocks.filter((block) => block.status === "klaar").length}/{group.blocks.length} {t("Klaar").toLowerCase()}
                          </span>
                          <button
                            type="button"
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                            onClick={() => void openPlannerDayDetailForWeek(group.weekId, group.weekday, group.dayDate)}
                          >
                            {t("Open dag")}
                          </button>
                        </div>
                      </div>
                      {group.isToday ? <p className="mt-1 text-xs text-blue-700">{t("Nu")}: {liveNowAmsterdam}</p> : null}
                      <p className="mt-1 text-xs text-slate-500">
                        {t("Taken")} {group.taskDone}/{group.tasks.length} • {t("Urenregistratie")} {group.hoursTotal}u
                      </p>

                      <div className="mt-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("Taken voor deze dag")}</p>
                        {group.tasks.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {group.tasks.map((task) => (
                              <span
                                key={`${group.key}-task-${task.id}`}
                                className={`rounded-full border px-2 py-1 text-xs ${
                                  task.status === "klaar"
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                    : "border-slate-300 bg-white text-slate-700"
                                }`}
                              >
                                {task.title}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-slate-500">{t("Geen taken gekoppeld.")}</p>
                        )}
                      </div>

                      <div className="mt-3 space-y-3">
                        {group.blockGroups.length ? (
                          group.blockGroups.map((blockGroup: HourBlockDisplayGroup) => (
                          <section key={blockGroup.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {blockGroup.label}
                                  <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                    {blockGroup.timeStart} - {blockGroup.timeEnd}
                                  </span>
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {formatHourAmount(blockGroup.totalMinutes / 60)} • {blockGroup.blocks.length} blok
                                  {blockGroup.blocks.length === 1 ? "" : "ken"}
                                  {blockGroup.taskLabels.length > 1
                                    ? ` • Taken: ${blockGroup.taskLabels.join(", ")}`
                                    : blockGroup.taskLabels[0] && blockGroup.projectText
                                      ? ` • Taak: ${blockGroup.taskLabels[0]}`
                                      : ""}
                                </p>
                              </div>
                              <span className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                                {blockGroup.hasMixedStatus ? t("Gemengde status") : translateStatus(language, blockGroup.primaryStatus)}
                              </span>
                            </div>

                            <div className="mt-3 space-y-2">
                              {blockGroup.blocks.map((block: HourBlock) => (
                          <article key={block.id} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="rounded-lg bg-white px-2 py-1 text-sm font-semibold text-slate-900">
                                {block.timeStart} - {block.timeEnd}
                              </p>
                              <div className="flex items-center gap-2">
                                <select
                                  className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                  defaultValue={block.status}
                                  onChange={(event) =>
                                    void sendMutation(
                                      `/api/hour-blocks/${block.id}`,
                                      "PATCH",
                                      { status: event.target.value, expectedUpdatedAt: block.updatedAt },
                                      t("Uurblok status bijgewerkt."),
                                      { localUpdate: true, silent: true },
                                    )
                                  }
                                >
                                  <option value="open">{translateStatus(language, "open")}</option>
                                  <option value="bezig">{translateStatus(language, "bezig")}</option>
                                  <option value="klaar">{translateStatus(language, "klaar")}</option>
                                </select>
                                <AnimatedDeleteButton
                                  onConfirm={() => void sendMutation(`/api/hour-blocks/${block.id}`, "DELETE", {}, t("Uurblok verwijderd."))}
                                  label={t("Verwijder")}
                                  confirmLabel={t("Zeker?")}
                                  size="sm"
                                />
                              </div>
                            </div>

                            <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-3">
                              <input
                                key={`${block.id}-${block.updatedAt}-day`}
                                type="date"
                                defaultValue={block.dayDate ?? group.dayDate}
                                className="col-span-2 rounded-lg border border-slate-300 px-2 py-1 text-sm lg:col-span-1"
                                onBlur={(event) =>
                                  void sendMutation(
                                    `/api/hour-blocks/${block.id}`,
                                    "PATCH",
                                    {
                                      dayDate: event.target.value || null,
                                      expectedUpdatedAt: block.updatedAt,
                                    },
                                    t("Uurblok datum bijgewerkt."),
                                    { localUpdate: true, silent: true, keepCurrentWeek: false },
                                  )
                                }
                              />
                              <select
                                key={`${block.id}-${block.updatedAt}-start`}
                                defaultValue={block.timeStart}
                                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                onChange={(event) =>
                                  void sendMutation(
                                    `/api/hour-blocks/${block.id}`,
                                    "PATCH",
                                    { timeStart: event.target.value, expectedUpdatedAt: block.updatedAt },
                                    t("Starttijd bijgewerkt."),
                                    { localUpdate: true, silent: true },
                                  )
                                }
                              >
                                {TIME_OPTIONS.map((time) => (
                                  <option key={`${block.id}-start-${time}`} value={time}>
                                    {time}
                                  </option>
                                ))}
                              </select>
                              <select
                                key={`${block.id}-${block.updatedAt}-end`}
                                defaultValue={block.timeEnd}
                                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                onChange={(event) =>
                                  void sendMutation(
                                    `/api/hour-blocks/${block.id}`,
                                    "PATCH",
                                    { timeEnd: event.target.value, expectedUpdatedAt: block.updatedAt },
                                    t("Eindtijd bijgewerkt."),
                                    { localUpdate: true, silent: true },
                                  )
                                }
                              >
                                {TIME_OPTIONS.map((time) => (
                                  <option key={`${block.id}-end-${time}`} value={time}>
                                    {time}
                                  </option>
                                ))}
                              </select>
                              <input
                                key={`${block.id}-${block.updatedAt}-task`}
                                defaultValue={block.taskText}
                                className="col-span-2 rounded-lg border border-slate-300 px-2 py-1 text-sm lg:col-span-1"
                                placeholder={t("Taak")}
                                onBlur={(event) =>
                                  void sendMutation(
                                    `/api/hour-blocks/${block.id}`,
                                    "PATCH",
                                    { taskText: event.target.value, expectedUpdatedAt: block.updatedAt },
                                      t("Uurblok bijgewerkt."),
                                    { localUpdate: true, silent: true },
                                  )
                                }
                              />
                              <input
                                key={`${block.id}-${block.updatedAt}-project`}
                                defaultValue={block.projectText}
                                className="col-span-2 rounded-lg border border-slate-300 px-2 py-1 text-sm lg:col-span-1"
                                placeholder={t("Project")}
                                onBlur={(event) =>
                                  void sendMutation(
                                    `/api/hour-blocks/${block.id}`,
                                    "PATCH",
                                    { projectText: event.target.value, expectedUpdatedAt: block.updatedAt },
                                      t("Uurblok bijgewerkt."),
                                    { localUpdate: true, silent: true },
                                  )
                                }
                              />
                              <input
                                key={`${block.id}-${block.updatedAt}`}
                                type="datetime-local"
                                defaultValue={formatIsoToLocalInput(block.deadlineAt)}
                                className="col-span-2 rounded-lg border border-slate-300 px-2 py-1 text-sm lg:col-span-1"
                                onBlur={(event) =>
                                  void updateHourBlockDeadlineWithTaskSync(block, event.target.value)
                                }
                              />
                              {block.assignees.length > 0 ? (
                                <div className="col-span-2 flex flex-wrap gap-1 lg:col-span-4">
                                  {block.assignees.map((name) => (
                                    <span key={name} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </article>
                              ))}
                            </div>
                          </section>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500">{t("Geen uurblokken voor deze dag.")}</p>
                        )}
                      </div>
                    </section>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">{t("Nog geen aankomende uurblokken.")}</p>
                )}
              </div>
            </div>
          ) : null}
        </section>

        {tab !== "thoughts" ? (
        <aside className="order-1 flex flex-col gap-4 lg:order-2">
          <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${dayOverviewCardClass}`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-slate-900">{t("Dagoverzicht")}</h2>
              <select
                value={todoDay}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700 sm:w-auto"
                onChange={(event) => setTodoDay(event.target.value as Weekday)}
              >
                {orderedWeekdays.map((day) => (
                  <option key={day} value={day}>
                    {weekdayLabels[day]}{weekdayDateMap[day] ? ` (${weekdayDateMap[day]})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <p className="mt-1 text-xs text-slate-500">
              {t("Taken")} {todayDoneCount}/{todayTasks.length} {t("Klaar").toLowerCase()} • {t("Uurblokken")} {dayHourBlocks.length} • {t("Urenregistratie")} {dayHoursTotal}u
            </p>

            <div className={dayOverviewBodyClass}>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{t("Taken")}</p>
                {todayTasks.length ? (
                  todayTasks.map((task) => (
                    <label
                      key={task.id}
                      className="mb-2 flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2"
                    >
                      <input
                        type="checkbox"
                        checked={task.status === "klaar"}
                        onChange={(event) =>
                          void sendMutation(
                            `/api/tasks/${task.id}`,
                            "PATCH",
                            {
                              status: event.target.checked ? "klaar" : "open",
                              expectedUpdatedAt: task.updatedAt,
                            },
                            t("To-do status bijgewerkt."),
                            { localUpdate: true, silent: true },
                          )
                        }
                        className="mt-0.5"
                      />
                      <span className={`text-sm ${task.status === "klaar" ? "text-slate-400 line-through" : "text-slate-800"}`}>
                        {task.title}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">{t("Geen taken voor deze dag.")}</p>
                )}
              </div>

              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{t("Uurblokken")}</p>
                {selectedDayIsToday ? (
                  <p className="mb-2 text-xs text-blue-700">{t("Realtime")}: {liveNowAmsterdam}</p>
                ) : null}
                {dayHourBlocks.length ? (
                  dayHourBlocks.map((block) => (
                    <div
                      key={block.id}
                      className={`mb-2 rounded-lg border p-2 text-sm transition-colors ${
                        selectedDayIsToday && isNowInsideBlock(block.timeStart, block.timeEnd, nowMinutesAmsterdam)
                          ? "border-blue-300 bg-blue-50 ring-2 ring-blue-200"
                          : "border-slate-100 bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-slate-800">
                          {block.timeStart} - {block.timeEnd}
                        </p>
                        {selectedDayIsToday && isNowInsideBlock(block.timeStart, block.timeEnd, nowMinutesAmsterdam) ? (
                          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                            {t("Nu")}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-slate-600">
                        {block.taskText || t("Geen taak")} • {block.projectText || t("Geen project")}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">{t("Geen uurblokken voor deze dag.")}</p>
                )}
              </div>

              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{t("Urenregistratie")}</p>
                {dayHourEntries.length ? (
                  dayHourEntries.map((entry) => (
                    <div key={entry.id} className="mb-2 rounded-lg border border-slate-100 bg-slate-50 p-2 text-sm">
                      <p className="font-medium text-slate-800">{entry.hoursDecimal}u</p>
                      <p className="text-slate-600">
                        {entry.projectName || t("Onbekend project")} • {entry.noteText || t("Geen notitie")}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">{t("Geen urenregistratie voor deze dag.")}</p>
                )}
              </div>
            </div>
          </div>

          {notice ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {notice}
            </div>
          ) : null}

          {error ? <ApiError message={error} /> : null}

          {inlineFeedback ? (
            <div
              className={`rounded-xl border px-3 py-2 text-xs transition-all duration-300 ${
                inlineFeedback.status === "saving"
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : inlineFeedback.status === "saved"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : inlineFeedback.status === "queued"
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : "border-red-300 bg-red-50 text-red-700"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span>{inlineFeedback.message}</span>
                {inlineFeedback.status === "saving" ? (
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
                ) : (
                  <span className="text-[10px] uppercase tracking-wide">sync</span>
                )}
              </div>
            </div>
          ) : null}

          <div className="hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:block">
            <h2 className="text-sm font-semibold text-slate-900">{t("Historie")}</h2>
            <div className="mt-3 max-h-[360px] space-y-3 overflow-auto">
              {payload?.history?.length ? (
                payload.history.map((item: TaskHistory) => (
                  <article key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">
                      {new Date(item.createdAt).toLocaleString(locale, { timeZone: "Europe/Amsterdam" })}
                    </p>
                    <p className="mt-1 text-sm text-slate-800">{item.noteText}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.actor}</p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-slate-500">{t("Nog geen historie.")}</p>
              )}
            </div>
          </div>

          <div className="hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:block">
            <h2 className="text-sm font-semibold text-slate-900">{t("Laatste imports")}</h2>
            <div className="mt-3 space-y-2">
              {payload?.importJobs?.length ? (
                payload.importJobs.slice(0, 6).map((job) => (
                  <div key={job.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <p className="font-medium">{job.fileName}</p>
                    <p>
                      {job.provider} • {job.status}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">{t("Nog geen imports.")}</p>
              )}
            </div>
          </div>
        </aside>
        ) : null}

        {tab !== "thoughts" ? (
        <div className="order-3 space-y-4 lg:hidden">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">{t("Historie")}</h2>
            <div className="mt-3 max-h-[360px] space-y-3 overflow-auto">
              {payload?.history?.length ? (
                payload.history.map((item: TaskHistory) => (
                  <article key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">
                      {new Date(item.createdAt).toLocaleString(locale, { timeZone: "Europe/Amsterdam" })}
                    </p>
                    <p className="mt-1 text-sm text-slate-800">{item.noteText}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.actor}</p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-slate-500">{t("Nog geen historie.")}</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">{t("Laatste imports")}</h2>
            <div className="mt-3 space-y-2">
              {payload?.importJobs?.length ? (
                payload.importJobs.slice(0, 6).map((job) => (
                  <div key={job.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <p className="font-medium">{job.fileName}</p>
                    <p>
                      {job.provider} • {job.status}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">{t("Nog geen imports.")}</p>
              )}
            </div>
          </div>
        </div>
        ) : null}
      </div>

      {showMultiWeekBlockModal ? (
        <MultiWeekPlanModal
          mode="block"
          language={language}
          currentWeekMonday={payload?.week?.startDate ?? todayIsoForTimezone("Europe/Amsterdam")}
          onClose={() => setShowMultiWeekBlockModal(false)}
          onSubmit={async (formPayload) => {
            const { response, json } = await fetchJsonWithTimeout<{
              data?: { count: number };
              error?: string;
            }>(
              "/api/hour-blocks/multi-week",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formPayload),
              },
            );

            if (!response.ok) {
              throw new Error((json as { error?: string }).error ?? "Aanmaken mislukt.");
            }

            const count = (json as { data?: { count: number } }).data?.count ?? 0;
            setNotice(
              language === "en"
                ? `${count} block${count === 1 ? "" : "s"} added.`
                : `${count} uurblok${count === 1 ? "" : "ken"} aangemaakt.`,
            );
            await loadData(activeWeekId);
          }}
        />
      ) : null}

      {showMultiWeekModal ? (
        <MultiWeekPlanModal
          language={language}
          currentWeekMonday={payload?.week?.startDate ?? todayIsoForTimezone("Europe/Amsterdam")}
          onClose={() => setShowMultiWeekModal(false)}
          onSubmit={async (formPayload) => {
            const { response, json } = await fetchJsonWithTimeout<{
              data?: { count: number };
              error?: string;
            }>(
              "/api/tasks/multi-week",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formPayload),
              },
            );

            if (!response.ok) {
              throw new Error((json as { error?: string }).error ?? "Aanmaken mislukt.");
            }

            const count = (json as { data?: { count: number } }).data?.count ?? 0;
            setNotice(
              language === "en"
                ? `${count} task${count === 1 ? "" : "s"} added.`
                : `${count} taak${count === 1 ? "" : "en"} aangemaakt.`,
            );
            await loadData(activeWeekId);
          }}
        />
      ) : null}

      {showNotesExportModal ? (
        <NotesExportModal
          language={language}
          timezone={timezone}
          onClose={() => setShowNotesExportModal(false)}
        />
      ) : null}

      {selectedPlannerDayDetail ? (
        <DayDetailModal
          language={language}
          weekdayLabels={weekdayLabels}
          detailDay={detailDay}
          detailDayIso={detailDayIso}
          detailDayLabel={detailDayIso ? formatDayDateLabelForLanguage(detailDayIso) : null}
          weekLabel={selectedPlannerDayDetail.weekLabel}
          liveNowAmsterdam={liveNowAmsterdam}
          detailDoneCount={detailDoneCount}
          detailTasks={detailTasks}
          detailHourBlocksCount={detailHourBlocks.length}
          detailHoursTotal={detailHoursTotal}
          detailTaskForm={detailTaskForm}
          detailTaskComposerExpanded={detailTaskComposerExpanded}
          detailScheduleOptions={detailScheduleOptions}
          detailTaskDeadlineTimeValue={detailTaskDeadlineTimeValue}
          detailGroupedHourBlocks={detailGroupedHourBlocks}
          detailHourEntries={detailHourEntries}
          detailDayIsToday={detailDayIsToday}
          nowMinutesAmsterdam={nowMinutesAmsterdam}
          timeOptions={TIME_OPTIONS}
          formatHourAmount={formatHourAmount}
          isNowInsideBlock={isNowInsideBlock}
          formatDayDateLabel={formatDayDateLabelForLanguage}
          localInputToTimezoneIso={localInputToTimezoneIso}
          onClose={closePlannerDayDetail}
          onToggleComposer={() => {
            setDetailTaskComposerExpanded((prev) => {
              if (prev) {
                setDetailTaskForm({ title: "", info: "", scheduleHint: "", deadlineAt: "", priority: "middel" });
              }
              return !prev;
            });
          }}
          onDetailTaskFormChange={(patch) => setDetailTaskForm((prev) => ({ ...prev, ...patch }))}
          onApplyDetailTaskDeadlineTime={applyDetailTaskDeadlineTime}
          onAddTask={() => addDetailTask()}
          onTaskPatch={patchDetailTask}
          onTaskDelete={deleteDetailTask}
          onNavigateToThought={navigateToThought}
        />
      ) : null}
    </div>
  );
}
