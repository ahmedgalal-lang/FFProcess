import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getProcessStepperCounts } from "@/lib/data/process-stepper-data";
import { AddStepForm, BulkAddStepsForm } from "./step-form";
import { MapView } from "./map-view";
import { ProcessStepper } from "../process-stepper";
import { ProcessDocumentation } from "./process-documentation";

export default async function ProcessMapPage(
  props: PageProps<"/workspaces/[workspaceId]/processes/[processId]/map">
) {
  const { workspaceId, processId } = await props.params;

  const process = await prisma.process.findUnique({
    where: { id: processId },
    include: {
      parentProcess: true,
      branchFromStep: {
        select: { id: true, label: true, processId: true, process: { select: { id: true, code: true } } },
      },
      steps: {
        include: {
          assignedRole: true,
          swimlaneRole: true,
          links: { include: { targetProcess: true } },
          // Processes that pick up from this step — the other end of a branch.
          branchedProcesses: { select: { id: true, code: true, name: true }, orderBy: { code: "asc" } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!process || process.workspaceId !== workspaceId) notFound();

  const [roles, otherProcesses, connections, stepperCounts] = await Promise.all([
    prisma.role.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.process.findMany({
      where: { workspaceId, archivedAt: null, id: { not: processId } },
      orderBy: { code: "asc" },
    }),
    prisma.stepConnection.findMany({ where: { processId } }),
    getProcessStepperCounts(processId),
  ]);

  const externalEntities = process.externalEntities as unknown as { name: string; description: string }[];

  // The step this process picks up from, if any. Its number comes from the
  // source process's own step order, so it matches what that map shows.
  let branchFrom: {
    stepId: string;
    stepLabel: string;
    stepNumber: number;
    sourceProcessId: string;
    sourceProcessCode: string;
  } | null = null;
  if (process.branchFromStep) {
    const sourceSteps = await prisma.processStep.findMany({
      where: { processId: process.branchFromStep.processId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    branchFrom = {
      stepId: process.branchFromStep.id,
      stepLabel: process.branchFromStep.label,
      stepNumber: sourceSteps.findIndex((s) => s.id === process.branchFromStep!.id) + 1,
      sourceProcessId: process.branchFromStep.process.id,
      sourceProcessCode: process.branchFromStep.process.code,
    };
  }

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
        steps={process.steps.map((s) => ({ ...s, branches: s.branchedProcesses }))}
        connections={connections}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
        branchFrom={branchFrom}
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
    </main>
  );
}
