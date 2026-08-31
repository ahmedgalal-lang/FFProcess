import { prisma } from "@/lib/db/client";
import { WorkspacePageHeader } from "../workspace-page-header";
import type { ActivityCard, PhaseRef } from "@/lib/domain/value-chain";
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

  const [workspace, phases, processes, roles, steps] = await Promise.all([
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
        milestone: true,
        processId: true,
        process: { select: { code: true } },
        assignedRole: { select: { id: true, name: true } },
        supportingRoles: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        links: { select: { targetProcess: { select: { code: true } } } },
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
  ]);

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
    linksTo: step.links.map((link) => link.targetProcess.code),
    isMilestone: step.milestone,
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
