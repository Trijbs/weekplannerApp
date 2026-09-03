import { ensureAuth } from "@/lib/api/guards";
import { ok, parseError, fail } from "@/lib/api/http";
import { timerStopSchema } from "@/lib/api/schemas";
import { db } from "@/lib/db/repository";

export async function POST(request: Request) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const body = await request.json().catch(() => ({}));
    const payload = timerStopSchema.parse(body);

    const target = payload.entryId
      ? await db.getHourEntryById(payload.entryId)
      : await db.getRunningHourEntry();

    if (!target || target.status !== "running") {
      return fail("Geen lopende timer gevonden.", 404);
    }

    const stopped = await db.stopHourTimer(target.id, "user");
    if (!stopped) {
      return fail("Geen lopende timer gevonden.", 404);
    }

    const summary = await db.getHoursSummary(stopped.weekId);
    return ok({ entry: stopped, summary, weekId: stopped.weekId });
  } catch (error) {
    return parseError(error);
  }
}
