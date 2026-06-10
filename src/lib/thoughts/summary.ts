import type { ThoughtMessage, ThoughtSummaryContent, ThoughtMood, ThoughtPriority } from "@/lib/db/types";

const CORE_MIN_LENGTH = 40;
const CORE_MAX_LENGTH = 80;
const ACTION_MAX_LENGTH = 60;
const IDEA_MAX_LENGTH = 60;
const PLANNING_MAX_LENGTH = 50;
const CONCERN_MAX_LENGTH = 70;
const QUESTION_MAX_LENGTH = 70;
const DECISION_MAX_LENGTH = 60;
const BLOCKED_MAX_LENGTH = 60;
const MAX_ITEMS_PER_CATEGORY = 8;
const FALLBACK_IDEA_LIMIT = 5;

const TASK_HINT = /\b(moet|todo|to do|taak|regelen|fix|bellen|mailen|sturen|uitzoeken|plannen|afmaken|oplossen|controleren|testen|schrijven|leveren|doen|organiseren|opschonen|verbeteren|implementeren|ontwikkelen|instellen|maken|creëren|aanmaken|installatie|updaten|vernieuwen|vervangen|verwijderen|toevoegen|checken|bevestigen|reserveren|aanvragen|indienen|opvolgen|opruimen|voorbereiden|documenteren|backuppen|aanpassen|configureren|migreren|deployen)\b/i;
const PLANNING_HINT = /\b(vandaag|morgen|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|week|planning|deadline|ochtend|middag|vanavond|deze week|volgende week|komend weekend|eind van de dag|eod|sprint|milestone|checkpoint)\b/i;
const IDEA_HINT = /\b(idee|misschien|zou kunnen|concept|bouwen|bedenken|later|experiment|verbeteren|zou leuk zijn|handig om|interessant om|verkenning|brainstorm|innovatie|alternatief|mogelijkheid|potentieel|optie|inspiratie|visie|toekomst|droom|wens|goed om|stap richting)\b/i;
const CONCERN_HINT = /\b(zorgen|probleem|risico|lastig|moeilijk|stress|frustreer|bezorgd|benauwd|bang|onzeker|fout|tekort|ontbreekt|hapert|stuck|vastgelopen|bottleneck|onrust|overweldigd|spanning|dreiging|gevaar|knelpunt|belemmering|beperking|achterstand|uitdaging|bezig met worstelen|struggle|wanhopig|paniek)\b/i;
const QUESTION_HINT = /(?:\?\s*$)|(?:wie\s+(?:doet|heeft|is|zal|moet|kan|wil))|(?:wat\s+(?:als|nu|dan|is|moet|kan))|(?:waar\s+(?:om|heen|op))|(?:wanneer\s+(?:is|moet|kan))|(?:hoe\s+(?:dan|zo|moet|kan|werken|lossen))|(?:onbekend|onduidelijk|twijfelt|checken of|uitzoeken of|weten of|weten hoe|niet zeker|niet weten|onbeslist|afwachten)/i;
const DECISION_HINT = /\b(besloten|gekozen|keuze|beslissing|afgesproken|voortaan|definitief|akkoord|go voor|beslis|standpunt|conclusie|besluit|gekozen voor|kies voor|from nu|vanaf nu|akkoord met|go\!|doorgevoerd|vastgelegd|geautoriseerd)\b/i;
const BLOCKED_HINT = /\b(wacht op|afhankelijk van|kan niet|lukt niet|blokkade|blocker|zit vast|until|pas als|nodig voordat|vereist|houdt tegen|geblokkeerd|tegenhoudt|afwacht|niet mogelijk|onmogelijk|stagneert|verhinderd)\b/i;

const STRIP_PREFIXES = /^(ik\s+(moet|wil|ga|denk|hoop|hoef|kan|zal|zou|probeer)|we\s+(moeten|willen|gaan|kunnen|zouden)|misschien\s+(moet|kan|wil|zal|zou|kunnen|moeten)|dat\s+(moet|kan|zal|zou|mag)|zo\s+(moet|kan|zal|zou|nog)|nog\s+(even|moet|kan|zal)|dan\s+(maar|nog)|ik\s+(vind|denk|voel|zie|hoop|bedoel)|het\s+(zou|kan|mag|moet)|zou\s+(het|dat|dit|je|ik|we)\s+(niet\s+)?(handig|leuk|goed|interessant|handig)\s+(zijn|om)|goed\s+(om|idee)|leuk\s+(om|om|idee))/i;

const FILLER_WORDS = new Set([
  "alleen", "daar", "deze", "dingen", "even", "echt", "eigenlijk", "gaan",
  "gewoon", "haar", "heeft", "hier", "hoe", "iets", "immers", "ja", "jawel",
  "keen", "maar", "meer", "misschien", "moet", "naar", "natuurlijk", "niet",
  "noch", "nou", "nu", "ofschoon", "ook", "pas", "sinds", "toch", "toen",
  "uit", "van", "voor", "vooral", "waar", "wanneer", "want", "wel", "werkelijk",
  "zes", "zij", "zijn", "zo", "zou", "zal", "zoals",
]);

const MOOD_POSITIVE = /\b(blij|gelukt|opgelost|succes|fijn|goed|top|geweldig|klaar|af|prachtig|fantastisch|perfect|klaargekomen|voortgang|voorbij|afgerond|gevonden|geholpen|werkt)\b/i;
const MOOD_STRESSED = /\b(stress|druk|haast|teveel|overweldigd|deadline|urgent|onrustig|spannend|zorgelijk|koorts|korte lontje|onder druk|brandjes|blussen|moet nu|snelle)\b/i;
const MOOD_NEGATIVE = /\b(faalt|mislukt|probleem|fout|niet gelukt|verkeerd|slecht|ramp|werktniet|kapot|crash|verlies|verloren|storing|uitval|mislukking)\b/i;

const PRIORITY_HIGH = /\b(NU\b|vandaag nog|ASAP|asap|urgent|kritiek|direct\b|onmiddellijk|spoed|noodzakelijk|belangrijk|essentieel|prioriteit|niet wachten|\bdirect)\b/i;
const PRIORITY_LOW = /\b(later|ooit\b|misschien\b|wanneer tijd|niet urgent|geen haast|op zijn gemak|eventually|als tijd|kan wachten|geen prioriteit)\b/i;

const TAG_PATTERNS: Array<{ tag: string; pattern: RegExp }> = [
  { tag: "finance", pattern: /\b(budget|kosten|factuur|betalen|geld|prijs|tarief|facturatie|uitgave|inkomsten|investering|betaling|rekening|kostprijs|winst|verlies|subsidie|toeslag|btw|abo)\b/i },
  { tag: "team", pattern: /\b(team|collega|samenwerking|overleg|vergadering|standup|1-op-1|1:1|scrum|sprint review|retrospective|pairing|mobbing|groep)\b/i },
  { tag: "klant", pattern: /\b(klant|cliënt|opdrachtgever|bestelling|levering|feedback|klanttevredenheid|service|support|contract|afspraak met|extern|stakeholder)\b/i },
  { tag: "tech", pattern: /\b(code|database|server|API|migreren|deployen|bug|fix|pipeline|infrastructuur|backend|frontend|stack|framewerk|libraries|git|CI|CD|repository|config|DNS|SSL|auth)\b/i },
  { tag: "planning", pattern: /\b(planning|agenda|afspraak|deadline|week|sprint|milestone|rooster|kalender|tijdblok|schedule|iteratie|release|go-live)\b/i },
  { tag: "persoonlijk", pattern: /\b(ik alleen|persoonlijk|prive|privé|hobby|gezondheid|vakantie|ontspanning|sport|familie|vrienden|mental|burn-out|balans|work-life)\b/i },
  { tag: "compliance", pattern: /\b(AVV|privacy|GDPR|wetgeving|compliance|regelgeving|toestemming|beleid|protocol|audit|certificering|ISO|veiligheid|security|risicoanalyse)\b/i },
];

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
    .replace(/^\s*(actie|idee|planning|zorg|vraag|besluit|blokkade)\s*:\s*/i, "")
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

function rewriteConcern(sentence: string): string {
  let cleaned = trimTrailingPunctuation(cleanItem(sentence));

  cleaned = cleaned
    .replace(STRIP_PREFIXES, "")
    .replace(/\bmisschien\b/gi, "")
    .replace(/\bnog\b\s*\beven\b/gi, "")
    .replace(/\beven\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 3) {
    return "";
  }

  const result = addPeriodIfNeeded(capitalizeFirst(smartTruncate(cleaned, CONCERN_MAX_LENGTH)));
  return result;
}

function rewriteQuestion(sentence: string): string {
  let cleaned = cleanItem(sentence).trim();

  cleaned = cleaned
    .replace(STRIP_PREFIXES, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 3) {
    return "";
  }

  if (!/[.?]$/.test(cleaned)) {
    cleaned = cleaned + "?";
  }

  const result = capitalizeFirst(smartTruncate(cleaned, QUESTION_MAX_LENGTH));
  return result;
}

function rewriteDecision(sentence: string): string {
  let cleaned = trimTrailingPunctuation(cleanItem(sentence));

  cleaned = cleaned
    .replace(STRIP_PREFIXES, "")
    .replace(/\b(dus|daarom|aldaar)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 3) {
    return "";
  }

  const result = addPeriodIfNeeded(capitalizeFirst(smartTruncate(cleaned, DECISION_MAX_LENGTH)));
  return result;
}

function rewriteBlocked(sentence: string): string {
  let cleaned = trimTrailingPunctuation(cleanItem(sentence));

  cleaned = cleaned
    .replace(STRIP_PREFIXES, "")
    .replace(/\bmisschien\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 3) {
    return "";
  }

  const result = addPeriodIfNeeded(capitalizeFirst(smartTruncate(cleaned, BLOCKED_MAX_LENGTH)));
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

function detectMood(text: string): ThoughtMood {
  const lower = text.toLowerCase();
  const hasPositive = MOOD_POSITIVE.test(lower);
  const hasStressed = MOOD_STRESSED.test(lower);
  const hasNegative = MOOD_NEGATIVE.test(lower);

  if (hasNegative) return "negatief";
  if (hasStressed) return "gestrest";
  if (hasPositive) return "positief";
  return "neutraal";
}

function detectPriority(text: string): ThoughtPriority {
  const lower = text.toLowerCase();
  if (PRIORITY_LOW.test(lower)) return "laag";
  if (PRIORITY_HIGH.test(lower)) return "hoog";
  return "middel";
}

function extractTags(text: string): string[] {
  const tags: string[] = [];
  for (const { tag, pattern } of TAG_PATTERNS) {
    if (pattern.test(text)) {
      tags.push(tag);
    }
  }
  return tags;
}

function generateCore(keywords: string[], taskCount: number, ideaCount: number, planningCount: number, concernCount: number, questionCount: number, decisionCount: number, blockedCount: number): string {
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
  if (taskCount > 0) counts.push(`${taskCount} actie${taskCount === 1 ? "" : "s"}`);
  if (ideaCount > 0) counts.push(`${ideaCount} idee${ideaCount === 1 ? "" : "ën"}`);
  if (planningCount > 0) counts.push(`${planningCount} planningpunt${planningCount === 1 ? "" : "en"}`);
  if (concernCount > 0) counts.push(`${concernCount} zorg${concernCount === 1 ? "" : "en"}`);
  if (questionCount > 0) counts.push(`${questionCount} vraag${questionCount === 1 ? "" : "en"}`);
  if (decisionCount > 0) counts.push(`${decisionCount} besluit${decisionCount === 1 ? "" : "en"}`);
  if (blockedCount > 0) counts.push(`${blockedCount} blokkade${blockedCount === 1 ? "" : "s"}`);

  if (counts.length) {
    parts.push(`met ${counts.join(", ")}`);
  }

  const core = capitalizeFirst(parts.join(" ") + ".");

  if (core.length > CORE_MAX_LENGTH) {
    const topCounts = counts.slice(0, 2);
    const short = capitalizeFirst(`Over ${keywords.slice(0, 2).join(", ")}${topCounts.length ? `. ${topCounts.join(", ")}` : ""}.`);
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
  const concernSentences = sentences.filter((sentence) => CONCERN_HINT.test(sentence));
  const questionSentences = sentences.filter((sentence) => QUESTION_HINT.test(sentence));
  const decisionSentences = sentences.filter((sentence) => DECISION_HINT.test(sentence));
  const blockedSentences = sentences.filter((sentence) => BLOCKED_HINT.test(sentence));

  const tasks = uniqueLimit(taskSentences.map(rewriteTask), MAX_ITEMS_PER_CATEGORY);
  const planningNotes = uniqueLimit(planningSentences.map(rewritePlanningNote), MAX_ITEMS_PER_CATEGORY);
  const ideas = uniqueLimit(ideaSentences.map(rewriteIdea), MAX_ITEMS_PER_CATEGORY);
  const concerns = uniqueLimit(concernSentences.map(rewriteConcern), MAX_ITEMS_PER_CATEGORY);
  const questions = uniqueLimit(questionSentences.map(rewriteQuestion), MAX_ITEMS_PER_CATEGORY);
  const decisions = uniqueLimit(decisionSentences.map(rewriteDecision), MAX_ITEMS_PER_CATEGORY);
  const blocked = uniqueLimit(blockedSentences.map(rewriteBlocked), MAX_ITEMS_PER_CATEGORY);

  const classifiedTexts = new Set(
    [...taskSentences, ...planningSentences, ...ideaSentences, ...concernSentences, ...questionSentences, ...decisionSentences, ...blockedSentences].map((s) => s.toLowerCase().trim()),
  );
  const fallbackIdeas = uniqueLimit(
    sentences
      .filter((s) => !classifiedTexts.has(s.toLowerCase().trim()))
      .map(rewriteIdea),
    FALLBACK_IDEA_LIMIT,
  );

  const keywords = topKeywords(sentences, 3);
  const mood = detectMood(userText);
  const priority = detectPriority(userText);
  const tags = extractTags(userText);

  const allIdeas = ideas.length ? ideas : fallbackIdeas;
  const overview = generateCore(keywords, tasks.length, allIdeas.length, planningNotes.length, concerns.length, questions.length, decisions.length, blocked.length);

  return {
    overview,
    ideas: allIdeas,
    tasks,
    planningNotes,
    concerns,
    questions,
    decisions,
    blocked,
    mood,
    priority,
    tags,
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
  rewriteConcern,
  rewriteQuestion,
  rewriteDecision,
  rewriteBlocked,
  detectMood,
  detectPriority,
  extractTags,
  ACTION_MAX_LENGTH,
  IDEA_MAX_LENGTH,
  PLANNING_MAX_LENGTH,
  CONCERN_MAX_LENGTH,
  QUESTION_MAX_LENGTH,
  DECISION_MAX_LENGTH,
  BLOCKED_MAX_LENGTH,
  CORE_MAX_LENGTH,
  CORE_MIN_LENGTH,
  MAX_ITEMS_PER_CATEGORY,
  TASK_HINT,
  PLANNING_HINT,
  IDEA_HINT,
  CONCERN_HINT,
  QUESTION_HINT,
  DECISION_HINT,
  BLOCKED_HINT,
  MOOD_POSITIVE,
  MOOD_STRESSED,
  MOOD_NEGATIVE,
  PRIORITY_HIGH,
  PRIORITY_LOW,
  TAG_PATTERNS,
};