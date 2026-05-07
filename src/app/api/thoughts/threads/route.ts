import { ensureAuth } from "@/lib/api/guards";
import { ok, parseError } from "@/lib/api/http";
import { thoughtThreadCreateSchema } from "@/lib/api/schemas";
import { db } from "@/lib/db/repository";

export async function GET() {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const threads = await db.listThoughtThreads(30);
    return ok({ threads });
  } catch (error) {
    return parseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const body = await request.json();
    const payload = thoughtThreadCreateSchema.parse(body);
    const thread = await db.createThoughtThread(payload);
    return ok({ thread }, { status: 201 });
  } catch (error) {
    return parseError(error);
  }
}
