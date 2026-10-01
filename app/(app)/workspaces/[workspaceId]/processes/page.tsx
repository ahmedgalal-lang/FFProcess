import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { WorkspacePageHeader } from "../workspace-page-header";
import { CreateProcessForm } from "./process-forms";
import { ProcessTable } from "./process-table";
import { GenerateTemplateForm } from "./template-form";
import { ImportPanel } from "./import-panel";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { hasSufficientAccess } from "@/lib/domain/access-control";
import { orderProcessTree } from "@/lib/domain/process-hierarchy";

export default async function ProcessesPage(props: PageProps<"/workspaces/[workspaceId]/processes">) {
  const { workspaceId } = await props.params;
  const searchParams = await props.searchParams;
  const qRaw = searchParams["q"];
  const q = (typeof qRaw === "string" ? qRaw : "").trim();

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });

  // The layout has already admitted this viewer; this re-reads the level so the
  // recovery link is offered only to someone who could act on it.
  const access = await requireWorkspaceAccess(workspaceId, "VIEWER");
  const canEdit = access.ok && hasSufficientAccess(access.data.accessLevel, "EDITOR");

  const [processes, categories, deletedCount] = await Promise.all([
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
        steps: { select: { id: true, label: true }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
        branchFromStep: { select: { id: true, label: true, process: { select: { id: true, code: true } } } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.processCategory.findMany({ where: { firmId: workspace.firmId }, orderBy: { name: "asc" } }),
    prisma.process.count({ where: { workspaceId, archivedAt: { not: null } } }),
  ]);

  const processOptions = processes.map((proc) => ({
    id: proc.id,
    code: proc.code,
    name: proc.name,
    steps: proc.steps.map((step) => ({ id: step.id, label: step.label })),
  }));

  // Group as a tree: a parent, then its children, to whatever depth the data
  // goes. This was built inline as a *two-level* tree — top-level processes,
  // each followed by its direct children, plus any child whose parent was
  // missing — and a process nested one level deeper than that was in none of
  // those buckets and silently vanished from the list. It still opened by URL
  // and search still found it, because search shows matches flat and skips
  // the grouping entirely, which is exactly how it was reported: "it's not
  // displayed, I have to search for it."
  //
  // Search results stay flat (by code) — a match's parent may not itself match.
  const rows = q
    ? processes.map((process) => ({ process, depth: 0 }))
    : orderProcessTree(processes);

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

      {canEdit && (
        <p className="mt-3 text-xs">
          <Link
            href={`/workspaces/${workspaceId}/processes/deleted`}
            className="font-semibold text-slate-600 underline hover:text-slate-900"
          >
            Deleted processes
            {deletedCount > 0 ? ` (${deletedCount})` : ""}
          </Link>
          <span className="ms-2 text-slate-600">Deleting hides a process — it can be brought back.</span>
        </p>
      )}

      <ProcessTable
        workspaceId={workspaceId}
        rows={rows.map(({ process: p, depth }) => ({
          id: p.id,
          depth,
          code: p.code,
          name: p.name,
          description: p.description ?? "",
          categoryId: p.categoryId,
          categoryName: p.category?.name ?? null,
          parentProcessId: p.parentProcessId,
          parentCode: p.parentProcess?.code ?? null,
          parentArchived: Boolean(p.parentProcess?.archivedAt),
          branchFromStepId: p.branchFromStepId,
          branchFrom: p.branchFromStep
            ? { processId: p.branchFromStep.process.id, code: p.branchFromStep.process.code, label: p.branchFromStep.label }
            : null,
          stepCount: p._count.steps,
          raci: p.raciMatrixStatus?.status ?? null,
        }))}
        processOptions={processOptions}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        emptyMessage={q ? `No processes match "${q}".` : "No processes yet — create one below."}
      />

      <div className="mt-4 flex flex-col gap-3">
        <CreateProcessForm
          workspaceId={workspaceId}
          processes={processOptions}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        />
        <GenerateTemplateForm workspaceId={workspaceId} />
        {canEdit && <ImportPanel workspaceId={workspaceId} />}
      </div>
    </main>
  );
}
