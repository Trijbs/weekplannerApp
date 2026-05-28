import { ensureAuth } from "@/lib/api/guards";
import { syncDeadlineAcrossTaskProject } from "@/lib/api/deadline-sync";
import { ensureWeekForDate } from "@/lib/api/week-target";
import { ok, parseError, fail } from "@/lib/api/http";
import { taskCreateSchema } from "@/lib/api/schemas";
import { parseDateMaybe, weekdayFromIsoDate } from "@/lib/db/helpers";
import { db } from "@/lib/db/repository";

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
    const payload = taskCreateSchema.parse(body);
    const normalizedDeadlineAt = parseDateMaybe(payload.deadlineAt);
    if (payload.deadlineAt && !normalizedDeadlineAt) {
      return fail("Ongeldige deadline datum.", 400);
    }

    let targetWeekId = canonicalWeekId;
    let targetWeekday = payload.weekday;

    if (normalizedDeadlineAt) {
      const deadlineDate = normalizedDeadlineAt.slice(0, 10);
      const derivedWeekday = weekdayFromIsoDate(deadlineDate);
      if (derivedWeekday) {
        targetWeekday = derivedWeekday;
      }

      const targetWeek = await ensureWeekForDate(deadlineDate);
      targetWeekId = targetWeek.id;
    }

    const task = await db.createTask(
      targetWeekId,
      {
        ...payload,
        weekday: targetWeekday,
        deadlineAt: normalizedDeadlineAt,
      },
      "user",
    );

    await syncDeadlineAcrossTaskProject({
      weekId: targetWeekId,
      sourceType: "task",
      sourceId: task.id,
      deadlineAt: task.deadlineAt,
      title: task.title,
      info: task.info,
    });

    return ok({ task, weekId: targetWeekId }, { status: 201 });
  } catch (error) {
    return parseError(error);
  }
}
