import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { NewClientForm, DeleteWorkspaceButton } from "./workspaces-client";

export default async function WorkspacesPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const firmMember = await prisma.firmMember.findUnique({ where: { userId } });
  const isFirmOwner = firmMember?.role === "OWNER";

  const workspaces = isFirmOwner
    ? await prisma.workspace.findMany({
        where: { firmId: firmMember!.firmId },
        include: { members: { where: { userId, status: "ACTIVE" } }, _count: { select: { processes: true } } },
      })
    : await prisma.workspace.findMany({
        where: { members: { some: { userId, status: "ACTIVE" } } },
        include: { members: { where: { userId, status: "ACTIVE" } }, _count: { select: { processes: true } } },
      });

  if (!isFirmOwner && workspaces.length === 1) {
    redirect(`/workspaces/${workspaces[0].id}`);
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {isFirmOwner ? "All Clients" : "Your Workspaces"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isFirmOwner
              ? "As Firm Owner, every client workspace is reachable here — including ones you haven't been explicitly added to."
              : "Workspaces you've been added to."}
          </p>
        </div>
        {isFirmOwner && <NewClientForm />}
      </div>

      {workspaces.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          No workspaces yet.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {workspaces.map((w) => {
          const explicitMember = w.members[0];
          return (
            <Link
              key={w.id}
              href={`/workspaces/${w.id}`}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-xs font-bold text-slate-600">
                  {w.name
                    .split(" ")
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className={
                      explicitMember
                        ? "rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700"
                        : "rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                    }
                  >
                    {explicitMember ? `Member · ${explicitMember.accessLevel}` : "★ Owner access"}
                  </span>
                  {isFirmOwner && <DeleteWorkspaceButton workspaceId={w.id} workspaceName={w.name} />}
                </div>
              </div>
              <div className="text-sm font-semibold text-slate-900">{w.name}</div>
              <div className="mt-0.5 text-xs text-slate-500">{w._count.processes} process(es)</div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
