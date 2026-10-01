"use client";

import { useState, useTransition } from "react";
import { listGovernanceActivity } from "@/lib/actions/governance";
import type { GovernanceActivityEntryT } from "@/lib/data/governance-activity";
import { SectionGuide } from "./section-guide";
import { useLocale, useMessages } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/i18n/locale";

/**
 * Who changed what in the governance registers, and when (spec 019) —
 * newest first, 50 at a time. Append-only: nothing here edits or removes an
 * entry. Entries keep a record's name as it was, so they still read after
 * it's renamed or deleted.
 */
export function GovernanceActivityLog({
  workspaceId,
  initialEntries,
  initialCursor,
}: {
  workspaceId: string;
  initialEntries: GovernanceActivityEntryT[];
  initialCursor: string | null;
}) {
  const locale = useLocale();
  const m = useMessages();
  const t = m.governance.activity;
  // Older pages loaded on request; the newest page always comes fresh from the server.
  const [older, setOlder] = useState<GovernanceActivityEntryT[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadedFrom, setLoadedFrom] = useState(initialCursor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Collapsed until asked for: a page of entries is a lot to put in front of
  // someone who came to work on the registers.
  const [open, setOpen] = useState(false);

  // A server refresh (after any edit on the page) brings a new first page;
  // older pages fetched against the previous one are dropped with it.
  if (loadedFrom !== initialCursor) {
    setLoadedFrom(initialCursor);
    setOlder([]);
    setCursor(null);
  }

  const entries = [...initialEntries, ...older];
  const nextCursor = older.length > 0 ? cursor : initialCursor;

  function loadMore() {
    if (!nextCursor) return;
    setError(null);
    startTransition(async () => {
      const result = await listGovernanceActivity({ workspaceId, cursor: nextCursor });
      if (!result.ok) {
        setError(t.couldNotLoad);
        return;
      }
      setOlder((prev) => [...prev, ...result.data.entries]);
      setCursor(result.data.nextCursor);
    });
  }

  const exhausted = older.length > 0 && cursor === null;

  return (
    <section id="activity-log" className="rounded-xl border border-slate-200 bg-white p-5 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-bold text-slate-900">{t.title}</h2>
            <SectionGuide id="activity" />
          </div>
          <p className="text-slate-500">{t.intro}</p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="activity-log-entries"
          onClick={() => setOpen((v) => !v)}
          className="flex-none rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 font-semibold text-indigo-600 hover:bg-indigo-100"
        >
          {open ? t.hide : t.show}
        </button>
      </div>
      {open && (
        <div id="activity-log-entries" className="mt-3">
          {entries.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-slate-500">
              {t.none}
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-slate-100">
              {entries.map((e) => (
                <li
                  key={e.id}
                  data-activity-entry={e.entityLabel}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5"
                >
                  <time dateTime={e.createdAt} className="w-36 flex-none tabular-nums text-slate-500">
                    {formatDateTime(new Date(e.createdAt), locale)}
                  </time>
                  <span className="rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-700">
                    {t.types[e.entityType]}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {e.entityType === "ASPECT" || e.entityType === "ASSESSMENT"
                      ? (m.governance.aspectNames[e.entityLabel] ?? e.entityLabel)
                      : e.entityLabel}
                  </span>
                  <span className="text-slate-700">{e.summary}</span>
                  <span className="text-slate-500">{t.by(e.actorName)}</span>
                </li>
              ))}
            </ol>
          )}
          {nextCursor && !exhausted && (
            <button
              type="button"
              onClick={loadMore}
              disabled={pending}
              className="mt-3 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 font-semibold text-indigo-600 hover:bg-indigo-50 disabled:text-slate-400"
            >
              {pending ? m.common.loading : t.loadMore}
            </button>
          )}
          {error && <p className="mt-2 font-medium text-red-600">{error}</p>}
        </div>
      )}
    </section>
  );
}
