"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SITE_COOKIE, SITE_COOKIE_MAX_AGE, checkPassword, safeNext, sessionToken } from "@/lib/site-gate";

export async function login(formData: FormData): Promise<void> {
  const candidate = formData.get("password");
  const next = safeNext(formData.get("next"));
  if (typeof candidate !== "string" || !checkPassword(candidate)) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  (await cookies()).set(SITE_COOKIE, sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SITE_COOKIE_MAX_AGE,
  });
  redirect(next);
}
