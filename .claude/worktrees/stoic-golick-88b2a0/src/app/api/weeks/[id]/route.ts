import { ok, parseError, fail } from "@/lib/api/http";
import { ensureAuth } from "@/lib/api/guards";
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
    const aggregate = await db.getWeekAggregate(params.id);
    if (!aggregate) {
      return fail("Week niet gevonden.", 404);
    }

    const hourSummary = await db.getHoursSummary(params.id);
    return ok({
      ...aggregate,
      hourSummary,
    });
  } catch (error) {
    return parseError(error);
  }
}
