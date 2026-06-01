import { ensureAuth } from "@/lib/api/guards";
import { ok, parseError, fail } from "@/lib/api/http";
import { ensureWeekForDate } from "@/lib/api/week-target";
import {
  ensureTaskFromHourBlock,
  syncDeadlineAcrossTaskProject,
  syncStatusAcrossTaskProject,
  consolidateDuplicateTasksInWeek,
} from "@/lib/api/deadline-sync";
import { db } from "@/lib/db/repository";
import { WEEKDAYS } from "@/lib/db/types";
import type { Weekday } from "@/lib/db/types";
import { z } from "zod";

const weekdaySchema = z.enum(["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]);
const taskStatusSchema = z.enum(["open", "bezig", "klaar"]);

const multiWeekBlockSchema = z.object({
  taskText: z.string().max(300).optional().default(""),
  projectText: z.string().max(160).optional().default(""),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/, "Ongeldig begintijdformaat (HH:MM)"),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/, "Ongeldig eindtijdformaat (HH:MM)"),
  status: taskStatusSchema.optional().default("open"),
  assignees: z.array(z.string().max(80)).optional().default([]),
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

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function mondayOfCurrentIsoWeek(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay() || 7;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - (dayOfWeek - 1));
  return monday.toISOString().slice(0, 10);
}

function addWeeks(isoDate: string, weeks: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function isoDateForWeekday(mondayIso: string, weekday: Weekday): string {
  const offset = WEEKDAYS.indexOf(weekday);
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
    const payload = multiWeekBlockSchema.parse(body);

    if (timeToMinutes(payload.timeEnd) <= timeToMinutes(payload.timeStart)) {
      return fail("Eindtijd moet later zijn dan begintijd.", 400);
    }

    const currentMonday = mondayOfCurrentIsoWeek();
    const created: Array<{ weekId: string; weekday: Weekday; dayDate: string; blockId: string }> = [];

    for (const entry of payload.entries) {
      const weekMonday = addWeeks(currentMonday, entry.weekOffset);

      for (const weekday of entry.weekdays) {
        const dayDate = isoDateForWeekday(weekMonday, weekday);
        const week = await ensureWeekForDate(dayDate);

        const block = await db.createHourBlock(
          week.id,
          {
            weekday,
            dayDate,
            timeStart: payload.timeStart,
            timeEnd: payload.timeEnd,
            taskText: payload.taskText,
            projectText: payload.projectText,
            status: payload.status,
            assignees: payload.assignees,
            position: 0,
            source: "manual",
          },
          "user",
        );

        await ensureTaskFromHourBlock({
          weekId: week.id,
          weekday,
          taskText: block.taskText,
          projectText: block.projectText,
          deadlineAt: block.deadlineAt,
          status: block.status,
        });

        await syncDeadlineAcrossTaskProject({
          weekId: week.id,
          sourceType: "hour_block",
          sourceId: block.id,
          deadlineAt: block.deadlineAt,
          taskText: block.taskText,
          projectText: block.projectText,
        });

        await syncStatusAcrossTaskProject({
          weekId: week.id,
          sourceType: "hour_block",
          sourceId: block.id,
          weekday,
          status: block.status,
          taskText: block.taskText,
        });

        await consolidateDuplicateTasksInWeek(week.id);

        created.push({ weekId: week.id, weekday, dayDate, blockId: block.id });
      }
    }

    return ok({ created, count: created.length }, { status: 201 });
  } catch (error) {
    return parseError(error);
  }
}
