import { requireSession } from "@/lib/auth/session";
import { fail } from "@/lib/api/http";

export async function ensureAuth() {
  const ok = await requireSession();
  if (!ok) {
    return fail("Niet ingelogd", 401);
  }

  return null;
}
