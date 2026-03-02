import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400, details?: unknown): NextResponse {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

export function parseError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return fail("Validatiefout", 400, error.flatten());
  }

  if (error instanceof Error) {
    return fail(error.message, 500);
  }

  return fail("Onbekende fout", 500);
}

export function noAuth(): NextResponse {
  return fail("Niet ingelogd", 401);
}
