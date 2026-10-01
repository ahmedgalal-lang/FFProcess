import "server-only";
import type { Locale } from "@/lib/i18n/locale";
import { translateTexts, type TranslationFailureKind } from "@/lib/translation/translate";
import type { ReportData } from "./load-report-data";
import { applyReportTranslations, collectReportTexts } from "./localize-report";

export type LocalizedReport = {
  data: ReportData;
  /** Distinct entries in the report that need translating. */
  total: number;
  /** Entries still printed as typed, and why — for the preview's notice. */
  untranslated: number;
  failure: string | null;
  failureKind: TranslationFailureKind | null;
};

/**
 * The report in `locale` (spec 032): every entry replaced by its saved
 * translation, translating and saving the missing ones unless `allowAi` is
 * false. English is returned as it is.
 */
export async function localizeReportData(
  data: ReportData,
  locale: Locale,
  options: { allowAi?: boolean } = {}
): Promise<LocalizedReport> {
  if (locale === "en") return { data, total: 0, untranslated: 0, failure: null, failureKind: null };
  const outcome = await translateTexts(data.workspaceId, collectReportTexts(data, locale), locale, options);
  return {
    data: applyReportTranslations(data, locale, outcome.lookup),
    total: outcome.total,
    untranslated: outcome.untranslated,
    failure: outcome.failure,
    failureKind: outcome.failureKind,
  };
}
