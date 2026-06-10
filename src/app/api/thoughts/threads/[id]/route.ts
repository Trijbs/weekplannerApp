import { ensureAuth } from "@/lib/api/guards";
import { fail, parseError } from "@/lib/api/http";
import { db } from "@/lib/db/repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const params = "then" in context.params ? await context.params : context.params;
    const body = (await request.json()) as { status?: string };
    const status = body.status;

    if (status !== "archived" && status !== "active") {
      return fail("Ongeldige status. Gebruik 'archived' of 'active'.", 400);
    }

    const thread = await db.archiveThoughtThread(params.id);
    if (!thread) {
      return fail("Gesprek niet gevonden.", 404);
    }

    return Response.json({ ok: true, data: { thread } });
  } catch (error) {
    return parseError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const params = "then" in context.params ? await context.params : context.params;
    const deleted = await db.deleteThoughtThread(params.id);

    if (!deleted) {
      return fail("Gesprek niet gevonden.", 404);
    }

    return Response.json({ ok: true });
  } catch (error) {
    return parseError(error);
  }
}