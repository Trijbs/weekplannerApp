import { ok, parseError } from "@/lib/api/http";
import { getPinStatus } from "@/lib/auth/pin-status";

export async function GET() {
  try {
    return ok(await getPinStatus());
  } catch (error) {
    return parseError(error);
  }
}
