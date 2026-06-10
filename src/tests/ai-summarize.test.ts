import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseAiResponse, buildUserPrompt } from "@/lib/thoughts/ai-summarize";
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

describe("parseAiResponse", () => {
  it("parses valid JSON response with all fields", () => {
    const raw = JSON.stringify({
      overview: "Gaat over export en deadline.",
      tasks: ["Export verbeteren."],
      ideas: ["Donkere modus toevoegen."],
      planningNotes: ["Morgen meeting voorbereiden."],
      concerns: ["Risico dat de deadline niet haalbaar is."],
      questions: ["Wie doet de code review?"],
      decisions: ["Besloten om te migreren naar Neon."],
      blocked: ["Wacht op de API-key van ICT."],
      mood: "gestrest",
      priority: "hoog",
      tags: ["tech", "planning"],
    });

    const result = parseAiResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.overview).toBe("Gaat over export en deadline.");
    expect(result!.tasks).toEqual(["Export verbeteren."]);
    expect(result!.ideas).toEqual(["Donkere modus toevoegen."]);
    expect(result!.planningNotes).toEqual(["Morgen meeting voorbereiden."]);
    expect(result!.concerns).toEqual(["Risico dat de deadline niet haalbaar is."]);
    expect(result!.questions).toEqual(["Wie doet de code review?"]);
    expect(result!.decisions).toEqual(["Besloten om te migreren naar Neon."]);
    expect(result!.blocked).toEqual(["Wacht op de API-key van ICT."]);
    expect(result!.mood).toBe("gestrest");
    expect(result!.priority).toBe("hoog");
    expect(result!.tags).toEqual(["tech", "planning"]);
  });

  it("returns null for non-JSON input", () => {
    expect(parseAiResponse("This is not JSON")).toBeNull();
  });

  it("extracts JSON from markdown-wrapped response", () => {
    const json = JSON.stringify({
      overview: "Test overview.",
      tasks: [],
      ideas: [],
      planningNotes: [],
      concerns: [],
      questions: [],
      decisions: [],
      blocked: [],
      mood: "neutraal",
      priority: "middel",
      tags: [],
    });
    const raw = `Here is the summary:\n\`\`\`json\n${json}\n\`\`\``;
    const result = parseAiResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.overview).toBe("Test overview.");
  });

  it("defaults to valid mood and priority for invalid values", () => {
    const raw = JSON.stringify({
      overview: "Test.",
      mood: "happy",
      priority: "urgent",
    });
    const result = parseAiResponse(raw);
    expect(result!.mood).toBe("neutraal");
    expect(result!.priority).toBe("middel");
  });

  it("filters out invalid tags", () => {
    const raw = JSON.stringify({
      overview: "Test.",
      tags: ["tech", "invalid_tag", "planning"],
    });
    const result = parseAiResponse(raw);
    expect(result!.tags).toEqual(["tech", "planning"]);
  });

  it("limits arrays to 8 items", () => {
    const tasks = Array.from({ length: 12 }, (_, i) => `Taak ${i + 1}.`);
    const raw = JSON.stringify({
      overview: "Test.",
      tasks,
      ideas: [],
      planningNotes: [],
      concerns: [],
      questions: [],
      decisions: [],
      blocked: [],
      mood: "neutraal",
      priority: "middel",
      tags: [],
    });
    const result = parseAiResponse(raw);
    expect(result!.tasks.length).toBe(8);
  });

  it("ensures questions end with ?", () => {
    const raw = JSON.stringify({
      overview: "Test.",
      questions: ["Wie doet de review", "Wat is de deadline?"],
      tasks: [],
      ideas: [],
      planningNotes: [],
      concerns: [],
      decisions: [],
      blocked: [],
      mood: "neutraal",
      priority: "middel",
      tags: [],
    });
    const result = parseAiResponse(raw);
    expect(result!.questions[0]).toBe("Wie doet de review?");
    expect(result!.questions[1]).toBe("Wat is de deadline?");
  });

  it("returns null for empty response", () => {
    expect(parseAiResponse("")).toBeNull();
  });

  it("handles partial JSON gracefully", () => {
    const raw = JSON.stringify({
      overview: "Gaat over planning.",
      tasks: ["Taak 1."],
    });
    const result = parseAiResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.tasks).toEqual(["Taak 1."]);
    expect(result!.ideas).toEqual([]);
    expect(result!.mood).toBe("neutraal");
    expect(result!.priority).toBe("middel");
  });
});

describe("buildUserPrompt", () => {
  it("combines user messages into a prompt", () => {
    const messages = [
      message("Ik moet de export verbeteren."),
      message("Idee: donkere modus toevoegen."),
    ];
    const prompt = buildUserPrompt(messages);
    expect(prompt).toContain("Ik moet de export verbeteren.");
    expect(prompt).toContain("Idee: donkere modus toevoegen.");
    expect(prompt).toContain("Vat dit samen");
  });

  it("returns fallback for no user messages", () => {
    const assistantMsg: ThoughtMessage = {
      id: crypto.randomUUID(),
      threadId: "thread-1",
      role: "assistant",
      bodyText: "Assistent antwoord.",
      createdAt: "2026-05-06T10:00:00.000Z",
    };
    const prompt = buildUserPrompt([assistantMsg]);
    expect(prompt).toBe("Geen notities beschikbaar.");
  });
});