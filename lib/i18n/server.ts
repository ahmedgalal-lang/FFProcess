import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./locale";
import { messagesFor, type Messages } from "./messages";

/** The viewer's interface language, from their cookie. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** The interface strings for the viewer's language. */
export async function getMessages(): Promise<Messages> {
  return messagesFor(await getLocale());
}

/**
 * The viewer's language inside a server action, or English when there is no
 * request to read it from (an action called directly, as the integration
 * tests do). Only for actions: a page must use getLocale, so that reading the
 * cookie still marks it as dynamic.
 */
export async function getActionLocale(): Promise<Locale> {
  try {
    return await getLocale();
  } catch {
    return DEFAULT_LOCALE;
  }
}
