import { prisma } from "@/lib/db/client";
import { WorkspacePageHeader } from "../workspace-page-header";
import { buildRaciTableRows } from "@/lib/domain/raci-table";
import { buildAuthorityTableRows } from "@/lib/domain/authority-table";
import { buildCombinedMatrixRows, deriveControlPoints } from "@/lib/domain/process-report";
import { ProcessKpisControls } from "./process-kpis-controls";

/**
 * Governance across the whole engagement: every process's Key Control Points
 * (derived from its Authority Matrix) and its Operational KPIs, in one place
 * instead of buried at the bottom of each Process Map. The data stays
 * per-process — the Export Report renders each process's own governance
 * section — so this page is a consolidated view over it, grouped by process.
 */
export default async function GovernancePage(props: PageProps<"/workspaces/[workspaceId]/governance">) {
  const { workspaceId } = await props.params;

  const [workspace, roles, processes] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    prisma.role.findMany({ where: { workspaceId } }),
    prisma.process.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { code: "asc" } }),
  ]);

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));

  const sections = await Promise.all(
    processes.map(async (process) => {
      const [steps, activities, authorityAssignments] = await Promise.all([
        prisma.processStep.findMany({ where: { processId: process.id }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
        prisma.activity.findMany({
          where: { processId: process.id },
          include: { raciAssignments: true },
          orderBy: { order: "asc" },
        }),
        prisma.authorityAssignment.findMany({ where: { processId: process.id } }),
      ]);

      const raciRows = buildRaciTableRows(
        steps,
        activities.map((a) => ({
          id: a.id,
          name: a.name,
          relatedStepId: a.relatedStepId,
          order: a.order,
          assignments: a.raciAssignments.map((ra) => ({ roleId: ra.roleId, code: ra.code })),
        }))
      );
      const authorityRows = buildAuthorityTableRows(
        steps,
        activities.map((a) => ({ id: a.id, name: a.name, relatedStepId: a.relatedStepId, order: a.order })),
        authorityAssignments.map((a) => ({
          ...a,
          threshold: a.threshold === null ? null : Number(a.threshold),
          coApprovalAboveThreshold: a.coApprovalAboveThreshold === null ? null : Number(a.coApprovalAboveThreshold),
        }))
      );

      return {
        id: process.id,
        code: process.code,
        name: process.name,
        kpis: process.kpis as unknown as { metric: string; target: string; frequency: string }[],
        controlPoints: deriveControlPoints(buildCombinedMatrixRows(raciRows, authorityRows), roleNameById),
      };
    })
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <WorkspacePageHeader
        title="Governance, Controls & Metrics"
        subtitle="Key Control Points come from each process's Authority Matrix. KPIs are set here, and both appear as the final section of that process's Export Report."
      />

      {sections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
          No processes yet in {workspace.name}.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {sections.map((section) => (
            <ProcessKpisControls
              key={section.id}
              workspaceId={workspaceId}
              processId={section.id}
              processCode={section.code}
              processName={section.name}
              kpis={section.kpis}
              controlPoints={section.controlPoints}
            />
          ))}
        </div>
      )}
    </main>
  );
}
