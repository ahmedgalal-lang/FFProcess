import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { loadReportData } from "@/lib/reports/load-report-data";
import { buildReportPptx } from "@/lib/export/pptx/report-pptx";
import { prisma } from "@/lib/db/client";
import { resolveArrangement } from "@/lib/domain/report-arrangement";
import { isLocale } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { localizeReportData } from "@/lib/reports/localize-report-data";

/**
 * The whole Export Report as a downloadable slide deck — the same pack of
 * processes the picker at /workspaces/[workspaceId]/export sends to the HTML
 * preview, via ?ids=..., turned into slides instead of printed pages.
 */
export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const url = new URL(request.url);
  const processIds = url.searchParams.getAll("ids").filter(Boolean);
  const langRaw = url.searchParams.get("lang");
  const locale = isLocale(langRaw) ? langRaw : await getLocale();

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

  // The same saved translations the report uses (spec 032); only an editor's
  // download asks the AI for missing ones, as on the report page.
  const editor = await requireWorkspaceAccess(workspaceId, "EDITOR");
  const localized = await localizeReportData(data, locale, { allowAi: editor.ok });

  const buffer = await buildReportPptx(localized.data, resolveArrangement(workspace?.reportArrangement), locale);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${data.companyName.replace(/[^a-z0-9]+/gi, "-")}-report.pptx"`,
    },
  });
}
