import { ok, fail, parseError } from "@/lib/api/http";
import { syncGoogleDrive } from "@/lib/import/sync";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return fail("Onbevoegd", 401);
    }

    const result = await syncGoogleDrive();
    return ok(result);
  } catch (error) {
    return parseError(error);
  }
}
