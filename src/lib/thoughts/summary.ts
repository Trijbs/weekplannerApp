import type { ThoughtMessage, ThoughtSummaryContent } from "@/lib/db/types";

const TASK_HINT = /\b(moet|todo|to do|taak|regelen|fix|bellen|mailen|sturen|uitzoeken|plannen|afmaken)\b/i;
const PLANNING_HINT = /\b(vandaag|morgen|maandag|dinsdag|woensdag|donderdag|vrijdag|week|planning|deadline|ochtend|middag)\b/i;
const IDEA_HINT = /\b(idee|misschien|zou kunnen|concept|bouwen|bedenken|later|experiment|verbeteren)\b/i;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanItem(value: string): string {
  return value.replace(/^[-*•\d.)\s]+/, "").trim().slice(0, 220);
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
  const tasks = uniqueLimit(sentences.filter((sentence) => TASK_HINT.test(sentence)), 8);
  const planningNotes = uniqueLimit(sentences.filter((sentence) => PLANNING_HINT.test(sentence)), 8);
  const ideas = uniqueLimit(sentences.filter((sentence) => IDEA_HINT.test(sentence)), 8);
  const fallbackIdeas = uniqueLimit(sentences.filter((sentence) => !tasks.includes(sentence) && !planningNotes.includes(sentence)), 5);

  const overviewSource = uniqueLimit(sentences, 3).join(" ");

  return {
    overview: overviewSource || "Nog te weinig tekst voor een duidelijke samenvatting.",
    ideas: ideas.length ? ideas : fallbackIdeas,
    tasks,
    planningNotes,
  };
}
