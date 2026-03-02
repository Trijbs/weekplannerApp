import { isSupportedPinHash, requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db/repository";

export type PinStatus = {
  configured: boolean;
  authenticated: boolean;
};

export async function getPinStatus(): Promise<PinStatus> {
  const settings = await db.getAppSettings();
  const authenticated = await requireSession();
  return {
    configured: Boolean(settings?.pinHash && isSupportedPinHash(settings.pinHash)),
    authenticated,
  };
}
