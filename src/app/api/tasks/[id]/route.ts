import { ensureAuth } from "@/lib/api/guards";
import {
  syncDeadlineAcrossTaskProject,
  syncStatusAcrossTaskProject,
  syncTaskLabelAcrossWeek,
} from "@/lib/api/deadline-sync";
import { ensureWeekForDate } from "@/lib/api/week-target";
import { ok, parseError, fail } from "@/lib/api/http";
import { taskPatchSchema } from "@/lib/api/schemas";
import { normalizeText, parseDateMaybe, weekdayFromIsoDate } from "@/lib/db/helpers";
import { db } from "@/lib/db/repository";
import type { DayTaskPatch } from "@/lib/db/types";

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
    const patchPayload = taskPatchSchema.parse(body);
    const { expectedUpdatedAt, ...patch } = patchPayload;
    const normalizedPatch: DayTaskPatch = { ...patch };
    let deadlineDateForWeekMove: string | null = null;
    let currentTask = null as Awaited<ReturnType<typeof db.getTaskById>> | null;

    if (patch.deadlineAt !== undefined) {
      const normalizedDeadlineAt = parseDateMaybe(patch.deadlineAt);
      if (patch.deadlineAt && !normalizedDeadlineAt) {
        return fail("Ongeldige deadline datum.", 400);
      }
      normalizedPatch.deadlineAt = normalizedDeadlineAt;
      if (normalizedDeadlineAt) {
        deadlineDateForWeekMove = normalizedDeadlineAt.slice(0, 10);
        const derivedWeekday = weekdayFromIsoDate(deadlineDateForWeekMove);
        if (derivedWeekday) {
          normalizedPatch.weekday = derivedWeekday;
        }
      }
    }

    if (expectedUpdatedAt || patch.title !== undefined) {
      currentTask = await db.getTaskById(params.id);
      if (!currentTask) {
        return fail("Taak niet gevonden.", 404);
      }
    }

    if (expectedUpdatedAt && (!currentTask || currentTask.updatedAt !== expectedUpdatedAt)) {
      return fail("Conflict: taak is op een ander apparaat gewijzigd.", 409);
    }

    if (deadlineDateForWeekMove) {
      const targetWeek = await ensureWeekForDate(deadlineDateForWeekMove);
      normalizedPatch.weekId = targetWeek.id;
    }

    const updated = await db.updateTask(params.id, normalizedPatch, "user");
    if (!updated) {
      return fail("Taak niet gevonden.", 404);
    }

    if (patch.deadlineAt !== undefined) {
      await syncDeadlineAcrossTaskProject({
        weekId: updated.weekId,
        sourceType: "task",
        sourceId: updated.id,
        deadlineAt: updated.deadlineAt,
        title: updated.title,
        info: updated.info,
      });
    }

    if (patch.title !== undefined) {
      await syncTaskLabelAcrossWeek({
        weekId: updated.weekId,
        sourceType: "task",
        sourceId: updated.id,
        previousLabel: currentTask?.title ?? null,
        nextLabel: updated.title,
      });
    }

    if (patch.status !== undefined) {
      await syncStatusAcrossTaskProject({
        weekId: updated.weekId,
        sourceType: "task",
        sourceId: updated.id,
        weekday: updated.weekday,
        status: updated.status,
        title: updated.title,
      });
    }

    return ok({ task: updated, weekId: updated.weekId });
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
    const existing = await db.getTaskById(params.id);
    if (!existing) {
      return fail("Taak niet gevonden.", 404);
    }

    const deleted = await db.deleteTask(params.id, "user");
    if (!deleted) {
      return fail("Taak niet gevonden.", 404);
    }

    const removedTaskKey = normalizeText(existing.title);
    if (removedTaskKey) {
      const aggregate = await db.getWeekAggregate(existing.weekId);
      if (aggregate) {
        const relatedBlocks = aggregate.hourBlocks.filter(
          (block) =>
            block.weekday === existing.weekday &&
            normalizeText(block.taskText) === removedTaskKey,
        );

        for (const block of relatedBlocks) {
          await db.updateHourBlock(block.id, { taskText: "" }, "system");
        }
      }
    }

    return ok({ deleted: true, weekId: existing.weekId });
  } catch (error) {
    return parseError(error);
  }
}
