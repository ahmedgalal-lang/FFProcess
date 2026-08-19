import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { WorkspaceProfile } from "./workspace-profile";

export default async function WorkspaceDashboardPage(
  props: PageProps<"/workspaces/[workspaceId]">
) {
  const { workspaceId } = await props.params;

  const [processCount, decisionTypeCount, memberCount, workspace] = await Promise.all([
    prisma.process.count({ where: { workspaceId, archivedAt: null } }),
    prisma.decisionType.count({ where: { workspaceId } }),
    prisma.member.count({ where: { workspaceId, status: "ACTIVE" } }),
    prisma.workspace.findUnique({ where: { id: workspaceId } }),
  ]);

  const draftMatrices = await prisma.raciMatrixStatus.count({
    where: { status: "DRAFT", process: { workspaceId } },
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900">{workspace?.name}</h1>
      <p className="mt-1 text-sm text-slate-500">Client engagement workspace overview.</p>

      <WorkspaceProfile
        workspaceId={workspaceId}
        industry={workspace?.industry ?? null}
        description={workspace?.description ?? null}
      />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Processes" value={processCount} />
        <StatCard label="RACI drafts" value={draftMatrices} />
        <StatCard label="Decision types" value={decisionTypeCount} />
        <StatCard label="Members" value={memberCount} />
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link
          href={`/workspaces/${workspaceId}/processes`}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          View processes →
        </Link>
        <Link
          href={`/workspaces/${workspaceId}/org`}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Org directory
        </Link>
        <Link
          href={`/workspaces/${workspaceId}/authority`}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Authority matrix
        </Link>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-2xl font-bold tabular-nums text-slate-900">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
