import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { layoutOrgChart, type ChartPerson } from "@/lib/domain/org-chart";
import { OrgChartPdfDocument } from "@/lib/export/pdf/org-chart-pdf";
import { auth } from "@/lib/auth/config";

export async function GET(_request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;

  const access = await requireWorkspaceAccess(workspaceId, "VIEWER");
  if (!access.ok) {
    const status = access.error === "UNAUTHORIZED" ? 401 : access.error === "FORBIDDEN" ? 403 : 404;
    return NextResponse.json(access, { status });
  }

  const [workspace, people, session] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId } }),
    prisma.person.findMany({
      where: { workspaceId, archivedAt: null },
      include: { personRoles: { include: { role: true } } },
      orderBy: { name: "asc" },
    }),
    auth(),
  ]);

  const byId = new Map(people.map((p) => [p.id, p]));
  const positions = layoutOrgChart(people.map((p): ChartPerson => ({ id: p.id, name: p.name, managerId: p.managerId })));
  const depthById = new Map(positions.map((p) => [p.id, p.depth]));

  // Depth-first order so the PDF list reads top-down like the chart, not alphabetically.
  const childrenOf = new Map<string, string[]>();
  for (const p of people) {
    if (p.managerId && byId.has(p.managerId)) {
      const list = childrenOf.get(p.managerId) ?? [];
      list.push(p.id);
      childrenOf.set(p.managerId, list);
    }
  }
  const roots = people.filter((p) => !p.managerId || !byId.has(p.managerId));
  const orderedIds: string[] = [];
  const visited = new Set<string>();
  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    orderedIds.push(id);
    for (const childId of childrenOf.get(id) ?? []) visit(childId);
  }
  for (const r of roots) visit(r.id);
  for (const p of people) visit(p.id); // any left over (stale cycle) still included

  const buffer = await renderToBuffer(
    OrgChartPdfDocument({
      workspaceName: workspace?.name ?? "",
      people: orderedIds.map((id) => {
        const p = byId.get(id)!;
        return {
          id: p.id,
          name: p.name,
          depth: depthById.get(id) ?? 0,
          roleNames: p.personRoles.map((pr) => pr.role.name),
          managerName: p.managerId ? (byId.get(p.managerId)?.name ?? null) : null,
        };
      }),
      generatedFor: session?.user?.email ?? "Unknown",
    })
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="org-chart.pdf"`,
    },
  });
}
