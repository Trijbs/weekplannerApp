import { ensureAuth } from "@/lib/api/guards";
import { ok, fail, parseError } from "@/lib/api/http";
import { db } from "@/lib/db/repository";
import { summarizeThoughtMessages } from "@/lib/thoughts/summary";

export async function POST(request: Request) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const body = await request.json();
    const threadId = body?.threadId;
    if (!threadId || typeof threadId !== "string") {
      return fail("threadId is vereist.", 400);
    }

    const thread = await db.getThoughtThreadById(threadId);
    if (!thread) {
      return fail("Gesprek niet gevonden.", 404);
    }

    const messages = await db.listThoughtMessages(threadId);
    if (messages.length === 0) {
      return fail("Schrijf eerst een gedachte op.", 400);
    }

    const hasAiBinding = typeof (globalThis as Record<string, unknown>).AI !== "undefined";
    const hasAiApiKey = !!process.env.CLOUDFLARE_AI_API_KEY;

    if (hasAiBinding || hasAiApiKey) {
      console.info("[ai-summarize] Workers AI binding detected; AI summarization not yet implemented, falling back to rule-based.");
    } else {
      console.info("[ai-summarize] No Workers AI binding or API key found; using rule-based summarization.");
    }

    const content = summarizeThoughtMessages(messages);
    const summary = await db.createThoughtSummary(threadId, content, messages.length);
    return ok({ summary }, { status: 201 });
  } catch (error) {
    return parseError(error);
  }
}