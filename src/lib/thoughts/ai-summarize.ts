import type { ThoughtMessage, ThoughtSummaryContent } from "@/lib/db/types";
import { summarizeThoughtMessages } from "@/lib/thoughts/summary";

const CF_API_BASE = "https://api.cloudflare.com/client/v4/accounts";
const MODEL = "@cf/meta/llama-3.1-8b-instruct";

const SYSTEM_PROMPT = `Je bent een Nederlandse persoonlijke assistent die notities samenvatte in een gestructureerd JSON-formaat. De gebruiker schrijft losse gedachten, ideeën, taken, zorgen en planning. Jouw taak is om deze te categoriseren en samen te vatten.

Je MOET antwoorden met geldige JSON en NIETS anders. Geen markdown, geen uitleg, alleen JSON.

Het JSON-formaat is:
{
  "overview": "Korte samenvatting van het hoofdonderwerp (40-80 tekens)",
  "tasks": ["Actie 1.", "Actie 2."],
  "ideas": ["Idee 1.", "Idee 2."],
  "planningNotes": ["Planningpunt 1.", "Planningpunt 2."],
  "concerns": ["Zorg 1.", "Zorg 2."],
  "questions": ["Vraag 1?", "Vraag 2?"],
  "decisions": ["Besluit 1.", "Besluit 2."],
  "blocked": ["Blokkade 1.", "Blokkade 2."],
  "mood": "positief | neutraal | gestrest | negatief",
  "priority": "hoog | middel | laag",
  "tags": ["tag1", "tag2"]
}

Regels:
- overview: 1 zin, 40-80 tekens, beschrijft het hoofdonderwerp met sleutelwoorden
- tasks: concrete acties die de gebruiker moet doen, beginnend met werkwoord, max 60 tekens per item
- ideas: ideeën of mogelijkheden, geen verplichting, max 60 tekens per item
- planningNotes: tijdgebonden afspraken of deadlines, max 50 tekens per item
- concerns: zorgen, problemen, risico's, max 70 tekens per item
- questions: openstaande vragen, altijd eindigend op ?, max 70 tekens per item
- decisions: genomen besluiten, max 60 tekens per item
- blocked: blokkades of afhankelijkheden, max 60 tekens per item
- mood: kies exact 1 van: positief, neutraal, gestrest, negatief
- priority: kies exact 1 van: hoog, middel, laag
- tags: relevante domein-tags uit: finance, team, klant, tech, planning, persoonlijk, compliance
- Max 8 items per categorie
- Alles in het Nederlands
- Geef ACTIEF toe: schrijf "Export verbeteren" niet "ik moet de export verbeteren"
- Vragen eindigen ALTIJD op ?
- Als een categorie leeg is, geef dan een lege array []`;

function buildUserPrompt(messages: ThoughtMessage[]): string {
  const userTexts = messages
    .filter((m) => m.role === "user")
    .map((m) => m.bodyText.trim())
    .filter(Boolean);

  if (userTexts.length === 0) {
    return "Geen notities beschikbaar.";
  }

  return `Hier zijn mijn notities:\n\n${userTexts.join("\n\n")}\n\nVat dit samen in het gevraagde JSON-formaat.`;
}

interface CfAiResponse {
  result?: {
    response?: string;
  };
  success?: boolean;
  errors?: Array<{ message?: string }>;
}

export async function aiSummarizeThoughts(messages: ThoughtMessage[]): Promise<ThoughtSummaryContent> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_AI_API_TOKEN;

  if (!accountId || !apiToken) {
    console.info("[ai-summarize] No Cloudflare AI credentials found; falling back to rule-based summarization.");
    return summarizeThoughtMessages(messages);
  }

  const userPrompt = buildUserPrompt(messages);

  console.info("[ai-summarize] Calling Cloudflare Workers AI for summarization...");

  try {
    const response = await fetch(`${CF_API_BASE}/${accountId}/ai/run/${MODEL}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1024,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "unknown");
      console.error(`[ai-summarize] Workers AI returned ${response.status}: ${errorBody}`);
      return summarizeThoughtMessages(messages);
    }

    const data = (await response.json()) as CfAiResponse;

    if (!data.success || !data.result?.response) {
      console.error("[ai-summarize] Workers AI returned unsuccessful response:", JSON.stringify(data.errors));
      return summarizeThoughtMessages(messages);
    }

    const rawResponse = data.result.response;
    console.info("[ai-summarize] AI response received, parsing...");

    const parsed = parseAiResponse(rawResponse);
    if (!parsed) {
      console.error("[ai-summarize] Failed to parse AI response as valid ThoughtSummaryContent; falling back to rule-based.");
      return summarizeThoughtMessages(messages);
    }

    console.info("[ai-summarize] AI summarization successful.");
    return parsed;
  } catch (error) {
    console.error("[ai-summarize] Error calling Workers AI:", error instanceof Error ? error.message : String(error));
    return summarizeThoughtMessages(messages);
  }
}

const VALID_MOODS: ThoughtSummaryContent["mood"][] = ["positief", "neutraal", "gestrest", "negatief"];
const VALID_PRIORITIES: ThoughtSummaryContent["priority"][] = ["hoog", "middel", "laag"];
const VALID_TAGS = ["finance", "team", "klant", "tech", "planning", "persoonlijk", "compliance"];

function parseAiResponse(raw: string): ThoughtSummaryContent | null {
  let jsonText = raw.trim();

  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }
  jsonText = jsonMatch[0];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }

  const mood = typeof parsed.mood === "string" && VALID_MOODS.includes(parsed.mood as ThoughtSummaryContent["mood"])
    ? parsed.mood as ThoughtSummaryContent["mood"]
    : "neutraal";

  const priority = typeof parsed.priority === "string" && VALID_PRIORITIES.includes(parsed.priority as ThoughtSummaryContent["priority"])
    ? parsed.priority as ThoughtSummaryContent["priority"]
    : "middel";

  const tags = Array.isArray(parsed.tags)
    ? (parsed.tags as string[]).filter((t): t is typeof VALID_TAGS[number] => VALID_TAGS.includes(t))
    : [];

  return {
    overview: typeof parsed.overview === "string" && parsed.overview.trim() ? parsed.overview.trim() : "Geen samenvatting beschikbaar.",
    tasks: extractStringArray(parsed.tasks).slice(0, 8),
    ideas: extractStringArray(parsed.ideas).slice(0, 8),
    planningNotes: extractStringArray(parsed.planningNotes).slice(0, 8),
    concerns: extractStringArray(parsed.concerns).slice(0, 8),
    questions: extractStringArray(parsed.questions).slice(0, 8).map(ensureQuestionMark),
    decisions: extractStringArray(parsed.decisions).slice(0, 8),
    blocked: extractStringArray(parsed.blocked).slice(0, 8),
    mood,
    priority,
    tags,
  };
}

function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((s) => s.trim());
}

function ensureQuestionMark(s: string): string {
  if (s.endsWith("?")) return s;
  return s + "?";
}

export { parseAiResponse, buildUserPrompt };