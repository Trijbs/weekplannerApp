import { ok, parseError } from "@/lib/api/http";
import { revokeCurrentSession } from "@/lib/auth/session";

export async function POST() {
  try {
    await revokeCurrentSession();
    return ok({ message: "Uitgelogd." });
  } catch (error) {
    return parseError(error);
  }
}
