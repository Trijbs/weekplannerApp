import { ensureAuth } from "@/lib/api/guards";
import { fail, parseError } from "@/lib/api/http";
import { ensureCurrentWeekExists } from "@/lib/db/bootstrap";
import { db } from "@/lib/db/repository";

function esc(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function line(values: Array<string | number | null | undefined>): string {
  return values.map((value) => esc(value)).join(",");
}

export async function GET(request: Request) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const url = new URL(request.url);
    const weekId = url.searchParams.get("weekId");

    const week = weekId ? await db.getWeekById(weekId) : await ensureCurrentWeekExists();
    if (!week) {
      return fail("Week niet gevonden.", 404);
    }

    const aggregate = await db.getWeekAggregate(week.id);
    if (!aggregate) {
      return fail("Weekdata niet gevonden.", 404);
    }

    const rows: string[] = [];

    rows.push(line(["type", "week_key", "week_label", "weekday", "datum", "start", "einde", "titel", "info", "project", "deadline", "prioriteit", "status", "uren", "notitie"]));

    for (const task of aggregate.tasks) {
      rows.push(
        line([
          "task",
          week.weekKey,
          week.weekLabel,
          task.weekday,
          "",
          "",
          "",
          task.title,
          task.info,
          "",
          task.deadlineAt,
          task.priority,
          task.status,
          "",
          "",
        ]),
      );
    }

    for (const block of aggregate.hourBlocks) {
      rows.push(
        line([
          "hour_block",
          week.weekKey,
          week.weekLabel,
          block.weekday,
          block.dayDate,
          block.timeStart,
          block.timeEnd,
          block.taskText,
          "",
          block.projectText,
          block.deadlineAt,
          "",
          block.status,
          "",
          "",
        ]),
      );
    }

    for (const entry of aggregate.hourEntries) {
      rows.push(
        line([
          "hour_entry",
          week.weekKey,
          week.weekLabel,
          entry.weekday,
          entry.dayDate,
          "",
          "",
          "",
          "",
          entry.projectName,
          "",
          "",
          "",
          entry.hoursDecimal,
          entry.noteText,
        ]),
      );
    }

    return new Response(rows.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="weekplanner-${week.weekKey}.csv"`,
      },
    });
  } catch (error) {
    return parseError(error);
  }
}
