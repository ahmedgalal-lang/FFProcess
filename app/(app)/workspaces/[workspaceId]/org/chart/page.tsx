import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { OrgChartCanvas } from "./org-chart-canvas";

export default async function OrgChartPage(props: PageProps<"/workspaces/[workspaceId]/org/chart">) {
  const { workspaceId } = await props.params;

  const people = await prisma.person.findMany({
    where: { workspaceId, archivedAt: null },
    include: { personRoles: { include: { role: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">
            <Link href={`/workspaces/${workspaceId}/org`} className="font-semibold text-slate-700 hover:text-slate-900">
              ← Org Directory
            </Link>
          </div>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">Org Chart</h1>
        </div>
        <a
          href={`/api/export/org-chart/${workspaceId}`}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Export PDF
        </a>
      </div>
      <p className="mt-1 mb-5 text-sm text-slate-500">
        Built from each person&rsquo;s manager in the Org Directory — set or change &ldquo;Reports to&rdquo; there.
      </p>

      {people.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-400">
          No people yet —{" "}
          <Link href={`/workspaces/${workspaceId}/org`} className="font-semibold text-slate-600 hover:text-slate-900">
            add some in the Org Directory
          </Link>{" "}
          first.
        </p>
      ) : (
        <OrgChartCanvas
          people={people.map((p) => ({
            id: p.id,
            name: p.name,
            managerId: p.managerId,
            roleNames: p.personRoles.map((pr) => pr.role.name),
          }))}
        />
      )}
    </main>
  );
}
