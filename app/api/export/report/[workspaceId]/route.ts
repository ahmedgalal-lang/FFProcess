import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { loadReportData } from "@/lib/reports/load-report-data";
import { buildReportPptx } from "@/lib/export/pptx/report-pptx";
import { prisma } from "@/lib/db/client";
import { resolveArrangement } from "@/lib/domain/report-arrangement";

/**
 * The whole Export Report as a downloadable slide deck — the same pack of
 * processes the picker at /workspaces/[workspaceId]/export sends to the HTML
 * preview, via ?ids=..., turned into slides instead of printed pages.
 */
export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const url = new URL(request.url);
  const processIds = url.searchParams.getAll("ids").filter(Boolean);

  const access = await requireWorkspaceAccess(workspaceId, "VIEWER");
  if (!access.ok) {
    const status = access.error === "UNAUTHORIZED" ? 401 : access.error === "FORBIDDEN" ? 403 : 404;
    return NextResponse.json(access, { status });
  }

  const data = await loadReportData(workspaceId, processIds);
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Read alongside the report data rather than through it, exactly as the
  // report page does, so the two formats agree without either depending on
  // the other.
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { reportArrangement: true },
  });

  const buffer = await buildReportPptx(data, resolveArrangement(workspace?.reportArrangement));

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${data.companyName.replace(/[^a-z0-9]+/gi, "-")}-report.pptx"`,
    },
  });
}
