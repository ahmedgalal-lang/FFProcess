import { prisma } from "@/lib/db/client";
import { buildRaciTableRows } from "@/lib/domain/raci-table";
import { buildAuthorityTableRows, DIRECTION_LABELS, requiresApproval } from "@/lib/domain/authority-table";
import { buildStepAuthoritySummary } from "@/lib/domain/step-authority-summary";
import {
  buildCombinedMatrixRows,
  deriveControlPoints,
  deriveDocumentationGaps,
  deriveProcessOwnerRoleId,
  involvedRoleIds,
  deriveRoleDuties,
} from "@/lib/domain/process-report";
import { valueChainSummary, type ActivityCard, type PhaseRef } from "@/lib/domain/value-chain";
import type { RailProcess } from "@/lib/domain/milestone-rails";
import type { ExportProcessData, ValueChainColumn } from "@/app/reports/[workspaceId]/export-preview";

export type ReportData = {
  workspaceId: string;
  companyName: string;
  /// The consulting firm producing this report — printed on the cover as
  /// "Prepared by", distinct from companyName (the client whose processes
  /// this documents).
  firmName: string;
  industry: string | null;
  description: string | null;
  accentColor: string | null;
  accentColorTertiary: string | null;
  accentSecondary: string | null;
  people: { id: string; name: string; managerId: string | null; roleNames: string[] }[];
  processes: ExportProcessData[];
  valueChain: ValueChainColumn[];
  unphasedActivityCount: number;
  railProcesses: RailProcess[];
};

/**
 * Everything the Export Report needs, for a given workspace and the set of
 * processes picked on the export picker — shared between the on-screen/PDF
 * preview (export-preview.tsx, rendered by app/reports/[workspaceId]/page.tsx)
 * and the PPTX download, so the two can never quietly drift apart into two
 * different reports.
 */
export async function loadReportData(workspaceId: string, processIds: string[]): Promise<ReportData | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { firm: { select: { name: true } } },
  });
  if (!workspace) return null;

  const [people, roles, processes, phases, chainSteps, railSourceProcesses] = await Promise.all([
    prisma.person.findMany({
      where: { workspaceId, archivedAt: null },
      include: { personRoles: { include: { role: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.role.findMany({ where: { workspaceId } }),
    prisma.process.findMany({
      where: { id: { in: processIds }, workspaceId, archivedAt: null },
      include: { parentProcess: { select: { code: true, name: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.phase.findMany({ where: { workspaceId }, orderBy: [{ order: "asc" }, { name: "asc" }] }),
    prisma.processStep.findMany({
      where: { processId: { in: processIds }, process: { workspaceId, archivedAt: null } },
      select: {
        id: true,
        label: true,
        phaseId: true,
        phaseOrder: true,
        milestone: true,
        detailedAction: true,
        processId: true,
        process: { select: { code: true } },
        assignedRole: { select: { id: true, name: true } },
        supportingRoles: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        links: { select: { targetProcess: { select: { code: true } } } },
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.process.findMany({
      where: { id: { in: processIds }, workspaceId, archivedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        branchFromStepId: true,
        _count: { select: { steps: true } },
        steps: {
          select: {
            id: true,
            label: true,
            type: true,
            milestone: true,
            links: { where: { targetProcessId: { in: processIds } }, select: { targetProcessId: true } },
            branchedProcesses: {
              where: { id: { in: processIds } },
              select: { code: true },
              orderBy: { code: "asc" },
            },
          },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { code: "asc" },
    }),
  ]);

  const chainCards: ActivityCard[] = chainSteps.map((step) => ({
    stepId: step.id,
    label: step.label,
    description: step.detailedAction.join(" "),
    processId: step.processId,
    processCode: step.process.code,
    ownerName: step.assignedRole?.name ?? null,
    ownerId: step.assignedRole?.id ?? null,
    supportNames: step.supportingRoles.map((role) => role.name),
    supportIds: step.supportingRoles.map((role) => role.id),
    phaseId: step.phaseId,
    phaseOrder: step.phaseOrder,
    linksTo: step.links.map((link) => link.targetProcess.code),
    isMilestone: step.milestone,
  }));

  const phaseRefs: PhaseRef[] = phases.map((phase) => ({
    id: phase.id,
    name: phase.name,
    order: phase.order,
    color: phase.color,
  }));

  const stepIndex = new Map<string, { processId: string }>();
  for (const process of railSourceProcesses) {
    for (const step of process.steps) stepIndex.set(step.id, { processId: process.id });
  }
  const railCodeById = new Map(railSourceProcesses.map((p) => [p.id, p.code]));

  const railProcesses: RailProcess[] = railSourceProcesses.map((process) => ({
    id: process.id,
    code: process.code,
    name: process.name,
    stepCount: process._count.steps,
    branchFrom:
      process.branchFromStepId && stepIndex.has(process.branchFromStepId)
        ? { processId: stepIndex.get(process.branchFromStepId)!.processId, stepId: process.branchFromStepId }
        : null,
    steps: process.steps.map((step, i) => ({
      id: step.id,
      label: step.label,
      type: step.type,
      number: i + 1,
      milestone: step.milestone,
      linksTo: step.links.flatMap((link) => railCodeById.get(link.targetProcessId) ?? []),
      branchedBy: step.branchedProcesses.map((p) => p.code),
    })),
  }));

  const chain = valueChainSummary(chainCards, phaseRefs);
  const valueChain: ValueChainColumn[] = chain.columns.map((column) => ({
    title: column.title,
    color: column.color,
    activities: column.cards.map((activity) => ({
      stepId: activity.stepId,
      label: activity.label,
      ownerName: activity.ownerName,
      supportNames: activity.supportNames,
      processCode: activity.processCode,
      linksTo: activity.linksTo,
    })),
  }));

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  const personNameById = new Map(people.map((p) => [p.id, p.name]));

  const processData: ExportProcessData[] = await Promise.all(
    processes.map(async (process) => {
      const [steps, connections, activities, authorityAssignments] = await Promise.all([
        prisma.processStep.findMany({
          where: { processId: process.id },
          include: { assignedRole: true, swimlaneRole: true, links: { include: { targetProcess: true } } },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        }),
        prisma.stepConnection.findMany({ where: { processId: process.id } }),
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

      const authorityActivities = activities.map((a) => ({
        id: a.id,
        name: a.name,
        relatedStepId: a.relatedStepId,
        order: a.order,
      }));
      const authorityAssignmentData = authorityAssignments.map((a) => ({
        ...a,
        threshold: a.threshold === null ? null : Number(a.threshold),
        coApprovalAboveThreshold: a.coApprovalAboveThreshold === null ? null : Number(a.coApprovalAboveThreshold),
      }));

      const authorityRows = buildAuthorityTableRows(steps, authorityActivities, authorityAssignmentData);

      // Same per-step SLA/threshold lookup the live Process Map card uses —
      // keyed by stepId rather than the row's own id, which is ambiguous
      // between an Activity id and a Step id (see step-authority-summary.ts).
      const authorityByStepId = buildStepAuthoritySummary(steps, authorityActivities, authorityAssignmentData);

      const combinedRows = buildCombinedMatrixRows(raciRows, authorityRows);
      const controlPoints = deriveControlPoints(combinedRows, roleNameById);
      const ownerRoleId = deriveProcessOwnerRoleId(combinedRows);
      const matrixRoleIds = roles
        .filter((r) => combinedRows.some((row) => row.raciAssignments[r.id]))
        .map((r) => r.id);
      const involved = involvedRoleIds(combinedRows);
      const kpis = process.kpis as unknown as { metric: string; target: string; frequency: string }[];
      const externalEntities = process.externalEntities as unknown as { name: string; description: string }[];

      return {
        id: process.id,
        code: process.code,
        name: process.name,
        description: process.description,
        parentCode: process.parentProcess?.code ?? null,
        parentName: process.parentProcess?.name ?? null,
        processPurpose: process.processPurpose,
        inScope: process.inScope,
        outOfScope: process.outOfScope,
        externalEntities,
        kpis,
        steps: steps.map((s) => ({
          id: s.id,
          type: s.type,
          label: s.label,
          positionX: s.positionX,
          positionY: s.positionY,
          detailedAction: s.detailedAction,
          exceptionHandling: s.exceptionHandling,
          assignedRole: s.assignedRole ? { id: s.assignedRole.id, name: s.assignedRole.name } : null,
          swimlaneRole: s.swimlaneRole ? { id: s.swimlaneRole.id, name: s.swimlaneRole.name } : null,
          links: s.links.map((l) => ({
            id: l.id,
            targetProcessId: l.targetProcessId,
            targetProcess: { code: l.targetProcess.code, name: l.targetProcess.name },
          })),
          slaDays: authorityByStepId.get(s.id)?.slaDays ?? null,
          threshold: authorityByStepId.get(s.id)?.threshold ?? null,
          direction: authorityByStepId.get(s.id)?.direction,
        })),
        connections: connections.map((c) => ({ id: c.id, fromStepId: c.fromStepId, toStepId: c.toStepId, label: c.label })),
        matrixRoles: matrixRoleIds.map((id) => ({ id, name: roleNameById.get(id) ?? "Unknown" })),
        combinedRows: combinedRows.map((row) => ({
          rowId: row.rowId,
          label: row.label,
          stepType: row.stepType,
          raci: row.raciAssignments,
          approverLabel: row.approverRoleId
            ? (roleNameById.get(row.approverRoleId) ?? null)
            : row.approverPersonId
              ? (personNameById.get(row.approverPersonId) ?? null)
              : null,
          slaDays: row.slaDays,
          threshold: row.threshold,
          directionLabel: DIRECTION_LABELS[row.direction].label,
          requiresApproval: requiresApproval(row.direction),
          coApprovalAboveThreshold: row.coApprovalAboveThreshold,
          coApproverLabel: row.coApproverRoleId ? (roleNameById.get(row.coApproverRoleId) ?? null) : null,
          escalationLabel: row.escalationRoleId ? (roleNameById.get(row.escalationRoleId) ?? null) : null,
        })),
        involvedRoles: involved.map((roleId) => ({
          id: roleId,
          name: roleNameById.get(roleId) ?? "Unknown",
          duties: deriveRoleDuties(combinedRows, roleId).duties,
        })),
        controlPoints,
        processOwnerName: ownerRoleId ? (roleNameById.get(ownerRoleId) ?? null) : null,
        triggerLabel: steps.find((s) => s.type === "START")?.label ?? null,
        outputLabel: steps.find((s) => s.type === "END")?.label ?? null,
        gaps: deriveDocumentationGaps({
          processPurpose: process.processPurpose,
          inScope: process.inScope,
          outOfScope: process.outOfScope,
          externalEntities,
          steps: steps.map((s) => ({ detailedAction: s.detailedAction, exceptionHandling: s.exceptionHandling })),
          kpis,
        }),
      };
    })
  );

  return {
    workspaceId,
    companyName: workspace.name,
    firmName: workspace.firm.name,
    industry: workspace.industry,
    description: workspace.description,
    accentColor: workspace.accentColor,
    accentColorTertiary: workspace.accentColorTertiary,
    accentSecondary: workspace.accentColorSecondary,
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      managerId: p.managerId,
      roleNames: p.personRoles.map((pr) => pr.role.name),
    })),
    processes: processData,
    valueChain,
    unphasedActivityCount: chain.unphasedCount,
    railProcesses,
  };
}
