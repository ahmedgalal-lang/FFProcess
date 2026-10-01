import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { getMessages } from "@/lib/i18n/server";
import { WorkspacePageHeader } from "../../workspace-page-header";
import { TranslationRow } from "./translation-row";

/** How many rows one page shows; the search narrows the rest. */
const PAGE_SIZE = 200;

/**
 * The saved Arabic translations behind this workspace's reports (spec 032):
 * each original beside its Arabic, searchable, and correctable by an editor.
 * The workspace layout has already checked the viewer's access.
 */
export default async function TranslationsPage(props: PageProps<"/workspaces/[workspaceId]/export/translations">) {
  const { workspaceId } = await props.params;
  const searchParams = await props.searchParams;
  const q = typeof searchParams["q"] === "string" ? searchParams["q"].trim() : "";
  const t = (await getMessages()).report.translations;

  const where = {
    workspaceId,
    locale: "ar",
    ...(q
      ? {
          OR: [
            { sourceText: { contains: q, mode: "insensitive" as const } },
            { text: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [rows, matching, total] = await Promise.all([
    prisma.contentTranslation.findMany({
      where,
      orderBy: { sourceText: "asc" },
      take: PAGE_SIZE,
      select: { id: true, sourceText: true, text: true, origin: true },
    }),
    prisma.contentTranslation.count({ where }),
    prisma.contentTranslation.count({ where: { workspaceId, locale: "ar" } }),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <WorkspacePageHeader title={t.title} subtitle={t.subtitle} />
      <Link href={`/workspaces/${workspaceId}/export`} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
        {t.back}
      </Link>

      <form method="GET" className="mt-3 flex flex-wrap items-end gap-2" role="search">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          {t.search}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t.searchPlaceholder}
            className="w-80 max-w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-normal"
          />
        </label>
        <button type="submit" className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800">
          {t.search}
        </button>
        <span className="ms-auto text-xs text-slate-500">{t.count(Math.min(matching, PAGE_SIZE), matching)}</span>
      </form>

      {total === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">{t.none}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">{t.noMatch}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">{t.title}</caption>
            <thead className="bg-slate-50 text-start text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th scope="col" className="w-2/5 px-3 py-2 text-start">
                  {t.original}
                </th>
                <th scope="col" className="px-3 py-2 text-start">
                  {t.arabic}
                </th>
                <th scope="col" className="w-36 px-3 py-2 text-start">
                  {t.source}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <TranslationRow key={row.id} workspaceId={workspaceId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
