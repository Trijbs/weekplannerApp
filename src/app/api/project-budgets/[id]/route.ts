import { ensureAuth } from "@/lib/api/guards";
import { ok, parseError, fail } from "@/lib/api/http";
import { db } from "@/lib/db/repository";

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
    const deleted = await db.deleteProjectBudget(params.id);
    if (!deleted) {
      return fail("Projectbudget niet gevonden.", 404);
    }

    return ok({ deleted: true });
  } catch (error) {
    return parseError(error);
  }
}
