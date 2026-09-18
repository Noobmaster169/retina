import { NextResponse, type NextRequest } from "next/server";

import { SITE_COOKIE, gateEnabled, isValidSession } from "@/lib/site-gate";

/** Sends everyone without the site cookie to /login. A no-op when SITE_PASSWORD is unset. */
export function proxy(request: NextRequest) {
  if (!gateEnabled() || request.nextUrl.pathname === "/login") return NextResponse.next();
  if (isValidSession(request.cookies.get(SITE_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Everything except Next's build assets, so the login page can load its CSS and JS.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
