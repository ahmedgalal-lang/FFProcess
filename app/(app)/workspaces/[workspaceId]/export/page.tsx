import { prisma } from "@/lib/db/client";
import { WorkspacePageHeader } from "../workspace-page-header";

export default async function ExportPickerPage(props: PageProps<"/workspaces/[workspaceId]/export">) {
  const { workspaceId } = await props.params;

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const processes = await prisma.process.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: { code: "asc" },
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <WorkspacePageHeader
        title="Export Report"
        subtitle="Pick which processes to include. The report opens as a clean, printable document — company name, a summary, the org structure, then each process's documentation. Its content comes from each process's Process Map page; anything not filled in there is left out of the report."
      />

      {processes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-400">
          No processes yet in {workspace.name}.
        </p>
      ) : (
        <form action={`/reports/${workspaceId}`} method="GET">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th scope="col" className="w-10 px-4 py-2">
                    <span className="sr-only">Include</span>
                  </th>
                  <th scope="col" className="px-4 py-2">
                    Code
                  </th>
                  <th scope="col" className="px-4 py-2">
                    Process
                  </th>
                </tr>
              </thead>
              <tbody>
                {processes.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        name="ids"
                        value={p.id}
                        defaultChecked
                        aria-label={`Include ${p.code} — ${p.name}`}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-700">{p.code}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{p.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="submit"
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Preview report →
          </button>
        </form>
      )}
    </main>
  );
}
