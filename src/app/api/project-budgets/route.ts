import { ensureAuth } from "@/lib/api/guards";
import { ok, parseError } from "@/lib/api/http";
import { projectBudgetUpsertSchema } from "@/lib/api/schemas";
import { db } from "@/lib/db/repository";

export async function GET() {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const [budgets, totals] = await Promise.all([
      db.listProjectBudgets(),
      db.getProjectHourTotals(),
    ]);

    return ok({ budgets, totals });
  } catch (error) {
    return parseError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const body = await request.json();
    const payload = projectBudgetUpsertSchema.parse(body);
    const budget = await db.upsertProjectBudget(payload.projectName, payload.budgetHours);

    return ok({ budget });
  } catch (error) {
    return parseError(error);
  }
}
