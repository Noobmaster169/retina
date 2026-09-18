/**
 * The site-wide password gate. Off unless SITE_PASSWORD is set. There is no
 * user model: one shared password, and a cookie that proves you typed it.
 *
 * The cookie holds an HMAC of the password, never the password, so changing
 * SITE_PASSWORD signs everyone out. Server-side only.
 */
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SITE_COOKIE = "retina_site";
export const SITE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function password(): string | undefined {
  return process.env.SITE_PASSWORD || undefined;
}

export function gateEnabled(): boolean {
  return password() !== undefined;
}

function sameString(a: string, b: string): boolean {
  // Hash first so the comparison is constant-time regardless of length.
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function checkPassword(candidate: string): boolean {
  const expected = password();
  return expected !== undefined && sameString(candidate, expected);
}

/** The cookie value that grants access. Only meaningful when the gate is on. */
export function sessionToken(): string {
  return createHmac("sha256", password() ?? "").update("retina-site-gate").digest("hex");
}

export function isValidSession(value: string | undefined): boolean {
  if (!gateEnabled()) return true;
  return value !== undefined && sameString(value, sessionToken());
}

/** Where to go after signing in: a path on this site, never a URL someone put in the query string. */
export function safeNext(value: unknown): string {
  // One leading slash and then only path characters: "//evil.com" and "/\evil.com" both fail.
  return typeof value === "string" && /^\/(?!\/)[\w\-/]*$/.test(value) ? value : "/chat";
}

/** For server actions and pages: Proxy alone does not cover every server-action path. */
export async function hasSiteAccess(): Promise<boolean> {
  return isValidSession((await cookies()).get(SITE_COOKIE)?.value);
}
