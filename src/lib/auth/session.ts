import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db/repository";
import { hashToken } from "@/lib/db/helpers";

const SESSION_COOKIE_NAME = "weekplanner_session";
const SESSION_DAYS = 14;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const PIN_HASH_PREFIX = "scrypt";
const PIN_HASH_KEYLEN = 64;
const PIN_HASH_SALT_BYTES = 16;

function sessionExpiryIso(): string {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(PIN_HASH_SALT_BYTES).toString("hex");
  const derived = scryptSync(pin, salt, PIN_HASH_KEYLEN).toString("hex");
  return `${PIN_HASH_PREFIX}$${salt}$${derived}`;
}

export async function verifyPin(pin: string, pinHash: string): Promise<boolean> {
  if (!isSupportedPinHash(pinHash)) {
    return false;
  }

  const [, salt, expectedHex] = pinHash.split("$");
  if (!salt || !expectedHex) {
    return false;
  }

  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(pin, salt, expected.length);
  return timingSafeEqual(expected, actual);
}

export function isSupportedPinHash(pinHash: string): boolean {
  return pinHash.startsWith(`${PIN_HASH_PREFIX}$`);
}

export async function createSession(): Promise<string> {
  const sessionToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(sessionToken);

  await db.createSession(tokenHash, sessionExpiryIso());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  return sessionToken;
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function requireSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) {
    return false;
  }

  const tokenHash = hashToken(sessionToken);
  const session = await db.getSession(tokenHash);
  if (!session || session.revokedAt) {
    return false;
  }

  const expiresAt = new Date(session.expiresAt).getTime();
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  return true;
}

export async function revokeCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) {
    return;
  }

  await db.revokeSession(hashToken(sessionToken));
  cookieStore.delete(SESSION_COOKIE_NAME);
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;

type AttemptRecord = { count: number; resetAt: number };

const attemptMap = new Map<string, AttemptRecord>();

function getClientIp(forwarded: string | null): string {
  if (!forwarded) {
    return "unknown";
  }

  const first = forwarded.split(",")[0]?.trim();
  return first || "unknown";
}

export async function consumeLoginAttempt(): Promise<{ allowed: boolean; remaining: number }> {
  const headerBag = await headers();
  const ip = getClientIp(headerBag.get("x-forwarded-for"));
  const key = `login:${ip}`;
  const now = Date.now();

  const current = attemptMap.get(key);
  if (!current || current.resetAt <= now) {
    attemptMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS - 1 };
  }

  if (current.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }

  current.count += 1;
  attemptMap.set(key, current);
  return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS - current.count };
}
