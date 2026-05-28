import { NextRequest } from "next/server";
import { consumeLoginAttempt, createSession, isSupportedPinHash, verifyPin } from "@/lib/auth/session";
import { db } from "@/lib/db/repository";
import { ok, parseError, fail } from "@/lib/api/http";
import { pinSchema } from "@/lib/api/schemas";

export async function POST(request: NextRequest) {
  try {
    const attempt = await consumeLoginAttempt();
    if (!attempt.allowed) {
      return fail("Te veel loginpogingen. Probeer later opnieuw.", 429);
    }

    const body = await request.json();
    const pin = pinSchema.parse(body?.pin);

    const settings = await db.getAppSettings();
    if (!settings?.pinHash) {
      return fail("PIN is nog niet ingesteld.", 400);
    }
    if (!isSupportedPinHash(settings.pinHash)) {
      return fail("PIN-hash is verouderd. Stel je PIN opnieuw in.", 409);
    }

    const valid = await verifyPin(pin, settings.pinHash);
    if (!valid) {
      return fail("Onjuiste PIN.", 401);
    }

    await createSession();
    return ok({ message: "Ingelogd." });
  } catch (error) {
    return parseError(error);
  }
}
