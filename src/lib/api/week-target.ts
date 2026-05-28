import { db } from "@/lib/db/repository";

function buildWeekKey(week: number, year: number): string {
  return `week-${year}-${String(week).padStart(2, "0")}`;
}

export function isoWeekNumberFromDate(dateIso: string): { week: number; year: number } {
  const date = new Date(`${dateIso}T00:00:00Z`);
  const tmp = new Date(date);
  const dayNumber = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNumber);
  const year = tmp.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { week, year };
}

export function isoWeekRange(week: number, year: number): { startDate: string; endDate: string } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));

  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    startDate: monday.toISOString().slice(0, 10),
    endDate: sunday.toISOString().slice(0, 10),
  };
}

export async function ensureWeekForDate(dateIso: string) {
  const existing = (await db.listWeeks()).find((week) => week.startDate <= dateIso && week.endDate >= dateIso);
  if (existing) {
    return existing;
  }

  const { week, year } = isoWeekNumberFromDate(dateIso);
  const range = isoWeekRange(week, year);

  return db.upsertWeek({
    weekKey: buildWeekKey(week, year),
    weekLabel: `Week ${week}`,
    startDate: range.startDate,
    endDate: range.endDate,
  });
}
