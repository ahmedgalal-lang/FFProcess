import type { Locale } from "../locale";
import { en, type Messages } from "./en";
import { ar } from "./ar";

export type { Messages };

export function messagesFor(locale: Locale): Messages {
  return locale === "ar" ? ar : en;
}
