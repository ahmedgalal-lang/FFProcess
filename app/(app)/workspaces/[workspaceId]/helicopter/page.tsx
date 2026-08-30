import { prisma } from "@/lib/db/client";
import { WorkspacePageHeader } from "../workspace-page-header";
import { buildProcessLandscape, describeLandscape } from "@/lib/domain/process-landscape";
import type { LandscapeProcessInput } from "./landscape-canvas";
import type { RailProcess } from "@/lib/domain/milestone-rails";
import { HelicopterView } from "./helicopter-view";

/**
 * The whole engagement in one picture: every process as a card, connected by
 * how work actually moves between them — a process that resumes from a step of
 * another (a branch), and a step that hands off to another process (a link).
 *
 * Each process's own map stays the place you edit; this is the level above it,
 * for the conversation about how the pieces fit together.
 */
export default async function HelicopterViewPage(props: PageProps<"/workspaces/[workspaceId]/helicopter">) {
  const { workspaceId } = await props.params;

  const [workspace, processes] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    prisma.process.findMany({
      where: { workspaceId, archivedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        branchFromStepId: true,
        parentProcess: { select: { code: true } },
        _count: { select: { steps: true } },
        // Every step of every process, in one query rather than per-process:
        // they supply both the outgoing links and the step numbering a branch
        // origin is described by.
        steps: {
          select: {
            id: true,
            label: true,
            type: true,
            milestone: true,
            links: { select: { targetProcessId: true } },
            branchedProcesses: { select: { code: true }, orderBy: { code: "asc" } },
          },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { code: "asc" },
    }),
  ]);

  // Where each step sits: which process owns it, its label, and its position in
  // that process's own order — so a branch reads the same here as on the map.
  const stepIndex = new Map<string, { processId: string; processCode: string; label: string; number: number }>();
  for (const process of processes) {
    process.steps.forEach((step, i) => {
      stepIndex.set(step.id, {
        processId: process.id,
        processCode: process.code,
        label: step.label,
        number: i + 1,
      });
    });
  }

  const landscapeProcesses: LandscapeProcessInput[] = processes.map((process) => {
    const origin = process.branchFromStepId ? stepIndex.get(process.branchFromStepId) : undefined;
    return {
      id: process.id,
      code: process.code,
      name: process.name,
      stepCount: process._count.steps,
      parentCode: process.parentProcess?.code ?? null,
      branchFrom: origin
        ? { processId: origin.processId, stepLabel: origin.label, stepNumber: origin.number }
        : null,
      branchFromCode: origin?.processCode ?? null,
      linksTo: process.steps.flatMap((step) =>
        step.links.map((link) => ({ targetProcessId: link.targetProcessId, fromStepLabel: step.label }))
      ),
    };
  });

  const codeById = new Map(processes.map((p) => [p.id, p.code]));

  // The same processes, described the way the rails need them: every step that
  // earns a bead — a marked milestone, or a junction another process depends on.
  const railProcesses: RailProcess[] = landscapeProcesses.map((landscapeProcess) => {
    const source = processes.find((p) => p.id === landscapeProcess.id)!;
    return {
      id: source.id,
      code: source.code,
      name: source.name,
      stepCount: source._count.steps,
      branchFrom:
        source.branchFromStepId && stepIndex.has(source.branchFromStepId)
          ? {
              processId: stepIndex.get(source.branchFromStepId)!.processId,
              stepId: source.branchFromStepId,
            }
          : null,
      steps: source.steps.map((step, i) => ({
        id: step.id,
        label: step.label,
        type: step.type,
        number: i + 1,
        milestone: step.milestone,
        linksTo: step.links.flatMap((link) => codeById.get(link.targetProcessId) ?? []),
        branchedBy: step.branchedProcesses.map((p) => p.code),
      })),
    };
  });

  const landscape = buildProcessLandscape(landscapeProcesses);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <WorkspacePageHeader
        title="Helicopter View"
        subtitle={`How ${workspace.name}'s processes connect — ${describeLandscape(landscape)}.`}
      />

      <HelicopterView
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        cardProcesses={landscapeProcesses}
        railProcesses={railProcesses}
      />

      <section className="mt-5">
        <h2 className="text-sm font-semibold text-slate-900">Connections</h2>
        {landscape.edges.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
            Nothing connects these processes yet. Link a step to another process from its Process Map, or set a
            process to branch from a step of another when you create or edit it.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {landscape.edges.map((edge) => (
              <li
                key={edge.id}
                className={`rounded-lg border-l-[3px] bg-white px-3 py-2 text-sm text-slate-700 shadow-sm ${
                  edge.kind === "branch" ? "border-l-amber-500" : "border-l-indigo-600"
                }`}
              >
                <span className="mr-2 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  {edge.kind === "branch" ? "Branch" : "Step link"}
                </span>
                {edge.description}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
