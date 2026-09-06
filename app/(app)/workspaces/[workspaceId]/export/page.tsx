import { prisma } from "@/lib/db/client";
import { WorkspacePageHeader } from "../workspace-page-header";
import { ExportPickerForm } from "./export-picker-form";

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
        <ExportPickerForm
          workspaceId={workspaceId}
          processes={processes.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
        />
      )}
    </main>
  );
}
