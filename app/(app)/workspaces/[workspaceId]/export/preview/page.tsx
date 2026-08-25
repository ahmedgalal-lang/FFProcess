import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { buildRaciTableRows } from "@/lib/domain/raci-table";
import { buildAuthorityTableRows } from "@/lib/domain/authority-table";
import {
  buildCombinedMatrixRows,
  deriveControlPoints,
  deriveProcessOwnerRoleId,
  involvedRoleIds,
  describeRoleInvolvement,
} from "@/lib/domain/process-report";
import { ExportPreview, type ExportProcessData } from "./export-preview";

export default async function ExportPreviewPage(
  props: PageProps<"/workspaces/[workspaceId]/export/preview">
) {
  const { workspaceId } = await props.params;
  const searchParams = await props.searchParams;
  const idsRaw = searchParams["ids"];
  const processIds = (Array.isArray(idsRaw) ? idsRaw : idsRaw ? [idsRaw] : []).filter(Boolean);

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) notFound();

  const [people, roles, processes] = await Promise.all([
    prisma.person.findMany({
      where: { workspaceId, archivedAt: null },
      include: { personRoles: { include: { role: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.role.findMany({ where: { workspaceId } }),
    prisma.process.findMany({
      where: { id: { in: processIds }, workspaceId, archivedAt: null },
      orderBy: { code: "asc" },
    }),
  ]);

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  const personNameById = new Map(people.map((p) => [p.id, p.name]));

  const processData: ExportProcessData[] = await Promise.all(
    processes.map(async (process) => {
      const [steps, connections, activities, authorityAssignments] = await Promise.all([
        prisma.processStep.findMany({
          where: { processId: process.id },
          include: { assignedRole: true, swimlaneRole: true, links: { include: { targetProcess: true } } },
          orderBy: { createdAt: "asc" },
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

      const authorityRows = buildAuthorityTableRows(
        steps,
        activities.map((a) => ({ id: a.id, name: a.name, relatedStepId: a.relatedStepId, order: a.order })),
        authorityAssignments.map((a) => ({
          ...a,
          threshold: a.threshold === null ? null : Number(a.threshold),
          coApprovalAboveThreshold: a.coApprovalAboveThreshold === null ? null : Number(a.coApprovalAboveThreshold),
        }))
      );

      const combinedRows = buildCombinedMatrixRows(raciRows, authorityRows);
      const controlPoints = deriveControlPoints(combinedRows, roleNameById);
      const ownerRoleId = deriveProcessOwnerRoleId(combinedRows);
      const matrixRoleIds = roles
        .filter((r) => combinedRows.some((row) => row.raciAssignments[r.id]))
        .map((r) => r.id);
      const involved = involvedRoleIds(combinedRows);

      return {
        id: process.id,
        code: process.code,
        name: process.name,
        description: process.description,
        steps: steps.map((s) => ({
          id: s.id,
          type: s.type,
          label: s.label,
          positionX: s.positionX,
          positionY: s.positionY,
          assignedRole: s.assignedRole ? { id: s.assignedRole.id, name: s.assignedRole.name } : null,
          swimlaneRole: s.swimlaneRole ? { id: s.swimlaneRole.id, name: s.swimlaneRole.name } : null,
          links: s.links.map((l) => ({
            id: l.id,
            targetProcessId: l.targetProcessId,
            targetProcess: { code: l.targetProcess.code, name: l.targetProcess.name },
          })),
        })),
        connections: connections.map((c) => ({ id: c.id, fromStepId: c.fromStepId, toStepId: c.toStepId, label: c.label })),
        matrixRoles: matrixRoleIds.map((id) => ({ id, name: roleNameById.get(id) ?? "Unknown" })),
        combinedRows: combinedRows.map((row) => ({
          rowId: row.rowId,
          label: row.label,
          stepType: row.stepType,
          raci: row.raciAssignments,
          unit: row.unit,
          threshold: row.threshold,
          approverLabel: row.approverRoleId
            ? (roleNameById.get(row.approverRoleId) ?? null)
            : row.approverPersonId
              ? (personNameById.get(row.approverPersonId) ?? null)
              : null,
          coApprovalAboveThreshold: row.coApprovalAboveThreshold,
          coApproverLabel: row.coApproverRoleId ? (roleNameById.get(row.coApproverRoleId) ?? null) : null,
        })),
        involvedRoles: involved.map((roleId) => ({
          id: roleId,
          name: roleNameById.get(roleId) ?? "Unknown",
          involvement: describeRoleInvolvement(combinedRows, roleId),
        })),
        controlPoints,
        processOwnerName: ownerRoleId ? (roleNameById.get(ownerRoleId) ?? null) : null,
        triggerLabel: steps.find((s) => s.type === "START")?.label ?? null,
        outputLabel: steps.find((s) => s.type === "END")?.label ?? null,
      };
    })
  );

  return (
    <ExportPreview
      workspaceId={workspaceId}
      companyName={workspace.name}
      industry={workspace.industry}
      description={workspace.description}
      people={people.map((p) => ({
        id: p.id,
        name: p.name,
        managerId: p.managerId,
        roleNames: p.personRoles.map((pr) => pr.role.name),
      }))}
      processes={processData}
    />
  );
}
