import type { HourEntry, HoursSummary, Weekday } from "@/lib/db/types";

export function buildHoursSummary(entries: HourEntry[]): HoursSummary {
  const weeklyTotalHours = Number(entries.reduce((sum, entry) => sum + entry.hoursDecimal, 0).toFixed(2));

  const projectMap = new Map<string, number>();
  const dayMap = new Map<string, { dayDate: string; weekday: Weekday; totalHours: number }>();

  for (const entry of entries) {
    const projectName = entry.projectName.trim() || "Onbekend";
    projectMap.set(projectName, Number(((projectMap.get(projectName) ?? 0) + entry.hoursDecimal).toFixed(2)));

    const dayKey = `${entry.dayDate}__${entry.weekday}`;
    const current = dayMap.get(dayKey);
    if (!current) {
      dayMap.set(dayKey, { dayDate: entry.dayDate, weekday: entry.weekday, totalHours: Number(entry.hoursDecimal.toFixed(2)) });
    } else {
      current.totalHours = Number((current.totalHours + entry.hoursDecimal).toFixed(2));
    }
  }

  const perProjectTotals = [...projectMap.entries()]
    .map(([projectName, totalHours]) => ({ projectName, totalHours }))
    .sort((a, b) => b.totalHours - a.totalHours || a.projectName.localeCompare(b.projectName));

  const perDayTotals = [...dayMap.values()].sort((a, b) => a.dayDate.localeCompare(b.dayDate));

  return { weeklyTotalHours, perProjectTotals, perDayTotals };
}
