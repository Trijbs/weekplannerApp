import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeAndStoreConnection, resolveAppOrigin } from "@/lib/import/google-drive";

const STATE_COOKIE = "drive_oauth_state";
const REDIRECT_URI_COOKIE = "drive_oauth_redirect_uri";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const appOrigin = resolveAppOrigin({ request, requestUrl: request.url });
  const redirectToApp = (path: string) => NextResponse.redirect(new URL(path, `${appOrigin}/`));

  try {
    const oauthError = request.nextUrl.searchParams.get("error");
    if (oauthError) {
      cookieStore.delete(STATE_COOKIE);
      cookieStore.delete(REDIRECT_URI_COOKIE);
      return redirectToApp(`/?drive=error_google_${encodeURIComponent(oauthError)}`);
    }

    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const folderId =
      request.nextUrl.searchParams.get("folderId") ?? process.env.GOOGLE_DRIVE_FOLDER_ID ?? "";
    const redirectUriFromCookie = cookieStore.get(REDIRECT_URI_COOKIE)?.value;

    if (!code) {
      return redirectToApp("/?drive=error_code");
    }

    const expectedState = cookieStore.get(STATE_COOKIE)?.value;
    if (!expectedState || !state || expectedState !== state) {
      return redirectToApp("/?drive=error_state");
    }

    if (!folderId) {
      return redirectToApp("/?drive=error_folder");
    }

    await exchangeCodeAndStoreConnection(code, folderId, {
      requestUrl: request.url,
      redirectUri: redirectUriFromCookie,
    });
    cookieStore.delete(STATE_COOKIE);
    cookieStore.delete(REDIRECT_URI_COOKIE);

    return redirectToApp("/?drive=connected");
  } catch {
    cookieStore.delete(STATE_COOKIE);
    cookieStore.delete(REDIRECT_URI_COOKIE);
    return redirectToApp("/?drive=error");
  }
}
