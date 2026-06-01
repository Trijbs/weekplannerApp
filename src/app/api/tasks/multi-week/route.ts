import { ensureAuth } from "@/lib/api/guards";
import { ok, parseError, fail } from "@/lib/api/http";
import { ensureWeekForDate } from "@/lib/api/week-target";
import { db } from "@/lib/db/repository";
import { WEEKDAYS } from "@/lib/db/types";
import type { Weekday, Priority } from "@/lib/db/types";
import { z } from "zod";

const weekdaySchema = z.enum(["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]);
const prioritySchema = z.enum(["hoog", "middel", "laag"]);

const multiWeekTaskSchema = z.object({
  title: z.string().min(1).max(180),
  info: z.string().max(600).optional().default(""),
  priority: prioritySchema.optional().default("middel"),
  // Each entry: weekOffset (0 = current week, 1 = next, …) + which days within that week
  entries: z
    .array(
      z.object({
        weekOffset: z.number().int().min(0).max(52),
        weekdays: z.array(weekdaySchema).min(1),
      }),
    )
    .min(1)
    .max(52),
});

function mondayOfCurrentIsoWeek(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay() || 7; // 1 = Mon, 7 = Sun
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - (dayOfWeek - 1));
  return monday.toISOString().slice(0, 10);
}

function addWeeks(isoDate: string, weeks: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/** Given the Monday of a week and a weekday name, return the ISO date for that day. */
function isoDateForWeekday(mondayIso: string, weekday: Weekday): string {
  const offset = WEEKDAYS.indexOf(weekday); // 0=mon … 6=sun
  const d = new Date(`${mondayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const body = await request.json();
    const payload = multiWeekTaskSchema.parse(body);

    if (!payload.entries.length) {
      return fail("Geen weken geselecteerd.", 400);
    }

    const currentMonday = mondayOfCurrentIsoWeek();
    const created: Array<{ weekId: string; weekday: Weekday; dayDate: string; taskId: string }> = [];

    for (const entry of payload.entries) {
      const weekMonday = addWeeks(currentMonday, entry.weekOffset);
      for (const weekday of entry.weekdays) {
        const dayDate = isoDateForWeekday(weekMonday, weekday);
        const week = await ensureWeekForDate(dayDate);

        const task = await db.createTask(
          week.id,
          {
            weekday,
            title: payload.title,
            info: payload.info,
            priority: payload.priority as Priority,
            status: "open",
            position: 0,
            source: "manual",
          },
          "user",
        );

        created.push({
          weekId: week.id,
          weekday,
          dayDate,
          taskId: task.id,
        });
      }
    }

    return ok({ created, count: created.length }, { status: 201 });
  } catch (error) {
    return parseError(error);
  }
}
