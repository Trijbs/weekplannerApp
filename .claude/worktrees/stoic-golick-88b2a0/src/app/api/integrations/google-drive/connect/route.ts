import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { ensureAuth } from "@/lib/api/guards";
import { ok, parseError } from "@/lib/api/http";
import { buildGoogleDriveConnectUrl } from "@/lib/import/google-drive";

const STATE_COOKIE = "drive_oauth_state";
const REDIRECT_URI_COOKIE = "drive_oauth_redirect_uri";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

export async function POST(request: Request) {
  try {
    const authError = await ensureAuth();
    if (authError) {
      return authError;
    }

    const state = randomBytes(16).toString("hex");
    const cookieStore = await cookies();
    cookieStore.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    const { url, redirectUri } = buildGoogleDriveConnectUrl(state, request.url);
    cookieStore.set(REDIRECT_URI_COOKIE, redirectUri, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    return ok({ url, redirectUri });
  } catch (error) {
    return parseError(error);
  }
}
