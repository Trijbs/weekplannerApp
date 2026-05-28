import { ensureAuth } from "@/lib/api/guards";
import {
  consolidateDuplicateTasksInWeek,
  ensureTaskFromHourBlock,
  syncDeadlineAcrossTaskProject,
  syncStatusAcrossTaskProject,
  syncTaskLabelAcrossWeek,
} from "@/lib/api/deadline-sync";
import { ensureWeekForDate } from "@/lib/api/week-target";
import { ok, parseError, fail } from "@/lib/api/http";
import { hourBlockPatchSchema } from "@/lib/api/schemas";
import { parseDateMaybe, weekdayFromIsoDate } from "@/lib/db/helpers";
import { db } from "@/lib/db/repository";
import type { HourBlockPatch } from "@/lib/db/types";

function timeToMinutes(time: string): number {
  const [hoursPart, minutesPart] = time.split(":");
  return Number(hoursPart) * 60 + Number(minutesPart);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const params = "then" in context.params ? await context.params : context.params;
    const body = await request.json();
    const payloadRaw = hourBlockPatchSchema.parse(body);
    const { expectedUpdatedAt, ...payload } = payloadRaw;
    const normalizedPayload: HourBlockPatch = { ...payload };
    let dayDateForWeekMove: string | null = null;
    const needsCurrent =
      Boolean(expectedUpdatedAt) ||
      payload.timeStart !== undefined ||
      payload.timeEnd !== undefined ||
      payload.taskText !== undefined;
    let currentBlock = null as Awaited<ReturnType<typeof db.getHourBlockById>> | null;

    if (payload.deadlineAt !== undefined) {
      const normalizedDeadlineAt = parseDateMaybe(payload.deadlineAt);
      if (payload.deadlineAt && !normalizedDeadlineAt) {
        return fail("Ongeldige deadline datum.", 400);
      }
      normalizedPayload.deadlineAt = normalizedDeadlineAt;
    }

    if (payload.dayDate !== undefined) {
      if (payload.dayDate) {
        const derivedWeekday = weekdayFromIsoDate(payload.dayDate);
        if (!derivedWeekday) {
          return fail("Uurblok datum is niet geldig.", 400);
        }
        dayDateForWeekMove = payload.dayDate;
        normalizedPayload.dayDate = payload.dayDate;
        normalizedPayload.weekday = derivedWeekday;
      } else {
        normalizedPayload.dayDate = null;
      }
    }

    if (needsCurrent) {
      currentBlock = await db.getHourBlockById(params.id);
      if (!currentBlock) {
        return fail("Uurblok niet gevonden.", 404);
      }
    }

    if (expectedUpdatedAt && currentBlock && currentBlock.updatedAt !== expectedUpdatedAt) {
      return fail("Conflict: uurblok is op een ander apparaat gewijzigd.", 409);
    }

    if (dayDateForWeekMove) {
      const targetWeek = await ensureWeekForDate(dayDateForWeekMove);
      normalizedPayload.weekId = targetWeek.id;
    }

    if (currentBlock && (payload.timeStart !== undefined || payload.timeEnd !== undefined)) {
      const nextStart = payload.timeStart ?? currentBlock.timeStart;
      const nextEnd = payload.timeEnd ?? currentBlock.timeEnd;
      if (timeToMinutes(nextEnd) <= timeToMinutes(nextStart)) {
        return fail("Eindtijd moet later zijn dan begintijd.", 400);
      }
    }

    const updated = await db.updateHourBlock(params.id, normalizedPayload, "user");
    if (!updated) {
      if (needsCurrent) {
        return fail("Uurblok niet gevonden.", 404);
      }
      const existing = await db.getHourBlockById(params.id);
      if (!existing) {
        return fail("Uurblok niet gevonden.", 404);
      }
    }

    if (updated && payload.deadlineAt !== undefined) {
      await syncDeadlineAcrossTaskProject({
        weekId: updated.weekId,
        sourceType: "hour_block",
        sourceId: updated.id,
        deadlineAt: updated.deadlineAt,
        taskText: updated.taskText,
        projectText: updated.projectText,
      });
    }

    if (updated && payload.taskText !== undefined) {
      await syncTaskLabelAcrossWeek({
        weekId: updated.weekId,
        sourceType: "hour_block",
        sourceId: updated.id,
        previousLabel: currentBlock?.taskText ?? null,
        nextLabel: updated.taskText,
      });
    }

    const syncedTask = updated
      ? await ensureTaskFromHourBlock({
          weekId: updated.weekId,
          weekday: updated.weekday,
          taskText: updated.taskText,
          projectText: updated.projectText,
          deadlineAt: updated.deadlineAt,
          status: updated.status,
        })
      : null;

    if (updated && (payload.status !== undefined || payload.taskText !== undefined)) {
      await syncStatusAcrossTaskProject({
        weekId: updated.weekId,
        sourceType: "hour_block",
        sourceId: updated.id,
        weekday: updated.weekday,
        status: updated.status,
        taskText: updated.taskText,
      });
    }

    if (updated) {
      await consolidateDuplicateTasksInWeek(updated.weekId);
    }

    if (!updated) {
      return fail("Uurblok niet gevonden.", 404);
    }

    return ok({ block: updated, task: syncedTask ?? undefined, weekId: updated.weekId });
  } catch (error) {
    return parseError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const params = "then" in context.params ? await context.params : context.params;
    const existing = await db.getHourBlockById(params.id);
    if (!existing) {
      return fail("Uurblok niet gevonden.", 404);
    }

    const deleted = await db.deleteHourBlock(params.id, "user");

    if (!deleted) {
      return fail("Uurblok niet gevonden.", 404);
    }

    await syncStatusAcrossTaskProject({
      weekId: existing.weekId,
      sourceType: "hour_block",
      sourceId: existing.id,
      weekday: existing.weekday,
      status: existing.status,
      taskText: existing.taskText,
    });

    return ok({ deleted: true, weekId: existing.weekId });
  } catch (error) {
    return parseError(error);
  }
}
