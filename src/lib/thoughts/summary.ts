import type { ThoughtMessage, ThoughtSummaryContent } from "@/lib/db/types";

const CORE_MIN_LENGTH = 40;
const CORE_MAX_LENGTH = 80;
const ACTION_MAX_LENGTH = 60;
const IDEA_MAX_LENGTH = 60;
const PLANNING_MAX_LENGTH = 50;
const MAX_ITEMS_PER_CATEGORY = 8;
const FALLBACK_IDEA_LIMIT = 5;

const TASK_HINT = /\b(moet|todo|to do|taak|regelen|fix|bellen|mailen|sturen|uitzoeken|plannen|afmaken|oplossen|controleren|testen|schrijven|leveren|doen|organiseren|opschonen|verbeteren|implementeren|ontwikkelen|instellen|maken|creëren|aanmaken|installatie|updaten|vernieuwen|vervangen|verwijderen|toevoegen|checken|bevestigen|reserveren|aanvragen|indienen|opvolgen|opruimen|voorbereiden|documenteren|backuppen|aanpassen|configureren|migreren|deployen)\b/i;
const PLANNING_HINT = /\b(vandaag|morgen|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|week|planning|deadline|ochtend|middag|vanavond|deze week|volgende week|komend weekend|eind van de dag|eod|sprint|milestone|checkpoint)\b/i;
const IDEA_HINT = /\b(idee|misschien|zou kunnen|concept|bouwen|bedenken|later|experiment|verbeteren|zou leuk zijn|handig om|interessant om|verkenning|brainstorm|innovatie|alternatief|mogelijkheid|potentieel|optie|inspiratie|visie|toekomst|droom|wens|goed om|stap richting)\b/i;

const STRIP_PREFIXES = /^(ik\s+(moet|wil|ga|denk|hoop|hoef|kan|zal|zou|probeer)|we\s+(moeten|willen|gaan|kunnen|zouden)|misschien\s+(moet|kan|wil|zal|zou|kunnen|moeten)|dat\s+(moet|kan|zal|zou|mag)|zo\s+(moet|kan|zal|zou|nog)|nog\s+(even|moet|kan|zal)|dan\s+(maar|nog)|ik\s+(vind|denk|voel|zie|hoop|bedoel)|het\s+(zou|kan|mag|moet)|zou\s+(het|dat|dit|je|ik|we)\s+(niet\s+)?(handig|leuk|goed|interessant|handig)\s+(zijn|om)|goed\s+(om|idee)|leuk\s+(om|om|idee))/i;

const FILLER_WORDS = new Set([
  "alleen", "daar", "deze", "dingen", "even", "echt", "eigenlijk", "gaan",
  "gewoon", "haar", "heeft", "hier", "hoe", "iets", "immers", "ja", "jawel",
  "keen", "maar", "meer", "misschien", "moet", "naar", "natuurlijk", "niet",
  "noch", "nou", "nu", "ofschoon", "ook", "pas", "sinds", "toch", "toen",
  "uit", "van", "voor", "vooral", "waar", "wanneer", "want", "wel", "werkelijk",
  "zes", "zij", "zijn", "zo", "zou", "zal", "zoals",
]);

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function smartTruncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }

  let truncated = text.slice(0, maxLen);

  const lastSpace = truncated.lastIndexOf(" ");
  const lastDash = truncated.lastIndexOf("-");
  const lastSlash = truncated.lastIndexOf("/");
  const breakPoint = Math.max(lastSpace, lastDash, lastSlash);

  if (breakPoint > maxLen * 0.5) {
    truncated = truncated.slice(0, breakPoint);
  }

  return truncated.replace(/[,.:;!?–—-\s]+$/, "");
}

function cleanItem(value: string): string {
  return value
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/^\s*(actie|idee|planning)\s*:\s*/i, "")
    .trim();
}

function trimTrailingPunctuation(value: string): string {
  return value.trim().replace(/[.!?]+$/g, "");
}

function capitalizeFirst(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function addPeriodIfNeeded(value: string): string {
  if (!value) {
    return value;
  }
  if (/[.!?]$/.test(value)) {
    return value;
  }
  return `${value}.`;
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
  let cleaned = trimTrailingPunctuation(cleanItem(sentence));

  cleaned = cleaned
    .replace(STRIP_PREFIXES, "")
    .replace(/\bmisschien\b/gi, "")
    .replace(/\bnog\b\s*\beven\b/gi, "")
    .replace(/\bnog\b/gi, "")
    .replace(/\beven\b/gi, "")
    .replace(/\b(van|uit|op|naar|voor)\s+(de|het|een)\b/gi, "$1 $2")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 3) {
    return "";
  }

  const result = addPeriodIfNeeded(capitalizeFirst(smartTruncate(cleaned, ACTION_MAX_LENGTH)));
  return result;
}

function rewriteIdea(sentence: string): string {
  let cleaned = trimTrailingPunctuation(cleanItem(sentence));

  cleaned = cleaned
    .replace(STRIP_PREFIXES, "")
    .replace(/\bmisschien\b/gi, "")
    .replace(/\b(zou kunnen|kunnen we|zou leuk zijn|handig om|interessant om)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 3) {
    return "";
  }

  const result = addPeriodIfNeeded(capitalizeFirst(smartTruncate(cleaned, IDEA_MAX_LENGTH)));
  return result;
}

function rewritePlanningNote(sentence: string): string {
  let cleaned = trimTrailingPunctuation(cleanItem(sentence));

  cleaned = cleaned
    .replace(STRIP_PREFIXES, "")
    .replace(/\bmisschien\b/gi, "")
    .replace(/\bnog\b\s*\beven\b/gi, "")
    .replace(/\bnog\b/gi, "")
    .replace(/\beven\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 3) {
    return "";
  }

  const result = capitalizeFirst(smartTruncate(cleaned, PLANNING_MAX_LENGTH));
  return result;
}

function uniqueLimit(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items.filter(Boolean)) {
    const key = item.toLowerCase().replace(/[.!?]+$/, "");
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

function generateCore(keywords: string[], taskCount: number, ideaCount: number, planningCount: number): string {
  if (!keywords.length) {
    return "Nog te weinig tekst voor een duidelijke samenvatting.";
  }

  const parts: string[] = [];

  if (keywords.length === 1) {
    parts.push(`gaat over ${keywords[0]}`);
  } else if (keywords.length === 2) {
    parts.push(`gaat over ${keywords[0]} en ${keywords[1]}`);
  } else {
    const last = keywords[keywords.length - 1];
    const rest = keywords.slice(0, -1);
    parts.push(`gaat over ${rest.join(", ")} en ${last}`);
  }

  const counts: string[] = [];
  if (taskCount > 0) {
    counts.push(`${taskCount} actie${taskCount === 1 ? "" : "s"}`);
  }
  if (ideaCount > 0) {
    counts.push(`${ideaCount} idee${ideaCount === 1 ? "" : "en"}`);
  }
  if (planningCount > 0) {
    counts.push(`${planningCount} planningpunt${planningCount === 1 ? "" : "en"}`);
  }

  if (counts.length) {
    parts.push(`met ${counts.join(", ")}`);
  }

  const core = capitalizeFirst(parts.join(" ") + ".");

  if (core.length > CORE_MAX_LENGTH) {
    const short = capitalizeFirst(`Over ${keywords.slice(0, 2).join(", ")}${counts.length ? `. ${counts.join(", ")}` : ""}.`);
    return smartTruncate(short, CORE_MAX_LENGTH);
  }

  return core;
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

  const tasks = uniqueLimit(taskSentences.map(rewriteTask), MAX_ITEMS_PER_CATEGORY);
  const planningNotes = uniqueLimit(planningSentences.map(rewritePlanningNote), MAX_ITEMS_PER_CATEGORY);
  const ideas = uniqueLimit(ideaSentences.map(rewriteIdea), MAX_ITEMS_PER_CATEGORY);

  const classifiedTexts = new Set(
    [...taskSentences, ...planningSentences, ...ideaSentences].map((s) => s.toLowerCase().trim()),
  );
  const fallbackIdeas = uniqueLimit(
    sentences
      .filter((s) => !classifiedTexts.has(s.toLowerCase().trim()))
      .map(rewriteIdea),
    FALLBACK_IDEA_LIMIT,
  );

  const keywords = topKeywords(sentences, 3);
  const overview = generateCore(keywords, tasks.length, ideas.length || fallbackIdeas.length, planningNotes.length);

  return {
    overview,
    ideas: ideas.length ? ideas : fallbackIdeas,
    tasks,
    planningNotes,
  };
}

export {
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
};