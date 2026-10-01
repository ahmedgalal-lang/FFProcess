import "server-only";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { formatDate, isLocale, type Locale } from "@/lib/i18n/locale";
import { messagesFor } from "@/lib/i18n/messages";
import type { ReportMessages } from "@/lib/i18n/messages/report.en";
import { getLocale } from "@/lib/i18n/server";
import { translateTexts } from "@/lib/translation/translate";

export type ExportLanguage = {
  locale: Locale;
  t: ReportMessages;
  /** Today, as the file prints it. English keeps the server's own format, as before. */
  today: string;
  /** The saved translations of these texts, for an export in another language. */
  translator: (texts: Iterable<string>) => Promise<(text: string) => string>;
};

/**
 * The language a per-process export is produced in (spec 032): the link's
 * `lang`, or the interface language. Its entries use the workspace's saved
 * translations; only an editor's download asks the AI for missing ones.
 * The caller must already have checked VIEWER access to the workspace.
 */
export async function exportLanguage(request: Request, workspaceId: string): Promise<ExportLanguage> {
  const raw = new URL(request.url).searchParams.get("lang");
  const locale = isLocale(raw) ? raw : await getLocale();
  return {
    locale,
    t: messagesFor(locale).report,
    today: locale === "en" ? new Date().toLocaleDateString() : formatDate(new Date(), locale),
    translator: async (texts) => {
      if (locale === "en") return (text) => text;
      const editor = await requireWorkspaceAccess(workspaceId, "EDITOR");
      const outcome = await translateTexts(workspaceId, texts, locale, { allowAi: editor.ok });
      return outcome.lookup;
    },
  };
}
