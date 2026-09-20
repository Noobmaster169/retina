import { NextResponse, type NextRequest } from "next/server";

import { SITE_COOKIE, gateEnabled, isValidSession } from "@/lib/site-gate";

/**
 * Sends anyone without the site cookie to the login page. Every route is
 * behind it now that every route is the same application: the gate used to
 * name /chat and /runs because the inbox was a separate public page, and that
 * page is gone. A no-op when SITE_PASSWORD is unset.
 *
 * Pages only. The /api handlers check the cookie themselves and answer a JSON
 * 401: a redirect here would hand a polling fetch the login page as a 200.
 */
export function proxy(request: NextRequest) {
  if (!gateEnabled()) return NextResponse.next();
  if (isValidSession(request.cookies.get(SITE_COOKIE)?.value)) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything but the login page itself, the API handlers, and Next's own assets.
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
