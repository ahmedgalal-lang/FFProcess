import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { buildAuthorityTableRows, validateAuthorityTable } from "@/lib/domain/authority-table";
import { getProcessStepperCounts } from "@/lib/data/process-stepper-data";
import { AuthorityTable } from "./authority-table";
import { ProcessStepper } from "../process-stepper";

export default async function AuthorityMatrixPage(
  props: PageProps<"/workspaces/[workspaceId]/processes/[processId]/authority">
) {
  const { workspaceId, processId } = await props.params;

  const process = await prisma.process.findUnique({ where: { id: processId } });
  if (!process || process.workspaceId !== workspaceId) notFound();

  const [roles, people, activities, steps, assignments, stepperCounts] = await Promise.all([
    prisma.role.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.person.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.activity.findMany({ where: { processId }, orderBy: { order: "asc" } }),
    prisma.processStep.findMany({
      where: { processId },
      select: { id: true, type: true, label: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.authorityAssignment.findMany({ where: { processId } }),
    getProcessStepperCounts(processId),
  ]);

  const rows = buildAuthorityTableRows(
    steps,
    activities.map((a) => ({ id: a.id, name: a.name, relatedStepId: a.relatedStepId, order: a.order })),
    assignments.map((a) => ({
      ...a,
      threshold: a.threshold === null ? null : Number(a.threshold),
      coApprovalAboveThreshold: a.coApprovalAboveThreshold === null ? null : Number(a.coApprovalAboveThreshold),
    }))
  );

  const issues = validateAuthorityTable(rows);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {process.code} · {process.name}
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/export/authority/${processId}?format=pdf`}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export PDF
          </a>
          <a
            href={`/api/export/authority/${processId}?format=xlsx`}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export Excel
          </a>
          <a
            href={`/workspaces/${workspaceId}/processes/${processId}/review`}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            AI Review →
          </a>
        </div>
      </div>
      <h1 className="text-xl font-semibold text-slate-900">Authority Matrix</h1>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        How long each task may take, the amount its rule turns on, which side of that amount needs approval, and who
        signs, co-signs, or picks it up when it stalls.
      </p>

      <ProcessStepper workspaceId={workspaceId} processId={processId} {...stepperCounts} />

      <AuthorityTable
        workspaceId={workspaceId}
        processId={processId}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
        people={people.map((p) => ({ id: p.id, name: p.name }))}
        initialRows={rows}
        initialIssues={issues}
      />
    </main>
  );
}
