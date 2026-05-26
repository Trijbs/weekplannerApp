import { decryptValue, encryptValue } from "@/lib/security/encryption";
import { db } from "@/lib/db/repository";

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_DRIVE_CALLBACK_PATH = "/api/integrations/google-drive/callback";

export interface DriveFileMeta {
  id: string;
  name: string;
  modifiedTime: string;
  mimeType: string;
}

function envRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export function resolveAppOrigin(options?: { request?: Request; requestUrl?: string }): string {
  const envAppUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (envAppUrl) {
    try {
      return new URL(envAppUrl).origin;
    } catch {
      // Ignore invalid URL and fall through.
    }
  }

  const request = options?.request;
  const forwardedProto = request?.headers.get("x-forwarded-proto");
  const forwardedHost = request?.headers.get("x-forwarded-host") ?? request?.headers.get("host");
  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  const requestUrl = options?.requestUrl;
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      // Fall through to localhost.
    }
  }

  return "http://localhost:3000";
}

export function resolveGoogleRedirectUri(requestUrl?: string): string {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) {
    return configured;
  }
  return `${resolveAppOrigin({ requestUrl })}${GOOGLE_DRIVE_CALLBACK_PATH}`;
}

function getOAuthConfig(requestUrl?: string, redirectUriOverride?: string) {
  return {
    clientId: envRequired("GOOGLE_CLIENT_ID"),
    clientSecret: envRequired("GOOGLE_CLIENT_SECRET"),
    redirectUri: redirectUriOverride ?? resolveGoogleRedirectUri(requestUrl),
  };
}

export function buildGoogleDriveConnectUrl(
  state: string,
  requestUrl?: string,
): { url: string; redirectUri: string } {
  const { clientId, redirectUri } = getOAuthConfig(requestUrl);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  return {
    url: url.toString(),
    redirectUri,
  };
}

function fetchWithTimeout(url: string | URL, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function tokenRequest(params: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Google token fout: ${JSON.stringify(payload)}`);
  }

  return payload;
}

export async function exchangeCodeAndStoreConnection(
  code: string,
  folderId: string,
  options?: { requestUrl?: string; redirectUri?: string },
): Promise<void> {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig(
    options?.requestUrl,
    options?.redirectUri,
  );

  const params = new URLSearchParams();
  params.set("code", code);
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("redirect_uri", redirectUri);
  params.set("grant_type", "authorization_code");

  const payload = await tokenRequest(params);

  const accessToken = String(payload.access_token ?? "");
  const refreshToken = String(payload.refresh_token ?? "");
  const expiresIn = Number(payload.expires_in ?? 3600);

  if (!accessToken || !refreshToken) {
    throw new Error("OAuth callback bevat geen geldige access/refresh tokens.");
  }

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  await db.saveDriveConnection({
    provider: "google-drive",
    accessTokenEnc: encryptValue(accessToken),
    refreshTokenEnc: encryptValue(refreshToken),
    expiresAt,
    folderId,
  });
}

async function refreshAccessToken(): Promise<string> {
  const connection = await db.getDriveConnection();
  if (!connection) {
    throw new Error("Google Drive is nog niet gekoppeld.");
  }

  const now = Date.now();
  const expiry = new Date(connection.expiresAt).getTime();

  if (expiry - now > 60_000) {
    return decryptValue(connection.accessTokenEnc);
  }

  const { clientId, clientSecret } = getOAuthConfig();
  const refreshToken = decryptValue(connection.refreshTokenEnc);

  const params = new URLSearchParams();
  params.set("refresh_token", refreshToken);
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("grant_type", "refresh_token");

  const payload = await tokenRequest(params);

  const accessToken = String(payload.access_token ?? "");
  const expiresIn = Number(payload.expires_in ?? 3600);

  if (!accessToken) {
    throw new Error("Geen access token ontvangen bij refresh.");
  }

  // Google occasionally rotates the refresh token — save the new one if present
  const newRefreshToken = typeof payload.refresh_token === "string" && payload.refresh_token
    ? payload.refresh_token
    : null;

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  await db.saveDriveConnection({
    provider: "google-drive",
    accessTokenEnc: encryptValue(accessToken),
    refreshTokenEnc: newRefreshToken ? encryptValue(newRefreshToken) : connection.refreshTokenEnc,
    expiresAt,
    folderId: connection.folderId,
  });

  return accessToken;
}

export async function listCandidateFiles(): Promise<DriveFileMeta[]> {
  const connection = await db.getDriveConnection();
  if (!connection) {
    return [];
  }

  const accessToken = await refreshAccessToken();
  const query = `'${connection.folderId}' in parents and trashed=false and (mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='text/csv')`;

  const allFiles: DriveFileMeta[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", query);
    url.searchParams.set("fields", "nextPageToken,files(id,name,modifiedTime,mimeType)");
    url.searchParams.set("orderBy", "modifiedTime desc");
    url.searchParams.set("pageSize", "100");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const payload = (await response.json()) as { files?: DriveFileMeta[]; nextPageToken?: string };
    if (!response.ok) {
      throw new Error(`Drive lijst ophalen mislukt: ${JSON.stringify(payload)}`);
    }

    allFiles.push(...(payload.files ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);

  return allFiles.filter(
    (file) =>
      /weekplanning/i.test(file.name) ||
      /weekplanner/i.test(file.name) ||
      file.mimeType === "text/csv" ||
      /\.csv$/i.test(file.name),
  );
}

export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const accessToken = await refreshAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;

  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bestand downloaden mislukt: ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
