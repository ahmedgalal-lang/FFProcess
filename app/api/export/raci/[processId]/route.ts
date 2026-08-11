import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { RaciPdfDocument } from "@/lib/export/pdf/raci-pdf";
import { buildRaciWorkbook } from "@/lib/export/xlsx";
import { validateRaciMatrix } from "@/lib/domain/raci-validation";
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

  const [workspace, roles, activities, matrixStatus, session] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: process.workspaceId } }),
    prisma.role.findMany({ where: { workspaceId: process.workspaceId, archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.activity.findMany({
      where: { processId },
      include: { raciAssignments: true },
      orderBy: { order: "asc" },
    }),
    prisma.raciMatrixStatus.findUnique({ where: { processId } }),
    auth(),
  ]);

  const activitiesForExport = activities.map((a) => ({
    id: a.id,
    name: a.name,
    assignments: Object.fromEntries(a.raciAssignments.map((ra) => [ra.roleId, ra.code])),
  }));
  const status = matrixStatus?.status ?? "DRAFT";
  const issueCount = validateRaciMatrix(
    activities.map((a) => ({
      activityId: a.id,
      name: a.name,
      assignments: a.raciAssignments.map((ra) => ({ roleId: ra.roleId, code: ra.code })),
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
