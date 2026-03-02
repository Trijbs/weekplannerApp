import { ensureAuth } from "@/lib/api/guards";
import { ok, parseError, fail } from "@/lib/api/http";
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

    const summary = await db.getHoursSummary(params.id);
    return ok(summary);
  } catch (error) {
    return parseError(error);
  }
}
