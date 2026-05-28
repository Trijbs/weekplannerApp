import { NextRequest } from "next/server";
import { ok, parseError, fail } from "@/lib/api/http";
import { pinSchema } from "@/lib/api/schemas";
import { createSession, hashPin, isSupportedPinHash } from "@/lib/auth/session";
import { db } from "@/lib/db/repository";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pin = pinSchema.parse(body?.pin);

    const settings = await db.getAppSettings();
    if (settings?.pinHash && isSupportedPinHash(settings.pinHash)) {
      return fail("PIN is al ingesteld.", 409);
    }

    const pinHash = await hashPin(pin);
    await db.setPinHash(pinHash);
    await createSession();

    return ok({ message: "PIN ingesteld en ingelogd." });
  } catch (error) {
    return parseError(error);
  }
}
