import { NextResponse, type NextRequest } from "next/server";

import { SITE_COOKIE, gateEnabled, isValidSession } from "@/lib/site-gate";

/**
 * Sends anyone without the site cookie away from /chat, which spends the
 * model subscription, and from /runs, which starts work on the server. The
 * inbox is public. A no-op when SITE_PASSWORD is unset.
 *
 * Pages only. The /api/runs handlers check the cookie themselves and answer a
 * JSON 401: a redirect here would hand a polling fetch the login page as a 200.
 */
export function proxy(request: NextRequest) {
  if (!gateEnabled()) return NextResponse.next();
  if (isValidSession(request.cookies.get(SITE_COOKIE)?.value)) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/chat/:path*", "/runs/:path*"],
};
