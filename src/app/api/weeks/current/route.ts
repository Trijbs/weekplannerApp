import { ok, parseError, fail } from "@/lib/api/http";
import { ensureAuth } from "@/lib/api/guards";
import { repairWeekConsistencyInBackground } from "@/lib/api/week-repair";
import { ensureCurrentWeekExists } from "@/lib/db/bootstrap";
import { db } from "@/lib/db/repository";

export async function GET(request: Request) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const url = new URL(request.url);
    const weekId = url.searchParams.get("weekId");
    const weekKey = url.searchParams.get("weekKey");

    let week = null;
    if (weekId) {
      week = await db.getWeekById(weekId);
    } else if (weekKey) {
      week = await db.getWeekByKey(weekKey);
    }

    if (!week) {
      week = await ensureCurrentWeekExists();
    }

    repairWeekConsistencyInBackground(week.id);

    const aggregate = await db.getWeekAggregate(week.id);
    if (!aggregate) {
      return fail("Week niet gevonden.", 404);
    }

    const jobs = await db.listImportJobs(10);
    const hourSummary = await db.getHoursSummary(week.id);
    const weeks = await db.listWeeks();

    return ok({
      ...aggregate,
      hourSummary,
      importJobs: jobs,
      weeks,
    });
  } catch (error) {
    return parseError(error);
  }
}
