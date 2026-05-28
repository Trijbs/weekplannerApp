import { ensureAuth } from "@/lib/api/guards";
import { ensureWeekForDate } from "@/lib/api/week-target";
import { ok, parseError, fail } from "@/lib/api/http";
import { hourEntryCreateSchema } from "@/lib/api/schemas";
import { weekdayFromIsoDate } from "@/lib/db/helpers";
import { db } from "@/lib/db/repository";

export async function GET(
  _request: Request,
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

    const data = await db.getHoursByWeek(params.id);
    return ok(data);
  } catch (error) {
    return parseError(error);
  }
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

    const body = await request.json();
    const payload = hourEntryCreateSchema.parse(body);
    const derivedWeekday = weekdayFromIsoDate(payload.dayDate);
    if (!derivedWeekday) {
      return fail("Kies een geldige dag voor urenregistratie.", 400);
    }
    const targetWeek = await ensureWeekForDate(payload.dayDate);
    const targetWeekId = targetWeek.id;

    const created = await db.createHourEntry(
      targetWeekId,
      {
        ...payload,
        weekday: derivedWeekday,
      },
      "user",
    );
    const summary = await db.getHoursSummary(targetWeekId);

    return ok({ entry: created, summary, weekId: targetWeekId }, { status: 201 });
  } catch (error) {
    return parseError(error);
  }
}
