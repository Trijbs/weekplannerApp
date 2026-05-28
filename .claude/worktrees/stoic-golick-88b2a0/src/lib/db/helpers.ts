import { createHash, randomUUID } from "node:crypto";
import { WEEKDAYS, type ChangeMap, type Weekday } from "@/lib/db/types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(): string {
  return randomUUID();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase();
}

const weekdayAliases: Record<string, Weekday> = {
  ma: "maandag",
  maandag: "maandag",
  di: "dinsdag",
  dinsdag: "dinsdag",
  woe: "woensdag",
  woensdag: "woensdag",
  do: "donderdag",
  donderdag: "donderdag",
  vr: "vrijdag",
  vrij: "vrijdag",
  vrijdag: "vrijdag",
};

export function parseWeekday(input: string): Weekday | null {
  const cleaned = normalizeText(input).replace(/\./g, "");
  return weekdayAliases[cleaned] ?? null;
}

export function isWeekday(input: string): input is Weekday {
  return WEEKDAYS.includes(input as Weekday);
}

export function weekdayFromIsoDate(isoDate: string): Weekday | null {
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
  return null;
}

export function computeDiff(
  beforeValue: Record<string, unknown>,
  afterValue: Record<string, unknown>,
): ChangeMap {
  const changed: ChangeMap = {};
  const keys = new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)]);

  for (const key of keys) {
    const before = beforeValue[key];
    const after = afterValue[key];

    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changed[key] = { before, after };
    }
  }

  return changed;
}

export function hasChanges(changeMap: ChangeMap): boolean {
  return Object.keys(changeMap).length > 0;
}

export function parseDateMaybe(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function formatIsoToLocalInput(value: string | null, timeZone = "Europe/Amsterdam"): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;

  if (year && month && day && hour && minute) {
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  const localYear = date.getFullYear();
  const localMonth = pad(date.getMonth() + 1);
  const localDay = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${localYear}-${localMonth}-${localDay}T${hours}:${minutes}`;
}

export function clampHours(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(24, Number(value.toFixed(2))));
}

export function isoDateForTimezone(timeZone: string): string {
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
