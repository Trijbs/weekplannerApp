import { ensureAuth } from "@/lib/api/guards";
import { ensureWeekForDate } from "@/lib/api/week-target";
import { ok, parseError, fail } from "@/lib/api/http";
import { timerStartSchema } from "@/lib/api/schemas";
import { weekdayFromIsoDate } from "@/lib/db/helpers";
import { db } from "@/lib/db/repository";

export async function GET() {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const running = await db.getRunningHourEntry();
    return ok({ running });
  } catch (error) {
    return parseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const body = await request.json();
    const payload = timerStartSchema.parse(body);
    const derivedWeekday = weekdayFromIsoDate(payload.dayDate);
    if (!derivedWeekday) {
      return fail("Kies een geldige dag voor de timer.", 400);
    }

    // Projectnaam automatisch overnemen van gekoppeld blok of taak.
    let projectName = payload.projectName;
    let noteText = payload.noteText;
    if (payload.hourBlockId) {
      const block = await db.getHourBlockById(payload.hourBlockId);
      if (block) {
        projectName = projectName || block.projectText;
        noteText = noteText || block.taskText;
      }
    } else if (payload.dayTaskId) {
      const task = await db.getTaskById(payload.dayTaskId);
      if (task) {
        noteText = noteText || task.title;
      }
    }

    const targetWeek = await ensureWeekForDate(payload.dayDate);
    const started = await db.startHourTimer(
      targetWeek.id,
      {
        dayDate: payload.dayDate,
        weekday: derivedWeekday,
        projectName,
        noteText,
        hourBlockId: payload.hourBlockId,
        dayTaskId: payload.dayTaskId,
      },
      "user",
    );

    const summary = await db.getHoursSummary(targetWeek.id);
    return ok({ entry: started, summary, weekId: targetWeek.id }, { status: 201 });
  } catch (error) {
    return parseError(error);
  }
}
