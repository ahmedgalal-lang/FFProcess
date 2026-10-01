"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetTranslation, updateTranslation } from "@/lib/actions/translations";
import { useMessages } from "@/lib/i18n/client";
import { useCanEdit } from "../../workspace-access";

type Row = { id: string; sourceText: string; text: string; origin: "AI" | "MANUAL" };

/** One saved translation: the original, its Arabic (editable by an editor), and where the Arabic came from. */
export function TranslationRow({ workspaceId, row }: { workspaceId: string; row: Row }) {
  const m = useMessages();
  const t = m.report.translations;
  const canEdit = useCanEdit();
  const router = useRouter();
  const [text, setText] = useState(row.text);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const changed = text.trim() !== row.text;

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateTranslation({ workspaceId, translationId: row.id, text });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? m.common.couldNotSave) : m.common.couldNotSave);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function reset() {
    setError(null);
    startTransition(async () => {
      const result = await resetTranslation({ workspaceId, translationId: row.id });
      if (!result.ok) {
        setError(m.common.couldNotSave);
        return;
      }
      router.refresh();
    });
  }

  return (
    <tr className="border-t border-slate-100 align-top" data-translation={row.sourceText}>
      <td className="px-3 py-2 whitespace-pre-wrap text-slate-800" dir="ltr" lang="en">
        {row.sourceText}
      </td>
      <td className="px-3 py-2">
        {canEdit ? (
          <div className="flex flex-col gap-1.5">
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSaved(false);
              }}
              dir="rtl"
              lang="ar"
              rows={Math.min(8, Math.max(1, Math.ceil(row.text.length / 60)))}
              aria-label={t.translationOf(row.sourceText)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={save}
                disabled={pending || !changed}
                className="rounded-lg bg-indigo-600 px-2.5 py-1 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
              >
                {pending ? m.common.saving : m.common.save}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={pending}
                title={t.resetHint}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50"
              >
                {t.resetToAi}
              </button>
              {saved && !changed && <span role="status" className="font-medium text-emerald-700">{t.saved}</span>}
              {error && <span className="font-medium text-red-600">{error}</span>}
            </div>
          </div>
        ) : (
          <p dir="rtl" lang="ar" className="whitespace-pre-wrap text-slate-800">
            {row.text}
          </p>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        <span
          className={`rounded-full px-2 py-0.5 font-semibold ${
            row.origin === "MANUAL" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {row.origin === "MANUAL" ? t.corrected : t.fromAi}
        </span>
      </td>
    </tr>
  );
}
