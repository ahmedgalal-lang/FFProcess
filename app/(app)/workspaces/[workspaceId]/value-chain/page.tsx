import { prisma } from "@/lib/db/client";
import { WorkspacePageHeader } from "../workspace-page-header";
import type { ActivityCard, PhaseRef } from "@/lib/domain/value-chain";
import { deriveGapsByStep } from "@/lib/domain/step-readiness";
import { ValueChainBoard } from "./value-chain-board";
import { ValueChainSetup } from "./value-chain-setup";

/**
 * The engagement's value chain: every step across every process, columned by
 * the phase it belongs to, so one page shows how work travels from an RFQ
 * landing to the money being collected.
 *
 * The Helicopter View answers how processes connect; this answers what happens
 * in what order, and who owns each part — the table a client actually reviews.
 * Both read the same steps the Process Map holds.
 */
export default async function ValueChainPage(props: PageProps<"/workspaces/[workspaceId]/value-chain">) {
  const { workspaceId } = await props.params;

  const [workspace, phases, processes, roles, steps, connections, activities, authorityAssignments] =
    await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    prisma.phase.findMany({ where: { workspaceId }, orderBy: [{ order: "asc" }, { name: "asc" }] }),
    prisma.process.findMany({
      where: { workspaceId, archivedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.role.findMany({
      where: { workspaceId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.processStep.findMany({
      where: { process: { workspaceId, archivedAt: null } },
      select: {
        id: true,
        label: true,
        detailedAction: true,
        phaseId: true,
        phaseOrder: true,
        milestone: true,
        type: true,
        raciSkipped: true,
        processId: true,
        process: { select: { code: true } },
        assignedRole: { select: { id: true, name: true } },
        supportingRoles: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        links: { select: { targetProcess: { select: { code: true } } } },
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    // Enough to say what each activity still needs — the same rules the RACI
    // and Authority matrices validate against, so the board agrees with them.
    prisma.stepConnection.findMany({
      where: { toStep: { process: { workspaceId, archivedAt: null } } },
      select: { toStepId: true },
    }),
    prisma.activity.findMany({
      where: { process: { workspaceId, archivedAt: null } },
      include: { raciAssignments: true },
      orderBy: { order: "asc" },
    }),
    prisma.authorityAssignment.findMany({ where: { process: { workspaceId, archivedAt: null } } }),
  ]);

  // What each activity still needs — derived through the very builders and
  // validators the RACI and Authority pages use, so a card's chip and those
  // pages' flags can never disagree.
  const gapsByStepId = deriveGapsByStep({
    steps: steps.map((step) => ({
      id: step.id,
      type: step.type,
      label: step.label,
      raciSkipped: step.raciSkipped,
    })),
    activities: activities.map((activity) => ({
      id: activity.id,
      name: activity.name,
      relatedStepId: activity.relatedStepId,
      order: activity.order,
      assignments: activity.raciAssignments.map((a) => ({ roleId: a.roleId, code: a.code })),
    })),
    authorityAssignments: authorityAssignments.map((a) => ({
      activityId: a.activityId,
      stepId: a.stepId,
      skipped: a.skipped,
      slaDays: a.slaDays,
      threshold: a.threshold === null ? null : Number(a.threshold),
      direction: a.direction,
      approverRoleId: a.approverRoleId,
      approverPersonId: a.approverPersonId,
      coApprovalAboveThreshold:
        a.coApprovalAboveThreshold === null ? null : Number(a.coApprovalAboveThreshold),
      coApproverRoleId: a.coApproverRoleId,
      escalationRoleId: a.escalationRoleId,
    })),
    incomingStepIds: new Set(connections.map((c) => c.toStepId)),
  });

  const cards: ActivityCard[] = steps.map((step) => ({
    stepId: step.id,
    label: step.label,
    // The step's Detailed Action doubles as the card's description — it's the
    // same "what happens here" the Export Report prints, not a second field to
    // keep in step with it.
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
    gaps: gapsByStepId.get(step.id) ?? [],
  }));

  const phaseRefs: PhaseRef[] = phases.map((phase) => ({
    id: phase.id,
    name: phase.name,
    order: phase.order,
    color: phase.color,
  }));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <WorkspacePageHeader
        title="Value Chain"
        subtitle={`How work moves through ${workspace.name}, phase by phase, across every process.`}
      />

      <ValueChainSetup workspaceId={workspaceId} phases={phaseRefs} processes={processes} />

      <ValueChainBoard
        workspaceId={workspaceId}
        cards={cards}
        phases={phaseRefs}
        processes={processes}
        roles={roles}
      />
    </main>
  );
}
