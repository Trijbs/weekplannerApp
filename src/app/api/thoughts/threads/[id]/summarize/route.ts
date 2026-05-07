import { ensureAuth } from "@/lib/api/guards";
import { ok, parseError, fail } from "@/lib/api/http";
import { db } from "@/lib/db/repository";
import { summarizeThoughtMessages } from "@/lib/thoughts/summary";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const params = "then" in context.params ? await context.params : context.params;
    const thread = await db.getThoughtThreadById(params.id);
    if (!thread) {
      return fail("Gesprek niet gevonden.", 404);
    }

    const messages = await db.listThoughtMessages(params.id);
    if (messages.length === 0) {
      return fail("Schrijf eerst een gedachte op.", 400);
    }

    const content = summarizeThoughtMessages(messages);
    const summary = await db.createThoughtSummary(params.id, content, messages.length);
    return ok({ summary }, { status: 201 });
  } catch (error) {
    return parseError(error);
  }
}
