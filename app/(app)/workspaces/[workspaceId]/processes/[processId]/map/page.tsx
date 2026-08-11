import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { AddStepForm } from "./step-form";

const TYPE_STYLES: Record<string, string> = {
  START: "bg-emerald-50 text-emerald-700",
  END: "bg-emerald-50 text-emerald-700",
  TASK: "bg-slate-100 text-slate-600",
  DECISION: "bg-indigo-50 text-indigo-700",
};

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
          incomingEdges: { include: { fromStep: true } },
          links: { include: { targetProcess: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!process || process.workspaceId !== workspaceId) notFound();

  const [roles, otherProcesses] = await Promise.all([
    prisma.role.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.process.findMany({
      where: { workspaceId, archivedAt: null, id: { not: processId } },
      orderBy: { code: "asc" },
    }),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      {process.parentProcess && (
        <div className="mb-1 text-xs text-slate-400">
          {process.parentProcess.code} · {process.parentProcess.name} <span className="mx-1">/</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-900">{process.name}</h1>
        <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-xs font-bold text-indigo-700">
          {process.code}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">{process.steps.length} step(s) — steps list view.</p>

      <div className="mt-2 mb-5">
        <Link
          href={`/workspaces/${workspaceId}/processes/${processId}/raci`}
          className="text-sm font-semibold text-slate-700 hover:text-slate-900"
        >
          Build RACI →
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {process.steps.map((step, i) => {
          const predecessor = step.incomingEdges[0]?.fromStep;
          return (
            <div key={step.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-indigo-50 font-mono text-xs font-bold text-indigo-700">
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${TYPE_STYLES[step.type]}`}>
                    {step.type}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">{step.label}</span>
                  {step.assignedRole && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {step.assignedRole.name}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {predecessor ? `Connects from: ${predecessor.label}` : "Entry point — no predecessor"}
                </div>
                {step.links.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {step.links.map((link) => (
                      <Link
                        key={link.id}
                        href={`/workspaces/${workspaceId}/processes/${link.targetProcessId}/map`}
                        className="rounded-full border border-dashed border-indigo-300 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50"
                      >
                        🔗 {link.targetProcess.code} — {link.targetProcess.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {process.steps.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No steps yet — add the first one below.
          </p>
        )}
      </div>

      <div className="mt-5">
        <AddStepForm
          workspaceId={workspaceId}
          processId={processId}
          roles={roles.map((r) => ({ id: r.id, name: r.name }))}
          steps={process.steps.map((s) => ({ id: s.id, label: s.label }))}
          otherProcesses={otherProcesses.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
        />
      </div>
    </main>
  );
}
