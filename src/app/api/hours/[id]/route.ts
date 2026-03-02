import { ensureAuth } from "@/lib/api/guards";
import { ensureWeekForDate } from "@/lib/api/week-target";
import { ok, parseError, fail } from "@/lib/api/http";
import { hourEntryPatchSchema } from "@/lib/api/schemas";
import { weekdayFromIsoDate } from "@/lib/db/helpers";
import { db } from "@/lib/db/repository";
import type { HourEntryPatch } from "@/lib/db/types";

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
    const payloadRaw = hourEntryPatchSchema.parse(body);
    const { expectedUpdatedAt, ...payloadRawWithoutExpected } = payloadRaw;
    const payload: HourEntryPatch = { ...payloadRawWithoutExpected };
    let dayDateForWeekMove: string | null = null;

    if (payload.dayDate) {
      const derivedWeekday = weekdayFromIsoDate(payload.dayDate);
      if (!derivedWeekday) {
        return fail("Kies een werkdag (maandag t/m vrijdag) voor urenregistratie.", 400);
      }
      payload.weekday = derivedWeekday;
      dayDateForWeekMove = payload.dayDate;
    }

    if (expectedUpdatedAt) {
      const current = await db.getHourEntryById(params.id);
      if (!current) {
        return fail("Urenregel niet gevonden.", 404);
      }
      if (current.updatedAt !== expectedUpdatedAt) {
        return fail("Conflict: urenregel is op een ander apparaat gewijzigd.", 409);
      }
    }

    if (dayDateForWeekMove) {
      const targetWeek = await ensureWeekForDate(dayDateForWeekMove);
      payload.weekId = targetWeek.id;
    }

    const updated = await db.updateHourEntry(params.id, payload, "user");
    if (!updated) {
      return fail("Urenregel niet gevonden.", 404);
    }

    const summary = await db.getHoursSummary(updated.weekId);
    return ok({ entry: updated, summary, weekId: updated.weekId });
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

    const deleted = await db.deleteHourEntry(params.id, "user");
    if (!deleted) {
      return fail("Urenregel niet gevonden.", 404);
    }

    return ok({ deleted: true });
  } catch (error) {
    return parseError(error);
  }
}
