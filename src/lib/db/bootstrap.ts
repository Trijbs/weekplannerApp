import { db } from "@/lib/db/repository";
import { isoDateForTimezone } from "@/lib/db/helpers";

function buildWeekKey(week: number, year: number): string {
  return `week-${year}-${String(week).padStart(2, "0")}`;
}

function currentWeekRange(timeZone: string) {
  const todayIso = isoDateForTimezone(timeZone);
  const today = new Date(`${todayIso}T00:00:00Z`);
  const day = today.getUTCDay() || 7;
  const mondayOffset = 1 - day;

  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() + mondayOffset);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    startDate: monday.toISOString().slice(0, 10),
    endDate: sunday.toISOString().slice(0, 10),
  };
}

function weekNumberFromIsoDate(dateIso: string): { week: number; year: number } {
  const target = new Date(`${dateIso}T00:00:00Z`);
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  const week = 1 + Math.round(diff / 604800000);
  const year = target.getUTCFullYear();
  return { week, year };
}

export async function ensureCurrentWeekExists() {
  const current = await db.getCurrentWeek();
  if (current) {
    return current;
  }

  const timeZone = "Europe/Amsterdam";
  const todayIso = isoDateForTimezone(timeZone);
  const range = currentWeekRange(timeZone);
  const { week, year } = weekNumberFromIsoDate(todayIso);

  return db.upsertWeek({
    weekKey: buildWeekKey(week, year),
    weekLabel: `Week ${week}`,
    startDate: range.startDate,
    endDate: range.endDate,
    sourceFileName: null,
    sourceFileId: null,
    sourceModifiedAt: null,
  });
}
