import type { ThoughtMessage, ThoughtSummaryContent } from "@/lib/db/types";

const TASK_HINT = /\b(moet|todo|to do|taak|regelen|fix|bellen|mailen|sturen|uitzoeken|plannen|afmaken)\b/i;
const PLANNING_HINT = /\b(vandaag|morgen|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|week|planning|deadline|ochtend|middag)\b/i;
const IDEA_HINT = /\b(idee|misschien|zou kunnen|concept|bouwen|bedenken|later|experiment|verbeteren)\b/i;
const FILLER_WORDS = new Set([
  "alleen",
  "daar",
  "deze",
  "dingen",
  "even",
  "gaan",
  "heeft",
  "hier",
  "iets",
  "maar",
  "meer",
  "moet",
  "niet",
  "voor",
  "waar",
  "want",
  "week",
  "wel",
  "zijn",
]);

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanItem(value: string): string {
  return value.replace(/^[-*•\d.)\s]+/, "").trim().slice(0, 220);
}

function trimTrailingPunctuation(value: string): string {
  return value.trim().replace(/[.!?]+$/g, "");
}

function sentenceToWords(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !FILLER_WORDS.has(word));
}

function topKeywords(sentences: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const sentence of sentences) {
    for (const word of sentenceToWords(sentence)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}

function rewriteTask(sentence: string): string {
  const cleaned = trimTrailingPunctuation(cleanItem(sentence))
    .replace(/^ik\s+(moet|wil|ga)\s+/i, "")
    .replace(/^we\s+(moeten|willen|gaan)\s+/i, "")
    .replace(/^(todo|to do|taak)\s*:?\s*/i, "")
    .replace(/\bmisschien\b/gi, "")
    .trim();

  if (!cleaned) {
    return "";
  }

  return `Actie: ${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}.`;
}

function rewriteIdea(sentence: string): string {
  const cleaned = trimTrailingPunctuation(cleanItem(sentence))
    .replace(/^idee\s*:?\s*/i, "")
    .replace(/\bmisschien\b/gi, "")
    .replace(/\b(zou kunnen|kunnen we)\b/gi, "")
    .trim();

  if (!cleaned) {
    return "";
  }

  return `Idee: ${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}.`;
}

function rewritePlanningNote(sentence: string): string {
  const cleaned = trimTrailingPunctuation(cleanItem(sentence))
    .replace(/^ik\s+(moet|wil|ga)\s+/i, "")
    .replace(/^we\s+(moeten|willen|gaan)\s+/i, "")
    .trim();

  if (!cleaned) {
    return "";
  }

  return `Planning: ${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}.`;
}

function uniqueLimit(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items.map(cleanItem).filter(Boolean)) {
    const key = item.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

export function summarizeThoughtMessages(messages: ThoughtMessage[]): ThoughtSummaryContent {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.bodyText.trim())
    .filter(Boolean)
    .join("\n");

  const sentences = splitSentences(userText);
  const taskSentences = sentences.filter((sentence) => TASK_HINT.test(sentence));
  const planningSentences = sentences.filter((sentence) => PLANNING_HINT.test(sentence));
  const ideaSentences = sentences.filter((sentence) => IDEA_HINT.test(sentence));

  const tasks = uniqueLimit(taskSentences.map(rewriteTask), 8);
  const planningNotes = uniqueLimit(planningSentences.map(rewritePlanningNote), 8);
  const ideas = uniqueLimit(ideaSentences.map(rewriteIdea), 8);
  const fallbackIdeas = uniqueLimit(sentences.filter((sentence) => !tasks.includes(sentence) && !planningNotes.includes(sentence)), 5);

  const keywords = topKeywords(sentences, 3);
  const overviewSource = keywords.length
    ? `Kern: je notities gaan vooral over ${keywords.join(", ")}. Ik zie ${tasks.length} actie${tasks.length === 1 ? "" : "s"}, ${ideas.length} idee${ideas.length === 1 ? "" : "en"} en ${planningNotes.length} planningpunt${planningNotes.length === 1 ? "" : "en"}.`
    : "";

  return {
    overview: overviewSource || "Nog te weinig tekst voor een duidelijke samenvatting.",
    ideas: ideas.length ? ideas : fallbackIdeas.map(rewriteIdea),
    tasks,
    planningNotes,
  };
}
