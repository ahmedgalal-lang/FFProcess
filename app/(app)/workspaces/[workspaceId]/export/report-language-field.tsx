"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { prepareReportTranslations } from "@/lib/actions/translations";
import { useMessages } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";
import { useCanEdit } from "../workspace-access";

/**
 * The report's language (spec 032), sent with the picker's GET form as `lang`.
 * For Arabic it says how many of the pack's entries already have a saved
 * translation, and lets an editor translate the rest before exporting, so
 * what is left untranslated, and why, is known before a client sees it.
 */
export function ReportLanguageField({
  workspaceId,
  defaultLocale,
  status,
}: {
  workspaceId: string;
  defaultLocale: Locale;
  /** Saved translations for the workspace's full report. */
  status: { total: number; untranslated: number };
}) {
  const m = useMessages();
  const t = m.report.picker;
  const canEdit = useCanEdit();
  const router = useRouter();
  const [lang, setLang] = useState<Locale>(defaultLocale);
  const [result, setResult] = useState<{
    untranslated: number;
    failure: "NOT_CONFIGURED" | "REQUEST_FAILED" | null;
    translated: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const translated = status.total - status.untranslated;

  /** Entries still to do while Translate now is working through them. */
  const [remaining, setRemaining] = useState<number | null>(null);

  /**
   * Translates in rounds: each call is one short request, so none outlives
   * the hosting proxy's timeout (which answers with an HTML error page, not
   * JSON). Stops when nothing is left, the AI fails, or a round makes no progress.
   */
  function translateNow() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      let last = status.untranslated;
      try {
        for (let round = 0; round < 60; round++) {
          const outcome = await prepareReportTranslations({ workspaceId });
          if (!outcome.ok) {
            setError(outcome.error === "VALIDATION_ERROR" ? (outcome.message ?? m.common.couldNotSave) : m.common.couldNotSave);
            break;
          }
          const stalled = outcome.data.untranslated >= last;
          last = outcome.data.untranslated;
          setRemaining(last);
          setResult({
            untranslated: last,
            failure: outcome.data.failureKind,
            translated: status.untranslated - last,
          });
          if (!outcome.data.pending || stalled) break;
        }
      } catch {
        // The request itself failed (a timeout or a dropped connection), not the
        // translation: what was saved so far is kept, and trying again continues.
        setError(t.requestFailed);
      } finally {
        setRemaining(null);
        router.refresh();
      }
    });
  }

  return (
    <fieldset className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <legend className="px-1 text-sm font-semibold text-slate-900">{t.language}</legend>
      <div className="flex flex-wrap items-center gap-4">
        {(["en", "ar"] as const).map((l) => (
          <label key={l} className="flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="radio"
              name="lang"
              value={l}
              checked={lang === l}
              onChange={() => setLang(l)}
              className="h-4 w-4 border-slate-300"
            />
            <span lang={l}>{l === "en" ? m.language.english : m.language.arabic}</span>
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">{t.languageHint}</p>

      {lang === "ar" && (
        <div role="status" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-700">
          <span>{status.untranslated === 0 ? t.allTranslated : t.status(translated, status.total)}</span>
          {status.untranslated > 0 &&
            (canEdit ? (
              <button
                type="button"
                onClick={translateNow}
                disabled={pending}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
              >
                {pending ? (remaining === null ? t.translating : t.translatingLeft(remaining)) : t.translateNow}
              </button>
            ) : (
              <span className="text-slate-500">{t.needsEditor}</span>
            ))}
          <Link
            href={`/workspaces/${workspaceId}/export/translations`}
            className="font-semibold text-indigo-700 underline decoration-indigo-200 underline-offset-2 hover:decoration-indigo-600"
          >
            {t.reviewTranslations}
          </Link>
          {result && (
            <span className={result.untranslated > 0 ? "font-medium text-amber-800" : "font-medium text-emerald-700"}>
              {result.translated > 0 && t.translatedNow(result.translated)}{" "}
              {result.untranslated > 0 && t.leftUntranslated(result.untranslated, result.failure && m.report.failures[result.failure])}
            </span>
          )}
          {error && <span className="font-medium text-red-600">{error}</span>}
        </div>
      )}
    </fieldset>
  );
}
