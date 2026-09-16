import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { WorkspacePageHeader } from "../../workspace-page-header";
import { RestoreProcessButton } from "./restore-button";

/** "14 Sep 2026" — short enough for a table column, unambiguous across locales. */
function formatDeletedAt(at: Date): string {
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function DeletedProcessesPage(
  props: PageProps<"/workspaces/[workspaceId]/processes/deleted">
) {
  const { workspaceId } = await props.params;

  // Gated at the page, not only on the buttons. A Viewer cannot restore
  // anything, so showing them the list would only tell them what a colleague
  // deleted and when — information this page exists to act on, not to browse.
  const access = await requireWorkspaceAccess(workspaceId, "EDITOR");
  if (!access.ok) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <WorkspacePageHeader
          title="Deleted processes"
          subtitle="You need edit access to this workspace to see what has been deleted."
        />
        <p className="mt-6 text-sm text-slate-600">
          <Link href={`/workspaces/${workspaceId}/processes`} className="font-semibold underline">
            Back to Processes
          </Link>
        </p>
      </main>
    );
  }

  const deleted = await prisma.process.findMany({
    where: { workspaceId, archivedAt: { not: null } },
    include: {
      _count: { select: { steps: true } },
      // Only a live parent is worth naming: if the parent was deleted too, the
      // code would point at another row on this very page.
      parentProcess: { select: { code: true, archivedAt: true } },
    },
    // The mistake a consultant is looking for is almost always the last one.
    orderBy: { archivedAt: "desc" },
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <WorkspacePageHeader
        title="Deleted processes"
        subtitle="Deleting a process hides it — it never destroys anything. Restore one to bring it back exactly as it was."
      />

      <p className="mt-4 text-sm">
        <Link
          href={`/workspaces/${workspaceId}/processes`}
          className="font-semibold text-slate-600 underline hover:text-slate-900"
        >
          ← Back to Processes
        </Link>
      </p>

      {deleted.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-8 text-center">
          <p className="text-sm font-semibold text-slate-700">Nothing has been deleted</p>
          <p className="mt-1 text-sm text-slate-600">
            Every process in this workspace is still on the Processes list.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Process</th>
                <th className="px-4 py-2">Steps</th>
                <th className="px-4 py-2">Deleted</th>
                <th className="px-4 py-2 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {deleted.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-700">{p.code}</td>
                  <td className="px-4 py-2 font-medium text-slate-900">
                    {p.name}
                    {p.parentProcess && !p.parentProcess.archivedAt && (
                      <span className="ml-2 text-xs font-normal text-slate-600">
                        sub-process of {p.parentProcess.code}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{p._count.steps}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {p.archivedAt ? formatDeletedAt(p.archivedAt) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <RestoreProcessButton
                      workspaceId={workspaceId}
                      processId={p.id}
                      processLabel={`${p.code} · ${p.name}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
