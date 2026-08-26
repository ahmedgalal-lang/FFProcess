import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getProcessStepperCounts } from "@/lib/data/process-stepper-data";
import { buildRaciTableRows } from "@/lib/domain/raci-table";
import { buildAuthorityTableRows } from "@/lib/domain/authority-table";
import { buildCombinedMatrixRows, deriveControlPoints } from "@/lib/domain/process-report";
import { AddStepForm, BulkAddStepsForm } from "./step-form";
import { MapView } from "./map-view";
import { ProcessStepper } from "../process-stepper";
import { ProcessDocumentation } from "./process-documentation";
import { ProcessKpisControls } from "./process-kpis-controls";

export default async function ProcessMapPage(
  props: PageProps<"/workspaces/[workspaceId]/processes/[processId]/map">
) {
  const { workspaceId, processId } = await props.params;

  const process = await prisma.process.findUnique({
    where: { id: processId },
    include: {
      parentProcess: true,
      steps: {
        include: {
          assignedRole: true,
          swimlaneRole: true,
          links: { include: { targetProcess: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!process || process.workspaceId !== workspaceId) notFound();

  const [roles, otherProcesses, connections, stepperCounts, activities, authorityAssignments] = await Promise.all([
    prisma.role.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.process.findMany({
      where: { workspaceId, archivedAt: null, id: { not: processId } },
      orderBy: { code: "asc" },
    }),
    prisma.stepConnection.findMany({ where: { processId } }),
    getProcessStepperCounts(processId),
    prisma.activity.findMany({
      where: { processId },
      include: { raciAssignments: true },
      orderBy: { order: "asc" },
    }),
    prisma.authorityAssignment.findMany({ where: { processId } }),
  ]);

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  const raciRows = buildRaciTableRows(
    process.steps,
    activities.map((a) => ({
      id: a.id,
      name: a.name,
      relatedStepId: a.relatedStepId,
      order: a.order,
      assignments: a.raciAssignments.map((ra) => ({ roleId: ra.roleId, code: ra.code })),
    }))
  );
  const authorityRows = buildAuthorityTableRows(
    process.steps,
    activities.map((a) => ({ id: a.id, name: a.name, relatedStepId: a.relatedStepId, order: a.order })),
    authorityAssignments.map((a) => ({
      ...a,
      threshold: a.threshold === null ? null : Number(a.threshold),
      coApprovalAboveThreshold: a.coApprovalAboveThreshold === null ? null : Number(a.coApprovalAboveThreshold),
    }))
  );
  const controlPoints = deriveControlPoints(buildCombinedMatrixRows(raciRows, authorityRows), roleNameById);
  const kpis = process.kpis as unknown as { metric: string; target: string; frequency: string }[];
  const externalEntities = process.externalEntities as unknown as { name: string; description: string }[];

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      {process.parentProcess && (
        <div className="mb-1 text-xs text-slate-500">
          {process.parentProcess.code} · {process.parentProcess.name} <span className="mx-1">/</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-900">{process.name}</h1>
        <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-xs font-bold text-indigo-700">
          {process.code}
        </span>
      </div>
      <p className="mt-1 mb-2 text-sm text-slate-500">
        {process.steps.length} step(s) ·{" "}
        <a href={`/workspaces/${workspaceId}/processes/${processId}/raci`} className="font-semibold text-slate-700 hover:text-slate-900">
          Build RACI →
        </a>{" "}
        ·{" "}
        <a href={`/workspaces/${workspaceId}/processes/${processId}/review`} className="font-semibold text-slate-700 hover:text-slate-900">
          AI Review →
        </a>
      </p>

      <ProcessStepper workspaceId={workspaceId} processId={processId} {...stepperCounts} />

      <ProcessDocumentation
        workspaceId={workspaceId}
        processId={processId}
        processPurpose={process.processPurpose}
        inScope={process.inScope}
        outOfScope={process.outOfScope}
        externalEntities={externalEntities}
      />

      <div className="mt-5" />

      <MapView
        workspaceId={workspaceId}
        processId={processId}
        processCode={process.code}
        steps={process.steps}
        connections={connections}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
      />

      <div className="mt-5 flex flex-col gap-3">
        <AddStepForm
          workspaceId={workspaceId}
          processId={processId}
          roles={roles.map((r) => ({ id: r.id, name: r.name }))}
          steps={process.steps.map((s) => ({ id: s.id, label: s.label, type: s.type }))}
          otherProcesses={otherProcesses.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
        />
        <BulkAddStepsForm workspaceId={workspaceId} processId={processId} />
      </div>

      <ProcessKpisControls
        workspaceId={workspaceId}
        processId={processId}
        kpis={kpis}
        controlPoints={controlPoints}
      />
    </main>
  );
}
