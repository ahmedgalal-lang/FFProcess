"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/locale";

/** Remembers the interface language for this browser for a year (spec 031). */
export async function setLocale(locale: string): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return { ok: true };
}
