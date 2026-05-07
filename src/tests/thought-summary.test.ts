import { describe, expect, it } from "vitest";
import { thoughtMessageCreateSchema, thoughtThreadCreateSchema } from "@/lib/api/schemas";
import { summarizeThoughtMessages } from "@/lib/thoughts/summary";
import type { ThoughtMessage } from "@/lib/db/types";

function message(bodyText: string): ThoughtMessage {
  return {
    id: crypto.randomUUID(),
    threadId: "thread-1",
    role: "user",
    bodyText,
    createdAt: "2026-05-06T10:00:00.000Z",
  };
}

describe("thought schemas", () => {
  it("accepts a thread linked to a week and a long message", () => {
    const thread = thoughtThreadCreateSchema.parse({
      weekId: "week-1",
      dayDate: "2026-05-06",
      title: "Ideeen voor vandaag",
    });
    const messagePayload = thoughtMessageCreateSchema.parse({
      bodyText: "Ik moet de planning afmaken.",
    });

    expect(thread.weekId).toBe("week-1");
    expect(messagePayload.bodyText).toBe("Ik moet de planning afmaken.");
  });
});

describe("summarizeThoughtMessages", () => {
  it("extracts ideas, tasks, and planning notes from free-form thoughts", () => {
    const summary = summarizeThoughtMessages([
      message("Idee: misschien een inbox maken voor losse gedachten."),
      message("Ik moet morgen de dagplanning afmaken en de klant mailen."),
    ]);

    expect(summary.overview).toContain("Kern:");
    expect(summary.ideas).toEqual(["Idee: Een inbox maken voor losse gedachten."]);
    expect(summary.tasks).toEqual(["Actie: Morgen de dagplanning afmaken en de klant mailen."]);
    expect(summary.planningNotes).toEqual(["Planning: Morgen de dagplanning afmaken en de klant mailen."]);
  });
});
