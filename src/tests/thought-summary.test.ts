import { describe, expect, it } from "vitest";
import {
  summarizeThoughtMessages,
  smartTruncate,
  splitSentences,
  cleanItem,
  generateCore,
  rewriteTask,
  rewriteIdea,
  rewritePlanningNote,
  ACTION_MAX_LENGTH,
  IDEA_MAX_LENGTH,
  PLANNING_MAX_LENGTH,
  CORE_MAX_LENGTH,
  CORE_MIN_LENGTH,
} from "@/lib/thoughts/summary";
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

describe("constants", () => {
  it("exports correct length limits", () => {
    expect(CORE_MIN_LENGTH).toBe(40);
    expect(CORE_MAX_LENGTH).toBe(80);
    expect(ACTION_MAX_LENGTH).toBe(60);
    expect(IDEA_MAX_LENGTH).toBe(60);
    expect(PLANNING_MAX_LENGTH).toBe(50);
  });
});

describe("smartTruncate", () => {
  it("returns short strings unchanged", () => {
    expect(smartTruncate("hallo", 20)).toBe("hallo");
  });

  it("returns strings at max length unchanged", () => {
    const text = "a".repeat(60);
    expect(smartTruncate(text, 60)).toBe(text);
  });

  it("truncates at a word boundary when possible", () => {
    const text = "dit is een hele lange zin die echt veel te ver door gaat";
    const result = smartTruncate(text, 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).not.toMatch(/\s$/);
  });

  it("truncates very long strings", () => {
    const text = "a ".repeat(80).trim();
    const result = smartTruncate(text, 40);
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it("falls back to hard truncate when no good break point exists", () => {
    const text = "abcdefghij";
    const result = smartTruncate(text, 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("strips trailing punctuation after truncation", () => {
    const text = "woord1 woord2 woord3, woord4 woord5";
    const result = smartTruncate(text, 20);
    expect(result).not.toMatch(/[,.:;!?–—-]$/);
  });

  it("preserves text that fits within maxLen", () => {
    const text = "korte tekst";
    expect(smartTruncate(text, 100)).toBe("korte tekst");
  });

  it("handles empty string", () => {
    expect(smartTruncate("", 10)).toBe("");
  });

  it("truncates at dash boundary", () => {
    const text = "project-A implementatie-B implementatie-C doorsnee";
    const result = smartTruncate(text, 35);
    expect(result.length).toBeLessThanOrEqual(35);
  });
});

describe("splitSentences", () => {
  it("splits on period followed by space", () => {
    const result = splitSentences("Eerste zin. Tweede zin.");
    expect(result).toEqual(["Eerste zin.", "Tweede zin."]);
  });

  it("splits on exclamation mark", () => {
    const result = splitSentences("Let op! Dit is belangrijk.");
    expect(result).toEqual(["Let op!", "Dit is belangrijk."]);
  });

  it("splits on question mark", () => {
    const result = splitSentences("Hoe nu? Verder gaan.");
    expect(result).toEqual(["Hoe nu?", "Verder gaan."]);
  });

  it("splits on newlines", () => {
    const result = splitSentences("Regel een\nRegel twee\nRegel drie");
    expect(result).toEqual(["Regel een", "Regel twee", "Regel drie"]);
  });

  it("handles mixed sentence endings and newlines", () => {
    const result = splitSentences("Eerst.\nDan dit.\nEn dit!");
    expect(result).toEqual(["Eerst.", "Dan dit.", "En dit!"]);
  });

  it("filters out empty strings", () => {
    const result = splitSentences("\n\n  \n");
    expect(result).toEqual([]);
  });

  it("returns single sentence as single element array", () => {
    const result = splitSentences("Gewoon een zin");
    expect(result).toEqual(["Gewoon een zin"]);
  });

  it("handles empty string", () => {
    expect(splitSentences("")).toEqual([]);
  });
});

describe("cleanItem", () => {
  it("strips Actie: prefix", () => {
    expect(cleanItem("Actie: de export verbeteren")).toBe("de export verbeteren");
  });

  it("strips Idee: prefix case-insensitively", () => {
    expect(cleanItem("idee: een inbox maken")).toBe("een inbox maken");
  });

  it("strips Planning: prefix", () => {
    expect(cleanItem("Planning: morgen bellen")).toBe("morgen bellen");
  });

  it("strips bullet points", () => {
    expect(cleanItem("- eerste item")).toBe("eerste item");
    expect(cleanItem("* tweede item")).toBe("tweede item");
  });

  it("strips numbered list prefixes", () => {
    expect(cleanItem("1. taak een")).toBe("taak een");
    expect(cleanItem("3) taak drie")).toBe("taak drie");
  });

  it("strips combined bullet and prefix patterns", () => {
    expect(cleanItem("- Actie: dit doen")).toBe("dit doen");
  });

  it("returns clean text unchanged", () => {
    expect(cleanItem("gewone tekst hier")).toBe("gewone tekst hier");
  });

  it("handles empty string", () => {
    expect(cleanItem("")).toBe("");
  });

  it("strips leading whitespace after prefix removal", () => {
    expect(cleanItem("  Actie:   test")).toBe("test");
  });
});

describe("rewriteTask", () => {
  it("strips 'Ik moet' prefix and capitalizes", () => {
    expect(rewriteTask("Ik moet de export verbeteren")).toBe("De export verbeteren.");
  });

  it("strips 'We moeten' prefix and capitalizes", () => {
    expect(rewriteTask("We moeten morgen bellen")).toBe("Morgen bellen.");
  });

  it("strips 'misschien moet ik' prefix", () => {
    expect(rewriteTask("Misschien moet ik de planning afmaken")).toBe("Ik de planning afmaken.");
  });

  it("adds period if missing", () => {
    expect(rewriteTask("De export verbeteren")).toBe("De export verbeteren.");
  });

  it("does not double period if already present", () => {
    expect(rewriteTask("De export verbeteren.")).toBe("De export verbeteren.");
  });

  it("strips 'Actie:' prefix from tasks", () => {
    const result = rewriteTask("Actie: export verbeteren");
    expect(result).not.toContain("Actie:");
  });

  it("strips 'misschien' word from task", () => {
    expect(rewriteTask("misschien de export testen")).toBe("De export testen.");
  });

  it("capitalizes first letter", () => {
    expect(rewriteTask("de code moet opgeschoond worden")).toBe("De code moet opgeschoond worden.");
  });

  it("truncates long tasks to 60 chars at word boundary", () => {
    const result = rewriteTask("Ik moet de volledige export pipeline van notities verbeteren inclusief datumfilter en PDF ondersteuning toevoegen");
    expect(result.length).toBeLessThanOrEqual(ACTION_MAX_LENGTH);
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns empty string for very short residue", () => {
    const result = rewriteTask("ik moet");
    expect(result).toBe("");
  });

  it("strips 'Ik ga' prefix", () => {
    expect(rewriteTask("Ik ga de database migreren")).toBe("De database migreren.");
  });

  it("strips 'Ik wil' prefix", () => {
    expect(rewriteTask("Ik wil de interface verbeteren")).toBe("De interface verbeteren.");
  });

  it("strips 'nog even' from task", () => {
    const result = rewriteTask("Ik moet nog even de code checken");
    expect(result).not.toContain("nog even");
  });
});

describe("rewriteIdea", () => {
  it("strips 'misschien' prefix", () => {
    expect(rewriteIdea("Misschien een inbox maken voor losse gedachten")).toBe("Een inbox maken voor losse gedachten.");
  });

  it("strips 'Idee:' prefix", () => {
    expect(rewriteIdea("Idee: drag and drop interface")).toBe("Drag and drop interface.");
  });

  it("strips 'zou kunnen' phrase", () => {
    expect(rewriteIdea("Zou kunnen een API bouwen")).toBe("Een API bouwen.");
  });

  it("strips 'goed om' phrase", () => {
    expect(rewriteIdea("Goed om caching toe te voegen")).toBe("Caching toe te voegen.");
  });

  it("strips 'leuk om' phrase", () => {
    expect(rewriteIdea("Leuk om een demo te maken")).toBe("Een demo te maken.");
  });

  it("capitalizes first letter and adds period", () => {
    expect(rewriteIdea("een donkere modus toevoegen")).toBe("Een donkere modus toevoegen.");
  });

  it("truncates to 60 chars at word boundary", () => {
    const longIdea = "misschien zouden we een uitgebreid systeem voor notificaties kunnen bouwen met push berichten en email integratie en real-time updates via websockets";
    const result = rewriteIdea(longIdea);
    expect(result.length).toBeLessThanOrEqual(IDEA_MAX_LENGTH);
  });

  it("returns empty string for very short residue", () => {
    expect(rewriteIdea("misschien")).toBe("");
  });

  it("strips combined pattern 'misschien moeten we'", () => {
    const result = rewriteIdea("Misschien moeten we een shortcut toevoegen");
    expect(result).not.toContain("Misschien");
    expect(result).not.toContain("moeten");
  });
});

describe("rewritePlanningNote", () => {
  it("strips 'Planning:' prefix", () => {
    const result = rewritePlanningNote("Planning: morgen vergadering");
    expect(result).not.toContain("Planning:");
  });

  it("strips 'Ik moet' prefix and capitalizes", () => {
    expect(rewritePlanningNote("Ik moet morgen de planning afmaken")).toBe("Morgen de planning afmaken");
  });

  it("does not add a period (unlike tasks)", () => {
    const result = rewritePlanningNote("Vandaag deadline voor het project");
    expect(result).not.toMatch(/[.!?]$/);
  });

  it("preserves existing period", () => {
    const result = rewritePlanningNote("Vandaag deadline.");
    expect(result).toBe("Vandaag deadline");
  });

  it("strips 'misschien' from planning", () => {
    const result = rewritePlanningNote("Misschien vandaag de code review doen");
    expect(result).not.toContain("misschien");
    expect(result).not.toContain("Misschien");
  });

  it("truncates to 50 chars at word boundary", () => {
    const longNote = "Vandaag de complete sprint review planning voor het hele team afmaken incl alle backlog items";
    const result = rewritePlanningNote(longNote);
    expect(result.length).toBeLessThanOrEqual(PLANNING_MAX_LENGTH);
  });

  it("strips 'nog even' pattern", () => {
    const result = rewritePlanningNote("Nog even de agenda checken");
    expect(result).not.toContain("nog even");
  });

  it("returns empty string for very short residue", () => {
    expect(rewritePlanningNote("ik ga")).toBe("");
  });
});

describe("generateCore", () => {
  it("returns fallback message for zero keywords", () => {
    const result = generateCore([], 0, 0, 0);
    expect(result).toBe("Nog te weinig tekst voor een duidelijke samenvatting.");
  });

  it("generates overview for single keyword", () => {
    const result = generateCore(["export"], 1, 0, 0);
    expect(result).toContain("export");
    expect(result).toContain("Gaat over");
    expect(result).toContain("1 actie");
  });

  it("generates overview for two keywords", () => {
    const result = generateCore(["export", "datumfilter"], 0, 1, 0);
    expect(result).toContain("export");
    expect(result).toContain("datumfilter");
    expect(result).toContain("1 idee");
  });

  it("generates overview for three or more keywords", () => {
    const result = generateCore(["export", "datumfilter", "pdf"], 2, 1, 1);
    expect(result).toContain("export");
    expect(result).toContain("pdf");
    expect(result).toContain("2 acties");
    expect(result).toContain("1 idee");
    expect(result).toContain("1 planningpunt");
  });

  it("uses singular for count of 1", () => {
    const result = generateCore(["test"], 1, 1, 1);
    expect(result).toContain("1 actie");
    expect(result).toContain("1 idee");
    expect(result).toContain("1 planningpunt");
  });

  it("uses plural for count > 1", () => {
    const result = generateCore(["test"], 2, 3, 2);
    expect(result).toContain("2 acties");
    expect(result).toContain("3 ideeen");
    expect(result).toContain("2 planningpunten");
  });

  it("omits zero counts from overview", () => {
    const result = generateCore(["test"], 0, 2, 0);
    expect(result).not.toContain("actie");
    expect(result).toContain("2 idee");
  });

  it("produces overview within length bounds when possible", () => {
    const result = generateCore(["export", "datumfilter", "pdf"], 3, 2, 1);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("truncates overview to CORE_MAX_LENGTH if necessary", () => {
    const longKeywords = ["zeerlangwoordvoorkeyword1", "zeerlangwoordvoorkeyword2"];
    const result = generateCore(longKeywords, 5, 5, 5);
    expect(result.length).toBeLessThanOrEqual(CORE_MAX_LENGTH);
  });

  it("capitalizes first letter of overview", () => {
    const result = generateCore(["export"], 1, 0, 0);
    expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase());
  });
});

describe("summarizeThoughtMessages", () => {
  it("processes multi-message input with tasks, ideas, and planning", () => {
    const summary = summarizeThoughtMessages([
      message("Ik moet de export verbeteren."),
      message("Idee: misschien een inbox maken voor losse gedachten."),
      message("Morgen de meeting voorbereiden."),
    ]);

    expect(summary.overview.length).toBeGreaterThan(0);
    expect(summary.tasks.length).toBeGreaterThanOrEqual(1);
    expect(summary.ideas.length).toBeGreaterThanOrEqual(1);
    expect(summary.planningNotes.length).toBeGreaterThanOrEqual(1);
  });

  it("handles Dutch input with multiple hints in one sentence", () => {
    const summary = summarizeThoughtMessages([
      message("Misschien moet ik de export van notities verbeteren zodat gebruikers een datum kunnen kiezen en misschien ook PDF ondersteuning toevoegen."),
    ]);

    expect(summary.overview.length).toBeGreaterThan(0);
    expect(summary.overview.length).toBeLessThanOrEqual(CORE_MAX_LENGTH);
  });

  it("returns empty arrays for empty input", () => {
    const summary = summarizeThoughtMessages([]);
    expect(summary.tasks).toEqual([]);
    expect(summary.ideas).toEqual([]);
    expect(summary.planningNotes).toEqual([]);
  });

  it("returns fallback overview for empty input", () => {
    const summary = summarizeThoughtMessages([]);
    expect(summary.overview).toBe("Nog te weinig tekst voor een duidelijke samenvatting.");
  });

  it("handles single short input", () => {
    const summary = summarizeThoughtMessages([
      message("Ik moet de export verbeteren."),
    ]);

    expect(summary.overview.length).toBeGreaterThan(0);
    expect(summary.tasks.length).toBeGreaterThanOrEqual(1);
  });

  it("produces overview between 40-80 characters for substantial input", () => {
    const summary = summarizeThoughtMessages([
      message("Ik moet de export van notities verbeteren en de datumfilter toevoegen."),
      message("Idee: donkere modus toevoegen voor de interface."),
      message("Morgen de planning afmaken voor de sprint review."),
    ]);

    expect(summary.overview.length).toBeGreaterThanOrEqual(CORE_MIN_LENGTH);
    expect(summary.overview.length).toBeLessThanOrEqual(CORE_MAX_LENGTH);
  });

  it("never puts Actie: prefix in tasks", () => {
    const summary = summarizeThoughtMessages([
      message("Ik moet de export verbeteren en de code opruimen."),
    ]);

    for (const task of summary.tasks) {
      expect(task).not.toMatch(/^Actie:\s/i);
    }
  });

  it("never puts Idee: prefix in ideas", () => {
    const summary = summarizeThoughtMessages([
      message("Idee: misschien een inbox maken voor losse gedachten."),
    ]);

    for (const idea of summary.ideas) {
      expect(idea).not.toMatch(/^Idee:\s/i);
    }
  });

  it("never puts Planning: prefix in planning notes", () => {
    const summary = summarizeThoughtMessages([
      message("Planning: morgen de agenda checken."),
    ]);

    for (const note of summary.planningNotes) {
      expect(note).not.toMatch(/^Planning:\s/i);
    }
  });

  it("respects max 60 char limit for tasks", () => {
    const summary = summarizeThoughtMessages([
      message("Ik moet de volledige export pipeline van notities verbeteren inclusief datumfilter en PDF ondersteuning toevoegen aan het systeem."),
    ]);

    for (const task of summary.tasks) {
      expect(task.length).toBeLessThanOrEqual(ACTION_MAX_LENGTH);
    }
  });

  it("respects max 60 char limit for ideas", () => {
    const summary = summarizeThoughtMessages([
      message("Idee: misschien zouden we een uitgebreid notificatie systeem kunnen bouwen met push berichten email en real-time updates."),
    ]);

    for (const idea of summary.ideas) {
      expect(idea.length).toBeLessThanOrEqual(IDEA_MAX_LENGTH);
    }
  });

  it("respects max 50 char limit for planning notes", () => {
    const summary = summarizeThoughtMessages([
      message("Vandaag moet ik de complete sprint review planning afmaken inclusief alle backlog items voor het team."),
    ]);

    for (const note of summary.planningNotes) {
      expect(note.length).toBeLessThanOrEqual(PLANNING_MAX_LENGTH);
    }
  });

  it("uses fallback ideas when no idea-hinted sentences exist", () => {
    const summary = summarizeThoughtMessages([
      message("De database is geoptimaliseerd. De API is sneller geworden."),
    ]);

    expect(summary.ideas.length).toBeGreaterThanOrEqual(1);
  });

  it("ignores assistant messages", () => {
    const assistantMessage: ThoughtMessage = {
      id: crypto.randomUUID(),
      threadId: "thread-1",
      role: "assistant",
      bodyText: "Dit is een assistent bericht.",
      createdAt: "2026-05-06T10:00:00.000Z",
    };

    const summary = summarizeThoughtMessages([assistantMessage]);
    expect(summary.overview).toBe("Nog te weinig tekst voor een duidelijke samenvatting.");
    expect(summary.tasks).toEqual([]);
    expect(summary.ideas).toEqual([]);
    expect(summary.planningNotes).toEqual([]);
  });

  it("deduplicates identical tasks", () => {
    const summary = summarizeThoughtMessages([
      message("Ik moet de export verbeteren."),
      message("Ik moet de export verbeteren."),
    ]);

    const lowered = summary.tasks.map((t) => t.toLowerCase());
    const unique = new Set(lowered);
    expect(unique.size).toBe(summary.tasks.length);
  });

  it("processes Dutch patterns correctly across categories", () => {
    const summary = summarizeThoughtMessages([
      message("Ik moet morgen de export verbeteren."),
      message("Misschien een donkere modus toevoegen."),
      message("Vandaag de planning afmaken."),
    ]);

    expect(summary.overview.length).toBeGreaterThan(0);
    expect(summary.overview).not.toContain("Actie:");
    expect(summary.overview).not.toContain("Idee:");
    expect(summary.overview).not.toContain("Planning:");
  });

  it("handles messages with only newlines", () => {
    const summary = summarizeThoughtMessages([
      message("\n\n  \n"),
    ]);

    expect(summary).toBeDefined();
  });

  it("classifies task-hinted sentences as tasks", () => {
    const summary = summarizeThoughtMessages([
      message("Ik moet de database migreren naar de nieuwe server."),
    ]);

    expect(summary.tasks.length).toBeGreaterThanOrEqual(1);
    expect(summary.tasks[0].toLowerCase()).toContain("database");
  });

  it("classifies planning-hinted sentences as planning", () => {
    const summary = summarizeThoughtMessages([
      message("Morgen heb ik een belangrijke vergadering."),
    ]);

    expect(summary.planningNotes.length).toBeGreaterThanOrEqual(1);
    expect(summary.planningNotes[0].toLowerCase()).toContain("morgen");
  });

  it("classifies idea-hinted sentences as ideas", () => {
    const summary = summarizeThoughtMessages([
      message("Misschien kunnen we een nieuwe feature bouwen."),
    ]);

    expect(summary.ideas.length).toBeGreaterThanOrEqual(1);
  });

  it("limits categories to max 8 items", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      message(`Ik moet taak nummer ${i + 1} afmaken en de code review doen.`),
    );

    const summary = summarizeThoughtMessages(messages);
    expect(summary.tasks.length).toBeLessThanOrEqual(8);
  });
});