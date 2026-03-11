import { ensureAuth } from "@/lib/api/guards";
import { parseError } from "@/lib/api/http";
import { db } from "@/lib/db/repository";

type NoteExportItem = {
  dayDate: string;
  weekday: string;
  weekLabel: string;
  weekKey: string;
  projectName: string;
  noteText: string;
};

function formatExportDate(date: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

export async function GET() {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const weeks = await db.listWeeks();
    const aggregates = await Promise.all(weeks.map((week) => db.getWeekAggregate(week.id)));

    const notes = aggregates
      .filter((aggregate): aggregate is NonNullable<(typeof aggregates)[number]> => Boolean(aggregate))
      .flatMap((aggregate) =>
        aggregate.hourEntries
          .filter((entry) => entry.noteText.trim().length > 0)
          .map<NoteExportItem>((entry) => ({
            dayDate: entry.dayDate,
            weekday: entry.weekday,
            weekLabel: aggregate.week.weekLabel,
            weekKey: aggregate.week.weekKey,
            projectName: entry.projectName.trim(),
            noteText: entry.noteText.trim(),
          })),
      )
      .sort((a, b) => a.dayDate.localeCompare(b.dayDate) || a.weekKey.localeCompare(b.weekKey) || a.projectName.localeCompare(b.projectName, "nl"));

    const output = notes.length
      ? notes
          .map((item) =>
            [
              `${formatExportDate(item.dayDate)} (${item.weekday})`,
              item.projectName ? `Project: ${item.projectName}` : null,
              `Week: ${item.weekLabel}`,
              item.noteText,
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n\n--------------------\n\n")
      : "Geen reflecties of notities gevonden.";

    const today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    return new Response(output, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="reflecties-notities-${today}.txt"`,
      },
    });
  } catch (error) {
    return parseError(error);
  }
}
