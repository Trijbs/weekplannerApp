import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeAndStoreConnection } from "@/lib/import/google-drive";

const STATE_COOKIE = "drive_oauth_state";
const REDIRECT_URI_COOKIE = "drive_oauth_redirect_uri";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();

  try {
    const oauthError = request.nextUrl.searchParams.get("error");
    if (oauthError) {
      cookieStore.delete(STATE_COOKIE);
      cookieStore.delete(REDIRECT_URI_COOKIE);
      return NextResponse.redirect(new URL(`/?drive=error_google_${encodeURIComponent(oauthError)}`, request.url));
    }

    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const folderId =
      request.nextUrl.searchParams.get("folderId") ?? process.env.GOOGLE_DRIVE_FOLDER_ID ?? "";
    const redirectUriFromCookie = cookieStore.get(REDIRECT_URI_COOKIE)?.value;

    if (!code) {
      return NextResponse.redirect(new URL("/?drive=error_code", request.url));
    }

    const expectedState = cookieStore.get(STATE_COOKIE)?.value;
    if (!expectedState || !state || expectedState !== state) {
      return NextResponse.redirect(new URL("/?drive=error_state", request.url));
    }

    if (!folderId) {
      return NextResponse.redirect(new URL("/?drive=error_folder", request.url));
    }

    await exchangeCodeAndStoreConnection(code, folderId, {
      requestUrl: request.url,
      redirectUri: redirectUriFromCookie,
    });
    cookieStore.delete(STATE_COOKIE);
    cookieStore.delete(REDIRECT_URI_COOKIE);

    return NextResponse.redirect(new URL("/?drive=connected", request.url));
  } catch {
    cookieStore.delete(STATE_COOKIE);
    cookieStore.delete(REDIRECT_URI_COOKIE);
    return NextResponse.redirect(new URL("/?drive=error", request.url));
  }
}
