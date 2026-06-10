import { ensureAuth } from "@/lib/api/guards";
import { ok, fail, parseError } from "@/lib/api/http";
import { db } from "@/lib/db/repository";
import { aiSummarizeThoughts } from "@/lib/thoughts/ai-summarize";
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

    const hasAiCredentials = !!process.env.CLOUDFLARE_ACCOUNT_ID && !!process.env.CLOUDFLARE_AI_API_TOKEN;

    const content = hasAiCredentials
      ? await aiSummarizeThoughts(messages)
      : summarizeThoughtMessages(messages);

    const summary = await db.createThoughtSummary(threadId, content, messages.length);
    return ok({ summary }, { status: 201 });
  } catch (error) {
    return parseError(error);
  }
}