import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { CreateProcessForm } from "./process-forms";

export default async function ProcessesPage(props: PageProps<"/workspaces/[workspaceId]/processes">) {
  const { workspaceId } = await props.params;

  const processes = await prisma.process.findMany({
    where: { workspaceId, archivedAt: null },
    include: {
      _count: { select: { steps: true } },
      raciMatrixStatus: true,
      parentProcess: true,
    },
    orderBy: { code: "asc" },
  });

  // Group as a simple two-level tree: top-level processes, each followed by its children.
  const topLevel = processes.filter((p) => !p.parentProcessId);
  const childrenOf = (id: string) => processes.filter((p) => p.parentProcessId === id);
  const ordered = topLevel.flatMap((p) => [p, ...childrenOf(p.id)]);
  const orphanChildren = processes.filter(
    (p) => p.parentProcessId && !processes.some((parent) => parent.id === p.parentProcessId)
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Processes</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every process has a unique code and can nest under a main process.
      </p>

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Process</th>
              <th className="px-4 py-2">Steps</th>
              <th className="px-4 py-2">RACI</th>
              <th className="px-4 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {[...ordered, ...orphanChildren].map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-700">
                  {p.parentProcessId ? <span className="mr-1 text-slate-300">↳</span> : null}
                  {p.code}
                </td>
                <td className="px-4 py-2 font-medium text-slate-900">
                  {p.name}
                  {p.parentProcessId && (
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      sub-process of {p.parentProcess?.code}
                    </span>
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
                  <Link
                    href={`/workspaces/${workspaceId}/processes/${p.id}/map`}
                    className="text-xs font-semibold text-slate-700 hover:text-slate-900"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
            {processes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No processes yet — create one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <CreateProcessForm
          workspaceId={workspaceId}
          processes={processes.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
        />
      </div>
    </main>
  );
}
