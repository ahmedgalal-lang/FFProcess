"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/lib/actions/locale";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { LOCALES, type Locale } from "@/lib/i18n/locale";

/**
 * English / العربية (spec 031). Each option is named in its own language, so
 * someone who can't read the current one can still find theirs.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const m = useMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const names: Record<Locale, string> = { en: m.language.english, ar: m.language.arabic };

  return (
    <div role="group" aria-label={m.language.label} className="flex items-center rounded-md border border-slate-200 p-0.5">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setLocale(l);
              router.refresh();
            })
          }
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            locale === l ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {names[l]}
        </button>
      ))}
    </div>
  );
}
