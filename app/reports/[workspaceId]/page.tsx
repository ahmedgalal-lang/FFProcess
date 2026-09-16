import { notFound as nextNotFound, redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { loadReportData } from "@/lib/reports/load-report-data";
import { prisma } from "@/lib/db/client";
import { resolveArrangement } from "@/lib/domain/report-arrangement";
import { ExportPreview } from "./export-preview";

/**
 * The Export Report lives outside the (app) route group on purpose: it renders
 * with no workspace sidebar and no app header, so what's on screen is exactly
 * what prints. That means it can't inherit (app)'s auth, so it runs its own
 * requireWorkspaceAccess check here.
 */
export default async function ReportPage(props: PageProps<"/reports/[workspaceId]">) {
  const { workspaceId } = await props.params;
  const searchParams = await props.searchParams;
  const idsRaw = searchParams["ids"];
  const processIds = (Array.isArray(idsRaw) ? idsRaw : idsRaw ? [idsRaw] : []).filter(Boolean);

  const access = await requireWorkspaceAccess(workspaceId, "VIEWER");
  if (!access.ok) {
    if (access.error === "UNAUTHORIZED") redirect("/login");
    nextNotFound();
  }

  const data = await loadReportData(workspaceId, processIds);
  if (!data) nextNotFound();

  // Read alongside the report data rather than through it: the deck reads the
  // same two values independently, and neither should become a parameter of
  // the other.
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { reportArrangement: true },
  });

  return <ExportPreview {...data} arrangement={resolveArrangement(workspace?.reportArrangement)} />;
}
