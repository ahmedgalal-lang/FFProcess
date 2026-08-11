import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { AuthorityPdfDocument } from "@/lib/export/pdf/authority-pdf";
import { buildAuthorityWorkbook } from "@/lib/export/xlsx";
import { validateApprovalRules } from "@/lib/domain/authority-resolution";
import { auth } from "@/lib/auth/config";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ decisionTypeId: string }> }
) {
  const { decisionTypeId } = await params;
  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";

  const decisionType = await prisma.decisionType.findUnique({ where: { id: decisionTypeId } });
  if (!decisionType) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const access = await requireWorkspaceAccess(decisionType.workspaceId, "VIEWER");
  if (!access.ok) {
    const status = access.error === "UNAUTHORIZED" ? 401 : access.error === "FORBIDDEN" ? 403 : 404;
    return NextResponse.json(access, { status });
  }

  const [workspace, rulesRaw, session] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: decisionType.workspaceId } }),
    prisma.approvalRule.findMany({
      where: { decisionTypeId },
      include: { approverRole: true, approverPerson: true, coApproverRole: true },
    }),
    auth(),
  ]);

  const rules = rulesRaw.map((r) => ({
    id: r.id,
    approverLabel: r.approverRole?.name ?? r.approverPerson?.name ?? "Unknown",
    maxThreshold: Number(r.maxThreshold),
    coApprovalAboveThreshold: r.coApprovalAboveThreshold ? Number(r.coApprovalAboveThreshold) : null,
    coApproverLabel: r.coApproverRole?.name ?? null,
  }));
  const conflictCount = validateApprovalRules(rules).length;
  const generatedFor = session?.user?.email ?? "Unknown";
  const filenameBase = `${decisionType.name.toLowerCase().replace(/\s+/g, "-")}-authority-matrix`;

  if (format === "xlsx") {
    const buffer = await buildAuthorityWorkbook({
      workspaceName: workspace?.name ?? "",
      decisionTypeName: decisionType.name,
      rules,
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
      decisionTypeName: decisionType.name,
      rules,
      conflictCount,
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
