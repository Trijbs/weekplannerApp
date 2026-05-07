import { ensureAuth } from "@/lib/api/guards";
import { ok, parseError, fail } from "@/lib/api/http";
import { thoughtMessageCreateSchema } from "@/lib/api/schemas";
import { db } from "@/lib/db/repository";

export async function GET(
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

    const [messages, summaries] = await Promise.all([
      db.listThoughtMessages(params.id),
      db.listThoughtSummaries(params.id),
    ]);
    return ok({ thread, messages, summaries });
  } catch (error) {
    return parseError(error);
  }
}

export async function POST(
  request: Request,
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

    const body = await request.json();
    const payload = thoughtMessageCreateSchema.parse(body);
    const message = await db.addThoughtMessage(params.id, payload);
    return ok({ message }, { status: 201 });
  } catch (error) {
    return parseError(error);
  }
}
