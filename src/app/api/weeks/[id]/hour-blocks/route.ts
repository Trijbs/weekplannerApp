import { ensureAuth } from "@/lib/api/guards";
import {
  consolidateDuplicateTasksInWeek,
  ensureTaskFromHourBlock,
  syncDeadlineAcrossTaskProject,
} from "@/lib/api/deadline-sync";
import { ensureWeekForDate } from "@/lib/api/week-target";
import { ok, parseError, fail } from "@/lib/api/http";
import { hourBlockCreateSchema } from "@/lib/api/schemas";
import { parseDateMaybe, weekdayFromIsoDate } from "@/lib/db/helpers";
import { db } from "@/lib/db/repository";

function timeToMinutes(time: string): number {
  const [hoursPart, minutesPart] = time.split(":");
  return Number(hoursPart) * 60 + Number(minutesPart);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const params = "then" in context.params ? await context.params : context.params;
    const week = await db.getWeekById(params.id);
    if (!week) {
      return fail("Week niet gevonden.", 404);
    }
    const canonicalWeekId = (await db.getWeekAggregate(params.id))?.week.id ?? params.id;

    const body = await request.json();
    const payload = hourBlockCreateSchema.parse(body);
    if (timeToMinutes(payload.timeEnd) <= timeToMinutes(payload.timeStart)) {
      return fail("Eindtijd moet later zijn dan begintijd.", 400);
    }

    let normalizedWeekday = payload.weekday;
    const normalizedDayDate = payload.dayDate ?? null;
    let targetWeekId = canonicalWeekId;
    if (normalizedDayDate) {
      const derivedWeekday = weekdayFromIsoDate(normalizedDayDate);
      if (!derivedWeekday) {
        return fail("Uurblok datum moet op een werkdag vallen (maandag t/m vrijdag).", 400);
      }
      normalizedWeekday = derivedWeekday;
      const targetWeek = await ensureWeekForDate(normalizedDayDate);
      targetWeekId = targetWeek.id;
    }

    const normalizedDeadlineAt = parseDateMaybe(payload.deadlineAt);
    if (payload.deadlineAt && !normalizedDeadlineAt) {
      return fail("Ongeldige deadline datum.", 400);
    }

    const created = await db.createHourBlock(
      targetWeekId,
      {
        ...payload,
        weekday: normalizedWeekday,
        dayDate: normalizedDayDate,
        deadlineAt: normalizedDeadlineAt,
      },
      "user",
    );

    const syncedTask = await ensureTaskFromHourBlock({
      weekId: targetWeekId,
      weekday: created.weekday,
      taskText: created.taskText,
      projectText: created.projectText,
      deadlineAt: created.deadlineAt,
    });

    await syncDeadlineAcrossTaskProject({
      weekId: targetWeekId,
      sourceType: "hour_block",
      sourceId: created.id,
      deadlineAt: created.deadlineAt,
      taskText: created.taskText,
      projectText: created.projectText,
    });

    await consolidateDuplicateTasksInWeek(targetWeekId);

    return ok({ block: created, task: syncedTask ?? undefined, weekId: targetWeekId }, { status: 201 });
  } catch (error) {
    return parseError(error);
  }
}
