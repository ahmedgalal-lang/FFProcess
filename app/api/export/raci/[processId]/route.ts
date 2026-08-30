import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { RaciPdfDocument } from "@/lib/export/pdf/raci-pdf";
import { buildRaciWorkbook } from "@/lib/export/xlsx";
import { validateRaciMatrix } from "@/lib/domain/raci-validation";
import { buildRaciTableRows } from "@/lib/domain/raci-table";
import { auth } from "@/lib/auth/config";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ processId: string }> }
) {
  const { processId } = await params;
  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";

  const process = await prisma.process.findUnique({ where: { id: processId } });
  if (!process) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const access = await requireWorkspaceAccess(process.workspaceId, "VIEWER");
  if (!access.ok) {
    const status = access.error === "UNAUTHORIZED" ? 401 : access.error === "FORBIDDEN" ? 403 : 404;
    return NextResponse.json(access, { status });
  }

  const [workspace, roles, activities, steps, matrixStatus, session] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: process.workspaceId } }),
    prisma.role.findMany({ where: { workspaceId: process.workspaceId, archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.activity.findMany({
      where: { processId },
      include: { raciAssignments: true },
      orderBy: { order: "asc" },
    }),
    prisma.processStep.findMany({
      where: { processId },
      select: { id: true, type: true, label: true, raciSkipped: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.raciMatrixStatus.findUnique({ where: { processId } }),
    auth(),
  ]);

  const rows = buildRaciTableRows(
    steps,
    activities.map((a) => ({
      id: a.id,
      name: a.name,
      relatedStepId: a.relatedStepId,
      order: a.order,
      assignments: a.raciAssignments.map((ra) => ({ roleId: ra.roleId, code: ra.code })),
    }))
  ).filter((r) => !r.skipped);

  const activitiesForExport = rows.map((r) => ({
    id: r.id,
    name: r.label,
    assignments: r.assignments,
  }));
  const status = matrixStatus?.status ?? "DRAFT";
  const issueCount = validateRaciMatrix(
    rows.map((r) => ({
      activityId: r.id,
      name: r.label,
      assignments: Object.entries(r.assignments).map(([roleId, code]) => ({ roleId, code })),
    }))
  ).length;
  const generatedFor = session?.user?.email ?? "Unknown";

  const filenameBase = `${process.code}-raci-matrix`;

  if (format === "xlsx") {
    const buffer = await buildRaciWorkbook({
      workspaceName: workspace?.name ?? "",
      processCode: process.code,
      processName: process.name,
      roles,
      activities: activitiesForExport,
      status,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
      },
    });
  }

  const buffer = await renderToBuffer(
    RaciPdfDocument({
      workspaceName: workspace?.name ?? "",
      processCode: process.code,
      processName: process.name,
      roles,
      activities: activitiesForExport,
      status,
      issueCount,
      generatedFor,
    })
  );
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
    },
  });
}
