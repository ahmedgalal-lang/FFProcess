import { prisma } from "@/lib/db/client";
import { WorkspacePageHeader } from "../workspace-page-header";
import { ExportPickerForm } from "./export-picker-form";
import { resolveArrangement, BLOCKS, isBlockEmpty } from "@/lib/domain/report-arrangement";
import { loadReportData } from "@/lib/reports/load-report-data";

export default async function ExportPickerPage(props: PageProps<"/workspaces/[workspaceId]/export">) {
  const { workspaceId } = await props.params;

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const processes = await prisma.process.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: { code: "asc" },
  });

  // Which blocks would come out empty for every process in this pack, so a
  // consultant can see what is still to be captured without exporting to find
  // out. The export page is not a hot path, and this is the same data the
  // report itself reads.
  const report = await loadReportData(
    workspaceId,
    processes.map((p) => p.id)
  );
  const emptyBlockIds = BLOCKS.filter((block) =>
    (report?.processes ?? []).every((process) => isBlockEmpty(block.id, process))
  ).map((block) => block.id);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <WorkspacePageHeader
        title="Export Report"
        subtitle="Pick which processes to include. The report opens as a clean, printable document — company name, a summary, the org structure, then each process's documentation. Its content comes from each process's Process Map page; anything not filled in there is shown as not yet recorded."
      />

      {processes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-400">
          No processes yet in {workspace.name}.
        </p>
      ) : (
        <ExportPickerForm
          workspaceId={workspaceId}
          processes={processes.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
          arrangement={resolveArrangement(workspace.reportArrangement)}
          emptyBlockIds={emptyBlockIds}
        />
      )}
    </main>
  );
}
