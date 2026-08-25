import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { buildRaciTableRows } from "@/lib/domain/raci-table";
import { buildAuthorityTableRows } from "@/lib/domain/authority-table";
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
      ).filter((r) => !r.skipped);

      const authorityRows = buildAuthorityTableRows(
        steps,
        activities.map((a) => ({ id: a.id, name: a.name, relatedStepId: a.relatedStepId, order: a.order })),
        authorityAssignments.map((a) => ({
          ...a,
          threshold: a.threshold === null ? null : Number(a.threshold),
          coApprovalAboveThreshold: a.coApprovalAboveThreshold === null ? null : Number(a.coApprovalAboveThreshold),
        }))
      )
        .filter((r) => !r.skipped)
        .map((r) => ({
          id: r.id,
          label: r.label,
          unit: r.unit,
          threshold: r.threshold,
          approverLabel: r.approverRoleId
            ? (roleNameById.get(r.approverRoleId) ?? null)
            : r.approverPersonId
              ? (personNameById.get(r.approverPersonId) ?? null)
              : null,
          coApprovalAboveThreshold: r.coApprovalAboveThreshold,
          coApproverLabel: r.coApproverRoleId ? (roleNameById.get(r.coApproverRoleId) ?? null) : null,
        }));

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
        raciRoles: roles
          .filter((r) => raciRows.some((row) => row.assignments[r.id]))
          .map((r) => ({ id: r.id, name: r.name })),
        raciRows: raciRows.map((r) => ({ id: r.id, label: r.label, stepType: r.stepType, assignments: r.assignments })),
        authorityRows,
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
