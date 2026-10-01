/**
 * The interface languages (spec 031). The choice lives in a cookie rather
 * than the URL: every page is behind sign-in, so a /ar/ prefix would gain
 * nothing and move every route.
 */

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "ffp-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * The tag for Intl formatting. Arabic keeps Western digits (0-9), the norm
 * in Gulf business software and consistent with process codes like PUR100.
 */
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-u-nu-latn" : "en-GB";
}

/** A date as "12 Mar 2026" / "١٢ مارس ٢٠٢٦"-style text, in the given language. */
export function formatDate(date: Date, locale: Locale): string {
  return date.toLocaleDateString(intlLocale(locale), { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(date: Date, locale: Locale): string {
  return date.toLocaleString(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * An AI prompt with the language to answer in (spec 031). English prompts are
 * left exactly as they were; for Arabic the model is told to write all prose
 * in Arabic while keeping the fixed values its response schema expects.
 */
export function withAnswerLanguage(promptText: string, locale: Locale): string {
  if (locale === "en") return promptText;
  return (
    `${promptText}\n\n` +
    "Language: write every piece of text you return — summaries, titles, descriptions, findings, recommendations " +
    "and full policy documents — in clear, professional Modern Standard Arabic. Keep proper names, process codes " +
    "and abbreviations as given, and keep every enumerated field value (such as phase, likelihood, impact or " +
    "severity) exactly as the schema specifies, in English."
  );
}
