"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SITE_COOKIE, SITE_COOKIE_MAX_AGE, checkPassword, sessionToken } from "@/lib/site-gate";

export async function login(formData: FormData): Promise<void> {
  const candidate = formData.get("password");
  if (typeof candidate !== "string" || !checkPassword(candidate)) redirect("/login?error=1");

  (await cookies()).set(SITE_COOKIE, sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SITE_COOKIE_MAX_AGE,
  });
  redirect("/");
}
