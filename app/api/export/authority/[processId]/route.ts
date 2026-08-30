import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { AuthorityPdfDocument } from "@/lib/export/pdf/authority-pdf";
import { buildAuthorityWorkbook } from "@/lib/export/xlsx";
import { buildAuthorityTableRows, validateAuthorityTable, DIRECTION_LABELS } from "@/lib/domain/authority-table";
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

  const [workspace, roles, people, activities, steps, assignments, session] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: process.workspaceId } }),
    prisma.role.findMany({ where: { workspaceId: process.workspaceId } }),
    prisma.person.findMany({ where: { workspaceId: process.workspaceId } }),
    prisma.activity.findMany({ where: { processId }, orderBy: { order: "asc" } }),
    prisma.processStep.findMany({
      where: { processId },
      select: { id: true, type: true, label: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.authorityAssignment.findMany({ where: { processId } }),
    auth(),
  ]);

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  const personNameById = new Map(people.map((p) => [p.id, p.name]));

  const rows = buildAuthorityTableRows(
    steps,
    activities.map((a) => ({ id: a.id, name: a.name, relatedStepId: a.relatedStepId, order: a.order })),
    assignments.map((a) => ({
      ...a,
      threshold: a.threshold === null ? null : Number(a.threshold),
      coApprovalAboveThreshold: a.coApprovalAboveThreshold === null ? null : Number(a.coApprovalAboveThreshold),
    }))
  ).filter((r) => !r.skipped);

  const issueCount = validateAuthorityTable(rows).length;
  const generatedFor = session?.user?.email ?? "Unknown";

  const rowsForExport = rows.map((r) => ({
    id: r.id,
    label: r.label,
    slaDays: r.slaDays,
    threshold: r.threshold,
    directionLabel: DIRECTION_LABELS[r.direction].label,
    approverLabel: r.approverRoleId
      ? (roleNameById.get(r.approverRoleId) ?? null)
      : r.approverPersonId
        ? (personNameById.get(r.approverPersonId) ?? null)
        : null,
    coApprovalAboveThreshold: r.coApprovalAboveThreshold,
    coApproverLabel: r.coApproverRoleId ? (roleNameById.get(r.coApproverRoleId) ?? null) : null,
    escalationLabel: r.escalationRoleId ? (roleNameById.get(r.escalationRoleId) ?? null) : null,
  }));

  const filenameBase = `${process.code}-authority-matrix`;

  if (format === "xlsx") {
    const buffer = await buildAuthorityWorkbook({
      workspaceName: workspace?.name ?? "",
      processCode: process.code,
      processName: process.name,
      rows: rowsForExport,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
      },
    });
  }

  const buffer = await renderToBuffer(
    AuthorityPdfDocument({
      workspaceName: workspace?.name ?? "",
      processCode: process.code,
      processName: process.name,
      rows: rowsForExport,
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
