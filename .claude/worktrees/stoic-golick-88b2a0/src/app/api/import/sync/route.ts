import { ensureAuth } from "@/lib/api/guards";
import { ok, parseError } from "@/lib/api/http";
import { syncGoogleDrive } from "@/lib/import/sync";

export async function POST() {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const result = await syncGoogleDrive();
    return ok(result);
  } catch (error) {
    return parseError(error);
  }
}
