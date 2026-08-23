import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { validateRaciMatrix } from "@/lib/domain/raci-validation";
import { partitionRaciQueue } from "@/lib/domain/raci-queue";
import { getProcessStepperCounts } from "@/lib/data/process-stepper-data";
import { RaciGrid } from "./raci-grid";
import { AddActivityForm } from "./activity-form";
import { RaciStepQueue } from "./raci-step-queue";
import { ProcessStepper } from "../process-stepper";

export default async function RaciMatrixPage(
  props: PageProps<"/workspaces/[workspaceId]/processes/[processId]/raci">
) {
  const { workspaceId, processId } = await props.params;

  const process = await prisma.process.findUnique({ where: { id: processId } });
  if (!process || process.workspaceId !== workspaceId) notFound();

  const [roles, activities, matrixStatus, steps, stepperCounts] = await Promise.all([
    prisma.role.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.activity.findMany({
      where: { processId },
      include: { raciAssignments: true },
      orderBy: { order: "asc" },
    }),
    prisma.raciMatrixStatus.findUnique({ where: { processId } }),
    prisma.processStep.findMany({
      where: { processId },
      select: { id: true, type: true, label: true, raciSkipped: true },
      orderBy: { createdAt: "asc" },
    }),
    getProcessStepperCounts(processId),
  ]);

  const activitiesForGrid = activities.map((a) => ({
    id: a.id,
    name: a.name,
    assignments: Object.fromEntries(a.raciAssignments.map((ra) => [ra.roleId, ra.code])),
  }));

  const issues = validateRaciMatrix(
    activities.map((a) => ({
      activityId: a.id,
      name: a.name,
      assignments: a.raciAssignments.map((ra) => ({ roleId: ra.roleId, code: ra.code })),
    }))
  );

  const stepIdsWithActivity = new Set(
    activities.map((a) => a.relatedStepId).filter((id): id is string => id !== null)
  );
  const { pending, skipped } = partitionRaciQueue(steps, stepIdsWithActivity);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {process.code} · {process.name}
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/export/raci/${processId}?format=pdf`}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export PDF
          </a>
          <a
            href={`/api/export/raci/${processId}?format=xlsx`}
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
      <h1 className="text-xl font-semibold text-slate-900">RACI Matrix</h1>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        Click a cell to cycle Responsible → Accountable → Consulted → Informed → clear.
      </p>

      <ProcessStepper workspaceId={workspaceId} processId={processId} {...stepperCounts} />

      <RaciStepQueue
        workspaceId={workspaceId}
        processId={processId}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
        pendingSteps={pending.map((s) => ({ id: s.id, type: s.type, label: s.label }))}
        skippedSteps={skipped.map((s) => ({ id: s.id, type: s.type, label: s.label }))}
        handledCount={steps.length - pending.length - skipped.length}
        totalCount={steps.length}
      />

      <RaciGrid
        workspaceId={workspaceId}
        processId={processId}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
        initialActivities={activitiesForGrid}
        initialIssues={issues}
        initialStatus={matrixStatus?.status ?? "DRAFT"}
      />

      <AddActivityForm workspaceId={workspaceId} processId={processId} />
    </main>
  );
}
