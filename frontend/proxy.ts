import { NextResponse, type NextRequest } from "next/server";

import { SITE_COOKIE, gateEnabled, isValidSession } from "@/lib/site-gate";

/**
 * Sends anyone without the site cookie away from /chat, the one page that
 * spends the model subscription. The inbox is public. A no-op when
 * SITE_PASSWORD is unset.
 */
export function proxy(request: NextRequest) {
  if (!gateEnabled()) return NextResponse.next();
  if (isValidSession(request.cookies.get(SITE_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/chat/:path*"],
};
