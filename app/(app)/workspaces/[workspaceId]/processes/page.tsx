import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { WorkspacePageHeader } from "../workspace-page-header";
import { CreateProcessForm, CloneProcessButton, EditProcessButton, ArchiveProcessButton } from "./process-forms";
import { GenerateTemplateForm } from "./template-form";

export default async function ProcessesPage(props: PageProps<"/workspaces/[workspaceId]/processes">) {
  const { workspaceId } = await props.params;
  const searchParams = await props.searchParams;
  const qRaw = searchParams["q"];
  const q = (typeof qRaw === "string" ? qRaw : "").trim();

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });

  const [processes, categories] = await Promise.all([
    prisma.process.findMany({
      where: {
        workspaceId,
        archivedAt: null,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { code: { contains: q, mode: "insensitive" } },
                { category: { name: { contains: q, mode: "insensitive" } } },
                { steps: { some: { label: { contains: q, mode: "insensitive" } } } },
                { activities: { some: { name: { contains: q, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      include: {
        _count: { select: { steps: true } },
        raciMatrixStatus: true,
        parentProcess: true,
        category: true,
        // Steps feed the "Branches from → starts at step" picker; the branch
        // origin feeds the sub-line under a branching process's name.
        steps: { select: { id: true, label: true }, orderBy: { createdAt: "asc" } },
        branchFromStep: { select: { id: true, label: true, process: { select: { id: true, code: true } } } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.processCategory.findMany({ where: { firmId: workspace.firmId }, orderBy: { name: "asc" } }),
  ]);

  const processOptions = processes.map((proc) => ({
    id: proc.id,
    code: proc.code,
    name: proc.name,
    steps: proc.steps.map((step) => ({ id: step.id, label: step.label })),
  }));

  // Group as a simple two-level tree: top-level processes, each followed by its children.
  // Search results are shown flat (by code) instead — a match's parent may not itself match.
  const topLevel = processes.filter((p) => !p.parentProcessId);
  const childrenOf = (id: string) => processes.filter((p) => p.parentProcessId === id);
  const ordered = topLevel.flatMap((p) => [p, ...childrenOf(p.id)]);
  const orphanChildren = processes.filter(
    (p) => p.parentProcessId && !processes.some((parent) => parent.id === p.parentProcessId)
  );
  const rows = q ? processes : [...ordered, ...orphanChildren];

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <WorkspacePageHeader
        title="Processes"
        subtitle="Every process has a unique code and can nest under a main process."
      />

      <form method="GET" className="mt-4 flex items-center gap-2" role="search">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name, code, category, or task…"
          aria-label="Search processes"
          className="w-full max-w-sm rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Search
        </button>
        {q && (
          <Link
            href={`/workspaces/${workspaceId}/processes`}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Process</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Steps</th>
              <th className="px-4 py-2">RACI</th>
              <th className="px-4 py-2 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-700">
                  {p.parentProcessId ? <span className="mr-1 text-slate-300">↳</span> : null}
                  {p.code}
                </td>
                <td className="px-4 py-2 font-medium text-slate-900">
                  {p.name}
                  {p.parentProcessId && (
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      sub-process of {p.parentProcess?.code}
                    </span>
                  )}
                  {p.branchFromStep && (
                    <span className="block text-xs font-normal text-amber-700">
                      ↰ branches from {p.branchFromStep.process.code} · {p.branchFromStep.label}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {p.category ? (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                      {p.category.name}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-500">{p._count.steps}</td>
                <td className="px-4 py-2">
                  {p.raciMatrixStatus ? (
                    <span
                      className={
                        p.raciMatrixStatus.status === "FINAL"
                          ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                          : "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"
                      }
                    >
                      {p.raciMatrixStatus.status === "FINAL" ? "Final" : "Draft"}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <EditProcessButton
                      workspaceId={workspaceId}
                      process={{
                        id: p.id,
                        name: p.name,
                        description: p.description ?? "",
                        categoryId: p.categoryId,
                        parentProcessId: p.parentProcessId,
                        branchFromStepId: p.branchFromStepId,
                        branchFromProcessId: p.branchFromStep?.process.id ?? null,
                      }}
                      processes={processOptions}
                      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
                    />
                    <CloneProcessButton
                      workspaceId={workspaceId}
                      sourceProcessId={p.id}
                      sourceName={p.name}
                      sourceParentProcessId={p.parentProcessId}
                      processes={processOptions}
                    />
                    <ArchiveProcessButton workspaceId={workspaceId} processId={p.id} />
                    <Link
                      href={`/workspaces/${workspaceId}/processes/${p.id}/map`}
                      className="text-xs font-semibold text-slate-700 hover:text-slate-900"
                    >
                      Open →
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {q ? `No processes match "${q}".` : "No processes yet — create one below."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <CreateProcessForm
          workspaceId={workspaceId}
          processes={processOptions}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        />
        <GenerateTemplateForm workspaceId={workspaceId} />
      </div>
    </main>
  );
}
